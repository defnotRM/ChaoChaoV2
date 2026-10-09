# Database — ChaoChao

ฐานข้อมูลอยู่บน Supabase Cloud (project: ChaoChao, ref: `awnwvckyjkkuhufmdgas`)
โฟลเดอร์นี้เก็บ "ประวัติการเปลี่ยนแปลง" ส่วนไฟล์ติดตั้งใหม่อยู่ที่ `supabase/setup/`

## ต้องการทำอะไร

### A) ติดตั้งโปรเจกต์ Supabase ใหม่ (dev / staging / เครื่องเพื่อนร่วมทีม)

ใช้ไฟล์เดียว: **`supabase/setup/full_install.sql`**

1. สร้าง Supabase project ใหม่ (ว่างเปล่า)
2. SQL Editor → New query → วางทั้งไฟล์ → Run
3. ตั้ง `.env.local` ของแอปให้ชี้ไป project ใหม่
4. ทำตามหัวข้อ "ทำเองหลังติดตั้ง" ท้ายไฟล์ (สร้างแอดมินคนแรก, เปิด Realtime ถ้าต้องการ)

ไฟล์นี้รวม extension, ตาราง, constraint, index, function, trigger, RLS/policy,
seed data (role, หมวดสินค้า ฯลฯ), storage bucket 4 ตัว และ cron 2 งาน
**ไม่ต้องรันไฟล์เรียงเลขในโฟลเดอร์นี้ร่วมด้วย**
และ **ห้ามรันบน production ที่มีอยู่แล้ว** (จะ error เพราะตารางมีอยู่แล้ว)

### B) แก้ไขฐานข้อมูล production ที่มีอยู่

1. เขียนไฟล์ใหม่ต่อเลข (ถัดจากไฟล์ล่าสุดในรายการด้านล่าง) ในโฟลเดอร์นี้
2. สั่ง apply ผ่าน Supabase (SQL Editor หรือ MCP) แล้ว commit ไฟล์เข้า repo
3. **อัปเดต `supabase/setup/full_install.sql` ให้ตรงกับสภาพใหม่ด้วยทุกครั้ง**
   ไม่เช่นนั้นไฟล์ติดตั้งจะเก่ากว่า production ทันที (ปัญหาเดียวกับที่เกิดกับไฟล์ 07 มาแล้ว)

## ลำดับไฟล์ประวัติ (ใช้อ้างอิงเท่านั้น ไม่ใช่วิธีติดตั้ง)

```
07_baseline_actual_schema.sql
08_tighten_rls_policies.sql
09_structural_additions.sql
10_status_report_cancellation.sql
11_cancellationtype_rls.sql
12_disputed_at_meetup_status.sql
13_identity_verification_fields.sql
14_settlement_rewrite.sql
15_expiry_cron.sql
16_cancel_reason_fields.sql
18_payment_fixes.sql          (17 ถูกรวมเข้า 18 แล้ว ไม่มีไฟล์ 17 แยก)
19_chat_bound_to_order.sql
20_eight_hour_deadlines_2case_cancel.sql
21_itemlocation_multi.sql
22_notification_system.sql
23_review_reply_account_reports.sql
24_item_images_bucket.sql
25_item_condition.sql
26_payment_slip_rejection.sql
```

ทุกไฟล์ข้างบน apply เข้า production แล้ว (ไฟล์ 01-06 เก่าถูกลบไปแล้ว)

**ไฟล์ workflow (apply เข้า production แล้วเมื่อ 8 ต.ค. 2026 โหมดเริ่มต้น shadow):**
`27_dynamic_workflow_core.sql`, `28_workflow_payment_reject.sql`, `29_workflow_config_wiring.sql` (ไฟล์ย้อนกลับอยู่ใน `down/` ชื่อเดียวกันลงท้าย `.down.sql`)

**ไฟล์ความปลอดภัย (ยังไม่ได้ apply เข้า production ต้องทดสอบบน staging และรันโดยเจ้าของฐานข้อมูลก่อน):**
`30_secdef_execute_hardening.sql` (ถอนสิทธิ์เรียกฟังก์ชัน SECURITY DEFINER ผ่าน REST และผูก `p_caller_id` ของ `settle_rental_order` / `cancel_rental_order` กับ `auth.uid()`),
`31_advisor_hardening.sql` (ตั้ง `search_path` ให้ `set_updated_at` และย้าย `btree_gist` ไป schema `extensions`),
`32_stuck_return_notification.sql` (ให้ cron แจ้งเตือนรายวันแจ้งผู้เช่าและแอดมินเมื่อออเดอร์ `item_sent` เลยกำหนดคืนแล้ว ผู้ให้เช่าอัปโหลดรูปคืนแล้วแต่ผู้เช่ายังไม่ยืนยัน ไม่เปลี่ยนสถานะ)
ไฟล์ย้อนกลับอยู่ใน `down/` เช่นเดียวกัน หมายเหตุ: `full_install.sql` ยังเป็นสภาพหลัง 26 ส่วน 27–32 ให้รันต่อท้ายตามลำดับ

## ข้อควรรู้: ไฟล์เรียงเลขไม่ใช่สำเนาที่เล่นซ้ำแล้วได้ production เป๊ะ

ตรวจเมื่อทำ `full_install.sql` โดยเล่นซ้ำ 07→23 บน Postgres ว่าง แล้วเทียบโครงสร้างกับ production
พบว่ารันผ่านและ function/policy/trigger ตรงกัน แต่ **ไฟล์ 07 ซึ่งบันทึกว่าเป็น "ภาพถ่ายของจริง" ไม่ตรง
production ในจุดต่อไปนี้** (production ถูกแก้ผ่าน Supabase Studio ที่ไม่ได้บันทึกเป็นไฟล์)

- คอลัมน์เงิน 9 ตัวเป็น `numeric(12,2)` (07 เป็น `numeric` เฉยๆ), `itemimage.sequence` เป็น NOT NULL
- กฎ `ON DELETE` ของ FK หลายตัว (CASCADE / RESTRICT / SET NULL)
- CHECK เพิ่ม 3 ตัว: `end_date >= start_date` (availability, rentalorder), `user_a <> user_b` (chatroom)
- unique index `idx_itemimage_one_primary_per_item` (1 สินค้ามีรูปหลักได้รูปเดียว)
- PK ของ `user_role_assignment` เรียงเป็น `(user_id, role_id)`

และมีของที่ production มีแต่ไม่อยู่ในไฟล์ไหนเลย: storage bucket 4 ตัว, seed data, การเปิด extension
สิ่งเหล่านี้ถูกรวมไว้ใน `full_install.sql` แล้ว

ตาราง `test_results` มีเฉพาะใน production (ตารางเทสต์ตอนพัฒนา) ไม่ได้ใส่ใน `full_install.sql`

## Supabase project เดียวกันทั้งทีม

ทุกคนที่ทำงานกับข้อมูลร่วมกันต้องชี้ไป Supabase project เดียวกัน ถ้าใครติดตั้งโปรเจกต์แยกของตัวเอง
ข้อมูลจะไม่ตรงกับคนอื่น ถ้าไม่แน่ใจว่าทีมใช้ project ไหน เช็คกับ WiWat (Role B / Port) ก่อน
