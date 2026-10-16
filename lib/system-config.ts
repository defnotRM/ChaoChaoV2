import { createAdminClient } from "@/lib/supabase/admin";

// เวลารอ (ชั่วโมง) ที่แอดมินตั้งในหน้า /admin/workflow (ตาราง system_config)
// ใช้กฎเดียวกับฟังก์ชัน workflow_cfg_num ในฐานข้อมูล: ไม่มีคีย์หรือไม่ใช่ตัวเลข = ใช้ค่าเดิม 8
// เพื่อให้เวลานับถอยหลังบนหน้าจอตรงกับที่ cron ใช้ตัดสินจริง
export interface OrderTimeouts {
  approvalHours: number;
  paymentHours: number;
  slipReviewHours: number;
}

const DEFAULT_HOURS = 8;
const NUMERIC_RE = /^[0-9]+(\.[0-9]+)?$/;

export async function getOrderTimeouts(): Promise<OrderTimeouts> {
  const fallback: OrderTimeouts = {
    approvalHours: DEFAULT_HOURS,
    paymentHours: DEFAULT_HOURS,
    slipReviewHours: DEFAULT_HOURS,
  };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_config")
      .select("config_key, config_value")
      .in("config_key", [
        "approval_timeout_hours",
        "payment_timeout_hours",
        "slip_review_timeout_hours",
      ]);
    if (error || !data) return fallback;

    const read = (key: string) => {
      const raw = data.find((r) => r.config_key === key)?.config_value;
      return raw && NUMERIC_RE.test(raw) ? Number(raw) : DEFAULT_HOURS;
    };
    return {
      approvalHours: read("approval_timeout_hours"),
      paymentHours: read("payment_timeout_hours"),
      slipReviewHours: read("slip_review_timeout_hours"),
    };
  } catch {
    return fallback;
  }
}

// เลยกำหนดเวลาหรือยัง (นับจาก startISO + hours ชั่วโมง) ใช้ตัดสินใน API ให้ตรงกับที่ cron ใช้
export function isPastDeadline(startISO: string | null | undefined, hours: number) {
  if (!startISO) return false;
  const start = new Date(startISO).getTime();
  if (Number.isNaN(start)) return false;
  return Date.now() > start + hours * 3_600_000;
}

// เมื่อ API พบว่าเลยกำหนดแล้ว ให้ cron ตัวเดียวกัน (process_expired_orders) ปิดงานให้ทันที
// ไม่ต้องรอรอบ 10 นาที และทำให้ระบบไม่ค้างถ้า cron ไม่ทำงาน (ผลลัพธ์ที่ได้เหมือน cron ทุกประการ)
export async function expireOverdueOrders() {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("process_expired_orders");
    if (error) console.error("process_expired_orders error:", error);
  } catch (err) {
    console.error("process_expired_orders failed:", err);
  }
}

// ผู้ให้เช่าปฏิเสธสลิปของออเดอร์เดียวกันได้ไม่เกินกี่ครั้ง (กันวนลูปปฏิเสธ-อัปโหลดไม่รู้จบ)
export const MAX_SLIP_REJECTIONS = 3;
