import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const idCardFile = formData.get("idCard") as File | null;
    const selfieFile = formData.get("selfie") as File | null;
    const nationalId = (formData.get("nationalId") as string)?.trim();
    const bankName = (formData.get("bankName") as string)?.trim();
    const accountNumber = (formData.get("accountNumber") as string)?.trim();
    const accountName = (formData.get("accountName") as string)?.trim();
    const requestLenderRole = formData.get("requestLenderRole") === "true";

    const admin = createAdminClient();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (nationalId) {
      updates.national_id = nationalId;
    }

    if (idCardFile && idCardFile.size > 0) {
      const ext = idCardFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const res = await uploadToStorage("kyc", user.id, idCardFile, {
        fileName: `id_card_${Date.now()}.${ext}`,
        contentType: idCardFile.type || "image/jpeg",
      });
      updates.id_card_url = res.publicUrl;
      updates.identity_verification_status = "pending";
    }

    if (selfieFile && selfieFile.size > 0) {
      const ext = selfieFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const res = await uploadToStorage("kyc", user.id, selfieFile, {
        fileName: `selfie_${Date.now()}.${ext}`,
        contentType: selfieFile.type || "image/jpeg",
      });
      updates.id_card_selfie_url = res.publicUrl;
      updates.identity_verification_status = "pending";
    }

    if (Object.keys(updates).length > 1) {
      await admin
        .from("useraccount")
        .update(updates)
        .eq("user_id", user.id);
    }

    // Update bank account if provided
    if (bankName && accountNumber && accountName) {
      const { data: existingBank } = await admin
        .from("bankaccount")
        .select("bank_account_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingBank) {
        await admin
          .from("bankaccount")
          .update({
            bank_name: bankName,
            account_number: accountNumber,
            account_name: accountName,
            verification_status: "pending",
          })
          .eq("bank_account_id", existingBank.bank_account_id);
      } else {
        await admin.from("bankaccount").insert({
          user_id: user.id,
          bank_name: bankName,
          account_number: accountNumber,
          account_name: accountName,
          verification_status: "pending",
        });
      }
    }

    if (requestLenderRole) {
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata || {}),
          pending_lender_role_upgrade: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: requestLenderRole
        ? "ส่งข้อมูลยืนยันตัวตนเพื่อสมัครบทบาทผู้ให้เช่าเพิ่มเรียบร้อยแล้ว รอแอดมินตรวจสอบตัวตน"
        : "ส่งข้อมูลยืนยันตัวตนเรียบร้อยแล้ว รอการตรวจสอบจากผู้ดูแลระบบ",
    });
  } catch (error: any) {
    console.error("KYC upload error:", error);
    return NextResponse.json(
      { message: error?.message || "เกิดข้อผิดพลาดในการส่งข้อมูลยืนยันตัวตน" },
      { status: 500 }
    );
  }
}
