# ChaoChao — Admin Panel: สเปกงานสำหรับ Roman (Front + Back)

2026-09-18

## 1. ภาพรวม

**แก้ไขจากฉบับแรก:** ฉบับแรกยึดโครง "8 หน้าจอ" จากเอกสารร่างต้นโปรเจกต์ (FOR_DEV_Tab) ซึ่งท้ายเอกสารนั้นเองระบุไว้ชัดว่า **"หน้าที่แอดมิน เพื่อนจะส่งให้อีกรอบ (Product Owner ยังไม่ตอบ)"** — พูดง่ายๆ คือ 8 หน้านั้นเป็นการเดาของทีมเอง ไม่เคยผ่านการยืนยันจาก PO เลย ฉบับนี้เขียนใหม่โดย**ยึดเฉพาะสิ่งที่ระบุไว้จริงใน Functional Requirements (FR) ฉบับล่าสุดเท่านั้น**

**ไล่ทั้งฉบับ FR-01 ถึง FR-54 แล้ว พบว่าคำว่า "แอดมิน" ถูกพูดถึงจริงแค่ 3 เรื่อง:**
1. ตรวจสอบตัวตน/บัญชีธนาคาร (FR-04, FR-05, FR-06, FR-07)
2. ตัดสินข้อพิพาทที่มีรายงานเข้ามา (FR-35, FR-36, FR-37, FR-38, FR-39)
3. เห็นภาพรวมรายได้ + อัตราข้อพิพาท (FR-54)

**ไม่มีบรรทัดไหนใน FR พูดถึง:** หน้า User Management แบบเบราว์สรายชื่อทั่วไป, หน้า Item Moderation แบบตรวจสินค้าต่อเนื่อง, หน้า Rental Orders แบบเบราว์ส order ทั้งหมด, หน้า Financial & Payouts แยกต่างหาก, หรือหน้า Settings ปรับค่าคอมมิชชัน — ทั้งหมดนี้เป็นสิ่งที่ทีมคิดเผื่อไว้เอง **ไม่ผิดที่จะทำเพิ่มทีหลังถ้า PO ต้องการจริง แต่ไม่ควรเป็นสิ่งที่ Roman ต้องเริ่มทำก่อน**

**สรุป: งานที่ยึดตาม FR จริงๆ มีแค่ 3 พื้นที่ ไม่ใช่ 8 หน้า** ดูหัวข้อ 3

## 2. Auth สำหรับ Admin

**มีอยู่แล้ว:** ฟังก์ชัน `is_admin()` บน Supabase (SECURITY DEFINER) เช็คว่า `auth.uid()` ปัจจุบันมี role `admin` อยู่ในตาราง `user_role_assignment` หรือไม่ — ใช้ซ้ำได้เลยทั้งฝั่ง RLS policy และเรียกผ่าน `supabase.rpc('is_admin')` จากฝั่งแอป

**ยังไม่มี:** วิธีที่ทำให้ user คนหนึ่งกลายเป็น admin — ตอนนี้ไม่มี user คนไหนในระบบมี role นี้เลย (ต้อง insert แถวใน `user_role_assignment` ตรงๆ ผ่าน Supabase Studio ก่อน ยังไม่มี flow สมัคร/แต่งตั้ง admin ผ่านหน้าเว็บ — คำถามออกแบบข้อ 1 ในหัวข้อ 5)

**Pattern ที่ต้องทำซ้ำในทุกหน้า admin** (เหมือนที่ทำไว้แล้วกับหน้า `/dashboard/[id]/...` ตอนปิดช่องโหว่ session):
```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");

const { data: isAdmin } = await supabase.rpc("is_admin");
if (!isAdmin) notFound();
```
แนะนำให้ทำเป็น **shared helper function** ใช้ร่วมกันทุกหน้า admin แทนที่จะก็อปวางซ้ำหลายรอบ เช่น `lib/admin-auth.ts` export ฟังก์ชัน `requireAdmin()`

**เรื่อง Layout:** แนะนำสร้าง `app/admin/layout.tsx` ที่เช็ค auth ตรงนี้ที่เดียว (ครอบทุกหน้าลูกอัตโนมัติ) ดีกว่าเช็คซ้ำทีละหน้า

## 3. งาน 3 พื้นที่ ที่ยึดตาม FR จริง

### 3.1 ตรวจสอบตัวตน / KYC (FR-04, 05, 06, 07)
คิวรออนุมัติ: รูปบัตรประชาชน + selfie คู่บัตร + บัญชีธนาคาร ของทั้งผู้เช่า (ตอนเช่าครั้งแรก) และผู้ให้เช่า (ตอนสมัคร หรือขอเพิ่ม role หรือเปลี่ยนบัญชีธนาคาร)
**ข้อมูลจาก:** `useraccount.id_card_url`, `id_card_selfie_url`, `identity_verification_status` (pending/verified/rejected) และ `bankaccount.verification_status` — **เก็บแยกกันตั้งใจ** เปลี่ยนบัญชีธนาคารไม่กระทบสถานะตรวจบัตรที่ไม่ได้เปลี่ยน
**Action:** `UPDATE` สถานะที่เกี่ยวข้องเป็น verified/rejected

