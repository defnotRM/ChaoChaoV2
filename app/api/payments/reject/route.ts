import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  expireOverdueOrders,
  getOrderTimeouts,
  isPastDeadline,
  MAX_SLIP_REJECTIONS,
} from "@/lib/system-config";

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

    // ตรวจสลิปได้ภายในเวลาที่แอดมินตั้ง (slip_review_timeout_hours) เลยแล้วระบบปฏิเสธสลิปอัตโนมัติ (ผู้เช่าต้องอัปโหลดใหม่)
    const { data: pendingSlip } = await admin
      .from("payment")
      .select("created_at")
      .eq("order_id", orderId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pendingSlip) {
      const timeouts = await getOrderTimeouts();
      if (isPastDeadline(pendingSlip.created_at, timeouts.slipReviewHours)) {
        await expireOverdueOrders();
        return NextResponse.json(
          {
            message: `เกินเวลาตรวจสอบสลิป (${timeouts.slipReviewHours} ชั่วโมง) แล้ว ระบบได้ปฏิเสธสลิปอัตโนมัติ ผู้เช่าจะต้องอัปโหลดสลิปใหม่ กรุณารีเฟรชหน้า`,
          },
          { status: 409 },
        );
      }
    }

    // ปฏิเสธสลิปของออเดอร์เดียวกันได้ไม่เกิน MAX_SLIP_REJECTIONS ครั้ง
    // ครบแล้วทำได้แค่อนุมัติสลิป หรือยกเลิกรายการเช่า (ผู้ให้เช่ายกเลิกก่อนรับเงินได้โดยไม่มีเงื่อนไข)
    const { count: rejectedCount } = await admin
      .from("payment")
      .select("payment_id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("status", "rejected");
    if ((rejectedCount ?? 0) >= MAX_SLIP_REJECTIONS) {
      return NextResponse.json(
        {
          message: `ปฏิเสธสลิปของออเดอร์นี้ครบ ${MAX_SLIP_REJECTIONS} ครั้งแล้ว กรุณาอนุมัติสลิป หรือยกเลิกรายการเช่าแทน`,
        },
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

    const { paymentHours } = await getOrderTimeouts();
    await admin.from("notification").insert({
      user_id: order.user_id,
      type: "payment_rejected",
      title: "สลิปการชำระเงินถูกปฏิเสธ",
      message: trimmedReason
        ? `ผู้ให้เช่าปฏิเสธสลิป: ${trimmedReason} กรุณาอัปโหลดสลิปใหม่ภายใน ${paymentHours} ชั่วโมง`
        : `ผู้ให้เช่าตรวจสอบแล้วไม่พบยอดเงินตามสลิป กรุณาอัปโหลดสลิปใหม่ภายใน ${paymentHours} ชั่วโมง`,
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
