-- ============================================================================
-- 08_tighten_rls_policies.sql
--
-- แก้ RLS policy ที่เปิดกว้างเกินไป (qual: true = ทุกคนทำอะไรก็ได้) ให้เช็คสิทธิ์
-- จริงตาม ownership เหมือนตารางที่ทำถูกอยู่แล้ว (item, bankaccount ฯลฯ)
--
-- ผลกระทบต่อแอป: คาดว่าไม่กระทบพฤติกรรมที่ใช้งานผ่านเว็บเลย เพราะ route ส่วนใหญ่
-- ใช้ createAdminClient() (service role) ซึ่งข้าม RLS อยู่แล้ว การแก้นี้ปิดแค่
-- ช่องทาง "ยิง Supabase REST API ตรงด้วย anon/authenticated key" เท่านั้น
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_item_owner(p_item_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.item WHERE item_id = p_item_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_order_participant(p_order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rentalorder ro
    JOIN public.item it ON it.item_id = ro.item_id
    WHERE ro.order_id = p_order_id
      AND (ro.user_id = auth.uid() OR it.user_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_chat_participant(p_chat_room_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chatroom
    WHERE chat_room_id = p_chat_room_id AND (user_a = auth.uid() OR user_b = auth.uid())
  );
$$;

-- ----------------------------------------------------------------------------
-- itemcondition / itemlocation / itemimage / availability
-- อ่านสาธารณะเหมือนเดิม (หน้ารายละเอียดสินค้าต้องเห็นได้ไม่ต้องล็อกอิน)
-- เขียนได้เฉพาะเจ้าของ item หรือ admin
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS itemcondition_write ON public.itemcondition;
CREATE POLICY itemcondition_write ON public.itemcondition FOR ALL
  USING (is_item_owner(item_id) OR is_admin())
  WITH CHECK (is_item_owner(item_id) OR is_admin());

DROP POLICY IF EXISTS itemlocation_write ON public.itemlocation;
CREATE POLICY itemlocation_write ON public.itemlocation FOR ALL
  USING (is_item_owner(item_id) OR is_admin())
  WITH CHECK (is_item_owner(item_id) OR is_admin());

DROP POLICY IF EXISTS itemimage_write ON public.itemimage;
CREATE POLICY itemimage_write ON public.itemimage FOR ALL
  USING (is_item_owner(item_id) OR is_admin())
  WITH CHECK (is_item_owner(item_id) OR is_admin());

DROP POLICY IF EXISTS availability_write ON public.availability;
CREATE POLICY availability_write ON public.availability FOR ALL
  USING (is_item_owner(item_id) OR is_admin())
  WITH CHECK (is_item_owner(item_id) OR is_admin());

-- ----------------------------------------------------------------------------
-- rentalorder — เห็น/แก้ได้เฉพาะคู่กรณี (ผู้เช่า หรือ เจ้าของสินค้า) หรือ admin
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rentalorder_select_all ON public.rentalorder;
CREATE POLICY rentalorder_select ON public.rentalorder FOR SELECT
  USING (user_id = auth.uid() OR is_item_owner(item_id) OR is_admin());

DROP POLICY IF EXISTS rentalorder_write ON public.rentalorder;
CREATE POLICY rentalorder_write ON public.rentalorder FOR ALL
  USING (user_id = auth.uid() OR is_item_owner(item_id) OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_item_owner(item_id) OR is_admin());

-- ----------------------------------------------------------------------------
-- rentalevidenceimage / payment — เห็น/แก้ได้เฉพาะคู่กรณีของ order นั้น หรือ admin
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS evidence_all ON public.rentalevidenceimage;
CREATE POLICY evidence_all ON public.rentalevidenceimage FOR ALL
  USING (is_order_participant(order_id) OR is_admin())
  WITH CHECK (is_order_participant(order_id) OR is_admin());

DROP POLICY IF EXISTS payment_all ON public.payment;
CREATE POLICY payment_all ON public.payment FOR ALL
  USING (is_order_participant(order_id) OR is_admin())
  WITH CHECK (is_order_participant(order_id) OR is_admin());

-- ----------------------------------------------------------------------------
-- review — อ่านสาธารณะเหมือนเดิม (คะแนนรีวิวต้องเห็นได้ทุกคนตอนดูสินค้า)
-- เขียนได้เฉพาะผู้เช่าเจ้าของ order นั้น หรือ admin
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS review_write ON public.review;
CREATE POLICY review_write ON public.review FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.rentalorder ro WHERE ro.order_id = review.order_id AND ro.user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.rentalorder ro WHERE ro.order_id = review.order_id AND ro.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS reviewimage_all ON public.reviewimage;
CREATE POLICY reviewimage_all ON public.reviewimage FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.review rv JOIN public.rentalorder ro ON ro.order_id = rv.order_id
      WHERE rv.review_id = reviewimage.review_id AND ro.user_id = auth.uid()
    ) OR is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.review rv JOIN public.rentalorder ro ON ro.order_id = rv.order_id
      WHERE rv.review_id = reviewimage.review_id AND ro.user_id = auth.uid()
    ) OR is_admin()
  );

