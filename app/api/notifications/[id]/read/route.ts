import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
    .eq("notification_id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Error marking notification read:", error);
    return NextResponse.json({ message: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
