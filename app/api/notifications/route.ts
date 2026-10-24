import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { notifications: [], unreadCount: 0 },
        { status: 200 }
      );
    }

    const admin = createAdminClient();
    const { data: notifications, error } = await admin
      .from("notification")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("Notifications fetch error:", error);
      return NextResponse.json(
        { notifications: [], unreadCount: 0 },
        { status: 200 }
      );
    }

    const unreadCount = (notifications || []).filter((n) => !n.is_read).length;

    return NextResponse.json({
      notifications: notifications || [],
      unreadCount,
    });
  } catch (err: any) {
    console.error("Notifications GET error:", err);
    return NextResponse.json(
      { notifications: [], unreadCount: 0 },
      { status: 200 }
    );
  }
}