-- ----------------------------------------------------------------------------
-- rentalreporttype — reference table, เขียนได้เฉพาะ admin (อ่านสาธารณะเหมือนเดิม)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS reporttype_write ON public.rentalreporttype;
CREATE POLICY reporttype_write ON public.rentalreporttype FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- ----------------------------------------------------------------------------
-- rentalreport — คนแจ้ง/คู่กรณีของ order เห็นได้, สร้างได้เฉพาะตัวเอง,
-- แก้สถานะ (ตัดสิน) ได้เฉพาะ admin เท่านั้น (กันคนแจ้งเปลี่ยนผลเองได้)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS report_all ON public.rentalreport;
CREATE POLICY report_select ON public.rentalreport FOR SELECT
  USING (reporter_id = auth.uid() OR is_order_participant(order_id) OR is_admin());
CREATE POLICY report_insert ON public.rentalreport FOR INSERT
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY report_admin_manage ON public.rentalreport FOR UPDATE
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS reportimage_all ON public.rentalreportimage;
CREATE POLICY reportimage_select ON public.rentalreportimage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rentalreport rr
      WHERE rr.report_id = rentalreportimage.report_id
        AND (rr.reporter_id = auth.uid() OR is_order_participant(rr.order_id))
    ) OR is_admin()
  );
CREATE POLICY reportimage_insert ON public.rentalreportimage FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rentalreport rr
      WHERE rr.report_id = rentalreportimage.report_id AND rr.reporter_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- chatroom / message — เห็น/แก้ได้เฉพาะคู่สนทนา (user_a, user_b) หรือ admin
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS chatroom_all ON public.chatroom;
CREATE POLICY chatroom_all ON public.chatroom FOR ALL
  USING (user_a = auth.uid() OR user_b = auth.uid() OR is_admin())
  WITH CHECK (user_a = auth.uid() OR user_b = auth.uid() OR is_admin());

DROP POLICY IF EXISTS message_all ON public.message;
CREATE POLICY message_all ON public.message FOR ALL
  USING (is_chat_participant(chat_room_id) OR is_admin())
  WITH CHECK ((sender_id = auth.uid() AND is_chat_participant(chat_room_id)) OR is_admin());

-- ============================================================================
-- หลังรันไฟล์นี้: ตารางที่ยังเหลือ policy "qual: true" แบบเปิดกว้าง (ตั้งใจเว้นไว้
-- เพราะข้อมูลไม่ sensitive และต้องอ่านสาธารณะได้จริง):
--   role, itemcategory(select), item(select), itemcondition(select),
--   itemlocation(select), itemimage(select), availability(select),
--   rentalorder(select ถูกจำกัดแล้วด้านบน), review(select), rentalreporttype(select),
--   useraccount(select — ข้อมูลโปรไฟล์สาธารณะ), user_role_assignment(select)
-- ============================================================================
