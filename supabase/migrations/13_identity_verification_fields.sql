-- ============================================================================
-- 13_identity_verification_fields.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
--
-- ตาม FR-04/FR-05: ต้องเก็บรูปบัตรประชาชน + รูปถ่ายบุคคลคู่กับบัตรประชาชน (selfie)
-- เพื่อให้แอดมินตรวจสอบตัวตน ก่อนหน้านี้ useraccount มีแค่ national_id (เลขบัตร
-- เป็นข้อความ) ไม่มีที่เก็บรูปทั้งสองใบเลย
--
-- แยกสถานะตรวจสอบตัวตนออกมาเป็น identity_verification_status ใหม่ต่างหาก
-- ไม่ปนกับ useraccount.status เดิม เพราะ:
--   - useraccount.status ควรสื่อแค่ "สถานะบัญชีโดยรวม" (Active/Suspended/Banned/Deactivated)
--   - identity_verification_status สื่อ "ตรวจสอบตัวตนแล้วหรือยัง" (pending/verified/rejected)
--     คนละเรื่องกับ bankaccount.verification_status ที่มีอยู่แล้ว (เปลี่ยนบัญชีธนาคาร
--     ไม่ควรกระทบสถานะตรวจสอบบัตร/selfี และในทางกลับกัน)
--
-- เช็คข้อมูลจริงก่อน apply แล้ว ไม่มี user คนไหนอยู่ในสถานะ Pending_Verification
-- (มีแค่ 3 user ทั้งหมดเป็น Active) จึงตัดค่านี้ออกจาก useraccount_status_check
-- ได้เลยโดยไม่ต้อง migrate ข้อมูล
-- ============================================================================

ALTER TABLE useraccount
  ADD COLUMN id_card_url TEXT,
  ADD COLUMN id_card_selfie_url TEXT,
  ADD COLUMN identity_verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (identity_verification_status = ANY (ARRAY['pending','verified','rejected']));

ALTER TABLE useraccount DROP CONSTRAINT useraccount_status_check;
ALTER TABLE useraccount ADD CONSTRAINT useraccount_status_check
  CHECK (status = ANY (ARRAY['Active','Suspended','Banned','Deactivated']));
