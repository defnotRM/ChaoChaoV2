-- ============================================================================
-- 07_baseline_actual_schema.sql
--
-- *** ไฟล์นี้คือ "ภาพถ่าย" ของโครงสร้างฐานข้อมูลจริงบน Supabase Cloud
--     (project: ChaoChao, ref: awnwvckyjkkuhufmdgas) ณ วันที่บันทึก ***
--
-- ที่มา: ไฟล์ 01-06 ในโฟลเดอร์นี้เขียนไว้ตอนต้นโปรเจกต์ แต่หลังจากนั้นมีการแก้ไข
-- schema จริงบนคลาวด์แบบ manual หลายรอบ (ผ่าน Supabase Studio โดยตรง) โดยไม่ได้
-- อัปเดตไฟล์ migration ให้ตรงกัน ทำให้ไฟล์ 01-06 ใช้อ้างอิงความจริงไม่ได้อีกต่อไป
-- สำหรับตาราง: chatroom, message, payment, rentalevidenceimage และฟังก์ชัน
-- settle_rental_order, upload_rental_evidence
--
-- ไฟล์นี้จึงถูกสร้างขึ้นเพื่อบันทึกสถานะจริง ณ ปัจจุบันไว้ให้ทีมอ้างอิงตรงกัน
-- - ไม่ได้ถูกรันกับ production database (มีอยู่แล้วจริง ไม่ต้องสร้างซ้ำ)
-- - ใช้สำหรับ: (1) เอกสารอ้างอิงสภาพจริงของทีม (2) รันสร้าง Supabase project
--   ใหม่ตั้งแต่ต้นให้ตรงกับ production ทุกประการ (เช่น dev/staging environment)
-- - RLS policy ที่ปรากฏด้านล่างคือของจริงที่ใช้งานอยู่ ณ ตอนบันทึก (ส่วนใหญ่เปิด
--   กว้างเกินไป "qual: true") จะถูกแก้ให้รัดกุมขึ้นในไฟล์ migration ถัดไป
--   (08_tighten_rls_policies.sql) แยกต่างหาก เพื่อให้ตรวจสอบ diff ได้ง่าย
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- สำหรับ gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist; -- สำหรับ EXCLUDE constraint กันจองซ้อน
-- หมายเหตุ: Supabase linter เตือนว่า btree_gist ควรอยู่ schema แยก ไม่ใช่ public
-- (ดู advisory "extension_in_public") ยังไม่ย้ายในไฟล์นี้ เป็นงานแยกทีหลัง

-- ----------------------------------------------------------------------------
-- 1. Role
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role (
  role_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_type TEXT NOT NULL UNIQUE CHECK (role_type = ANY (ARRAY['renter','lender','admin']))
);

-- ----------------------------------------------------------------------------
-- 2. UserAccount
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.useraccount (
  user_id     UUID PRIMARY KEY,
  national_id TEXT UNIQUE,
  username    TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  firstname   TEXT,
  lastname    TEXT,
  status      TEXT NOT NULL DEFAULT 'Active'
              CHECK (status = ANY (ARRAY['Active','Pending_Verification','Suspended','Banned','Deactivated'])),
  bio         TEXT,
  avatar_url  TEXT,
  banner_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_useraccount_updated_at
  BEFORE UPDATE ON public.useraccount
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. UserPhones
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.userphones (
  user_id UUID NOT NULL REFERENCES public.useraccount(user_id),
  phone   TEXT NOT NULL,
  PRIMARY KEY (user_id, phone)
);

-- ----------------------------------------------------------------------------
-- 4. BankAccount
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bankaccount (
  bank_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.useraccount(user_id),
  bank_name       TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  account_name    TEXT NOT NULL,
  is_default      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_number)
);

