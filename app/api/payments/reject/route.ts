import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ผู้ให้เช่ากดปฏิเสธสลิป:
// ปรับ payment ที่ pending → rejected และคงสถานะ rentalorder เป็น awaiting_payment
// เพื่อให้ผู้เช่าสามารถอัปโหลดสลิปที่ถูกต้องใหม่ได้ (TC06)
export async function POST(request: Request) {
  try {
    const { orderId, reason } = (await request.json()) as {
      orderId?: string;
      reason?: string;
    };
    if (!orderId) {
      return NextResponse.json({ message: "ไม่พบออเดอร์" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: order, error } = await admin
      .from("rentalorder")
      .select("order_id, user_id, status, item(user_id, item_name)")
      .eq("order_id", orderId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์นี้" }, { status: 404 });
    }

    // อัปเดต payment จาก pending เป็น rejected
    await admin
      .from("payment")
      .update({ status: "rejected" })
      .eq("order_id", orderId)
      .eq("status", "pending");

    // อัปเดต updated_at ของ rentalorder เพื่อให้ระบบรับรู้เวลาใหม่
    const { error: orderErr } = await admin
      .from("rentalorder")
      .update({
        status: "awaiting_payment",
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);

    if (orderErr) {
      console.error("reject order update error:", orderErr);
      return NextResponse.json(
        { message: "อัปเดตสถานะไม่สำเร็จ" },
        { status: 500 }
      );
    }

    // ส่ง Notification แจ้งเตือนผู้เช่า
    if (order.user_id) {
      const itemName = (order.item as any)?.item_name || "อุปกรณ์";
      try {
        await admin.from("notification").insert({
          user_id: order.user_id,
          type: "payment_rejected",
          title: "สลิปการโอนเงินไม่ผ่านการตรวจสอบ ⚠️",
          message: reason
            ? `สลิปสำหรับ "${itemName}" ถูกปฏิเสธ: ${reason} กรุณาตรวจสอบยอดเงินและอัปโหลดสลิปใหม่`
            : `ผู้ให้เช่าได้ปฏิเสธสลิปการโอนเงินสำหรับ "${itemName}" กรุณาตรวจสอบยอดเงินและแนบสลิปที่ถูกต้องใหม่อีกครั้ง`,
          related_order_id: orderId,
          is_read: false,
        });
      } catch (notifErr) {
        console.warn("Notification error:", notifErr);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        status: "awaiting_payment",
        message: "ปฏิเสธสลิปเรียบร้อยแล้ว แจ้งเตือนให้ผู้เช่าอัปโหลดใหม่แล้ว",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/payments/reject error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
