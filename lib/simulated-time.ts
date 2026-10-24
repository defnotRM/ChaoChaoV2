import { createAdminClient } from "@/lib/supabase/admin";

export const SIMULATED_OFFSET_KEY = "simulated_offset_seconds";
export const DEFAULT_GRACE_HOURS = 1;

export interface SimulatedTimeInfo {
  isSimulated: boolean;
  offsetSeconds: number;
  nowMs: number;
  simulatedNowIso: string;
  realNowIso: string;
  graceHours: number;
  approvalTimeoutHours: number;
  paymentTimeoutHours: number;
  slipReviewTimeoutHours: number;
}

export interface TimeWindowInfo {
  startMs: number;
  deadlineMs: number;
  startIso: string;
  deadlineIso: string;
  dateStr: string;
  timeStr: string;
}

/**
 * แปลงวันที่ (YYYY-MM-DD) และเวลา (HH:mm หรือ HH:mm:ss) ตามเวลาไทย (Asia/Bangkok, UTC+7)
 * พร้อมคำนวณเส้นตาย +graceHours ชั่วโมง (ค่าเริ่มต้น 1 ชั่วโมงตาม FR-28 / FR-29)
 */
export function parseBangkokWindow(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
  graceHours: number = DEFAULT_GRACE_HOURS,
): TimeWindowInfo {
  const cleanDate = (dateStr || "").trim().split("T")[0] || "2026-01-01";
  const rawTime = (timeStr || "12:00").trim();
  const parts = rawTime.split(":");
  const hh = String(parts[0] ?? "12").padStart(2, "0");
  const mm = String(parts[1] ?? "00").padStart(2, "0");
  const normalizedTime = `${hh}:${mm}`;

  const startDateObj = new Date(`${cleanDate}T${normalizedTime}:00+07:00`);
  const startMs = Number.isNaN(startDateObj.getTime())
    ? Date.now()
    : startDateObj.getTime();
  const deadlineMs = startMs + graceHours * 3600 * 1000;

  return {
    startMs,
    deadlineMs,
    startIso: new Date(startMs).toISOString(),
    deadlineIso: new Date(deadlineMs).toISOString(),
    dateStr: cleanDate,
    timeStr: normalizedTime,
  };
}

/**
 * อ่านเวลาปัจจุบันของระบบ (รวม offset จากนาฬิกาจำลองของแอดมิน หากเปิดใช้งาน)
 */
export async function getSimulatedTimeInfo(
  adminClient?: ReturnType<typeof createAdminClient>,
): Promise<SimulatedTimeInfo> {
  const admin = adminClient ?? createAdminClient();

  let offsetSeconds = 0;
  let graceHours = DEFAULT_GRACE_HOURS;
  let approvalTimeoutHours = 8;
  let paymentTimeoutHours = 8;
  let slipReviewTimeoutHours = 8;

  try {
    const { data: rows } = await admin
      .from("system_config")
      .select("config_key, config_value")
      .in("config_key", [
        SIMULATED_OFFSET_KEY,
        "noshow_grace_hours",
        "approval_timeout_hours",
        "payment_timeout_hours",
        "slip_review_timeout_hours",
      ]);

    if (rows) {
      for (const row of rows) {
        const parsed = Number(row.config_value);
        if (row.config_key === SIMULATED_OFFSET_KEY) {
          if (Number.isFinite(parsed)) {
            offsetSeconds = Math.round(parsed);
          }
        } else if (row.config_key === "noshow_grace_hours") {
          if (Number.isFinite(parsed) && parsed > 0) {
            graceHours = parsed;
          }
        } else if (row.config_key === "approval_timeout_hours") {
          if (Number.isFinite(parsed) && parsed > 0) {
            approvalTimeoutHours = parsed;
          }
        } else if (row.config_key === "payment_timeout_hours") {
          if (Number.isFinite(parsed) && parsed > 0) {
            paymentTimeoutHours = parsed;
          }
        } else if (row.config_key === "slip_review_timeout_hours") {
          if (Number.isFinite(parsed) && parsed > 0) {
            slipReviewTimeoutHours = parsed;
          }
        }
      }
    }
  } catch (err) {
    console.error("getSimulatedTimeInfo error:", err);
  }

  const realNowMs = Date.now();
  const nowMs = realNowMs + offsetSeconds * 1000;

  return {
    isSimulated: offsetSeconds !== 0,
    offsetSeconds,
    nowMs,
    simulatedNowIso: new Date(nowMs).toISOString(),
    realNowIso: new Date(realNowMs).toISOString(),
    graceHours,
    approvalTimeoutHours,
    paymentTimeoutHours,
    slipReviewTimeoutHours,
  };
}

