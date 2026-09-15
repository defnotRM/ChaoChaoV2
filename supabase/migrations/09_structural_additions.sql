-- ============================================================================
-- 09_structural_additions.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
-- ตาม requirement ใหม่จากการประชุมกับ Product Owner
-- ============================================================================

-- เวลารับ-คืนสินค้า (ผู้ให้เช่ากำหนดช่วง / ผู้เช่าเลือกเวลานัดรับ-คืน)
ALTER TABLE availability ADD COLUMN start_time TIME, ADD COLUMN end_time TIME;
ALTER TABLE rentalorder  ADD COLUMN meetup_time TIME, ADD COLUMN return_time TIME;

-- พิกัดสถานที่ (เพิ่มควบคู่ที่อยู่ข้อความเดิม ไม่แทนที่ — ใช้กับแผนที่/ระยะทางเท่านั้น)
ALTER TABLE itemlocation ADD COLUMN latitude NUMERIC(10,7), ADD COLUMN longitude NUMERIC(10,7);

-- item: คอลัมน์ aggregate สำหรับ sort ตอนค้นหา (ต้องมี trigger/RPC คอยอัปเดตให้ sync
-- กับข้อมูลจริงเสมอ เช่น ตอน order เปลี่ยนเป็น completed หรือมี review ใหม่ — ยังไม่ได้ทำ trigger นี้)
ALTER TABLE item ADD COLUMN rented INTEGER NOT NULL DEFAULT 0,
                  ADD COLUMN average_rating NUMERIC(3,2) NOT NULL DEFAULT 0;

-- bankaccount: เหลือ 1 บัญชีต่อคน (เช็คข้อมูลจริงก่อน apply แล้วไม่มีใครมี >1 บัญชีอยู่แล้ว)
ALTER TABLE bankaccount DROP COLUMN is_default;
ALTER TABLE bankaccount ADD CONSTRAINT bankaccount_one_per_user UNIQUE (user_id);
ALTER TABLE bankaccount ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (verification_status = ANY (ARRAY['pending','verified','rejected']));

-- userphones: ยุบเข้า useraccount (เช็คข้อมูลจริงก่อน apply แล้วไม่มีใครมี >1 เบอร์อยู่แล้ว)
-- *** หมายเหตุสำคัญ: ก่อนหน้านี้โค้ด API (app/api/profile/route.ts) รองรับสูงสุด 2 เบอร์ต่อคน
-- เป็นฟีเจอร์ตั้งใจ (Zod .max(2)) — migration นี้ตัดความสามารถนั้นเหลือ 1 เบอร์ ตามการตัดสินใจ
-- ของทีมว่าเก็บแค่ 1 บัญชี : 1 เบอร์พอ ***
ALTER TABLE useraccount ADD COLUMN phone TEXT;
UPDATE useraccount u SET phone = up.phone FROM userphones up WHERE up.user_id = u.user_id;
DROP TABLE userphones;
