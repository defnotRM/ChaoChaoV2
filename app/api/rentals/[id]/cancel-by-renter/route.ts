import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSimulatedTimeInfo, parseBangkokWindow } from "@/lib/simulated-time";

export const dynamic = "force-dynamic";

/**
 * POST /api/rentals/[id]/cancel-by-renter
 *
 * FR-34: ผู้เช่ายกเลิกรายการเช่าที่ชำระเงินแล้ว ก่อนถึงวันนัดรับสินค้า
 * - กรณีที่ 1 "ยกเลิกล่วงหน้า" (> 2 วันก่อนวันนัดรับ):
 *     คืนเงินประกันและค่าเช่าเต็มจำนวน 100% ให้แก่ผู้เช่า
 * - กรณีที่ 2 "ยกเลิกกะทันหัน" (<= 2 วันก่อนวันนัดรับ):
 *     คืนเงินประกันทั้งหมด 100% ให้แก่ผู้เช่า
 *     โอนเงินค่าเช่าหลังหักค่าธรรมเนียม 10% ให้แก่ผู้ให้เช่าเป็นค่าเสียโอกาส
 */
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

    const admin = createAdminClient();

    // 1. ดึงข้อมูลคำสั่งเช่า
    const { data: order, error: orderError } = await admin
      .from("rentalorder")
      .select(
        "order_id, user_id, item_id, start_date, meetup_time, rental_fee, deposit, total_paid, status",
      )
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ message: "ไม่พบคำสั่งเช่านี้" }, { status: 404 });
    }

    // ต้องเป็นผู้เช่าของออเดอร์นี้เท่านั้น
    if (order.user_id !== user.id) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์ยกเลิกคำสั่งเช่านี้" },
        { status: 403 },
      );
    }

    // ต้องอยู่ในสถานะ paid เท่านั้น
    if (order.status !== "paid") {
      return NextResponse.json(
        { message: `ไม่สามารถยกเลิกได้เนื่องจากสถานะปัจจุบันคือ "${order.status}"` },
        { status: 400 },
      );
    }

    // 2. ตรวจสอบเวลาปัจจุบันเทียบกับเวลานัดรับสินค้า
    const timeInfo = await getSimulatedTimeInfo(admin);
    const pickupWin = parseBangkokWindow(order.start_date, order.meetup_time);

    // ต้องยกเลิกก่อนถึงเวลานัดรับสินค้า
    if (timeInfo.nowMs >= pickupWin.startMs) {
      return NextResponse.json(
        {
          message:
            "ถึงหรือเลยเวลานัดรับสินค้าแล้ว ไม่สามารถยกเลิกผ่านช่องทางนี้ได้ (กรุณาใช้ฟังก์ชันปฏิเสธรับสินค้าหน้างาน)",
        },
        { status: 400 },
      );
    }

    // 3. อ่านค่า cancel_threshold_days จาก system_config (ค่าเริ่มต้น 2 วัน)
    let cancelThresholdDays = 2;
    let platformFeePercent = 10;

    const { data: configRows } = await admin
      .from("system_config")
      .select("config_key, config_value")
      .in("config_key", ["cancel_threshold_days", "platform_fee_percent"]);

    if (configRows) {
      for (const row of configRows) {
        const val = Number(row.config_value);
        if (row.config_key === "cancel_threshold_days" && Number.isFinite(val) && val > 0) {
          cancelThresholdDays = val;
        } else if (row.config_key === "platform_fee_percent" && Number.isFinite(val) && val >= 0) {
          platformFeePercent = val;
        }
      }
    }

    const diffMs = pickupWin.startMs - timeInfo.nowMs;
    const diffDays = diffMs / (86_400 * 1000);

    const rentalFee = Number(order.rental_fee) || 0;
    const deposit = Number(order.deposit) || 0;
    const totalPaid = Number(order.total_paid) || rentalFee + deposit;

    const isAdvance = diffDays > cancelThresholdDays;

    let renterRefundAmount = 0;
    let fee = 0;
    let netIncome = 0;
    let outcomeMessage = "";

    if (isAdvance) {
      // กรณีที่ 1: "ยกเลิกล่วงหน้า" (> 2 วันก่อนวันนัดรับ)
      // คืนเงินประกันและค่าเช่าเต็มจำนวน 100% ให้แก่ผู้เช่า
      renterRefundAmount = totalPaid;
      fee = 0;
      netIncome = 0;
      outcomeMessage =
        "ยกเลิกล่วงหน้าสำเร็จ ระบบได้คืนเงินค่าเช่าและเงินประกันเต็มจำนวน 100% ให้แก่คุณ";
    } else {
      // กรณีที่ 2: "ยกเลิกกะทันหัน" (<= 2 วันก่อนวันนัดรับ)
      // คืนเงินประกัน 100% ให้แก่ผู้เช่า
      // ค่าเช่าหลังหักค่าธรรมเนียม 10% โอนให้ผู้ให้เช่าเป็นค่าเสียโอกาส
      renterRefundAmount = deposit;
      fee = Math.round(rentalFee * (platformFeePercent / 100) * 100) / 100;
      netIncome = Math.round((rentalFee - fee) * 100) / 100;
      outcomeMessage = `ยกเลิกกะทันหันสำเร็จ ระบบได้คืนเงินประกัน 100% (${deposit.toLocaleString()} บาท) ให้แก่คุณ และโอนค่าเช่าหลังหักค่าธรรมเนียม (${netIncome.toLocaleString()} บาท) ให้แก่ผู้ให้เช่าเป็นค่าเสียโอกาส`;
    }

    const nowIso = timeInfo.simulatedNowIso;
    const cancelReason = isAdvance
      ? "ผู้เช่ายกเลิกล่วงหน้า (> 2 วันก่อนวันนัดรับ)"
      : "ผู้เช่ายกเลิกกะทันหัน (<= 2 วันก่อนวันนัดรับ)";

    // 4. บันทึกรายการคืนเงินในตาราง Payment
    if (renterRefundAmount > 0) {
      await admin.from("payment").insert({
        order_id: orderId,
        user_id: user.id,
        amount: renterRefundAmount,
        status: "refunded",
        date: nowIso,
        transaction_ref: `REFUND-RENTER-CANCEL-${Date.now().toString().slice(-8)}`,
      });
    }

    // 5. อัปเดตสถานะคำสั่งเช่าเป็น cancelled
    const { data: updatedOrder, error: updateError } = await admin
      .from("rentalorder")
      .update({
        status: "cancelled",
        fee,
        net_income: netIncome,
        cancel_reason: cancelReason,
        updated_at: nowIso,
      })
      .eq("order_id", orderId)
      .select()
      .single();

    if (updateError) {
      console.error("Update rental order error:", updateError);
      return NextResponse.json(
        { message: "เกิดข้อผิดพลาดในการปรับปรุงสถานะคำสั่งเช่า" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      isAdvance,
      diffDays,
      refundAmount: renterRefundAmount,
      fee,
      netIncome,
      message: outcomeMessage,
      order: updatedOrder,
    });
  } catch (err: any) {
    console.error("POST /api/rentals/[id]/cancel-by-renter error:", err);
    return NextResponse.json(
      { message: err.message || "เกิดข้อผิดพลาดในการยกเลิกคำสั่งเช่า" },
      { status: 500 },
    );
  }
}
