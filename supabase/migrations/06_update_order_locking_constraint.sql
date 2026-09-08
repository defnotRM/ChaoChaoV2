-- ============================================================================
-- ปรับปรุง Constraint no_overlapping_active_bookings
-- ให้ล็อควันเฉพาะออเดอร์ที่ได้รับการอนุมัติแล้ว (awaiting_payment เป็นต้นไป)
-- ไม่ล็อควันที่ออเดอร์ยังอยู่ในสถานะ requested (รอการอนุมัติ)
-- ============================================================================

ALTER TABLE RentalOrder DROP CONSTRAINT IF EXISTS no_overlapping_active_bookings;

ALTER TABLE RentalOrder
  ADD CONSTRAINT no_overlapping_active_bookings
  EXCLUDE USING gist (
    item_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('awaiting_payment', 'paid', 'item_sent', 'item_received', 'item_returned', 'awaiting_additional_payment'));
