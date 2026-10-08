-- ============================================================================
-- full_install.sql — ติดตั้งฐานข้อมูล ChaoChao ทั้งหมดในไฟล์เดียว
--
-- ใช้ทำอะไร : สร้างโปรเจกต์ Supabase ใหม่ (dev / staging / เครื่องเพื่อนร่วมทีม)
--             ให้มีโครงสร้างเหมือน production ทุกประการ
-- ห้ามรัน   : บน production ที่มีอยู่แล้ว (ไฟล์นี้สร้างตารางใหม่ทั้งหมด จะ error)
--             และไม่ต้องรันร่วมกับไฟล์เรียงเลขใน supabase/migrations/ (ไฟล์นี้รวมไว้แล้ว)
--
-- วิธีใช้   : Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
--             (รันได้ครั้งเดียวต่อโปรเจกต์ใหม่ที่ยังว่าง)
--
-- ที่มา     : สร้างจากสภาพ "สุดท้าย" ของ production (ไม่ใช่การเล่นซ้ำประวัติ migration)
--             แล้วทดสอบรันบน Postgres ว่าง และเทียบโครงสร้างกับ production จริงด้วย hash
--             (ตาราง/คอลัมน์/constraint/index/policy/trigger/function) ตรงกันทุกรายการ
--             ยกเว้นตาราง test_results ที่เป็นตารางเทสต์ตอนพัฒนา ไม่ได้ใส่ไว้
--
-- สิ่งที่รวมไว้ :
--   1. extension   2. ตาราง+constraint+index   3. function (RPC/trigger/helper)
--   4. trigger     5. RLS + policy              6. seed data (role, หมวดสินค้า ฯลฯ)
--   7. storage bucket 4 ตัว                      8. cron 2 งาน (pg_cron)
--
-- สิ่งที่ "ไม่ได้" ทำให้ (ต้องทำเองหลังติดตั้ง) :
--   - สร้างผู้ใช้แอดมินคนแรก (ดูตัวอย่างท้ายไฟล์)
--   - เปิด Realtime ให้ตาราง (ของจริงยังปิดอยู่ ดูท้ายไฟล์)
--   - ตั้ง env ของแอป (.env.local) ให้ชี้ไปโปรเจกต์ใหม่
--
-- หมายเหตุ  : ไฟล์ 07_baseline_actual_schema.sql เดิมไม่ตรงกับ production 100%
--             (ขาด numeric(12,2), กฎ ON DELETE ของ FK, CHECK บางตัว,
--              unique index รูปหลักของสินค้า, ลำดับคอลัมน์ PK ของ user_role_assignment)
--             ไฟล์นี้แก้ให้ตรงของจริงแล้ว
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) EXTENSION
-- ----------------------------------------------------------------------------
-- btree_gist: จำเป็นสำหรับ EXCLUDE constraint กันจองสินค้าซ้อนวัน (no_overlapping_active_bookings)
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
-- pg_cron: ใช้ตั้งงานอัตโนมัติ (ตรวจออเดอร์หมดเวลา, แจ้งเตือนล่วงหน้า)
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- (ถ้าบรรทัดนี้ error ให้เปิด pg_cron ที่ Dashboard → Database → Extensions ก่อน แล้วรันไฟล์ใหม่)

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
-- function บางตัวอ้างตารางที่ยังไม่ถูกสร้างในลำดับของไฟล์ ต้องปิดการตรวจ body ชั่วคราว
SET check_function_bodies = false;

-- ----------------------------------------------------------------------------
-- 1-5) โครงสร้าง: function, ตาราง, constraint, index, trigger, RLS, policy
--      (ส่วนนี้สร้างด้วย pg_dump จากฐานข้อมูลที่ตรงกับ production)
-- ----------------------------------------------------------------------------

