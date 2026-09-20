import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
        { status: 401 },
      );
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("useraccount")
      .update({ status: "Deactivated" })
      .eq("user_id", user.id);

    if (error) {
      console.error("Deactivate error:", error);
      return NextResponse.json(
        { message: "ปิดบัญชีไม่สำเร็จ" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "ปิดการใช้งานบัญชีเรียบร้อยแล้ว",
    });
  } catch (error) {
    console.error("POST /api/profile/deactivate error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
