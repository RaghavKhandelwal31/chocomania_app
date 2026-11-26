-- Chocomania Phase 2 Foundation Schema & Strict RLS Policies
-- Enforces deny-by-default Row Level Security and physical table isolation
-- so Worker role can NEVER access prices, payments, phones, delivery addresses, or internal notes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. User profiles (mirrors auth.users; admin manages via service_role)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'owner', 'worker', 'viewer')),
  preferred_lang text NOT NULL DEFAULT 'en' CHECK (preferred_lang IN ('en', 'hi')),
  must_change_password boolean NOT NULL DEFAULT true,
  is_disabled boolean NOT NULL DEFAULT false,
  pin_login_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Helper functions reading authoritative role from JWT app_metadata or user_profiles
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    (SELECT role FROM public.user_profiles WHERE id = auth.uid() AND is_disabled = false)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_account_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_disabled = false
  );
$$;

-- 3. Rotating device sessions (strictly server service_role only)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  token_hash text NOT NULL,
  prev_token_hash text,
  prev_rotated_at timestamptz,
  sb_access_token_enc text,
  sb_refresh_token_enc text,
  device_label text NOT NULL DEFAULT 'Mobile Browser',
  ip_prefix text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON public.user_sessions(user_id) WHERE revoked_at IS NULL;

