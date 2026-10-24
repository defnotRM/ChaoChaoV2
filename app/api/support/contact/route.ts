import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();
    const { name, email, phone, category, subject, message } = body;

    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json(
        { message: "กรุณาระบุหัวข้อเรื่องและรายละเอียดของปัญหา" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Query admin user IDs
    const { data: adminRoles } = await admin
      .from("user_role_assignment")
      .select("user_id, role!inner(role_type)")
      .eq("role.role_type", "admin");

    const adminUserIds = (adminRoles || []).map((r: any) => r.user_id);
    const targetAdmins =
      adminUserIds.length > 0
        ? adminUserIds
        : ["c6290b79-7197-4c19-945e-f481b7d77819"];

    const contactInfo = [
      name ? `ชื่อ: ${name}` : null,
      email ? `อีเมล: ${email}` : null,
      phone ? `เบอร์: ${phone}` : null,
      user?.id ? `User ID: ${user.id}` : "ไม่ได้เข้าสู่ระบบ",
    ]
      .filter(Boolean)
      .join(" | ");

    const categoryLabel =
      category === "payment"
        ? "การชำระเงิน/เงินประกัน"
        : category === "account"
        ? "บัญชี/การยืนยันตัวตน (KYC)"
        : category === "dispute"
        ? "ข้อพิพาทการเช่า"
        : category === "bug"
        ? "แจ้งบั๊ก/ปัญหาการใช้งาน"
        : "ติดต่อทั่วไป";

    const notifInserts = targetAdmins.map((adminId) => ({
      user_id: adminId,
      type: "support_inquiry",
      title: `[แจ้งปัญหา: ${categoryLabel}] ${subject.slice(0, 50)}`,
      message: `${message}\n\nผู้ติดต่อ: ${contactInfo}`,
      related_order_id: null,
    }));

    await admin.from("notification").insert(notifInserts);

    return NextResponse.json({
      success: true,
      message: "ส่งข้อมูลถึงทีมงานผู้ดูแลระบบเรียบร้อยแล้ว",
    });
  } catch (err: any) {
    console.error("Support contact error:", err);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
