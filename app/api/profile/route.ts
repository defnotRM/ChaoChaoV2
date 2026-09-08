import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateProfileSchema = z.object({
  username: z
    .string()
    .min(4, "ชื่อผู้ใช้ต้องมีอย่างน้อย 4 ตัวอักษร")
    .max(20, "ชื่อผู้ใช้ต้องไม่เกิน 20 ตัวอักษร")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษร a-z, A-Z, 0-9 และ _"
    ),
  bio: z.string().max(500, "ประวัติย่อต้องไม่เกิน 500 ตัวอักษร").optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  bannerUrl: z.string().optional().nullable(),
  phones: z
    .array(
      z
        .string()
        .max(10, "เบอร์โทรศัพท์ต้องไม่เกิน 10 หลัก")
    )
    .max(2, "สามารถใส่เบอร์โทรศัพท์ได้สูงสุด 2 เบอร์")
    .optional()
    .nullable(),
  password: z
    .string()
    .min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
    .regex(/[A-Z]/, "รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว")
    .regex(/[a-z]/, "รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว")
    .regex(/[0-9]/, "รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export async function GET() {
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

    const admin = createAdminClient();

    const [profileRes, roleAssignmentsRes, allRolesRes, phonesRes] = await Promise.all([
      admin
        .from("useraccount")
        .select(
          "user_id, username, email, national_id, bio, avatar_url, banner_url, updated_at, status, created_at"
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("user_role_assignment")
        .select("role_id")
        .eq("user_id", user.id),
      admin.from("role").select("role_id, role_type"),
      admin
        .from("userphones")
        .select("phone")
        .eq("user_id", user.id),
    ]);

    let profile = profileRes.data;
    if (!profile) {
      const uName = user.user_metadata?.username || user.email?.split("@")[0] || "ผู้ใช้งาน";
      const uEmail = user.email || `${uName.toLowerCase()}@chaochao.local`;
      const uNatId = user.user_metadata?.national_id || null;

      await admin.from("useraccount").upsert(
        {
          user_id: user.id,
          username: uName,
          email: uEmail,
          national_id: uNatId,
          status: "Active",
        },
        { onConflict: "user_id" }
      );

      profile = {
        user_id: user.id,
        username: uName,
        email: uEmail,
        national_id: uNatId,
        bio: "",
        avatar_url: null,
        banner_url: null,
        updated_at: new Date().toISOString(),
        status: "Active",
        created_at: new Date().toISOString(),
      };
    }

    const roleTypeById = new Map<string, string>();
    (allRolesRes.data || []).forEach((r) => {
      roleTypeById.set(r.role_id, r.role_type);
    });

    let roles = (roleAssignmentsRes.data || [])
      .map((ra: any) => roleTypeById.get(ra.role_id))
      .filter((r): r is string => Boolean(r));

    if (roles.length === 0) {
      const uRole = user.user_metadata?.signup_role || user.user_metadata?.role || "renter";
      roles = uRole === "both" ? ["renter", "lender"] : [uRole];
    }

    const phones = (phonesRes.data || [])
      .map((p: any) => p.phone)
      .filter(Boolean);

    const v = profile.updated_at
      ? new Date(profile.updated_at).getTime()
      : Date.now();

    const avatarUrl = profile.avatar_url || "";
    const bannerUrl = profile.banner_url || "";

    return NextResponse.json({
      user: {
        id: profile.user_id,
        username: profile.username,
        email: profile.email,
        nationalId: profile.national_id,
        bio: profile.bio ?? "",
        avatarUrl,
        bannerUrl,
        phones,
        status: profile.status,
        roles,
        createdAt: profile.created_at,
      },
    });
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการดึงข้อมูลโปรไฟล์" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
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

    const body = await request.json();
    const validation = updateProfileSchema.safeParse(body);

    if (!validation.success) {
      const firstError =
        validation.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    const { username, bio, avatarUrl, bannerUrl, phones, password } = validation.data;
    const admin = createAdminClient();

    // 1. Check if new username is already taken by another user
    const { data: existingUser } = await admin
      .from("useraccount")
      .select("user_id")
      .eq("username", username)
      .neq("user_id", user.id)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { message: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น" },
        { status: 409 }
      );
    }

    const newEmail = `${username.toLowerCase().trim()}@chaochao.local`;

    // 2. Update useraccount (username & email & bio & avatar_url & banner_url)
    const updateData: Record<string, any> = {
      username,
      email: newEmail,
      bio: bio ?? "",
      updated_at: new Date().toISOString(),
    };
    if (avatarUrl === "") {
      updateData.avatar_url = null;
    } else if (avatarUrl && avatarUrl.startsWith("data:")) {
      updateData.avatar_url = avatarUrl;
    }
    if (bannerUrl === "") {
      updateData.banner_url = null;
    } else if (bannerUrl && bannerUrl.startsWith("data:")) {
      updateData.banner_url = bannerUrl;
    }

    const { error: updateError } = await admin
      .from("useraccount")
      .update(updateData)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Profile update error:", updateError);
      return NextResponse.json(
        { message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" },
        { status: 500 }
      );
    }

    // 3. Update userphones (Max 2 phone numbers, or 0/1)
    let updatedPhones: string[] = [];
    if (phones !== undefined && phones !== null) {
      const cleanPhones = Array.from(
        new Set(
          phones
            .map((p) => p.replace(/\D/g, "").slice(0, 10))
            .filter((p) => p.length === 10)
        )
      ).slice(0, 2);

      // Delete existing phones for this user
      await admin.from("userphones").delete().eq("user_id", user.id);

      // Insert new phone numbers (if any)
      if (cleanPhones.length > 0) {
        const phoneRows = cleanPhones.map((phone) => ({
          user_id: user.id,
          phone,
        }));
        const { error: phoneInsertError } = await admin
          .from("userphones")
          .insert(phoneRows);

        if (phoneInsertError) {
          console.error("userphones insert error:", phoneInsertError);
        }
      }
      updatedPhones = cleanPhones;
    } else {
      const { data: currentPhones } = await admin
        .from("userphones")
        .select("phone")
        .eq("user_id", user.id);
      updatedPhones = (currentPhones || []).map((p: any) => p.phone).filter(Boolean);
    }

    // 4. Update auth.users email and metadata
    const userMetadata = {
      ...(user.user_metadata || {}),
      username,
      avatar_url:
        avatarUrl === ""
          ? null
          : avatarUrl
          ? `/api/avatar?id=${user.id}`
          : user.user_metadata?.avatar_url,
    };

    const authUpdatePayload: any = {
      email: newEmail,
      email_confirm: true,
      user_metadata: userMetadata,
    };

    if (password && password.trim().length >= 8) {
      authUpdatePayload.password = password.trim();
    }

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(
      user.id,
      authUpdatePayload
    );

    if (authUpdateError) {
      console.error("Auth update error:", authUpdateError);
    }

    const now = Date.now();
    return NextResponse.json({
      message: "บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว",
      user: {
        id: user.id,
        username,
        bio: bio ?? "",
        phones: updatedPhones,
        avatarUrl: avatarUrl === "" ? "" : (avatarUrl || updateData.avatar_url || ""),
        bannerUrl: bannerUrl === "" ? "" : (bannerUrl || updateData.banner_url || ""),
      },
    });
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
