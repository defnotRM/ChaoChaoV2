# รายการทดสอบบน staging ก่อนขึ้น production

ทดสอบกับแอปที่ชี้ staging (`.env.local` ใช้ key ของ staging ห้ามใช้ key ของ production) ติ๊กทีละข้อ ถ้าข้อไหนไม่ผ่านให้จดสิ่งที่เห็นไว้ แล้วหยุดก่อนขึ้น production

เงื่อนไขก่อนเริ่ม: staging รัน migration 27–31 ครบแล้ว (30 และ 31 รันแล้วเมื่อ 9 ต.ค. 2026) และแอปเป็น `main` ล่าสุด (มี PR #20)

## A. ช่องโหว่ยกระดับสิทธิ์ผ่าน metadata (PR #20)

ทดสอบว่า `user_metadata` ใช้ขอสิทธิ์แอดมินไม่ได้แล้ว

1. สมัครบัญชีใหม่ตรงกับ Supabase Auth ของ staging โดยตั้ง metadata เป็น admin (ใช้ anon key ของ staging ในคอนโซลเบราว์เซอร์หรือสคริปต์ชั่วคราว)
   ```js
   // supabase = createClient(<staging url>, <staging anon key>)
   await supabase.auth.signUp({
     email: 'metadata-test@example.com', password: 'Test1234!x',
     options: { data: { role: 'admin', signup_role: 'admin', username: 'metadatatest' } },
   })
   ```
2. เรียก `GET /api/users` (ไม่ต้องล็อกอิน) 2–3 ครั้ง และล็อกอินด้วยบัญชีนี้แล้วเรียก `GET /api/auth/me`
3. ตรวจใน SQL Editor ของ staging
   ```sql
   SELECT r.role_type
   FROM auth.users u
   LEFT JOIN public.user_role_assignment ura ON ura.user_id = u.id
   LEFT JOIN public.role r ON r.role_id = ura.role_id
   WHERE u.email = 'metadata-test@example.com';
   ```
   - [ ] ไม่มี `admin` ในผลลัพธ์ (มีได้แค่ `renter`/`lender` หรือว่าง)
   - [ ] เข้า `/admin` ด้วยบัญชีนี้ไม่ได้
4. ลบบัญชีทดสอบทิ้ง (Dashboard → Authentication → Users)

## B. บัญชีที่ถูกระงับต้องไม่ถูกปลด

1. ตั้งบัญชีทดสอบเป็นระงับ: `UPDATE public.useraccount SET status='Suspended' WHERE username='<บัญชีทดสอบ>';`
2. เรียก `GET /api/users` ซ้ำหลายครั้ง
3. - [ ] `SELECT status FROM public.useraccount WHERE username='<บัญชีทดสอบ>';` ยังเป็น `Suspended`
4. คืนค่า `Active` หลังทดสอบ

## C. ฟังก์ชันฐานข้อมูล (migration 30)

ทดสอบผ่านแอปจริงด้วย 2 บัญชี (ผู้เช่าและผู้ให้เช่า) และ 1 บัญชีแอดมิน

| # | ขั้นตอน | คาดหวัง | ผล |
|---|---|---|---|
| C1 | ผู้เช่าส่งคำขอเช่า | สถานะ `requested` | ☐ |
| C2 | ผู้ให้เช่ากดอนุมัติ | `awaiting_payment` | ☐ |
| C3 | ผู้เช่าอัปโหลดสลิป | สลิปสถานะ `pending` | ☐ |
| C4 | ผู้ให้เช่ากดอนุมัติสลิป | `paid` | ☐ |
| C5 | ทั้งสองฝ่ายอัปโหลดรูปก่อนเช่า (หน้าส่งมอบ) | `item_sent` | ☐ |
| C6 | ผู้เช่าและผู้ให้เช่าอัปโหลดรูปคืนของ | ปิดงานเป็น `completed` (ผ่าน `settle_rental_order`) | ☐ |
| C7 | ออเดอร์ใหม่ที่ `paid` ผู้เช่ายกเลิกก่อนวันนัด | `cancelled_by_renter` (ผ่าน `cancel_rental_order`) | ☐ |
| C8 | ออเดอร์ใหม่ที่ `paid` ผู้ให้เช่ายกเลิก | `cancelled_by_lender` | ☐ |
| C9 | ผู้เช่าปฏิเสธรับของหน้างาน หรือแจ้งของไม่ตรงปก | `rejected_at_meetup` / `disputed_at_meetup` | ☐ |
| C10 | แอดมินตัดสินข้อพิพาท (ทั้งสองทาง) | `refunded_dispute` / `completed` | ☐ |
| C11 | แอดมินตัดสินสินค้าเสียหายเกินมัดจำ แล้วยืนยันชำระส่วนต่าง | `awaiting_additional_payment` → `completed` | ☐ |
| C12 | ผู้ให้เช่าลงประกาศสินค้าใหม่ และผู้เช่ารีวิวหลังจบงาน | สำเร็จ | ☐ |
| C13 | ส่งข้อความแชทหาอีกฝ่าย และเปลี่ยนสถานะออเดอร์สักครั้ง | อีกฝ่ายได้การแจ้งเตือน (trigger `notify_*` ทำงาน) | ☐ |

ทุกข้อต้องไม่มีข้อความ `permission denied` หรือ `ไม่มีสิทธิ์: p_caller_id` ในแอป (ถ้ามี แปลว่า route ใดส่ง `p_caller_id` ไม่ตรงผู้ล็อกอิน แจ้งชื่อ route)

### ตรวจฝั่งฐานข้อมูล
```sql
-- cron ต้อง succeeded ต่อเนื่องหลัง migration
SELECT status, start_time, left(return_message, 60)
FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;

-- ฟังก์ชันที่ anon เรียกได้ ต้องเหลือเฉพาะตัวช่วย RLS 4 ตัว
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- คาดหวัง: is_admin, is_chat_participant, is_item_owner, is_order_participant

-- รายการผิดกฎใน shadow mode (ไม่ควรมีเส้นทางใหม่ที่ไม่รู้จัก)
SELECT reason, count(*) FROM public.workflow_history
WHERE reason LIKE 'SHADOW_VIOLATION%' GROUP BY 1 ORDER BY 2 DESC;
```

## D. หน้าแอดมิน workflow และ proxy (งาน R2)

- [ ] `/admin/workflow`: สลับ static → shadow → static ตรงกับ `SELECT public.workflow_mode();` (ฟังก์ชันนี้เรียกได้เฉพาะ service role แล้ว ใช้ `SELECT config_value FROM public.system_config WHERE config_key='workflow_mode';` แทนใน SQL Editor)
- [ ] แก้ `approval_timeout_hours` แล้วมี `updated_by` และ `updated_at`
- [ ] ใส่ค่าผิดชนิดแล้วถูกปฏิเสธ
- [ ] ตารางประวัติแสดงชื่อสถานะภาษาไทย (ไม่ใช่ "ไม่ระบุ")
- [ ] ยังไม่ได้ล็อกอิน เข้า `/` และ `/users` ถูกส่งไป `/login`
- [ ] ผู้ใช้ทั่วไปเข้า `/admin` ถูกส่งไป `/admin/login`
- [ ] admin ล็อกอินแล้วถูกล็อกใน `/admin/*`
- [ ] ผู้ใช้ที่ล็อกอินแล้วเข้า `/login` ถูกส่งกลับ `/`

## E. หลังผ่านทั้งหมด

1. รัน migration 30 แล้ว 31 บน production (ไฟล์ `down/` พร้อมย้อนกลับ)
2. ตรวจ cron รอบแรกหลังรันว่า `succeeded` และรัน Security Advisors ซ้ำ (ฟังก์ชันที่ `anon` เรียกได้ต้องเหลือ 4 ตัว)
3. เปิด leaked password protection ใน Dashboard ของทั้งสองโปรเจกต์ (Authentication → Password security)
