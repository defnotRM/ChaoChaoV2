-- 30: ปิดช่องโหว่ฟังก์ชัน SECURITY DEFINER ที่ผู้ไม่ล็อกอิน/คนอื่นเรียกผ่าน REST ได้ (F2/F3 ใน HANDOFF_DYNAMIC_WORKFLOW.md)
--
-- ปัญหา: ฟังก์ชัน 22 ตัวเปิด EXECUTE ให้ anon และ authenticated ผ่าน /rest/v1/rpc/...
--   * settle_rental_order / cancel_rental_order รับ p_caller_id จากผู้เรียกโดยไม่ผูกกับ auth.uid()
--     ผู้ไม่ล็อกอินที่รู้ order_id และ user_id ปิดยอดหรือยกเลิกออเดอร์ของคนอื่นได้
--   * ฟังก์ชันภายใน (trigger / cron / ตัวช่วย workflow) ไม่ควรถูกเรียกจากภายนอกเลย
--
-- สิ่งที่ทำ
--   1) ฟังก์ชันภายใน: ถอน EXECUTE จาก PUBLIC, anon, authenticated (trigger ไม่ต้องใช้สิทธิ์ตอนทำงาน, cron รันเป็น postgres)
--   2) ฟังก์ชันที่แอปเรียกผ่าน client ของผู้ใช้: ถอนเฉพาะ PUBLIC และ anon (ยังคงให้ authenticated)
--   3) ตัวช่วยของ RLS (is_admin ฯลฯ): คงสิทธิ์เดิม เพราะ policy เรียกใช้ในนามผู้ใช้ และคืนแค่ค่า boolean ของผู้เรียกเอง
--   4) settle_rental_order / cancel_rental_order: เพิ่ม guard ให้ p_caller_id ต้องตรง auth.uid() เมื่อมีผู้ล็อกอิน
--      (เนื้อฟังก์ชันที่เหลือเหมือน migration 29 ทุกบรรทัด)
--
-- ย้อนกลับ: down/30_secdef_execute_hardening.down.sql

-- 1) ฟังก์ชันภายใน
REVOKE EXECUTE ON FUNCTION
  public.notify_new_message(),
  public.notify_new_report(),
  public.notify_order_status_change(),
  public.notify_report_resolved(),
  public.process_expired_orders(),
  public.send_reminder_notifications(),
  public.trg_wf_guard(),
  public.trg_wf_sync_status(),
  public.workflow_actor_roles(p_workflow text, p_row jsonb, p_uid uuid),
  public.workflow_cfg_num(p_key text, p_default numeric),
  public.workflow_mode(),
  public.workflow_state_id(p_workflow text, p_state text)
FROM PUBLIC, anon, authenticated;

