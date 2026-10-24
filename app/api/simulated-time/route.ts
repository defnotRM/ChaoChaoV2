import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SIMULATED_OFFSET_KEY,
  getSimulatedTimeInfo,
  processSimulatedExpiredOrders,
} from "@/lib/simulated-time";

export const dynamic = "force-dynamic";

async function saveSimulatedOffset(
  admin: ReturnType<typeof createAdminClient>,
  offsetSeconds: number,
  userId?: string | null,
) {
  const strValue = String(Math.round(offsetSeconds));
  const { data: existing } = await admin
    .from("system_config")
    .select("config_id")
    .eq("config_key", SIMULATED_OFFSET_KEY)
    .maybeSingle();

  if (existing) {
    await admin
      .from("system_config")
      .update({
        config_value: strValue,
        updated_by: userId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("config_key", SIMULATED_OFFSET_KEY);
  } else {
    await admin.from("system_config").insert({
      config_key: SIMULATED_OFFSET_KEY,
      config_value: strValue,
      value_type: "text",
      description:
        "ค่าชดเชยเวลาจำลองของระบบ (วินาที) สำหรับทดสอบวันนัดรับ-คืนสินค้า",
      updated_by: userId ?? null,
      updated_at: new Date().toISOString(),
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId") || undefined;
    const includeOrders = searchParams.get("includeOrders") === "1";

    let timeInfo;
    let processed: any[] = [];

    if (orderId) {
      const res = await processSimulatedExpiredOrders(admin, orderId);
      timeInfo = res.timeInfo;
      processed = res.processed;
    } else {
      timeInfo = await getSimulatedTimeInfo(admin);
    }

    let activeOrders: any[] = [];
    if (includeOrders) {
      const { data: orders } = await admin
        .from("rentalorder")
        .select(
          "order_id, item_id, start_date, end_date, meetup_time, return_time, status, created_at, item:item_id ( item_name )",
        )
        .in("status", ["paid", "item_sent", "awaiting_payment", "requested"])
        .order("created_at", { ascending: false })
        .limit(12);

      activeOrders = (orders || []).map((o: any) => {
        const itemObj = Array.isArray(o.item) ? o.item[0] : o.item;
        return {
          order_id: o.order_id,
          item_name: itemObj?.item_name || "อุปกรณ์เช่า",
          start_date: o.start_date,
          end_date: o.end_date,
          meetup_time: (o.meetup_time || "12:00").slice(0, 5),
          return_time: (o.return_time || "12:00").slice(0, 5),
          status: o.status,
        };
      });
    }

    return NextResponse.json({
      success: true,
      ...timeInfo,
      processed,
      ...(includeOrders ? { activeOrders } : {}),
    });
  } catch (err: any) {
    console.error("GET /api/simulated-time error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "เกิดข้อผิดพลาด" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminApi();
  if (!auth.authorized) {
    return auth.response;
  }

  const { admin, user } = auth;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "set");

    if (action === "reset") {
      await saveSimulatedOffset(admin, 0, user.id);
      const { timeInfo, processed } =
        await processSimulatedExpiredOrders(admin);
      return NextResponse.json({
        success: true,
        message: "รีเซ็ตกลับเป็นวันและเวลาจริงเรียบร้อยแล้ว",
        ...timeInfo,
        processed,
      });
    }

    if (action === "shift") {
      const deltaSeconds = Number(body.deltaSeconds || 0);
      const current = await getSimulatedTimeInfo(admin);
      const nextOffset = current.offsetSeconds + deltaSeconds;
      await saveSimulatedOffset(admin, nextOffset, user.id);
      const { timeInfo, processed } =
        await processSimulatedExpiredOrders(admin);
      return NextResponse.json({
        success: true,
        message: `เลื่อนเวลาจำลองเรียบร้อยแล้ว${processed.length > 0 ? ` (ตัดจบอัตโนมัติ ${processed.length} ออเดอร์)` : ""}`,
        ...timeInfo,
        processed,
      });
    }

    if (action === "trigger") {
      const { timeInfo, processed } =
        await processSimulatedExpiredOrders(admin);
      return NextResponse.json({
        success: true,
        message:
          processed.length > 0
            ? `ประมวลผลคำสั่งเช่าที่หมดเวลาสำเร็จ (${processed.length} รายการ)`
            : "ตรวจสอบแล้ว ไม่มีคำสั่งเช่าที่เกินกำหนดเวลาในขณะนี้",
        ...timeInfo,
        processed,
      });
    }

    // action === "set"
    const dateStr = String(body.date || "").trim();
    const timeStr = String(body.time || "12:00").trim();
    if (!dateStr) {
      return NextResponse.json(
        { message: "กรุณาระบุวันที่จำลอง (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const parts = timeStr.split(":");
    const hh = String(parts[0] ?? "12").padStart(2, "0");
    const mm = String(parts[1] ?? "00").padStart(2, "0");
    const targetDate = new Date(`${dateStr}T${hh}:${mm}:00+07:00`);
    if (Number.isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { message: "รูปแบบวันที่หรือเวลาไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const offsetSeconds = Math.round(
      (targetDate.getTime() - Date.now()) / 1000,
    );
    await saveSimulatedOffset(admin, offsetSeconds, user.id);

    const { timeInfo, processed } = await processSimulatedExpiredOrders(admin);

    return NextResponse.json({
      success: true,
      message: `ตั้งวันและเวลาจำลองเป็น ${dateStr} เวลา ${hh}:${mm} น. เรียบร้อยแล้ว${
        processed.length > 0
          ? ` (ตัดจบอัตโนมัติ ${processed.length} ออเดอร์)`
          : ""
      }`,
      ...timeInfo,
      processed,
    });
  } catch (err: any) {
    console.error("POST /api/simulated-time error:", err);
    return NextResponse.json(
      { message: err.message || "เกิดข้อผิดพลาดในการตั้งเวลาจำลอง" },
      { status: 500 },
    );
  }
}
