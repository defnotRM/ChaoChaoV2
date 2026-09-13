# ChaoChao (ชาวเช่า) - Peer-to-Peer Rental Platform

แพลตฟอร์มบริการเช่า-ให้เช่าสินค้าแบบ Peer-to-Peer พัฒนาด้วย **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS** และเชื่อมต่อระบบหลังบ้านด้วย **Supabase Cloud** (Database, Auth & Storage)

---

## ข้อกำหนดเบื้องต้น (Prerequisites)

ก่อนเริ่มใช้งาน กรุณาตรวจสอบว่าเครื่องของคุณได้ติดตั้งโปรแกรมเหล่านี้แล้ว:
- **Node.js**: เวอร์ชัน `20.x` หรือใหม่กว่า (แนะนำ Node.js LTS)
- **npm**: เวอร์ชัน `10.x` หรือใหม่กว่า
- **Git**

---

## ขั้นตอนการเริ่มต้นใช้งาน (Getting Started)

### 1. Clone โปรเจกต์ลงเครื่อง

```bash
git clone <URL_REPOSITORY_ของโปรเจกต์>
cd ChaoChaoV2
```

### 2. สลับไปยัง Branch ของตัวเองที่ถูกสร้างไว้ให้

หัวหน้าโปรเจกต์จะสร้าง Branch ประจำตัวหรือฟีเจอร์ไว้ให้บน Remote Repository เรียบร้อยแล้ว ให้ดึงข้อมูลล่าสุดและสลับไปยัง Branch ของตัวเอง:

```bash
# 1. ดึงข้อมูล branch และ commit ล่าสุดจาก remote ทุกครั้ง
git fetch origin

# 2. ตรวจสอบรายชื่อ branch ทั้งหมดบน remote
git branch -r

# 3. สลับไปยัง branch ของตัวเอง (Git จะสร้าง local branch และ track ให้อัตโนมัติ)
git switch <your-branch>

# (เฉพาะกรณีที่ Git ไม่ดึง branch อัตโนมัติ ให้ใช้คำสั่งนี้)
git switch --track origin/<your-branch>
```

### 3. ติดตั้ง Dependencies

```bash
npm install
```

### 4. ตั้งค่า Environment Variables (.env.local)

สร้างไฟล์ `.env.local` ขึ้นมาที่โฟลเดอร์ root ของโปรเจกต์ โดยคัดลอกจาก `.env.example`:

```bash
# บน Windows PowerShell
copy .env.example .env.local

# บน macOS / Linux
cp .env.example .env.local
```

จากนั้นเปิดไฟล์ `.env.local` แล้วใส่ค่า Key ของ Supabase Cloud ของโปรเจกต์:

```env
# URL ของ Supabase Cloud Project
NEXT_PUBLIC_SUPABASE_URL=https://awnwvckyjkkuhufmdgas.supabase.co

# Anon (Publishable) Key สำหรับ Client-side
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...

# Service Role Key สำหรับ Server-side/Admin API (ห้ามเปิดเผยสู่สาธารณะ)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```
*(ขอค่า Key แบบเต็มได้จากผู้ดูแลระบบหรือเพื่อนในทีม)*

> **ข้อควรระวัง:** ไฟล์ `.env.local` ถูกเพิ่มใน `.gitignore` เรียบร้อยแล้ว **ห้ามนำ Key ไปฮาร์ดโค้ดลงในไฟล์โค้ดเด็ดขาด**

### 5. เริ่มรันเซิร์ฟเวอร์สำหรับพัฒนา (Development Server)

```bash
npm run dev
```

เปิดเว็บเบราว์เซอร์แล้วไปที่:
**http://localhost:3000**

---

## บัญชีทดสอบในระบบ (Test Accounts)

ระบบมีบัญชีผู้ใช้และข้อมูลตัวอย่างสำหรับทดสอบฟังก์ชันต่างๆ ไว้ให้แล้ว:

| Username | Password | สิทธิ์การใช้งาน (Role) | การใช้งานที่แนะนำ |
| :--- | :--- | :--- | :--- |
| **`yoklnw67`** | `Password67` | **Lender** (ผู้ให้เช่า) | ทดสอบการลงประกาศสินค้า, จัดการออเดอร์ให้เช่า, ตรวจสอบสลิป |
| **`romanlnw68`** | `Password68` | **Renter** (ผู้เช่า) | ทดสอบการเช่าสินค้า, นัดรับของ, อัปโหลดสลิปชำระเงิน, รีวิว |
| **`fantalnw66`** | `Password66` | **Lender & Renter** | ทดสอบสลับบทบาทการใช้งานได้ทั้งสองฝั่ง |

---

## โครงสร้างโฟลเดอร์ของโปรเจกต์ (Project Structure)

