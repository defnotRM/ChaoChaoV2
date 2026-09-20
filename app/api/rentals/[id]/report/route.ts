import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const VALID_TYPES = ["damaged_item", "stolen_item"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orderId } = await params;
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

    const body = await request.json().catch(() => ({}));
    const reportType: string = body.reportType;
    const description: string | undefined = body.description;
    const imageUrls: string[] = Array.isArray(body.imageUrls)
      ? body.imageUrls
      : [];

    if (!VALID_TYPES.includes(reportType as (typeof VALID_TYPES)[number])) {
      return NextResponse.json(
        {
          message:
            "ประเภทการรายงานไม่ถูกต้อง (รองรับเฉพาะ damaged_item, stolen_item)",
        },
        { status: 400 },
      );
    }
    if (!description || !description.trim()) {
      return NextResponse.json(
        { message: "กรุณาอธิบายรายละเอียดปัญหา" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: order, error: orderError } = await admin
      .from("rentalorder")
      .select("order_id, item_id, status, end_date")
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์นี้" }, { status: 404 });
    }

    // ทั้ง 2 ประเภทนี้เป็นสิทธิ์ของ "ผู้ให้เช่า" เท่านั้น (ตาม FR-36, FR-37)
    let lenderId: string | null = null;
    if (order.item_id) {
      const { data: item } = await admin
        .from("item")
        .select("user_id")
        .eq("item_id", order.item_id)
        .maybeSingle();
      lenderId = item?.user_id ?? null;
    }

    if (user.id !== lenderId) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์รายงานปัญหานี้" },
        { status: 403 },
      );
    }

    // เช็คสถานะให้เหมาะกับประเภทการรายงาน
    if (reportType === "damaged_item") {
      const allowed = ["item_returned", "completed"];
      if (!allowed.includes(order.status)) {
        return NextResponse.json(
          { message: "รายงานความเสียหายได้เฉพาะหลังจากรับของคืนแล้วเท่านั้น" },
          { status: 400 },
        );
      }
    }

    if (reportType === "stolen_item") {
      const allowed = ["item_sent", "item_received"];
      const isOverdue =
        new Date(`${order.end_date}T00:00:00Z`).getTime() < Date.now();
      if (!allowed.includes(order.status) || !isOverdue) {
        return NextResponse.json(
          {
            message:
              "รายงานได้เฉพาะเมื่อเลยกำหนดวันคืนของแล้วและยังไม่ได้รับของคืน",
          },
          { status: 400 },
        );
      }
    }

    const { data: reportType_, error: typeError } = await admin
      .from("rentalreporttype")
      .select("report_type_id")
      .eq("type_name", reportType)
      .maybeSingle();

    if (typeError || !reportType_) {
      return NextResponse.json(
        { message: "ไม่พบประเภทการรายงานในระบบ" },
        { status: 500 },
      );
    }

    const { data: report, error: reportError } = await admin
      .from("rentalreport")
      .insert({
        order_id: orderId,
        reporter_id: user.id,
        report_type_id: reportType_.report_type_id,
        description,
        status: "pending_investigation",
      })
      .select("report_id")
      .single();

    if (reportError || !report) {
      console.error("Insert report error:", reportError);
      return NextResponse.json(
        { message: "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    if (imageUrls.length > 0) {
      await admin
        .from("rentalreportimage")
        .insert(
          imageUrls.map((url) => ({
            report_id: report.report_id,
            image_url: url,
          })),
        );
    }

    // หมายเหตุ: ไม่เปลี่ยน rentalorder.status ตรงนี้ — ปล่อยไว้ตามเดิม (item_returned/
    // completed/item_sent) รอแอดมินตรวจสอบแล้วเรียก settle_rental_order ตัดสินเอง
    // (ต่างจาก false_advertisement ที่เปลี่ยนเป็น disputed_at_meetup ทันที เพราะเกิด
    // ตอนกลาง flow ก่อน order จะปิด แต่ 2 ประเภทนี้เกิดหลัง order ปิด/ใกล้ปิดแล้ว)

    return NextResponse.json({
      ok: true,
      reportId: report.report_id,
      message: "ส่งรายงานเรียบร้อยแล้ว รอแอดมินตรวจสอบและตัดสิน",
    });
  } catch (error) {
    console.error("POST /api/rentals/[id]/report error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
