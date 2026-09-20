import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { message: "กรุณาเข้าสู่ระบบก่อน" },
      { status: 401 },
    );
  }

  const { error } = await supabase
    .from("notification")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    console.error("Error marking all notifications read:", error);
    return NextResponse.json({ message: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
