-- ============================================================================
-- 26: ผู้ให้เช่าปฏิเสธสลิปได้ (payment.status = 'rejected') ให้ผู้เช่าอัปโหลดใหม่
-- ============================================================================
-- POST /api/payments/reject เปลี่ยนสลิป pending -> rejected และต่อเวลาชำระเงิน
-- ให้ผู้เช่าอีก 8 ชม. (rentalorder.updated_at = now()) โดยออเดอร์ยังเป็น awaiting_payment
--
-- บั๊กที่ต้องแก้คู่กัน: process_expired_orders (ไฟล์ 20) ยกเลิกออเดอร์ที่ไม่จ่ายเงิน
-- เฉพาะเมื่อ "ไม่มีแถว payment เลย" — ถ้ามีสลิปที่ถูกปฏิเสธค้างอยู่ ออเดอร์จะไม่มีวัน
-- หมดเวลา แก้ให้นับเฉพาะสลิปที่ยัง pending หรือ paid
-- ฟังก์ชันด้านล่างคัดลอกจากไฟล์ 20 ทั้งหมด เปลี่ยนแค่เงื่อนไข NOT EXISTS ของ awaiting_payment

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
    AND NOT EXISTS (
      SELECT 1 FROM payment p
      WHERE p.order_id = ro.order_id AND p.status IN ('pending', 'paid')
    );

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
