-- ย้อนกลับ 32: คืน send_reminder_notifications() เป็นเวอร์ชันก่อนหน้า (ไม่มีการแจ้งเตือน return_overdue)
-- ไม่ลบแถวแจ้งเตือน return_overdue ที่ถูกสร้างไปแล้ว

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
END;
$$;
