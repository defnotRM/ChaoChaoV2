import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { message: "กรุณาเข้าสู่ระบบก่อน" },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const { data: bank } = await admin
    .from("bankaccount")
    .select("bank_name, account_number, account_name, verification_status")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ bank: bank || null });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อน" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const bankName: string = (body.bankName || "").trim();
    const accountNumber: string = (body.accountNumber || "").trim();
    const accountName: string = (body.accountName || "").trim();

    if (!bankName || !accountNumber || !accountName) {
      return NextResponse.json(
        { message: "กรุณากรอกข้อมูลบัญชีธนาคารให้ครบ" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // FR-07: เปลี่ยนบัญชีธนาคารเมื่อไหร่ ต้องให้แอดมินตรวจสอบตัวตนใหม่เสมอ
    const { data: existing } = await admin
      .from("bankaccount")
      .select("bank_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await admin
        .from("bankaccount")
        .update({
          bank_name: bankName,
          account_number: accountNumber,
          account_name: accountName,
          verification_status: "pending",
        })
        .eq("bank_account_id", existing.bank_account_id);
    } else {
      await admin.from("bankaccount").insert({
        user_id: user.id,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        verification_status: "pending",
      });
    }

    return NextResponse.json({
      ok: true,
      message: "บันทึกบัญชีธนาคารแล้ว รอแอดมินตรวจสอบยืนยันตัวตนใหม่",
    });
  } catch (error) {
    console.error("POST /api/profile/bank-account error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
