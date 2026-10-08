-- ============================================================================
-- 27_dynamic_workflow_core.sql — Dynamic Workflow เฟส 1 (ฐานข้อมูล)
--
-- แนวทาง: "เพิ่ม ไม่แทนที่" — ไม่ลบหรือเปลี่ยนคอลัมน์สถานะข้อความเดิมและฟังก์ชันเดิมเลย
--   • เพิ่ม 7 ตารางของ workflow + คอลัมน์ *_id (FK) ในตารางธุรกิจ 7 คอลัมน์
--   • trigger "sync" คอยเติม *_id ให้ตรงกับสถานะข้อความทุกครั้งที่บันทึก
--   • trigger "guard" ตรวจเส้นทางเปลี่ยนสถานะ ตามโหมดใน system_config (workflow_mode)
--       static  = ไม่ทำอะไร (ทำงานเหมือนเดิมทุกประการ)  ← ค่าเริ่มต้นหลังรันไฟล์นี้
--       shadow  = ตรวจแล้วบันทึกการละเมิดลง workflow_history แต่ยังปล่อยผ่าน
--       dynamic = ตรวจแล้วปฏิเสธการเปลี่ยนสถานะที่ไม่มีเส้นทางหรือผู้ทำไม่มีสิทธิ์
--   • ย้อนกลับด้วยไฟล์ 27_dynamic_workflow_core.down.sql
--
-- สลับโหมด (ไม่ต้อง deploy):
--   UPDATE system_config SET config_value = 'shadow' WHERE config_key = 'workflow_mode';
--
-- ข้อจำกัดของเฟสนี้ (ตั้งใจ):
--   • ค่าตั้งใน system_config (8 ชม., 2 วัน, 10% ฯลฯ) ถูกเก็บไว้แล้ว แต่ cron/ฟังก์ชันเดิม
--     ยังใช้ค่าคงที่ของตัวเอง (มีเพียง workflow_mode ที่ถูกอ่านจริง) — ย้ายไปอ่านจากตารางในเฟสถัดไป
--   • ตาราง workflow_transition_condition ยังไม่มีข้อมูลและยังไม่ถูกตรวจ (ต้องมี engine ฝั่งแอป)
--   • ไม่บันทึกประวัติตอนสร้างรายการใหม่ (INSERT) บันทึกเฉพาะการเปลี่ยนสถานะ (UPDATE)
--   • ตรวจสิทธิ์ผู้ทำเฉพาะการเรียกที่มี JWT ของผู้ใช้ (auth.uid() ไม่ว่าง) ส่วนงาน cron และ
--     API ที่ใช้ service role ถูกมองเป็น "ระบบ" และข้ามการตรวจสิทธิ์ (ยังตรวจเส้นทาง)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) ตาราง
-- ---------------------------------------------------------------------------
CREATE TABLE public.system_config (
  config_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key   text NOT NULL UNIQUE,
  config_value text NOT NULL,
  value_type   text NOT NULL DEFAULT 'text' CHECK (value_type IN ('text','int','numeric','bool')),
  description  text,
  updated_by   uuid REFERENCES public.useraccount(user_id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow (
  workflow_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_code text NOT NULL UNIQUE,
  workflow_name text NOT NULL,
  entity_table  text NOT NULL,
  description   text,
  is_active     boolean NOT NULL DEFAULT true
);

CREATE TABLE public.workflow_state (
  state_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   uuid NOT NULL REFERENCES public.workflow(workflow_id) ON DELETE CASCADE,
  state_code    text NOT NULL,
  state_name_th text NOT NULL,
  is_initial    boolean NOT NULL DEFAULT false,
  is_final      boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  CONSTRAINT workflow_state_unique_code UNIQUE (workflow_id, state_code)
);
CREATE UNIQUE INDEX idx_workflow_state_one_initial ON public.workflow_state (workflow_id) WHERE is_initial;

CREATE TABLE public.workflow_transition (
  transition_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_state_id     uuid NOT NULL REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT,
  to_state_id       uuid NOT NULL REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT,
  action_code       text NOT NULL,
  is_automatic      boolean NOT NULL DEFAULT false,
  timeout_config_id uuid REFERENCES public.system_config(config_id) ON DELETE SET NULL,
  description       text,
  CONSTRAINT workflow_transition_unique UNIQUE (from_state_id, to_state_id, action_code),
  CONSTRAINT workflow_transition_no_self CHECK (from_state_id <> to_state_id)
);

CREATE TABLE public.workflow_transition_role (
  transition_id uuid NOT NULL REFERENCES public.workflow_transition(transition_id) ON DELETE CASCADE,
  role_id       uuid NOT NULL REFERENCES public.role(role_id) ON DELETE RESTRICT,
  PRIMARY KEY (transition_id, role_id)
);

CREATE TABLE public.workflow_transition_condition (
  condition_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transition_id    uuid NOT NULL REFERENCES public.workflow_transition(transition_id) ON DELETE CASCADE,
  condition_type   text NOT NULL,
  condition_param  text,
  error_message_th text
);

CREATE TABLE public.workflow_history (
  history_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   uuid NOT NULL REFERENCES public.workflow(workflow_id) ON DELETE RESTRICT,
  entity_id     uuid NOT NULL,
  from_state_id uuid REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT,
  to_state_id   uuid NOT NULL REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT,
  transition_id uuid REFERENCES public.workflow_transition(transition_id) ON DELETE SET NULL,
  changed_by    uuid REFERENCES public.useraccount(user_id) ON DELETE SET NULL,
  reason        text,
  changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflow_history_entity ON public.workflow_history (workflow_id, entity_id, changed_at);

-- ---------------------------------------------------------------------------
-- 2) RLS: ตารางกฎอ่านได้ทุกคนที่ล็อกอิน แก้ได้เฉพาะแอดมิน / ค่าตั้งและประวัติเฉพาะแอดมิน
-- ---------------------------------------------------------------------------
ALTER TABLE public.system_config                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_state               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_transition          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_transition_role     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_transition_condition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_history             ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_config_admin_all ON public.system_config FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY workflow_read       ON public.workflow FOR SELECT TO authenticated USING (true);
CREATE POLICY workflow_admin_all  ON public.workflow FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY workflow_state_read      ON public.workflow_state FOR SELECT TO authenticated USING (true);
CREATE POLICY workflow_state_admin_all ON public.workflow_state FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY workflow_transition_read      ON public.workflow_transition FOR SELECT TO authenticated USING (true);
CREATE POLICY workflow_transition_admin_all ON public.workflow_transition FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY workflow_transition_role_read      ON public.workflow_transition_role FOR SELECT TO authenticated USING (true);
CREATE POLICY workflow_transition_role_admin_all ON public.workflow_transition_role FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY workflow_transition_condition_read      ON public.workflow_transition_condition FOR SELECT TO authenticated USING (true);
CREATE POLICY workflow_transition_condition_admin_all ON public.workflow_transition_condition FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY workflow_history_admin_read ON public.workflow_history FOR SELECT TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3) ข้อมูลตั้งต้น: ค่าตั้ง, 7 วงจร, สถานะ (จากค่าใน CHECK เดิม), เส้นทางที่พบในโค้ดจริง
-- ---------------------------------------------------------------------------
INSERT INTO public.system_config (config_key, config_value, value_type, description) VALUES
  ('workflow_mode',                'static', 'text',    'โหมด workflow: static (ปิด) / shadow (ตรวจแล้วบันทึกอย่างเดียว) / dynamic (ตรวจและปฏิเสธ)'),
  ('approval_timeout_hours',       '8',      'int',     'ผู้ให้เช่าต้องตอบรับคำขอภายในกี่ชั่วโมง'),
  ('payment_timeout_hours',        '8',      'int',     'ผู้เช่าต้องชำระเงินภายในกี่ชั่วโมงหลังอนุมัติ'),
  ('slip_review_timeout_hours',    '8',      'int',     'ผู้ให้เช่าต้องตรวจสลิปภายในกี่ชั่วโมง (เกินแล้วระบบอนุมัติให้)'),
  ('noshow_grace_hours',           '1',      'int',     'ผ่อนผันกี่ชั่วโมงหลังเวลานัดก่อนนับว่าไม่มาตามนัด'),
  ('cancel_threshold_days',        '2',      'int',     'ยกเลิกก่อนวันนัดรับน้อยกว่าหรือเท่ากับกี่วันถือว่ายกเลิกช้า'),
  ('platform_fee_percent',         '10',     'numeric', 'ค่าธรรมเนียมแพลตฟอร์ม (เปอร์เซ็นต์)'),
  ('extra_payment_deadline_hours', '48',     'int',     'ผู้เช่าต้องจ่ายส่วนต่างค่าเสียหายภายในกี่ชั่วโมง'),
  ('reminder_days_before',         '1',      'int',     'แจ้งเตือนล่วงหน้ากี่วันก่อนวันนัดรับ/นัดคืน');

INSERT INTO public.workflow (workflow_code, workflow_name, entity_table, description) VALUES
  ('RENTAL_ORDER',          'วงจรออเดอร์เช่า',            'rentalorder', 'สถานะของออเดอร์เช่า'),
  ('PAYMENT',               'วงจรการชำระเงิน',            'payment',     'สถานะของรายการชำระเงิน'),
  ('RENTAL_REPORT',         'วงจรรายงานข้อพิพาท',         'rentalreport','สถานะของรายงานปัญหา'),
  ('IDENTITY_VERIFICATION', 'วงจรยืนยันตัวตน (KYC)',      'useraccount', 'ใช้คอลัมน์ identity_verification_status'),
  ('BANK_VERIFICATION',     'วงจรยืนยันบัญชีธนาคาร',      'bankaccount', 'ใช้คอลัมน์ verification_status'),
  ('ITEM_LISTING',          'วงจรสถานะสินค้า',            'item',        'สถานะของประกาศสินค้า'),
  ('USER_ACCOUNT',          'วงจรสถานะบัญชีผู้ใช้',       'useraccount', 'ใช้คอลัมน์ status');

-- สถานะ (is_final คำนวณจากเส้นทางทีหลัง)
INSERT INTO public.workflow_state (workflow_id, state_code, state_name_th, is_initial, sort_order)
SELECT w.workflow_id, v.state_code, v.name_th, v.is_initial, v.ord
FROM (VALUES
  ('RENTAL_ORDER','requested','ขอเช่า (รออนุมัติ)',true,1),
  ('RENTAL_ORDER','awaiting_payment','รอชำระเงิน',false,2),
  ('RENTAL_ORDER','paid','ชำระเงินแล้ว',false,3),
  ('RENTAL_ORDER','item_sent','ส่งมอบแล้ว (กำลังเช่า)',false,4),
  ('RENTAL_ORDER','item_received','รับของแล้ว (ไม่มีโค้ดตั้งค่านี้)',false,5),
  ('RENTAL_ORDER','item_returned','คืนของแล้ว (ไม่มีโค้ดตั้งค่านี้)',false,6),
  ('RENTAL_ORDER','completed','เสร็จสมบูรณ์',false,7),
  ('RENTAL_ORDER','awaiting_additional_payment','รอจ่ายส่วนต่างค่าเสียหาย',false,8),
  ('RENTAL_ORDER','disputed_at_meetup','ข้อพิพาทหน้างาน',false,9),
  ('RENTAL_ORDER','cancelled','ยกเลิก (ก่อนชำระเงิน)',false,10),
  ('RENTAL_ORDER','cancelled_by_renter','ผู้เช่ายกเลิก (หลังชำระเงิน)',false,11),
  ('RENTAL_ORDER','cancelled_by_lender','ผู้ให้เช่ายกเลิก (หลังชำระเงิน)',false,12),
  ('RENTAL_ORDER','rejected_by_lender','ผู้ให้เช่าปฏิเสธ/ไม่ตอบ',false,13),
  ('RENTAL_ORDER','renter_noshow','ผู้เช่าไม่มาตามนัด',false,14),
  ('RENTAL_ORDER','lender_noshow','ผู้ให้เช่าไม่มาตามนัด',false,15),
  ('RENTAL_ORDER','rejected_at_meetup','ผู้เช่าไม่รับของหน้างาน',false,16),
  ('RENTAL_ORDER','refunded_dispute','คืนเงินจากข้อพิพาท',false,17),
  ('RENTAL_ORDER','item_not_returned','ไม่คืนของ',false,18),
  ('PAYMENT','pending','รอตรวจสลิป',true,1),
  ('PAYMENT','paid','ชำระแล้ว',false,2),
  ('PAYMENT','rejected','สลิปไม่ผ่าน (ไม่มีโค้ดตั้งค่านี้)',false,3),
  ('PAYMENT','refunded','คืนเงินแล้ว',false,4),
  ('RENTAL_REPORT','pending_investigation','รอตรวจสอบ',true,1),
  ('RENTAL_REPORT','resolved_renter_fault','ตัดสิน: ผู้เช่าผิด',false,2),
  ('RENTAL_REPORT','resolved_lender_fault','ตัดสิน: ผู้ให้เช่าผิด',false,3),
  ('RENTAL_REPORT','dismissed','ยกเลิกคำร้อง',false,4),
  ('IDENTITY_VERIFICATION','pending','รอตรวจสอบ',true,1),
  ('IDENTITY_VERIFICATION','verified','ยืนยันแล้ว',false,2),
  ('IDENTITY_VERIFICATION','rejected','ถูกปฏิเสธ',false,3),
  ('BANK_VERIFICATION','pending','รอตรวจสอบ',true,1),
  ('BANK_VERIFICATION','verified','ยืนยันแล้ว',false,2),
  ('BANK_VERIFICATION','rejected','ถูกปฏิเสธ',false,3),
  ('ITEM_LISTING','available','พร้อมให้เช่า',true,1),
  ('ITEM_LISTING','rented','กำลังถูกเช่า',false,2),
  ('ITEM_LISTING','maintenance','ปิดปรับปรุง',false,3),
  ('ITEM_LISTING','inactive','ซ่อนประกาศ',false,4),
  ('USER_ACCOUNT','Active','ใช้งานปกติ',true,1),
  ('USER_ACCOUNT','Suspended','ถูกระงับ',false,2),
  ('USER_ACCOUNT','Banned','ถูกแบน (ไม่มีโค้ดตั้งค่านี้)',false,3),
  ('USER_ACCOUNT','Deactivated','ปิดบัญชีแล้ว',false,4)
) AS v(wcode, state_code, name_th, is_initial, ord)
JOIN public.workflow w ON w.workflow_code = v.wcode;

-- เส้นทาง: (วงจร, จาก, ไป, action, อัตโนมัติ, ชื่อค่าตั้งเวลาหมดอายุ, บทบาทที่ทำได้ คั่นด้วย comma, คำอธิบาย)
CREATE TEMP TABLE _wf_seed (
  wcode text, from_code text, to_code text, action text, auto boolean, cfg_key text, roles text, descr text
) ON COMMIT DROP;

INSERT INTO _wf_seed VALUES
  ('RENTAL_ORDER','requested','awaiting_payment','approve',false,NULL,'lender','ผู้ให้เช่าอนุมัติคำขอ'),
  ('RENTAL_ORDER','requested','rejected_by_lender','reject',false,NULL,'lender','ผู้ให้เช่าปฏิเสธคำขอ'),
  ('RENTAL_ORDER','requested','rejected_by_lender','auto_expire',true,'approval_timeout_hours',NULL,'ผู้ให้เช่าไม่ตอบภายในเวลาที่กำหนด'),
  ('RENTAL_ORDER','requested','cancelled','cancel',false,NULL,'renter,lender','ยกเลิกก่อนอนุมัติ'),
  ('RENTAL_ORDER','requested','cancelled','auto_cancel_overlap',true,NULL,NULL,'ยกเลิกคำขอที่วันซ้อนกับคำขอที่อนุมัติแล้ว'),
  ('RENTAL_ORDER','awaiting_payment','cancelled','cancel',false,NULL,'renter,lender','ยกเลิกก่อนชำระเงิน'),
  ('RENTAL_ORDER','awaiting_payment','cancelled','auto_expire',true,'payment_timeout_hours',NULL,'ไม่ชำระเงินภายในเวลาที่กำหนด'),
  ('RENTAL_ORDER','awaiting_payment','paid','confirm_payment',false,NULL,'lender','ผู้ให้เช่าตรวจสลิปผ่าน'),
  ('RENTAL_ORDER','awaiting_payment','paid','auto_approve_slip',true,'slip_review_timeout_hours',NULL,'ผู้ให้เช่าไม่ตรวจสลิปภายในเวลาที่กำหนด'),
  ('RENTAL_ORDER','paid','item_sent','handover_complete',false,NULL,'renter,lender','หลักฐานก่อนเช่าครบทั้งสองฝ่าย'),
  ('RENTAL_ORDER','paid','cancelled_by_renter','cancel_paid',false,NULL,'renter','ผู้เช่ายกเลิกหลังชำระเงิน'),
  ('RENTAL_ORDER','paid','cancelled_by_lender','cancel_paid',false,NULL,'lender','ผู้ให้เช่ายกเลิกหลังชำระเงิน'),
  ('RENTAL_ORDER','paid','lender_noshow','auto_noshow',true,'noshow_grace_hours',NULL,'ผู้ให้เช่าไม่มาตามนัด'),
  ('RENTAL_ORDER','paid','renter_noshow','auto_noshow',true,'noshow_grace_hours',NULL,'ผู้เช่าไม่มาตามนัด'),
  ('RENTAL_ORDER','item_sent','completed','return_complete',false,NULL,'renter,lender','หลักฐานหลังเช่าครบทั้งสองฝ่าย'),
  ('RENTAL_ORDER','item_sent','completed','auto_return_close',true,'noshow_grace_hours',NULL,'ผู้ให้เช่าไม่ยืนยันการคืนภายในเวลาที่กำหนด'),
  ('RENTAL_ORDER','item_sent','rejected_at_meetup','reject_changed_mind',false,NULL,'renter','ผู้เช่าเปลี่ยนใจไม่รับของหน้างาน'),
  ('RENTAL_ORDER','item_sent','disputed_at_meetup','report_false_ad',false,NULL,'renter','ผู้เช่ารายงานของไม่ตรงปก'),
  ('RENTAL_ORDER','disputed_at_meetup','refunded_dispute','resolve_false_ad_approved',false,NULL,'admin','แอดมินตัดสินให้ผู้เช่าชนะ'),
  ('RENTAL_ORDER','disputed_at_meetup','completed','resolve_false_ad_rejected',false,NULL,'admin','แอดมินตัดสินให้ผู้ให้เช่าชนะ'),
  ('RENTAL_ORDER','item_sent','item_not_returned','resolve_not_returned',false,NULL,'admin','แอดมินตัดสินว่าไม่คืนของ'),
  ('RENTAL_ORDER','item_sent','completed','resolve_not_returned_rejected',false,NULL,'admin','แอดมินตัดสินว่าคืนของแล้ว'),
  ('RENTAL_ORDER','completed','awaiting_additional_payment','resolve_damage_excess',false,NULL,'admin','ค่าเสียหายเกินเงินประกัน (ยื่นรายงานได้หลังจบงาน)'),
  ('RENTAL_ORDER','awaiting_additional_payment','completed','confirm_additional_payment',false,NULL,'admin','ยืนยันการชำระส่วนต่าง'),
  ('PAYMENT','pending','paid','confirm_payment',false,NULL,'lender','ผู้ให้เช่าตรวจสลิปผ่าน'),
  ('PAYMENT','pending','paid','auto_approve_slip',true,'slip_review_timeout_hours',NULL,'ระบบอนุมัติสลิปเมื่อเกินเวลา'),
  ('PAYMENT','pending','paid','confirm_additional_payment',false,NULL,'admin','ยืนยันการชำระส่วนต่างค่าเสียหาย'),
  ('RENTAL_REPORT','pending_investigation','resolved_renter_fault','resolve',false,NULL,'admin','แอดมินตัดสิน: ผู้เช่าผิด'),
  ('RENTAL_REPORT','pending_investigation','resolved_lender_fault','resolve',false,NULL,'admin','แอดมินตัดสิน: ผู้ให้เช่าผิด'),
  ('RENTAL_REPORT','pending_investigation','dismissed','dismiss',false,NULL,'admin','แอดมินยกคำร้อง'),
  ('IDENTITY_VERIFICATION','pending','verified','approve_kyc',false,NULL,'admin','แอดมินอนุมัติการยืนยันตัวตน'),
  ('IDENTITY_VERIFICATION','pending','rejected','reject_kyc',false,NULL,'admin','แอดมินปฏิเสธการยืนยันตัวตน'),
  ('BANK_VERIFICATION','pending','verified','approve_bank',false,NULL,'admin','แอดมินอนุมัติบัญชีธนาคาร'),
  ('BANK_VERIFICATION','pending','rejected','reject_bank',false,NULL,'admin','แอดมินปฏิเสธบัญชีธนาคาร'),
  ('BANK_VERIFICATION','verified','pending','change_bank',false,NULL,'renter,lender','แก้บัญชีธนาคาร ต้องตรวจสอบใหม่'),
  ('BANK_VERIFICATION','rejected','pending','change_bank',false,NULL,'renter,lender','ส่งบัญชีใหม่หลังถูกปฏิเสธ'),
  ('USER_ACCOUNT','Active','Suspended','suspend',false,NULL,'admin','แอดมินระงับบัญชี'),
  ('USER_ACCOUNT','Active','Suspended','auto_suspend',true,'extra_payment_deadline_hours',NULL,'ค้างจ่ายส่วนต่างเกินกำหนด'),
  ('USER_ACCOUNT','Active','Deactivated','deactivate',false,NULL,'renter,lender','ผู้ใช้ปิดบัญชีของตัวเอง');

-- สถานะสินค้า: เปลี่ยนไปมาระหว่าง 4 สถานะได้อิสระ โดยผู้ให้เช่าหรือแอดมิน (ตามที่โค้ดเป็นอยู่)
INSERT INTO _wf_seed
SELECT 'ITEM_LISTING', a.state_code, b.state_code, 'set_status', false, NULL, 'lender,admin', 'ผู้ให้เช่าเปลี่ยนสถานะสินค้า'
FROM public.workflow_state a
JOIN public.workflow_state b ON b.workflow_id = a.workflow_id AND b.state_code <> a.state_code
JOIN public.workflow w ON w.workflow_id = a.workflow_id AND w.workflow_code = 'ITEM_LISTING';

INSERT INTO public.workflow_transition (from_state_id, to_state_id, action_code, is_automatic, timeout_config_id, description)
SELECT fs.state_id, ts.state_id, s.action, s.auto, c.config_id, s.descr
FROM _wf_seed s
JOIN public.workflow w        ON w.workflow_code = s.wcode
JOIN public.workflow_state fs ON fs.workflow_id = w.workflow_id AND fs.state_code = s.from_code
JOIN public.workflow_state ts ON ts.workflow_id = w.workflow_id AND ts.state_code = s.to_code
LEFT JOIN public.system_config c ON c.config_key = s.cfg_key;

INSERT INTO public.workflow_transition_role (transition_id, role_id)
SELECT t.transition_id, r.role_id
FROM _wf_seed s
JOIN public.workflow w        ON w.workflow_code = s.wcode
JOIN public.workflow_state fs ON fs.workflow_id = w.workflow_id AND fs.state_code = s.from_code
JOIN public.workflow_state ts ON ts.workflow_id = w.workflow_id AND ts.state_code = s.to_code
JOIN public.workflow_transition t ON t.from_state_id = fs.state_id AND t.to_state_id = ts.state_id AND t.action_code = s.action
CROSS JOIN LATERAL regexp_split_to_table(s.roles, ',') AS rn(role_type)
JOIN public.role r ON r.role_type = rn.role_type
WHERE s.roles IS NOT NULL;

-- สถานะที่ไม่มีเส้นทางออก = สถานะสิ้นสุด
UPDATE public.workflow_state st
SET is_final = NOT EXISTS (SELECT 1 FROM public.workflow_transition t WHERE t.from_state_id = st.state_id);

-- ---------------------------------------------------------------------------
-- 4) คอลัมน์ *_id (FK) ในตารางธุรกิจ — เพิ่มอย่างเดียว ไม่แตะคอลัมน์สถานะข้อความเดิม
-- ---------------------------------------------------------------------------
ALTER TABLE public.rentalorder  ADD COLUMN status_id              uuid REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT;
ALTER TABLE public.payment      ADD COLUMN status_id              uuid REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT;
ALTER TABLE public.rentalreport ADD COLUMN status_id              uuid REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT;
ALTER TABLE public.bankaccount  ADD COLUMN verification_status_id uuid REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT;
ALTER TABLE public.item         ADD COLUMN status_id              uuid REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT;
ALTER TABLE public.useraccount  ADD COLUMN account_status_id      uuid REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT;
ALTER TABLE public.useraccount  ADD COLUMN identity_status_id     uuid REFERENCES public.workflow_state(state_id) ON DELETE RESTRICT;

