-- ย้อนกลับ 33: คืน settle_rental_order เป็นเวอร์ชันของ migration 30
-- คำเตือน: เปิดช่องให้ผู้เช่า/ผู้ให้เช่าเลือกผลลัพธ์ปิดยอดเองกลับมา ใช้เฉพาะเมื่อ 33 ทำให้ flow จริงพัง

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