--
-- Name: cancel_rental_order(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_rental_order(p_order_id uuid, p_caller_id uuid, p_caller_role text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order         public.rentalorder%ROWTYPE;
  v_lender_id     UUID;
  v_days_left     INT;
  v_renter_refund NUMERIC(12,2);
  v_platform_fee  NUMERIC(12,2) := 0;
  v_lender_income NUMERIC(12,2);
  v_new_status    TEXT;
BEGIN
  SELECT ro.* INTO v_order FROM public.rentalorder ro WHERE ro.order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบ order: %', p_order_id;
  END IF;

  SELECT user_id INTO v_lender_id FROM public.item WHERE item_id = v_order.item_id;

  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'ยกเลิกผ่านช่องทางนี้ได้เฉพาะ order ที่ชำระเงินแล้วเท่านั้น (สถานะปัจจุบัน: %)', v_order.status;
  END IF;

  IF CURRENT_DATE >= v_order.start_date THEN
    RAISE EXCEPTION 'ถึงวันนัดรับสินค้าแล้ว ไม่สามารถยกเลิกได้อีก';
  END IF;

  v_days_left := v_order.start_date - CURRENT_DATE;

  IF p_caller_role = 'renter' THEN
    IF p_caller_id <> v_order.user_id AND NOT is_admin() THEN
      RAISE EXCEPTION 'ไม่ใช่ผู้เช่าของ order นี้';
    END IF;

    IF v_days_left <= 2 THEN
      v_renter_refund := v_order.deposit;
      v_platform_fee  := ROUND(v_order.rental_fee * 0.10, 2);
      v_lender_income := v_order.rental_fee - v_platform_fee;
    ELSE
      v_renter_refund := v_order.deposit + v_order.rental_fee;
      v_platform_fee  := 0;
      v_lender_income := 0;
    END IF;
    v_new_status := 'cancelled_by_renter';

  ELSIF p_caller_role = 'lender' THEN
    IF p_caller_id <> v_lender_id AND NOT is_admin() THEN
      RAISE EXCEPTION 'ไม่ใช่ผู้ให้เช่าของ order นี้';
    END IF;
    v_renter_refund := v_order.deposit + v_order.rental_fee;
    v_lender_income := 0;
    v_new_status := 'cancelled_by_lender';

  ELSE
    RAISE EXCEPTION 'p_caller_role ต้องเป็น renter หรือ lender เท่านั้น';
  END IF;

  UPDATE public.rentalorder
  SET status = v_new_status, fee = v_platform_fee, net_income = v_lender_income, updated_at = NOW()
  WHERE order_id = p_order_id;

  INSERT INTO public.payment (order_id, user_id, amount, status)
  VALUES (p_order_id, v_order.user_id, v_renter_refund, 'refunded');

  RETURN v_new_status;
END;
$$;


--
-- Name: confirm_additional_payment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_additional_payment(p_payment_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: create_item_listing(uuid, uuid, text, text, numeric, numeric, numeric, jsonb, jsonb, date, date, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_item_listing(p_user_id uuid, p_category_id uuid, p_item_name text, p_description text, p_original_price numeric, p_rental_fee_per_day numeric, p_deposit numeric, p_images jsonb, p_locations jsonb, p_availability_start date, p_availability_end date, p_conditions text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    INSERT INTO public.itemlocation (item_id, description, no, alley, road, subdistrict, district, province, location_type)
    VALUES (v_item_id, v_loc->>'description', v_loc->>'no', v_loc->>'alley', v_loc->>'road',
            v_loc->>'subdistrict', v_loc->>'district', v_loc->>'province',
            COALESCE(v_loc->>'location_type', 'both'));
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


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignment ura
    JOIN public.role r ON r.role_id = ura.role_id
    WHERE ura.user_id = auth.uid() AND r.role_type = 'admin'
  );
$$;


--
-- Name: is_chat_participant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_chat_participant(p_chat_room_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chatroom
    WHERE chat_room_id = p_chat_room_id AND (user_a = auth.uid() OR user_b = auth.uid())
  );
$$;


--
-- Name: is_item_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_item_owner(p_item_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.item WHERE item_id = p_item_id AND user_id = auth.uid()
  );
$$;


--
-- Name: is_order_participant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_order_participant(p_order_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rentalorder ro
    JOIN public.item it ON it.item_id = ro.item_id
    WHERE ro.order_id = p_order_id
      AND (ro.user_id = auth.uid() OR it.user_id = auth.uid())
  );
$$;


--
-- Name: notify_new_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: notify_new_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_report() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: notify_order_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_order_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: notify_report_resolved(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_report_resolved() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: process_expired_orders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_expired_orders() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  r              RECORD;
  v_lender_came  BOOLEAN;
  v_renter_came  BOOLEAN;
BEGIN
  UPDATE rentalorder
  SET status = 'rejected_by_lender', updated_at = NOW()
  WHERE status = 'requested' AND created_at < NOW() - INTERVAL '8 hours';

  UPDATE rentalorder ro
  SET status = 'cancelled', updated_at = NOW()
  WHERE ro.status = 'awaiting_payment'
    AND ro.updated_at < NOW() - INTERVAL '8 hours'
        AND NOT EXISTS (
      SELECT 1 FROM payment p
      WHERE p.order_id = ro.order_id AND p.status IN ('pending', 'paid')
    );

  WITH auto_approved AS (
    UPDATE payment
    SET status = 'paid'
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '8 hours'
      AND order_id IN (SELECT order_id FROM rentalorder WHERE status = 'awaiting_payment')
    RETURNING order_id
  )
  UPDATE rentalorder
  SET status = 'paid', updated_at = NOW()
  WHERE order_id IN (SELECT order_id FROM auto_approved);

  FOR r IN
    SELECT ro.order_id, it.user_id AS lender_id
    FROM rentalorder ro
    JOIN item it ON it.item_id = ro.item_id
    WHERE ro.status = 'paid'
      AND (ro.start_date + COALESCE(ro.meetup_time, '00:00'::time) + INTERVAL '1 hour') < NOW()
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM rentalevidenceimage WHERE order_id = r.order_id AND evidence_type = 'lender_before'
    ) INTO v_lender_came;

    SELECT EXISTS (
      SELECT 1 FROM rentalevidenceimage WHERE order_id = r.order_id AND evidence_type = 'renter_before'
    ) INTO v_renter_came;

    IF NOT v_lender_came THEN
      PERFORM settle_rental_order(r.order_id, r.lender_id, 'lender_noshow');
    ELSIF NOT v_renter_came THEN
      PERFORM settle_rental_order(r.order_id, r.lender_id, 'renter_noshow');
    END IF;
  END LOOP;

  FOR r IN
    SELECT ro.order_id, it.user_id AS lender_id
    FROM rentalorder ro
    JOIN item it ON it.item_id = ro.item_id
    WHERE ro.status IN ('item_sent', 'item_received')
      AND (ro.end_date + COALESCE(ro.return_time, '00:00'::time) + INTERVAL '1 hour') < NOW()
      AND EXISTS (
        SELECT 1 FROM rentalevidenceimage WHERE order_id = ro.order_id AND evidence_type = 'renter_after'
      )
      AND NOT EXISTS (
        SELECT 1 FROM rentalevidenceimage WHERE order_id = ro.order_id AND evidence_type = 'lender_after'
      )
  LOOP
    PERFORM settle_rental_order(r.order_id, r.lender_id, 'happy');
  END LOOP;

  UPDATE useraccount ua
  SET status = 'Suspended', updated_at = NOW()
  FROM payment p
  JOIN rentalorder ro ON ro.order_id = p.order_id
  WHERE p.user_id = ua.user_id
    AND p.status = 'pending'
    AND p.created_at < NOW() - INTERVAL '48 hours'
    AND ro.status = 'awaiting_additional_payment';
END;
$$;


--
-- Name: send_reminder_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_reminder_notifications() RETURNS void
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


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: settle_rental_order(uuid, uuid, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settle_rental_order(p_order_id uuid, p_caller_id uuid, p_outcome text, p_damage_amount numeric DEFAULT 0) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order          public.rentalorder%ROWTYPE;
  v_lender_id      UUID;
  v_platform_fee   NUMERIC(12,2) := 0;
  v_lender_income  NUMERIC(12,2) := 0;
  v_renter_refund  NUMERIC(12,2) := 0;
  v_extra_charge   NUMERIC(12,2) := 0;
  v_new_status     TEXT;
BEGIN
  SELECT ro.* INTO v_order FROM public.rentalorder ro WHERE ro.order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบ order: %', p_order_id;
  END IF;

  SELECT user_id INTO v_lender_id FROM public.item WHERE item_id = v_order.item_id;

  IF p_caller_id <> v_order.user_id AND p_caller_id <> v_lender_id AND NOT is_admin() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ปิดยอด order นี้';
  END IF;

  CASE p_outcome
    WHEN 'happy', 'false_advertisement_rejected', 'item_not_returned_rejected' THEN
      v_renter_refund := v_order.deposit;
      v_platform_fee  := ROUND(v_order.rental_fee * 0.10, 2);
      v_lender_income := v_order.rental_fee - v_platform_fee;
      v_new_status := 'completed';

    WHEN 'damaged' THEN
      v_platform_fee := ROUND(v_order.rental_fee * 0.10, 2);
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
      v_platform_fee  := ROUND(v_order.rental_fee * 0.10, 2);
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
$$;


--
-- Name: submit_rental_review(uuid, uuid, integer, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_rental_review(p_order_id uuid, p_user_id uuid, p_rating integer, p_comment text, p_images text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: upload_rental_evidence(uuid, uuid, text, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upload_rental_evidence(p_order_id uuid, p_user_id uuid, p_evidence_type text, p_image_urls text[], p_new_status text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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




--
-- Name: availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability (
    availability_id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    CONSTRAINT chk_availability_dates CHECK ((end_date >= start_date))
);


--
-- Name: bankaccount; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bankaccount (
    bank_account_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    bank_name text NOT NULL,
    account_number text NOT NULL,
    account_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT bankaccount_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: cancellationtype; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cancellationtype (
    cancellation_type_id uuid DEFAULT gen_random_uuid() NOT NULL,
    cancellation_type text NOT NULL
);


--
-- Name: chatroom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatroom (
    chat_room_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_a uuid NOT NULL,
    user_b uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    order_id uuid,
    CONSTRAINT chk_different_users CHECK ((user_a <> user_b))
);


--
-- Name: item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item (
    item_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category_id uuid,
    item_name text NOT NULL,
    description text,
    original_price numeric(12,2),
    rental_fee_per_day numeric(12,2),
    deposit numeric(12,2),
    status text DEFAULT 'available'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rented integer DEFAULT 0 NOT NULL,
    average_rating numeric(3,2) DEFAULT 0 NOT NULL,
        item_condition text,
    CONSTRAINT item_deposit_check CHECK ((deposit >= (0)::numeric)),
        CONSTRAINT item_item_condition_check CHECK ((item_condition = ANY (ARRAY['like-new'::text, 'good'::text, 'fair'::text]))),
    CONSTRAINT item_original_price_check CHECK ((original_price >= (0)::numeric)),
    CONSTRAINT item_rental_fee_per_day_check CHECK ((rental_fee_per_day >= (0)::numeric)),
    CONSTRAINT item_status_check CHECK ((status = ANY (ARRAY['available'::text, 'rented'::text, 'maintenance'::text, 'inactive'::text])))
);


--
-- Name: itemcategory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itemcategory (
    category_id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itemcondition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itemcondition (
    item_id uuid NOT NULL,
    seq integer NOT NULL,
    condition text NOT NULL
);


--
-- Name: itemimage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itemimage (
    image_id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    sequence integer NOT NULL,
    image_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itemlocation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itemlocation (
    location_id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    description text NOT NULL,
    no text,
    alley text,
    road text,
    subdistrict text,
    district text,
    province text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    location_type text DEFAULT 'both'::text NOT NULL,
    CONSTRAINT itemlocation_location_type_check CHECK ((location_type = ANY (ARRAY['meetup'::text, 'return'::text, 'both'::text])))
);


--
-- Name: message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message (
    message_id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_room_id uuid NOT NULL,
    order_id uuid,
    sender_id uuid NOT NULL,
    type text DEFAULT 'text'::text NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification (
    notification_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    related_order_id uuid,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment (
    payment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(12,2),
    slip_image_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    date timestamp with time zone,
    transaction_ref text,
    CONSTRAINT payment_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payment_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'rejected'::text, 'refunded'::text])))
);


--
-- Name: rentalevidenceimage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rentalevidenceimage (
    evidence_id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    image_url text NOT NULL,
    evidence_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rentalevidenceimage_evidence_type_check CHECK ((evidence_type = ANY (ARRAY['renter_before'::text, 'renter_after'::text, 'lender_before'::text, 'lender_after'::text])))
);


--
-- Name: rentalorder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rentalorder (
    order_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    item_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    meetup_location text,
    return_location text,
    rental_fee numeric(12,2) NOT NULL,
    deposit numeric(12,2) NOT NULL,
    total_paid numeric(12,2),
    fee numeric(12,2),
    net_income numeric(12,2),
    status text DEFAULT 'requested'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    meetup_time time without time zone,
    return_time time without time zone,
    cancellation_fee numeric,
    damage_fee numeric,
    cancellation_type_id uuid,
    cancel_reason text,
    cancel_reason_image_url text,
    CONSTRAINT chk_order_dates CHECK ((end_date >= start_date)),
    CONSTRAINT rentalorder_cancellation_fee_check CHECK ((cancellation_fee >= (0)::numeric)),
    CONSTRAINT rentalorder_damage_fee_check CHECK ((damage_fee >= (0)::numeric)),
    CONSTRAINT rentalorder_deposit_check CHECK ((deposit >= (0)::numeric)),
    CONSTRAINT rentalorder_fee_check CHECK ((fee >= (0)::numeric)),
    CONSTRAINT rentalorder_net_income_check CHECK ((net_income >= (0)::numeric)),
    CONSTRAINT rentalorder_rental_fee_check CHECK ((rental_fee >= (0)::numeric)),
    CONSTRAINT rentalorder_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'awaiting_payment'::text, 'paid'::text, 'item_sent'::text, 'item_received'::text, 'item_returned'::text, 'completed'::text, 'cancelled'::text, 'cancelled_by_renter'::text, 'cancelled_by_lender'::text, 'rejected_by_lender'::text, 'awaiting_additional_payment'::text, 'renter_noshow'::text, 'lender_noshow'::text, 'rejected_at_meetup'::text, 'disputed_at_meetup'::text, 'refunded_dispute'::text, 'item_not_returned'::text]))),
    CONSTRAINT rentalorder_total_paid_check CHECK ((total_paid >= (0)::numeric))
);


--
-- Name: rentalreport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rentalreport (
    report_id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    reporter_id uuid NOT NULL,
    report_type_id uuid NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'pending_investigation'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verdict text,
    damage_amount numeric,
    reported_user_id uuid,
    CONSTRAINT rentalreport_damage_amount_check CHECK ((damage_amount >= (0)::numeric)),
    CONSTRAINT rentalreport_has_target CHECK (((order_id IS NOT NULL) OR (reported_user_id IS NOT NULL))),
    CONSTRAINT rentalreport_status_check CHECK ((status = ANY (ARRAY['pending_investigation'::text, 'resolved_renter_fault'::text, 'resolved_lender_fault'::text, 'dismissed'::text])))
);


--
-- Name: rentalreportimage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rentalreportimage (
    report_image_id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    image_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rentalreporttype; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rentalreporttype (
    report_type_id uuid DEFAULT gen_random_uuid() NOT NULL,
    type_name text NOT NULL
);


--
-- Name: review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review (
    review_id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lender_reply text,
    lender_reply_at timestamp with time zone,
    CONSTRAINT review_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: reviewimage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviewimage (
    review_image_id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    image_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role (
    role_id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_type text NOT NULL,
    CONSTRAINT role_role_type_check CHECK ((role_type = ANY (ARRAY['renter'::text, 'lender'::text, 'admin'::text])))
);


--
-- Name: user_role_assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_role_assignment (
    role_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: useraccount; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.useraccount (
    user_id uuid NOT NULL,
    national_id text,
    username text NOT NULL,
    email text NOT NULL,
    firstname text,
    lastname text,
    status text DEFAULT 'Active'::text NOT NULL,
    bio text,
    avatar_url text,
    banner_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    id_card_url text,
    id_card_selfie_url text,
    identity_verification_status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT useraccount_identity_verification_status_check CHECK ((identity_verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text]))),
    CONSTRAINT useraccount_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Suspended'::text, 'Banned'::text, 'Deactivated'::text])))
);


--
-- Name: availability availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_pkey PRIMARY KEY (availability_id);


--
-- Name: bankaccount bankaccount_one_per_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bankaccount
    ADD CONSTRAINT bankaccount_one_per_user UNIQUE (user_id);


--
-- Name: bankaccount bankaccount_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bankaccount
    ADD CONSTRAINT bankaccount_pkey PRIMARY KEY (bank_account_id);


--
-- Name: bankaccount bankaccount_user_id_account_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bankaccount
    ADD CONSTRAINT bankaccount_user_id_account_number_key UNIQUE (user_id, account_number);


--
-- Name: cancellationtype cancellationtype_cancellation_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cancellationtype
    ADD CONSTRAINT cancellationtype_cancellation_type_key UNIQUE (cancellation_type);


--
-- Name: cancellationtype cancellationtype_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cancellationtype
    ADD CONSTRAINT cancellationtype_pkey PRIMARY KEY (cancellation_type_id);


--
-- Name: chatroom chatroom_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatroom
    ADD CONSTRAINT chatroom_order_id_key UNIQUE (order_id);


--
-- Name: chatroom chatroom_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatroom
    ADD CONSTRAINT chatroom_pkey PRIMARY KEY (chat_room_id);


--
-- Name: item item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_pkey PRIMARY KEY (item_id);


--
-- Name: itemcategory itemcategory_category_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itemcategory
    ADD CONSTRAINT itemcategory_category_name_key UNIQUE (category_name);


--
-- Name: itemcategory itemcategory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itemcategory
    ADD CONSTRAINT itemcategory_pkey PRIMARY KEY (category_id);


--
-- Name: itemcondition itemcondition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itemcondition
    ADD CONSTRAINT itemcondition_pkey PRIMARY KEY (item_id, seq);


--
-- Name: itemimage itemimage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itemimage
    ADD CONSTRAINT itemimage_pkey PRIMARY KEY (image_id);


--
-- Name: itemlocation itemlocation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itemlocation
    ADD CONSTRAINT itemlocation_pkey PRIMARY KEY (location_id);


--
-- Name: message message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_pkey PRIMARY KEY (message_id);


--
-- Name: rentalorder no_overlapping_active_bookings; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalorder
    ADD CONSTRAINT no_overlapping_active_bookings EXCLUDE USING gist (item_id WITH =, daterange(start_date, end_date, '[]'::text) WITH &&) WHERE ((status = ANY (ARRAY['awaiting_payment'::text, 'paid'::text, 'item_sent'::text, 'item_received'::text, 'item_returned'::text, 'awaiting_additional_payment'::text, 'disputed_at_meetup'::text])));


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (notification_id);


--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (payment_id);


--
-- Name: rentalevidenceimage rentalevidenceimage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalevidenceimage
    ADD CONSTRAINT rentalevidenceimage_pkey PRIMARY KEY (evidence_id);


--
-- Name: rentalorder rentalorder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalorder
    ADD CONSTRAINT rentalorder_pkey PRIMARY KEY (order_id);


--
-- Name: rentalreport rentalreport_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalreport
    ADD CONSTRAINT rentalreport_pkey PRIMARY KEY (report_id);


--
-- Name: rentalreportimage rentalreportimage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalreportimage
    ADD CONSTRAINT rentalreportimage_pkey PRIMARY KEY (report_image_id);


--
-- Name: rentalreporttype rentalreporttype_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalreporttype
    ADD CONSTRAINT rentalreporttype_pkey PRIMARY KEY (report_type_id);


--
-- Name: rentalreporttype rentalreporttype_type_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalreporttype
    ADD CONSTRAINT rentalreporttype_type_name_key UNIQUE (type_name);


--
-- Name: review review_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT review_order_id_key UNIQUE (order_id);


--
-- Name: review review_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT review_pkey PRIMARY KEY (review_id);


--
-- Name: reviewimage reviewimage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviewimage
    ADD CONSTRAINT reviewimage_pkey PRIMARY KEY (review_image_id);


--
-- Name: role role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (role_id);


--
-- Name: role role_role_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_role_type_key UNIQUE (role_type);


--
-- Name: user_role_assignment user_role_assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignment
    ADD CONSTRAINT user_role_assignment_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: useraccount useraccount_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.useraccount
    ADD CONSTRAINT useraccount_email_key UNIQUE (email);


--
-- Name: useraccount useraccount_national_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.useraccount
    ADD CONSTRAINT useraccount_national_id_key UNIQUE (national_id);


--
-- Name: useraccount useraccount_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.useraccount
    ADD CONSTRAINT useraccount_pkey PRIMARY KEY (user_id);


--
-- Name: idx_itemimage_one_primary_per_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_itemimage_one_primary_per_item ON public.itemimage USING btree (item_id) WHERE (is_primary = true);


--
-- Name: item trg_item_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_item_updated_at BEFORE UPDATE ON public.item FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: message trg_notify_new_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_new_message AFTER INSERT ON public.message FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();


--
-- Name: rentalreport trg_notify_new_report; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_new_report AFTER INSERT ON public.rentalreport FOR EACH ROW EXECUTE FUNCTION public.notify_new_report();


--
-- Name: rentalorder trg_notify_order_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_order_status AFTER INSERT OR UPDATE ON public.rentalorder FOR EACH ROW EXECUTE FUNCTION public.notify_order_status_change();


--
-- Name: rentalreport trg_notify_report_resolved; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_report_resolved AFTER UPDATE ON public.rentalreport FOR EACH ROW EXECUTE FUNCTION public.notify_report_resolved();


--
-- Name: rentalorder trg_rentalorder_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rentalorder_updated_at BEFORE UPDATE ON public.rentalorder FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: useraccount trg_useraccount_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_useraccount_updated_at BEFORE UPDATE ON public.useraccount FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: availability availability_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item(item_id) ON DELETE CASCADE;


--
-- Name: bankaccount bankaccount_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bankaccount
    ADD CONSTRAINT bankaccount_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.useraccount(user_id) ON DELETE CASCADE;


--
-- Name: chatroom chatroom_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatroom
    ADD CONSTRAINT chatroom_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.rentalorder(order_id);


--
-- Name: chatroom chatroom_user_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatroom
    ADD CONSTRAINT chatroom_user_a_fkey FOREIGN KEY (user_a) REFERENCES public.useraccount(user_id) ON DELETE CASCADE;


--
-- Name: chatroom chatroom_user_b_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatroom
    ADD CONSTRAINT chatroom_user_b_fkey FOREIGN KEY (user_b) REFERENCES public.useraccount(user_id) ON DELETE CASCADE;


--
-- Name: item item_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.itemcategory(category_id) ON DELETE RESTRICT;


--
-- Name: item item_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.useraccount(user_id) ON DELETE RESTRICT;


--
-- Name: itemcondition itemcondition_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itemcondition
    ADD CONSTRAINT itemcondition_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item(item_id) ON DELETE CASCADE;


--
-- Name: itemimage itemimage_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itemimage
    ADD CONSTRAINT itemimage_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item(item_id) ON DELETE CASCADE;


--
-- Name: itemlocation itemlocation_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itemlocation
    ADD CONSTRAINT itemlocation_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item(item_id) ON DELETE CASCADE;


--
-- Name: message message_chat_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_chat_room_id_fkey FOREIGN KEY (chat_room_id) REFERENCES public.chatroom(chat_room_id) ON DELETE CASCADE;


--
-- Name: message message_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.rentalorder(order_id) ON DELETE SET NULL;


--
-- Name: message message_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.useraccount(user_id) ON DELETE CASCADE;


--
-- Name: notification notification_related_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_related_order_id_fkey FOREIGN KEY (related_order_id) REFERENCES public.rentalorder(order_id);


--
-- Name: notification notification_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.useraccount(user_id);


--
-- Name: payment payment_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.rentalorder(order_id) ON DELETE RESTRICT;


--
-- Name: payment payment_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.useraccount(user_id) ON DELETE RESTRICT;


--
-- Name: rentalevidenceimage rentalevidenceimage_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalevidenceimage
    ADD CONSTRAINT rentalevidenceimage_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.rentalorder(order_id) ON DELETE CASCADE;


--
-- Name: rentalevidenceimage rentalevidenceimage_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalevidenceimage
    ADD CONSTRAINT rentalevidenceimage_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.useraccount(user_id) ON DELETE RESTRICT;


--
-- Name: rentalorder rentalorder_cancellation_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalorder
    ADD CONSTRAINT rentalorder_cancellation_type_id_fkey FOREIGN KEY (cancellation_type_id) REFERENCES public.cancellationtype(cancellation_type_id);


--
-- Name: rentalorder rentalorder_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalorder
    ADD CONSTRAINT rentalorder_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.item(item_id) ON DELETE RESTRICT;


--
-- Name: rentalorder rentalorder_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalorder
    ADD CONSTRAINT rentalorder_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.useraccount(user_id) ON DELETE RESTRICT;


--
-- Name: rentalreport rentalreport_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalreport
    ADD CONSTRAINT rentalreport_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.rentalorder(order_id) ON DELETE RESTRICT;


--
-- Name: rentalreport rentalreport_report_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalreport
    ADD CONSTRAINT rentalreport_report_type_id_fkey FOREIGN KEY (report_type_id) REFERENCES public.rentalreporttype(report_type_id) ON DELETE RESTRICT;


--
-- Name: rentalreport rentalreport_reported_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalreport
    ADD CONSTRAINT rentalreport_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES public.useraccount(user_id);


--
-- Name: rentalreport rentalreport_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalreport
    ADD CONSTRAINT rentalreport_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.useraccount(user_id) ON DELETE RESTRICT;


--
-- Name: rentalreportimage rentalreportimage_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rentalreportimage
    ADD CONSTRAINT rentalreportimage_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.rentalreport(report_id) ON DELETE CASCADE;


--
-- Name: review review_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT review_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.rentalorder(order_id) ON DELETE RESTRICT;


--
-- Name: reviewimage reviewimage_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviewimage
    ADD CONSTRAINT reviewimage_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.review(review_id) ON DELETE CASCADE;


--
-- Name: user_role_assignment user_role_assignment_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignment
    ADD CONSTRAINT user_role_assignment_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role(role_id) ON DELETE RESTRICT;


--
-- Name: user_role_assignment user_role_assignment_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignment
    ADD CONSTRAINT user_role_assignment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.useraccount(user_id) ON DELETE CASCADE;


--
-- Name: availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

--
-- Name: availability availability_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY availability_select_all ON public.availability FOR SELECT USING (true);


--
-- Name: availability availability_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY availability_write ON public.availability USING ((public.is_item_owner(item_id) OR public.is_admin())) WITH CHECK ((public.is_item_owner(item_id) OR public.is_admin()));


--
-- Name: bankaccount; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bankaccount ENABLE ROW LEVEL SECURITY;

--
-- Name: bankaccount bankaccount_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bankaccount_all ON public.bankaccount USING (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: cancellationtype; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cancellationtype ENABLE ROW LEVEL SECURITY;

--
-- Name: cancellationtype cancellationtype_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cancellationtype_select_all ON public.cancellationtype FOR SELECT USING (true);


--
-- Name: cancellationtype cancellationtype_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cancellationtype_write ON public.cancellationtype USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: chatroom; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chatroom ENABLE ROW LEVEL SECURITY;

--
-- Name: chatroom chatroom_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatroom_all ON public.chatroom USING (((user_a = auth.uid()) OR (user_b = auth.uid()) OR public.is_admin())) WITH CHECK (((user_a = auth.uid()) OR (user_b = auth.uid()) OR public.is_admin()));


--
-- Name: rentalevidenceimage evidence_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY evidence_all ON public.rentalevidenceimage USING ((public.is_order_participant(order_id) OR public.is_admin())) WITH CHECK ((public.is_order_participant(order_id) OR public.is_admin()));


--
-- Name: item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item ENABLE ROW LEVEL SECURITY;

--
-- Name: item item_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_select_all ON public.item FOR SELECT USING (true);


--
-- Name: item item_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_write ON public.item USING (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: itemcategory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itemcategory ENABLE ROW LEVEL SECURITY;

--
-- Name: itemcategory itemcategory_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itemcategory_select_all ON public.itemcategory FOR SELECT USING (true);


--
-- Name: itemcategory itemcategory_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itemcategory_write ON public.itemcategory USING (public.is_admin());


--
-- Name: itemcondition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itemcondition ENABLE ROW LEVEL SECURITY;

--
-- Name: itemcondition itemcondition_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itemcondition_select_all ON public.itemcondition FOR SELECT USING (true);


--
-- Name: itemcondition itemcondition_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itemcondition_write ON public.itemcondition USING ((public.is_item_owner(item_id) OR public.is_admin())) WITH CHECK ((public.is_item_owner(item_id) OR public.is_admin()));


--
-- Name: itemimage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itemimage ENABLE ROW LEVEL SECURITY;

--
-- Name: itemimage itemimage_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itemimage_select_all ON public.itemimage FOR SELECT USING (true);


--
-- Name: itemimage itemimage_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itemimage_write ON public.itemimage USING ((public.is_item_owner(item_id) OR public.is_admin())) WITH CHECK ((public.is_item_owner(item_id) OR public.is_admin()));


--
-- Name: itemlocation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itemlocation ENABLE ROW LEVEL SECURITY;

--
-- Name: itemlocation itemlocation_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itemlocation_select_all ON public.itemlocation FOR SELECT USING (true);


--
-- Name: itemlocation itemlocation_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY itemlocation_write ON public.itemlocation USING ((public.is_item_owner(item_id) OR public.is_admin())) WITH CHECK ((public.is_item_owner(item_id) OR public.is_admin()));


--
-- Name: message; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message ENABLE ROW LEVEL SECURITY;

--
-- Name: message message_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_insert ON public.message FOR INSERT WITH CHECK ((public.is_admin() OR ((sender_id = auth.uid()) AND public.is_chat_participant(chat_room_id) AND (NOT (EXISTS ( SELECT 1
   FROM (public.chatroom cr
     JOIN public.rentalorder ro ON ((ro.order_id = cr.order_id)))
  WHERE ((cr.chat_room_id = message.chat_room_id) AND (ro.status = ANY (ARRAY['item_returned'::text, 'completed'::text, 'awaiting_additional_payment'::text, 'refunded_dispute'::text, 'item_not_returned'::text])))))))));


--
-- Name: message message_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_select ON public.message FOR SELECT USING ((public.is_chat_participant(chat_room_id) OR public.is_admin()));


--
-- Name: notification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;

--
-- Name: notification notification_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_select ON public.notification FOR SELECT USING (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: notification notification_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_update ON public.notification FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: payment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment ENABLE ROW LEVEL SECURITY;

--
-- Name: payment payment_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_all ON public.payment USING ((public.is_order_participant(order_id) OR public.is_admin())) WITH CHECK ((public.is_order_participant(order_id) OR public.is_admin()));


--
-- Name: rentalevidenceimage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rentalevidenceimage ENABLE ROW LEVEL SECURITY;

--
-- Name: rentalorder; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rentalorder ENABLE ROW LEVEL SECURITY;

--
-- Name: rentalorder rentalorder_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rentalorder_select ON public.rentalorder FOR SELECT USING (((user_id = auth.uid()) OR public.is_item_owner(item_id) OR public.is_admin()));


--
-- Name: rentalorder rentalorder_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rentalorder_write ON public.rentalorder USING (((user_id = auth.uid()) OR public.is_item_owner(item_id) OR public.is_admin())) WITH CHECK (((user_id = auth.uid()) OR public.is_item_owner(item_id) OR public.is_admin()));


--
-- Name: rentalreport; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rentalreport ENABLE ROW LEVEL SECURITY;

--
-- Name: rentalreportimage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rentalreportimage ENABLE ROW LEVEL SECURITY;

--
-- Name: rentalreporttype; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rentalreporttype ENABLE ROW LEVEL SECURITY;

--
-- Name: rentalreport report_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_admin_manage ON public.rentalreport FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: rentalreport report_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_insert ON public.rentalreport FOR INSERT WITH CHECK ((reporter_id = auth.uid()));


--
-- Name: rentalreport report_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_select ON public.rentalreport FOR SELECT USING (((reporter_id = auth.uid()) OR public.is_order_participant(order_id) OR public.is_admin()));


--
-- Name: rentalreportimage reportimage_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reportimage_insert ON public.rentalreportimage FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.rentalreport rr
  WHERE ((rr.report_id = rentalreportimage.report_id) AND (rr.reporter_id = auth.uid())))));


--
-- Name: rentalreportimage reportimage_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reportimage_select ON public.rentalreportimage FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.rentalreport rr
  WHERE ((rr.report_id = rentalreportimage.report_id) AND ((rr.reporter_id = auth.uid()) OR public.is_order_participant(rr.order_id))))) OR public.is_admin()));


--
-- Name: rentalreporttype reporttype_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reporttype_select_all ON public.rentalreporttype FOR SELECT USING (true);


--
-- Name: rentalreporttype reporttype_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reporttype_write ON public.rentalreporttype USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: review; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.review ENABLE ROW LEVEL SECURITY;

--
-- Name: review review_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY review_delete ON public.review FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.rentalorder ro
  WHERE ((ro.order_id = review.order_id) AND (ro.user_id = auth.uid())))) OR public.is_admin()));


