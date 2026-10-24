import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
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

    const body = await request.json().catch(() => ({}));
    const targetRole = body?.targetRole as "renter" | "lender" | undefined;

    if (targetRole !== "renter" && targetRole !== "lender") {
      return NextResponse.json(
        { message: "บทบาทที่ต้องการสมัครไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // หากผู้เช่าต้องการสมัครบทบาทผู้ให้เช่าเพิ่ม (FR-02 / FR-06)
    if (targetRole === "lender") {
      const [{ data: profile }, { data: bankAccount }] = await Promise.all([
        admin
          .from("useraccount")
          .select(
            "id_card_url, id_card_selfie_url, identity_verification_status"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        admin
          .from("bankaccount")
          .select(
            "bank_account_id, bank_name, account_number, account_name, verification_status"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const missingIdCard = !profile?.id_card_url;
      const missingSelfie = !profile?.id_card_selfie_url;
      const missingBank =
        !bankAccount?.bank_name ||
        !bankAccount?.account_number ||
        !bankAccount?.account_name;

      const isRejected =
        profile?.identity_verification_status === "rejected" ||
        bankAccount?.verification_status === "rejected";

      if (missingIdCard || missingSelfie || missingBank || isRejected) {
        return NextResponse.json(
          {
            code: "KYC_MISSING",
            missing: {
              idCard: missingIdCard,
              selfie: missingSelfie,
              bankAccount: missingBank,
            },
            message:
              "กรุณาลงทะเบียนข้อมูลที่ยังไม่ครบ ได้แก่ รูปถ่ายบัตรประชาชน รูปถ่ายบุคคลคู่กับบัตรประชาชน และบัญชีธนาคาร เพื่อให้แอดมินตรวจสอบตัวตนก่อนสมัครบทบาทผู้ให้เช่า",
          },
          { status: 400 }
        );
      }

      const isIdentityVerified =
        profile?.identity_verification_status === "verified";
      const isBankVerified = bankAccount?.verification_status === "verified";

      if (!isIdentityVerified || !isBankVerified) {
        if (profile?.identity_verification_status === "unverified") {
          await admin
            .from("useraccount")
            .update({
              identity_verification_status: "pending",
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id);
        }

        await admin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...(user.user_metadata || {}),
            pending_lender_role_upgrade: true,
          },
        });

        return NextResponse.json(
          {
            code: "KYC_PENDING_ADMIN",
            message:
              "ตรวจสอบพบข้อมูลรูปถ่ายบัตรประชาชน รูปคู่บัตรประชาชน และบัญชีธนาคารครบถ้วนแล้ว ระบบได้ส่งคำขอให้แอดมินตรวจสอบตัวตน เมื่อแอดมินอนุมัติแล้วระบบจะเปิดบทบาทผู้ให้เช่าให้ทันที",
          },
          { status: 202 }
        );
      }
    }

    // Assign role in user_role_assignment
    const { data: roleRow } = await admin
      .from("role")
      .select("role_id, role_type")
      .eq("role_type", targetRole)
      .maybeSingle();

    if (!roleRow) {
      return NextResponse.json(
        { message: "ไม่พบบทบาทในระบบ" },
        { status: 404 }
      );
    }

    await admin
      .from("user_role_assignment")
      .upsert(
        { user_id: user.id, role_id: roleRow.role_id },
        { onConflict: "user_id,role_id" }
      );

    // Fetch updated roles
    const [{ data: roleAssignments }, { data: allRoles }] = await Promise.all([
      admin
        .from("user_role_assignment")
        .select("role_id")
        .eq("user_id", user.id),
      admin.from("role").select("role_id, role_type"),
    ]);

    const roleTypeById = new Map<string, string>();
    (allRoles || []).forEach((r) => {
      roleTypeById.set(r.role_id, r.role_type);
    });

    const updatedRoles = (roleAssignments || [])
      .map((ra: any) => roleTypeById.get(ra.role_id))
      .filter((r): r is string => Boolean(r));

    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata || {}),
        role:
          updatedRoles.includes("renter") && updatedRoles.includes("lender")
            ? "both"
            : targetRole,
        pending_lender_role_upgrade: false,
      },
    });

    return NextResponse.json({
      code: "ROLE_ADDED",
      roles: updatedRoles,
      message:
        targetRole === "lender"
          ? "สมัครบทบาทผู้ให้เช่าเพิ่มเรียบร้อยแล้ว!"
          : "สมัครบทบาทผู้เช่าเพิ่มเรียบร้อยแล้ว!",
    });
  } catch (error) {
    console.error("POST /api/profile/roles error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการสมัครบทบาทเพิ่ม" },
      { status: 500 }
    );
  }
}
