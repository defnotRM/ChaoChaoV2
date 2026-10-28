-- ย้อนกลับ 40: คืน process_expired_orders เป็นของ migration 35 และ send_reminder_notifications เป็นของ migration 32

CREATE OR REPLACE FUNCTION public.process_expired_orders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r              RECORD;
  v_lender_came  BOOLEAN;
  v_renter_came  BOOLEAN;
BEGIN
  UPDATE rentalorder
  SET status = 'rejected_by_lender', updated_at = NOW()
  WHERE status = 'requested' AND created_at < NOW() - public.workflow_cfg_num('approval_timeout_hours', 8) * INTERVAL '1 hour';

  UPDATE rentalorder ro
  SET status = 'cancelled', updated_at = NOW()
  WHERE ro.status = 'awaiting_payment'
    AND ro.updated_at < NOW() - public.workflow_cfg_num('payment_timeout_hours', 8) * INTERVAL '1 hour'
    AND NOT EXISTS (
      SELECT 1 FROM payment p
      WHERE p.order_id = ro.order_id AND p.status IN ('pending', 'paid')
    );

  -- เกินเวลาตรวจสลิป (slip_review_timeout_hours): ปฏิเสธสลิปอัตโนมัติ ไม่เปลี่ยนเป็นชำระแล้ว
  -- (เดิมอนุมัติสลิปให้เอง ทำให้สลิปที่ไม่มีใครตรวจผ่านเป็นชำระแล้ว) ผู้เช่าต้องอัปโหลดใหม่ภายในเวลาชำระเงิน
  -- ต่อเวลาชำระเงินด้วยการอัปเดต updated_at เหมือนตอนผู้ให้เช่าปฏิเสธเอง และแจ้งทั้งสองฝ่าย
  WITH auto_rejected AS (
    UPDATE payment
    SET status = 'rejected'
    WHERE status = 'pending'
      AND created_at < NOW() - public.workflow_cfg_num('slip_review_timeout_hours', 8) * INTERVAL '1 hour'
      AND order_id IN (SELECT order_id FROM rentalorder WHERE status = 'awaiting_payment')
    RETURNING order_id
  ), touched AS (
    UPDATE rentalorder ro
    SET updated_at = NOW()
    WHERE ro.status = 'awaiting_payment'
      AND ro.order_id IN (SELECT order_id FROM auto_rejected)
    RETURNING ro.order_id, ro.user_id, ro.item_id
  )
  INSERT INTO notification (user_id, type, title, message, related_order_id)
  SELECT t.user_id, 'payment_rejected', 'สลิปการชำระเงินถูกปฏิเสธอัตโนมัติ',
         'ผู้ให้เช่าไม่ได้ตรวจสลิปภายในเวลาที่กำหนด ระบบจึงปฏิเสธสลิปเพื่อความปลอดภัย กรุณาอัปโหลดสลิปใหม่ภายในเวลาชำระเงิน',
         t.order_id
  FROM touched t
  UNION ALL
  SELECT it.user_id, 'slip_review_expired', 'เกินเวลาตรวจสลิป ระบบปฏิเสธสลิปให้แล้ว',
         'คุณไม่ได้ตรวจสลิปการชำระเงินภายในเวลาที่กำหนด ระบบจึงปฏิเสธสลิปอัตโนมัติ ผู้เช่าจะอัปโหลดสลิปใหม่',
         t.order_id
  FROM touched t
  JOIN item it ON it.item_id = t.item_id;

  FOR r IN
    SELECT ro.order_id, it.user_id AS lender_id
    FROM rentalorder ro
    JOIN item it ON it.item_id = ro.item_id
    WHERE ro.status = 'paid'
      AND (ro.start_date + COALESCE(ro.meetup_time, '00:00'::time) + public.workflow_cfg_num('noshow_grace_hours', 1) * INTERVAL '1 hour') < NOW()
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
      AND (ro.end_date + COALESCE(ro.return_time, '00:00'::time) + public.workflow_cfg_num('noshow_grace_hours', 1) * INTERVAL '1 hour') < NOW()
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
    AND p.created_at < NOW() - public.workflow_cfg_num('extra_payment_deadline_hours', 48) * INTERVAL '1 hour'
    AND ro.status = 'awaiting_additional_payment';
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_reminder_notifications() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT ro.order_id, ro.user_id AS renter_id, it.user_id AS lender_id, ro.meetup_location
    FROM rentalorder ro JOIN item it ON it.item_id = ro.item_id
    WHERE ro.status = 'paid' AND ro.start_date = CURRENT_DATE + 1
  LOOP
    INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
      (r.renter_id, 'reminder', 'แจ้งเตือนวันนัดรับพรุ่งนี้', 'พรุ่งนี้ถึงวันนัดรับสินค้าที่ ' || COALESCE(r.meetup_location, '-'), r.order_id),
      (r.lender_id, 'reminder', 'แจ้งเตือนวันนัดรับพรุ่งนี้', 'พรุ่งนี้ถึงวันนัดรับสินค้าที่ ' || COALESCE(r.meetup_location, '-'), r.order_id);
  END LOOP;

  FOR r IN
    SELECT ro.order_id, ro.user_id AS renter_id, it.user_id AS lender_id, ro.return_location
    FROM rentalorder ro JOIN item it ON it.item_id = ro.item_id
    WHERE ro.status IN ('item_sent','item_received') AND ro.end_date = CURRENT_DATE + 1
  LOOP
    INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
      (r.renter_id, 'reminder', 'แจ้งเตือนวันนัดคืนพรุ่งนี้', 'พรุ่งนี้ถึงวันนัดคืนสินค้าที่ ' || COALESCE(r.return_location, '-'), r.order_id),
      (r.lender_id, 'reminder', 'แจ้งเตือนวันนัดคืนพรุ่งนี้', 'พรุ่งนี้ถึงวันนัดคืนสินค้าที่ ' || COALESCE(r.return_location, '-'), r.order_id);
  END LOOP;

  -- ออเดอร์ที่เลยกำหนดคืนแล้ว ผู้ให้เช่าอัปโหลดรูปคืนของแล้ว แต่ผู้เช่ายังไม่ยืนยัน
  -- ไม่มีเส้นทางจบอัตโนมัติ (สินค้าจะถูกกันคิวไว้) จึงแจ้งเตือนผู้เช่าและแอดมินครั้งเดียวต่อออเดอร์
  FOR r IN
    SELECT ro.order_id, ro.user_id AS renter_id
    FROM rentalorder ro
    WHERE ro.status IN ('item_sent','item_received')
      AND (ro.end_date + COALESCE(ro.return_time, '00:00'::time)
           + public.workflow_cfg_num('noshow_grace_hours', 1) * INTERVAL '1 hour') < NOW()
      AND EXISTS (SELECT 1 FROM rentalevidenceimage e WHERE e.order_id = ro.order_id AND e.evidence_type = 'lender_after')
      AND NOT EXISTS (SELECT 1 FROM rentalevidenceimage e WHERE e.order_id = ro.order_id AND e.evidence_type = 'renter_after')
  LOOP
    INSERT INTO notification (user_id, type, title, message, related_order_id)
    SELECT t.user_id, 'return_overdue', t.title, t.message, r.order_id
    FROM (
      SELECT r.renter_id AS user_id,
             'กรุณายืนยันการคืนสินค้า' AS title,
             'ผู้ให้เช่าแจ้งว่าได้รับสินค้าคืนแล้ว แต่คุณยังไม่ได้ยืนยันการคืน กรุณาอัปโหลดรูปหลักฐานการคืนสินค้าในออเดอร์นี้' AS message
      UNION ALL
      SELECT ura.user_id,
             'ออเดอร์เลยกำหนดคืนแต่ผู้เช่ายังไม่ยืนยัน',
             'ผู้ให้เช่าอัปโหลดรูปคืนของแล้ว แต่ผู้เช่ายังไม่ยืนยันการคืน สินค้าถูกกันคิวไว้ ต้องตรวจสอบและดำเนินการ'
      FROM user_role_assignment ura
      JOIN role ro2 ON ro2.role_id = ura.role_id AND ro2.role_type = 'admin'
    ) t
    WHERE NOT EXISTS (
      SELECT 1 FROM notification n
      WHERE n.related_order_id = r.order_id AND n.type = 'return_overdue' AND n.user_id = t.user_id
    );
  END LOOP;
END;
$$;
