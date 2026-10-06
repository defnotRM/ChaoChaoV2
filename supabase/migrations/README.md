# Database Setup — ChaoChao

ไฟล์ SQL ในโฟลเดอร์นี้คือ schema, business logic, RLS policies และ migration
ทั้งหมดของฐานข้อมูล ChaoChao บน Supabase Cloud (project: ChaoChao, ref:
`awnwvckyjkkuhufmdgas`)

## ลำดับการรัน (สำคัญมาก ห้ามสลับ)

**เริ่มจาก `07_baseline_actual_schema.sql` เสมอ ไม่ใช่ `01`**

> ไฟล์ `01-06` เดิมถูกลบไปแล้ว (เขียนไว้ตอนต้นโปรเจกต์ แต่หลังจากนั้นมีการแก้ไข
> schema จริงบนคลาวด์แบบ manual หลายรอบผ่าน Supabase Studio โดยไม่ได้อัปเดต
> ไฟล์ migration ให้ตรงกัน ทำให้ใช้อ้างอิงความจริงไม่ได้อีกต่อไป — ไฟล์
> `07_baseline_actual_schema.sql` คือ "ภาพถ่าย" ของโครงสร้างจริง ณ วันที่บันทึก
> ใช้แทนตั้งแต่นั้นมา)

รันตามลำดับนี้ผ่าน **Supabase SQL Editor** (Dashboard → SQL Editor → New query)
หรือ `psql` ก็ได้ ทีละไฟล์เรียงเลขจากน้อยไปมาก เริ่มที่ `07`:

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
18_payment_fixes.sql (17 ถูกรวมเข้า 18 แล้ว ไม่มีไฟล์ 17 แยก)
19_chat_bound_to_order.sql
20_eight_hour_deadlines_2case_cancel.sql
21_itemlocation_multi.sql
22_notification_system.sql
23_review_reply_account_reports.sql

ไฟล์ทั้งหมดนี้ **apply เข้า production จริงแล้ว** ทุกไฟล์ — โฟลเดอร์นี้เป็นแค่
บันทึกเก็บไว้ให้ทีมอ้างอิงตรงกัน ไม่ต้องรันซ้ำกับ production ที่มีอยู่แล้ว
ใช้สำหรับ: (1) เอกสารอ้างอิงสภาพจริงของทีม (2) รันสร้าง Supabase project ใหม่
ทั้งหมด (เผื่อจำเป็นต้อง reset หรือทำ dev environment แยก)

## ก่อนรัน

ทุกคนในทีมต้องใช้ **Supabase project เดียวกัน** (ไม่ว่าจะเป็น cloud project
กลาง หรือ local ผ่าน Supabase CLI ที่ sync กัน) — ถ้าใครรันไฟล์นี้บน project
แยกของตัวเอง ตารางที่ได้จะไม่ match กับที่คนอื่นเห็น และ API ที่เขียนต่อกัน
จะพังตอน integration

ถ้ายังไม่แน่ใจว่าทีมใช้ project ไหนอยู่ ให้เช็คกับ Role B (Port) ก่อนรัน
