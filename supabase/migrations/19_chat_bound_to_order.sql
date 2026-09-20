-- ============================================================================
-- 19_chat_bound_to_order.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
--
-- FR-25 (v2): แชทผูกกับ "รายออเดอร์" แทนที่จะเป็น "รายคู่คน"
-- คู่คนเดิมเช่ากันหลายรอบ = มีได้หลายห้องแชท แยกตาม order
--
-- ตอน apply มีข้อมูลจริงแค่ 2 แถวใน chatroom/message (ของทดสอบ) ไม่กระทบอะไร
-- ============================================================================

ALTER TABLE chatroom ADD COLUMN order_id UUID REFERENCES rentalorder(order_id);

ALTER TABLE chatroom DROP CONSTRAINT chatroom_user_a_user_b_key;
ALTER TABLE chatroom ADD CONSTRAINT chatroom_order_id_key UNIQUE (order_id);

-- ปิดไมค์ (ส่งข้อความใหม่ไม่ได้) แต่ยังอ่านประวัติได้เสมอ — เมื่อ order คืนของ
-- อัปรูปเสร็จแล้วเป็นต้นไป
DROP POLICY IF EXISTS message_all ON message;

CREATE POLICY message_select ON message FOR SELECT
  USING (is_chat_participant(chat_room_id) OR is_admin());

CREATE POLICY message_insert ON message FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      sender_id = auth.uid()
      AND is_chat_participant(chat_room_id)
      AND NOT EXISTS (
        SELECT 1 FROM chatroom cr
        JOIN rentalorder ro ON ro.order_id = cr.order_id
        WHERE cr.chat_room_id = message.chat_room_id
          AND ro.status IN ('item_returned','completed','awaiting_additional_payment','refunded_dispute','item_not_returned')
      )
    )
  );
