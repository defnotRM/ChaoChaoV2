# HANDOFF: Dynamic Workflow ของ ChaoChao (สำหรับโรมัน และ AI ผู้ช่วยของโรมัน)

เอกสารนี้เขียนให้ **อ่านแล้วทำงานต่อได้เอง** ไม่ต้องมี WiWat (Port) อยู่ด้วย
ถ้าคุณคือ AI ที่โรมันเปิดไฟล์นี้ให้อ่าน ให้อ่านทั้งไฟล์ก่อนลงมือ และปฏิบัติตามหัวข้อ 3 (กฎเหล็ก) เสมอ

> **หมายเหตุการเปลี่ยนเลข migration (8 ต.ค. 2026):** PR #9 ของเพื่อนใช้ migration เลข 24-26 และ merge เข้า main แล้ว (apply บน production แล้ว)
> migration เฟส 1 ของเราจึงเปลี่ยนชื่อเป็น `27_dynamic_workflow_core.sql` (เนื้อหาเดิม) เลข `24b` และ `25` ที่เขียนในเอกสารนี้ให้อ่านเป็น `28` (แก้ข้อมูลเส้นทาง) และ `29` (ให้ cron อ่านค่าจาก system_config)
> ที่เอกสารนี้เขียนว่า "migration 24" ให้อ่านเป็น "migration 27" ค่า hash หลังรัน 27 บนฐานข้อมูลที่มี 25/26 อยู่แล้วคือ `4449b52cd098`
> ค่า hash ที่เขียนในเอกสารนี้ (`77b289a75e91`, `6a0e828cd7c6`) เป็นค่าก่อน migration 25/26 ของ PR #9 ให้ใช้ค่าปัจจุบันแทน คือ ฐานเปล่าหลัง `full_install.sql` = `9483396d90ab`, หลังรัน 27 = `4449b52cd098` (51 เส้นทาง), หลังรัน 28 ก็ยังเป็น `4449b52cd098` แต่เส้นทางเป็น 53

> **สถานะล่าสุด (8 ต.ค. 2026):** migration 27, 28 และ 29 **apply บน production แล้ว** โหมดบน production คือ `shadow` (จดอย่างเดียว ไม่บล็อกใคร) ดูรายละเอียดในหัวข้อ 2

## 0. วิธีใช้ไฟล์นี้

ให้โรมันวางข้อความนี้ให้ AI ของเขาพร้อมแนบไฟล์นี้:

```
อ่านไฟล์ HANDOFF_DYNAMIC_WORKFLOW.md ให้ครบก่อน แล้วสรุปให้ฉันฟังใน 5 บรรทัดว่าโปรเจกต์นี้ทำอะไรอยู่
สถานะตอนนี้คืออะไร และงานของฉัน (โรมัน) มีอะไรบ้าง อย่าเริ่มแก้โค้ดหรือรันคำสั่งใดจนกว่าฉันจะยืนยัน
ถ้าข้อมูลในไฟล์ขัดกับสิ่งที่เห็นในโค้ดหรือฐานข้อมูล ให้บอกฉันก่อน ห้ามเดา
ห้ามแตะ Supabase production และห้ามให้ฉัน commit ไฟล์ .env เด็ดขาด
```

---

## 1. สรุป 1 นาที

- **เป้าหมาย:** ย้ายกฎของสถานะ (เส้นทางเปลี่ยนสถานะ ผู้ที่ทำได้ ค่าเวลา/ค่าธรรมเนียม) จากโค้ดและฟังก์ชันไปเป็น **ข้อมูลในตาราง**
  มีสวิตช์ 3 โหมด (`static` เหมือนเดิม, `shadow` จดอย่างเดียว, `dynamic` บังคับจริง) และย้อนกลับได้ด้วยคำสั่งเดียว
- **วิธีทำ:** "เพิ่ม ไม่แทนที่" คือเพิ่มตาราง/คอลัมน์/trigger โดยไม่ลบของเดิม
- **สถานะ:** ฐานข้อมูล (migration 27, 28, 29) และโค้ดตัวอ่านกฎ (`lib/workflow.ts`) อยู่บน **production แล้ว** โหมดคือ **`shadow`**
  (production = โปรเจกต์ `awnwvckyjkkuhufmdgas` ใน org ของโรมัน) ส่วน staging ของ WiWat (org ตัวเอง) ใช้ทดสอบเท่านั้น
- **ที่เหลือหลัก:** หน้าแอดมินตั้งค่า workflow (งานของโรมัน), ดูรายการผิดกฎจาก production 1-2 วันที่มีผู้ใช้จริง แล้วค่อยเปิดโหมด `dynamic`

---

## 2. สถานะปัจจุบัน

### ทำเสร็จและยืนยันแล้ว

