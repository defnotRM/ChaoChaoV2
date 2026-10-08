// user_metadata ของ Supabase Auth ผู้ใช้แก้ไขเองได้ (ทั้งตอนสมัครและ updateUser)
// จึงห้ามเชื่อค่า role ในนั้นเป็นสิทธิ์จริง ให้ใช้เฉพาะ renter / lender เป็นค่าแสดงผลหรือค่าเริ่มต้นเท่านั้น
// สิทธิ์ admin ต้องมาจากตาราง user_role_assignment เท่านั้น
export type SelfAssignableRole = "renter" | "lender";

export function rolesFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): SelfAssignableRole[] {
  const raw = metadata?.signup_role ?? metadata?.role;
  if (raw === "both") return ["renter", "lender"];
  if (raw === "lender") return ["lender"];
  return ["renter"];
}
