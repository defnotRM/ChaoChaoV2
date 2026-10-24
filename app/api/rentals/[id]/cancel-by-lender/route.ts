import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSimulatedTimeInfo, parseBangkokWindow } from "@/lib/simulated-time";
import { uploadToStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/rentals/[id]/cancel-by-lender
 *
 * FR-35: ผู้ให้เช่ายกเลิกรายการเช่าที่ชำระเงินแล้ว ก่อนถึงวันนัดรับสินค้า
 * - ผู้ให้เช่าต้องแนบเหตุผลประกอบกับรูปหลักฐาน (1-5 รูป)
 * - คืนเงินเต็มจำนวน 100% (ค่าเช่า + เงินประกัน) ให้แก่ผู้เช่า
 * - ปลดล็อกวันจองทันที (FR-36)
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

    // 1. ดึงข้อมูลคำสั่งเช่า และตรวจสอบว่าผู้เรียกคือเจ้าของสินค้าจริงหรือไม่
    const { data: order, error: orderError } = await admin
      .from("rentalorder")
      .select(
        `
        order_id,
        user_id,
        item_id,
        start_date,
        meetup_time,
        rental_fee,
        deposit,
        total_paid,
        status,
        item:item_id (
          user_id,
          item_name
        )
      `,
      )
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ message: "ไม่พบคำสั่งเช่านี้" }, { status: 404 });
    }

    const itemObj = Array.isArray(order.item) ? order.item[0] : order.item;
    const lenderId = itemObj?.user_id;

    if (user.id !== lenderId) {
      return NextResponse.json(
        { message: "เฉพาะผู้ให้เช่าของคำสั่งเช่านี้เท่านั้นที่มีสิทธิ์ดำเนินการ" },
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

    if (timeInfo.nowMs >= pickupWin.startMs) {
      return NextResponse.json(
        {
          message:
            "ถึงหรือเลยเวลานัดรับสินค้าแล้ว ไม่สามารถยกเลิกก่อนรับสินค้าได้",
        },
        { status: 400 },
      );
    }

    // 3. รับเหตุผลและรูปภาพหลักฐาน
    const body = await request.json().catch(() => ({}));
    const reason = (body.reason || "").trim();
    const rawImages: string[] = Array.isArray(body.imageUrls) ? body.imageUrls : [];

    if (!reason || reason.length < 5) {
      return NextResponse.json(
        { message: "กรุณาระบุเหตุผลในการยกเลิกคำสั่งเช่าอย่างน้อย 5 ตัวอักษร" },
        { status: 400 },
      );
    }

    if (rawImages.length === 0) {
      return NextResponse.json(
        { message: "กรุณาแนบรูปภาพหลักฐานประกอบการยกเลิกอย่างน้อย 1 รูป" },
        { status: 400 },
      );
    }

    if (rawImages.length > 5) {
      return NextResponse.json(
        { message: "แนบรูปภาพหลักฐานได้ไม่เกิน 5 รูป" },
        { status: 400 },
      );
    }

    // อัปโหลดรูปภาพขึ้น Storage (ถ้าเป็น base64 data URI)
    const uploadedUrls: string[] = [];
    for (const img of rawImages) {
      if (img.startsWith("data:")) {
        const uploadRes = await uploadToStorage("disputes", orderId, img);
        uploadedUrls.push(uploadRes.publicUrl);
      } else {
        uploadedUrls.push(img);
      }
    }

    const rentalFee = Number(order.rental_fee) || 0;
    const deposit = Number(order.deposit) || 0;
    const totalPaid = Number(order.total_paid) || rentalFee + deposit;

    // 4. บันทึกรายงานการยกเลิกลง RentalReport เพื่อเก็บประวัติและหลักฐาน (FR-30, FR-35)
    // ดึงประเภทรายงานที่ตรงกัน หรือ 'other'
    const { data: reportTypes } = await admin
      .from("rentalreporttype")
      .select("report_type_id, report_type");

    const matchedType =
      reportTypes?.find((t) => t.report_type === "other") || reportTypes?.[0];

    let reportId: string | null = null;
    if (matchedType) {
      const { data: newReport } = await admin
        .from("rentalreport")
        .insert({
          order_id: orderId,
          reporter_id: user.id,
          reported_user_id: order.user_id,
          report_type_id: matchedType.report_type_id,
          description: `[ผู้ให้เช่ายกเลิกคำสั่งเช่า]: ${reason}`,
          status: "resolved",
          verdict: "ผู้ให้เช่ายกเลิกคำสั่งเช่าก่อนวันนัดรับสินค้า ระบบคืนเงินเต็มจำนวนให้แก่ผู้เช่า",
        })
        .select("report_id")
        .single();

      if (newReport?.report_id) {
        reportId = newReport.report_id;
        if (uploadedUrls.length > 0) {
          const imageInserts = uploadedUrls.map((url) => ({
            report_id: newReport.report_id,
            image_url: url,
          }));
          await admin.from("rentalreportimage").insert(imageInserts);
        }
      }
    }

    const nowIso = timeInfo.simulatedNowIso;

    // 5. บันทึกรายการคืนเงินเต็มจำนวน (100%) ให้แก่ผู้เช่า
    await admin.from("payment").insert({
      order_id: orderId,
      user_id: order.user_id,
      amount: totalPaid,
      status: "refunded",
      date: nowIso,
      transaction_ref: `REFUND-LENDER-CANCEL-${Date.now().toString().slice(-8)}`,
    });

    // 6. อัปเดตสถานะคำสั่งเช่าเป็น cancelled พร้อมเก็บเหตุผลและรูปหลักฐานลง rentalorder โดยตรง
    const { data: updatedOrder, error: updateError } = await admin
      .from("rentalorder")
      .update({
        status: "cancelled",
        fee: 0,
        net_income: 0,
        cancel_reason: reason,
        cancel_reason_image_url: uploadedUrls.length > 0 ? uploadedUrls[0] : null,
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

    // ส่งการแจ้งเตือนถึงผู้เช่าเมื่อผู้ให้เช่ายกเลิกคำสั่งเช่าและคืนเงิน (FR-51)
    if (order.user_id) {
      try {
        await admin.from("notification").insert({
          user_id: order.user_id,
          type: "order_cancelled",
          title: "ผู้ให้เช่ายกเลิกคำสั่งเช่า (คืนเงินเต็มจำนวน) ↩️",
          message: `ผู้ให้เช่าได้ขอยกเลิกคำสั่งเช่า "${itemObj?.item_name || "อุปกรณ์"}" (เหตุผล: ${reason}) ระบบได้ดำเนินการโอนเงินคืนเต็มจำนวน 100% (${totalPaid.toLocaleString()} บาท) ให้แก่คุณเรียบร้อยแล้ว`,
          related_order_id: orderId,
          is_read: false,
        });
      } catch (notifErr) {
        console.warn("Notification error (cancel-by-lender):", notifErr);
      }
    }

    return NextResponse.json({
      success: true,
      refundAmount: totalPaid,
      reportId,
      imageUrls: uploadedUrls,
      message: `ยกเลิกคำสั่งเช่าสำเร็จ ระบบได้ดำเนินการคืนเงินเต็มจำนวน 100% (${totalPaid.toLocaleString()} บาท) ให้แก่ผู้เช่าเรียบร้อยแล้ว`,
      order: updatedOrder,
    });
  } catch (err: any) {
    console.error("POST /api/rentals/[id]/cancel-by-lender error:", err);
    return NextResponse.json(
      { message: err.message || "เกิดข้อผิดพลาดในการยกเลิกคำสั่งเช่า" },
      { status: 500 },
    );
  }
}
