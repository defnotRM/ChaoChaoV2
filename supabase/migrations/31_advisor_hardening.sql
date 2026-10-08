-- 31: แก้คำเตือน Supabase security advisors 2 ข้อ (ไม่เปลี่ยนพฤติกรรมของแอป)
--   * function_search_path_mutable: public.set_updated_at ไม่ได้ตั้ง search_path
--   * extension_in_public: btree_gist อยู่ใน schema public
-- (leaked password protection เป็นค่า Auth ต้องเปิดที่ Dashboard → Authentication → Password security ไม่ใช่ SQL)
--
-- ย้อนกลับ: down/31_advisor_hardening.down.sql

ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- constraint no_overlapping_active_bookings อ้าง operator class ด้วย OID จึงใช้งานต่อได้หลังย้าย extension
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;
