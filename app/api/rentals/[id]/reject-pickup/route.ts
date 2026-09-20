import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
    const reason: string = body.reason; // "changed_mind" | "not_as_advertised"
    const description: string | undefined = body.description;
    const imageUrls: string[] = Array.isArray(body.imageUrls)
      ? body.imageUrls
      : [];

    const admin = createAdminClient();

    const { data: order, error: orderError } = await admin
      .from("rentalorder")
      .select("order_id, user_id, status")
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์นี้" }, { status: 404 });
    }

    if (user.id !== order.user_id) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์ดำเนินการกับออเดอร์นี้" },
        { status: 403 },
      );
    }

    if (order.status !== "item_sent") {
      return NextResponse.json(
        { message: "ปฏิเสธได้เฉพาะตอนที่เพิ่งอัปโหลดหลักฐานรับของเท่านั้น" },
        { status: 400 },
      );
    }

    if (reason === "changed_mind") {
      // เคส J — เปลี่ยนใจเฉยๆ ตัดสินจบทันที ไม่ต้องรอแอดมิน
      const { data: outcome, error: rpcError } = await supabase.rpc(
        "settle_rental_order",
        {
          p_order_id: orderId,
          p_caller_id: user.id,
          p_outcome: "renter_rejected_meetup",
        },
      );

      if (rpcError) {
        console.error("settle_rental_order error:", rpcError);
        return NextResponse.json(
          { message: rpcError.message },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        status: outcome,
        message:
          "ปฏิเสธสินค้าเรียบร้อยแล้ว ระบบคืนเงินประกันเต็มจำนวน พร้อมค่าเช่า 20% ให้คุณ",
      });
    }

    if (reason === "not_as_advertised") {
      if (!description) {
        return NextResponse.json(
          { message: "กรุณาอธิบายว่าสินค้าไม่ตรงปกอย่างไร" },
          { status: 400 },
        );
      }

      const { data: reportType } = await admin
        .from("rentalreporttype")
        .select("report_type_id")
        .eq("type_name", "false_advertisement")
        .maybeSingle();

      if (!reportType) {
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
          report_type_id: reportType.report_type_id,
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

      await admin
        .from("rentalorder")
        .update({
          status: "disputed_at_meetup",
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", orderId);

      return NextResponse.json({
        ok: true,
        status: "disputed_at_meetup",
        message: "ส่งรายงานเรียบร้อยแล้ว รอแอดมินตรวจสอบและตัดสิน",
      });
    }

    return NextResponse.json(
      { message: "ระบุเหตุผลไม่ถูกต้อง" },
      { status: 400 },
    );
  } catch (error) {
    console.error("POST /api/rentals/[id]/reject-pickup error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
