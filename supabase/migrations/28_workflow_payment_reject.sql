-- ============================================================================
-- 28_workflow_payment_reject.sql — เพิ่มเส้นทางชำระเงิน pending -> rejected
-- ============================================================================
-- PR #9 (merge แล้ว) เพิ่มการปฏิเสธสลิป ทำให้สถานะ rejected ของ PAYMENT มีโค้ดตั้งค่าจริง 2 จุด:
--   1) POST /api/payments/reject      ผู้ให้เช่าปฏิเสธสลิป
--   2) PATCH /api/rentals/[id]        ยกเลิกออเดอร์ระหว่างรอตรวจสลิป สลิป pending ถือว่าถูกปฏิเสธ
-- ถ้าไม่มีเส้นทางนี้ โหมด dynamic จะบล็อกทั้งสองจุด (โหมด shadow จะบันทึกว่าผิดกฎ)
-- ต้องรันหลัง 27_dynamic_workflow_core.sql  ย้อนกลับด้วย down/28_workflow_payment_reject.down.sql
-- รันซ้ำได้ (ไม่เพิ่มแถวซ้ำ)

BEGIN;

UPDATE public.workflow_state s
SET state_name_th = 'สลิปถูกปฏิเสธ'
FROM public.workflow w
WHERE w.workflow_id = s.workflow_id
  AND w.workflow_code = 'PAYMENT'
  AND s.state_code = 'rejected';

INSERT INTO public.workflow_transition (from_state_id, to_state_id, action_code, is_automatic, description)
SELECT fs.state_id, ts.state_id, v.action_code, v.is_automatic, v.descr
FROM (VALUES
  ('reject_slip',          false, 'ผู้ให้เช่าปฏิเสธสลิป ให้ผู้เช่าอัปโหลดใหม่'),
  ('cancel_order_cleanup', true,  'ยกเลิกออเดอร์ระหว่างรอตรวจสลิป สลิปที่รอตรวจถือว่าถูกปฏิเสธ')
) AS v(action_code, is_automatic, descr)
JOIN public.workflow w        ON w.workflow_code = 'PAYMENT'
JOIN public.workflow_state fs ON fs.workflow_id = w.workflow_id AND fs.state_code = 'pending'
JOIN public.workflow_state ts ON ts.workflow_id = w.workflow_id AND ts.state_code = 'rejected'
ON CONFLICT (from_state_id, to_state_id, action_code) DO NOTHING;

-- เฉพาะ reject_slip ให้ผู้ให้เช่าทำได้ (cancel_order_cleanup เป็นผลข้างเคียงของระบบ ไม่มีบทบาท)
INSERT INTO public.workflow_transition_role (transition_id, role_id)
SELECT t.transition_id, r.role_id
FROM public.workflow_transition t
JOIN public.workflow_state fs ON fs.state_id = t.from_state_id
JOIN public.workflow w        ON w.workflow_id = fs.workflow_id AND w.workflow_code = 'PAYMENT'
JOIN public.role r            ON r.role_type = 'lender'
WHERE t.action_code = 'reject_slip'
ON CONFLICT DO NOTHING;

COMMIT;