--
-- Name: review review_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY review_insert ON public.review FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.rentalorder ro
  WHERE ((ro.order_id = review.order_id) AND (ro.user_id = auth.uid())))) OR public.is_admin()));


--
-- Name: review review_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY review_select_all ON public.review FOR SELECT USING (true);


--
-- Name: review review_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY review_update ON public.review FOR UPDATE USING ((public.is_order_participant(order_id) OR public.is_admin())) WITH CHECK ((public.is_order_participant(order_id) OR public.is_admin()));


--
-- Name: reviewimage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviewimage ENABLE ROW LEVEL SECURITY;

--
-- Name: reviewimage reviewimage_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reviewimage_all ON public.reviewimage USING (((EXISTS ( SELECT 1
   FROM (public.review rv
     JOIN public.rentalorder ro ON ((ro.order_id = rv.order_id)))
  WHERE ((rv.review_id = reviewimage.review_id) AND (ro.user_id = auth.uid())))) OR public.is_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.review rv
     JOIN public.rentalorder ro ON ((ro.order_id = rv.order_id)))
  WHERE ((rv.review_id = reviewimage.review_id) AND (ro.user_id = auth.uid())))) OR public.is_admin()));


--
-- Name: role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role ENABLE ROW LEVEL SECURITY;

