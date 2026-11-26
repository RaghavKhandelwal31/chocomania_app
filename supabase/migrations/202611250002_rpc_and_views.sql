-- Transactional RPCs and audit helpers for Chocomania

-- 1. Atomic handoff + payment recording
CREATE OR REPLACE FUNCTION public.handoff_order_tx(
  p_order_id uuid,
  p_amount_paise integer,
  p_payment_mode text,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := public.current_app_role();
  v_username text;
  v_order public.orders%ROWTYPE;
  v_payment_id uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF v_uid IS NULL OR NOT public.is_account_active() OR v_role NOT IN ('admin', 'owner', 'viewer') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_payment_mode NOT IN ('cash', 'upi', 'card', 'bank_transfer') THEN
    RAISE EXCEPTION 'invalid_payment_mode' USING ERRCODE = '22023';
  END IF;

  IF p_amount_paise < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  SELECT username INTO v_username FROM public.user_profiles WHERE id = v_uid;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'viewer' AND v_order.status <> 'completed' THEN
    RAISE EXCEPTION 'invalid_status_for_viewer' USING ERRCODE = '42501';
  END IF;

  IF v_role IN ('admin', 'owner') AND v_order.status NOT IN ('completed', 'sent_to_worker') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  IF v_order.order_version <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001';
  END IF;

  IF p_amount_paise > 0 THEN
    INSERT INTO public.order_payments (
      order_id, amount_paise, payment_mode, payment_date, is_advance, recorded_by
    ) VALUES (
      p_order_id, p_amount_paise, p_payment_mode, v_today, false, v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
  SET
    status = 'handed_off',
    handed_off_at = now(),
    handed_off_by = v_uid,
    order_version = order_version + 1,
    updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.audit_logs (
    actor_id, actor_username, actor_role, action, target_type, target_id, metadata
  ) VALUES (
    v_uid,
    v_username,
    v_role,
    'order_handed_off',
    'order',
    p_order_id::text,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'amount_paise', p_amount_paise,
      'payment_mode', p_payment_mode,
      'payment_id', v_payment_id
    )
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_version', v_order.order_version,
    'status', v_order.status,
    'payment_id', v_payment_id
  );
END;
$$;

-- 2. Atomic Undo Handoff (Viewer within 15 mins for own handoff; Owner/Admin anytime)
CREATE OR REPLACE FUNCTION public.undo_handoff_tx(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := public.current_app_role();
  v_username text;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.is_account_active() OR v_role NOT IN ('admin', 'owner', 'viewer') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT username INTO v_username FROM public.user_profiles WHERE id = v_uid;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'handed_off' THEN
    RAISE EXCEPTION 'not_handed_off' USING ERRCODE = '22023';
  END IF;

  IF v_role = 'viewer' THEN
    IF v_order.handed_off_by <> v_uid OR v_order.handed_off_at < now() - interval '15 minutes' THEN
      RAISE EXCEPTION 'undo_window_expired' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Void any payment recorded at that handoff event
  UPDATE public.order_payments
  SET
    voided_at = now(),
    voided_by = v_uid,
    void_reason = CASE WHEN v_role = 'viewer' THEN 'viewer_handoff_undone' ELSE 'handoff_undone' END
  WHERE order_id = p_order_id
    AND voided_at IS NULL
    AND recorded_by = v_order.handed_off_by
    AND created_at >= v_order.handed_off_at - interval '5 seconds';

  UPDATE public.orders
  SET
    status = 'completed',
    handed_off_at = NULL,
    handed_off_by = NULL,
    order_version = order_version + 1,
    updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.audit_logs (
    actor_id, actor_username, actor_role, action, target_type, target_id, metadata
  ) VALUES (
    v_uid,
    v_username,
    v_role,
    'order_handoff_undone',
    'order',
    p_order_id::text,
    jsonb_build_object('order_number', v_order.order_number)
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'status', v_order.status,
    'order_version', v_order.order_version
  );
END;
$$;

-- 3. Restrict direct function execution to authenticated only
REVOKE ALL ON FUNCTION public.handoff_order_tx(uuid, integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handoff_order_tx(uuid, integer, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.undo_handoff_tx(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_handoff_tx(uuid) TO authenticated;
