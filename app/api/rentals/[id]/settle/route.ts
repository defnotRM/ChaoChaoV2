import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiSuccess } from "@/lib/api-response";
import { settleRentalOrderSchema } from "@/lib/validations/rental";

type Params = { params: Promise<{ id: string }> };

// POST /api/rentals/[id]/settle
// ใช้ตอนเจ้าของสินค้ากด "ยืนยันคืนสินค้า" (หน้าของ Toey) พร้อมระบุค่าเสียหาย (ถ้ามี)
// เรียกผ่าน RPC settle_rental_order ซึ่งจัดการ: ล็อกแถวกันกดซ้ำ, คำนวณเงินคืน/หัก
// ค่าเสียหายจาก deposit, และปิดสถานะ order ทั้งหมดในทรานแซกชันเดียว
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
  const parsed = settleRentalOrderSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("ข้อมูลไม่ถูกต้อง", 400, parsed.error.flatten());
  }

  const { damageCost } = parsed.data;

  const { data, error } = await supabase.rpc("settle_rental_order", {
    p_order_id: id,
    p_damage_cost: damageCost,
  });

  if (error) {
    console.error("Error settling rental order:", error);
    return apiError("ไม่สามารถปิดรายการเช่าได้", 500, error.message);
  }

  // ส่งการแจ้งเตือนเรื่องการกระจายเงินจากบัญชีกลาง (FR-51)
  try {
    const admin = createAdminClient();
    const { data: orderData } = await admin
      .from("rentalorder")
      .select("order_id, user_id, deposit, rental_fee, net_income, item(user_id, item_name)")
      .eq("order_id", id)
      .maybeSingle();

    if (orderData) {
      const renterId = orderData.user_id;
      const lenderId = (orderData.item as any)?.user_id;
      const itemName = (orderData.item as any)?.item_name || "อุปกรณ์";
      const notifs = [];

      // 1. แจ้งเตือนผู้เช่าเรื่องการคืนเงินประกัน
      if (renterId) {
        const deposit = Number(orderData.deposit || 0);
        const damage = Number(damageCost || 0);
        const refundAmount = Math.max(0, deposit - damage);

        notifs.push({
          user_id: renterId,
          type: "payout_processed",
          title: "คืนเงินประกันสำเร็จ 💰",
          message:
            damage > 0
              ? `การเช่า "${itemName}" เสร็จสมบูรณ์ มีการหักค่าเสียหาย ${damage.toLocaleString()} บาท และระบบโอนเงินประกันส่วนที่เหลือ ${refundAmount.toLocaleString()} บาท คืนเข้าบัญชีของคุณแล้ว`
              : `การเช่า "${itemName}" เสร็จสมบูรณ์ ระบบโอนเงินประกันเต็มจำนวน ${refundAmount.toLocaleString()} บาท คืนเข้าบัญชีของคุณแล้ว`,
          related_order_id: id,
          is_read: false,
        });
      }

      // 2. แจ้งเตือนผู้ให้เช่าเรื่องการโอนเงินค่าเช่า
      if (lenderId) {
        const netIncome = Number(orderData.net_income || 0);
        notifs.push({
          user_id: lenderId,
          type: "payout_processed",
          title: "โอนเงินค่าเช่าสำเร็จ 💸",
          message: `การเช่า "${itemName}" เสร็จสมบูรณ์ ระบบได้โอนเงินค่าเช่าหลังหักค่าธรรมเนียม ${netIncome.toLocaleString()} บาท เข้าบัญชีของคุณเรียบร้อยแล้ว`,
          related_order_id: id,
          is_read: false,
        });
      }

      if (notifs.length > 0) {
        await admin.from("notification").insert(notifs);
      }
    }
  } catch (notifErr) {
    console.warn("Failed to create settlement notifications:", notifErr);
  }

  // RPC คืนค่าเป็น TEXT อธิบายผลลัพธ์ (เช่น สถานะถัดไปคืออะไร)
  return apiSuccess({ message: "ปิดรายการเช่าสำเร็จ", result: data });
}