CREATE INDEX idx_rentalorder_status_id  ON public.rentalorder (status_id);
CREATE INDEX idx_payment_status_id      ON public.payment (status_id);
CREATE INDEX idx_rentalreport_status_id ON public.rentalreport (status_id);

-- ---------------------------------------------------------------------------
-- 5) ฟังก์ชันช่วย
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.workflow_mode() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT config_value FROM public.system_config WHERE config_key = 'workflow_mode'), 'static')
$$;

CREATE FUNCTION public.workflow_state_id(p_workflow text, p_state text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.state_id
  FROM public.workflow_state s JOIN public.workflow w ON w.workflow_id = s.workflow_id
  WHERE w.workflow_code = p_workflow AND s.state_code = p_state
$$;

-- บทบาทของผู้เรียก (auth.uid) เมื่อเทียบกับรายการนั้น: ผู้เช่า/ผู้ให้เช่า "ของรายการนี้" และแอดมิน
CREATE FUNCTION public.workflow_actor_roles(p_workflow text, p_row jsonb, p_uid uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_roles  text[] := '{}';
  v_order  uuid;
  v_item   uuid;
  v_renter uuid;
  v_lender uuid;
  v_owner  uuid;
BEGIN
  IF p_uid IS NULL THEN
    RETURN v_roles;
  END IF;

  IF public.is_admin() THEN
    v_roles := array_append(v_roles, 'admin');
  END IF;

  IF p_workflow = 'RENTAL_ORDER' THEN
    v_renter := (p_row->>'user_id')::uuid;
    v_item   := (p_row->>'item_id')::uuid;
  ELSIF p_workflow IN ('PAYMENT', 'RENTAL_REPORT') THEN
    v_order := nullif(p_row->>'order_id', '')::uuid;
    IF v_order IS NOT NULL THEN
      SELECT user_id, item_id INTO v_renter, v_item FROM public.rentalorder WHERE order_id = v_order;
    END IF;
  ELSIF p_workflow = 'ITEM_LISTING' THEN
    v_lender := (p_row->>'user_id')::uuid;
  ELSIF p_workflow IN ('USER_ACCOUNT', 'IDENTITY_VERIFICATION', 'BANK_VERIFICATION') THEN
    v_owner := (p_row->>'user_id')::uuid;
    IF p_uid = v_owner THEN
      v_roles := v_roles || ARRAY(
        SELECT r.role_type FROM public.user_role_assignment ura
        JOIN public.role r ON r.role_id = ura.role_id
        WHERE ura.user_id = p_uid AND r.role_type IN ('renter', 'lender'));
    END IF;
  END IF;

  IF v_item IS NOT NULL AND v_lender IS NULL THEN
    SELECT user_id INTO v_lender FROM public.item WHERE item_id = v_item;
  END IF;
  IF v_renter IS NOT NULL AND p_uid = v_renter THEN
    v_roles := array_append(v_roles, 'renter');
  END IF;
  IF v_lender IS NOT NULL AND p_uid = v_lender THEN
    v_roles := array_append(v_roles, 'lender');
  END IF;

  RETURN v_roles;
END;
$$;

-- เติมคอลัมน์ *_id ให้ตรงกับสถานะข้อความทุกครั้งที่ INSERT/UPDATE
-- args: workflow_code, คอลัมน์ข้อความ, คอลัมน์ *_id
CREATE FUNCTION public.trg_wf_sync_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW := jsonb_populate_record(
    NEW,
    jsonb_build_object(TG_ARGV[2], public.workflow_state_id(TG_ARGV[0], to_jsonb(NEW)->>TG_ARGV[1]))
  );
  RETURN NEW;
END;
$$;

-- ตรวจเส้นทางเปลี่ยนสถานะตามโหมด
-- args: workflow_code, คอลัมน์ข้อความ, คอลัมน์คีย์หลักของตาราง
CREATE FUNCTION public.trg_wf_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wf     text := TG_ARGV[0];
  v_col    text := TG_ARGV[1];
  v_pk     text := TG_ARGV[2];
  v_mode   text := public.workflow_mode();
  v_old    text;
  v_new    text;
  v_wfid   uuid;
  v_from   uuid;
  v_to     uuid;
  v_tr     uuid;
  v_uid    uuid := auth.uid();
  v_entity uuid;
  v_reason text;
BEGIN
  IF v_mode NOT IN ('shadow', 'dynamic') THEN
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD)->>v_col;
  v_new := to_jsonb(NEW)->>v_col;
  IF v_old IS NOT DISTINCT FROM v_new THEN
    RETURN NEW;
  END IF;

  SELECT workflow_id INTO v_wfid FROM public.workflow WHERE workflow_code = v_wf AND is_active;
  IF v_wfid IS NULL THEN
    RETURN NEW;
  END IF;

  v_from := public.workflow_state_id(v_wf, v_old);
  v_to   := public.workflow_state_id(v_wf, v_new);
  IF v_to IS NULL THEN
    RETURN NEW;  -- ค่านอกรายการสถานะ ปล่อยให้ CHECK constraint เดิมจัดการ
  END IF;
  v_entity := (to_jsonb(NEW)->>v_pk)::uuid;

  IF v_from IS NOT NULL THEN
    SELECT t.transition_id INTO v_tr
    FROM public.workflow_transition t
    WHERE t.from_state_id = v_from AND t.to_state_id = v_to
      AND (
        v_uid IS NULL
        OR EXISTS (
          SELECT 1 FROM public.workflow_transition_role tr
          JOIN public.role r ON r.role_id = tr.role_id
          WHERE tr.transition_id = t.transition_id
            AND r.role_type = ANY (public.workflow_actor_roles(v_wf, to_jsonb(NEW), v_uid))
        )
      )
    ORDER BY t.action_code
    LIMIT 1;
  END IF;

  IF v_tr IS NOT NULL THEN
    INSERT INTO public.workflow_history (workflow_id, entity_id, from_state_id, to_state_id, transition_id, changed_by)
    VALUES (v_wfid, v_entity, v_from, v_to, v_tr, v_uid);
    RETURN NEW;
  END IF;

  IF v_from IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.workflow_transition WHERE from_state_id = v_from AND to_state_id = v_to) THEN
    v_reason := 'ไม่มีเส้นทาง ' || coalesce(v_old, '(ว่าง)') || ' -> ' || v_new;
  ELSE
    v_reason := 'ผู้ทำไม่มีสิทธิ์ในเส้นทาง ' || v_old || ' -> ' || v_new;
  END IF;

  IF v_mode = 'dynamic' THEN
    RAISE EXCEPTION 'workflow: %', v_reason USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.workflow_history (workflow_id, entity_id, from_state_id, to_state_id, transition_id, changed_by, reason)
  VALUES (v_wfid, v_entity, v_from, v_to, NULL, v_uid, 'SHADOW_VIOLATION: ' || v_reason);
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) เติม *_id ให้แถวเดิม (ปิด trigger เดิมชั่วคราว กันการอัปเดต updated_at และการแจ้งเตือนซ้ำ)
-- ---------------------------------------------------------------------------
ALTER TABLE public.rentalorder  DISABLE TRIGGER USER;
ALTER TABLE public.payment      DISABLE TRIGGER USER;
ALTER TABLE public.rentalreport DISABLE TRIGGER USER;
ALTER TABLE public.bankaccount  DISABLE TRIGGER USER;
ALTER TABLE public.item         DISABLE TRIGGER USER;
ALTER TABLE public.useraccount  DISABLE TRIGGER USER;

