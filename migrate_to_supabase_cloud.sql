-- ==============================================================================
-- CHAOCHAO - FULL SUPABASE CLOUD MIGRATION SCRIPT
-- รันไฟล์นี้ไฟล์เดียวใน SQL Editor ของ Supabase Cloud (supabase.com)
-- เพื่อสร้าง Schema, Constraints, Functions, RLS, และข้อมูลเริ่มต้นทั้งหมด
-- ==============================================================================

-- 0. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. DROP EXISTING CONSTRAINTS & TABLES (SAFE IDEMPOTENT RUN)
-- ==============================================================================
DROP TABLE IF EXISTS public.message CASCADE;
DROP TABLE IF EXISTS public.chatroom CASCADE;
DROP TABLE IF EXISTS public.rentalreportimage CASCADE;
DROP TABLE IF EXISTS public.rentalreport CASCADE;
DROP TABLE IF EXISTS public.rentalreporttype CASCADE;
DROP TABLE IF EXISTS public.reviewimage CASCADE;
DROP TABLE IF EXISTS public.review CASCADE;
DROP TABLE IF EXISTS public.payment CASCADE;
DROP TABLE IF EXISTS public.rentalevidenceimage CASCADE;
DROP TABLE IF EXISTS public.rentalorder CASCADE;
DROP TABLE IF EXISTS public.availability CASCADE;
DROP TABLE IF EXISTS public.itemimage CASCADE;
DROP TABLE IF EXISTS public.itemlocation CASCADE;
DROP TABLE IF EXISTS public.itemcondition CASCADE;
DROP TABLE IF EXISTS public.item CASCADE;
DROP TABLE IF EXISTS public.itemcategory CASCADE;
DROP TABLE IF EXISTS public.user_role_assignment CASCADE;
DROP TABLE IF EXISTS public.bankaccount CASCADE;
DROP TABLE IF EXISTS public.userphones CASCADE;
DROP TABLE IF EXISTS public.useraccount CASCADE;
DROP TABLE IF EXISTS public.role CASCADE;
DROP TABLE IF EXISTS public.test_results CASCADE;

-- ==============================================================================
-- 2. CREATE FUNCTION set_updated_at
-- ==============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 3. TABLES DEFINITION
-- ==============================================================================

-- Role
CREATE TABLE public.role (
  role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_type TEXT NOT NULL UNIQUE CHECK (role_type IN ('renter', 'lender', 'admin'))
);

-- UserAccount
CREATE TABLE public.useraccount (
  user_id UUID PRIMARY KEY,
  national_id TEXT UNIQUE,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  firstname TEXT,
  lastname TEXT,
  status TEXT NOT NULL DEFAULT 'Active'
         CHECK (status IN ('Active', 'Pending_Verification', 'Suspended', 'Banned', 'Deactivated')),
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_useraccount_updated_at
  BEFORE UPDATE ON public.useraccount
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- UserPhones
CREATE TABLE public.userphones (
  user_id UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  PRIMARY KEY (user_id, phone)
);

-- BankAccount
CREATE TABLE public.bankaccount (
  bank_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, account_number)
);

CREATE UNIQUE INDEX idx_bankaccount_one_default_per_user
  ON public.bankaccount (user_id) WHERE is_default = true;

