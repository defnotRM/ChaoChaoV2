import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MIN_REASON = 10;
const MAX_REASON = 1000;

// รายงานบัญชีผู้ใช้ (report_type = account_report) ส่งให้แอดมินพิจารณา
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: reportedUserId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนรายงานบัญชีผู้ใช้" },
        { status: 401 },
      );
    }

    if (user.id === reportedUserId) {
      return NextResponse.json(
        { message: "ไม่สามารถรายงานบัญชีของตนเองได้" },
        { status: 400 },
      );
    }

    // แอดมินไม่ใช่ผู้เช่า/ผู้ให้เช่า จึงไม่ต้องรายงานผ่านช่องทางนี้
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (isAdmin) {
      return NextResponse.json(
        { message: "บัญชีผู้ดูแลระบบไม่สามารถรายงานบัญชีผู้ใช้ได้" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason: string =
      typeof body.reason === "string" ? body.reason.trim() : "";

    if (reason.length < MIN_REASON) {
      return NextResponse.json(
        { message: `กรุณาระบุเหตุผลอย่างน้อย ${MIN_REASON} ตัวอักษร` },
        { status: 400 },
      );
    }
    if (reason.length > MAX_REASON) {
      return NextResponse.json(
        { message: `เหตุผลต้องไม่เกิน ${MAX_REASON} ตัวอักษร` },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // บัญชีที่ถูกรายงานต้องมีอยู่จริง
    const { data: target } = await admin
      .from("useraccount")
      .select("user_id")
      .eq("user_id", reportedUserId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json(
        { message: "ไม่พบบัญชีผู้ใช้ที่ต้องการรายงาน" },
        { status: 404 },
      );
    }

    const { data: reportType } = await admin
      .from("rentalreporttype")
      .select("report_type_id")
      .eq("type_name", "account_report")
      .maybeSingle();

    if (!reportType) {
      console.error("rentalreporttype 'account_report' not found");
      return NextResponse.json(
        { message: "ระบบยังไม่รองรับการรายงานบัญชีผู้ใช้" },
        { status: 500 },
      );
    }

    // กันส่งรายงานซ้ำ: ผู้ใช้คนเดิมรายงานบัญชีเดิมที่ยังรอตัดสินอยู่
    const { data: existing } = await admin
      .from("rentalreport")
      .select("report_id")
      .eq("reporter_id", user.id)
      .eq("reported_user_id", reportedUserId)
      .eq("report_type_id", reportType.report_type_id)
      .eq("status", "pending_investigation")
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          message:
            "คุณได้รายงานบัญชีนี้ไปแล้ว และกำลังรอแอดมินตรวจสอบ",
        },
        { status: 409 },
      );
    }

    const { error: insertError } = await admin.from("rentalreport").insert({
      order_id: null,
      reporter_id: user.id,
      reported_user_id: reportedUserId,
      report_type_id: reportType.report_type_id,
      description: reason,
      status: "pending_investigation",
    });

    if (insertError) {
      console.error("Error inserting account report:", insertError);
      return NextResponse.json(
        { message: "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: true, message: "ส่งรายงานให้แอดมินเรียบร้อยแล้ว" },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/users/[id]/report error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
