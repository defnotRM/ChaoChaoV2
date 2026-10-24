import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiSuccess } from "@/lib/api-response";
import { updateRentalOrderStatusSchema } from "@/lib/validations/rental";
import { getSimulatedTimeInfo, processSimulatedExpiredOrders } from "@/lib/simulated-time";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET /api/rentals/[id] — หน้ารายละเอียดรายการเช่า
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const admin = createAdminClient();

  // ประมวลผลกรณีหมดเวลา 1 ชั่วโมงตาม FR-28 / FR-29 อัตโนมัติ
  await processSimulatedExpiredOrders(admin, id);

  const { data: order, error } = await admin
    .from("rentalorder")
    .select(
      `
        order_id, user_id, item_id, meetup_location, return_location,
        start_date, end_date, meetup_time, return_time, rental_fee, deposit, total_paid,
        fee, net_income, status, created_at, updated_at, cancel_reason, cancel_reason_image_url
      `
    )
    .eq("order_id", id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching rental order:", error);
    return apiError("ไม่สามารถดึงข้อมูลรายการเช่าได้", 500);
  }
  if (!order) {
    return apiError("ไม่พบรายการเช่านี้", 404);
  }

  const [
    { data: item },
    { data: itemImages },
    { data: payments },
    { data: evidence },
    { data: reports },
  ] = await Promise.all([
    order.item_id
      ? admin
          .from("item")
          .select("item_id, item_name, user_id, rental_fee_per_day, deposit")
          .eq("item_id", order.item_id)
          .maybeSingle()
      : { data: null },
    order.item_id
      ? admin
          .from("itemimage")
          .select("image_url, is_primary")
          .eq("item_id", order.item_id)
      : { data: [] },
    admin
      .from("payment")
      .select("payment_id, amount, status, slip_image_url, date")
      .eq("order_id", id),
    admin
      .from("rentalevidenceimage")
      .select("evidence_id, evidence_type, image_url, created_at, uploaded_by")
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("rentalreport")
      .select(
        "report_id, description, verdict, status, created_at, rentalreportimage(image_url)"
      )
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const fullData = {
    ...order,
    item: item ? { ...item, itemimage: itemImages || [] } : null,
    payment: payments || [],
    evidence: evidence || [],
    reports: reports || [],
  };

  return apiSuccess(fullData);
}

// PATCH /api/rentals/[id] — เปลี่ยนสถานะ (approve -> awaiting_payment, reject -> rejected, cancel -> cancelled)
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const admin = createAdminClient();

  const body = await request.json().catch(() => ({}));
  const parsed = updateRentalOrderStatusSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("สถานะที่ส่งมาไม่ถูกต้อง", 400, parsed.error.flatten());
  }

  const { status } = parsed.data;

  const { data: current, error: fetchError } = await admin
    .from("rentalorder")
    .select("order_id, status, item_id, user_id")
    .eq("order_id", id)
    .maybeSingle();

  if (fetchError || !current) {
    return apiError("ไม่พบรายการเช่านี้", 404);
  }

  const allowedFrom: Record<string, string[]> = {
    awaiting_payment: ["requested"],
    rejected: ["requested"],
    cancelled: ["requested", "awaiting_payment"],
  };

  if (!allowedFrom[status]?.includes(current.status)) {
    return apiError(
      `ไม่สามารถเปลี่ยนสถานะจาก "${current.status}" เป็น "${status}" ได้`,
      409
    );
  }

  // ถ้าผู้ให้เช่ากดยอมรับ/อนุมัติ (awaiting_payment) ตรวจสอบว่าไม่มีออเดอร์อื่นที่อนุมัติซ้อนวันกัน
  if (status === "awaiting_payment") {
    const { data: fullOrder } = await admin
      .from("rentalorder")
      .select("start_date, end_date, item_id")
      .eq("order_id", id)
      .single();

    if (fullOrder) {
      const { data: overlapping } = await admin
        .from("rentalorder")
        .select("order_id")
        .eq("item_id", fullOrder.item_id)
        .neq("order_id", id)
        .in("status", ["awaiting_payment", "paid", "item_sent", "item_received"])
        .lte("start_date", fullOrder.end_date)
        .gte("end_date", fullOrder.start_date);

      if (overlapping && overlapping.length > 0) {
        return apiError("ไม่สามารถอนุมัติได้ เนื่องจากช่วงเวลานี้มีรายการเช่าอื่นที่ได้รับการอนุมัติไปแล้ว", 409);
      }
    }
  }

  const timeInfo = await getSimulatedTimeInfo(admin);
  const nowIso = timeInfo.simulatedNowIso;

  const { data, error } = await admin
    .from("rentalorder")
    .update({ status, updated_at: nowIso })
    .eq("order_id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Error updating rental order status:", error);
    return apiError("ไม่สามารถเปลี่ยนสถานะได้", 500);
  }
  if (!data) {
    return apiError("สถานะถูกเปลี่ยนไปแล้วโดยคำขออื่น กรุณารีเฟรชแล้วลองใหม่", 409);
  }

  return apiSuccess({ message: "เปลี่ยนสถานะสำเร็จ", order: data });
}
