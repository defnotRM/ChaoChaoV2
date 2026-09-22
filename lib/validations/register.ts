import { z } from "zod";

export const registerSchema = z
  .object({
    firstname: z.string().min(1, "กรุณากรอกชื่อ").max(50, "ชื่อยาวเกินไป"),
    lastname: z.string().min(1, "กรุณากรอกนามสกุล").max(50, "นามสกุลยาวเกินไป"),
    phone: z
      .string()
      .regex(/^0\d{9}$/, "เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0"),
    email: z.string().email("รูปแบบอีเมลไม่ถูกต้อง"),

    username: z
      .string()
      .min(4, "ชื่อผู้ใช้ต้องมีอย่างน้อย 4 ตัวอักษร")
      .max(20, "ชื่อผู้ใช้ต้องไม่เกิน 20 ตัวอักษร")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษร a-z, A-Z, 0-9 และ _",
      ),

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

    role: z.enum(["lender", "renter"], {
      message: "กรุณาเลือกประเภทผู้ใช้งาน",
    }),

    // FR-05: บังคับเฉพาะตอนสมัครเป็นผู้ให้เช่า (เช็คจริงใน superRefine ด้านล่าง)
    idCardUrl: z.string().nullish(),
    idCardSelfieUrl: z.string().nullish(),
    bankName: z.string().nullish(),
    accountNumber: z.string().nullish(),
    accountName: z.string().nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== "lender") return;

    if (!data.idCardUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["idCardUrl"],
        message: "กรุณาแนบรูปบัตรประชาชน",
      });
    }
    if (!data.idCardSelfieUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["idCardSelfieUrl"],
        message: "กรุณาแนบรูปถ่ายคู่บัตรประชาชน",
      });
    }
    if (!data.bankName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankName"],
        message: "กรุณาระบุธนาคาร",
      });
    }
    if (!data.accountNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountNumber"],
        message: "กรุณาระบุเลขบัญชี",
      });
    }
    if (!data.accountName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountName"],
        message: "กรุณาระบุชื่อบัญชี",
      });
    }
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

// ใช้แสดงผลเป็นภาษาไทยใน UI
export const roleLabels: Record<RegisterFormData["role"], string> = {
  renter: "ผู้เช่า",
  lender: "ผู้ให้เช่า",
};
