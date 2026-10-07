import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemCondition } from "@/lib/types/product";

/**
 * บันทึกสภาพการใช้งาน (item.item_condition) แยกจาก insert/update หลัก
 * ถ้ายังไม่ได้รัน migration 25 (ไม่มีคอลัมน์) จะแค่ log เตือน ไม่ทำให้การลง/แก้ไขประกาศพัง
 */
export async function saveItemCondition(
  admin: SupabaseClient,
  itemId: string,
  condition: ItemCondition,
) {
  const { error } = await admin
    .from("item")
    .update({ item_condition: condition })
    .eq("item_id", itemId);

  if (error) {
    console.warn(
      "Cannot save item_condition (run supabase/migrations/25_item_condition.sql?):",
      error.message,
    );
  }
}
