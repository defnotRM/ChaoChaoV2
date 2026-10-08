# เอกสารส่งมอบงาน: รอบปรับปรุงหลัง Dynamic Workflow (ต.ค. 2026)

อ่านทั้งไฟล์ก่อนเริ่ม แล้วทำเฉพาะงานของตัวเอง (หัวข้อ 3–5) ถ้าข้อมูลในไฟล์นี้ขัดกับโค้ดหรือฐานข้อมูลจริง ให้แจ้งก่อน ห้ามเดา

## 1. สถานะปัจจุบัน

- `main` ล่าสุด (`1aa9b88`) รวมแล้ว: หน้าแอดมินตั้งค่า workflow (`/admin/workflow`), แก้ชื่อคอลัมน์ประวัติเป็น `state_name_th`, แก้ lint หน้านั้น และเปลี่ยน `middleware.ts` เป็น `proxy.ts` (Next.js 16)
- Production Supabase (`awnwvckyjkkuhufmdgas`) อยู่ในโหมด `shadow` และ `workflow_history` ยังว่าง ยังไม่มีข้อมูลใช้งานจริงพอจะสรุปว่าเส้นทางสถานะครบ
- ตรวจทั้งโปรเจกต์แล้ว: `tsc` ไม่มี error, `eslint` ทั้งโปรเจกต์ 72 errors / 134 warnings ใน 55 ไฟล์
- การวิเคราะห์ทำจากโค้ดเท่านั้น ยังไม่มีใครเปิดเว็บไล่ดูหน้าตาจริงทุกหน้า

## 2. กติกากลาง (ทุกงาน)

1. แตก branch จาก `main` ต่อ 1 งาน แล้วเปิด PR เข้า `main` ห้าม push ตรงเข้า `main`
2. ก่อนส่ง ต้องผ่าน `npx tsc --noEmit`, `npx eslint <ไฟล์ที่แก้>` และ `npm run build`
3. ห้ามรัน SQL หรือ migration บน production ทดสอบบน staging เท่านั้น ห้ามแปะ key ในแชท PR หรือโค้ด ห้าม commit ไฟล์ `.env*`
4. ห้ามเปลี่ยน `workflow_mode` เป็น `dynamic` จนกว่าทีมตกลงกัน
5. ระบุไฟล์ตอน `git add` ทีละไฟล์ ห้ามใช้ `git add -A`
6. ก่อนเขียนโค้ด Next.js ให้ดู `node_modules/next/dist/docs/` เพราะเวอร์ชัน 16 มี breaking changes (`AGENTS.md`)
7. UI ใช้ภาษาไทยและยึด `DESIGN_SYSTEM.md` (สี Navy `#1b3554`, Steel `#3f6593`, การ์ด `rounded-3xl`, ไอคอน `lucide-react`)
8. คำอธิบาย PR ต้องมี: ทำอะไร, ทดสอบอย่างไร, อะไรที่ยังไม่ได้ทดสอบ

## 3. WiWat: ฝั่ง backend และฐานข้อมูล

| รหัส | งาน | ส่งมอบ / เกณฑ์ผ่าน |
|---|---|---|
| W1 | **แก้ `GET /api/users`** (`app/api/users/route.ts`) route นี้ไม่ต้องล็อกอิน และสร้าง `existingIds` จากรายชื่อที่กรอง `Suspended`/`Banned` ออกแล้ว จึง `upsert` บัญชีที่ถูกระงับกลับเป็น `status: "Active"` ทุกครั้งที่ถูกเรียก ให้เลิกเขียน DB ใน GET (ซิงก์ตอนสมัครสมาชิกแทน) และเลิกเรียก `auth.admin.listUsers` ทุก request | บัญชี `Suspended` ยังเป็น `Suspended` หลังเรียก `/api/users` หลายครั้ง (ทดสอบบน staging) |
| W2 | **เพิกถอน `EXECUTE` ของ `anon` และ `authenticated`** บนฟังก์ชัน `SECURITY DEFINER` 22 ตัว (ช่องโหว่ F3 ใน `HANDOFF_DYNAMIC_WORKFLOW.md` หัวข้อ 8) เช่น `settle_rental_order`, `upload_rental_evidence`, `cancel_rental_order`, `confirm_additional_payment`, `process_expired_orders` ที่รับ `p_caller_id` จากผู้เรียกเอง ฟังก์ชันที่ policy/trigger ใช้ (`is_admin`, `is_order_participant` ฯลฯ) ต้องตรวจก่อนว่าถอนแล้วระบบไม่พัง | ไฟล์ migration ต่อเลข (30) + ไฟล์ `down` + ทดสอบ UP→DOWN และตรวจ structure hash + ทดสอบบน staging ว่าทุก flow ผ่าน route ของแอปยังทำงาน + อัปเดต `supabase/setup/full_install.sql` ให้ตรงกัน |
| W3 | **ตัดช่องโหว่ F1 และสลิปปลอมสำรอง** ลบการรับ `newStatus` ใน `app/api/rentals/[id]/evidence/route.ts` และ schema `uploadEvidenceSchema` (`lib/validations/rental.ts`) ลบ fallback สลิปในรูปแบบ raw input ใน `app/api/payments/route.ts` | PR + ยืนยันว่าหน้าจอที่ใช้ endpoint นี้ยังทำงาน |
| W4 | **ตั้งค่า Supabase** เปิด leaked password protection, ย้าย extension `btree_gist` ออกจาก schema `public`, ตั้ง `search_path` ให้ `public.set_updated_at` | บันทึกใน PR ว่าทำอะไรไปแล้ว (ส่วนที่เป็น SQL ต้องมี migration + down) |
| W5 | **ดู shadow mode** ตรวจ `workflow_history` และรายการ `SHADOW_VIOLATION` (คิวรีใน `HANDOFF_DYNAMIC_WORKFLOW.md` หัวข้อ 11) หลังมีผู้ใช้จริง แล้วสรุปว่าเส้นทางครบพอจะเปิด `dynamic` หรือยัง | ข้อความสรุปสั้น พร้อมรายการเส้นทางที่ขาด (ถ้ามี) |

