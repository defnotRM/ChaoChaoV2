-- ============================================================================
-- check_install.sql — ตรวจว่า full_install.sql ติดตั้งครบและตรงกับ production
--
-- วิธีใช้: รัน full_install.sql ให้สำเร็จก่อน แล้วรันไฟล์นี้ใน SQL Editor ของโปรเจกต์เดียวกัน
--          (รันคิวรีที่ 1 แยกจากคิวรีที่ 2 เพราะ SQL Editor แสดงผลลัพธ์ของคำสั่งสุดท้ายเท่านั้น)
--
-- ผลที่ควรได้จากคิวรีที่ 1 (1 แถว):
--   structure_hash   = 9483396d90ab
--   fingerprint_rows = 132
--   tables = 22, roles = 3, report_types = 5, cancel_types = 3, categories = 5, buckets = 5
--
-- ผลที่ควรได้จากคิวรีที่ 2: 2 แถว (process-expired-orders และ daily-reminders)
--
-- ถ้า structure_hash ไม่ตรง ให้ส่งผลลัพธ์ทั้งแถวมาให้ผม จะส่งคิวรีที่ระบุว่าวัตถุไหนต่างให้
-- ============================================================================

-- คิวรีที่ 1: โครงสร้างและข้อมูลตั้งต้น
WITH
cols AS (SELECT 'cols' k, c.relname::text nm, left(md5(string_agg(a.attname||' '||format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull::text||' '||coalesce(pg_get_expr(d.adbin,d.adrelid),''), ',' ORDER BY a.attname COLLATE "C")),8) h
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
  WHERE n.nspname='public' AND c.relkind='r' GROUP BY c.relname),
cons AS (SELECT 'cons' k, conrelid::regclass::text nm, left(md5(string_agg(conname||' '||pg_get_constraintdef(oid), ',' ORDER BY conname COLLATE "C")),8) h
  FROM pg_constraint WHERE connamespace='public'::regnamespace GROUP BY conrelid),
idx AS (SELECT 'idx' k, tablename::text nm, left(md5(string_agg(indexname||' '||indexdef, ',' ORDER BY indexname COLLATE "C")),8) h
  FROM pg_indexes WHERE schemaname='public' GROUP BY tablename),
pol AS (SELECT 'pol' k, tablename::text nm, left(md5(string_agg(policyname||' '||permissive||' '||roles::text||' '||cmd||' '||coalesce(qual,'')||' '||coalesce(with_check,''), ',' ORDER BY policyname COLLATE "C")),8) h
  FROM pg_policies WHERE schemaname='public' GROUP BY tablename),
trg AS (SELECT 'trg' k, c.relname::text nm, left(md5(string_agg(pg_get_triggerdef(t.oid), ',' ORDER BY t.tgname COLLATE "C")),8) h
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal GROUP BY c.relname),
rls AS (SELECT 'rls' k, c.relname::text nm, left(md5(c.relrowsecurity::text),8) h FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
fn AS (SELECT 'fn' k, (p.proname||'('||pg_get_function_identity_arguments(p.oid)||')') nm, left(md5(regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\s+','','g')||'|'||pg_get_function_result(p.oid)||'|'||p.prosecdef::text||'|'||p.provolatile::text||'|'||coalesce(p.proconfig::text,'')),8) h
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')),
fp AS (SELECT * FROM cols UNION ALL SELECT * FROM cons UNION ALL SELECT * FROM idx UNION ALL SELECT * FROM pol UNION ALL SELECT * FROM trg UNION ALL SELECT * FROM rls UNION ALL SELECT * FROM fn),
m AS (SELECT left(md5(string_agg(k||'|'||nm||'|'||h, E'\n' ORDER BY k COLLATE "C", nm COLLATE "C")),12) AS structure_hash, count(*) AS fingerprint_rows FROM fp)
SELECT m.structure_hash, m.fingerprint_rows,
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS tables,
  (SELECT count(*) FROM public.role) AS roles,
  (SELECT count(*) FROM public.rentalreporttype) AS report_types,
  (SELECT count(*) FROM public.cancellationtype) AS cancel_types,
  (SELECT count(*) FROM public.itemcategory) AS categories,
  (SELECT count(*) FROM storage.buckets) AS buckets
FROM m;

-- คิวรีที่ 2: งานตั้งเวลา (pg_cron)
SELECT jobname, schedule FROM cron.job ORDER BY jobname;