```text
ChaoChaoV2/
├── app/                        # Next.js App Router
│   ├── api/                    # Backend API Route Handlers
│   │   ├── auth/               # ข้อมูล Session ผู้ใช้ (/api/auth/me)
│   │   ├── login/              # เข้าสู่ระบบ (/api/login)
│   │   ├── register/           # สมัครสมาชิก (/api/register)
│   │   ├── profile/            # จัดการโปรไฟล์, อัปโหลด avatar, banner
│   │   ├── products/           # จัดการสินค้า (CRUD, ค้นหา)
│   │   ├── rentals/            # ดำเนินการเช่า, นัดรับ, คืนของ, จัดการข้อพิพาท
│   │   ├── payments/           # ชำระเงิน, อัปโหลดและตรวจสอบสลิป
│   │   └── chat/               # ระบบส่งข้อความและห้องแชท
│   ├── dashboard/              # หน้าแดชบอร์ดหลัก
│   ├── lender/                 # หน้าจอการทำงานสำหรับฝั่งผู้ให้เช่า
│   ├── renter/                 # หน้าจอการทำงานสำหรับฝั่งผู้เช่า
│   ├── chat/                   # หน้าจอแชทสนทนาระหว่างผู้เช่าและผู้ให้เช่า
│   ├── login/                  # หน้าเข้าสู่ระบบ
│   └── register/               # หน้าลงทะเบียน
├── components/                 # คอมโพเนนต์ UI ที่นำมาใช้ซ้ำ (Navbar, Footer, Modals ฯลฯ)
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Supabase Browser Client (สำหรับ Client Components)
│   │   ├── server.ts           # Supabase Server Client (สำหรับ Server Components/Actions)
│   │   └── admin.ts            # Supabase Admin Client (Service Role Key สำหรับ Backend)
│   └── validations/            # Zod Validation Schemas (ตรวจสอบความถูกต้องของข้อมูล)
├── supabase/
│   └── migrations/             # ไฟล์ SQL Schema, Constraints, RLS, และฟังก์ชันต่างๆ
└── public/                     # ไฟล์ Static (ไอคอน, รูปภาพประกอบ)
```

---

## การจัดการฐานข้อมูลและรูปภาพ (Database & Storage)

1. **ฐานข้อมูล (PostgreSQL)**: โฮสต์อยู่บน **Supabase Cloud**
   - มี Schema และฟังก์ชันตรวจสอบความถูกต้อง เช่น การป้องกันจองวันซ้ำ (`EXCLUDE`), คำนวณค่าธรรมเนียม, ระบบ RLS คุ้มครองข้อมูล
2. **ระบบจัดเก็บรูปภาพ (Supabase Storage)**:
   - `avatars` : จัดเก็บรูปโปรไฟล์ผู้ใช้
   - `banners` : จัดเก็บรูปแบนเนอร์ร้านค้า/โปรไฟล์
   - `slips`   : จัดเก็บสลิปหลักฐานการโอนเงิน
   - *หมายเหตุ: ในฐานข้อมูลจะเก็บเป็น **Public URL** ชี้ไปยัง Storage ไม่มีการเก็บรูปเป็น Base64 ลงในตารางอีกต่อไป*

---

## ข้อตกลงการพัฒนาและ Git Workflow (Team Conventions)

เพื่อให้การทำงานในทีมเป็นระเบียบและลดปัญหา Code Conflict:

1. **ทำงานบน Branch ของตัวเองเท่านั้น**:
   - ทุกคนจะมี Branch ประจำตัวที่ถูกสร้างไว้ให้แล้ว ห้ามแก้ไขโค้ดหรือ Commit/Push ลง Branch `main` โดยตรงเด็ดขาด
2. **ก่อนเริ่มงานทุกครั้ง หรือเมื่อมีโค้ดอัปเดต ต้องทำ `git fetch` ทุกครั้ง**:
   - เพื่อให้เครื่องของเรารับรู้ Commit และ Branch ล่าสุดทั้งหมดที่เพื่อนหรือทีมอัปเดตขึ้น GitHub เสมอ
   - จากนั้น pull โค้ดล่าสุดจาก `main` เข้ามายัง branch ของตัวเอง:

   ```bash
   # 1. ดึงข้อมูลอัปเดตล่าสุดจาก GitHub ทุกครั้งที่มีโค้ดใหม่
   git fetch origin

   # 2. สลับไปยัง branch ของตัวเอง (หากยังไม่ได้อยู่บน branch ตัวเอง)
   git switch <your-branch>

   # 3. ดึงโค้ดล่าสุดจาก main มาอัปเดตใส่ branch ของตัวเอง
   git pull origin main
   ```

   **คำอธิบายคำสั่ง:**
   - `git fetch origin`: ดึงรายการ branch และ commit อัปเดตล่าสุดจาก GitHub ลงมาที่ cache ในเครื่อง โดยยังไม่แก้ไขหรือเขียนทับไฟล์ในโค้ดทำงาน
   - `git switch <your-branch>`: สลับมายัง branch ที่คุณกำลังทำงาน
   - `git pull origin main`: ดึงโค้ดที่อัปเดตแล้วจาก branch `main` บน GitHub มา merge เข้ากับ branch ที่คุณกำลังทำอยู่ ทำให้โค้ดของเราทันสมัยล่าสุดเสมอ
3. **เมื่อพัฒนาหรือแก้ไขงานเสร็จสิ้น**:
   ```bash
   git add .
   git commit -m "feat: อธิบายสิ่งที่คุณเพิ่มหรือแก้ไข"
   git push origin <your-branch>
   ```
4. **เปิด Pull Request (PR) เข้า Branch `main`**:
   - เข้า GitHub ไปที่หน้า Repository ของโปรเจกต์
   - เปิด **Pull Request** โดยเลือก base: `main` <- compare: `<your-branch>`
   - ให้เพื่อนในทีมหรือเจ้าของโปรเจกต์ Review ก่อนกด Merge เข้า `main`
5. **ทดสอบ Build ก่อนส่ง PR เสมอ**:
   ```bash
   npm run build
   ```
   *(ต้องได้ผลลัพธ์ผ่านโดยไม่มีข้อผิดพลาดของ TypeScript หรือ Lint)*

---

## คำสั่งที่ใช้บ่อย (Useful Scripts)

| คำสั่ง | คำอธิบาย |
| :--- | :--- |
| `npm run dev` | รันเซิร์ฟเวอร์สำหรับทดสอบในเครื่อง (Hot Reload) |
| `npm run build` | คอมไพล์โปรเจกต์เป็น Production Build และตรวจทาน Type/Syntax ทั้งหมด |
| `npm run start` | รัน Production Server หลังการ build |
| `npm run lint` | ตรวจสอบมาตรฐานของโค้ดด้วย ESLint |
