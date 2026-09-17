-- ============================================================================
-- 14_settlement_rewrite.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
--
-- เพิ่ม status ที่ขาด: cancelled_by_lender, refunded_dispute, item_not_returned
-- แล้วเขียน settle_rental_order ใหม่ทั้งฟังก์ชัน (ของเดิมรองรับแค่ happy/damaged
-- 2 แบบ) ให้ครอบคลุมทุกเคสที่ตกลงกับ Roman จบแล้ว (H/I/J, false_advertisement,
-- item_not_returned) และเพิ่ม cancel_rental_order ใหม่ (ของเดิมไม่มีเลย) สำหรับ
-- ยกเลิกหลังจ่ายเงิน รองรับขั้นบันได E/F/G ฝั่งผู้เช่า และคืนเต็ม 100% เสมอฝั่ง
-- ผู้ให้เช่า (สมมาตรกันตามที่ตกลงไว้)
-- ============================================================================

ALTER TABLE rentalorder DROP CONSTRAINT rentalorder_status_check;
ALTER TABLE rentalorder ADD CONSTRAINT rentalorder_status_check
  CHECK (status = ANY (ARRAY[
    'requested','awaiting_payment','paid','item_sent','item_received','item_returned',
    'completed','cancelled','cancelled_by_renter','cancelled_by_lender','rejected_by_lender',
    'awaiting_additional_payment','renter_noshow','lender_noshow','rejected_at_meetup',
    'disputed_at_meetup','refunded_dispute','item_not_returned'
  ]));

DROP FUNCTION IF EXISTS public.settle_rental_order(uuid, uuid, numeric, numeric);

CREATE OR REPLACE FUNCTION public.settle_rental_order(
  p_order_id uuid,
  p_caller_id uuid,
  p_outcome text,
  p_damage_amount numeric DEFAULT 0
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order          public.rentalorder%ROWTYPE;
  v_lender_id      UUID;
  v_platform_fee   NUMERIC(12,2) := 0;
  v_lender_income  NUMERIC(12,2) := 0;
  v_renter_refund  NUMERIC(12,2) := 0;
  v_extra_charge   NUMERIC(12,2) := 0;
  v_new_status     TEXT;
BEGIN
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
      v_platform_fee  := ROUND(v_order.rental_fee * 0.10, 2);
      v_lender_income := v_order.rental_fee - v_platform_fee;
      v_new_status := 'completed';

    WHEN 'damaged' THEN
      v_platform_fee := ROUND(v_order.rental_fee * 0.10, 2);
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
      v_platform_fee  := ROUND(v_order.rental_fee * 0.10, 2);
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
$$;

CREATE OR REPLACE FUNCTION public.cancel_rental_order(
  p_order_id uuid,
  p_caller_id uuid,
  p_caller_role text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order         public.rentalorder%ROWTYPE;
  v_lender_id     UUID;
  v_paid_at       TIMESTAMPTZ;
  v_renter_refund NUMERIC(12,2);
  v_lender_income NUMERIC(12,2);
  v_new_status    TEXT;
BEGIN
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

  IF p_caller_role = 'renter' THEN
    IF p_caller_id <> v_order.user_id AND NOT is_admin() THEN
      RAISE EXCEPTION 'ไม่ใช่ผู้เช่าของ order นี้';
    END IF;

    SELECT MIN(created_at) INTO v_paid_at
    FROM public.payment WHERE order_id = p_order_id AND status = 'paid';
    IF v_paid_at IS NULL THEN v_paid_at := v_order.updated_at; END IF;

    IF NOW() - v_paid_at <= INTERVAL '24 hours' THEN
      v_renter_refund := v_order.deposit + v_order.rental_fee;
      v_lender_income := 0;
    ELSIF (v_order.start_date - CURRENT_DATE) >= 2 THEN
      v_renter_refund := v_order.deposit + ROUND(v_order.rental_fee * 0.70, 2);
      v_lender_income := ROUND(v_order.rental_fee * 0.30, 2);
    ELSE
      v_renter_refund := v_order.deposit + ROUND(v_order.rental_fee * 0.50, 2);
      v_lender_income := ROUND(v_order.rental_fee * 0.50, 2);
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
  SET status = v_new_status, fee = 0, net_income = v_lender_income, updated_at = NOW()
  WHERE order_id = p_order_id;

  INSERT INTO public.payment (order_id, user_id, amount, status)
  VALUES (p_order_id, v_order.user_id, v_renter_refund, 'refunded');

  RETURN v_new_status;
END;
$$;
