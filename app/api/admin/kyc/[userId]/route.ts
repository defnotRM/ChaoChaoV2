import { NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await verifyAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    const { userId } = await props.params;
    if (!userId) {
      return NextResponse.json(
        { message: "กรุณาระบุรหัสผู้ใช้งาน (userId)" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { target, status, bankAccountId, rejectionReason } = body;

    if (!target || !["identity", "bank"].includes(target)) {
      return NextResponse.json(
        { message: "เป้าหมายการตรวจสอบไม่ถูกต้อง (ต้องเป็น 'identity' หรือ 'bank')" },
        { status: 400 }
      );
    }

    if (!status || !["verified", "rejected"].includes(status)) {
      return NextResponse.json(
        { message: "สถานะไม่ถูกต้อง (ต้องเป็น 'verified' หรือ 'rejected')" },
        { status: 400 }
      );
    }

    const admin = auth.admin;

    if (target === "identity") {
      const { error: updateError } = await admin
        .from("useraccount")
        .update({
          identity_verification_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error("Update identity verification error:", updateError);
        return NextResponse.json(
          { message: "อัปเดตสถานะยืนยันตัวตนไม่สำเร็จ", details: updateError.message },
          { status: 500 }
        );
      }

      // สร้างการแจ้งเตือน
      try {
        await admin.from("notification").insert({
          user_id: userId,
          type: status === "verified" ? "kyc_approved" : "kyc_rejected",
          title:
            status === "verified"
              ? "ยืนยันตัวตนสำเร็จ"
              : "การยืนยันตัวตนไม่ผ่านการอนุมัติ",
          message:
            status === "verified"
              ? "ข้อมูลบัตรประชาชนของคุณได้รับการอนุมัติเรียบร้อยแล้ว"
              : rejectionReason
              ? `การยืนยันตัวตนไม่ผ่าน: ${rejectionReason}`
              : "ข้อมูลบัตรประชาชนของคุณไม่ผ่านการอนุมัติ กรุณาตรวจสอบและอัปโหลดใหม่",
        });
      } catch (notifErr) {
        console.warn("Failed to create KYC notification:", notifErr);
      }

      return NextResponse.json({
        ok: true,
        message:
          status === "verified"
            ? "อนุมัติการยืนยันตัวตนเรียบร้อยแล้ว"
            : "ปฏิเสธการยืนยันตัวตนเรียบร้อยแล้ว",
      });
    } else {
      // target === 'bank'
      let bankUpdate = admin
        .from("bankaccount")
        .update({ verification_status: status });

      if (bankAccountId) {
        bankUpdate = bankUpdate.eq("bank_account_id", bankAccountId);
      } else {
        bankUpdate = bankUpdate.eq("user_id", userId);
      }

      const { error: bankError } = await bankUpdate;

      if (bankError) {
        console.error("Update bank verification error:", bankError);
        return NextResponse.json(
          { message: "อัปเดตสถานะบัญชีธนาคารไม่สำเร็จ", details: bankError.message },
          { status: 500 }
        );
      }

      // สร้างการแจ้งเตือน
      try {
        await admin.from("notification").insert({
          user_id: userId,
          type: status === "verified" ? "bank_approved" : "bank_rejected",
          title:
            status === "verified"
              ? "ยืนยันบัญชีธนาคารสำเร็จ"
              : "การยืนยันบัญชีธนาคารไม่ผ่าน",
          message:
            status === "verified"
              ? "บัญชีธนาคารของคุณได้รับการยืนยันเรียบร้อยแล้ว พร้อมรับรายได้จากการให้เช่า"
              : rejectionReason
              ? `การยืนยันบัญชีธนาคารไม่ผ่าน: ${rejectionReason}`
              : "ข้อมูลบัญชีธนาคารไม่ผ่านการอนุมัติ กรุณาตรวจสอบความถูกต้องและอัปเดตใหม่",
        });
      } catch (notifErr) {
        console.warn("Failed to create bank verification notification:", notifErr);
      }

      return NextResponse.json({
        ok: true,
        message:
          status === "verified"
            ? "อนุมัติบัญชีธนาคารเรียบร้อยแล้ว"
            : "ปฏิเสธบัญชีธนาคารเรียบร้อยแล้ว",
      });
    }
  } catch (error) {
    console.error("PATCH /api/admin/kyc/[userId] error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