--
-- Name: role role_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_select_all ON public.role FOR SELECT USING (true);


--
-- Name: user_role_assignment roleassign_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roleassign_all ON public.user_role_assignment USING (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: user_role_assignment roleassign_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roleassign_select ON public.user_role_assignment FOR SELECT USING (true);


--
-- Name: user_role_assignment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_role_assignment ENABLE ROW LEVEL SECURITY;

--
-- Name: useraccount; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.useraccount ENABLE ROW LEVEL SECURITY;

--
-- Name: useraccount useraccount_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY useraccount_insert_self ON public.useraccount FOR INSERT WITH CHECK (true);


--
-- Name: useraccount useraccount_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY useraccount_select_all ON public.useraccount FOR SELECT USING (true);


--
-- Name: useraccount useraccount_update_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY useraccount_update_own_or_admin ON public.useraccount FOR UPDATE USING (((user_id = auth.uid()) OR public.is_admin()));


SET check_function_bodies = true;

-- ----------------------------------------------------------------------------
-- 6) SEED DATA (ข้อมูลตั้งต้นที่แอปต้องใช้ ไม่มีสิ่งเหล่านี้สมัครสมาชิก/ลงประกาศไม่ได้)
-- ----------------------------------------------------------------------------
-- รันซ้ำได้ปลอดภัย (ON CONFLICT DO NOTHING)
INSERT INTO public.role (role_type) VALUES ('renter'), ('lender'), ('admin')
  ON CONFLICT (role_type) DO NOTHING;