### 3.2 ตัดสินข้อพิพาท (FR-35, 36, 37, 38, 39) — งานสำคัญที่สุด
คิวรายงานที่รอตัดสิน: สินค้าเสียหาย (FR-37), ผู้เช่าไม่คืนสินค้า (FR-36), สินค้าไม่ตรงปก (FR-38), รายงานบัญชีผู้ให้เช่า (FR-39)
**ข้อมูลจาก:** ตาราง `rentalreport` (join `rentalreporttype` ดูประเภท) ที่ `status='pending_investigation'`
**Action:** เรียก RPC `settle_rental_order(p_order_id, p_caller_id, p_outcome, p_damage_amount)` ตาม mapping ในภาคผนวก แล้ว `UPDATE rentalreport SET status = ..., verdict = ...` — กรณี FR-39 (รายงานบัญชี) เพิ่ม `UPDATE useraccount SET status = 'Suspended'` ด้วย
FR-35 ยังระบุว่าผู้รายงานขอเปลี่ยนแอดมินตัดสินใหม่ได้ 1 ครั้ง — ยังไม่มีกลไกนับจำนวนครั้งนี้ (คำถามข้อ 2 ในหัวข้อ 5)

### 3.3 Dashboard ภาพรวม (FR-54)
FR-54 ระบุแค่ **"เห็นภาพรวมรายได้ของเว็บไซต์ และอัตราส่วนการเกิดข้อพิพาท"** — ไม่ได้ขอหน้าสรุปสถิติเต็มรูปแบบแบบที่เคยร่างไว้ ทำแค่ตัวเลข 2 ก้อนนี้ก็ครบตาม FR:
- รายได้แพลตฟอร์ม: `SUM(rentalorder.fee)` (ค่าคอมมิชชัน 10% ที่เก็บจริงจากทุก order)
- อัตราข้อพิพาท: `COUNT(rentalreport) / COUNT(rentalorder ที่ completed ขึ้นไป)`

### ⏸️ ไม่ได้อยู่ใน FR — ทำต่อเมื่อ PO ยืนยันเท่านั้น
User Management (เบราว์สผู้ใช้ทั่วไป), Item Moderation (ตรวจสินค้าต่อเนื่อง), Rental Orders (เบราว์ส order ทั้งหมด), Financial & Payouts (แยกจาก dashboard), Settings (ปรับค่าคอมมิชชัน/หมวดหมู่) — เดิมร่างไว้ในเวอร์ชันแรกทั้งหมด แต่**ไม่มีที่มาจาก FR เลย** ถ้า Roman มีเวลาเหลือหลังทำ 3.1-3.3 เสร็จ ค่อยพิจารณาเพิ่มเป็นลำดับถัดไป ไม่ใช่ทำคู่ขนานตั้งแต่แรก

## 4. Backend API routes ที่ต้องสร้างใหม่

ยังไม่มีสักไฟล์เดียว ตัดให้เหลือแค่ตรงกับ 3 พื้นที่ในหัวข้อ 3 (ทุก route เช็ค `is_admin()` ก่อนเสมอ ตาม pattern หัวข้อ 2):

```
app/api/admin/
  ├── kyc/route.ts                      GET  list ผู้ใช้ที่ identity_verification_status='pending'
  ├── kyc/[userId]/route.ts             PATCH อนุมัติ/ปฏิเสธ id_card + bankaccount แยกกัน
  ├── disputes/route.ts                 GET  list rentalreport ที่ pending_investigation
  ├── disputes/[id]/resolve/route.ts    POST ตัดสิน → เรียก settle_rental_order + update rentalreport
  └── stats/route.ts                    GET  รายได้รวม + อัตราข้อพิพาท (FR-54 เท่านั้น)
```

ทุก route ใช้ `createAdminClient()` (service role) สำหรับ query/update ทั่วไปได้เลย เพราะผ่านการเช็ค `is_admin()` มาก่อนแล้วที่ชั้น auth — ยกเว้น `disputes/[id]/resolve` ควรใช้ client ที่ผูก session (`createClient()`) เพื่อให้ `auth.uid()` ในฟังก์ชัน `settle_rental_order` ตรงกับแอดมินที่ล็อกอินจริง (ฟังก์ชันเช็ค `is_admin()` ซ้ำอีกชั้นภายในตัวเองอยู่แล้ว)

## 5. คำถามที่ต้องตัดสินใจก่อนเขียนโค้ดจริง

