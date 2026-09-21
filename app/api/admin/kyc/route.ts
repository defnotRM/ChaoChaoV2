import { NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";

    const admin = auth.admin;

    // ดึงข้อมูลการยืนยันตัวตนผู้ใช้
    let userQuery = admin
      .from("useraccount")
      .select(
        "user_id, username, email, firstname, lastname, national_id, id_card_url, id_card_selfie_url, identity_verification_status, created_at, status"
      )
      .order("created_at", { ascending: false });

    if (status !== "all") {
      userQuery = userQuery.eq("identity_verification_status", status);
    }

    // ดึงข้อมูลบัญชีธนาคาร
    let bankQuery = admin
      .from("bankaccount")
      .select(
        "bank_account_id, user_id, bank_name, account_number, account_name, verification_status, created_at"
      )
      .order("created_at", { ascending: false });

    if (status !== "all") {
      bankQuery = bankQuery.eq("verification_status", status);
    }

    const [{ data: users, error: userError }, { data: bankAccounts, error: bankError }] =
      await Promise.all([userQuery, bankQuery]);

    if (userError) {
      console.error("Error fetching KYC users:", userError);
      return NextResponse.json(
        { message: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้", details: userError.message },
        { status: 500 }
      );
    }

    if (bankError) {
      console.error("Error fetching KYC bank accounts:", bankError);
      return NextResponse.json(
        { message: "เกิดข้อผิดพลาดในการดึงข้อมูลบัญชีธนาคาร", details: bankError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      users: users || [],
      bankAccounts: bankAccounts || [],
    });
  } catch (error) {
    console.error("GET /api/admin/kyc error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
