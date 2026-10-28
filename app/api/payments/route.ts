import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { uploadToStorage } from "@/lib/storage";
import { getSimulatedTimeInfo } from "@/lib/simulated-time";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    let orderId = "";
    let amount = 0;
    let transferDate = new Date().toISOString();
    let transactionRef: string | null = null;
    let slipDataUri: string | null = null;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await request.json();
      orderId = json.orderId || "";
      amount = Number(json.amount) || 0;
      transferDate = json.transferDate || new Date().toISOString();
      transactionRef = json.transactionRef || null;
      slipDataUri = json.slipImageUrl || null;
    } else {
      const formData = await request.formData();
      const slip = formData.get("slip") as File | null;
      orderId = (formData.get("orderId") as string | null)?.trim() ?? "";
      const amountRaw = formData.get("amount") as string | null;
      transferDate = (formData.get("transferDate") as string | null)?.trim() ?? new Date().toISOString();
      transactionRef = (formData.get("transactionRef") as string | null)?.trim() || null;
      amount = Number(amountRaw);

      if (slip) {
        if (!ALLOWED_TYPES.includes(slip.type)) {
          return NextResponse.json(
            { message: "ประเภทไฟล์ไม่ถูกต้อง รองรับเฉพาะ JPG, PNG หรือ WebP" },
            { status: 400 }
          );
        }
        if (slip.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { message: "ขนาดไฟล์ต้องไม่เกิน 10 MB" },
            { status: 400 }
          );
        }
        const uploadRes = await uploadToStorage("slips", orderId, slip, {
          contentType: slip.type || "image/png",
        });
        slipDataUri = uploadRes.publicUrl;
      }
    }

    if (!orderId) {
      return NextResponse.json(
        { message: "กรุณาระบุเลขออเดอร์" },
        { status: 400 }
      );
    }

    if (slipDataUri && slipDataUri.startsWith("data:")) {
      const uploadRes = await uploadToStorage("slips", orderId, slipDataUri);
      slipDataUri = uploadRes.publicUrl;
    }

    const admin = createAdminClient();
    const timeInfo = await getSimulatedTimeInfo(admin);
    const nowIso = timeInfo.simulatedNowIso;
    if (!transferDate) {
      transferDate = nowIso;
    }

    // 2) ตรวจออเดอร์ต้องมีจริง
    const { data: order, error: orderError } = await admin
      .from("rentalorder")
      .select("order_id, user_id, status, total_paid, rental_fee, deposit")
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์นี้" }, { status: 404 });
    }
    // สลิปส่วนต่างค่าเสียหาย (ค่าเสียหายเกินเงินประกัน) ส่งได้เมื่อออเดอร์อยู่ในสถานะ awaiting_additional_payment
    const isAdditional = order.status === "awaiting_additional_payment";

    if (
      order.status !== "awaiting_payment" &&
      order.status !== "requested" &&
      !isAdditional
    ) {
      return NextResponse.json(
        { message: "ออเดอร์นี้ไม่อยู่ในสถานะรอชำระเงิน" },
        { status: 400 }
      );
    }

    if (isAdditional) {
      // เฉพาะผู้เช่าของออเดอร์นี้เท่านั้นที่ส่งสลิปส่วนต่างได้
      const supabase = await createServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
          { status: 401 }
        );
      }
      if (user.id !== order.user_id) {
        return NextResponse.json(
          { message: "เฉพาะผู้เช่าของออเดอร์นี้เท่านั้นที่ส่งสลิปได้" },
          { status: 403 }
        );
      }

      // ยอดส่วนต่าง = ค่าเสียหายที่แอดมินตัดสินล่าสุด − เงินประกัน (ไม่เชื่อยอดจากฝั่งผู้ใช้)
      const { data: damageReport } = await admin
        .from("rentalreport")
        .select("damage_amount")
        .eq("order_id", orderId)
        .gt("damage_amount", 0)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const extraDue =
        Number(damageReport?.damage_amount || 0) - Number(order.deposit || 0);
      if (extraDue > 0) {
        amount = extraDue;
      }
      if (!amount || amount <= 0) {
        return NextResponse.json(
          { message: "ไม่พบยอดส่วนต่างค่าเสียหายของออเดอร์นี้" },
          { status: 400 }
        );
      }
    }

    if (!isAdditional && (!amount || amount <= 0)) {
      amount = Number(order.total_paid) || (Number(order.rental_fee) + Number(order.deposit)) || 0;
    }

    // ตรวจสอบว่าต้องมีรูปภาพสลิปเสมอ (TC03)
    if (!slipDataUri) {
      return NextResponse.json(
        { message: "กรุณาแนบรูปภาพสลิปหลักฐานการชำระเงิน" },
        { status: 400 }
      );
    }

    // 3) ลบหรืออัปเดตสลิปเดิมหากมี
    await admin
      .from("payment")
      .delete()
      .eq("order_id", orderId)
      .eq("status", "pending");

    // 4) INSERT payment (status pending รอผู้ให้เช่าตรวจ)
    const { data: payment, error: paymentError } = await admin
      .from("payment")
      .insert({
        order_id: orderId,
        user_id: order.user_id,
        amount,
        date: transferDate,
        slip_image_url: slipDataUri,
        transaction_ref:
          transactionRef ||
          `${isAdditional ? "EXTRA" : "TXN"}-${Date.now().toString().slice(-8)}`,
        status: "pending",
      })
      .select("payment_id")
      .single();

    if (paymentError) {
      console.error("Insert payment error:", paymentError);
      return NextResponse.json(
        { message: "บันทึกการชำระเงินไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 }
      );
    }

    // ตรวจสอบสถานะ order ให้อยู่ใน awaiting_payment
    // สลิปส่วนต่างค่าเสียหาย ห้ามเปลี่ยนสถานะออเดอร์
    if (order.status !== "awaiting_payment" && !isAdditional) {
      await admin
        .from("rentalorder")
        .update({ status: "awaiting_payment", updated_at: nowIso })
        .eq("order_id", orderId);
    }

    return NextResponse.json(
      {
        paymentId: payment.payment_id,
        slipUrl: slipDataUri,
        message: "อัปโหลดสลิปเรียบร้อยแล้ว รอผู้ให้เช่าตรวจสอบ",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/payments error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
