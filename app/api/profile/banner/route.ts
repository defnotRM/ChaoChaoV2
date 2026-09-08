import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("banner") as File | null;

    if (!file) {
      return NextResponse.json(
        { message: "ไม่พบไฟล์รูปภาพที่ต้องการอัปโหลด" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { message: "ประเภทไฟล์ไม่ถูกต้อง รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, GIF)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: "ขนาดไฟล์ต้องไม่เกิน 5 MB" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || "image/jpeg";

    // Try uploading to Supabase Storage (bucket: banners)
    let savedBannerUrl: string;
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${user.id}/banner.${fileExt}`;

    const { error: uploadError } = await admin.storage
      .from("banners")
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (!uploadError) {
      const {
        data: { publicUrl },
      } = admin.storage.from("banners").getPublicUrl(filePath);
      savedBannerUrl = `${publicUrl}?t=${Date.now()}`;
    } else {
      // Fallback to base64 if bucket is not created yet
      console.warn("Storage upload failed, fallback to base64:", uploadError.message);
      savedBannerUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    }

    // 1. Check if useraccount already exists for this user
    const { data: existingUser } = await admin
      .from("useraccount")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let dbError = null;
    if (existingUser) {
      const { error } = await admin
        .from("useraccount")
        .update({
          banner_url: savedBannerUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      dbError = error;
    } else {
      const uName = user.user_metadata?.username || user.email?.split("@")[0] || `user_${user.id.slice(0, 6)}`;
      const uEmail = user.email || `${uName.toLowerCase()}@chaochao.local`;
      const uNatId = user.user_metadata?.national_id || null;

      const { error } = await admin
        .from("useraccount")
        .insert({
          user_id: user.id,
          username: uName,
          email: uEmail,
          national_id: uNatId,
          banner_url: savedBannerUrl,
          status: "Active",
          updated_at: new Date().toISOString(),
        });
      dbError = error;
    }

    if (dbError) {
      console.error("useraccount banner save error:", dbError);
      return NextResponse.json(
        { message: "ไม่สามารถบันทึกรูปภาพแบนเนอร์ลงในฐานข้อมูลได้" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "อัปโหลดภาพแบนเนอร์สำเร็จ",
      bannerUrl: savedBannerUrl,
    });
  } catch (error) {
    console.error("Banner upload error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการอัปโหลดภาพแบนเนอร์" },
      { status: 500 }
    );
  }
}
