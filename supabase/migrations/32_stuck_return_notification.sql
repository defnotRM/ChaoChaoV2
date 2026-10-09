-- 32: แจ้งเตือนออเดอร์ที่เลยกำหนดคืนแต่ผู้เช่ายังไม่ยืนยันการคืน (ตัดสินใจ: แจ้งเตือนอย่างเดียว ไม่เปลี่ยนสถานะ)
--
-- ปัญหา: ออเดอร์ item_sent ที่ผู้ให้เช่าอัปโหลดรูปคืนของแล้ว (lender_after) แต่ผู้เช่าไม่อัปโหลด (renter_after)
-- ไม่มีเส้นทางจบอัตโนมัติ (process_expired_orders จบให้เฉพาะกรณีกลับกัน) สินค้าจึงถูกกันคิวถาวรโดยไม่มีใครรู้
--
-- สิ่งที่ทำ: ต่อท้าย send_reminder_notifications() (cron รายวัน 09:00 UTC) ให้แจ้งเตือนผู้เช่าและแอดมินทุกคน
-- ครั้งเดียวต่อออเดอร์ (type = 'return_overdue') เมื่อเลยวันคืน + noshow_grace_hours แล้ว ไม่เปลี่ยนสถานะออเดอร์ใดๆ
-- ส่วนที่เหลือของฟังก์ชันเหมือนเดิมทุกบรรทัด
--
-- ย้อนกลับ: down/32_stuck_return_notification.down.sql

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
