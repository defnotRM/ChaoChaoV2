-- 33: จำกัดผลลัพธ์ที่ผู้ใช้ทั่วไปเรียก settle_rental_order ได้ (ปิดช่อง F2 ส่วนที่ผู้ใช้เลือกผลลัพธ์เอง)
--
-- ปัญหา: settle_rental_order ให้ผู้เช่า/ผู้ให้เช่าของออเดอร์เลือก p_outcome เองได้ทุกแบบ และไม่ตรวจสถานะออเดอร์
-- (เรียกผ่าน POST /api/rentals/[id]/settle หรือยิง /rest/v1/rpc/settle_rental_order ตรงก็ได้)
--   * ผู้ให้เช่าเลือก 'item_not_returned' แล้วได้มัดจำของผู้เช่า
--   * ผู้เช่าเลือก 'happy' ตอนที่ยังไม่ได้คืนของ แล้วได้มัดจำคืน
--   * เรียกซ้ำเพิ่มแถว payment ซ้ำ
-- migration 30 ผูก p_caller_id กับ session แล้ว แต่ยังไม่ได้ตรวจสิทธิ์ของผลลัพธ์
--
-- สิ่งที่ทำ: ผู้ใช้ทั่วไป (มี auth.uid() และไม่ใช่แอดมิน) ใช้ได้เฉพาะ
--   'happy'                  เมื่อสถานะ item_sent/item_received และมีรูปคืนของ lender_after + renter_after ครบ
--   'renter_rejected_meetup' เฉพาะผู้เช่า เมื่อสถานะ item_sent
-- ผลลัพธ์อื่นต้องเป็นแอดมินหรือระบบ (cron / service role ที่ไม่มี auth.uid()) ไม่เปลี่ยนพฤติกรรมของแอดมินและ cron
-- เนื้อฟังก์ชันที่เหลือเหมือน migration 30 ทุกบรรทัด
--
-- ต้องรันหลัง 30  ย้อนกลับ: down/33_settle_outcome_guard.down.sql

CREATE OR REPLACE FUNCTION public.settle_rental_order(p_order_id uuid, p_caller_id uuid, p_outcome text, p_damage_amount numeric DEFAULT 0)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order          public.rentalorder%ROWTYPE;
  v_lender_id      UUID;
  v_platform_fee   NUMERIC(12,2) := 0;
  v_lender_income  NUMERIC(12,2) := 0;
  v_renter_refund  NUMERIC(12,2) := 0;
  v_extra_charge   NUMERIC(12,2) := 0;
  v_new_status     TEXT;
BEGIN
  -- ผูกผู้เรียกกับ session: ผู้ที่ล็อกอินอยู่ต้องส่ง p_caller_id เป็นตัวเองเท่านั้น
  -- (service role / cron ไม่มี auth.uid() จึงถือเป็นระบบและข้ามข้อนี้)
  IF auth.uid() IS NOT NULL AND p_caller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์: p_caller_id ต้องตรงกับผู้ที่เข้าสู่ระบบ';
  END IF;
  SELECT ro.* INTO v_order FROM public.rentalorder ro WHERE ro.order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบ order: %', p_order_id;
  END IF;

  SELECT user_id INTO v_lender_id FROM public.item WHERE item_id = v_order.item_id;

  IF p_caller_id <> v_order.user_id AND p_caller_id <> v_lender_id AND NOT is_admin() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ปิดยอด order นี้';
  END IF;

  -- ผู้ใช้ทั่วไป (ไม่ใช่แอดมิน และไม่ใช่ระบบ/cron ที่ไม่มี auth.uid()) ปิดยอดได้เฉพาะ 2 แบบที่แอปเรียกจริง
  -- ผลลัพธ์อื่นทั้งหมด (ไม่คืนของ/ของเสียหาย/ไม่มาตามนัด/ข้อพิพาท ฯลฯ) ต้องให้แอดมินตัดสินหรือ cron เท่านั้น
  -- ไม่งั้นฝ่ายใดฝ่ายหนึ่งเรียก RPC ตรงผ่าน REST เพื่อเลือกผลลัพธ์ที่ได้เงินมัดจำเองได้
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    IF p_outcome = 'happy' THEN
      -- จบงานปกติ: ต้องอยู่ระหว่างเช่า และมีหลักฐานรูปคืนของครบทั้งสองฝ่าย (ตรงกับ /api/return และ /api/rentals/[id]/evidence)
      IF v_order.status NOT IN ('item_sent', 'item_received')
         OR NOT EXISTS (SELECT 1 FROM public.rentalevidenceimage e WHERE e.order_id = p_order_id AND e.evidence_type = 'lender_after')
         OR NOT EXISTS (SELECT 1 FROM public.rentalevidenceimage e WHERE e.order_id = p_order_id AND e.evidence_type = 'renter_after') THEN
        RAISE EXCEPTION 'ยังปิดงานไม่ได้: ต้องอยู่ระหว่างเช่าและมีหลักฐานคืนของครบทั้งสองฝ่าย';
      END IF;
    ELSIF p_outcome = 'renter_rejected_meetup' THEN
      -- ผู้เช่าปฏิเสธรับของหน้างาน: เฉพาะผู้เช่าของออเดอร์นี้ ตอนที่เพิ่งส่งมอบ (ตรงกับ /api/rentals/[id]/reject-pickup)
      IF p_caller_id <> v_order.user_id OR v_order.status <> 'item_sent' THEN
        RAISE EXCEPTION 'ปฏิเสธรับของได้เฉพาะผู้เช่า ตอนที่ออเดอร์อยู่สถานะส่งมอบแล้ว';
      END IF;
    ELSE
      RAISE EXCEPTION 'ผลลัพธ์ "%" ต้องให้ผู้ดูแลระบบเป็นผู้ตัดสิน', p_outcome;
    END IF;
  END IF;

  CASE p_outcome
    WHEN 'happy', 'false_advertisement_rejected', 'item_not_returned_rejected' THEN
      v_renter_refund := v_order.deposit;
      v_platform_fee  := ROUND(v_order.rental_fee * public.workflow_cfg_num('platform_fee_percent', 10) / 100, 2);
      v_lender_income := v_order.rental_fee - v_platform_fee;
      v_new_status := 'completed';

    WHEN 'damaged' THEN
      v_platform_fee := ROUND(v_order.rental_fee * public.workflow_cfg_num('platform_fee_percent', 10) / 100, 2);
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
      v_platform_fee  := ROUND(v_order.rental_fee * public.workflow_cfg_num('platform_fee_percent', 10) / 100, 2);
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
$function$;