-- 4. Login brute-force rate limiting (strictly server service_role only)
CREATE TABLE IF NOT EXISTS public.login_attempts (
  attempt_key text PRIMARY KEY,
  fail_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. App settings (e.g., owner_phone for Worker's Call Owner button)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (key, value)
VALUES ('owner_phone', '+919876543210')
ON CONFLICT (key) DO NOTHING;

-- 6. Customers (minimal safe identity)
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- 7. Customer contacts (PII isolated from Worker)
CREATE TABLE IF NOT EXISTS public.customer_contacts (
  customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+91[6-9]\d{9}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_contacts_phone_active
  ON public.customer_contacts(phone_e164);

-- 8. Customer private notes (Owner/Admin only)
CREATE TABLE IF NOT EXISTS public.customer_private_notes (
  customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Orders (Worker-safe fields ONLY)
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 101;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number integer NOT NULL UNIQUE DEFAULT nextval('public.order_number_seq'),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  customer_first_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent_to_worker', 'completed', 'handed_off', 'cancelled')),
  item_name text NOT NULL,
  size_weight text NOT NULL DEFAULT '',
  flavor text NOT NULL DEFAULT '',
  is_eggless boolean NOT NULL DEFAULT true,
  cake_message text NOT NULL DEFAULT '',
  customization_notes text NOT NULL DEFAULT '',
  scheduled_date date NOT NULL,
  scheduled_time time,
  scheduled_slot text NOT NULL DEFAULT 'afternoon' CHECK (scheduled_slot IN ('morning', 'afternoon', 'evening', 'exact')),
  fulfillment_type text NOT NULL DEFAULT 'pickup' CHECK (fulfillment_type IN ('pickup', 'delivery')),
  order_source text NOT NULL DEFAULT 'whatsapp' CHECK (order_source IN ('whatsapp', 'call', 'walk_in')),
  order_version integer NOT NULL DEFAULT 1,
  worker_seen_version integer NOT NULL DEFAULT 0,
  sent_to_worker_at timestamptz,
  completed_at timestamptz,
  handed_off_at timestamptz,
  handed_off_by uuid REFERENCES public.user_profiles(id),
  created_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date ON public.orders(scheduled_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status) WHERE deleted_at IS NULL;

-- 10. Order delivery address (isolated from Worker)
CREATE TABLE IF NOT EXISTS public.order_delivery_details (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_address text NOT NULL DEFAULT ''
);

-- 11. Order internal notes (Owner/Admin ONLY)
CREATE TABLE IF NOT EXISTS public.order_internal_notes (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  internal_notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Order pricing (isolated from Worker; Viewer reads balance via RPC/view for completed orders only)
CREATE TABLE IF NOT EXISTS public.order_pricing (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  total_price_paise integer NOT NULL CHECK (total_price_paise >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 13. Order payments ledger (Owner/Admin full; Viewer insert-only on completed orders)
CREATE TABLE IF NOT EXISTS public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount_paise integer NOT NULL CHECK (amount_paise >= 0),
  payment_mode text NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card', 'bank_transfer')),
  payment_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  is_advance boolean NOT NULL DEFAULT false,
  recorded_by uuid REFERENCES public.user_profiles(id),
  voided_at timestamptz,
  voided_by uuid REFERENCES public.user_profiles(id),
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON public.order_payments(order_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_order_payments_date ON public.order_payments(payment_date) WHERE voided_at IS NULL;

-- 14. Order photos metadata (files stored in private Supabase Storage bucket 'order-photos')
CREATE TABLE IF NOT EXISTS public.order_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  uploaded_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 15. Audit logs (Admin read-only, service_role append-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.user_profiles(id),
  actor_username text,
  actor_role text,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ON EVERY TABLE (Deny by default)
-- ============================================================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_private_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_delivery_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke direct privileges from anon and restrict authenticated
REVOKE ALL ON public.user_sessions FROM anon, authenticated;
REVOKE ALL ON public.login_attempts FROM anon, authenticated;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.order_pricing FROM anon;
REVOKE ALL ON public.order_payments FROM anon;
REVOKE ALL ON public.customer_contacts FROM anon;
REVOKE ALL ON public.customer_private_notes FROM anon;
REVOKE ALL ON public.order_internal_notes FROM anon;
REVOKE ALL ON public.order_delivery_details FROM anon;

-- user_profiles: user sees own profile; admin sees all
CREATE POLICY user_profiles_select_self_or_admin ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    public.is_account_active() AND (
      id = auth.uid() OR public.current_app_role() = 'admin'
    )
  );

CREATE POLICY user_profiles_update_self_lang ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (public.is_account_active() AND id = auth.uid())
  WITH CHECK (public.is_account_active() AND id = auth.uid());

-- app_settings: active authenticated users can read owner_phone; admin/owner can update
CREATE POLICY app_settings_select_auth ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.is_account_active() AND key = 'owner_phone');

CREATE POLICY app_settings_admin_owner_write ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'))
  WITH CHECK (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'));

-- customers: Owner/Admin full; Viewer ONLY for customers with a completed order; Worker NEVER
CREATE POLICY customers_owner_admin_all ON public.customers
  FOR ALL TO authenticated
  USING (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'))
  WITH CHECK (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'));

CREATE POLICY customers_viewer_completed ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.is_account_active()
    AND public.current_app_role() = 'viewer'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.customer_id = customers.id
        AND o.status = 'completed'
        AND o.deleted_at IS NULL
    )
  );

-- customer_contacts: Owner/Admin full; Viewer ONLY for completed orders; Worker NEVER
CREATE POLICY customer_contacts_owner_admin_all ON public.customer_contacts
  FOR ALL TO authenticated
  USING (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'))
  WITH CHECK (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'));

CREATE POLICY customer_contacts_viewer_completed ON public.customer_contacts
  FOR SELECT TO authenticated
  USING (
    public.is_account_active()
    AND public.current_app_role() = 'viewer'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.customer_id = customer_contacts.customer_id
        AND o.status = 'completed'
        AND o.deleted_at IS NULL
    )
  );

-- customer_private_notes: Owner/Admin ONLY
CREATE POLICY customer_private_notes_owner_admin ON public.customer_private_notes
  FOR ALL TO authenticated
  USING (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'))
  WITH CHECK (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'));

-- orders:
-- Owner/Admin: all non-deleted orders
CREATE POLICY orders_owner_admin_all ON public.orders
  FOR ALL TO authenticated
  USING (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'))
  WITH CHECK (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'));

-- Worker: ONLY orders that were sent to worker (sent_to_worker, completed, or cancelled after being sent)
CREATE POLICY orders_worker_select ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.is_account_active()
    AND public.current_app_role() = 'worker'
    AND deleted_at IS NULL
    AND sent_to_worker_at IS NOT NULL
    AND status IN ('sent_to_worker', 'completed', 'cancelled')
  );

CREATE POLICY orders_worker_update ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.is_account_active()
    AND public.current_app_role() = 'worker'
    AND deleted_at IS NULL
    AND sent_to_worker_at IS NOT NULL
    AND status IN ('sent_to_worker', 'completed', 'cancelled')
  )
  WITH CHECK (
    public.is_account_active()
    AND public.current_app_role() = 'worker'
    AND status IN ('sent_to_worker', 'completed', 'cancelled')
  );

-- Viewer: ONLY completed orders (plus own handed_off within 15 mins for Undo check)
CREATE POLICY orders_viewer_select ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.is_account_active()
    AND public.current_app_role() = 'viewer'
    AND deleted_at IS NULL
    AND (
      status = 'completed'
      OR (status = 'handed_off' AND handed_off_by = auth.uid() AND handed_off_at >= now() - interval '15 minutes')
    )
  );

-- order_delivery_details: Owner/Admin full; Viewer ONLY for completed orders; Worker NEVER
CREATE POLICY order_delivery_owner_admin ON public.order_delivery_details
  FOR ALL TO authenticated
  USING (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'))
  WITH CHECK (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'));

CREATE POLICY order_delivery_viewer_completed ON public.order_delivery_details
  FOR SELECT TO authenticated
  USING (
    public.is_account_active()
    AND public.current_app_role() = 'viewer'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_delivery_details.order_id
        AND o.status = 'completed'
        AND o.deleted_at IS NULL
    )
  );

-- order_internal_notes: Owner/Admin ONLY
CREATE POLICY order_internal_notes_owner_admin ON public.order_internal_notes
  FOR ALL TO authenticated
  USING (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'))
  WITH CHECK (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'));

-- order_pricing: Owner/Admin full; Viewer SELECT ONLY for completed orders; Worker NEVER
CREATE POLICY order_pricing_owner_admin ON public.order_pricing
  FOR ALL TO authenticated
  USING (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'))
  WITH CHECK (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'));

CREATE POLICY order_pricing_viewer_completed ON public.order_pricing
  FOR SELECT TO authenticated
  USING (
    public.is_account_active()
    AND public.current_app_role() = 'viewer'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_pricing.order_id
        AND o.status = 'completed'
        AND o.deleted_at IS NULL
    )
  );

-- order_payments: Owner/Admin full; Viewer SELECT only on completed orders (to compute balance due) & INSERT on completed;
-- Only Owner/Admin can UPDATE/void payments!
CREATE POLICY order_payments_owner_admin ON public.order_payments
  FOR ALL TO authenticated
  USING (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'))
  WITH CHECK (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'));

CREATE POLICY order_payments_viewer_completed_select ON public.order_payments
  FOR SELECT TO authenticated
  USING (
    public.is_account_active()
    AND public.current_app_role() = 'viewer'
    AND voided_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_payments.order_id
        AND o.status = 'completed'
        AND o.deleted_at IS NULL
    )
  );

CREATE POLICY order_payments_viewer_completed_insert ON public.order_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_account_active()
    AND public.current_app_role() = 'viewer'
    AND is_advance = false
    AND recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_payments.order_id
        AND o.status = 'completed'
        AND o.deleted_at IS NULL
    )
  );

-- order_photos: Owner/Admin full; Worker & Viewer can SELECT for orders their role can see
CREATE POLICY order_photos_owner_admin ON public.order_photos
  FOR ALL TO authenticated
  USING (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'))
  WITH CHECK (public.is_account_active() AND public.current_app_role() IN ('admin', 'owner'));

CREATE POLICY order_photos_worker_select ON public.order_photos
  FOR SELECT TO authenticated
  USING (
    public.is_account_active()
    AND public.current_app_role() = 'worker'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_photos.order_id
        AND o.deleted_at IS NULL
        AND o.sent_to_worker_at IS NOT NULL
        AND o.status IN ('sent_to_worker', 'completed', 'cancelled')
    )
  );

CREATE POLICY order_photos_viewer_select ON public.order_photos
  FOR SELECT TO authenticated
  USING (
    public.is_account_active()
    AND public.current_app_role() = 'viewer'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_photos.order_id
        AND o.deleted_at IS NULL
        AND o.status = 'completed'
    )
  );

-- audit_logs: Admin SELECT only
CREATE POLICY audit_logs_admin_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_account_active() AND public.current_app_role() = 'admin');

-- Private storage buckets (created idempotently)
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-photos', 'order-photos', false),
       ('db-backups', 'db-backups', false)
ON CONFLICT (id) DO NOTHING;
