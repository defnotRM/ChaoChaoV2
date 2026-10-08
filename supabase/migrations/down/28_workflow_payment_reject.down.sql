-- ============================================================================
-- 28_workflow_payment_reject.down.sql — ย้อนกลับ 28 (ลบ 2 เส้นทางและคืนชื่อสถานะเดิม)
-- ============================================================================
BEGIN;

DELETE FROM public.workflow_transition t
USING public.workflow_state fs, public.workflow w
WHERE fs.state_id = t.from_state_id
  AND w.workflow_id = fs.workflow_id
  AND w.workflow_code = 'PAYMENT'
  AND t.action_code IN ('reject_slip', 'cancel_order_cleanup');

UPDATE public.workflow_state s
SET state_name_th = 'สลิปไม่ผ่าน (ไม่มีโค้ดตั้งค่านี้)'
FROM public.workflow w
WHERE w.workflow_id = s.workflow_id
  AND w.workflow_code = 'PAYMENT'
  AND s.state_code = 'rejected';

COMMIT;