## 4. โรมัน: ฝั่งแอดมินและความปลอดภัยของ API

| รหัส | งาน | ส่งมอบ / เกณฑ์ผ่าน |
|---|---|---|
| R1 | **กันเปิดโหมด `dynamic` ฝั่ง API** `PATCH /api/admin/workflow/config` ต้องรับ field ยืนยัน เช่น `confirmDynamic: true` เมื่อ `mode = "dynamic"` ไม่งั้นตอบ 400 พร้อมข้อความ ปรับหน้า `app/admin/(portal)/workflow/page.tsx` ให้ส่ง field นี้จากกล่องยืนยัน | เรียก API ตรงด้วย `{mode:"dynamic"}` ไม่ผ่าน, กดผ่านกล่องยืนยันบนหน้าเว็บยังผ่าน |
| R2 | **ทดสอบกับข้อมูลจริง** (ทำบน staging) (ก) `/admin/workflow`: สลับ static→shadow→static ตรงกับ `SELECT public.workflow_mode()`, แก้ `approval_timeout_hours` แล้วมี `updated_by` และ `updated_at`, ใส่ค่าผิดชนิดแล้วถูกปฏิเสธ, ตารางประวัติแสดงชื่อสถานะภาษาไทยถูกต้อง (ไม่ใช่ "ไม่ระบุ") (ข) `proxy.ts`: admin ล็อกอินแล้วถูกล็อกใน `/admin/*`, ผู้ใช้ทั่วไปเข้า `/admin/*` ถูกส่งไป `/admin/login`, ผู้ใช้ที่ล็อกอินแล้วเข้า `/login` ถูกส่งกลับ `/`, ผู้ใช้ที่ยังไม่ล็อกอินเข้า `/` และ `/users` ถูกส่งไป `/login` | ตารางผ่าน/ไม่ผ่านทีละข้อ พร้อมสกรีนช็อต แจ้งบั๊กที่เจอ |
| R3 | **เลิกเก็บรูปเป็น base64 ใน DB** เมื่ออัปโหลดขึ้น Storage ไม่ได้ ใน `app/api/handover/route.ts`, `app/api/profile/avatar/route.ts`, `app/api/profile/banner/route.ts`, `app/api/payments/route.ts` ให้ตอบ error ชัดเจนแทน และตรวจ `app/api/avatar/route.ts` ที่ยังรองรับ data URI เก่าให้ยังเปิดรูปเดิมได้ | อัปโหลดล้มเหลวแล้วไม่มีแถวใหม่ที่เก็บ `data:` ใน DB, รูปเก่ายังแสดงได้ |
| R4 | **ทำ component กลาง `ConfirmDialog` และ Toast** ตามสไตล์หน้าแอดมิน (วางที่ `components/ui/`) แล้วแทนที่ `alert()`/`confirm()` ใน `app/chat/page.tsx`, `app/rental/[id]/review/ReviewClient.tsx`, `app/lender/myhiredproductsList/[id]/review/ReviewReplyClient.tsx`, `components/ui/RegisterForm.tsx` | PR + ชื่อ component และตัวอย่างการใช้ เพื่อให้ F2 นำไปใช้ต่อ (ให้ merge PR นี้ก่อน) |
| R5 | **ล้าง lint หน้าแอดมิน** `app/admin/(portal)/disputes/page.tsx` และ `app/admin/(portal)/kyc/page.tsx` (`any`, ตัวแปรไม่ใช้, setState ใน effect) โดยพฤติกรรมเหมือนเดิม | `eslint` ของสองไฟล์นี้สะอาด |

## 5. แฟนต้า: ฝั่ง frontend และโครงสร้างโค้ด

งานชุดนี้แยกเป็นหลาย branch ให้ทำขนานกันได้ ยกเว้น F1 กับ F2 ที่แตะไฟล์ใกล้กัน ให้ F1 merge ก่อน และ F2 ส่วนที่ใช้ `ConfirmDialog` ต้องรอ R4 ของโรมัน

