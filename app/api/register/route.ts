import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validations/register";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToStorage } from "@/lib/storage";

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

    const { username, password, nationalId, role } = validation.data;
    const admin = createAdminClient();

    // 2. Check if username or national_id already exists in useraccount
    const { data: existingUser, error: checkError } = await admin
      .from("useraccount")
      .select("username, national_id")
      .or(`username.eq.${username},national_id.eq.${nationalId}`)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing user:", checkError);
      return NextResponse.json(
        { message: "เกิดข้อผิดพลาดในการตรวจสอบข้อมูล" },
        { status: 500 }
      );
    }

    if (existingUser) {
      if (existingUser.username === username) {
        return NextResponse.json(
          { message: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว" },
          { status: 409 }
        );
      }
      if (existingUser.national_id === nationalId) {
        return NextResponse.json(
          { message: "เลขบัตรประชาชนนี้ถูกใช้งานแล้ว" },
          { status: 409 }
        );
      }
    }

    // 3. Derive deterministic email identifier for Supabase Auth
    const email = `${username.toLowerCase().trim()}@chaochao.local`;

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
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    // 4.1 Process Avatar and KYC image uploads if provided
    let finalAvatarUrl: string | null = null;
    let finalIdCardUrl: string | null = null;
    let finalSelfieUrl: string | null = null;

    if (body.avatarImageUrl) {
      try {
        const res = await uploadToStorage("avatars", userId, body.avatarImageUrl, {
          fileName: `avatar_${Date.now()}.png`,
        });
        finalAvatarUrl = res.publicUrl;
      } catch (err) {
        console.warn("Error uploading avatarImageUrl during registration:", err);
      }
    }

    if (body.idCardImageUrl) {
      try {
        const res = await uploadToStorage("kyc", userId, body.idCardImageUrl, {
          fileName: `id_card_${Date.now()}.png`,
        });
        finalIdCardUrl = res.publicUrl;
      } catch (err) {
        console.warn("Error uploading idCardImageUrl during registration:", err);
      }
    }

    if (body.idCardSelfieImageUrl) {
      try {
        const res = await uploadToStorage("kyc", userId, body.idCardSelfieImageUrl, {
          fileName: `selfie_${Date.now()}.png`,
        });
        finalSelfieUrl = res.publicUrl;
      } catch (err) {
        console.warn("Error uploading idCardSelfieImageUrl during registration:", err);
      }
    }

    // 5. Ensure profile exists and is active in public.useraccount
    await admin
      .from("useraccount")
      .upsert(
        {
          user_id: userId,
          username: username.trim(),
          email,
          national_id: nationalId,
          avatar_url: finalAvatarUrl,
          id_card_url: finalIdCardUrl,
          id_card_selfie_url: finalSelfieUrl,
          identity_verification_status: (finalIdCardUrl && finalSelfieUrl) ? "pending" : "unverified",
          status: "Active",
        },
        { onConflict: "user_id" }
      );

    if (finalAvatarUrl) {
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(authData.user.user_metadata || {}),
          avatar_url: finalAvatarUrl,
        },
      });
    }

    // 6. Assign roles in public.user_role_assignment
    const rolesToAssign =
      role === "both" ? ["renter", "lender"] : [role];

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
            { onConflict: "user_id,role_id" }
          );
      }
    }

    // 7. Save bank account if provided (for lenders)
    if (body.bankName && body.accountNumber && body.accountName) {
      try {
        await admin.from("bankaccount").upsert(
          {
            user_id: userId,
            bank_name: String(body.bankName).trim(),
            account_number: String(body.accountNumber).trim(),
            account_name: String(body.accountName).trim(),
            verification_status: "pending",
          },
          { onConflict: "user_id,account_number" }
        );
      } catch (bankErr) {
        console.warn("Error inserting bank account during registration:", bankErr);
      }
    }

    return NextResponse.json(
      {
        message: "สมัครสมาชิกสำเร็จ",
        user: { id: userId, username, role },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}