export interface ProcessedOrderResult {
  orderId: string;
  previousStatus: string;
  newStatus: string;
  outcome: string;
}

/**
 * ตรวจสอบและตัดจบออเดอร์ที่เลยกำหนดเวลา 1 ชั่วโมงตาม FR-28 และ FR-29
 * โดยอ้างอิงจากเวลาจำลอง (หรือเวลาจริงหากไม่ได้เปิดโหมดจำลอง)
 *
 * FR-28 (สถานะ paid -> เลยเวลานัดรับ + 1 ชั่วโมง):
 *   - กรณีที่ 1: ผู้ให้เช่าอัปโหลดรูปแล้ว แต่ผู้เช่าไม่อัปโหลดรูปภายในเวลา -> renter_noshow
 *                (คืนเงินประกัน 100% ให้ผู้เช่า + โอนค่าเช่า 100% ให้ผู้ให้เช่า)
 *   - กรณีที่ 2: ผู้ให้เช่าไม่อัปโหลดรูปภายในเวลา -> lender_noshow
 *                (คืนเงินทั้งหมด เงินประกัน + ค่าเช่า 100% ให้ผู้เช่า)
 *
 * FR-29 (สถานะ item_sent / item_returned -> เลยเวลานัดคืน + 1 ชั่วโมง):
 *   - หากผู้เช่าอัปโหลดรูปคืนแล้ว แต่ผู้ให้เช่าไม่อัปโหลดภายใน 1 ชั่วโมง -> happy (completed)
 *   - หากผู้ให้เช่าอัปโหลดรูปแล้ว แต่ผู้เช่าไม่อัปโหลดรูปคืนภายใน 1 ชั่วโมง -> item_not_returned
 */