INSERT INTO public.rentalreporttype (type_name) VALUES
  ('damaged_item'), ('stolen_item'), ('false_advertisement'), ('account_report'), ('other')
  ON CONFLICT (type_name) DO NOTHING;

-- หมายเหตุ: ตารางนี้เป็นของเก่าจากดีไซน์ยกเลิก 3 เคส ปัจจุบัน logic ยกเลิกคำนวณจากวันที่ตรงๆ
-- ใน cancel_rental_order ไม่ได้ใช้ตารางนี้ตัดสินใจแล้ว เก็บไว้ให้ตรงกับ production
INSERT INTO public.cancellationtype (cancellation_type) VALUES
  ('within_24hr'), ('advance_notice'), ('late_notice')
  ON CONFLICT (cancellation_type) DO NOTHING;

INSERT INTO public.itemcategory (category_name) VALUES
  ('กล้องและอุปกรณ์ถ่ายภาพ'), ('อุปกรณ์เสียงและดนตรี'), ('อุปกรณ์แคมป์ปิ้ง'),
  ('เครื่องมือช่าง'), ('โทรศัพท์')
  ON CONFLICT (category_name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7) STORAGE BUCKET (แอปอัปโหลดรูปเข้า 4 bucket นี้ — ชื่อต้องตรงกับใน lib/supabase/storage.ts)
