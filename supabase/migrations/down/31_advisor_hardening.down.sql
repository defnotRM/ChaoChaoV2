-- ย้อนกลับ 31
ALTER EXTENSION btree_gist SET SCHEMA public;
ALTER FUNCTION public.set_updated_at() RESET search_path;
-- ไม่ลบ schema extensions เพราะ Supabase ใช้เป็น schema มาตรฐานของ extension อื่นอยู่แล้ว
