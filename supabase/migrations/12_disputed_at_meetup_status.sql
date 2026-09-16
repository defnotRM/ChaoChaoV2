-- ============================================================================
-- 12_disputed_at_meetup_status.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
--
-- เพิ่มสถานะใหม่สำหรับ order ที่ผู้เช่ากดปฏิเสธหน้างานด้วยเหตุผล "สินค้าไม่ตรงปก"
-- (FR-38) ซึ่งต้องรอผลตัดสินจากแอดมินก่อน ยังไม่จบทันที
--
-- *** แยกจาก rejected_at_meetup โดยตั้งใจ *** — rejected_at_meetup ใช้กับเคส J
-- (เปลี่ยนใจเฉยๆ หน้างาน) ที่ตัดสินจบได้ทันทีไม่ต้องรอใคร ส่วน disputed_at_meetup
-- ใช้กับเคสที่ต้องรอแอดมินตรวจสอบก่อนว่าของไม่ตรงปกจริงหรือไม่ (คนละความหมายกัน
-- แม้จะทริกเกอร์จากปุ่ม "ปฏิเสธ" เดียวกันก็ตาม)
-- ============================================================================

ALTER TABLE rentalorder DROP CONSTRAINT rentalorder_status_check;
ALTER TABLE rentalorder ADD CONSTRAINT rentalorder_status_check
  CHECK (status = ANY (ARRAY[
    'requested','awaiting_payment','paid','item_sent','item_received','item_returned',
    'completed','cancelled','cancelled_by_renter','rejected_by_lender','awaiting_additional_payment',
    'renter_noshow','lender_noshow','rejected_at_meetup','disputed_at_meetup'
  ]));

-- เพิ่ม disputed_at_meetup เข้า EXCLUDE constraint ด้วย เพื่อกันไม่ให้วันที่ของ order
-- ถูกปลดล็อกให้คนอื่นจองซ้อนได้ระหว่างที่ข้อพิพาทยังไม่ถูกตัดสิน
ALTER TABLE rentalorder DROP CONSTRAINT no_overlapping_active_bookings;
ALTER TABLE rentalorder
  ADD CONSTRAINT no_overlapping_active_bookings
  EXCLUDE USING gist (
    item_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('awaiting_payment','paid','item_sent','item_received','item_returned','awaiting_additional_payment','disputed_at_meetup'));