| รายการ                                                                        | หลักฐาน                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/setup/full_install.sql` ตรงกับ production หลัง migration 26         | ติดตั้งบนฐานข้อมูลว่างแล้ว `structure_hash = 9483396d90ab`, 132 แถว                                                                                                                                                           |
| migration 27 (ฐานข้อมูลเฟส 1) บน production                                   | `structure_hash = 4449b52cd098`, 174 แถว (เมื่อ **ตัดตาราง `test_results` ออก** ซึ่งมีเฉพาะบน production), ข้อมูลที่ seed ตรงต้นแบบ (md5 ของสถานะ เส้นทาง ค่าตั้ง), ข้อมูลธุรกิจไม่เปลี่ยน (ออเดอร์ 22, สินค้า 5, การชำระ 15) |
| migration 28 (เส้นทางปฏิเสธสลิป) บน production                                | เส้นทางรวม 53, ของการชำระเงิน 5                                                                                                                                                                                               |
| migration 29 (ให้ cron/ปิดยอด/ยกเลิกอ่านค่าจาก `system_config`) บน production | ทดสอบเทียบกับฟังก์ชันเดิม 76 บรรทัดเหมือนกันทุกบรรทัด, แก้ค่าแล้วมีผลจริง, hash ฟังก์ชันตรง, cron รอบถัดไปสำเร็จ                                                                                                              |
| โค้ดแอป `lib/workflow.ts` + `PATCH /api/rentals/[id]` ใช้กฎตามโหมด            | เทียบกฎจากฐานข้อมูลกับกฎเดิม 162 กรณี ไม่ตรงกัน 0, fallback ถูกต้อง (merge เข้า `main` แล้ว PR #12)                                                                                                                           |
| บั๊กรูปสินค้า/สลิป/ส่งมอบ-คืนของ/หน้าคืนของ 404                               | แก้และ merge เข้า `main` แล้ว (PR #9, #10, #11)                                                                                                                                                                               |
| ทดสอบบน staging                                                               | กลุ่มผู้เช่า/ผู้ให้เช่าเล่นแล้วบางส่วน (7 จาก 43 เส้นทาง) รายการผิดกฎมีเพียง `pending -> rejected` ซึ่ง migration 28 แก้แล้ว                                                                                                  |
| tag `v1-static-workflow` (จุดย้อนกลับของโค้ด)                                 | มีบน GitHub                                                                                                                                                                                                                   |

### ยังไม่ได้ทำหรือยังไม่ยืนยัน (ห้ามถือว่าเสร็จ)

- **ยังไม่มีข้อมูลการใช้งานจริงใน shadow บน production** (`workflow_history = 0` ณ เวลาตรวจ ยังไม่มีผู้ใช้ทำรายการ) ต้องรอการใช้งานจริงก่อนสรุปว่าเส้นทางครบ
- **36 จาก 43 เส้นทางยังไม่เคยถูกใช้จริงในแอป** (ส่วนใหญ่คือฝั่งแอดมิน และเส้นทางตามเวลา) งานตามเวลาทดสอบแล้วเฉพาะในฐานข้อมูลจำลอง
- engine ฝั่งแอปครอบคลุมเฉพาะ `PATCH /api/rentals/[id]` route อื่นที่เขียนสถานะยังใช้กฎในโค้ด (โหมด `dynamic` ใช้ trigger ในฐานข้อมูลคุมให้ทุกเส้นทางอยู่แล้ว)
- ค่าที่ **ยังไม่เชื่อม** กับฟังก์ชัน: `reminder_days_before` (อยู่ในคำสั่ง cron โดยตรง) และสัดส่วน 20/80 ของกรณีผู้เช่าไม่รับของหน้างาน
- ป้ายชื่อ action ในประวัติอาจไม่ตรงความจริง เมื่อมีหลายเส้นทาง "จาก -> ไป" เดียวกันและแอปเขียนผ่าน service role (เช่น ผู้ให้เช่ากดอนุมัติเอง แต่ประวัติขึ้น `auto_approve_slip`) กระทบแค่ป้ายชื่อ ไม่กระทบการอนุญาต
- ตาราง `workflow_transition_condition` ว่าง และไม่บันทึกประวัติตอนสร้างรายการใหม่ (INSERT)
- ช่องว่างเล็กที่รู้แล้ว: `newStatus` (F1) ยังอยู่ในโค้ดอัปโหลดหลักฐาน, ฝั่งผู้เช่าตอนคืนของยังไม่มีเพดานรูป, มีรูปสลิปปลอมสำรองใน `app/api/payments/route.ts`
- หน้าแอดมินสำหรับ workflow ยังไม่มี และโหมด `dynamic` ยังไม่เปิดบน production

---

## 3. กฎเหล็ก (AI ต้องทำตามเสมอ)

1. **ห้ามรันอะไรบน Supabase production** (project `awnwvckyjkkuhufmdgas`, org ของโรมัน) ทั้ง migration, SQL, และห้ามใส่ key ของ production ใน `.env.local` ของโฟลเดอร์ staging และต้องไม่มีตัวแปรของ production ตั้งอยู่ในระบบปฏิบัติการ (ดูหัวข้อ 4.2)
2. **ห้าม commit ไฟล์ `.env*` ห้ามแปะ key (โดยเฉพาะ service_role / secret) ในแชท, PR, issue หรือโค้ด** ไฟล์ `.env.local` อยู่ใน `.gitignore` อยู่แล้ว
3. **ห้ามแก้ไฟล์ migration ที่ commit และรันบน staging แล้ว** (`27_dynamic_workflow_core.sql`) ถ้าต้องแก้ ให้สร้างไฟล์ใหม่ต่อเลข (`24b_...`, `25_...`) พร้อมไฟล์ย้อนกลับ
4. **ทุกการเปลี่ยนฐานข้อมูล = ไฟล์ migration + ไฟล์ `down` + ทดสอบ UP → DOWN แล้ว structure hash ต้องกลับเป็นค่าเดิม** วางไฟล์ down ใน `supabase/migrations/down/`
5. **ห้ามใช้ `git add -A` / `git add .`** ให้ระบุไฟล์ทีละไฟล์เสมอ (`package-lock.json` มักถูกแก้เองจาก npm ไม่ต้อง commit)
6. **ห้าม push ตรงเข้า `dynamic-workflow`, `Port`, หรือ `main`** ให้แตก branch ย่อยแล้วเปิด Pull Request เข้า `dynamic-workflow` เท่านั้น (ดูหัวข้อ 13)
7. **ห้ามเปิดโหมด `dynamic` บน staging จนกว่า WiWat ยืนยัน** (หัวข้อ 12) และห้ามรัน `DOWN` โดยไม่ export `workflow_history` ที่ต้องการเก็บก่อน
8. **ถ้าไม่แน่ใจ ถามโรมัน/WiWat ก่อน ห้ามเดา** โดยเฉพาะเรื่องเส้นทางเปลี่ยนสถานะ เพราะ seed ผิด 1 เส้นในโหมด dynamic จะบล็อกขั้นตอนจริงของผู้ใช้
9. **production อยู่ในโหมด `shadow` และเป็นระบบจริง:** ห้ามรัน SQL ใดๆ บน production และห้ามเปลี่ยน `workflow_mode` เป็น `dynamic` (รวมถึงผ่านหน้าแอดมินที่จะสร้าง) จนกว่า WiWat ยืนยัน ทดสอบบน staging เท่านั้น

---

## 4. ตั้งค่าเครื่องของโรมัน

### 4.1 Clone เป็นโฟลเดอร์แยก (สำคัญ)

ใช้ **โฟลเดอร์ใหม่** เสมอ เพราะ `.env.local` ในโฟลเดอร์เดิมของโรมันน่าจะชี้ไป production

```
git clone https://github.com/defnotRM/ChaoChaoV2.git ChaoChaoV2-staging
cd ChaoChaoV2-staging
git checkout dynamic-workflow
npm install
```

### 4.2 สร้าง `.env.local` ของ staging

WiWat ส่งค่าให้โรมันทางส่วนตัว (ไม่ผ่านแชทกลุ่ม) แอป **ต้องการแค่ 3 ตัวแปร** (ตรงกับ `.env.example`):

| ตัวแปร                          | ค่า                       |
| ------------------------------- | ------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL ของ staging   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key    |
| `SUPABASE_SERVICE_ROLE_KEY`     | service_role / secret key |

โค้ดใน `lib/supabase/*.ts` ยังรองรับชื่อสำรอง (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`)
แบบ fallback (`||`) ไม่ต้องตั้งถ้าไม่จำเป็น ไฟล์ `.env.local` ของ WiWat ใช้เฉพาะ 3 ตัวด้านบนและทำงานได้ปกติ

**ข้อควรระวังเรื่องลำดับ fallback:** admin client (`lib/supabase/admin.ts`) อ่าน `SUPABASE_URL` **ก่อน** `NEXT_PUBLIC_SUPABASE_URL`
และตัวแปรที่ตั้งไว้ในระบบปฏิบัติการจะชนะค่าใน `.env.local` ดังนั้นก่อนรัน ให้เช็คว่าเครื่องไม่มีตัวแปรเหล่านี้ที่ชี้ production

```
echo %SUPABASE_URL%
echo %NEXT_PUBLIC_SUPABASE_URL%
```

(คำสั่งสำหรับ Windows cmd) ถ้ามีค่าแสดงออกมา และเป็นของ production (`awnwvckyjkkuhufmdgas`) ให้ลบตัวแปรนั้นออกจากระบบก่อน
**ตรวจให้ชัวร์ว่า URL ที่แอปใช้ไม่ใช่ `awnwvckyjkkuhufmdgas`** (production) แล้วรัน `npm run dev -- -p 3001`

### 4.3 ทางเลือก: ฐานข้อมูลของโรมันเอง

ถ้าไม่อยากแชร์ key ให้สร้างโปรเจกต์ Supabase ใหม่ แล้วรันตามลำดับใน SQL Editor:

1. `supabase/setup/full_install.sql`
2. `supabase/setup/check_install.sql` (คิวรีที่ 1 ต้องได้ `structure_hash = 77b289a75e91`, `fingerprint_rows = 132`)
3. `supabase/migrations/27_dynamic_workflow_core.sql`
4. `supabase/setup/check_workflow_phase1.sql` คิวรีที่ 1 (ต้องได้ `6a0e828cd7c6`, 174, 7, 40, 51, `static`)

ข้อเสียคือผลทดสอบของสองคนไม่รวมกันใน `workflow_history` เดียว

---

## 5. สถาปัตยกรรมที่ทำไว้ (migration 27, 28, 29)

### 5.1 ตารางใหม่ 7 ตาราง

| ตาราง                           | ประเภท      | หน้าที่                                                                                                                          |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `workflow`                      | Setup       | 7 วงจร: `RENTAL_ORDER`, `PAYMENT`, `RENTAL_REPORT`, `IDENTITY_VERIFICATION`, `BANK_VERIFICATION`, `ITEM_LISTING`, `USER_ACCOUNT` |
| `workflow_state`                | Setup       | สถานะของแต่ละวงจร (40 แถว) `(workflow_id, state_code)` ห้ามซ้ำ, วงจรละ 1 สถานะเริ่มต้น                                           |
| `workflow_transition`           | Setup       | เส้นทาง จาก→ไป + `action_code` (51 แถว) `is_automatic` = ระบบทำเอง, `timeout_config_id` → `system_config`                        |
| `workflow_transition_role`      | Setup       | ผู้ทำที่อนุญาต (ชี้ตาราง `role`: renter / lender / admin)                                                                        |
| `workflow_transition_condition` | Setup       | เงื่อนไข (ว่างเปล่า ยังไม่ใช้)                                                                                                   |
| `system_config`                 | Setup       | ค่าตั้งระบบ 9 แถว รวม `workflow_mode`                                                                                            |
| `workflow_history`              | Transaction | ประวัติการเปลี่ยนสถานะ และรายการที่ผิดกฎ (โหมด shadow)                                                                           |

### 5.2 คอลัมน์ที่เพิ่ม (ไม่แตะคอลัมน์สถานะข้อความเดิม)

| ตาราง          | คอลัมน์ใหม่              | คู่กับคอลัมน์เดิม              |
| -------------- | ------------------------ | ------------------------------ |
| `rentalorder`  | `status_id`              | `status`                       |
| `payment`      | `status_id`              | `status`                       |
| `rentalreport` | `status_id`              | `status`                       |
| `bankaccount`  | `verification_status_id` | `verification_status`          |
| `item`         | `status_id`              | `status`                       |
| `useraccount`  | `account_status_id`      | `status`                       |
| `useraccount`  | `identity_status_id`     | `identity_verification_status` |

โค้ดแอปเดิม **ยังเขียนคอลัมน์ข้อความ** ต่อไปได้ตามปกติ trigger `trg_wf_a_sync*` เติม `*_id` ให้อัตโนมัติ

### 5.3 โหมด (ตัวแปร `workflow_mode` ใน `system_config`)

| โหมด      | พฤติกรรม                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `static`  | ไม่ทำอะไรเลย ทำงานเหมือนก่อนมี workflow (ค่าเริ่มต้นหลังรัน migration)                                                  |
| `shadow`  | ตรวจเส้นทางและสิทธิ์ ถ้าผิดกฎจะ **บันทึก** ลง `workflow_history` ด้วย `reason` ขึ้นต้น `SHADOW_VIOLATION:` แต่ปล่อยผ่าน |
| `dynamic` | ตรวจและ **ปฏิเสธ** (exception `P0001`, ข้อความขึ้นต้น `workflow:`) ถ้าไม่มีเส้นทางหรือผู้ทำไม่มีสิทธิ์                  |

```sql
SELECT public.workflow_mode();
UPDATE public.system_config SET config_value = 'shadow' WHERE config_key = 'workflow_mode';
```

### 5.4 กลไกตรวจ (trigger `trg_wf_b_guard*`) และเรื่องสิทธิ์ที่ต้องเข้าใจให้ถูก

- ตรวจเฉพาะ **UPDATE ที่สถานะเปลี่ยนจริง** (ค่าเดิม = ค่าใหม่ ข้าม) ไม่ตรวจตอน INSERT
- ตรวจ 2 ชั้น: (1) มีเส้นทาง จาก→ไป ไหม (2) ผู้ทำมีบทบาทที่อนุญาตไหม
- **ชั้นสิทธิ์ตรวจเฉพาะการเรียกที่มี JWT ของผู้ใช้** (`auth.uid()` ไม่ว่าง) เช่น ผู้ใช้เรียก RPC ตรง หรือ route ที่ใช้ client ของผู้ใช้
  ส่วนงาน **cron** และ route ที่ใช้ **admin client / service role** (`createAdminClient`) มี `auth.uid()` ว่าง จึงถูกมองเป็น "ระบบ" และ **ข้ามชั้นสิทธิ์** (แต่ยังต้องผ่านชั้นเส้นทาง)
  ดังนั้นการตรวจสิทธิ์ในโค้ด route ที่ใช้ admin client ยังต้องคงไว้ ห้ามลบ
- "บทบาท" ในตาราง transition หมายถึง **ความสัมพันธ์กับรายการนั้น** (ผู้เช่า/ผู้ให้เช่า "ของออเดอร์นี้") ไม่ใช่แค่มี role ติดตัว คำนวณโดย `workflow_actor_roles(...)`

### 5.5 ฟังก์ชันที่เพิ่ม

`workflow_mode()`, `workflow_state_id(workflow_code, state_code)`, `workflow_actor_roles(workflow_code, row_jsonb, uid)`,
`trg_wf_sync_status()`, `trg_wf_guard()` ทั้งหมด `SECURITY DEFINER` และตั้ง `search_path = public`

### 5.6 RLS ของตารางใหม่

ตารางกฎ (`workflow*`) อ่านได้ทุกคนที่ล็อกอิน แก้ได้เฉพาะแอดมิน (`is_admin()`), `system_config` และ `workflow_history` เฉพาะแอดมิน
(ฝั่งแอปที่ใช้ `createAdminClient` ข้าม RLS อยู่แล้ว)

### 5.7 migration 28 และ 29

- **28:** เพิ่มเส้นทาง `PAYMENT pending -> rejected` 2 เส้น (`reject_slip` โดยผู้ให้เช่า และ `cancel_order_cleanup` อัตโนมัติ) รองรับปุ่มปฏิเสธสลิปของ PR #9
- **29:** ฟังก์ชัน `workflow_cfg_num(key, default)` อ่านตัวเลขจาก `system_config` (ไม่มีคีย์หรือไม่ใช่ตัวเลข = ใช้ค่าเดิมที่เคยฝังไว้ ผลลัพธ์จึงเหมือนเดิมถ้าไม่แก้ค่า)
  แล้วแก้ `process_expired_orders`, `cancel_rental_order`, `settle_rental_order` ให้อ่านค่า:

| คีย์ใน `system_config`         | ค่าเริ่มต้น | ใช้ที่                                                      | เชื่อมแล้ว                     |
| ------------------------------ | ----------- | ----------------------------------------------------------- | ------------------------------ |
| `approval_timeout_hours`       | 8           | ผู้ให้เช่าตอบรับคำขอ                                        | ใช่                            |
| `payment_timeout_hours`        | 8           | ผู้เช่าชำระเงินหลังอนุมัติ                                  | ใช่                            |
| `slip_review_timeout_hours`    | 8           | ผู้ให้เช่าตรวจสลิป (เกินแล้วระบบอนุมัติให้)                 | ใช่                            |
| `noshow_grace_hours`           | 1           | ผ่อนผันหลังเวลานัด (ไม่มาตามนัด / ปิดงานอัตโนมัติตอนคืนของ) | ใช่                            |
| `extra_payment_deadline_hours` | 48          | จ่ายส่วนต่างค่าเสียหาย (เกินแล้วระงับบัญชี)                 | ใช่                            |
| `platform_fee_percent`         | 10          | ค่าธรรมเนียมในการปิดยอดและการยกเลิก                         | ใช่                            |
| `cancel_threshold_days`        | 2           | ยกเลิกก่อนนัดน้อยกว่าหรือเท่ากับกี่วันถือว่ายกเลิกช้า       | ใช่                            |
| `reminder_days_before`         | 1           | แจ้งเตือนล่วงหน้า                                           | **ไม่** (ค่าอยู่ในคำสั่ง cron) |

ค่าที่แก้ในตารางมีผลตั้งแต่รอบถัดไปของ cron (ทุก 10 นาที) หรือการเรียกครั้งถัดไป ไม่ต้อง deploy

---

## 6. แผนที่โค้ด: ที่ไหนเปลี่ยนสถานะบ้าง (ได้จากการอ่านโค้ดจริง)

ใช้เป็นแผนที่ ไม่ต้องไล่ค้นใหม่ (ตรวจกับ branch `Port` ณ วันที่เขียน)

### ออเดอร์ (`rentalorder.status`)

| ที่มา                                       | เปลี่ยนอะไร                                                                                                             | ใช้ client แบบไหน                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `POST /api/rentals`                         | สร้างใหม่ → `requested`                                                                                                 |                                                       |
| `PATCH /api/rentals/[id]`                   | `requested`→`awaiting_payment` (อนุมัติ), →`rejected_by_lender`, →`cancelled` (และยกเลิกคำขออื่นที่วันซ้อนกันอัตโนมัติ) | admin client; มีตาราง `allowedFrom` เขียนตายตัวในไฟล์ |
| `POST /api/payments`                        | ส่งสลิป และตั้ง `awaiting_payment` ถ้าไม่ใช่ (อนุญาตแม้ยัง `requested`)                                                 | admin client                                          |
| `POST /api/payments/approve`                | → `paid` (ไม่ตรวจสถานะต้นทาง)                                                                                           | admin client                                          |
| `POST /api/handover`                        | `paid` → `item_sent` เมื่อหลักฐาน "ก่อนเช่า" ครบสองฝ่าย (ไม่ตรวจสถานะต้นทาง)                                            | admin client                                          |
| `POST /api/return`                          | เรียก `settle_rental_order(happy)` → `completed`                                                                        | user client                                           |
| `POST /api/rentals/[id]/evidence`           | อัปโหลดหลักฐาน + รับ `newStatus` จากผู้เรียก (F1) และเรียก `settle(happy)`                                              | user client (RPC)                                     |
| `POST /api/rentals/[id]/reject-pickup`      | `item_sent` → `rejected_at_meetup` หรือ `disputed_at_meetup`                                                            | user client (RPC)                                     |
| `POST /api/rentals/[id]/cancel`             | RPC `cancel_rental_order`: `paid` → `cancelled_by_renter` / `cancelled_by_lender`                                       | user client (RPC)                                     |
| `POST /api/rentals/[id]/report`             | สร้างรายงาน (ไม่เปลี่ยนสถานะออเดอร์) ยื่น `damaged_item` ได้เมื่อออเดอร์เป็น `item_returned` หรือ `completed`           |                                                       |
| `POST /api/admin/disputes/[id]/resolve`     | แอดมินตัดสิน: `settle_rental_order` หลาย outcome และตั้งสถานะรายงาน                                                     |                                                       |
| `POST /api/payments/[id]/confirm`           | RPC `confirm_additional_payment`: `awaiting_additional_payment` → `completed`                                           | user client (RPC)                                     |
| cron `process_expired_orders` (ทุก 10 นาที) | หมดเวลา 8 ชม., อนุมัติสลิปเอง, ไม่มาตามนัด, ปิดงานเมื่อผู้ให้เช่าไม่ยืนยันคืน, ระงับบัญชีค้างจ่าย 48 ชม.                | pg_cron (ไม่มี JWT)                                   |

### วงจรอื่น

| วงจร                    | ที่มา                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IDENTITY_VERIFICATION` | `register` (ผู้ให้เช่า) และ `profile/add-role` ตั้ง `pending`; `admin/kyc/[userId]` ตั้ง `verified`/`rejected`                                                                    |
| `BANK_VERIFICATION`     | `register`, `add-role`, `profile/bank-account` ตั้ง `pending` (แก้บัญชีเมื่อไรก็กลับเป็น pending); `admin/kyc/[userId]` ตั้ง `verified`/`rejected`                                |
| `ITEM_LISTING`          | `create_item_listing` ตั้ง `available`; `PATCH /api/products/[id]` เปลี่ยนเป็นสถานะใดก็ได้ใน 4 ค่า; `DELETE` ตั้ง `inactive`                                                      |
| `USER_ACCOUNT`          | `profile/deactivate` ตั้ง `Deactivated`; cron และ `admin/disputes/.../resolve` ตั้ง `Suspended`                                                                                   |
| `RENTAL_REPORT`         | route รายงานสร้าง `pending_investigation`; แอดมินตั้ง `resolved_renter_fault` / `resolved_lender_fault` / `dismissed`                                                             |
| `PAYMENT`               | สร้าง `pending`; approve / cron / `confirm_additional_payment` ตั้ง `paid`; ฟังก์ชันคืนเงิน/ปิดยอด **สร้างแถวด้วยสถานะ `refunded`/`pending` ตรงๆ** (INSERT ไม่ใช่การเปลี่ยนสถานะ) |

---

## 7. เส้นทางที่ seed ไว้ (53 เส้นทาง หลัง migration 28)

ดูรายละเอียดและ action code ครบใน `supabase/migrations/27_dynamic_workflow_core.sql` (ส่วนที่ 3) ที่นี่สรุปเฉพาะออเดอร์

| จาก                         | ไป                              | action                                                              | ผู้ทำ                        |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------- | ---------------------------- |
| requested                   | awaiting_payment                | approve                                                             | lender                       |
| requested                   | rejected_by_lender              | reject / auto_expire                                                | lender / ระบบ                |
| requested                   | cancelled                       | cancel / auto_cancel_overlap                                        | renter,lender / ระบบ         |
| awaiting_payment            | cancelled                       | cancel / auto_expire                                                | renter,lender / ระบบ         |
| awaiting_payment            | paid                            | confirm_payment / auto_approve_slip                                 | lender / ระบบ                |
| paid                        | item_sent                       | handover_complete                                                   | renter,lender                |
| paid                        | cancelled_by_renter             | cancel_paid                                                         | renter                       |
| paid                        | cancelled_by_lender             | cancel_paid                                                         | lender                       |
| paid                        | lender_noshow, renter_noshow    | auto_noshow                                                         | ระบบ                         |
| item_sent                   | completed                       | return_complete / auto_return_close / resolve_not_returned_rejected | renter,lender / ระบบ / admin |
| item_sent                   | rejected_at_meetup              | reject_changed_mind                                                 | renter                       |
| item_sent                   | disputed_at_meetup              | report_false_ad                                                     | renter                       |
| item_sent                   | item_not_returned               | resolve_not_returned                                                | admin                        |
| disputed_at_meetup          | refunded_dispute / completed    | resolve_false_ad_approved / \_rejected                              | admin                        |
| **completed**               | **awaiting_additional_payment** | resolve_damage_excess                                               | admin                        |
| awaiting_additional_payment | completed                       | confirm_additional_payment                                          | admin                        |

หมายเหตุที่ต้องจำ:

- มีเส้นทาง **`completed` → `awaiting_additional_payment`** จริง เพราะยื่นรายงานสินค้าเสียหายได้หลังจบงาน ห้ามตัดออก
- **ไม่ได้ seed** เส้นทาง `requested` → `awaiting_payment` ผ่านการส่งสลิป (ข้ามการอนุมัติ) และเส้นทางที่ไม่เคยพบในโค้ด
  (`Suspended`/`Deactivated` → `Active`, KYC `rejected` → `pending`) ตั้งใจให้โหมด shadow รายงาน
- สถานะที่ไม่มีโค้ดตั้งค่า (dead states): ออเดอร์ `item_received`, `item_returned`; การชำระ `rejected`; บัญชี `Banned`
- สถานะสินค้า: เปลี่ยนไปมาระหว่าง 4 สถานะได้อิสระ (ตามที่โค้ดเป็นอยู่) โดย lender หรือ admin

---

## 8. ข้อค้นพบด้านความปลอดภัยของตรรกะสถานะ (จากการอ่านโค้ด ยังไม่ได้ยิงทดสอบบนระบบจริง)

| #   | จุด                                                              | ปัญหา                                                                                                                      |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| F1  | `POST /api/rentals/[id]/evidence` + RPC `upload_rental_evidence` | รับ `newStatus` (9 ค่า) จากผู้เรียกแล้วตั้งสถานะให้ทันที ไม่ตรวจสถานะเดิม/ผู้ทำ (ตรวจแค่เป็นคู่กรณี) หน้าจอไม่ได้ใช้ค่านี้ |
| F2  | RPC `settle_rental_order`                                        | ไม่ตรวจสถานะปัจจุบันและเวลา เรียกซ้ำได้ (เพิ่มแถว `payment` ซ้ำ)                                                           |
| F3  | ฟังก์ชันข้างบนทั้งหมด                                            | `SECURITY DEFINER` + เปิด EXECUTE ให้ `authenticated` และ `anon` ผ่าน REST ได้โดยไม่ต้องผ่าน route                         |
| F4  | `POST /api/payments/approve`                                     | ไม่ตรวจว่าออเดอร์เป็น `awaiting_payment` และมีสลิป pending จริง                                                            |
| F5  | `POST /api/handover`, `POST /api/return`                         | ไม่ตรวจสถานะออเดอร์ อัปโหลดซ้ำอาจทำให้สถานะถอยหลัง                                                                         |
| F6  | `POST /api/payments`                                             | ส่งสลิปตอน `requested` แล้วข้ามเป็น `awaiting_payment` (ข้ามการอนุมัติ/ตรวจวันซ้อน)                                        |
| F7  | `process_expired_orders`                                         | เรียกได้โดยผู้ใช้ทั่วไป (ผลต่ำ)                                                                                            |

**ข้อตกลงที่ WiWat ตัดสินแล้ว:** ไม่แก้ F1-F3 แยกต่างหาก ให้โหมด `dynamic` ปิดช่องโหว่เหล่านี้พร้อมกัน
และ **ถ้า dynamic workflow ล้มเหลวหรือต้องถอย ให้กลับมาแก้ F1-F3 ใน production จริงทันที**
ผลทดสอบบน Postgres จำลองยืนยันแล้วว่าโหมด dynamic บล็อก F1 และ F2 ได้ (แต่ยังไม่ได้ทดสอบกับแอปจริง)

---

## 9. งานที่เหลือ

### ใครทำอะไร

| รหัส | งาน                                                                      | ผู้ทำ         | สถานะ                                                         |
| ---- | ------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------- |
| R1   | ตั้งเครื่อง staging (หัวข้อ 4) และยืนยันว่าแอปรันได้                     | โรมัน         | รอโรมัน                                                       |
| R2   | ทดสอบฝั่งแอดมินบน **staging** (หัวข้อ 11) แล้วส่งผลคิวรีรายการละเมิด     | โรมัน         | รอโรมัน                                                       |
| R3   | หน้าแอดมิน "ตั้งค่า workflow" (หัวข้อ 10)                                | โรมัน         | ยังไม่เริ่ม (เริ่มได้เลย ไม่ต้องรอใคร)                        |
| R4   | engine ฝั่งแอป (`lib/workflow.ts` + `PATCH /api/rentals/[id]`)           | WiWat         | **เสร็จ** (หัวข้อ 10)                                         |
| W1   | ทดสอบฝั่งผู้เช่า/ผู้ให้เช่าบน staging                                    | WiWat         | ทำแล้วบางส่วน                                                 |
| W2   | วิเคราะห์รายการละเมิดและเพิ่มเส้นทางที่ตกหล่น                            | WiWat         | migration 28 เสร็จ รอบถัดไปดูจาก production                   |
| W3   | วิธีจำลองงานตามเวลา                                                      | WiWat         | มีสูตรใช้ได้บน staging (ทดสอบแล้ว)                            |
| W4   | migration 29 (ค่าตั้งมีผลกับ cron/ปิดยอด)                                | WiWat         | **เสร็จ** อยู่บน production                                   |
| W5   | `full_install.sql`, hash, เอกสาร                                         | WiWat         | `full_install.sql` ตรง production หลัง 26 เอกสารนี้อัปเดตแล้ว |
| P    | ดูรายการผิดกฎจาก production (โหมด shadow) วันละครั้ง 1-2 วัน (หัวข้อ 11) | WiWat         | กำลังดำเนินการ                                                |
| G    | เปิดโหมด `dynamic` บน production                                         | WiWat + โรมัน | หลัง P ว่างเปล่าและผ่านการใช้ฝั่งแอดมิน                       |

เส้นทางวิกฤต: P (รอผู้ใช้จริง) → ตัดสินใจเปิด `dynamic` (G) ส่วน R3 ทำขนานกันได้

---

## 10. รายละเอียดงานของโรมัน

### R3: หน้าแอดมิน "ตั้งค่า workflow"

ทำใน branch แยก `dynamic-workflow-admin` แล้วเปิด PR เข้า `dynamic-workflow`

**ทำอะไร**

1. หน้า `app/admin/(portal)/workflow/page.tsx` มี 3 ส่วน
   - **ค่าตั้งระบบ:** แสดงแถวจาก `system_config` (`config_key`, `config_value`, `value_type`, `description`, `updated_at`) แก้ค่าได้ ตรวจชนิดตาม `value_type` (`int` / `numeric` / `bool` / `text`)
   - **สวิตช์โหมด:** แสดงโหมดปัจจุบัน เปลี่ยนเป็น `static` / `shadow` ได้ทันที ส่วน `dynamic` ต้องมีกล่องยืนยันที่เตือนว่าจะบล็อกการเปลี่ยนสถานะที่ผิดกฎจริง
   - **ประวัติ:** ตาราง `workflow_history` 100 แถวล่าสุด (รวมชื่อวงจร จากสถานะ→ไปสถานะ action เวลา) มีตัวกรอง "เฉพาะที่ผิดกฎ" (`reason LIKE 'SHADOW_VIOLATION%'`)
2. API: `app/api/admin/workflow/config/route.ts` (GET/PATCH) และ `app/api/admin/workflow/history/route.ts` (GET)
3. เพิ่มลิงก์เมนูใน `components/admin/AdminNavbar.tsx`

**ข้อบังคับ**

- ใช้แพตเทิร์นเดียวกับหน้าแอดมินที่มีอยู่: หน้า → `requireAdmin()`, API → `verifyAdminApi()` (ไฟล์ `lib/admin-auth.ts`) และ `createAdminClient()`
- เมื่อแก้ `system_config` ต้องตั้ง `updated_by` = id แอดมินที่ล็อกอิน และ `updated_at = now()`
- **ห้ามให้หน้านี้แก้ตาราง `workflow`, `workflow_state`, `workflow_transition`** ในเฟสนี้ (อ่านอย่างเดียว ถ้าจะแสดง)
- ข้อความบนหน้าจอเป็นภาษาไทย ตามหน้าแอดมินเดิม

**เกณฑ์ผ่าน**

- [ ] บัญชีที่ไม่ใช่แอดมินเข้าหน้าและเรียก API ไม่ได้ (ได้ 403/redirect)
- [ ] แก้ `approval_timeout_hours` จาก 8 เป็น 12 แล้วเห็นค่าใหม่ใน DB พร้อม `updated_by`
- [ ] สลับ `static` → `shadow` → `static` ได้ ค่าตรงกับ `SELECT public.workflow_mode()`
- [ ] ใส่ค่าผิดชนิด (เช่นตัวอักษรในค่า `int`) แล้วถูกปฏิเสธพร้อมข้อความ
- [ ] `npm run build` ผ่าน

### R4: engine ฝั่งแอป (WiWat ทำแล้ว ไม่ต้องทำซ้ำ)

`lib/workflow.ts` มี `getWorkflowMode()` และ `checkTransition(workflowCode, from, to, actors)` ส่วน `PATCH /api/rentals/[id]` ใช้ตามโหมด
(static = กฎเดิมในโค้ด, shadow = กฎเดิมแต่ `console.warn` ถ้าไม่ตรงกับฐานข้อมูล, dynamic = กฎจากฐานข้อมูล, อ่านฐานข้อมูลไม่ได้ = fallback กฎเดิม)
ถ้าจะขยายไป route อื่น ให้ถาม WiWat ก่อน

**หมายเหตุสำหรับ R3 (หน้าแอดมิน):**

- ค่าใน `system_config` ที่ **มีผลจริง** คือ 7 ตัวในตาราง 5.7 ให้แสดงป้าย "ยังไม่มีผล" ที่ `reminder_days_before`
- การสลับ `workflow_mode` บนหน้านี้กระทบระบบจริงทันทีเมื่อแอปชี้ production ต้องมีกล่องยืนยัน และห้ามให้เลือก `dynamic` โดยไม่เตือน (กฎเหล็กข้อ 9)
- แก้ค่าต้องตั้ง `updated_by` และ `updated_at` และตรวจชนิดตาม `value_type`

---

## 11. วิธีทดสอบ (โหมด shadow)

ก่อนเริ่ม ตรวจโหมด:

```sql
SELECT public.workflow_mode();
-- ถ้าไม่ใช่ shadow:
UPDATE public.system_config SET config_value = 'shadow' WHERE config_key = 'workflow_mode';
```

ทดสอบคนเดียวได้ด้วย 3 เบราว์เซอร์ (ผู้ให้เช่า / ผู้เช่า incognito / แอดมินคนละโปรแกรม)
ให้สิทธิ์แอดมินกับบัญชีทดสอบ:

```sql
INSERT INTO public.user_role_assignment (user_id, role_id)
SELECT '<USER_ID>'::uuid, role_id FROM public.role WHERE role_type = 'admin';
```

### ชุดทดสอบฝั่งแอดมิน (R2)

ต้องมีข้อมูลจากฝั่งผู้เช่า/ผู้ให้เช่าก่อน (ให้ WiWat สร้างออเดอร์ตามสถานะที่ต้องการ หรือสร้างเองถ้าใช้ฐานข้อมูลของตัวเอง)

| #   | ทำอะไร                                          | สถานะที่ควรเปลี่ยน                                                                 |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | อนุมัติ KYC ของผู้ให้เช่า                       | `IDENTITY_VERIFICATION` pending → verified                                         |
| 2   | ปฏิเสธ KYC ของอีกบัญชี                          | pending → rejected                                                                 |
| 3   | อนุมัติ / ปฏิเสธบัญชีธนาคาร                     | `BANK_VERIFICATION` pending → verified / rejected                                  |
| 4   | ตัดสินข้อพิพาท "ของไม่ตรงปก" ทั้งสองทาง         | ออเดอร์ `disputed_at_meetup` → `refunded_dispute` / `completed`, รายงาน → resolved |
| 5   | ตัดสิน "สินค้าเสียหาย" ค่าเสียหายเกินเงินประกัน | ออเดอร์ `completed` → `awaiting_additional_payment`                                |
| 6   | ยืนยันการชำระส่วนต่าง                           | ออเดอร์ → `completed`, การชำระ pending → paid                                      |
| 7   | ตัดสิน "ไม่คืนของ" ทั้งสองทาง                   | `item_sent` → `item_not_returned` / `completed`                                    |
| 8   | ยกคำร้อง (dismiss)                              | รายงาน → dismissed                                                                 |
| 9   | ระงับบัญชีผู้ใช้                                | `USER_ACCOUNT` Active → Suspended                                                  |

หลังแต่ละข้อ (หรือหลังจบทั้งหมด) รันคิวรีที่ 2 และ 3 ใน `supabase/setup/check_workflow_phase1.sql`
**ผลที่คาดหวัง:** คิวรีที่ 2 (รายการผิดกฎ) ว่างเปล่า ถ้ามีแถวขึ้นมา = เจอเส้นทางที่ไม่ได้ seed หรือบั๊กจริง
ให้ส่งผลทั้งแถวให้ WiWat (ไม่ต้องวิเคราะห์เอง งาน W2 เป็นของ WiWat)

### คิวรีที่มีประโยชน์

```sql
-- รายการผิดกฎ (สรุป)
SELECT w.workflow_code, coalesce(fs.state_code,'(ว่าง)') AS from_state, ts.state_code AS to_state,
       left(h.reason,90) AS reason, count(*) AS times
FROM public.workflow_history h
JOIN public.workflow w ON w.workflow_id = h.workflow_id
LEFT JOIN public.workflow_state fs ON fs.state_id = h.from_state_id
JOIN public.workflow_state ts ON ts.state_id = h.to_state_id
WHERE h.reason LIKE 'SHADOW_VIOLATION%'
GROUP BY 1,2,3,4 ORDER BY times DESC;
```

### คิวรีบน production (อ่านอย่างเดียว ใช้ตรวจโหมด shadow)

```sql
SELECT w.workflow_code, coalesce(fs.state_code,'(ว่าง)') AS from_state, ts.state_code AS to_state,
       left(h.reason,80) AS reason, count(*) AS times, min(h.changed_at) AS first_seen
FROM public.workflow_history h
JOIN public.workflow w ON w.workflow_id = h.workflow_id
LEFT JOIN public.workflow_state fs ON fs.state_id = h.from_state_id
JOIN public.workflow_state ts ON ts.state_id = h.to_state_id
WHERE h.reason LIKE 'SHADOW_VIOLATION%'
GROUP BY 1,2,3,4 ORDER BY times DESC;
```

ผลว่างเปล่า = ทุกการเปลี่ยนสถานะที่เกิดขึ้นอยู่ในเส้นทางที่ seed ไว้ ถ้ามีแถว ให้ส่งให้ WiWat วิเคราะห์ว่าเป็นเส้นทางที่ตกหล่นหรือบั๊กจริง
(หมายเหตุ: คิวรี hash โครงสร้างบน production ต้อง **ตัดตาราง `test_results` ออก** ถึงจะได้ `4449b52cd098` / 174 แถว)

---

## 12. วิธีถอยกลับ (เรียงจากเบาไปหนัก)

1. **สลับโหมดกลับ** (ทันที ไม่ต้อง deploy ข้อมูลไม่หาย):
   `UPDATE public.system_config SET config_value = 'static' WHERE config_key = 'workflow_mode';`
2. **ย้อน migration 29** (คืนฟังก์ชัน 3 ตัวเป็นค่าคงที่ฝังตัว) รัน `supabase/migrations/down/29_workflow_config_wiring.down.sql`
   ตรวจ hash ฟังก์ชัน `process_expired_orders` ต้องกลับเป็นของ migration 26 (`md5` แบบตัดคอมเมนต์ = `fa3cd19ebe554b080671ffba57b2b91b`)
3. **ย้อน migration 28 แล้ว 27** รัน `down/28_...` แล้ว `down/27_...` (export `workflow_history` ก่อนถ้าต้องการเก็บ)
   ตรวจโครงสร้างด้วยคิวรี hash ที่ตัด `test_results` ออก ต้องกลับเป็น `9483396d90ab` / 132 แถว
4. **ย้อนโค้ดแอป** กด Revert ของ Pull Request บน GitHub หรือใช้ tag `v1-static-workflow` (โค้ดก่อนเริ่มงานนี้)
5. **ถ้า dynamic workflow ล้มเหลวทั้งหมด:** ตามข้อตกลงในหัวข้อ 8 ให้กลับไปแก้ F1-F3 ใน production จริง

ข้อมูลธุรกิจ (ออเดอร์ การชำระเงิน ฯลฯ) และคอลัมน์สถานะข้อความเดิม **ไม่ถูกแตะ** ในทุกขั้นข้างบน
(ทุกการเปลี่ยนบน production ที่ผ่านมาทำด้วยคำสั่งที่ทดสอบ UP → DOWN แล้ว และตรวจ hash ก่อน-หลังทุกครั้ง)

---

## 13. วิธีส่งงานกลับ (Git)

```
git fetch origin
git checkout main
git pull origin main
git checkout -b feat/workflow-admin         # ตั้งชื่อตามงาน
# ... แก้โค้ด ...
npm run build                               # ต้องผ่านก่อน commit
git add <ไฟล์ทีละไฟล์>
git commit -m "feat(admin): ..."
git push -u origin feat/workflow-admin
```

แล้วเปิด Pull Request บน GitHub จาก `feat/workflow-admin` ไปยัง **`main`** (กิ่ง `dynamic-workflow` ถูกรวมเข้า `main` แล้วใน PR #12) ห้าม push ตรงเข้า `main` และ merge ได้เมื่อ build ผ่านและ WiWat หรือโรมันตรวจแล้ว
ใส่ในรายละเอียด PR: ทำอะไร, ทดสอบอย่างไร, เกณฑ์ผ่านข้อไหนผ่านแล้ว, ถ้ามีการเปลี่ยนฐานข้อมูล ให้แนบไฟล์ down และผลทดสอบ hash

---

## 14. คำถามที่ยังเปิดอยู่ (ต้องตัดสินใจร่วมกัน)

1. ปล่อยโหมด `shadow` บน production กี่วันก่อนเปิด `dynamic` (เสนอ 1-2 วันที่มีการใช้งานครบทั้งผู้เช่า ผู้ให้เช่า และแอดมิน)
2. เส้นทางผิดปกติ F6 (ส่งสลิปตอน `requested` ข้ามการอนุมัติ): ปล่อยให้ถูกบล็อกในโหมด `dynamic` (ค่าตั้งต้น) หรือใส่ใน seed
3. สถานะที่ไม่มีทางเข้า (`item_received`, `item_returned`, `Banned`) เก็บไว้หรือตัดทิ้ง (สถานะ `rejected` ของการชำระเงินใช้งานแล้วตั้งแต่ migration 28)
4. ต้องการเส้นทาง `Suspended`/`Deactivated` → `Active` (ยกเลิกการระงับ / เปิดบัญชีคืน) และ KYC `rejected` → `pending` (ส่งเอกสารใหม่) หรือไม่
5. ลบ `newStatus` (F1) ออกจากโค้ดอัปโหลดหลักฐานและเพิ่มเพดานรูปฝั่งผู้เช่าตอนคืนของ (ตอนนี้โหมด `dynamic` ปิดช่องโหว่ F1 ให้ แต่ยังไม่ได้เปิด)
6. จะเชื่อม `reminder_days_before` (ต้องแก้คำสั่ง cron) และสัดส่วน 20/80 กรณีผู้เช่าไม่รับของหน้างานเข้ากับ `system_config` หรือไม่
7. ให้แอปส่งชื่อ action ให้ฐานข้อมูลเพื่อให้ป้ายชื่อในประวัติตรงความจริงหรือไม่

---

## 15. ไฟล์อ้างอิงใน repo (branch `main`)

| ไฟล์                                                           | หน้าที่                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `supabase/setup/full_install.sql`                              | ติดตั้งฐานข้อมูลทั้งหมดบนโปรเจกต์ว่าง (ตรง production หลัง migration 26, hash `9483396d90ab`)                        |
| `supabase/setup/check_install.sql`                             | ตรวจโครงสร้างหลังติดตั้ง                                                                                             |
| `supabase/migrations/27_dynamic_workflow_core.sql` + `down/`   | migration เฟส 1 และไฟล์ย้อนกลับ                                                                                      |
| `supabase/migrations/28_workflow_payment_reject.sql` + `down/` | เส้นทางปฏิเสธสลิป และไฟล์ย้อนกลับ                                                                                    |
| `supabase/migrations/29_workflow_config_wiring.sql` + `down/`  | ให้ cron/ปิดยอด/ยกเลิกอ่านค่าจาก `system_config` และไฟล์ย้อนกลับ                                                     |
| `supabase/setup/check_workflow_phase1.sql`                     | ตรวจหลังรัน 27-29 (hash `be039ebd1e79` / 175 แถวหลัง 29 บนฐานข้อมูลที่ไม่มี `test_results`), ดูรายการผิดกฎ, สลับโหมด |
| `supabase/migrations/README.md`                                | อธิบายการจัดไฟล์ migration                                                                                           |
| `lib/workflow.ts`                                              | ตัวอ่านโหมดและกฎ workflow จากฐานข้อมูล                                                                               |
| `app/api/rentals/[id]/route.ts`                                | `PATCH` เปลี่ยนสถานะ ใช้ `lib/workflow.ts` ตามโหมด                                                                   |
| `lib/admin-auth.ts`                                            | `requireAdmin()` (หน้า) และ `verifyAdminApi()` (API)                                                                 |

### ติดต่อ

- WiWat (Port): ฐานข้อมูล, migration, การวิเคราะห์ผลทดสอบ, ผู้ทดสอบฝั่งผู้เช่า/ผู้ให้เช่า
- โรมัน (defnotRM): เจ้าของ repo, หน้าแอดมิน, การทดสอบฝั่งแอดมิน, ตัดสินใจเรื่องนำเข้า production