UPDATE public.rentalorder  SET status_id              = public.workflow_state_id('RENTAL_ORDER', status);
UPDATE public.payment      SET status_id              = public.workflow_state_id('PAYMENT', status);
UPDATE public.rentalreport SET status_id              = public.workflow_state_id('RENTAL_REPORT', status);
UPDATE public.bankaccount  SET verification_status_id = public.workflow_state_id('BANK_VERIFICATION', verification_status);
UPDATE public.item         SET status_id              = public.workflow_state_id('ITEM_LISTING', status);
UPDATE public.useraccount  SET account_status_id      = public.workflow_state_id('USER_ACCOUNT', status),
                               identity_status_id     = public.workflow_state_id('IDENTITY_VERIFICATION', identity_verification_status);

ALTER TABLE public.rentalorder  ENABLE TRIGGER USER;
ALTER TABLE public.payment      ENABLE TRIGGER USER;
ALTER TABLE public.rentalreport ENABLE TRIGGER USER;
ALTER TABLE public.bankaccount  ENABLE TRIGGER USER;
ALTER TABLE public.item         ENABLE TRIGGER USER;
ALTER TABLE public.useraccount  ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- 7) Trigger (ชื่อขึ้นต้น trg_wf_a_ = sync ทำงานก่อน trg_wf_b_ = guard)
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_wf_a_sync BEFORE INSERT OR UPDATE ON public.rentalorder  FOR EACH ROW EXECUTE FUNCTION public.trg_wf_sync_status('RENTAL_ORDER', 'status', 'status_id');
CREATE TRIGGER trg_wf_a_sync BEFORE INSERT OR UPDATE ON public.payment      FOR EACH ROW EXECUTE FUNCTION public.trg_wf_sync_status('PAYMENT', 'status', 'status_id');
CREATE TRIGGER trg_wf_a_sync BEFORE INSERT OR UPDATE ON public.rentalreport FOR EACH ROW EXECUTE FUNCTION public.trg_wf_sync_status('RENTAL_REPORT', 'status', 'status_id');
CREATE TRIGGER trg_wf_a_sync BEFORE INSERT OR UPDATE ON public.bankaccount  FOR EACH ROW EXECUTE FUNCTION public.trg_wf_sync_status('BANK_VERIFICATION', 'verification_status', 'verification_status_id');
CREATE TRIGGER trg_wf_a_sync BEFORE INSERT OR UPDATE ON public.item         FOR EACH ROW EXECUTE FUNCTION public.trg_wf_sync_status('ITEM_LISTING', 'status', 'status_id');
CREATE TRIGGER trg_wf_a_sync_account  BEFORE INSERT OR UPDATE ON public.useraccount FOR EACH ROW EXECUTE FUNCTION public.trg_wf_sync_status('USER_ACCOUNT', 'status', 'account_status_id');
CREATE TRIGGER trg_wf_a_sync_identity BEFORE INSERT OR UPDATE ON public.useraccount FOR EACH ROW EXECUTE FUNCTION public.trg_wf_sync_status('IDENTITY_VERIFICATION', 'identity_verification_status', 'identity_status_id');

