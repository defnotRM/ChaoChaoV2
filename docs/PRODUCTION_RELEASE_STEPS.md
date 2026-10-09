# ขั้นตอนขึ้น production: แก้ช่องโหว่ + migration 30–32

สำหรับคนที่ดูแล production (Supabase `awnwvckyjkkuhufmdgas` และตัว deploy ของแอป) อ่านทั้งไฟล์ก่อนเริ่ม ทำทีละขั้น และหยุดทันทีถ้าผลตรวจไม่ตรงที่เขียนไว้

## 0. สิ่งที่จะขึ้น และทำไมเร่ง

| รายการ | ผลต่อระบบ | ความเร่งด่วน |
|---|---|---|
| โค้ดแอป `main` (PR #20 และ PR #23 ถ้า merge แล้ว) | PR #20 ปิดช่องที่ผู้ใช้ตั้ง `user_metadata.role = admin` แล้วเรียก `GET /api/users` เพื่อได้สิทธิ์แอดมิน และไม่ให้ `/api/users` ปลดการระงับบัญชี | **สูงสุด** ช่องโหว่ยังเปิดอยู่จนกว่าจะ deploy |
| migration 30 | ถอนสิทธิ์เรียกฟังก์ชัน `SECURITY DEFINER` จาก `anon`/คนอื่น และผูก `p_caller_id` ของ `settle_rental_order`/`cancel_rental_order` กับผู้ล็อกอิน | สูง ผู้ไม่ล็อกอินปิดยอดหรือยกเลิกออเดอร์ของคนอื่นได้ ถ้ารู้ order id กับ user id |
| migration 31 | ตั้ง `search_path` ของ `set_updated_at` และย้าย `btree_gist` ไป schema `extensions` | ต่ำ (แก้คำเตือน advisors) |
| migration 32 | cron รายวันแจ้งเตือนออเดอร์ที่ค้างหลังเลยกำหนดคืน | ต่ำ |

ทั้ง 3 migration ทดสอบแล้ว: ฐานข้อมูลจำลอง (ทั้ง UP และ DOWN) และ Supabase staging จริง (30, 31 ผ่านชุดทดสอบโจมตี/ใช้งานปกติ, 32 ผ่านกับข้อมูลค้างจำลอง) **ยังไม่เคยรันบน production**

## 1. เงื่อนไขก่อนเริ่ม

- [ ] ทดสอบ flow เช่า-ชำระเงิน-ส่งมอบ-คืนของ-ยกเลิก-ข้อพิพาท บน staging ผ่านแล้ว (`docs/STAGING_TEST_CHECKLIST.md` ข้อ C)
- [ ] PR #23 (แก้ error ตอนอนุมัติ/ปฏิทิน/เวลานับถอยหลัง) ทดสอบแล้วและ merge เข้า `main` แล้ว (ถ้ายังไม่ผ่าน ให้ขึ้น `main` ปัจจุบันก่อนได้ แต่ PR #23 ไม่ใช่เรื่องความปลอดภัย)
- [ ] production รัน migration 29 แล้ว ตรวจใน SQL Editor ของ production:
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'workflow_cfg_num';  -- ต้องได้ 1 แถว
  SELECT config_value FROM public.system_config WHERE config_key = 'workflow_mode';  -- ต้องเป็น shadow
  ```
- [ ] จดคอมมิตที่ production ใช้อยู่ตอนนี้ไว้ (ใช้ย้อนกลับ): `git log -1 --format=%H` บนเซิร์ฟเวอร์ หรือ tag/image ที่กำลังรัน

## 2. ลำดับที่แนะนำ

1. **deploy แอป** (ปิดช่องโหว่แอดมินก่อน) ใช้วิธี deploy ที่ใช้อยู่ตามเดิม (repo มี `Dockerfile` และ `docker-compose.yml`, build ต้องส่ง `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ของ production)
2. รัน migration **30 → 31 → 32 ตามลำดับ** แต่ละไฟล์ใน SQL Editor ของ production (วางทั้งไฟล์ รันครั้งเดียว) และตรวจผลทุกไฟล์ก่อนไปไฟล์ต่อไป

ลำดับนี้ปลอดภัยทั้งสองทาง: โค้ดแอปเดิมก็ใช้ได้กับฐานข้อมูลหลัง migration 30 (ทุก route ที่เรียก `settle`/`cancel` ส่ง `p_caller_id = user.id` ผ่าน client ฝั่งผู้ใช้อยู่แล้ว) และโค้ดใหม่ก็ใช้ได้กับฐานข้อมูลก่อน migration

