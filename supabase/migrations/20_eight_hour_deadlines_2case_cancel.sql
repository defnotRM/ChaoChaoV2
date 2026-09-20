-- ============================================================================
-- 20_eight_hour_deadlines_2case_cancel.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
--
-- requirement ใหม่จาก PO:
-- 1. เวลาอนุมัติ/จ่ายเงิน 12→8 ชม.
-- 2. เพิ่มกฎ: ผู้ให้เช่าไม่ตรวจสลิปภายใน 8 ชม. หลังผู้เช่าอัปโหลด → auto-approve
-- 3. FR-33 v2: ยุบยกเลิกเหลือ 2 เคส (≤2วัน/>2วัน) ตัด E/F/G เดิมทั้งหมด
--    เคสใหม่ ≤2วัน ยึดค่าเช่าทั้งหมดแล้วหักค่าธรรมเนียม 10% (ต่างจากเดิมที่ไม่
--    หักค่าธรรมเนียมตอนยกเลิกเลย)
--
-- เจอบั๊กแฝงระหว่างแก้: กฎเดิม "ไม่จ่ายเงินภายใน 8ชม. → cancel" เช็คแค่เวลา
-- อนุมัติ ไม่เช็คว่ามีสลิปส่งมาหรือยัง — ถ้าผู้เช่าส่งทันแต่ผู้ให้เช่าตรวจช้า
-- จะโดน cancel ผิดพลาด แก้ให้เช็คว่ายังไม่มีสลิปเลยด้วย
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_expired_orders()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r              RECORD;
  v_lender_came  BOOLEAN;
  v_renter_came  BOOLEAN;
BEGIN
  UPDATE rentalorder
  SET status = 'rejected_by_lender', updated_at = NOW()
  WHERE status = 'requested' AND created_at < NOW() - INTERVAL '8 hours';

  UPDATE rentalorder ro
  SET status = 'cancelled', updated_at = NOW()
  WHERE ro.status = 'awaiting_payment'
    AND ro.updated_at < NOW() - INTERVAL '8 hours'
    AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.order_id = ro.order_id);

  WITH auto_approved AS (
    UPDATE payment
    SET status = 'paid'
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '8 hours'
      AND order_id IN (SELECT order_id FROM rentalorder WHERE status = 'awaiting_payment')
    RETURNING order_id
  )
  UPDATE rentalorder
  SET status = 'paid', updated_at = NOW()
  WHERE order_id IN (SELECT order_id FROM auto_approved);

  FOR r IN
    SELECT ro.order_id, it.user_id AS lender_id
    FROM rentalorder ro
    JOIN item it ON it.item_id = ro.item_id
    WHERE ro.status = 'paid'
      AND (ro.start_date + COALESCE(ro.meetup_time, '00:00'::time) + INTERVAL '1 hour') < NOW()
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM rentalevidenceimage WHERE order_id = r.order_id AND evidence_type = 'lender_before'
    ) INTO v_lender_came;

    SELECT EXISTS (
      SELECT 1 FROM rentalevidenceimage WHERE order_id = r.order_id AND evidence_type = 'renter_before'
    ) INTO v_renter_came;

    IF NOT v_lender_came THEN
      PERFORM settle_rental_order(r.order_id, r.lender_id, 'lender_noshow');
    ELSIF NOT v_renter_came THEN
      PERFORM settle_rental_order(r.order_id, r.lender_id, 'renter_noshow');
    END IF;
  END LOOP;

  FOR r IN
    SELECT ro.order_id, it.user_id AS lender_id
    FROM rentalorder ro
    JOIN item it ON it.item_id = ro.item_id
    WHERE ro.status IN ('item_sent', 'item_received')
      AND (ro.end_date + COALESCE(ro.return_time, '00:00'::time) + INTERVAL '1 hour') < NOW()
      AND EXISTS (
        SELECT 1 FROM rentalevidenceimage WHERE order_id = ro.order_id AND evidence_type = 'renter_after'
      )
      AND NOT EXISTS (
        SELECT 1 FROM rentalevidenceimage WHERE order_id = ro.order_id AND evidence_type = 'lender_after'
      )
  LOOP
    PERFORM settle_rental_order(r.order_id, r.lender_id, 'happy');
  END LOOP;

  UPDATE useraccount ua
  SET status = 'Suspended', updated_at = NOW()
  FROM payment p
  JOIN rentalorder ro ON ro.order_id = p.order_id
  WHERE p.user_id = ua.user_id
    AND p.status = 'pending'
    AND p.created_at < NOW() - INTERVAL '48 hours'
    AND ro.status = 'awaiting_additional_payment';
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
  v_days_left     INT;
  v_renter_refund NUMERIC(12,2);
  v_platform_fee  NUMERIC(12,2) := 0;
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

  v_days_left := v_order.start_date - CURRENT_DATE;

  IF p_caller_role = 'renter' THEN
    IF p_caller_id <> v_order.user_id AND NOT is_admin() THEN
      RAISE EXCEPTION 'ไม่ใช่ผู้เช่าของ order นี้';
    END IF;

    IF v_days_left <= 2 THEN
      v_renter_refund := v_order.deposit;
      v_platform_fee  := ROUND(v_order.rental_fee * 0.10, 2);
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
$$;
