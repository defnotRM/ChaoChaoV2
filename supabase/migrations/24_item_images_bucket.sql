-- ============================================================================
-- 24: Storage bucket สำหรับรูปสินค้าที่ลงประกาศเช่า (itemimage.image_url)
-- ============================================================================
-- อัปโหลดผ่าน POST /api/products/images ด้วย service role (admin client)
-- route จะสร้าง bucket นี้ให้อัตโนมัติถ้ายังไม่มี ไฟล์นี้มีไว้ให้ project ใหม่ตรงกัน
-- จำกัด: public, ไฟล์ละไม่เกิน 5MB, เฉพาะ JPG/PNG/WEBP, สูงสุด 10 รูปต่อสินค้า (บังคับที่ API)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'item-images',
  'item-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
