import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const targetRole: string = body.targetRole; // "renter" | "lender"
    const idCardUrl: string | undefined = body.idCardUrl;
    const idCardSelfieUrl: string | undefined = body.idCardSelfieUrl;
    const bankName: string | undefined = body.bankName;
    const accountNumber: string | undefined = body.accountNumber;
    const accountName: string | undefined = body.accountName;

    if (targetRole !== "renter" && targetRole !== "lender") {
      return NextResponse.json({ message: "role ไม่ถูกต้อง" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: roleRow } = await admin
      .from("role")
      .select("role_id")
      .eq("role_type", targetRole)
      .maybeSingle();

    if (!roleRow) {
      return NextResponse.json(
        { message: "ไม่พบ role นี้ในระบบ" },
        { status: 500 },
      );
    }

    const { data: existing } = await admin
      .from("user_role_assignment")
      .select("role_id")
      .eq("user_id", user.id)
      .eq("role_id", roleRow.role_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { message: "คุณมีบทบาทนี้อยู่แล้ว" },
        { status: 400 },
      );
    }

    // FR-06: เช็คว่าบัญชีนี้มีข้อมูลบัตร+selfie+บัญชีธนาคารครบแล้วหรือยัง
    const { data: account } = await admin
      .from("useraccount")
      .select("id_card_url, id_card_selfie_url")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: existingBank } = await admin
      .from("bankaccount")
      .select("bank_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const hasCompleteData =
      !!account?.id_card_url && !!account?.id_card_selfie_url && !!existingBank;

    if (!hasCompleteData) {
      // ยังไม่มีข้อมูลครบ ต้องกรอกส่วนที่หายไปก่อน
      if (
        !idCardUrl ||
        !idCardSelfieUrl ||
        !bankName ||
        !accountNumber ||
        !accountName
      ) {
        return NextResponse.json(
          {
            needsKyc: true,
            message: "กรุณากรอกข้อมูลยืนยันตัวตนและบัญชีธนาคารให้ครบก่อน",
          },
          { status: 400 },
        );
      }

      await admin
        .from("useraccount")
        .update({
          id_card_url: idCardUrl,
          id_card_selfie_url: idCardSelfieUrl,
          identity_verification_status: "pending",
        })
        .eq("user_id", user.id);

      await admin.from("bankaccount").insert({
        user_id: user.id,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        verification_status: "pending",
      });
    }

    await admin.from("user_role_assignment").insert({
      user_id: user.id,
      role_id: roleRow.role_id,
    });

    return NextResponse.json({
      ok: true,
      message: hasCompleteData
        ? "สมัครบทบาทเรียบร้อยแล้ว"
        : "บันทึกข้อมูลและสมัครบทบาทเรียบร้อยแล้ว รอแอดมินตรวจสอบเอกสาร",
    });
  } catch (error) {
    console.error("POST /api/profile/add-role error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
