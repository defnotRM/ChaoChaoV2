-- ============================================================================
-- 27_dynamic_workflow_core.down.sql — ย้อนกลับ Dynamic Workflow เฟส 1 ทั้งหมด
--
-- ผลลัพธ์: ฐานข้อมูลกลับเป็นโครงสร้างก่อนรัน 27_dynamic_workflow_core.sql ทุกประการ
-- (ทดสอบแล้วว่าค่า structure_hash จาก check_install.sql กลับมาเป็น 9483396d90ab)
--
-- ข้อควรระวัง: ข้อมูลในตาราง workflow_history (ประวัติเปลี่ยนสถานะ/การละเมิดที่โหมด shadow บันทึกไว้)
-- และค่าที่แก้ใน system_config จะหายไป ถ้าต้องการเก็บไว้ ให้ export ก่อน
-- ข้อมูลธุรกิจ (ออเดอร์ การชำระเงิน ฯลฯ) และคอลัมน์สถานะข้อความเดิมไม่ถูกแตะ
-- ============================================================================

BEGIN;

-- 1) Trigger
DROP TRIGGER IF EXISTS trg_wf_b_guard          ON public.rentalorder;
DROP TRIGGER IF EXISTS trg_wf_b_guard          ON public.payment;
DROP TRIGGER IF EXISTS trg_wf_b_guard          ON public.rentalreport;
DROP TRIGGER IF EXISTS trg_wf_b_guard          ON public.bankaccount;
DROP TRIGGER IF EXISTS trg_wf_b_guard          ON public.item;
DROP TRIGGER IF EXISTS trg_wf_b_guard_account  ON public.useraccount;
DROP TRIGGER IF EXISTS trg_wf_b_guard_identity ON public.useraccount;

DROP TRIGGER IF EXISTS trg_wf_a_sync           ON public.rentalorder;
DROP TRIGGER IF EXISTS trg_wf_a_sync           ON public.payment;
DROP TRIGGER IF EXISTS trg_wf_a_sync           ON public.rentalreport;
DROP TRIGGER IF EXISTS trg_wf_a_sync           ON public.bankaccount;
DROP TRIGGER IF EXISTS trg_wf_a_sync           ON public.item;
DROP TRIGGER IF EXISTS trg_wf_a_sync_account   ON public.useraccount;
DROP TRIGGER IF EXISTS trg_wf_a_sync_identity  ON public.useraccount;

-- 2) ฟังก์ชัน
DROP FUNCTION IF EXISTS public.trg_wf_guard();
DROP FUNCTION IF EXISTS public.trg_wf_sync_status();
DROP FUNCTION IF EXISTS public.workflow_actor_roles(text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.workflow_state_id(text, text);
DROP FUNCTION IF EXISTS public.workflow_mode();

-- 3) คอลัมน์ *_id (index ที่อยู่บนคอลัมน์เหล่านี้ถูกลบไปพร้อมกัน)
ALTER TABLE public.rentalorder  DROP COLUMN IF EXISTS status_id;
ALTER TABLE public.payment      DROP COLUMN IF EXISTS status_id;
ALTER TABLE public.rentalreport DROP COLUMN IF EXISTS status_id;
ALTER TABLE public.bankaccount  DROP COLUMN IF EXISTS verification_status_id;
ALTER TABLE public.item         DROP COLUMN IF EXISTS status_id;
ALTER TABLE public.useraccount  DROP COLUMN IF EXISTS account_status_id;
ALTER TABLE public.useraccount  DROP COLUMN IF EXISTS identity_status_id;

-- 4) ตาราง (เรียงตามลำดับพึ่งพา)
DROP TABLE IF EXISTS public.workflow_history;
DROP TABLE IF EXISTS public.workflow_transition_condition;
DROP TABLE IF EXISTS public.workflow_transition_role;
DROP TABLE IF EXISTS public.workflow_transition;
DROP TABLE IF EXISTS public.workflow_state;
DROP TABLE IF EXISTS public.workflow;
DROP TABLE IF EXISTS public.system_config;

COMMIT;