## 3. ตรวจหลังรันแต่ละ migration

**หลัง 30:**
```sql
-- ฟังก์ชันที่ anon เรียกได้ ต้องเหลือเฉพาะ 4 ตัวนี้ (ตัวช่วย RLS)
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY 1;
-- คาดหวัง: is_admin, is_chat_participant, is_item_owner, is_order_participant
```
และ cron ต้องรันสำเร็จในรอบถัดไป (ทุก 10 นาที):
```sql
SELECT status, start_time, left(return_message, 60) FROM cron.job_run_details ORDER BY start_time DESC LIMIT 3;
```

**หลัง 31:**
```sql
SELECT extnamespace::regnamespace FROM pg_extension WHERE extname = 'btree_gist';          -- extensions
SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE proname = 'set_updated_at';      -- search_path=public
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'no_overlapping_active_bookings'; -- ต้องยังมี
```

**หลัง 32:** `SELECT proname FROM pg_proc WHERE proname = 'send_reminder_notifications';` ต้องยังอยู่ 1 ฟังก์ชัน (ผลจริงจะเห็นหลัง cron รายวัน 09:00 UTC)

## 4. ทดสอบเร็วหลังขึ้น (production ใช้บัญชีจริง ห้ามสร้างออเดอร์ทดสอบเกินจำเป็น)

- [ ] เข้าสู่ระบบด้วยบัญชีผู้ใช้ทั่วไปได้, เปิดหน้า `/users` และหน้าสินค้าได้
- [ ] เข้า `/admin` ด้วยบัญชีแอดมินได้ และ `/admin/workflow` เปิดได้ ตารางประวัติแสดงชื่อสถานะ
- [ ] ผู้ใช้ทั่วไปเข้า `/admin` ไม่ได้
- [ ] ถ้าจะกดจริง: ทำ flow เช่า 1 ออเดอร์ด้วยบัญชีทดสอบของทีม (ดูว่าไม่มีข้อความ `permission denied` หรือ `ไม่มีสิทธิ์: p_caller_id`)

## 5. ถ้าพัง ย้อนกลับ

- **ฐานข้อมูล:** รันไฟล์ `down/` ย้อนลำดับ: `32_...down.sql` → `31_...down.sql` → `30_...down.sql` (ไฟล์ 30 down คืนสิทธิ์เดิมและคืนฟังก์ชัน `settle`/`cancel` เป็นของ migration 29 แต่**เปิดช่องโหว่กลับมา** ใช้เฉพาะเมื่อจำเป็นจริง)
- **แอป:** deploy คอมมิตหรือ image เดิมที่จดไว้ในหัวข้อ 1 (หรือกด Revert PR บน GitHub)
- อาการที่ต้องย้อน: ผู้ใช้กดขั้นตอนเช่า/ยกเลิก/ปิดยอดไม่ได้ และเห็น `permission denied` หรือ `ไม่มีสิทธิ์: p_caller_id` ซ้ำๆ ให้จดชื่อ route แล้วย้อนเฉพาะ migration 30 ก่อน

## 6. สิ่งที่ต้องทำใน Supabase Dashboard เอง (ไม่ใช่ SQL)

- [ ] เปิด **Leaked password protection** (Authentication → Password security) ของ production
- [ ] ตรวจรายชื่อแอดมินใน production ว่ามีเฉพาะคนที่ควรมี (ตรวจเมื่อ 9 ต.ค. 2026 พบ 2 บัญชี: `romanlnw68`, `admin_official` ไม่พบบัญชีแปลกปลอม ควรตรวจซ้ำหลัง deploy):
  ```sql
  SELECT u.username, u.email FROM public.user_role_assignment ura
  JOIN public.role r ON r.role_id = ura.role_id AND r.role_type = 'admin'
  JOIN public.useraccount u ON u.user_id = ura.user_id;
  ```

## 7. ห้ามทำในรอบนี้

- ห้ามเปลี่ยน `workflow_mode` เป็น `dynamic` (production ยังเป็น `shadow` และยังไม่มีข้อมูลการใช้งานจริงพอ)
- ห้ามแก้ไฟล์ migration 30–32 ที่ทดสอบแล้ว ถ้าต้องแก้ ให้สร้างไฟล์ใหม่ต่อเลขพร้อมไฟล์ `down/`
