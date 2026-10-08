# HANDOFF: Dynamic Workflow ของ ChaoChao (สำหรับโรมัน และ AI ผู้ช่วยของโรมัน)

เอกสารนี้เขียนให้ **อ่านแล้วทำงานต่อได้เอง** ไม่ต้องมี WiWat (Port) อยู่ด้วย
ถ้าคุณคือ AI ที่โรมันเปิดไฟล์นี้ให้อ่าน ให้อ่านทั้งไฟล์ก่อนลงมือ และปฏิบัติตามหัวข้อ 3 (กฎเหล็ก) เสมอ

> **หมายเหตุการเปลี่ยนเลข migration (8 ต.ค. 2026):** PR #9 ของเพื่อนใช้ migration เลข 24-26 และ merge เข้า main แล้ว (apply บน production แล้ว)
> migration เฟส 1 ของเราจึงเปลี่ยนชื่อเป็น `27_dynamic_workflow_core.sql` (เนื้อหาเดิม) เลข `24b` และ `25` ที่เขียนในเอกสารนี้ให้อ่านเป็น `28` (แก้ข้อมูลเส้นทาง) และ `29` (ให้ cron อ่านค่าจาก system_config)
> ที่เอกสารนี้เขียนว่า "migration 24" ให้อ่านเป็น "migration 27" ค่า hash หลังรัน 27 บนฐานข้อมูลที่มี 25/26 อยู่แล้วคือ `4449b52cd098`
> ค่า hash ที่เขียนในเอกสารนี้ (`77b289a75e91`, `6a0e828cd7c6`) เป็นค่าก่อน migration 25/26 ของ PR #9 ให้ใช้ค่าปัจจุบันแทน คือ ฐานเปล่าหลัง `full_install.sql` = `9483396d90ab`, หลังรัน 27 = `4449b52cd098` (51 เส้นทาง), หลังรัน 28 ก็ยังเป็น `4449b52cd098` แต่เส้นทางเป็น 53

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

- **เป้าหมาย:** ทำให้ฐานข้อมูลรองรับ dynamic workflow คือ สถานะ เส้นทางเปลี่ยนสถานะ ผู้ที่ทำได้ และค่าตั้งระบบ
  ถูกเก็บเป็น **ข้อมูลในตาราง** แทนที่จะฝังในโค้ด/ฟังก์ชัน และต้องมีวิธีย้อนกลับเป็นแบบเดิมได้ถ้าพัง
- **วิธีทำ:** "เพิ่ม ไม่แทนที่" คือเพิ่มตาราง/คอลัมน์/trigger โดยไม่ลบของเดิม และมีสวิตช์ 3 โหมด
  (`static` เหมือนเดิม, `shadow` จดอย่างเดียว, `dynamic` บังคับจริง) สลับด้วยคำสั่ง SQL เดียว
- **ทำที่ไหน:** บน **Supabase staging** (โปรเจกต์ของ WiWat ใน org ตัวเอง) และ branch `dynamic-workflow`
  ไม่ใช่ production (production อยู่ใน org ของโรมัน project `awnwvckyjkkuhufmdgas` ห้ามแตะ)
- **เฟส 1 (ฐานข้อมูล) เสร็จแล้ว** และผ่านการทดสอบ ตอนนี้อยู่ขั้น **ทดสอบแอปจริงในโหมด shadow**
  แล้วจึงแก้ข้อมูลเส้นทาง ต่อด้วยโค้ดแอปและเปิดโหมด dynamic

---

## 2. สถานะปัจจุบัน

### ทำเสร็จและยืนยันแล้ว