-- 2) ฟังก์ชันที่แอปเรียกผ่าน client ผู้ใช้
REVOKE EXECUTE ON FUNCTION
  public.cancel_rental_order(p_order_id uuid, p_caller_id uuid, p_caller_role text),
  public.confirm_additional_payment(p_payment_id uuid),
  public.create_item_listing(p_user_id uuid, p_category_id uuid, p_item_name text, p_description text, p_original_price numeric, p_rental_fee_per_day numeric, p_deposit numeric, p_images jsonb, p_locations jsonb, p_availability_start date, p_availability_end date, p_conditions text[]),
  public.settle_rental_order(p_order_id uuid, p_caller_id uuid, p_outcome text, p_damage_amount numeric),
  public.submit_rental_review(p_order_id uuid, p_user_id uuid, p_rating integer, p_comment text, p_images text[]),
  public.upload_rental_evidence(p_order_id uuid, p_user_id uuid, p_evidence_type text, p_image_urls text[], p_new_status text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.cancel_rental_order(p_order_id uuid, p_caller_id uuid, p_caller_role text),
  public.confirm_additional_payment(p_payment_id uuid),
  public.create_item_listing(p_user_id uuid, p_category_id uuid, p_item_name text, p_description text, p_original_price numeric, p_rental_fee_per_day numeric, p_deposit numeric, p_images jsonb, p_locations jsonb, p_availability_start date, p_availability_end date, p_conditions text[]),
  public.settle_rental_order(p_order_id uuid, p_caller_id uuid, p_outcome text, p_damage_amount numeric),
  public.submit_rental_review(p_order_id uuid, p_user_id uuid, p_rating integer, p_comment text, p_images text[]),
  public.upload_rental_evidence(p_order_id uuid, p_user_id uuid, p_evidence_type text, p_image_urls text[], p_new_status text)
TO authenticated, service_role;

-- service_role (admin client ของแอป) ต้องเรียกฟังก์ชันภายในที่ route ใช้ได้เสมอ
GRANT EXECUTE ON FUNCTION
  public.notify_new_message(),
  public.notify_new_report(),
  public.notify_order_status_change(),
  public.notify_report_resolved(),
  public.process_expired_orders(),
  public.send_reminder_notifications(),
  public.trg_wf_guard(),
  public.trg_wf_sync_status(),
  public.workflow_actor_roles(p_workflow text, p_row jsonb, p_uid uuid),
  public.workflow_cfg_num(p_key text, p_default numeric),
  public.workflow_mode(),
  public.workflow_state_id(p_workflow text, p_state text)
TO service_role;

-- 4) ผูกผู้เรียกกับ session
CREATE OR REPLACE FUNCTION public.cancel_rental_order(p_order_id uuid, p_caller_id uuid, p_caller_role text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order         public.rentalorder%ROWTYPE;
  v_lender_id     UUID;
  v_days_left     INT;
  v_renter_refund NUMERIC(12,2);
  v_platform_fee  NUMERIC(12,2) := 0;
  v_lender_income NUMERIC(12,2);
  v_new_status    TEXT;
BEGIN
  -- ผูกผู้เรียกกับ session: ผู้ที่ล็อกอินอยู่ต้องส่ง p_caller_id เป็นตัวเองเท่านั้น
  -- (service role / cron ไม่มี auth.uid() จึงถือเป็นระบบและข้ามข้อนี้)
  IF auth.uid() IS NOT NULL AND p_caller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์: p_caller_id ต้องตรงกับผู้ที่เข้าสู่ระบบ';
  END IF;
  SELECT ro.* INTO v_order FROM public.rentalorder ro WHERE ro.order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบ order: %', p_order_id;
  END IF;

  SELECT user_id INTO v_lender_id FROM public.item WHERE item_id = v_order.item_id;

  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'ยกเลิกผ่านช่องทางนี้ได้เฉพาะ order ที่ชำระเงินแล้วเท่านั้น (สถานะปัจจุบัน: %)', v_order.status;
  END IF;

  IF CURRENT_DATE >= v_order.start_date THEN
    RAISE EXCEPTION 'ถึงวันนัดรับสินค้าแล้ว ไม่สามารถยกเลิกได้อีก';
  END IF;

  v_days_left := v_order.start_date - CURRENT_DATE;

  IF p_caller_role = 'renter' THEN
    IF p_caller_id <> v_order.user_id AND NOT is_admin() THEN
      RAISE EXCEPTION 'ไม่ใช่ผู้เช่าของ order นี้';
    END IF;

    IF v_days_left <= public.workflow_cfg_num('cancel_threshold_days', 2) THEN
      v_renter_refund := v_order.deposit;
      v_platform_fee  := ROUND(v_order.rental_fee * public.workflow_cfg_num('platform_fee_percent', 10) / 100, 2);
      v_lender_income := v_order.rental_fee - v_platform_fee;
    ELSE
      v_renter_refund := v_order.deposit + v_order.rental_fee;
      v_platform_fee  := 0;
      v_lender_income := 0;
    END IF;
    v_new_status := 'cancelled_by_renter';

  ELSIF p_caller_role = 'lender' THEN
    IF p_caller_id <> v_lender_id AND NOT is_admin() THEN
      RAISE EXCEPTION 'ไม่ใช่ผู้ให้เช่าของ order นี้';
    END IF;
    v_renter_refund := v_order.deposit + v_order.rental_fee;
    v_lender_income := 0;
    v_new_status := 'cancelled_by_lender';

  ELSE
    RAISE EXCEPTION 'p_caller_role ต้องเป็น renter หรือ lender เท่านั้น';
  END IF;

  UPDATE public.rentalorder
  SET status = v_new_status, fee = v_platform_fee, net_income = v_lender_income, updated_at = NOW()
  WHERE order_id = p_order_id;

  INSERT INTO public.payment (order_id, user_id, amount, status)
  VALUES (p_order_id, v_order.user_id, v_renter_refund, 'refunded');

  RETURN v_new_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_rental_order(p_order_id uuid, p_caller_id uuid, p_outcome text, p_damage_amount numeric DEFAULT 0)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order          public.rentalorder%ROWTYPE;
  v_lender_id      UUID;
  v_platform_fee   NUMERIC(12,2) := 0;
  v_lender_income  NUMERIC(12,2) := 0;
  v_renter_refund  NUMERIC(12,2) := 0;
  v_extra_charge   NUMERIC(12,2) := 0;
  v_new_status     TEXT;
BEGIN
  -- ผูกผู้เรียกกับ session: ผู้ที่ล็อกอินอยู่ต้องส่ง p_caller_id เป็นตัวเองเท่านั้น
  -- (service role / cron ไม่มี auth.uid() จึงถือเป็นระบบและข้ามข้อนี้)
  IF auth.uid() IS NOT NULL AND p_caller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์: p_caller_id ต้องตรงกับผู้ที่เข้าสู่ระบบ';
  END IF;
  SELECT ro.* INTO v_order FROM public.rentalorder ro WHERE ro.order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบ order: %', p_order_id;
  END IF;

  SELECT user_id INTO v_lender_id FROM public.item WHERE item_id = v_order.item_id;

  IF p_caller_id <> v_order.user_id AND p_caller_id <> v_lender_id AND NOT is_admin() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ปิดยอด order นี้';
  END IF;

  CASE p_outcome
    WHEN 'happy', 'false_advertisement_rejected', 'item_not_returned_rejected' THEN
      v_renter_refund := v_order.deposit;
      v_platform_fee  := ROUND(v_order.rental_fee * public.workflow_cfg_num('platform_fee_percent', 10) / 100, 2);
      v_lender_income := v_order.rental_fee - v_platform_fee;
      v_new_status := 'completed';

    WHEN 'damaged' THEN
      v_platform_fee := ROUND(v_order.rental_fee * public.workflow_cfg_num('platform_fee_percent', 10) / 100, 2);
      IF p_damage_amount <= v_order.deposit THEN
        v_renter_refund := v_order.deposit - p_damage_amount;
        v_lender_income := (v_order.rental_fee - v_platform_fee) + p_damage_amount;
        v_new_status := 'completed';
      ELSE
        v_renter_refund := 0;
        v_extra_charge  := p_damage_amount - v_order.deposit;
        v_lender_income := (v_order.rental_fee - v_platform_fee) + v_order.deposit;
        v_new_status := 'awaiting_additional_payment';
      END IF;

    WHEN 'lender_noshow' THEN
      v_renter_refund := v_order.deposit + v_order.rental_fee;
      v_lender_income := 0;
      v_new_status := 'lender_noshow';

    WHEN 'renter_noshow' THEN
      v_renter_refund := v_order.deposit;
      v_lender_income := v_order.rental_fee;
      v_new_status := 'renter_noshow';

    WHEN 'renter_rejected_meetup' THEN
      v_renter_refund := v_order.deposit + ROUND(v_order.rental_fee * 0.20, 2);
      v_lender_income := ROUND(v_order.rental_fee * 0.80, 2);
      v_new_status := 'rejected_at_meetup';

    WHEN 'false_advertisement_approved' THEN
      v_renter_refund := v_order.deposit + v_order.rental_fee;
      v_lender_income := 0;
      v_new_status := 'refunded_dispute';

    WHEN 'item_not_returned' THEN
      v_renter_refund := 0;
      v_platform_fee  := ROUND(v_order.rental_fee * public.workflow_cfg_num('platform_fee_percent', 10) / 100, 2);
      v_lender_income := v_order.deposit + (v_order.rental_fee - v_platform_fee);
      v_new_status := 'item_not_returned';

    ELSE
      RAISE EXCEPTION 'ไม่รู้จัก outcome: %', p_outcome;
  END CASE;

  UPDATE public.rentalorder
  SET status = v_new_status, fee = v_platform_fee, net_income = v_lender_income, updated_at = NOW()
  WHERE order_id = p_order_id;

  IF v_renter_refund > 0 THEN
    INSERT INTO public.payment (order_id, user_id, amount, status)
    VALUES (p_order_id, v_order.user_id, v_renter_refund, 'refunded');
  END IF;

  IF v_extra_charge > 0 THEN
    INSERT INTO public.payment (order_id, user_id, amount, status)
    VALUES (p_order_id, v_order.user_id, v_extra_charge, 'pending');
  END IF;

  RETURN v_new_status;
END;
$function$;
