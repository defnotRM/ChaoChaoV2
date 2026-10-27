import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadToStorage, StorageCategory } from "@/lib/storage";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES: StorageCategory[] = [
  "avatars",
  "banners",
  "items",
  "slips",
  "evidence/handover",
  "evidence/return",
  "kyc",
  "disputes",
  "chat",
];

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
];

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const formData = await request.formData();
    const categoryParam = (formData.get("category") as string)?.trim() as StorageCategory;
    const category: StorageCategory = VALID_CATEGORIES.includes(categoryParam)
      ? categoryParam
      : "items";

    const customFolderId = (formData.get("folderId") as string)?.trim();
    const folderId = customFolderId || user?.id || "common";

    // Handle single 'file' or multiple 'files'
    const files = formData
      .getAll("files")
      .concat(formData.getAll("file"))
      .filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) {
      return NextResponse.json(
        { message: "ไม่พบไฟล์ที่ต้องการอัปโหลด" },
        { status: 400 }
      );
    }

    const uploadResults: string[] = [];

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { message: `ประเภทไฟล์ ${file.name} ไม่ถูกต้อง รองรับเฉพาะ JPG, PNG, WebP, GIF หรือ PDF` },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { message: `ขนาดไฟล์ ${file.name} ต้องไม่เกิน 15 MB` },
          { status: 400 }
        );
      }

      const res = await uploadToStorage(category, folderId, file, {
        fileName: file.name,
        contentType: file.type,
      });

      uploadResults.push(res.publicUrl);
    }

    return NextResponse.json({
      success: true,
      url: uploadResults[0],
      urls: uploadResults,
      category,
      folderId,
    });
  } catch (error: any) {
    console.error("Upload route error:", error);
    return NextResponse.json(
      { message: error?.message || "เกิดข้อผิดพลาดในการอัปโหลดไฟล์" },
      { status: 500 }
    );
  }
}