| รหัส | งาน | ส่งมอบ / เกณฑ์ผ่าน |
|---|---|---|
| F1 | **รวม flow เช่าที่ซ้ำกันให้เหลือชุดเดียว** ตอนนี้มี 2 ชุด: `app/product/[id]/rent` + `app/product/[id]/request` กับ `app/renter/hireproduct/[id]/booking` + `app/renter/hireproduct/[id]/request` (`BookingClient` 1,001 กับ 837 บรรทัด, `RequestClient` 686 กับ 657 บรรทัด) ตรวจก่อนว่าชุดไหนเป็นของจริงที่ถูกลิงก์ใช้ เก็บชุดเดียว เพิ่ม redirect จาก URL ของชุดที่ลบ ตรวจลิงก์ทั้งโปรเจกต์ไม่แตก | จองและส่งคำขอเช่าได้ครบ flow, ทุกลิงก์เดิมยังไปถึงหน้าที่ถูก, ไม่มีโค้ดซ้ำเหลือ |
| F2 | **แตกไฟล์ใหญ่เป็น component ย่อย** (พฤติกรรมและหน้าตาเหมือนเดิม) `app/dashboard/[id]/lend/[orderId]/LendOrderDetailClient.tsx` (1,618 บรรทัด), `app/dashboard/[id]/rent/[orderId]/RentOrderDetailClient.tsx` (1,209), `app/profile/page.tsx` (1,243), `app/lender/editmyproduct/[id]/EditProductClient.tsx` (1,186), `app/lender/postproduct/PostProductClient.tsx` (1,094) ในสองหน้ารายละเอียดออเดอร์ให้เปลี่ยน `alert/confirm` เป็น `ConfirmDialog` ของ R4 | 1 PR ต่อไฟล์, ไฟล์หลักไม่เกิน ~400 บรรทัด, ทุกปุ่มในหน้าทำงานเหมือนเดิม |
| F3 | **เปลี่ยน `<img>` เป็น `next/image`** (45 จุดที่ lint เตือน) ตั้ง `remotePatterns` ใน `next.config.ts` สำหรับโดเมน Supabase Storage และตรวจ `alt` ทุกจุด และ **เอา `lib/mock/product` ออกจากหน้าแรก** (`app/page.tsx`) ใช้ข้อมูลหมวดหมู่จริงจาก DB | รูปสินค้า/โปรไฟล์/หลักฐานยังแสดงครบ, หน้าแรกไม่ import mock |
| F4 | **แก้ชื่อ route สะกดผิดและไฟล์ `.jsx`** `rental/[id]/confrim-return` → `confirm-return`, `rental/[id]/confirm-recieve` → `confirm-receive` (เพิ่ม redirect จาก URL เก่า และแก้ลิงก์ที่อ้างถึง), แปลง 5 หน้า `.jsx` เป็น `.tsx` (`lender/dashboard`, `lender/my-items`, `rental/[id]/confirm-recieve`, `rental/[id]/confrim-return`, `renter/dashboard`) และล้าง lint ที่เหลือนอกโฟลเดอร์ admin (`any`, ตัวแปรไม่ใช้) | URL เก่ายังเปิดได้ผ่าน redirect, `eslint` นอก admin ลดลงชัดเจน (รายงานตัวเลขก่อน/หลังใน PR) |

## 6. ลำดับและการ merge

1. เริ่มพร้อมกันได้ทุกงาน ยกเว้น F2 (ส่วน `ConfirmDialog`) ต้องรอ R4
2. ก่อนเปิดโหมด `dynamic` ต้องเสร็จ W1, W2, W3, R1, R2 และ W5 ให้ผลสรุปว่าพร้อม
3. W2 แตะ production ผ่าน migration ต้องให้คนที่ดูแล DB รันเอง และทดสอบ UP→DOWN บน staging ก่อนทุกครั้ง
4. ถ้าสองงานแก้ไฟล์เดียวกัน ให้ merge ตัวที่เล็กกว่าก่อน แล้วอีกคน `git merge main` เข้า branch ตัวเองก่อนเปิด PR
5. ห้าม merge PR ของตัวเองโดยไม่มีคนตรวจ ยกเว้นตกลงกันไว้ล่วงหน้า

## 7. ที่ยังไม่รู้ / ต้องตัดสินใจ

- จะเปิด `dynamic` บน production เมื่อไร และใช้เกณฑ์อะไรดูว่า shadow mode พร้อม (W5)
- ฟังก์ชัน `SECURITY DEFINER` ตัวไหนต้องคงสิทธิ์ให้ `authenticated` เรียกตรง (ถ้ามี) ก่อนทำ W2
- flow เช่าชุดไหนคือของจริง (F1)
- งานที่ตรวจไม่ได้จากโค้ด: ความสวยงามและความใช้งานจริงของแต่ละหน้า ควรมีคนเปิดเว็บไล่ดูทุกหน้าหลัง F1–F4 เสร็จ
