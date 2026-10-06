import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validations/register";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Validate payload with Zod
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      const firstError =
        validation.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    const {
      firstname,
      lastname,
      phone,
      email,
      username,
      password,
      nationalId,
      role,
      idCardUrl,
      idCardSelfieUrl,
      bankName,
      accountNumber,
      accountName,
    } = validation.data;
    const admin = createAdminClient();

    // 2. Check if username, national_id, or email already exists in useraccount
    const { data: existingUser, error: checkError } = await admin
      .from("useraccount")
      .select("username, national_id, email")
      .or(
        `username.eq.${username},national_id.eq.${nationalId},email.eq.${email}`,
      )
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing user:", checkError);
      return NextResponse.json(
        { message: "เกิดข้อผิดพลาดในการตรวจสอบข้อมูล" },
        { status: 500 },
      );
    }

    if (existingUser) {
      if (existingUser.username === username) {
        return NextResponse.json(
          { message: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว" },
          { status: 409 },
        );
      }
      if (existingUser.national_id === nationalId) {
        return NextResponse.json(
          { message: "เลขบัตรประชาชนนี้ถูกใช้งานแล้ว" },
          { status: 409 },
        );
      }
      if (existingUser.email === email) {
        return NextResponse.json(
          { message: "อีเมลนี้ถูกใช้งานแล้ว" },
          { status: 409 },
        );
      }
    }

    // 4. Create user in Supabase Auth
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          signup_role: role,
          role,
          national_id: nationalId,
        },
      });

    if (authError || !authData.user) {
      console.error("Error creating auth user:", authError);
      return NextResponse.json(
        { message: authError?.message || "ไม่สามารถสร้างบัญชีผู้ใช้ได้" },
        { status: 400 },
      );
    }

    const userId = authData.user.id;

    // 5. Ensure profile exists and is active in public.useraccount
    // FR-05: ผู้ให้เช่าต้องมีรูปบัตร+selfie ตั้งแต่ตอนสมัคร (validation บังคับไว้แล้ว)
    await admin.from("useraccount").upsert(
      {
        user_id: userId,
        username: username.trim(),
        email,
        national_id: nationalId,
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        phone: phone.trim(),
        status: "Active",
        ...(role === "lender"
          ? {
              id_card_url: idCardUrl,
              id_card_selfie_url: idCardSelfieUrl,
              identity_verification_status: "pending",
            }
          : {}),
      },
      { onConflict: "user_id" },
    );

    // 5b. FR-05: บันทึกบัญชีธนาคาร (เฉพาะผู้ให้เช่า)
    if (role === "lender" && bankName && accountNumber && accountName) {
      await admin.from("bankaccount").insert({
        user_id: userId,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        verification_status: "pending",
      });
    }

    // 6. Assign role in public.user_role_assignment
    const rolesToAssign = [role];

    const { data: roleRows, error: roleFetchErr } = await admin
      .from("role")
      .select("role_id, role_type")
      .in("role_type", rolesToAssign);

    if (roleFetchErr) {
      console.error("Error fetching roles:", roleFetchErr);
    } else if (roleRows && roleRows.length > 0) {
      for (const r of roleRows) {
        await admin
          .from("user_role_assignment")
          .upsert(
            { user_id: userId, role_id: r.role_id },
            { onConflict: "user_id,role_id" },
          );
      }
    }

    return NextResponse.json(
      {
        message: "สมัครสมาชิกสำเร็จ",
        user: { id: userId, username, role },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
