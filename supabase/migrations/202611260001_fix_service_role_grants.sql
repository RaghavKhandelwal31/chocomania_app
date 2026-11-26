-- Fix: Explicitly grant service_role full access to all application tables.
-- By default Supabase service_role bypasses RLS, but it still needs table-level
-- privileges. These may have been lost due to table ownership or default-privilege
-- settings when the migration was applied via the CLI.

GRANT ALL ON public.user_profiles TO service_role;
GRANT ALL ON public.user_sessions TO service_role;
GRANT ALL ON public.login_attempts TO service_role;
GRANT ALL ON public.app_settings TO service_role;
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.customer_contacts TO service_role;
GRANT ALL ON public.customer_private_notes TO service_role;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_delivery_details TO service_role;
GRANT ALL ON public.order_internal_notes TO service_role;
GRANT ALL ON public.order_pricing TO service_role;
GRANT ALL ON public.order_payments TO service_role;
GRANT ALL ON public.order_photos TO service_role;
GRANT ALL ON public.audit_logs TO service_role;

-- Also grant sequence usage for order numbers
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO service_role;

-- Grant authenticated role SELECT on user_profiles (needed for auth functions)
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT UPDATE (preferred_lang, updated_at) ON public.user_profiles TO authenticated;

-- Grant authenticated basic access to tables (RLS policies control the actual access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_private_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_delivery_details TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_internal_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_pricing TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_photos TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO authenticated;