--    ตรงกับ production: ทุก bucket เป็น public
--    ข้อสังเกต: slips (สลิปโอนเงิน) และ rental-evidence เป็น public ใครมี URL เปิดดูได้
--    ถ้าต้องการเข้มงวดกว่า production ให้เปลี่ยนเป็น false แล้วใช้ signed URL ในโค้ด
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('avatars',         'avatars',         true, 5242880,  ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('banners',         'banners',         true, 5242880,  ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('rental-evidence', 'rental-evidence', true, NULL,     NULL),
  ('slips',           'slips',           true, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
    ('item-images',     'item-images',     true, 5242880,  ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 8) CRON (pg_cron ทำงานตามเวลา UTC — 09:00 UTC = 16:00 เวลาไทย)
-- ----------------------------------------------------------------------------
-- ทุก 10 นาที: ตัดออเดอร์ที่เกินเวลา (8 ชม.), auto-approve สลิป, ตรวจไม่มาตามนัด, ระงับบัญชีค้างชำระ
SELECT cron.schedule('process-expired-orders', '*/10 * * * *', $$ SELECT public.process_expired_orders(); $$);
-- วันละครั้ง: แจ้งเตือนล่วงหน้า 1 วันก่อนวันนัดรับ/นัดคืน
SELECT cron.schedule('daily-reminders', '0 9 * * *', $$ SELECT public.send_reminder_notifications(); $$);

-- ----------------------------------------------------------------------------
-- 9) ทำเองหลังติดตั้ง (ปิดไว้เป็นคอมเมนต์ ตรงกับสภาพ production ปัจจุบัน)
-- ----------------------------------------------------------------------------
-- 9.1 REALTIME: ใน production ยังไม่ได้เปิดให้ตารางไหนเลย (โค้ดแชท/แจ้งเตือนจึงพึ่ง polling ทุก 15 วิ)
--     โค้ดฝั่งแอปสมัคร realtime ไว้กับตารางเหล่านี้แล้ว ถ้าอยากให้อัปเดตทันที ให้เอาคอมเมนต์ออก
-- ALTER PUBLICATION supabase_realtime ADD TABLE
--   public.message, public.chatroom, public.notification, public.rentalorder, public.payment;

-- 9.2 สร้างแอดมินคนแรก: สมัครสมาชิกปกติก่อน แล้วแทน <USER_UUID> ด้วย user_id ของบัญชีนั้น
-- INSERT INTO public.user_role_assignment (user_id, role_id)
--   SELECT '<USER_UUID>'::uuid, role_id FROM public.role WHERE role_type = 'admin';
