import type { createAdminClient } from "@/lib/supabase/admin";

// สินค้าที่ "ถูกเช่าออกไปอยู่ตอนนี้" = มีออเดอร์ที่ส่งมอบของแล้วและยังไม่ปิดงาน (item_sent / item_received)
// ใช้เพื่อแสดงป้ายเท่านั้น ห้ามเอาไปแทน item.status ในตรรกะจอง เพราะสินค้าชิ้นเดียวมีหลายออเดอร์คนละวันได้
// (ตรรกะจองและปฏิทินยังดูจาก item.status = 'available' และวันที่ถูกกันคิวตามเดิม)
export const RENTED_OUT_ORDER_STATUSES = ["item_sent", "item_received"] as const;

export async function getRentedOutItemIds(
  admin: ReturnType<typeof createAdminClient>,
  itemIds: string[],
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("rentalorder")
    .select("item_id")
    .in("item_id", itemIds)
    .in("status", [...RENTED_OUT_ORDER_STATUSES]);
  if (error || !data) return new Set();
  return new Set(data.map((o) => o.item_id as string));
}