| รายการ                                                                               | หลักฐาน                                                                                                                             |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| ไฟล์ติดตั้งฐานข้อมูลรวมไฟล์เดียว `supabase/setup/full_install.sql` ตรงกับ production | เทียบ hash 127 จาก 132 รายการ ที่เหลือเป็นตาราง `test_results` ที่ตั้งใจไม่ใส่                                                      |
| ติดตั้ง `full_install.sql` บน staging แล้ว                                           | WiWat รันแล้ว `structure_hash = 77b289a75e91` ตรงกับที่คาด                                                                          |
| Migration 24 (เฟส 1) เขียนและทดสอบบน Postgres จำลอง                                  | ทดสอบทั้ง 3 โหมด จำลองช่องโหว่ F1/F2 และทดสอบ UP → DOWN 2 รอบ hash กลับเป็นเดิม                                                     |
| Migration 24 รันบน staging แล้ว                                                      | WiWat รันแล้ว `structure_hash = 6a0e828cd7c6`, 174 แถว, 7 วงจร, 40 สถานะ, 51 เส้นทาง                                                |
| Commit และ push ขึ้น GitHub                                                          | branch `dynamic-workflow` (commit `f269045`)                                                                                        |
| แอปเวอร์ชัน staging รันได้ที่ port 3001 ชี้ฐานข้อมูล staging                         | สมัครและล็อกอินได้                                                                                                                  |
| tag `v1-static-workflow` (จุดย้อนกลับของโค้ด)                                        | มีทั้งในเครื่องและบน remote ชี้ commit `3fb0b76` (ปลาย `Port` ที่มี `full_install.sql`)                                             |
| สภาพ staging ล่าสุด                                                                  | `workflow_mode = shadow`, 7 วงจร / 40 สถานะ / 51 เส้นทางตรง, **`orders = 0`, `workflow_history = 0`** (ยังไม่มีข้อมูลทดสอบ)         |
| `.env.local` ของ WiWat                                                               | อยู่ใน `.gitignore`, มี 3 ตัวแปรที่ต้องใช้, ไม่ชี้ production (ตรวจโดย Claude Code)                                                 |
| รายงานการตรวจโค้ดกับ branch จริง                                                     | ข้อความอ้างอิงเกี่ยวกับ `allowedFrom`, `newStatus` (F1), การไม่ตรวจสถานะใน payments/approve, handover, return ตรงกับโค้ดจริงทั้งหมด |

### ยังไม่ได้ทำหรือยังไม่ยืนยัน (ห้ามถือว่าเสร็จ)

- **ยังไม่ได้ทดสอบแอปจริงในโหมด shadow เลย** staging ยังไม่มีสินค้าหรือออเดอร์ (`orders = 0`, `workflow_history = 0`) เส้นทางที่ seed ไว้ได้จากการอ่านโค้ด อาจตกหล่น
- **ยังไม่มี engine ฝั่งแอป** (`lib/workflow.ts` ยังไม่มี) โค้ดแอปยังใช้ตารางเส้นทางเขียนตายตัวของมันเอง
- **ค่าตั้งใน `system_config` ยังไม่ถูกอ่านโดย cron/ฟังก์ชัน** (ตอนนี้อ่านจริงแค่ `workflow_mode`) ฟังก์ชันเดิมยังใช้ค่าคงที่ของตัวเอง (8 ชม., 2 วัน, 10% ฯลฯ)
- **ตาราง `workflow_transition_condition` ว่างเปล่า** (ยังไม่มีเงื่อนไขและยังไม่มีโค้ดตรวจ)
- **ไม่บันทึกประวัติตอนสร้างรายการใหม่ (INSERT)** บันทึกเฉพาะตอนเปลี่ยนสถานะ (UPDATE)
- **ยังไม่ได้ทดสอบงานตั้งเวลา (cron)** ใต้โหมด shadow/dynamic (ต้องมีวิธีจำลองเวลา ดูงาน W3)
- **หน้าแอดมินสำหรับ workflow ยังไม่มี**

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

## 5. สถาปัตยกรรมที่ทำไว้ (migration 24)

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

## 7. เส้นทางที่ seed ไว้ (51 เส้นทาง)

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

