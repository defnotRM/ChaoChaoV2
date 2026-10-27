-- 34: รายงานบัญชีผู้ใช้ (account_report) ไม่มีออเดอร์ (rentalreport.order_id = NULL)
-- trigger เดิมสองตัวหาผู้รับแจ้งเตือนจากออเดอร์ จึงได้ user_id = NULL แล้วชน NOT NULL ของ notification.user_id
--   - notify_new_report      (ตอน INSERT รายงาน)
--   - notify_report_resolved (ตอนแอดมินตัดสิน: status เปลี่ยนจาก pending_investigation)
-- แก้โดยข้าม trigger เมื่อไม่มีออเดอร์ พฤติกรรมของรายงานที่มีออเดอร์ไม่เปลี่ยน
-- (แจ้งเตือนหลังตัดสินรายงานบัญชี API /api/admin/disputes/[id]/resolve ส่งให้เองอยู่แล้ว)
-- ใช้ CREATE OR REPLACE: trigger และสิทธิ์ EXECUTE เดิม (migration 30) คงอยู่

CREATE OR REPLACE FUNCTION public.notify_new_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_renter_id UUID;
  v_lender_id UUID;
BEGIN
  -- รายงานบัญชีผู้ใช้ไม่มีออเดอร์ ไม่มีคู่กรณีให้แจ้งเตือน (แอดมินเห็นในหน้า disputes)
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ro.user_id, it.user_id INTO v_renter_id, v_lender_id
  FROM rentalorder ro JOIN item it ON it.item_id = ro.item_id
  WHERE ro.order_id = NEW.order_id;

  INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
    (v_renter_id, 'new_report', 'มีการรายงานปัญหาเกิดขึ้น', 'ออเดอร์ของคุณมีการรายงานปัญหา รอแอดมินตรวจสอบ', NEW.order_id),
    (v_lender_id, 'new_report', 'มีการรายงานปัญหาเกิดขึ้น', 'ออเดอร์ของคุณมีการรายงานปัญหา รอแอดมินตรวจสอบ', NEW.order_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_report_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_renter_id UUID;
  v_lender_id UUID;
BEGIN
  IF OLD.status = 'pending_investigation' AND NEW.status <> 'pending_investigation' THEN
    -- รายงานบัญชีผู้ใช้ไม่มีออเดอร์ API resolve ส่งแจ้งเตือนผลตัดสินเองแล้ว
    IF NEW.order_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT ro.user_id, it.user_id INTO v_renter_id, v_lender_id
    FROM rentalorder ro JOIN item it ON it.item_id = ro.item_id
    WHERE ro.order_id = NEW.order_id;

    INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
      (v_renter_id, 'report_resolved', 'แอดมินตัดสินข้อพิพาทแล้ว', 'ผลการตัดสินข้อพิพาทออกมาแล้ว กรุณาตรวจสอบ', NEW.order_id),
      (v_lender_id, 'report_resolved', 'แอดมินตัดสินข้อพิพาทแล้ว', 'ผลการตัดสินข้อพิพาทออกมาแล้ว กรุณาตรวจสอบ', NEW.order_id);
  END IF;
  RETURN NEW;
END;
$function$;
