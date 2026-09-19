import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: targetUserId } = await params;

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

    if (user.id === targetUserId) {
      return NextResponse.json(
        { message: "ไม่สามารถรายงานบัญชีตัวเองได้" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const description: string = (body.description || "").trim();

    if (!description) {
      return NextResponse.json(
        { message: "กรุณาอธิบายเหตุผลที่รายงาน" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: targetUser } = await admin
      .from("useraccount")
      .select("user_id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!targetUser) {
      return NextResponse.json({ message: "ไม่พบบัญชีนี้" }, { status: 404 });
    }

    const { data: reportType } = await admin
      .from("rentalreporttype")
      .select("report_type_id")
      .eq("type_name", "account_report")
      .maybeSingle();

    if (!reportType) {
      return NextResponse.json(
        { message: "ไม่พบประเภทการรายงานในระบบ" },
        { status: 500 },
      );
    }

    const { error: insertError } = await admin.from("rentalreport").insert({
      order_id: null,
      reported_user_id: targetUserId,
      reporter_id: user.id,
      report_type_id: reportType.report_type_id,
      description,
      status: "pending_investigation",
    });

    if (insertError) {
      console.error("Insert account report error:", insertError);
      return NextResponse.json(
        { message: "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "ส่งรายงานเรียบร้อยแล้ว แอดมินจะตรวจสอบบัญชีนี้",
    });
  } catch (error) {
    console.error("POST /api/users/[id]/report error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
