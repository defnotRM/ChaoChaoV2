-- ============================================================================
-- 11_cancellationtype_rls.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
--
-- ตาราง cancellationtype (สร้างใน 10_status_report_cancellation.sql) ถูกเปิด RLS
-- ไว้แล้ว แต่ตอนแรกลืมใส่ policy ให้ — ไฟล์นี้เพิ่ม policy ให้สอดคล้องกับตารางอื่น
-- ทั้งระบบ (อ่านสาธารณะได้ เขียนได้เฉพาะ admin) ตามแนวทางเดียวกับ 08_tighten_rls_policies.sql
-- ============================================================================

CREATE POLICY cancellationtype_select_all ON cancellationtype FOR SELECT USING (true);
CREATE POLICY cancellationtype_write ON cancellationtype FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