| รหัส | งาน                                                                                                | ผู้ทำ         | ต้องรอ             |
| ---- | -------------------------------------------------------------------------------------------------- | ------------- | ------------------ |
| R1   | ตั้งเครื่อง staging (หัวข้อ 4) และยืนยันว่าแอปรันได้                                               | โรมัน         | ไม่ต้องรอ          |
| R2   | ทดสอบฝั่งแอดมินในโหมด shadow (หัวข้อ 11) แล้วส่งผลคิวรีรายการละเมิด                                | โรมัน         | R1 และข้อมูลจาก W1 |
| R3   | หน้าแอดมิน "ตั้งค่า workflow" (หัวข้อ 10)                                                          | โรมัน         | R1 (เริ่มได้เลย)   |
| R4   | `lib/workflow.ts` + เปลี่ยน `allowedFrom` ใน `PATCH /api/rentals/[id]` ให้อ่านจากฐานข้อมูล         | โรมัน         | W2                 |
| W1   | ทดสอบฝั่งผู้เช่า/ผู้ให้เช่าในโหมด shadow ตามตาราง 13 ขั้น                                          | WiWat         | ไม่ต้องรอ          |
| W2   | วิเคราะห์รายการละเมิด แยกบั๊กจริงออกจากเส้นทางที่ตกหล่น แล้วออก migration `24b` (แก้ข้อมูลเส้นทาง) | WiWat         | W1, R2             |
| W3   | วิธีจำลองงานตั้งเวลา (หมดเวลา 8 ชม., ไม่มาตามนัด) บน staging                                       | WiWat         | ไม่ต้องรอ          |
| W4   | migration `25`: ให้ cron/ฟังก์ชันอ่านค่าจาก `system_config` + ไฟล์ down + ทดสอบ                    | WiWat         | W2                 |
| W5   | อัปเดต `full_install.sql`, ER diagram, เอกสาร                                                      | WiWat         | W4                 |
| G    | ทดสอบเปิดโหมด `dynamic` บน staging ทั้งระบบ และซ้อมถอยกลับ                                         | WiWat + โรมัน | W2, W4, R4         |

เส้นทางวิกฤต: W1/R2 → W2 → (W4, R4) → G ข้อที่โรมันเริ่มได้ทันที: R1, R3

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

### R4: engine ฝั่งแอป (เริ่มหลัง W2 เท่านั้น)

เป้าหมาย: ลดการเขียนกฎซ้ำสองที่ โดยให้ `PATCH /api/rentals/[id]` อ่านเส้นทางจากตาราง แทนตาราง `allowedFrom` เขียนตายตัว

- สร้าง `lib/workflow.ts` ฟังก์ชัน เช่น `canTransition(workflowCode, fromState, toState, actorRoles)` อ่านจาก `workflow_transition` + `workflow_transition_role` (มี cache สั้นๆ ได้)
- ข้อความ error และรหัส HTTP ต้องคงเดิม (พฤติกรรมต้องเหมือนเดิมทุกกรณีที่ใช้อยู่)
- ไฟล์ที่ต้องดู: `app/api/rentals/[id]/route.ts` (ตาราง `allowedFrom` และการตรวจผู้ให้เช่า/ผู้เช่า)
- รายละเอียดเพิ่มเติม WiWat จะส่งหลัง W2 อย่าเริ่มก่อนเพราะเส้นทางอาจเปลี่ยน

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

---

## 12. วิธีถอยกลับ (เรียงจากเบาไปหนัก)

1. **สลับโหมดกลับ** (ทันที ไม่ต้อง deploy ข้อมูลไม่หาย):
   `UPDATE public.system_config SET config_value = 'static' WHERE config_key = 'workflow_mode';`
2. **ย้อนฐานข้อมูลเฟส 1** รัน `supabase/migrations/down/27_dynamic_workflow_core.down.sql`
   (export `workflow_history` ก่อนถ้าต้องการเก็บ) ตรวจด้วย `supabase/setup/check_install.sql` ต้องได้ `structure_hash = 77b289a75e91`
3. **ย้อนโค้ดแอป** ติด tag ไว้ที่ `v1-static-workflow` (โค้ดก่อนเริ่มงานนี้) หรือทิ้ง branch `dynamic-workflow`
4. **ถ้า dynamic workflow ล้มเหลวทั้งหมด:** ตามข้อตกลงในหัวข้อ 8 ให้กลับไปแก้ F1-F3 ใน production จริง

ข้อมูลธุรกิจ (ออเดอร์ การชำระเงิน ฯลฯ) และคอลัมน์สถานะข้อความเดิม **ไม่ถูกแตะ** ในทุกขั้นข้างบน

---

