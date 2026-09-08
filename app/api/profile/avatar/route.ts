import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
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
    const file = formData.get("avatar") as File | null;

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
    const mimeType = file.type || "image/png";

    // Try uploading to Supabase Storage (bucket: avatars)
    let savedAvatarUrl: string;
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
    const filePath = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (!uploadError) {
      const {
        data: { publicUrl },
      } = admin.storage.from("avatars").getPublicUrl(filePath);
      savedAvatarUrl = `${publicUrl}?t=${Date.now()}`;
    } else {
      // Fallback to base64 if bucket is not created yet
      console.warn("Storage upload failed, fallback to base64:", uploadError.message);
      savedAvatarUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
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
          avatar_url: savedAvatarUrl,
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
          avatar_url: savedAvatarUrl,
          status: "Active",
          updated_at: new Date().toISOString(),
        });
      dbError = error;
    }

    if (dbError) {
      console.error("useraccount avatar save error:", dbError);
      return NextResponse.json(
        { message: "ไม่สามารถบันทึกข้อมูลรูปโปรไฟล์ลงในฐานข้อมูลได้" },
        { status: 500 }
      );
    }

    // 2. In auth.users metadata, store the URL
    const userMetadata = {
      ...(user.user_metadata || {}),
      avatar_url: savedAvatarUrl.startsWith("data:") ? `/api/avatar?id=${user.id}` : savedAvatarUrl,
    };

    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: userMetadata,
    });

    return NextResponse.json({
      message: "อัปโหลดรูปโปรไฟล์สำเร็จ",
      avatarUrl: savedAvatarUrl,
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ" },
      { status: 500 }
    );
  }
}