1. **จะกำหนดใครเป็น admin ยังไง?** ไม่มี flow สมัคร/แต่งตั้งผ่านหน้าเว็บเลยตอนนี้ — ให้ทีมพัฒนา insert เข้า `user_role_assignment` ตรงๆ ผ่าน Supabase ไปก่อน (เร็วสุด เหมาะกับสเกลตอนนี้ที่มีแอดมินไม่กี่คน) หรือต้องมีหน้าแต่งตั้งจริงจัง?
2. **FR-35 (ขอเปลี่ยนแอดมินตัดสินใหม่ได้ 1 ครั้ง)** — ยังไม่มีกลไกนี้เลย ต้องเพิ่มคอลัมน์นับจำนวนครั้งที่ขอเปลี่ยนใน `rentalreport` ไหม หรือข้ามฟีเจอร์นี้ไปก่อนในเวอร์ชันแรก (ทำแค่ตัดสินครั้งเดียวจบ)?
3. **ส่วนที่ตัดออกในหัวข้อ 3** — อยากให้ Roman ถาม PO ให้ชัดก่อนไหมว่าจริงๆ ต้องการ User Management / Item Moderation / Settings แบบที่เคยร่างไว้หรือเปล่า จะได้ไม่เสียเวลาทำสิ่งที่ไม่มีใครขอ

## 6. ภาคผนวกทางเทคนิค (สำหรับ AI/นักพัฒนาที่จะเริ่มงานนี้)

**Stack:** Next.js App Router + Supabase (Postgres + Auth + Storage) + TypeScript + Zod + Tailwind

**Helper functions ที่มีอยู่แล้วบน Supabase:** `is_admin()`, `is_item_owner(item_id)`, `is_order_participant(order_id)`, `is_chat_participant(chat_room_id)` — ทั้งหมด `SECURITY DEFINER`

**RPC เงินหลักที่ admin panel ต้องเรียก:**
```sql
settle_rental_order(
  p_order_id uuid, p_caller_id uuid,
  p_outcome text,  -- 'happy' | 'damaged' | 'lender_noshow' | 'renter_noshow' |
                    -- 'renter_rejected_meetup' | 'false_advertisement_approved' |
                    -- 'false_advertisement_rejected' | 'item_not_returned' |
                    -- 'item_not_returned_rejected'
  p_damage_amount numeric DEFAULT 0
) RETURNS text

cancel_rental_order(p_order_id uuid, p_caller_id uuid, p_caller_role text) RETURNS text
confirm_additional_payment(p_payment_id uuid) RETURNS text
```

**Mapping report_type → outcome ที่แอดมินต้องเลือกตอนตัดสิน:**

| `rentalreporttype.type_name` | ตัดสินว่าอนุมัติ | ตัดสินว่าไม่จริง |
| --- | --- | --- |
| `damaged_item` | outcome=`damaged` (ใส่ `p_damage_amount`) | outcome=`happy` |
| `stolen_item` | outcome=`item_not_returned` | outcome=`item_not_returned_rejected` |
| `false_advertisement` | outcome=`false_advertisement_approved` | outcome=`false_advertisement_rejected` |
| `other` | ไม่มี outcome สำเร็จรูป — ต้องออกแบบเพิ่ม | — |

**ตารางหลักที่เกี่ยวข้อง:**
- `useraccount(user_id, status, id_card_url, id_card_selfie_url, identity_verification_status, ...)`
- `bankaccount(bank_account_id, user_id, verification_status, ...)`
- `item(item_id, user_id, category_id, status, rented, average_rating, ...)`
- `rentalorder(order_id, user_id, item_id, status, rental_fee, deposit, fee, net_income, cancellation_fee, damage_fee, cancel_reason, cancel_reason_image_url, ...)` — status มี 18 ค่า (ดูไฟล์ `supabase/migrations/` เลข 07-18 ในโค้ดสำหรับรายการเต็ม)
- `payment(payment_id, order_id, user_id, amount, status, date, transaction_ref, ...)` — status: pending/paid/rejected/refunded
- `rentalreport(report_id, order_id, reporter_id, report_type_id, description, status, verdict, damage_amount, ...)` — status: pending_investigation/resolved_renter_fault/resolved_lender_fault/dismissed
- `rentalreporttype(report_type_id, type_name)` — ค่าปัจจุบัน: damaged_item, false_advertisement, other, stolen_item
- `cancellationtype(cancellation_type_id, cancellation_type)` — within_24hr, advance_notice, late_notice (ข้อมูล ไม่ใช่ CHECK constraint)

**ประวัติ migration ที่เกี่ยวข้อง:** ไฟล์ `07` ถึง `18` ใน `supabase/migrations/` ของ repo คือของจริงที่ apply บน production แล้วทั้งหมด (ไฟล์ `01`-`06` เก่าใช้อ้างอิงไม่ได้ ผิดเพี้ยนจาก production ไปแล้ว)

**Auth pattern ของทั้งระบบ:** session-based ผ่าน `createClient()` (จาก `@/lib/supabase/server`) สำหรับเช็คว่าใครล็อกอินอยู่ + `createAdminClient()` (จาก `@/lib/supabase/admin`, ใช้ service role key) สำหรับ query/update ข้อมูลหลังผ่านการเช็คสิทธิ์แล้ว — ทุก API route ที่มีอยู่ในระบบตอนนี้ตาม pattern นี้ทั้งหมด ให้ยึดตามเดิม
