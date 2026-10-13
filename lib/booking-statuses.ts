// สถานะออเดอร์ที่ "กันคิว" สินค้า ต้องตรงกับ EXCLUDE constraint
// no_overlapping_active_bookings บนตาราง rentalorder (ดู supabase/setup/full_install.sql)
// ถ้าสถานะในรายการนี้ไม่ตรงกับ constraint ฐานข้อมูลจะปฏิเสธการอนุมัติทั้งที่หน้าจอบอกว่าวันว่าง
export const BOOKING_BLOCKING_STATUSES = [
  "awaiting_payment",
  "paid",
  "item_sent",
  "item_received",
  "item_returned",
  "awaiting_additional_payment",
  "disputed_at_meetup",
] as const;
