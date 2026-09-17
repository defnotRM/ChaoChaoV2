import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const settleSchema = z.object({
  outcome: z.enum([
    "happy",
    "damaged",
    "lender_noshow",
    "renter_noshow",
    "renter_rejected_meetup",
    "false_advertisement_approved",
    "false_advertisement_rejected",
    "item_not_returned",
    "item_not_returned_rejected",
  ]),
  damageAmount: z.number().min(0).optional().default(0),
});

// POST /api/rentals/[id]/settle
// ใช้ตอนปิดยอด order แบบมีผลลัพธ์พิเศษ (เสียหาย/ไม่มา/ข้อพิพาท ฯลฯ) — ปกติ
// "happy flow" ธรรมดาจะถูกเรียกอัตโนมัติจาก /api/return อยู่แล้ว endpoint นี้ไว้ใช้
// เวลาต้องปิดยอดด้วยผลลัพธ์อื่นที่ไม่ใช่ happy (ส่วนใหญ่เรียกจากฝั่งแอดมินตอนตัดสิน report)
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError("กรุณาเข้าสู่ระบบก่อน", 401);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = settleSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("ข้อมูลไม่ถูกต้อง", 400, parsed.error.flatten());
  }

  const { outcome, damageAmount } = parsed.data;

  const { data, error } = await supabase.rpc("settle_rental_order", {
    p_order_id: id,
    p_caller_id: user.id,
    p_outcome: outcome,
    p_damage_amount: damageAmount,
  });

  if (error) {
    console.error("Error settling rental order:", error);
    return apiError("ไม่สามารถปิดรายการเช่าได้", 500, error.message);
  }

  return apiSuccess({ message: "ปิดรายการเช่าสำเร็จ", result: data });
}
