import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ผู้ให้เช่าปฏิเสธสลิป (เช่น ยอดไม่ตรง / ไม่พบเงินเข้า):
// payment pending -> rejected, rentalorder ยังเป็น awaiting_payment ให้ผู้เช่าอัปโหลดใหม่
// และต่อเวลาชำระเงินอีก 8 ชม. (นับจาก updated_at — ดู process_expired_orders)
export async function POST(request: Request) {
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

    const { orderId, reason } = (await request.json()) as {
      orderId?: string;
      reason?: string;
    };
    if (!orderId) {
      return NextResponse.json({ message: "ไม่พบออเดอร์" }, { status: 400 });
    }
    const trimmedReason = reason?.trim().slice(0, 300) || "";

    const admin = createAdminClient();

    const { data: order, error } = await admin
      .from("rentalorder")
      .select("order_id, user_id, status, item_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์นี้" }, { status: 404 });
    }

    // เฉพาะเจ้าของสินค้า (ผู้ให้เช่า) เท่านั้นที่ปฏิเสธสลิปได้
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
        { message: "คุณไม่มีสิทธิ์ปฏิเสธสลิปของออเดอร์นี้" },
        { status: 403 },
      );
    }

    if (order.status !== "awaiting_payment") {
      return NextResponse.json(
        { message: "ออเดอร์นี้ไม่ได้อยู่ในขั้นตอนตรวจสอบการชำระเงิน" },
        { status: 409 },
      );
    }

    const { data: rejected, error: payErr } = await admin
      .from("payment")
      .update({ status: "rejected" })
      .eq("order_id", orderId)
      .eq("status", "pending")
      .select("payment_id");

    if (payErr) {
      console.error("reject payment update error:", payErr);
      return NextResponse.json(
        { message: "ปฏิเสธสลิปไม่สำเร็จ" },
        { status: 500 },
      );
    }
    if (!rejected || rejected.length === 0) {
      return NextResponse.json(
        { message: "ไม่พบสลิปที่รอตรวจสอบ (อาจถูกตรวจไปแล้ว) กรุณารีเฟรช" },
        { status: 409 },
      );
    }

    // ต่อเวลาชำระเงินให้ผู้เช่าอีก 8 ชม.
    await admin
      .from("rentalorder")
      .update({ updated_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .eq("status", "awaiting_payment");

    await admin.from("notification").insert({
      user_id: order.user_id,
      type: "payment_rejected",
      title: "สลิปการชำระเงินถูกปฏิเสธ",
      message: trimmedReason
        ? `ผู้ให้เช่าปฏิเสธสลิป: ${trimmedReason} กรุณาอัปโหลดสลิปใหม่ภายใน 8 ชั่วโมง`
        : "ผู้ให้เช่าตรวจสอบแล้วไม่พบยอดเงินตามสลิป กรุณาอัปโหลดสลิปใหม่ภายใน 8 ชั่วโมง",
      related_order_id: orderId,
    });

    return NextResponse.json({
      ok: true,
      status: "awaiting_payment",
      message: "ปฏิเสธสลิปแล้ว ระบบแจ้งให้ผู้เช่าอัปโหลดสลิปใหม่",
    });
  } catch (error) {
    console.error("POST /api/payments/reject error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
