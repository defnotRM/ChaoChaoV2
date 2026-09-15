-- ============================================================================
-- 10_status_report_cancellation.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
-- ตาม requirement ใหม่จากการประชุมกับ Product Owner (การกระจายเงิน 8 เคส E-O)
-- ============================================================================

-- rentalorder: เพิ่มสถานะใหม่สำหรับกรณี no-show / เปลี่ยนใจหน้างาน
-- (แทนที่ rentalreporttype เดิมที่เคยมี renter_no_show / lender_no_show — ย้ายมาเก็บ
-- เป็น order status แทน เพราะ 2 กรณีนี้ไม่ต้องผ่านการ report/ตัดสินของแอดมินแล้ว
-- ดูจากเวลานัดเทียบเวลาอัปโหลดรูปได้อัตโนมัติ)
ALTER TABLE rentalorder DROP CONSTRAINT rentalorder_status_check;
ALTER TABLE rentalorder ADD CONSTRAINT rentalorder_status_check
  CHECK (status = ANY (ARRAY[
    'requested','awaiting_payment','paid','item_sent','item_received','item_returned',
    'completed','cancelled','cancelled_by_renter','rejected_by_lender','awaiting_additional_payment',
    'renter_noshow','lender_noshow','rejected_at_meetup'
  ]));

-- ค่าธรรมเนียมยกเลิก / ค่าเสียหาย แยกจาก fee (ค่าคอมมิชชันแพลตฟอร์ม) ที่มีอยู่แล้ว
ALTER TABLE rentalorder ADD COLUMN cancellation_fee NUMERIC CHECK (cancellation_fee >= 0),
                         ADD COLUMN damage_fee NUMERIC CHECK (damage_fee >= 0);

-- cancellationtype: lookup table ใหม่ ผูกกับ rentalorder ตอนสถานะ cancelled_by_renter
-- เพื่อคำนวณ % คืนเงินตามเงื่อนไข E/F/G จากเอกสาร PO
CREATE TABLE cancellationtype (
  cancellation_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cancellation_type    TEXT NOT NULL UNIQUE
);
INSERT INTO cancellationtype (cancellation_type) VALUES
  ('within_24hr'), ('advance_notice'), ('late_notice');

ALTER TABLE cancellationtype ENABLE ROW LEVEL SECURITY;
-- (policy ของตารางนี้อยู่ในไฟล์ 11_cancellationtype_rls.sql แยกต่างหาก)

ALTER TABLE rentalorder ADD COLUMN cancellation_type_id UUID REFERENCES cancellationtype(cancellation_type_id);

-- rentalreporttype: ลบ noshow (ย้ายไปอยู่ที่ rentalorder.status แทนแล้วด้านบน) เพิ่ม stolen_item
-- *** ชื่อจริงในฐานข้อมูลคือ renter_no_show / lender_no_show (มี underscore) ไม่ใช่ renter_noshow ***
DELETE FROM rentalreporttype WHERE type_name IN ('renter_no_show', 'lender_no_show');
INSERT INTO rentalreporttype (type_name) VALUES ('stolen_item');

-- rentalreport: คำตัดสินของแอดมิน — ใช้คอลัมน์เดียว (TEXT) แทนแยกคอลัมน์ตาม type
-- (ตัดสินใจแล้วว่าไม่แยก เพราะจะมีคอลัมน์ NULL เยอะเกินไปเวลามี type ต่างกัน)
-- damage_amount แยกไว้สำหรับกรณี M (เสียหายปานกลาง) ที่หักตามใบซ่อมจริง ไม่ใช่ % ตายตัว
ALTER TABLE rentalreport ADD COLUMN verdict TEXT,
                          ADD COLUMN damage_amount NUMERIC CHECK (damage_amount >= 0);

-- payment: เพิ่มสถานะคืนเงิน แยกจาก paid เดิม
ALTER TABLE payment DROP CONSTRAINT payment_status_check;
ALTER TABLE payment ADD CONSTRAINT payment_status_check
  CHECK (status = ANY (ARRAY['pending','paid','rejected','refunded']));