CREATE TRIGGER trg_wf_b_guard BEFORE UPDATE ON public.rentalorder  FOR EACH ROW EXECUTE FUNCTION public.trg_wf_guard('RENTAL_ORDER', 'status', 'order_id');
CREATE TRIGGER trg_wf_b_guard BEFORE UPDATE ON public.payment      FOR EACH ROW EXECUTE FUNCTION public.trg_wf_guard('PAYMENT', 'status', 'payment_id');
CREATE TRIGGER trg_wf_b_guard BEFORE UPDATE ON public.rentalreport FOR EACH ROW EXECUTE FUNCTION public.trg_wf_guard('RENTAL_REPORT', 'status', 'report_id');
CREATE TRIGGER trg_wf_b_guard BEFORE UPDATE ON public.bankaccount  FOR EACH ROW EXECUTE FUNCTION public.trg_wf_guard('BANK_VERIFICATION', 'verification_status', 'bank_account_id');
CREATE TRIGGER trg_wf_b_guard BEFORE UPDATE ON public.item         FOR EACH ROW EXECUTE FUNCTION public.trg_wf_guard('ITEM_LISTING', 'status', 'item_id');
CREATE TRIGGER trg_wf_b_guard_account  BEFORE UPDATE ON public.useraccount FOR EACH ROW EXECUTE FUNCTION public.trg_wf_guard('USER_ACCOUNT', 'status', 'user_id');
CREATE TRIGGER trg_wf_b_guard_identity BEFORE UPDATE ON public.useraccount FOR EACH ROW EXECUTE FUNCTION public.trg_wf_guard('IDENTITY_VERIFICATION', 'identity_verification_status', 'user_id');

COMMIT;