-- User_Role_Assignment
CREATE TABLE public.user_role_assignment (
  role_id UUID NOT NULL REFERENCES public.role(role_id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

-- ItemCategory
CREATE TABLE public.itemcategory (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Item
CREATE TABLE public.item (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE RESTRICT,
  category_id UUID REFERENCES public.itemcategory(category_id) ON DELETE RESTRICT,
  item_name TEXT NOT NULL,
  description TEXT,
  original_price NUMERIC(12,2) CHECK (original_price >= 0),
  rental_fee_per_day NUMERIC(12,2) CHECK (rental_fee_per_day >= 0),
  deposit NUMERIC(12,2) CHECK (deposit >= 0),
  status TEXT NOT NULL DEFAULT 'available'
         CHECK (status IN ('available', 'rented', 'maintenance', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_item_updated_at
  BEFORE UPDATE ON public.item
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ItemCondition
CREATE TABLE public.itemcondition (
  item_id UUID NOT NULL REFERENCES public.item(item_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  condition TEXT NOT NULL,
  PRIMARY KEY (item_id, seq)
);

-- ItemLocation
CREATE TABLE public.itemlocation (
  location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.item(item_id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  no TEXT,
  alley TEXT,
  road TEXT,
  subdistrict TEXT,
  district TEXT,
  province TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ItemImage
CREATE TABLE public.itemimage (
  image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.item(item_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  sequence INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_itemimage_one_primary_per_item
  ON public.itemimage (item_id) WHERE is_primary = true;

-- Availability
CREATE TABLE public.availability (
  availability_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.item(item_id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_availability_dates CHECK (end_date >= start_date)
);

-- RentalOrder
CREATE TABLE public.rentalorder (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES public.item(item_id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  meetup_location TEXT,
  return_location TEXT,
  rental_fee NUMERIC(12,2) NOT NULL CHECK (rental_fee >= 0),
  deposit NUMERIC(12,2) NOT NULL CHECK (deposit >= 0),
  total_paid NUMERIC(12,2) CHECK (total_paid >= 0),
  fee NUMERIC(12,2) CHECK (fee >= 0),
  net_income NUMERIC(12,2) CHECK (net_income >= 0),
  status TEXT NOT NULL DEFAULT 'requested'
         CHECK (status IN (
           'requested',
           'awaiting_payment',
           'paid',
           'item_sent',
           'item_received',
           'item_returned',
           'completed',
           'cancelled',
           'cancelled_by_renter',
           'rejected_by_lender',
           'awaiting_additional_payment'
         )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_order_dates CHECK (end_date >= start_date)
);

CREATE TRIGGER trg_rentalorder_updated_at
  BEFORE UPDATE ON public.rentalorder
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Exclusion constraint (lock dates only when lender approves)
ALTER TABLE public.rentalorder
  ADD CONSTRAINT no_overlapping_active_bookings
  EXCLUDE USING gist (
    item_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('awaiting_payment', 'paid', 'item_sent', 'item_received', 'item_returned', 'awaiting_additional_payment'));

-- RentalEvidenceImage
CREATE TABLE public.rentalevidenceimage (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.rentalorder(order_id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE RESTRICT,
  image_url TEXT NOT NULL,
  evidence_type TEXT NOT NULL
                CHECK (evidence_type IN ('renter_before', 'renter_after', 'lender_before', 'lender_after')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment
CREATE TABLE public.payment (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.rentalorder(order_id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) CHECK (amount >= 0),
  slip_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending', 'paid', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Review
CREATE TABLE public.review (
  review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.rentalorder(order_id) ON DELETE RESTRICT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ReviewImage
CREATE TABLE public.reviewimage (
  review_image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.review(review_id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RentalReportType
CREATE TABLE public.rentalreporttype (
  report_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_name TEXT NOT NULL UNIQUE
);

-- RentalReport
CREATE TABLE public.rentalreport (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.rentalorder(order_id) ON DELETE RESTRICT,
  reporter_id UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE RESTRICT,
  report_type_id UUID NOT NULL REFERENCES public.rentalreporttype(report_type_id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_investigation'
         CHECK (status IN ('pending_investigation', 'resolved_renter_fault', 'resolved_lender_fault', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RentalReportImage
CREATE TABLE public.rentalreportimage (
  report_image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.rentalreport(report_id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ChatRoom
CREATE TABLE public.chatroom (
  chat_room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_different_users CHECK (user_a <> user_b),
  UNIQUE (user_a, user_b)
);

-- Message
CREATE TABLE public.message (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id UUID NOT NULL REFERENCES public.chatroom(chat_room_id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.rentalorder(order_id) ON DELETE SET NULL,
  sender_id UUID NOT NULL REFERENCES public.useraccount(user_id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Test Results Table
CREATE TABLE public.test_results (
  test_no INTEGER PRIMARY KEY,
  test_name TEXT NOT NULL,
  result TEXT NOT NULL,
  detail TEXT
);

-- ==============================================================================
-- 4. BUSINESS LOGIC FUNCTIONS (RPC)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignment ura
    JOIN public.role r ON r.role_id = ura.role_id
    WHERE ura.user_id = auth.uid() AND r.role_type = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.create_item_listing(
  p_user_id            UUID,
  p_category_id        UUID,
  p_item_name          TEXT,
  p_description        TEXT,
  p_original_price     NUMERIC,
  p_rental_fee_per_day NUMERIC,
  p_deposit            NUMERIC,
  p_images             JSONB,
  p_locations          JSONB,
  p_availability_start DATE,
  p_availability_end   DATE,
  p_conditions         TEXT[]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.upload_rental_evidence(
  p_order_id      UUID,
  p_user_id       UUID,
  p_evidence_type TEXT,
  p_image_urls    TEXT[],
  p_new_status    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_renter_id UUID;
  v_lender_id UUID;
  v_url       TEXT;
BEGIN
  IF p_user_id <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์อัปโหลดหลักฐานแทนผู้ใช้คนอื่น';
  END IF;

  SELECT ro.user_id, it.user_id
  INTO v_renter_id, v_lender_id
  FROM public.rentalorder ro
  JOIN public.item it ON it.item_id = ro.item_id
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
    UPDATE public.rentalorder
    SET status = p_new_status, updated_at = NOW()
    WHERE order_id = p_order_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_rental_order(
  p_order_id      UUID,
  p_lender_id     UUID,
  p_damage_fee    NUMERIC DEFAULT 0,
  p_late_fee      NUMERIC DEFAULT 0
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    UPDATE public.rentalorder
    SET status = 'completed', updated_at = NOW()
    WHERE order_id = p_order_id;

    INSERT INTO public.payment (order_id, user_id, amount, status)
    VALUES (p_order_id, v_order.user_id, v_refund_amount, 'paid');

    RETURN 'completed_no_damage';

  ELSIF v_total_deduct <= v_order.deposit THEN
    v_refund_amount := v_order.deposit - v_total_deduct;
    UPDATE public.rentalorder
    SET status = 'completed', updated_at = NOW()
    WHERE order_id = p_order_id;

    IF v_refund_amount > 0 THEN
      INSERT INTO public.payment (order_id, user_id, amount, status)
      VALUES (p_order_id, v_order.user_id, v_refund_amount, 'paid');
    END IF;

    RETURN 'completed_with_deduction:' || v_refund_amount;

  ELSE
    v_extra_charge := v_total_deduct - v_order.deposit;
    UPDATE public.rentalorder
    SET status = 'awaiting_additional_payment', updated_at = NOW()
    WHERE order_id = p_order_id;

    INSERT INTO public.payment (order_id, user_id, amount, status)
    VALUES (p_order_id, v_order.user_id, v_extra_charge, 'pending');

    RETURN 'awaiting_additional_payment:' || v_extra_charge;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_rental_review(
  p_order_id  UUID,
  p_user_id   UUID,
  p_rating    INTEGER,
  p_comment   TEXT,
  p_images    TEXT[] DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_renter_id   UUID;
  v_order_status TEXT;
  v_review_id   UUID;
  v_img         TEXT;
BEGIN
  IF p_user_id <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์เขียนรีวิวแทนผู้ใช้คนอื่น';
  END IF;

  SELECT user_id, status
  INTO v_renter_id, v_order_status
  FROM public.rentalorder
  WHERE order_id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบ order: %', p_order_id;
  END IF;

  IF v_renter_id <> p_user_id THEN
    RAISE EXCEPTION 'ไม่ใช่ผู้เช่าของ order นี้';
  END IF;

  IF v_order_status <> 'completed' THEN
    RAISE EXCEPTION 'รีวิวได้เฉพาะ order ที่เสร็จสมบูรณ์แล้วและเป็นของคุณเท่านั้น';
  END IF;

  INSERT INTO public.review (order_id, rating, comment)
  VALUES (p_order_id, p_rating, p_comment)
  RETURNING review_id INTO v_review_id;

  FOREACH v_img IN ARRAY p_images LOOP
    INSERT INTO public.reviewimage (review_id, image_url) VALUES (v_review_id, v_img);
  END LOOP;

  RETURN v_review_id;
END;
$$;

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.role ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_select_all ON public.role FOR SELECT USING (true);

ALTER TABLE public.useraccount ENABLE ROW LEVEL SECURITY;
CREATE POLICY useraccount_select_all ON public.useraccount FOR SELECT USING (true);
CREATE POLICY useraccount_insert_self ON public.useraccount FOR INSERT WITH CHECK (true);
CREATE POLICY useraccount_update_own_or_admin ON public.useraccount FOR UPDATE USING (user_id = auth.uid() OR is_admin());

ALTER TABLE public.userphones ENABLE ROW LEVEL SECURITY;
CREATE POLICY userphones_select ON public.userphones FOR SELECT USING (true);
CREATE POLICY userphones_write ON public.userphones FOR ALL USING (user_id = auth.uid() OR is_admin());

ALTER TABLE public.bankaccount ENABLE ROW LEVEL SECURITY;
CREATE POLICY bankaccount_all ON public.bankaccount FOR ALL USING (user_id = auth.uid() OR is_admin());

ALTER TABLE public.user_role_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY roleassign_select ON public.user_role_assignment FOR SELECT USING (true);
CREATE POLICY roleassign_all ON public.user_role_assignment FOR ALL USING (user_id = auth.uid() OR is_admin());

ALTER TABLE public.itemcategory ENABLE ROW LEVEL SECURITY;
CREATE POLICY itemcategory_select_all ON public.itemcategory FOR SELECT USING (true);
CREATE POLICY itemcategory_write ON public.itemcategory FOR ALL USING (is_admin());

ALTER TABLE public.item ENABLE ROW LEVEL SECURITY;
CREATE POLICY item_select_all ON public.item FOR SELECT USING (true);
CREATE POLICY item_write ON public.item FOR ALL USING (user_id = auth.uid() OR is_admin());

ALTER TABLE public.itemcondition ENABLE ROW LEVEL SECURITY;
CREATE POLICY itemcondition_select_all ON public.itemcondition FOR SELECT USING (true);
CREATE POLICY itemcondition_write ON public.itemcondition FOR ALL USING (true);

ALTER TABLE public.itemlocation ENABLE ROW LEVEL SECURITY;
CREATE POLICY itemlocation_select_all ON public.itemlocation FOR SELECT USING (true);
CREATE POLICY itemlocation_write ON public.itemlocation FOR ALL USING (true);

ALTER TABLE public.itemimage ENABLE ROW LEVEL SECURITY;
CREATE POLICY itemimage_select_all ON public.itemimage FOR SELECT USING (true);
CREATE POLICY itemimage_write ON public.itemimage FOR ALL USING (true);

ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY availability_select_all ON public.availability FOR SELECT USING (true);
CREATE POLICY availability_write ON public.availability FOR ALL USING (true);

ALTER TABLE public.rentalorder ENABLE ROW LEVEL SECURITY;
CREATE POLICY rentalorder_select_all ON public.rentalorder FOR SELECT USING (true);
CREATE POLICY rentalorder_write ON public.rentalorder FOR ALL USING (true);

ALTER TABLE public.rentalevidenceimage ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_all ON public.rentalevidenceimage FOR ALL USING (true);

ALTER TABLE public.payment ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_all ON public.payment FOR ALL USING (true);

ALTER TABLE public.review ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_select_all ON public.review FOR SELECT USING (true);
CREATE POLICY review_write ON public.review FOR ALL USING (true);

ALTER TABLE public.reviewimage ENABLE ROW LEVEL SECURITY;
CREATE POLICY reviewimage_all ON public.reviewimage FOR ALL USING (true);

ALTER TABLE public.rentalreporttype ENABLE ROW LEVEL SECURITY;
CREATE POLICY reporttype_select_all ON public.rentalreporttype FOR SELECT USING (true);

ALTER TABLE public.rentalreport ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_all ON public.rentalreport FOR ALL USING (true);

ALTER TABLE public.rentalreportimage ENABLE ROW LEVEL SECURITY;
CREATE POLICY reportimage_all ON public.rentalreportimage FOR ALL USING (true);

ALTER TABLE public.chatroom ENABLE ROW LEVEL SECURITY;
CREATE POLICY chatroom_all ON public.chatroom FOR ALL USING (true);

ALTER TABLE public.message ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_all ON public.message FOR ALL USING (true);

ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_results_select_all ON public.test_results FOR SELECT USING (true);

-- ==============================================================================
-- 6. SEED AUTH USERS (บัญชีสำหรับล็อกอินบน Cloud)
-- ==============================================================================
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token
) VALUES
(
  '00000000-0000-0000-0000-000000000000',
  '8a88d60a-e2cf-43a6-b4ea-baa9347bfee1',
  'authenticated', 'authenticated',
  'rommanlnw68@chaochao.local', crypt('Password68', gen_salt('bf')), NOW(),
  '{"provider":"email","providers":["email"]}', '{"username":"romanlnw68","signup_role":"renter"}',
  NOW(), NOW(), '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'b5041d3d-ba07-4230-96fa-3fbfb4411439',
  'authenticated', 'authenticated',
  'yoklnw67@chaochao.local', crypt('Password67', gen_salt('bf')), NOW(),
  '{"provider":"email","providers":["email"]}', '{"username":"yoklnw67","signup_role":"lender"}',
  NOW(), NOW(), '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  'b6f3e426-ba65-4b9e-becd-820e4d65d146',
  'authenticated', 'authenticated',
  'fantalnw66@chaochao.local', crypt('Password66', gen_salt('bf')), NOW(),
  '{"provider":"email","providers":["email"]}', '{"username":"fantalnw66","signup_role":"lender"}',
  NOW(), NOW(), '', ''
)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 7. SEED DATA (ข้อมูลภาษาไทยที่ถูกต้อง 100%)
-- ==============================================================================

-- Role
INSERT INTO public.role (role_id, role_type) VALUES
('5674b752-9a19-4679-9f69-fb3f02b26d03', 'admin'),
('dff91a27-27c9-420e-902a-bb4cd96612ed', 'renter'),
('f2c593f7-8479-416e-b08e-352a37727b9e', 'lender')
ON CONFLICT (role_id) DO NOTHING;

-- UserAccount
INSERT INTO public.useraccount (user_id, national_id, username, email, firstname, lastname, status, created_at, updated_at, bio, avatar_url, banner_url) VALUES
('8a88d60a-e2cf-43a6-b4ea-baa9347bfee1', '6767676767676', 'romanlnw68', 'rommanlnw68@chaochao.local', 'โรมัน', 'ผู้เช่า', 'Active', '2026-08-22 06:58:26.972531+00', '2026-08-25 12:10:00+00', 'ยินดีที่ได้ร่วมเช่าของกับทุกคนครับ', '/api/avatar?id=8a88d60a-e2cf-43a6-b4ea-baa9347bfee1', NULL),
('b5041d3d-ba07-4230-96fa-3fbfb4411439', '1234567890123', 'yoklnw67', 'yoklnw67@chaochao.local', 'หยก', 'ผู้ให้เช่า', 'Active', '2026-08-22 07:44:22.06373+00', '2026-08-25 12:10:00+00', 'มีอุปกรณ์คุณภาพพร้อมส่งต่อความสุขครับ', '/api/avatar?id=b5041d3d-ba07-4230-96fa-3fbfb4411439', NULL),
('b6f3e426-ba65-4b9e-becd-820e4d65d146', '6666666666666', 'fantalnw66', 'fantalnw66@chaochao.local', 'แฟนต้า', 'สายลุย', 'Active', '2026-08-22 19:34:03.745712+00', '2026-08-25 12:10:00+00', 'ชอบท่องเที่ยวและแชร์อุปกรณ์ดีๆ', '/api/avatar?id=b6f3e426-ba65-4b9e-becd-820e4d65d146', NULL)
ON CONFLICT (user_id) DO NOTHING;

-- UserPhones
INSERT INTO public.userphones (user_id, phone) VALUES
('8a88d60a-e2cf-43a6-b4ea-baa9347bfee1', '0812345678'),
('b5041d3d-ba07-4230-96fa-3fbfb4411439', '0898765432'),
('b6f3e426-ba65-4b9e-becd-820e4d65d146', '0865554433')
ON CONFLICT (user_id, phone) DO NOTHING;

-- User_Role_Assignment
INSERT INTO public.user_role_assignment (role_id, user_id, created_at, assigned_at) VALUES
('f2c593f7-8479-416e-b08e-352a37727b9e', 'b5041d3d-ba07-4230-96fa-3fbfb4411439', '2026-08-22 07:44:22.06373+00', '2026-08-22 07:44:22.06373+00'),
('dff91a27-27c9-420e-902a-bb4cd96612ed', '8a88d60a-e2cf-43a6-b4ea-baa9347bfee1', '2026-08-22 06:58:26.972531+00', '2026-08-22 06:58:26.972531+00'),
('f2c593f7-8479-416e-b08e-352a37727b9e', 'b6f3e426-ba65-4b9e-becd-820e4d65d146', '2026-08-22 19:34:03.745712+00', '2026-08-22 19:34:03.745712+00'),
('dff91a27-27c9-420e-902a-bb4cd96612ed', 'b6f3e426-ba65-4b9e-becd-820e4d65d146', '2026-08-22 19:34:03.745712+00', '2026-08-22 19:34:03.745712+00')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- BankAccount
INSERT INTO public.bankaccount (bank_account_id, user_id, bank_name, account_number, account_name, is_default, created_at) VALUES
('11111111-1111-1111-1111-111111111111', 'b5041d3d-ba07-4230-96fa-3fbfb4411439', 'กสิกรไทย', '123-4-56789-0', 'หยก มีทรัพย์', true, '2026-08-22 07:44:22+00'),
('22222222-2222-2222-2222-222222222222', 'b6f3e426-ba65-4b9e-becd-820e4d65d146', 'ไทยพาณิชย์', '987-6-54321-0', 'แฟนต้า รวยจริง', true, '2026-08-22 19:34:03+00')
ON CONFLICT (bank_account_id) DO NOTHING;

-- ItemCategory
INSERT INTO public.itemcategory (category_id, category_name, created_at) VALUES
('c1111111-1111-1111-1111-111111111111', 'กล้องและอุปกรณ์ถ่ายภาพ', '2026-08-01 10:00:00+00'),
('c2222222-2222-2222-2222-222222222222', 'อุปกรณ์แคมป์ปิ้ง', '2026-08-01 10:00:00+00'),
('c3333333-3333-3333-3333-333333333333', 'เครื่องมือช่าง', '2026-08-01 10:00:00+00'),
('c4444444-4444-4444-4444-444444444444', 'อุปกรณ์เสียงและดนตรี', '2026-08-01 10:00:00+00'),
('f1ab8e4c-93e8-4fda-9725-cd24df042a5d', 'โทรศัพท์', '2026-08-25 16:42:16.854107+00')
ON CONFLICT (category_id) DO NOTHING;

-- Item
INSERT INTO public.item (item_id, user_id, category_id, item_name, description, original_price, rental_fee_per_day, deposit, status, created_at, updated_at) VALUES
('d1111111-1111-1111-1111-111111111111', 'b5041d3d-ba07-4230-96fa-3fbfb4411439', 'c1111111-1111-1111-1111-111111111111', 'กล้อง Sony Alpha 7 IV พร้อมเลนส์ 28-70mm', 'กล้องฟูลเฟรมยอดนิยมสำหรับงานภาพนิ่งและวิดีโอ 4K เซนเซอร์ 33MP ระบบโฟกัสแม่นยำ พร้อมแบตเตอรี่แท้ 2 ก้อน', 85000.00, 950.00, 15000.00, 'available', '2026-08-20 09:00:00+00', '2026-08-20 09:00:00+00'),
('d2222222-2222-2222-2222-222222222222', 'b5041d3d-ba07-4230-96fa-3fbfb4411439', 'c2222222-2222-2222-2222-222222222222', 'เต็นท์แคมป์ปิ้ง Vidalido สำหรับ 4 คน พร้อมฟลายชีท', 'เต็นท์กางอัตโนมัติ ขนาดใหญ่ กว้างขวาง กันน้ำกันแดดดีเยี่ยม เหมาะสำหรับการตั้งแคมป์ครอบครัวหรือกลุ่มเพื่อน', 6500.00, 350.00, 2000.00, 'available', '2026-08-20 10:00:00+00', '2026-08-20 10:00:00+00'),
('d3333333-3333-3333-3333-333333333333', 'b6f3e426-ba65-4b9e-becd-820e4d65d146', 'c4444444-4444-4444-4444-444444444444', 'ไมโครโฟนไร้สาย DJI Mic 2 (2 TX + 1 RX)', 'ชุดไมค์ไร้สายคุณภาพเสียงคมชัด บันทึกเสียงภายในตัวได้ มีระบบตัดเสียงรบกวน เหมาะสำหรับงานถ่าย Vlog และสัมภาษณ์', 13500.00, 400.00, 3000.00, 'available', '2026-08-21 08:30:00+00', '2026-08-21 08:30:00+00'),
('d4444444-4444-4444-4444-444444444444', 'b5041d3d-ba07-4230-96fa-3fbfb4411439', 'c3333333-3333-3333-3333-333333333333', 'ชุดสว่านกระแทกไร้สาย Bosch 18V พร้อมแบตเตอรี่', 'สว่านกระแทกไร้สายกำลังสูง เจาะปูน ไม้ เหล็ก ได้สบาย พร้อมแบตเตอรี่ 2 ก้อน แท่นชาร์จเร็ว และชุดดอกสว่านพื้นฐาน', 4500.00, 180.00, 1500.00, 'available', '2026-08-21 11:00:00+00', '2026-08-21 11:00:00+00')
ON CONFLICT (item_id) DO NOTHING;

-- ItemCondition
INSERT INTO public.itemcondition (item_id, seq, condition) VALUES
('d1111111-1111-1111-1111-111111111111', 1, 'สภาพใหม่ ไม่มีรอยขีดข่วน ใช้งานปกติ 100%'),
('d2222222-2222-2222-2222-222222222222', 1, 'ผ้าใบกันน้ำสมบูรณ์ เสาเต็นท์ครบ ไม่มีรอยฉีกขาด'),
('d3333333-3333-3333-3333-333333333333', 1, 'อุปกรณ์ครบกล่อง แบตเตอรี่อึด ใช้งานได้ยาวนาน'),
('d4444444-4444-4444-4444-444444444444', 1, 'สว่านพลังแรง พร้อมดอกสว่านครบชุด')
ON CONFLICT (item_id, seq) DO NOTHING;

-- ItemLocation (Clean Thai)
INSERT INTO public.itemlocation (location_id, item_id, description, no, alley, road, subdistrict, district, province, created_at) VALUES
('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'BTS สยาม / สยามพารากอน', '123/45', 'ซอย 5', 'พระราม 1', 'ปทุมวัน', 'ปทุมวัน', 'กรุงเทพมหานคร', '2026-08-20 09:00:00+00'),
('22222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'ฟิวเจอร์พาร์ค รังสิต', '88/9', 'ซอยรังสิต 2', 'พหลโยธิน', 'ประชาธิปัตย์', 'ธัญบุรี', 'ปทุมธานี', '2026-08-20 10:00:00+00'),
('33333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333', 'เซ็นทรัล ลาดพร้าว / MRT พหลโยธิน', '55/12', 'ซอย 71', 'ลาดพร้าว', 'สะพานสอง', 'วังทองหลาง', 'กรุงเทพมหานคร', '2026-08-21 08:30:00+00'),
('44444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'BTS ช่องนนทรี / สาทร', '99', NULL, 'สาทรเหนือ', 'สีลม', 'บางรัก', 'กรุงเทพมหานคร', '2026-08-21 11:00:00+00')
ON CONFLICT (location_id) DO NOTHING;

-- ItemImage
INSERT INTO public.itemimage (image_id, item_id, is_primary, sequence, image_url, created_at) VALUES
('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', true, 1, 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800', '2026-08-20 09:00:00+00'),
('22222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', true, 1, 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800', '2026-08-20 10:00:00+00'),
('33333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333', true, 1, 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800', '2026-08-21 08:30:00+00'),
('44444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', true, 1, 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800', '2026-08-21 11:00:00+00')
ON CONFLICT (image_id) DO NOTHING;

-- Availability
INSERT INTO public.availability (availability_id, item_id, start_date, end_date, created_at) VALUES
('11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', '2026-08-20', '2026-12-31', '2026-08-20 09:00:00+00'),
('22222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', '2026-08-20', '2026-12-31', '2026-08-20 10:00:00+00'),
('33333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333', '2026-08-21', '2026-12-31', '2026-08-21 08:30:00+00'),
('44444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', '2026-08-21', '2026-12-31', '2026-08-21 11:00:00+00')
ON CONFLICT (availability_id) DO NOTHING;

-- RentalOrder
INSERT INTO public.rentalorder (order_id, user_id, item_id, meetup_location, return_location, start_date, end_date, rental_fee, deposit, total_paid, fee, net_income, status, created_at, updated_at) VALUES
('11111111-1111-1111-1111-111111111111', '8a88d60a-e2cf-43a6-b4ea-baa9347bfee1', 'd1111111-1111-1111-1111-111111111111', 'BTS สยาม', 'BTS สยาม', '2026-08-20', '2026-08-22', 1900.00, 15000.00, 16900.00, 95.00, 1805.00, 'completed', '2026-08-19 10:00:00+00', '2026-08-22 18:00:00+00'),
('22222222-2222-2222-2222-222222222222', '8a88d60a-e2cf-43a6-b4ea-baa9347bfee1', 'd4444444-4444-4444-4444-444444444444', 'BTS ช่องนนทรี', 'BTS ช่องนนทรี', '2026-08-25', '2026-08-27', 360.00, 1500.00, 1860.00, 18.00, 342.00, 'paid', '2026-08-22 11:00:00+00', '2026-08-22 14:00:00+00'),
('33333333-3333-3333-3333-333333333333', '8a88d60a-e2cf-43a6-b4ea-baa9347bfee1', 'd2222222-2222-2222-2222-222222222222', 'ฟิวเจอร์พาร์ค รังสิต', 'ฟิวเจอร์พาร์ค รังสิต', '2026-08-24', '2026-08-26', 1050.00, 2000.00, 3050.00, 52.50, 997.50, 'item_sent', '2026-08-23 15:00:00+00', '2026-08-24 09:00:00+00')
ON CONFLICT (order_id) DO NOTHING;

-- Review
INSERT INTO public.review (review_id, order_id, rating, comment, created_at, updated_at) VALUES
('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 5, 'กล้องสภาพดีมาก เจ้าของนัดหมายตรงเวลา แนะนำเลยครับ', '2026-08-22 19:00:00+00', '2026-08-22 19:00:00+00')
ON CONFLICT (review_id) DO NOTHING;

-- ChatRoom
INSERT INTO public.chatroom (chat_room_id, user_a, user_b, created_at) VALUES
('c33e5d30-5b58-4fa2-8022-8c3d21db1189', '8a88d60a-e2cf-43a6-b4ea-baa9347bfee1', 'b5041d3d-ba07-4230-96fa-3fbfb4411439', '2026-08-22 08:00:00+00'),
('77e0037c-3ddd-4c24-b2dc-5927c61af2ad', 'b5041d3d-ba07-4230-96fa-3fbfb4411439', 'b6f3e426-ba65-4b9e-becd-820e4d65d146', '2026-08-22 20:00:00+00')
ON CONFLICT (chat_room_id) DO NOTHING;

-- Message (Clean Thai)
INSERT INTO public.message (message_id, chat_room_id, order_id, sender_id, type, content, is_read, created_at) VALUES
('d4da6dd4-ba88-47ef-93c9-9057db9b4a23', 'c33e5d30-5b58-4fa2-8022-8c3d21db1189', NULL, '8a88d60a-e2cf-43a6-b4ea-baa9347bfee1', 'text', 'สวัสดีครับ สนใจเช่ากล้องช่วง 20-23 ก.ค. นี้ครับ ว่างไหมครับ', true, '2026-08-22 08:05:00+00'),
('8e08c786-5ba6-451f-8df3-1b5153d0c5df', 'c33e5d30-5b58-4fa2-8022-8c3d21db1189', NULL, 'b5041d3d-ba07-4230-96fa-3fbfb4411439', 'text', 'ได้ครับ พรุ่งนี้เจอกันตามนัดเลยครับ', true, '2026-08-22 08:10:00+00')
ON CONFLICT (message_id) DO NOTHING;

-- RentalReportType
INSERT INTO public.rentalreporttype (report_type_id, type_name) VALUES
('2a039a6d-0e2f-4723-b39f-2baadba974a6', 'lender_no_show'),
('66f2f819-72e2-432f-90b1-09c0bf848f4f', 'renter_no_show'),
('edf17f01-2b1e-4e50-9455-b46173d4c2ba', 'damaged_item'),
('d8674f02-48dc-43c0-affb-27b188d788c6', 'false_advertisement'),
('8534106d-55af-45a9-b8a5-d96266c7cd4c', 'other')
ON CONFLICT (report_type_id) DO NOTHING;

-- Test Results (Clean Thai)
INSERT INTO public.test_results (test_no, test_name, result, detail) VALUES
(1, 'กันจองสินค้าซ้อนวัน (EXCLUDE)', 'PASS', NULL),
(2, 'กันรูปปกซ้ำ (partial unique index)', 'PASS', NULL),
(3, 'กันบัญชี default ซ้ำ', 'PASS', NULL),
(4, 'กันห้องแชทซ้ำ', 'PASS', NULL),
(5, 'กันราคาติดลบ (CHECK)', 'PASS', NULL),
(6, 'กัน end_date ผิดลำดับ (CHECK)', 'PASS', NULL),
(7, 'กันลบ user ที่ยังมีสินค้า (RESTRICT)', 'PASS', NULL),
(8, 'กันรีวิวซ้ำ order เดิม (UNIQUE)', 'PASS', NULL),
(9, 'กันแชทกับตัวเอง (CHECK)', 'PASS', NULL),
(10, 'trigger set_updated_at()', 'PASS', NULL),
(11, 'trigger on_auth_user_created', 'PASS', NULL),
(12, 'settle_rental_order (ไม่มีความเสียหาย)', 'PASS', 'completed_no_damage'),
(13, 'settle_rental_order (มัดจำไม่พอ)', 'PASS', 'awaiting_additional_payment:2000.00'),
(14, 'submit_review บล็อก order ไม่ completed', 'PASS', 'รีวิวได้เฉพาะ order ที่เสร็จสมบูรณ์แล้วและเป็นของคุณเท่านั้น'),
(15, 'resolve_dispute บล็อกคนที่ไม่ใช่ admin', 'PASS', 'เฉพาะแอดมินเท่านั้นที่ตัดสินข้อพิพาทได้'),
(16, 'RLS: mint มองไม่เห็นบัญชีคนอื่น', 'PASS', NULL),
(17, 'RLS: mint แก้สินค้าคนอื่นไม่ได้', 'PASS', NULL),
(18, 'RLS: admin เห็นทุกบัญชี', 'PASS', '2 แถว')
ON CONFLICT (test_no) DO NOTHING;
