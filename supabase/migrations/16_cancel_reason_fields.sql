-- ============================================================================
-- 16_cancel_reason_fields.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
--
-- FR-32: ผู้ให้เช่ายกเลิกรายการเช่าต้องชี้แจงเหตุผล + แนบรูปหลักฐานให้ผู้เช่าเห็น
-- ก่อนหน้านี้ rentalorder ไม่มีที่เก็บข้อมูลนี้เลย
-- ============================================================================

ALTER TABLE rentalorder
  ADD COLUMN cancel_reason TEXT,
  ADD COLUMN cancel_reason_image_url TEXT;
