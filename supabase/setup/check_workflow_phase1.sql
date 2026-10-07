-- ============================================================================
-- check_workflow_phase1.sql — ตรวจ Dynamic Workflow เฟส 1 บนโปรเจกต์ staging
-- (SQL Editor แสดงผลของคำสั่งสุดท้ายในการรันแต่ละครั้ง ให้เลือกรันทีละคิวรี)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- คิวรีที่ 1: ตรวจหลังรัน 27_dynamic_workflow_core.sql
-- ผลที่ควรได้ (1 แถว):
--   structure_hash = 6a0e828cd7c6   fingerprint_rows = 174
--   workflows = 7   states = 40   transitions = 51   mode = static
-- ถ้าตัวเลขอื่นตรงแต่ structure_hash ไม่ตรง ให้ส่งผลมา (ต่างจากเครื่องทดสอบของผมที่ใช้ Postgres รุ่นอื่น
-- ผมจะส่งคิวรีที่ชี้ว่าวัตถุไหนต่างให้)
-- ถ้าย้อนกลับด้วยไฟล์ .down.sql แล้ว ให้ใช้ check_install.sql ตรวจ: structure_hash ต้องเป็น 77b289a75e91
-- ----------------------------------------------------------------------------
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
  (SELECT count(*) FROM public.workflow)            AS workflows,
  (SELECT count(*) FROM public.workflow_state)      AS states,
  (SELECT count(*) FROM public.workflow_transition) AS transitions,
  public.workflow_mode()                            AS mode
FROM m;

-- ----------------------------------------------------------------------------
-- คิวรีที่ 2: ดูรายการที่ "ผิดกฎ" ที่โหมด shadow จับได้ (รันหลังลองใช้แอปแล้ว)
-- ทุกแถวคือการเปลี่ยนสถานะที่ไม่มีใน workflow_transition หรือผู้ทำไม่มีสิทธิ์
-- ส่งผลลัพธ์มาให้ผม เพื่อตัดสินว่าแต่ละรายการคือบั๊กจริง หรือเส้นทางที่ต้องเพิ่มเข้า seed
-- ----------------------------------------------------------------------------
SELECT w.workflow_code,
       coalesce(fs.state_code, '(ว่าง)') AS from_state,
       ts.state_code                      AS to_state,
       left(h.reason, 90)                 AS reason,
       count(*)                           AS times,
       min(h.changed_at)::timestamp(0)    AS first_seen
FROM public.workflow_history h
JOIN public.workflow w ON w.workflow_id = h.workflow_id
LEFT JOIN public.workflow_state fs ON fs.state_id = h.from_state_id
JOIN public.workflow_state ts ON ts.state_id = h.to_state_id
WHERE h.reason LIKE 'SHADOW_VIOLATION%'
GROUP BY 1, 2, 3, 4
ORDER BY times DESC, first_seen;

-- ----------------------------------------------------------------------------
-- คิวรีที่ 3: ประวัติการเปลี่ยนสถานะล่าสุด 50 รายการ (ทั้งที่ผ่านและผิดกฎ)
-- ----------------------------------------------------------------------------
SELECT h.changed_at::timestamp(0) AS at,
       w.workflow_code,
       coalesce(fs.state_code, '(ว่าง)') || ' -> ' || ts.state_code AS change,
       coalesce(t.action_code, 'ผิดกฎ') AS action,
       h.entity_id
FROM public.workflow_history h
JOIN public.workflow w ON w.workflow_id = h.workflow_id
LEFT JOIN public.workflow_state fs ON fs.state_id = h.from_state_id
JOIN public.workflow_state ts ON ts.state_id = h.to_state_id
LEFT JOIN public.workflow_transition t ON t.transition_id = h.transition_id
ORDER BY h.changed_at DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- คำสั่งสลับโหมด (มีผลทันที ไม่ต้อง deploy) — เลือกรันทีละบรรทัด
-- ----------------------------------------------------------------------------
-- UPDATE public.system_config SET config_value = 'static'  WHERE config_key = 'workflow_mode';  -- ปิด (เหมือนเดิม)
-- UPDATE public.system_config SET config_value = 'shadow'  WHERE config_key = 'workflow_mode';  -- ตรวจแต่ไม่ปฏิเสธ
-- UPDATE public.system_config SET config_value = 'dynamic' WHERE config_key = 'workflow_mode';  -- บังคับจริง