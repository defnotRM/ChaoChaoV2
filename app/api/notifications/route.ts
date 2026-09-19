import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

  const { data: notifications, error } = await supabase
    .from("notification")
    .select(
      "notification_id, type, title, message, related_order_id, is_read, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { message: "โหลดแจ้งเตือนไม่สำเร็จ" },
      { status: 500 },
    );
  }

  const unreadCount = (notifications || []).filter((n) => !n.is_read).length;

  return NextResponse.json({ notifications: notifications || [], unreadCount });
}
