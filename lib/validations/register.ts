import { z } from "zod";

export const registerSchema = z
  .object({
    firstname: z
      .string()
      .trim()
      .min(1, "กรุณากรอกชื่อจริง")
      .max(100, "ชื่อจริงต้องไม่เกิน 100 ตัวอักษร"),

    lastname: z
      .string()
      .trim()
      .min(1, "กรุณากรอกนามสกุล")
      .max(100, "นามสกุลต้องไม่เกิน 100 ตัวอักษร"),

    username: z
      .string()
      .trim()
      .min(4, "ชื่อผู้ใช้ต้องมีอย่างน้อย 4 ตัวอักษร")
      .max(20, "ชื่อผู้ใช้ต้องไม่เกิน 20 ตัวอักษร")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษร a-z, A-Z, 0-9 และ _"
      ),

    phone: z
      .string()
      .trim()
      .regex(/^0\d{9}$/, "เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก (เช่น 0812345678)"),

    email: z
      .string()
      .trim()
      .min(1, "กรุณากรอกอีเมล")
      .email("รูปแบบอีเมลไม่ถูกต้อง"),

    password: z
      .string()
      .min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
      .regex(/[A-Z]/, "รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว")
      .regex(/[a-z]/, "รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว")
      .regex(/[0-9]/, "รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว"),

    nationalId: z
      .string()
      .length(13, "เลขบัตรประชาชนต้องมี 13 หลัก")
      .regex(/^\d+$/, "เลขบัตรประชาชนต้องเป็นตัวเลขเท่านั้น"),

    role: z.enum(["lender", "renter", "both"], {
      message: "กรุณาเลือกประเภทผู้ใช้งาน",
    }),

    avatarImageUrl: z.string().optional(),
    idCardImageUrl: z.string().optional(),
    idCardSelfieImageUrl: z.string().optional(),
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    accountName: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "lender" || data.role === "both") {
      if (!data.idCardImageUrl || !data.idCardImageUrl.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["idCardImageUrl"],
          message: "กรุณาอัปโหลดภาพถ่ายบัตรประชาชน",
        });
      }
      if (!data.idCardSelfieImageUrl || !data.idCardSelfieImageUrl.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["idCardSelfieImageUrl"],
          message: "กรุณาอัปโหลดภาพถ่ายคู่กับบัตรประชาชน",
        });
      }
      if (!data.bankName || !data.bankName.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bankName"],
          message: "กรุณาเลือกธนาคาร",
        });
      }
      if (
        !data.accountNumber ||
        !/^\d{8,15}$/.test(data.accountNumber.trim())
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["accountNumber"],
          message: "กรุณากรอกเลขที่บัญชีธนาคาร (ตัวเลข 8-15 หลัก)",
        });
      }
      if (!data.accountName || !data.accountName.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["accountName"],
          message: "กรุณากรอกชื่อบัญชีธนาคาร",
        });
      }
    }
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

// ใช้แสดงผลเป็นภาษาไทยใน UI
export const roleLabels: Record<RegisterFormData["role"], string> = {
  renter: "ผู้เช่า",
  lender: "ผู้ให้เช่า",
  both: "ทั้งผู้เช่าและผู้ให้เช่า",
};