## 13. วิธีส่งงานกลับ (Git)

```
git checkout dynamic-workflow
git pull origin dynamic-workflow
git checkout -b dynamic-workflow-admin      # ตั้งชื่อตามงาน
# ... แก้โค้ด ...
npm run build                               # ต้องผ่านก่อน commit
git add <ไฟล์ทีละไฟล์>
git commit -m "feat(admin): ..."
git push -u origin dynamic-workflow-admin
```

แล้วเปิด Pull Request บน GitHub จาก `dynamic-workflow-admin` ไปยัง **`dynamic-workflow`** (ไม่ใช่ `main` หรือ `Port`)
ใส่ในรายละเอียด PR: ทำอะไร, ทดสอบอย่างไร, เกณฑ์ผ่านข้อไหนผ่านแล้ว, ถ้ามีการเปลี่ยนฐานข้อมูล ให้แนบไฟล์ down และผลทดสอบ hash

---

## 14. คำถามที่ยังเปิดอยู่ (ต้องตัดสินใจร่วมกัน)

1. เส้นทางผิดปกติ (ส่งสลิปตอน `requested` ข้ามการอนุมัติ) จะ **ไม่ใส่** ใน seed (ปล่อยให้ถูกบล็อกในโหมด dynamic) หรือ **ใส่** (ถือเป็นพฤติกรรมที่ตั้งใจ)? ตอนนี้ยังไม่ได้ใส่
2. สถานะที่ไม่มีทางเข้า (`item_received`, `item_returned`, `rejected`, `Banned`) เก็บไว้หรือตัดทิ้ง? ตอนนี้เก็บไว้ในรายการ
3. ต้องการเส้นทาง `Suspended`/`Deactivated` → `Active` (แอดมินยกเลิกการระงับ / ผู้ใช้เปิดบัญชีคืน) และ KYC `rejected` → `pending` (ส่งเอกสารใหม่) หรือไม่?
4. F1 (`newStatus` ในฟังก์ชันอัปโหลดหลักฐาน) ซึ่งไม่ได้ถูกใช้ ควรลบทิ้งจากโค้ดเลยหรือไม่ (ตอนนี้ตกลงว่ารอโหมด dynamic ปิดให้)
5. เมื่อทดสอบผ่านแล้ว จะนำเข้า production อย่างไร (ต้องรัน migration 24, 24b, 25 บน production พร้อมไฟล์ down และมี `full_install.sql` ใหม่) ตัดสินใจร่วมกับทีมก่อน ไม่มีใครรันบน production เดี่ยวๆ

---

## 15. ไฟล์อ้างอิงใน repo (branch `dynamic-workflow`)

| ไฟล์                                                         | หน้าที่                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `supabase/setup/full_install.sql`                            | ติดตั้งฐานข้อมูลทั้งหมดบนโปรเจกต์ว่าง                         |
| `supabase/setup/check_install.sql`                           | ตรวจโครงสร้างหลังติดตั้ง (hash `77b289a75e91`)                |
| `supabase/migrations/27_dynamic_workflow_core.sql`           | migration เฟส 1                                               |
| `supabase/migrations/down/27_dynamic_workflow_core.down.sql` | ย้อนกลับเฟส 1                                                 |
| `supabase/setup/check_workflow_phase1.sql`                   | ตรวจหลังรัน 24 (hash `6a0e828cd7c6`), ดูรายการผิดกฎ, สลับโหมด |
| `supabase/migrations/README.md`                              | อธิบายการจัดไฟล์ migration                                    |
| `lib/admin-auth.ts`                                          | `requireAdmin()` (หน้า) และ `verifyAdminApi()` (API)          |
| `app/api/rentals/[id]/route.ts`                              | ตาราง `allowedFrom` ที่ R4 จะแทนที่                           |

### ติดต่อ

- WiWat (Port): ฐานข้อมูล, migration, การวิเคราะห์ผลทดสอบ, ผู้ทดสอบฝั่งผู้เช่า/ผู้ให้เช่า
- โรมัน (defnotRM): เจ้าของ repo, หน้าแอดมิน, การทดสอบฝั่งแอดมิน, ตัดสินใจเรื่องนำเข้า production
