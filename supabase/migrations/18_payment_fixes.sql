-- ============================================================================
-- 18_payment_fixes.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
-- รวม migration 17 (ที่ยังไม่เคย commit เข้า repo) เข้ากับของใหม่ไว้ในไฟล์เดียว
-- ============================================================================

-- (เดิมคือ 17_payment_date_transaction_ref.sql)
-- แก้บั๊ก "บันทึกการชำระเงินไม่สำเร็จ" — /api/payments (POST) และ
-- /api/rentals/[id] (GET) พยายาม insert/select คอลัมน์ date/transaction_ref
-- ที่หายไปจากตาราง payment มานาน
ALTER TABLE payment
  ADD COLUMN date TIMESTAMPTZ,
  ADD COLUMN transaction_ref TEXT;

-- RPC ที่ /api/payments/[id]/confirm/route.ts เรียกอยู่ แต่ไม่เคยถูกสร้างขึ้นมาเลย
-- เจอตอนไล่อ่านทั้ง repo เทียบกับ DB จริง — ทำให้ flow "จ่ายค่าเสียหายส่วนเกิน
-- ประกัน" (FR-37 เคสเกินวงเงินประกัน) พังตั้งแต่ต้น ไม่มีทางปิด order ได้เลย
--
-- ให้ผู้ให้เช่าของ order นั้น (หรือ admin) เป็นคนยืนยันได้ อัปเดต net_income
-- ของผู้ให้เช่าให้บวกเพิ่มด้วยยอดส่วนต่างที่เพิ่งจ่ายมา
CREATE OR REPLACE FUNCTION public.confirm_additional_payment(p_payment_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_payment   public.payment%ROWTYPE;
  v_order     public.rentalorder%ROWTYPE;
  v_lender_id UUID;
BEGIN
  SELECT * INTO v_payment FROM public.payment WHERE payment_id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการชำระเงิน: %', p_payment_id;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'รายการนี้ไม่ได้อยู่ในสถานะรอยืนยัน';
  END IF;

  SELECT * INTO v_order FROM public.rentalorder WHERE order_id = v_payment.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบ order ของรายการชำระเงินนี้';
  END IF;

  SELECT user_id INTO v_lender_id FROM public.item WHERE item_id = v_order.item_id;

  IF auth.uid() <> v_lender_id AND NOT is_admin() THEN
    RAISE EXCEPTION 'เฉพาะผู้ให้เช่าของ order นี้หรือแอดมินเท่านั้นที่ยืนยันได้';
  END IF;

  UPDATE public.payment SET status = 'paid' WHERE payment_id = p_payment_id;

  UPDATE public.rentalorder
  SET status = 'completed',
      net_income = COALESCE(net_income, 0) + v_payment.amount,
      updated_at = NOW()
  WHERE order_id = v_order.order_id;

  RETURN 'completed';
END;
$$;
