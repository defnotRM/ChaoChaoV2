-- ============================================================================
-- 22_notification_system.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
--
-- FR-44 ถึง FR-51: ระบบแจ้งเตือนในแอป (in-app เท่านั้น ไม่ทำ push notification จริง)
-- ใช้ database trigger แทนแทรกโค้ดแจ้งเตือนกระจายทั่วทุก API route เพราะ
-- ครอบคลุมอัตโนมัติทุกจุดที่ตารางเปลี่ยนแปลงจริง ไม่มีทางตกหล่น
-- ============================================================================

CREATE TABLE notification (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES useraccount(user_id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_order_id UUID REFERENCES rentalorder(order_id),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_select ON notification FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY notification_update ON notification FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_lender_id UUID;
  v_renter_id UUID;
BEGIN
  SELECT it.user_id INTO v_lender_id FROM item it WHERE it.item_id = NEW.item_id;
  v_renter_id := NEW.user_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO notification (user_id, type, title, message, related_order_id)
    VALUES (v_lender_id, 'new_request', 'มีคำขอเช่าใหม่', 'มีผู้เช่าส่งคำขอเช่าสินค้าของคุณเข้ามา รอการอนุมัติภายใน 8 ชั่วโมง', NEW.order_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'awaiting_payment' THEN
      INSERT INTO notification (user_id, type, title, message, related_order_id)
      VALUES (v_renter_id, 'approved', 'คำขอเช่าได้รับการอนุมัติ', 'กรุณาชำระเงินภายใน 8 ชั่วโมง', NEW.order_id);
    ELSIF NEW.status = 'rejected_by_lender' THEN
      INSERT INTO notification (user_id, type, title, message, related_order_id)
      VALUES (v_renter_id, 'rejected', 'คำขอเช่าถูกปฏิเสธ', 'ผู้ให้เช่าปฏิเสธคำขอเช่าของคุณ', NEW.order_id);
    ELSIF NEW.status = 'paid' THEN
      INSERT INTO notification (user_id, type, title, message, related_order_id)
      VALUES (v_lender_id, 'payment_confirmed', 'ยืนยันการชำระเงินแล้ว', 'การชำระเงินได้รับการยืนยัน เตรียมส่งมอบสินค้าได้เลย', NEW.order_id);
    ELSIF NEW.status = 'item_sent' THEN
      INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
        (v_renter_id, 'status_change', 'เริ่มการเช่าแล้ว', 'ทั้งสองฝ่ายยืนยันหลักฐานรับของครบแล้ว', NEW.order_id),
        (v_lender_id, 'status_change', 'เริ่มการเช่าแล้ว', 'ทั้งสองฝ่ายยืนยันหลักฐานรับของครบแล้ว', NEW.order_id);
    ELSIF NEW.status = 'completed' THEN
      INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
        (v_renter_id, 'payout', 'การเช่าเสร็จสมบูรณ์', 'ระบบคืนเงินประกันให้คุณเรียบร้อยแล้ว', NEW.order_id),
        (v_lender_id, 'payout', 'การเช่าเสร็จสมบูรณ์', 'ระบบโอนค่าเช่าให้คุณเรียบร้อยแล้ว', NEW.order_id);
    ELSIF NEW.status IN ('cancelled', 'cancelled_by_renter', 'cancelled_by_lender') THEN
      INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
        (v_renter_id, 'cancelled', 'รายการเช่าถูกยกเลิก', 'ระบบดำเนินการกระจายเงินตามเงื่อนไขเรียบร้อยแล้ว', NEW.order_id),
        (v_lender_id, 'cancelled', 'รายการเช่าถูกยกเลิก', 'ระบบดำเนินการกระจายเงินตามเงื่อนไขเรียบร้อยแล้ว', NEW.order_id);
    ELSIF NEW.status IN ('renter_noshow','lender_noshow','rejected_at_meetup','disputed_at_meetup','refunded_dispute','item_not_returned','awaiting_additional_payment') THEN
      INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
        (v_renter_id, 'status_change', 'สถานะการเช่าเปลี่ยนแปลง', 'มีการอัปเดตสถานะออเดอร์ กรุณาตรวจสอบรายละเอียด', NEW.order_id),
        (v_lender_id, 'status_change', 'สถานะการเช่าเปลี่ยนแปลง', 'มีการอัปเดตสถานะออเดอร์ กรุณาตรวจสอบรายละเอียด', NEW.order_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_order_status
AFTER INSERT OR UPDATE ON rentalorder
FOR EACH ROW EXECUTE FUNCTION notify_order_status_change();

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_recipient UUID;
BEGIN
  SELECT CASE WHEN cr.user_a = NEW.sender_id THEN cr.user_b ELSE cr.user_a END
  INTO v_recipient
  FROM chatroom cr WHERE cr.chat_room_id = NEW.chat_room_id;

  IF v_recipient IS NOT NULL THEN
    INSERT INTO notification (user_id, type, title, message)
    VALUES (v_recipient, 'new_message', 'ข้อความใหม่', 'คุณมีข้อความใหม่ในห้องแชท');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_message
AFTER INSERT ON message
FOR EACH ROW EXECUTE FUNCTION notify_new_message();

CREATE OR REPLACE FUNCTION public.notify_new_report()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_renter_id UUID;
  v_lender_id UUID;
BEGIN
  SELECT ro.user_id, it.user_id INTO v_renter_id, v_lender_id
  FROM rentalorder ro JOIN item it ON it.item_id = ro.item_id
  WHERE ro.order_id = NEW.order_id;

  INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
    (v_renter_id, 'new_report', 'มีการรายงานปัญหาเกิดขึ้น', 'ออเดอร์ของคุณมีการรายงานปัญหา รอแอดมินตรวจสอบ', NEW.order_id),
    (v_lender_id, 'new_report', 'มีการรายงานปัญหาเกิดขึ้น', 'ออเดอร์ของคุณมีการรายงานปัญหา รอแอดมินตรวจสอบ', NEW.order_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_report
AFTER INSERT ON rentalreport
FOR EACH ROW EXECUTE FUNCTION notify_new_report();

CREATE OR REPLACE FUNCTION public.notify_report_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_renter_id UUID;
  v_lender_id UUID;
BEGIN
  IF OLD.status = 'pending_investigation' AND NEW.status <> 'pending_investigation' THEN
    SELECT ro.user_id, it.user_id INTO v_renter_id, v_lender_id
    FROM rentalorder ro JOIN item it ON it.item_id = ro.item_id
    WHERE ro.order_id = NEW.order_id;

    INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
      (v_renter_id, 'report_resolved', 'แอดมินตัดสินข้อพิพาทแล้ว', 'ผลการตัดสินข้อพิพาทออกมาแล้ว กรุณาตรวจสอบ', NEW.order_id),
      (v_lender_id, 'report_resolved', 'แอดมินตัดสินข้อพิพาทแล้ว', 'ผลการตัดสินข้อพิพาทออกมาแล้ว กรุณาตรวจสอบ', NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_report_resolved
AFTER UPDATE ON rentalreport
FOR EACH ROW EXECUTE FUNCTION notify_report_resolved();

CREATE OR REPLACE FUNCTION public.send_reminder_notifications()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

SELECT cron.schedule('daily-reminders', '0 9 * * *', $$ SELECT public.send_reminder_notifications(); $$);
