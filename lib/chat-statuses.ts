// สถานะออเดอร์การเช่าที่ถือว่า "สิ้นสุดแล้ว" (ส่งข้อความใหม่ไม่ได้ แต่ดูประวัติย้อนหลังได้เสมอ)
export const CLOSED_ORDER_STATUSES = [
  "item_returned",
  "completed",
  "awaiting_additional_payment",
  "refunded_dispute",
  "item_not_returned",
  "cancelled",
  "cancelled_by_renter",
  "cancelled_by_lender",
  "rejected",
  "rejected_by_lender",
  "rejected_at_meetup",
  "renter_noshow",
  "lender_noshow",
] as const;

export type ClosedOrderStatus = (typeof CLOSED_ORDER_STATUSES)[number];

export function isOrderChatClosed(status?: string | null): boolean {
  if (!status) return false;
  return CLOSED_ORDER_STATUSES.includes(status as ClosedOrderStatus);
}

export const ORDER_STATUS_CONFIG: Record<
  string,
  { label: string; badgeCls: string }
> = {
  requested: {
    label: "รออนุมัติ",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  awaiting_payment: {
    label: "รอชำระเงิน",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  paid: {
    label: "ชำระเงินแล้ว",
    badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  item_sent: {
    label: "กำลังเช่า",
    badgeCls: "bg-sky-50 text-sky-700 border-sky-200",
  },
  item_received: {
    label: "กำลังเช่า",
    badgeCls: "bg-sky-50 text-sky-700 border-sky-200",
  },
  item_returned: {
    label: "คืนของแล้ว",
    badgeCls: "bg-slate-100 text-slate-600 border-slate-200",
  },
  completed: {
    label: "เสร็จสิ้น",
    badgeCls: "bg-slate-100 text-slate-600 border-slate-200",
  },
  cancelled: {
    label: "ยกเลิกแล้ว",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  cancelled_by_renter: {
    label: "ผู้เช่ายกเลิก",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  cancelled_by_lender: {
    label: "ผู้ให้เช่ายกเลิก",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  rejected: {
    label: "ปฏิเสธคำขอ",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  rejected_by_lender: {
    label: "ผู้ให้เช่าปฏิเสธ",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  rejected_at_meetup: {
    label: "ปฏิเสธ ณ จุดรับ",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  renter_noshow: {
    label: "ผู้เช่าไม่มาตามนัด",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  lender_noshow: {
    label: "ผู้ให้เช่าไม่มา",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  disputed_at_meetup: {
    label: "ข้อพิพาทจุดรับ",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  awaiting_additional_payment: {
    label: "รอชำระเพิ่ม",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  refunded_dispute: {
    label: "คืนเงินข้อพิพาท",
    badgeCls: "bg-slate-100 text-slate-600 border-slate-200",
  },
  item_not_returned: {
    label: "ไม่คืนสินค้า",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
  },
};
