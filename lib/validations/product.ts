import { z } from "zod";

// ตรงกับ constraint ใน Item table: original_price/rental_fee_per_day/deposit >= 0
const nonNegativeNumber = z.number().min(0, "ต้องเป็นจำนวนที่ไม่ติดลบ");

export const MAX_PRODUCT_IMAGES = 10;

// วันนี้ตามเวลาไทยในรูปแบบ YYYY-MM-DD (en-CA ให้รูปแบบนี้)
// ห้ามใช้ toISOString() เพราะเป็นเวลา UTC ก่อน 07:00 น. จะได้วันที่ของเมื่อวาน
export function getTodayInBangkok(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    now,
  );
}

export function addMonthsToDate(dateStr: string, months: number) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // กันวันที่ไม่มีจริง เช่น 2026-02-31 ที่ Date จะเลื่อนไปเป็นเดือนถัดไป
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// คืนข้อความผิดพลาดของช่วงวันที่เปิดให้เช่า หรือ null ถ้าถูกต้อง
// originalStart ใช้ตอนแก้ไขประกาศเดิม: วันเริ่มเดิมที่ผ่านไปแล้วคงไว้ได้ แต่ถ้าเปลี่ยนวันเริ่มใหม่ต้องไม่ย้อนหลัง
export function getAvailabilityRangeError(
  start: string,
  end: string,
  options: { today?: string; originalStart?: string | null } = {},
) {
  const today = options.today ?? getTodayInBangkok();

  if (!isValidDateString(start) || !isValidDateString(end)) {
    return "รูปแบบวันที่ไม่ถูกต้อง";
  }
  if (start < today && start !== options.originalStart) {
    return "วันที่เริ่มต้นเปิดให้เช่าต้องไม่ย้อนหลัง";
  }
  if (end < start) {
    return "วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่มต้นเปิดให้เช่า";
  }
  if (end < today) {
    return "วันที่สิ้นสุดเปิดให้เช่าต้องไม่ย้อนหลัง";
  }
  return null;
}

// ตรงกับ CHECK constraint ของ item.item_condition (migration 25)
const itemCondition = z.enum(["like-new", "good", "fair"], {
  message: "กรุณาเลือกสภาพการใช้งานของอุปกรณ์",
});

export const createProductSchema = z.object({
  categoryId: z.string().nullish(),
  itemName: z
    .string()
    .min(1, "กรุณากรอกชื่อสินค้า")
    .max(200, "ชื่อสินค้าต้องไม่เกิน 200 ตัวอักษร"),
  description: z.string().max(2000).nullish().default(""),
  originalPrice: nonNegativeNumber.nullish(),
  rentalFeePerDay: nonNegativeNumber,
  deposit: nonNegativeNumber,
  condition: itemCondition.optional().default("good"),
  images: z
    .array(
      z.object({
        imageUrl: z.string().min(1, "URL รูปไม่ถูกต้อง"),
        isPrimary: z.boolean().nullish().default(false),
        sequence: z.number().int().nullish(),
      }),
    )
    .max(MAX_PRODUCT_IMAGES, `อัปโหลดรูปภาพได้ไม่เกิน ${MAX_PRODUCT_IMAGES} รูป`)
    .nullish()
    .default([]),
  locations: z
    .array(
      z.object({
        description: z.string().nullish(),
        no: z.string().nullish(),
        alley: z.string().nullish(),
        road: z.string().nullish(),
        subdistrict: z.string().nullish(),
        district: z.string().nullish(),
        province: z.string().nullish(),
        location_type: z.enum(["meetup", "return", "both"]).nullish(),
      }),
    )
    .min(1, "ต้องระบุตำแหน่งสินค้าอย่างน้อย 1 ที่"),
  availabilityStart: z.string().min(1, "รูปแบบวันที่ไม่ถูกต้อง"),
  availabilityEnd: z.string().min(1, "รูปแบบวันที่ไม่ถูกต้อง"),
  conditions: z.array(z.string()).nullish().default([]),
}).superRefine((data, ctx) => {
  const dateError = getAvailabilityRangeError(
    data.availabilityStart,
    data.availabilityEnd,
  );
  if (dateError) {
    ctx.addIssue({
      code: "custom",
      path: ["availabilityStart"],
      message: dateError,
    });
  }
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  categoryId: z.string().nullish(),
  itemName: z.string().min(1).max(200).nullish(),
  description: z.string().max(2000).nullish(),
  originalPrice: nonNegativeNumber.nullish(),
  rentalFeePerDay: nonNegativeNumber.nullish(),
  deposit: nonNegativeNumber.nullish(),
  status: z.enum(["available", "rented", "maintenance", "inactive"]).optional(),
  condition: itemCondition.optional(),
  images: z
    .array(
      z.object({
        imageUrl: z.string().min(1),
        isPrimary: z.boolean().nullish().default(false),
        sequence: z.number().int().nullish(),
      }),
    )
    .max(MAX_PRODUCT_IMAGES, `อัปโหลดรูปภาพได้ไม่เกิน ${MAX_PRODUCT_IMAGES} รูป`)
    .nullish(),
  locations: z
    .array(
      z.object({
        description: z.string().nullish(),
        no: z.string().nullish(),
        alley: z.string().nullish(),
        road: z.string().nullish(),
        subdistrict: z.string().nullish(),
        district: z.string().nullish(),
        province: z.string().nullish(),
        location_type: z.enum(["meetup", "return", "both"]).nullish(),
      }),
    )
    .nullish(),
  availabilityStart: z.string().nullish(),
  availabilityEnd: z.string().nullish(),
  conditions: z.array(z.string()).nullish(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// query params ตอน list/search/filter สินค้า
export const listProductsQuerySchema = z.object({
  q: z.string().optional(), // full-text search บน item_name/description
  categoryId: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  province: z.string().optional(),
  status: z
    .enum(["available", "rented", "maintenance", "inactive"])
    .optional()
    .default("available"),
  sort: z
    .enum(["newest", "price_asc", "price_desc"])
    .optional()
    .default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
