-- 34 DOWN: คืน notify_new_report และ notify_report_resolved เป็นนิยามเดิมทุกบรรทัด
-- หมายเหตุ: หลังย้อนกลับ การส่งรายงานบัญชีผู้ใช้ (order_id = NULL) จะ error อีกครั้ง

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