-- ----------------------------------------------------------------------------
-- 5. User_Role_Assignment
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_role_assignment (
  role_id     UUID NOT NULL REFERENCES public.role(role_id),
  user_id     UUID NOT NULL REFERENCES public.useraccount(user_id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 6. ItemCategory
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itemcategory (
  category_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. Item
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item (
  item_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.useraccount(user_id),
  category_id         UUID REFERENCES public.itemcategory(category_id),
  item_name           TEXT NOT NULL,
  description         TEXT,
  original_price      NUMERIC CHECK (original_price >= 0),
  rental_fee_per_day  NUMERIC CHECK (rental_fee_per_day >= 0),
  deposit             NUMERIC CHECK (deposit >= 0),
  status              TEXT NOT NULL DEFAULT 'available'
                       CHECK (status = ANY (ARRAY['available','rented','maintenance','inactive'])),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_item_updated_at
  BEFORE UPDATE ON public.item
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. ItemCondition
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itemcondition (
  item_id   UUID NOT NULL REFERENCES public.item(item_id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,
  condition TEXT NOT NULL,
  PRIMARY KEY (item_id, seq)
);

-- ----------------------------------------------------------------------------
-- 9. ItemLocation  (หมายเหตุ: ยังไม่มี lat/lng ตาม requirement พิกัดแผนที่)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itemlocation (
  location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES public.item(item_id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  no          TEXT,
  alley       TEXT,
  road        TEXT,
  subdistrict TEXT,
  district    TEXT,
  province    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 10. ItemImage
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itemimage (
  image_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID NOT NULL REFERENCES public.item(item_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  sequence   INTEGER,
  image_url  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 11. Availability  (หมายเหตุ: date เท่านั้น ยังไม่มีคอลัมน์เวลา)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.availability (
  availability_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID NOT NULL REFERENCES public.item(item_id) ON DELETE CASCADE,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 12. RentalOrder
-- status enum จริงมีมากกว่าที่ไฟล์เก่าระบุ (เพิ่ม cancelled_by_renter, rejected_by_lender)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rentalorder (
  order_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.useraccount(user_id),
  item_id         UUID NOT NULL REFERENCES public.item(item_id),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  meetup_location TEXT,
  return_location TEXT,
  rental_fee      NUMERIC NOT NULL CHECK (rental_fee >= 0),
  deposit         NUMERIC NOT NULL CHECK (deposit >= 0),
  total_paid      NUMERIC CHECK (total_paid >= 0),
  fee             NUMERIC CHECK (fee >= 0),
  net_income      NUMERIC CHECK (net_income >= 0),
  status          TEXT NOT NULL DEFAULT 'requested'
                  CHECK (status = ANY (ARRAY[
                    'requested','awaiting_payment','paid','item_sent','item_received',
                    'item_returned','completed','cancelled','cancelled_by_renter',
                    'rejected_by_lender','awaiting_additional_payment'
                  ])),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_rentalorder_updated_at
  BEFORE UPDATE ON public.rentalorder
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- กันจองสินค้าชิ้นเดียวกันซ้อนวันกัน (เฉพาะสถานะที่ล็อกคิวแล้ว)
ALTER TABLE public.rentalorder
  ADD CONSTRAINT no_overlapping_active_bookings
  EXCLUDE USING gist (
    item_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('awaiting_payment','paid','item_sent','item_received','item_returned','awaiting_additional_payment'));

-- ----------------------------------------------------------------------------
-- 13. RentalEvidenceImage
-- *** คอลัมน์จริงคือ uploaded_by ไม่ใช่ user_id ตามที่ไฟล์เก่าเขียนผิด ***
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rentalevidenceimage (
  evidence_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.rentalorder(order_id),
  uploaded_by   UUID NOT NULL REFERENCES public.useraccount(user_id),
  image_url     TEXT NOT NULL,
  evidence_type TEXT NOT NULL
                CHECK (evidence_type = ANY (ARRAY['renter_before','renter_after','lender_before','lender_after'])),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 14. Payment
-- *** ไม่มี date, ไม่มี transaction_ref ตามที่ไฟล์เก่าเขียนไว้ ***
-- *** status มีแค่ 3 ค่า (pending/paid/rejected) ไม่ใช่ 4 ค่าตามไฟล์เก่า ***
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment (
  payment_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES public.rentalorder(order_id),
  user_id        UUID NOT NULL REFERENCES public.useraccount(user_id),
  amount         NUMERIC CHECK (amount >= 0),
  slip_image_url TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status = ANY (ARRAY['pending','paid','rejected'])),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 15. Review
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review (
  review_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL UNIQUE REFERENCES public.rentalorder(order_id),
  rating     INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 16. ReviewImage
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviewimage (
  review_image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id       UUID NOT NULL REFERENCES public.review(review_id) ON DELETE CASCADE,
  image_url       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 17. RentalReportType
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rentalreporttype (
  report_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_name      TEXT NOT NULL UNIQUE
);

-- ----------------------------------------------------------------------------
-- 18. RentalReport  (รองรับ requirement เรื่องข้อพิพาท/รายงาน — รอ Admin UI)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rentalreport (
  report_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES public.rentalorder(order_id),
  reporter_id    UUID NOT NULL REFERENCES public.useraccount(user_id),
  report_type_id UUID NOT NULL REFERENCES public.rentalreporttype(report_type_id),
  description    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending_investigation'
                 CHECK (status = ANY (ARRAY['pending_investigation','resolved_renter_fault','resolved_lender_fault','dismissed'])),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 19. RentalReportImage
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rentalreportimage (
  report_image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES public.rentalreport(report_id) ON DELETE CASCADE,
  image_url       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 20. ChatRoom
-- *** คอลัมน์จริงคือ user_a/user_b (แชทต่อ "คู่คน" ไม่ผูก role) ***
-- *** ไม่มี last_message, ไม่มี updated_at ตามที่ไฟล์เก่าเขียนไว้ ***
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatroom (
  chat_room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a       UUID NOT NULL REFERENCES public.useraccount(user_id),
  user_b       UUID NOT NULL REFERENCES public.useraccount(user_id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_a, user_b)
);

-- ----------------------------------------------------------------------------
-- 21. Message
-- *** มี order_id (nullable) แล้ว — รองรับ requirement "ผูกแชทกับ order" ได้เลย ***
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message (
  message_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id UUID NOT NULL REFERENCES public.chatroom(chat_room_id),
  order_id     UUID REFERENCES public.rentalorder(order_id),
  sender_id    UUID NOT NULL REFERENCES public.useraccount(user_id),
  type         TEXT NOT NULL DEFAULT 'text',
  content      TEXT NOT NULL,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- RLS — เปิดใช้งานทุกตาราง (ตรงกับสถานะจริง rls_enabled=true ทุกตัว)
-- ============================================================================
ALTER TABLE public.role ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.useraccount ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.userphones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bankaccount ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itemcategory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itemcondition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itemlocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itemimage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rentalorder ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rentalevidenceimage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviewimage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rentalreporttype ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rentalreport ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rentalreportimage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatroom ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Helper: is_admin() — SECURITY DEFINER, เช็คว่า auth.uid() ปัจจุบันมี role admin
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignment ura
    JOIN public.role r ON r.role_id = ura.role_id
    WHERE ura.user_id = auth.uid() AND r.role_type = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- RLS Policies — ของจริงที่ใช้งานอยู่ ณ วันที่บันทึกไฟล์นี้
-- *** หมายเหตุสำคัญ: ตารางส่วนใหญ่ด้านล่างเปิดกว้างเกินไป (qual: true = ทุกคน
--     ทำอะไรก็ได้) ถือเป็นความเสี่ยงด้านความปลอดภัยที่ระบุไว้แล้วในรายงาน
--     จะถูกรัดให้เข้มขึ้นในไฟล์ 08_tighten_rls_policies.sql แยกต่างหาก
--     ตารางที่ทำถูกต้องตามมาตรฐานอยู่แล้ว (เช็ค auth.uid()) คือ: bankaccount,
--     item(write), itemcategory(write), user_role_assignment, useraccount(update),
--     userphones(write) — ใช้เป็นต้นแบบตอนไปแก้ตารางอื่นได้เลย
-- ----------------------------------------------------------------------------
CREATE POLICY role_select_all ON public.role FOR SELECT USING (true);

CREATE POLICY useraccount_select_all ON public.useraccount FOR SELECT USING (true);
CREATE POLICY useraccount_insert_self ON public.useraccount FOR INSERT WITH CHECK (true);
CREATE POLICY useraccount_update_own_or_admin ON public.useraccount FOR UPDATE USING (user_id = auth.uid() OR is_admin());

CREATE POLICY userphones_select ON public.userphones FOR SELECT USING (true);
CREATE POLICY userphones_write ON public.userphones FOR ALL USING (user_id = auth.uid() OR is_admin());

CREATE POLICY bankaccount_all ON public.bankaccount FOR ALL USING (user_id = auth.uid() OR is_admin());

CREATE POLICY roleassign_select ON public.user_role_assignment FOR SELECT USING (true);
CREATE POLICY roleassign_all ON public.user_role_assignment FOR ALL USING (user_id = auth.uid() OR is_admin());

CREATE POLICY itemcategory_select_all ON public.itemcategory FOR SELECT USING (true);
CREATE POLICY itemcategory_write ON public.itemcategory FOR ALL USING (is_admin());

CREATE POLICY item_select_all ON public.item FOR SELECT USING (true);
CREATE POLICY item_write ON public.item FOR ALL USING (user_id = auth.uid() OR is_admin());

-- ⚠️ ด้านล่างนี้ทั้งหมด qual = true (เปิดกว้าง) ตรงกับของจริง ยังไม่ได้แก้
CREATE POLICY itemcondition_select_all ON public.itemcondition FOR SELECT USING (true);
CREATE POLICY itemcondition_write ON public.itemcondition FOR ALL USING (true);

CREATE POLICY itemlocation_select_all ON public.itemlocation FOR SELECT USING (true);
CREATE POLICY itemlocation_write ON public.itemlocation FOR ALL USING (true);

CREATE POLICY itemimage_select_all ON public.itemimage FOR SELECT USING (true);
CREATE POLICY itemimage_write ON public.itemimage FOR ALL USING (true);

CREATE POLICY availability_select_all ON public.availability FOR SELECT USING (true);
CREATE POLICY availability_write ON public.availability FOR ALL USING (true);

CREATE POLICY rentalorder_select_all ON public.rentalorder FOR SELECT USING (true);
CREATE POLICY rentalorder_write ON public.rentalorder FOR ALL USING (true);

CREATE POLICY evidence_all ON public.rentalevidenceimage FOR ALL USING (true);

CREATE POLICY payment_all ON public.payment FOR ALL USING (true);

CREATE POLICY review_select_all ON public.review FOR SELECT USING (true);
CREATE POLICY review_write ON public.review FOR ALL USING (true);

CREATE POLICY reviewimage_all ON public.reviewimage FOR ALL USING (true);

CREATE POLICY reporttype_select_all ON public.rentalreporttype FOR SELECT USING (true);

CREATE POLICY report_all ON public.rentalreport FOR ALL USING (true);
CREATE POLICY reportimage_all ON public.rentalreportimage FOR ALL USING (true);

CREATE POLICY chatroom_all ON public.chatroom FOR ALL USING (true);
CREATE POLICY message_all ON public.message FOR ALL USING (true);

-- ============================================================================
-- Functions (RPC) — ของจริงที่ใช้งานอยู่ ดึงมาทั้งก้อนตรงๆ ด้วย pg_get_functiondef
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_item_listing(
  p_user_id uuid, p_category_id uuid, p_item_name text, p_description text,
  p_original_price numeric, p_rental_fee_per_day numeric, p_deposit numeric,
  p_images jsonb, p_locations jsonb, p_availability_start date,
  p_availability_end date, p_conditions text[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item_id UUID;
  v_img     JSONB;
  v_loc     JSONB;
  v_cond    TEXT;
  v_seq     INTEGER := 1;
BEGIN
  IF p_user_id <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ลงประกาศสินค้าแทนผู้ใช้คนอื่น';
  END IF;

  INSERT INTO public.item (user_id, category_id, item_name, description,
                           original_price, rental_fee_per_day, deposit, status)
  VALUES (p_user_id, p_category_id, p_item_name, p_description,
          p_original_price, p_rental_fee_per_day, p_deposit, 'available')
  RETURNING item_id INTO v_item_id;

  FOR v_img IN SELECT * FROM jsonb_array_elements(p_images) LOOP
    INSERT INTO public.itemimage (item_id, image_url, is_primary, sequence)
    VALUES (v_item_id, v_img->>'image_url',
            COALESCE((v_img->>'is_primary')::boolean, false),
            (v_img->>'sequence')::integer);
  END LOOP;

  FOR v_loc IN SELECT * FROM jsonb_array_elements(p_locations) LOOP
    INSERT INTO public.itemlocation (item_id, description, no, alley, road, subdistrict, district, province)
    VALUES (v_item_id, v_loc->>'description', v_loc->>'no', v_loc->>'alley', v_loc->>'road',
            v_loc->>'subdistrict', v_loc->>'district', v_loc->>'province');
  END LOOP;

  INSERT INTO public.availability (item_id, start_date, end_date)
  VALUES (v_item_id, p_availability_start, p_availability_end);

  FOREACH v_cond IN ARRAY p_conditions LOOP
    INSERT INTO public.itemcondition (item_id, seq, condition) VALUES (v_item_id, v_seq, v_cond);
    v_seq := v_seq + 1;
  END LOOP;

  RETURN v_item_id;
END;
$$;

-- *** signature จริงต่างจากที่ /api/rentals/[id]/settle เรียกใช้อยู่ ***
-- โค้ดเรียกด้วย (p_order_id, p_damage_cost) แต่ของจริงต้องการ 4 พารามิเตอร์นี้
-- ต้องแก้โค้ด API ให้ตรงกับของจริงนี้ (ดูข้อ 3 ในแผนที่วางไว้)
CREATE OR REPLACE FUNCTION public.settle_rental_order(
  p_order_id uuid, p_lender_id uuid, p_damage_fee numeric DEFAULT 0, p_late_fee numeric DEFAULT 0
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order         public.rentalorder%ROWTYPE;
  v_lender_actual UUID;
  v_total_deduct  NUMERIC(12,2);
  v_refund_amount NUMERIC(12,2);
  v_extra_charge  NUMERIC(12,2);
BEGIN
  SELECT ro.*, it.user_id AS item_owner_id
  INTO v_order
  FROM public.rentalorder ro
  JOIN public.item it ON it.item_id = ro.item_id
  WHERE ro.order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบ order: %', p_order_id;
  END IF;

  SELECT user_id INTO v_lender_actual FROM public.item WHERE item_id = v_order.item_id;
  IF p_lender_id <> v_lender_actual AND NOT is_admin() THEN
    RAISE EXCEPTION 'เฉพาะผู้ให้เช่าของ order นี้เท่านั้นที่สามารถปิดยอดได้';
  END IF;

  v_total_deduct := COALESCE(p_damage_fee, 0) + COALESCE(p_late_fee, 0);

  IF v_total_deduct = 0 THEN
    v_refund_amount := v_order.deposit;
    UPDATE public.rentalorder SET status = 'completed', updated_at = NOW() WHERE order_id = p_order_id;
    INSERT INTO public.payment (order_id, user_id, amount, status) VALUES (p_order_id, v_order.user_id, v_refund_amount, 'paid');
    RETURN 'completed_no_damage';

  ELSIF v_total_deduct <= v_order.deposit THEN
    v_refund_amount := v_order.deposit - v_total_deduct;
    UPDATE public.rentalorder SET status = 'completed', updated_at = NOW() WHERE order_id = p_order_id;
    IF v_refund_amount > 0 THEN
      INSERT INTO public.payment (order_id, user_id, amount, status) VALUES (p_order_id, v_order.user_id, v_refund_amount, 'paid');
    END IF;
    RETURN 'completed_with_deduction:' || v_refund_amount;

  ELSE
    v_extra_charge := v_total_deduct - v_order.deposit;
    UPDATE public.rentalorder SET status = 'awaiting_additional_payment', updated_at = NOW() WHERE order_id = p_order_id;
    INSERT INTO public.payment (order_id, user_id, amount, status) VALUES (p_order_id, v_order.user_id, v_extra_charge, 'pending');
    RETURN 'awaiting_additional_payment:' || v_extra_charge;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_rental_review(
  p_order_id uuid, p_user_id uuid, p_rating integer, p_comment text, p_images text[] DEFAULT '{}'::text[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_renter_id    UUID;
  v_order_status TEXT;
  v_review_id    UUID;
  v_img          TEXT;
BEGIN
  IF p_user_id <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์เขียนรีวิวแทนผู้ใช้คนอื่น';
  END IF;

  SELECT user_id, status INTO v_renter_id, v_order_status
  FROM public.rentalorder WHERE order_id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบ order: %', p_order_id;
  END IF;

  IF v_renter_id <> p_user_id THEN
    RAISE EXCEPTION 'ไม่ใช่ผู้เช่าของ order นี้';
  END IF;

  IF v_order_status <> 'completed' THEN
    RAISE EXCEPTION 'รีวิวได้เฉพาะ order ที่เสร็จสมบูรณ์แล้วและเป็นของคุณเท่านั้น';
  END IF;

  INSERT INTO public.review (order_id, rating, comment) VALUES (p_order_id, p_rating, p_comment)
  RETURNING review_id INTO v_review_id;

  FOREACH v_img IN ARRAY p_images LOOP
    INSERT INTO public.reviewimage (review_id, image_url) VALUES (v_review_id, v_img);
  END LOOP;

  RETURN v_review_id;
END;
$$;

-- *** ใช้คอลัมน์ uploaded_by ถูกต้องแล้ว (ต่างจากไฟล์ 03 เดิมที่เขียนผิดเป็น user_id) ***
CREATE OR REPLACE FUNCTION public.upload_rental_evidence(
  p_order_id uuid, p_user_id uuid, p_evidence_type text, p_image_urls text[], p_new_status text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_renter_id UUID;
  v_lender_id UUID;
  v_url       TEXT;
BEGIN
  IF p_user_id <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์อัปโหลดหลักฐานแทนผู้ใช้คนอื่น';
  END IF;

  SELECT ro.user_id, it.user_id INTO v_renter_id, v_lender_id
  FROM public.rentalorder ro JOIN public.item it ON it.item_id = ro.item_id
  WHERE ro.order_id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบ order: %', p_order_id;
  END IF;

  IF p_user_id <> v_renter_id AND p_user_id <> v_lender_id AND NOT is_admin() THEN
    RAISE EXCEPTION 'ไม่ใช่ผู้เกี่ยวข้องกับ order นี้';
  END IF;

  FOREACH v_url IN ARRAY p_image_urls LOOP
    INSERT INTO public.rentalevidenceimage (order_id, uploaded_by, image_url, evidence_type)
    VALUES (p_order_id, p_user_id, v_url, p_evidence_type);
  END LOOP;

  IF p_new_status IS NOT NULL THEN
    UPDATE public.rentalorder SET status = p_new_status, updated_at = NOW() WHERE order_id = p_order_id;
  END IF;
END;
$$;

-- ============================================================================
-- Storage buckets — ของจริงที่มีอยู่ (ยังไม่มี bucket สำหรับรูปหลักฐานรับ-คืนของ)
-- ============================================================================
-- avatars  (public)  — รูปโปรไฟล์
-- banners  (public)  — รูปแบนเนอร์ร้านค้า/โปรไฟล์
-- slips    (public)  — สลิปโอนเงิน
-- *** ยังไม่มี bucket สำหรับ rentalevidenceimage — /api/handover ปัจจุบันเก็บ
--     รูปเป็น base64 ยัดลง column ตรงๆ ซึ่งไม่ใช่แนวทางที่ควรทำต่อ ***

-- ============================================================================
-- จบไฟล์ baseline — สิ่งที่ยังไม่มีในฐานข้อมูลจริง (requirement gap ที่ต้องคุยกันต่อ):
--   - เวลารับ-คืนแบบช่วงเวลา (มีแค่ DATE ใน availability/rentalorder)
--   - พิกัดสถานที่ (lat/lng) ใน itemlocation
--   - คอลัมน์ rating/order-count aggregate บน item
--   - bucket สำหรับรูปหลักฐานรับ-คืนของ
-- ============================================================================
