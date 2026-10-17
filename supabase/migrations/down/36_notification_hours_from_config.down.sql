-- ย้อนกลับ 36: คืน trigger เป็นเวอร์ชัน migration 34 (ข้อความฝังเลข 8 ชั่วโมง)

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
      -- ผู้ให้เช่ายกเลิกหลังชำระเงินต้องชี้แจงเหตุผล (FR-32) ให้ผู้เช่าเห็นเหตุผลนั้นในแจ้งเตือนด้วย
      INSERT INTO notification (user_id, type, title, message, related_order_id) VALUES
        (v_renter_id, 'cancelled', 'รายการเช่าถูกยกเลิก',
          CASE
            WHEN NEW.status = 'cancelled_by_lender' AND NULLIF(btrim(NEW.cancel_reason), '') IS NOT NULL
              THEN 'ผู้ให้เช่ายกเลิกรายการเช่า เหตุผล: ' || left(btrim(NEW.cancel_reason), 300) || ' ระบบดำเนินการกระจายเงินตามเงื่อนไขเรียบร้อยแล้ว'
            ELSE 'ระบบดำเนินการกระจายเงินตามเงื่อนไขเรียบร้อยแล้ว'
          END,
          NEW.order_id),
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
