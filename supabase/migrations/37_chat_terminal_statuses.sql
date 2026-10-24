-- ============================================================================
-- 37_chat_terminal_statuses.sql
-- บล็อกการส่งข้อความใหม่เมื่อออเดอร์สิ้นสุดการเช่า (รวมยกเลิกและปฏิเสธทุกกรณี)
-- ประวัติการสนทนายังคงอยู่และอ่านได้เสมอผ่าน SELECT policy
-- ============================================================================

DROP POLICY IF EXISTS message_insert ON message;

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
          AND ro.status IN (
            'item_returned',
            'completed',
            'awaiting_additional_payment',
            'refunded_dispute',
            'item_not_returned',
            'cancelled',
            'cancelled_by_renter',
            'cancelled_by_lender',
            'rejected',
            'rejected_by_lender',
            'rejected_at_meetup',
            'renter_noshow',
            'lender_noshow'
          )
      )
    )
  );
