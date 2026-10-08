import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceTransition } from "@/lib/workflow";

export const dynamic = "force-dynamic";

// ผู้ให้เช่า/แอดมินอนุมัติสลิป:
// ปรับ payment ที่ pending → paid และ rentalorder → paid เพื่อให้เข้าสู่ขั้นตอนรับของ
export async function POST(request: Request) {
  try {
    // ต้องล็อกอินก่อนเสมอ — เดิมไม่มีการเช็คเลย ใครก็อนุมัติสลิปของ order คนอื่นได้
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

    const { orderId } = (await request.json()) as { orderId?: string };
    if (!orderId) {
      return NextResponse.json({ message: "ไม่พบออเดอร์" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: order, error } = await admin
      .from("rentalorder")
      .select("order_id, user_id, status, item_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์นี้" }, { status: 404 });
    }

    // เฉพาะเจ้าของสินค้า (ผู้ให้เช่า) เท่านั้นที่อนุมัติสลิปได้
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
        { message: "คุณไม่มีสิทธิ์อนุมัติการชำระเงินสำหรับออเดอร์นี้" },
        { status: 403 },
      );
    }

    // อนุมัติสลิปได้เฉพาะออเดอร์ที่รอชำระเงิน (กฎในโค้ด หรือจากฐานข้อมูลตามโหมด workflow)
    const gate = await enforceTransition({
      workflow: "RENTAL_ORDER",
      from: order.status,
      to: "paid",
      actors: ["lender"],
      codeAllowedFrom: ["awaiting_payment"],
      label: "payments/approve",
    });
    if (!gate.allowed) {
      return NextResponse.json(
        { message: "ออเดอร์นี้ไม่ได้อยู่ในขั้นตอนตรวจสอบการชำระเงิน" },
        { status: 409 },
      );
    }

    // อัปเดต payment เป็น paid (ต้องมีสลิปที่รอตรวจจริง)
    const { data: approvedSlips, error: slipErr } = await admin
      .from("payment")
      .update({ status: "paid" })
      .eq("order_id", orderId)
      .eq("status", "pending")
      .select("payment_id");
    if (slipErr) {
      console.error("approve payment update error:", slipErr);
      return NextResponse.json(
        { message: "อนุมัติสลิปไม่สำเร็จ" },
        { status: 500 },
      );
    }
    if (!approvedSlips || approvedSlips.length === 0) {
      return NextResponse.json(
        { message: "ไม่พบสลิปที่รอตรวจสอบ (อาจถูกตรวจไปแล้ว) กรุณารีเฟรช" },
        { status: 409 },
      );
    }

    // อัปเดต rentalorder เป็น paid
    const { error: orderErr } = await admin
      .from("rentalorder")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("order_id", orderId);

    if (orderErr) {
      console.error("approve order update error:", orderErr);
      return NextResponse.json(
        { message: "อัปเดตสถานะไม่สำเร็จ" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: true, status: "paid", message: "ตรวจสอบการชำระเงินเรียบร้อยแล้ว" },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/payments/approve error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
