import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiSuccess } from "@/lib/api-response";
import { uploadMultipleImagesToStorage } from "@/lib/supabase/storage";
import { MAX_PRODUCT_IMAGES } from "@/lib/validations/product";

export const dynamic = "force-dynamic";

const BUCKET = "item-images";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// สร้าง bucket ให้อัตโนมัติถ้ายังไม่มี (เหมือนกรณี bucket อื่นที่ถูกสร้างมือผ่าน Studio)
async function ensureBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: ALLOWED_TYPES,
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Cannot create bucket ${BUCKET}: ${error.message}`);
  }
}

// POST /api/products/images — อัปโหลดรูปสินค้า (multipart, field: "images")
// คืนค่า { urls: string[] } เพื่อนำไปส่งต่อใน POST/PATCH /api/products
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("กรุณาเข้าสู่ระบบก่อนอัปโหลดรูปภาพ", 401);
    }

    const formData = await request.formData();
    const files = formData
      .getAll("images")
      .filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) {
      return apiError("ไม่พบไฟล์รูปภาพที่ต้องการอัปโหลด", 400);
    }
    if (files.length > MAX_PRODUCT_IMAGES) {
      return apiError(
        `อัปโหลดรูปภาพได้ไม่เกิน ${MAX_PRODUCT_IMAGES} รูป`,
        400,
      );
    }

    for (const f of files) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        return apiError("รองรับเฉพาะไฟล์รูป PNG, JPG หรือ WEBP", 400);
      }
      if (f.size > MAX_FILE_SIZE) {
        return apiError(`ไฟล์ "${f.name}" มีขนาดเกิน 5MB`, 400);
      }
    }

    await ensureBucket();

    const urls = await uploadMultipleImagesToStorage(files, {
      bucket: BUCKET,
      folder: user.id,
      filenamePrefix: "item",
    });

    return apiSuccess({ urls }, 201);
  } catch (error) {
    console.error("Error in POST /api/products/images:", error);
    return apiError("อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 500);
  }
}