export async function processSimulatedExpiredOrders(
  adminClient?: ReturnType<typeof createAdminClient>,
  targetOrderId?: string,
): Promise<{
  timeInfo: SimulatedTimeInfo;
  processed: ProcessedOrderResult[];
}> {
  const admin = adminClient ?? createAdminClient();
  const timeInfo = await getSimulatedTimeInfo(admin);
  const {
    nowMs,
    graceHours,
    approvalTimeoutHours = 8,
    paymentTimeoutHours = 8,
    slipReviewTimeoutHours = 8,
  } = timeInfo;
  const processed: ProcessedOrderResult[] = [];

  try {
    let query = admin
      .from("rentalorder")
      .select(
        "order_id, item_id, user_id, start_date, end_date, meetup_time, return_time, status, created_at, updated_at",
      )
      .in("status", [
        "requested",
        "awaiting_payment",
        "paid",
        "item_sent",
        "item_returned",
      ]);

    if (targetOrderId) {
      query = query.eq("order_id", targetOrderId);
    }

    const { data: orders, error } = await query;
    if (error || !orders || orders.length === 0) {
      return { timeInfo, processed };
    }

    for (const ord of orders) {
      if (ord.status === "requested") {
        // FR-22: จำกัดเวลาผู้ให้เช่าในการอนุมัติหรือปฏิเสธคำขอเช่า ไม่เกิน 8 ชั่วโมงหลังได้รับคำขอ
        const createdMs = new Date(ord.created_at).getTime();
        const approvalDeadlineMs =
          createdMs + approvalTimeoutHours * 3600 * 1000;

        if (nowMs > approvalDeadlineMs) {
          const { error: upErr } = await admin
            .from("rentalorder")
            .update({
              status: "rejected_by_lender",
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", ord.order_id);

          if (!upErr) {
            processed.push({
              orderId: ord.order_id,
              previousStatus: ord.status,
              newStatus: "rejected_by_lender",
              outcome: "approval_timeout",
            });
          }
        }
      } else if (ord.status === "awaiting_payment") {
        // ตรวจสอบว่ามีสลิปรอตรวจสอบอยู่หรือไม่
        const { data: payments } = await admin
          .from("payment")
          .select("payment_id, date, status, created_at")
          .eq("order_id", ord.order_id)
          .order("date", { ascending: false });

        const pendingPayment = payments?.find((p) => p.status === "pending");

        if (!pendingPayment) {
          // FR-23: จำกัดเวลาผู้เช่าในการชำระเงินทั้งหมดเข้าสู่บัญชีกลาง ไม่เกิน 8 ชั่วโมงหลังได้รับคำอนุมัติ
          const approvedMs = new Date(ord.updated_at).getTime();
          const paymentDeadlineMs =
            approvedMs + paymentTimeoutHours * 3600 * 1000;

          if (nowMs > paymentDeadlineMs) {
            const { error: upErr } = await admin
              .from("rentalorder")
              .update({
                status: "cancelled",
                updated_at: new Date().toISOString(),
              })
              .eq("order_id", ord.order_id);

            if (!upErr) {
              processed.push({
                orderId: ord.order_id,
                previousStatus: ord.status,
                newStatus: "cancelled",
                outcome: "payment_timeout",
              });
            }
          }
        } else {
          // FR-24: จำกัดเวลาผู้ให้เช่าในการตรวจสอบสลิป ไม่เกิน 8 ชั่วโมง (เกินแล้วอนุมัติอัตโนมัติ)
          const slipTimeStr = pendingPayment.date || ord.updated_at;
          const slipMs = new Date(slipTimeStr).getTime();
          const slipDeadlineMs =
            slipMs + slipReviewTimeoutHours * 3600 * 1000;

          if (nowMs > slipDeadlineMs) {
            // อนุมัติสลิปอัตโนมัติ
            await admin
              .from("payment")
              .update({ status: "paid" })
              .eq("payment_id", pendingPayment.payment_id);

            const { error: upErr } = await admin
              .from("rentalorder")
              .update({
                status: "paid",
                updated_at: new Date().toISOString(),
              })
              .eq("order_id", ord.order_id);

            if (!upErr) {
              processed.push({
                orderId: ord.order_id,
                previousStatus: ord.status,
                newStatus: "paid",
                outcome: "slip_auto_approved",
              });
            }
          }
        }
      } else if (ord.status === "paid") {
        const pickupWin = parseBangkokWindow(
          ord.start_date,
          ord.meetup_time,
          graceHours,
        );

        // หากยังไม่พ้นเส้นตาย 1 ชั่วโมงหลังเวลานัดรับ ยังไม่ตัดจบ
        if (nowMs <= pickupWin.deadlineMs) {
          continue;
        }

        // ดึงข้อมูลเจ้าของสินค้า (ผู้ให้เช่า) และหลักฐานรูปที่อัปโหลดแล้ว
        const [{ data: itemRow }, { data: evRows }] = await Promise.all([
          admin
            .from("item")
            .select("user_id")
            .eq("item_id", ord.item_id)
            .maybeSingle(),
          admin
            .from("rentalevidenceimage")
            .select("evidence_type")
            .eq("order_id", ord.order_id)
            .in("evidence_type", ["lender_before", "renter_before"]),
        ]);

        const lenderId = itemRow?.user_id;
        if (!lenderId) continue;

        const hasLenderBefore = (evRows || []).some(
          (e) => e.evidence_type === "lender_before",
        );
        const hasRenterBefore = (evRows || []).some(
          (e) => e.evidence_type === "renter_before",
        );

        if (hasLenderBefore && hasRenterBefore) {
          const { error: upErr } = await admin
            .from("rentalorder")
            .update({
              status: "item_sent",
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", ord.order_id);

          if (!upErr) {
            processed.push({
              orderId: ord.order_id,
              previousStatus: ord.status,
              newStatus: "item_sent",
              outcome: "handover_complete",
            });
          }
        } else if (hasLenderBefore && !hasRenterBefore) {
          // FR-28 กรณีที่ 1: ผู้เช่าไม่อัปโหลดรูปภายในเวลา
          const { data: newStatus, error: rpcErr } = await admin.rpc(
            "settle_rental_order",
            {
              p_order_id: ord.order_id,
              p_caller_id: lenderId,
              p_outcome: "renter_noshow",
            },
          );
          if (!rpcErr && newStatus) {
            processed.push({
              orderId: ord.order_id,
              previousStatus: ord.status,
              newStatus: String(newStatus),
              outcome: "renter_noshow",
            });
          }
        } else {
          // FR-28 กรณีที่ 2: ผู้ให้เช่าไม่อัปโหลดรูปภายในเวลา
          const { data: newStatus, error: rpcErr } = await admin.rpc(
            "settle_rental_order",
            {
              p_order_id: ord.order_id,
              p_caller_id: lenderId,
              p_outcome: "lender_noshow",
            },
          );
          if (!rpcErr && newStatus) {
            processed.push({
              orderId: ord.order_id,
              previousStatus: ord.status,
              newStatus: String(newStatus),
              outcome: "lender_noshow",
            });
          }
        }
      } else if (
        ord.status === "item_sent" ||
        ord.status === "item_returned"
      ) {
        const returnWin = parseBangkokWindow(
          ord.end_date,
          ord.return_time,
          graceHours,
        );

        // หากยังไม่พ้นเส้นตาย 1 ชั่วโมงหลังเวลานัดคืน ยังไม่ตัดจบ
        if (nowMs <= returnWin.deadlineMs) {
          continue;
        }

        const [{ data: itemRow }, { data: evRows }] = await Promise.all([
          admin
            .from("item")
            .select("user_id")
            .eq("item_id", ord.item_id)
            .maybeSingle(),
          admin
            .from("rentalevidenceimage")
            .select("evidence_type")
            .eq("order_id", ord.order_id)
            .in("evidence_type", ["lender_after", "renter_after"]),
        ]);

        const lenderId = itemRow?.user_id;
        if (!lenderId) continue;

        const hasLenderAfter = (evRows || []).some(
          (e) => e.evidence_type === "lender_after",
        );
        const hasRenterAfter = (evRows || []).some(
          (e) => e.evidence_type === "renter_after",
        );

        if (hasRenterAfter) {
          // ผู้เช่าอัปโหลดรูปคืนภายในเวลาแล้ว (ไม่ว่าผู้ให้เช่าจะอัปโหลดครบหรือปล่อยเกิน 1 ชม.) -> จบงานปกติ คืนมัดจำผู้เช่า
          const { data: newStatus, error: rpcErr } = await admin.rpc(
            "settle_rental_order",
            {
              p_order_id: ord.order_id,
              p_caller_id: lenderId,
              p_outcome: "happy",
            },
          );
          if (!rpcErr && newStatus) {
            processed.push({
              orderId: ord.order_id,
              previousStatus: ord.status,
              newStatus: String(newStatus),
              outcome: "happy",
            });
          }
        } else if (hasLenderAfter && !hasRenterAfter) {
          // ผู้ให้เช่าอัปโหลดหลักฐานรอรับคืนแล้ว แต่ผู้เช่าไม่อัปโหลดคืนภายใน 1 ชม.
          const { data: newStatus, error: rpcErr } = await admin.rpc(
            "settle_rental_order",
            {
              p_order_id: ord.order_id,
              p_caller_id: lenderId,
              p_outcome: "item_not_returned",
            },
          );
          if (!rpcErr && newStatus) {
            processed.push({
              orderId: ord.order_id,
              previousStatus: ord.status,
              newStatus: String(newStatus),
              outcome: "item_not_returned",
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("processSimulatedExpiredOrders error:", err);
  }

  return { timeInfo, processed };
}
