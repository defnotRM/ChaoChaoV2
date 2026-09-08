import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validations/login";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Validate inputs
    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    const { username, password, role } = validation.data;
    const admin = createAdminClient();

    const cleanInput = username.trim();
    const isEmail = cleanInput.includes("@");

    // 2. Lookup user profile in useraccount (strictly by username if not email)
    let query = admin
      .from("useraccount")
      .select("user_id, username, email, status");

    if (isEmail) {
      query = query.ilike("email", cleanInput);
    } else {
      query = query.ilike("username", cleanInput);
    }

    let { data: profile } = await query.maybeSingle();

    // Fallback: If not found in useraccount table, search Supabase Auth users directly
    if (!profile) {
      const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const matched = authUsers?.users?.find((u) => {
        if (isEmail) {
          return u.email?.toLowerCase() === cleanInput.toLowerCase();
        }
        return (
          u.user_metadata?.username &&
          String(u.user_metadata.username).toLowerCase() === cleanInput.toLowerCase()
        );
      });

      if (matched) {
        const uName = matched.user_metadata?.username || cleanInput;
        const uEmail = matched.email || `${uName.toLowerCase()}@chaochao.local`;
        const uNatId = matched.user_metadata?.national_id || null;

        await admin.from("useraccount").upsert(
          {
            user_id: matched.id,
            username: uName,
            email: uEmail,
            national_id: uNatId,
            status: "Active",
          },
          { onConflict: "user_id" }
        );

        profile = {
          user_id: matched.id,
          username: uName,
          email: uEmail,
          status: "Active",
        };
      }
    }

    if (!profile) {
      return NextResponse.json(
        { message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    if (profile.status === "Suspended" || profile.status === "Banned") {
      return NextResponse.json(
        { message: `บัญชีผู้ใช้ถูกระงับการใช้งาน (${profile.status})` },
        { status: 403 }
      );
    }

    // 3. Resolve user roles from user_role_assignment
    const { data: userRoles, error: roleError } = await admin
      .from("user_role_assignment")
      .select("role ( role_type )")
      .eq("user_id", profile.user_id);

    if (roleError) {
      console.error("Role lookup error:", roleError);
    }

    let assignedRoles = (userRoles || [])
      .map((item: any) => item.role?.role_type)
      .filter(Boolean);

    if (assignedRoles.length === 0) {
      // Fallback: assign renter role if missing
      const { data: defaultRole } = await admin
        .from("role")
        .select("role_id")
        .eq("role_type", "renter")
        .maybeSingle();

      if (defaultRole) {
        await admin
          .from("user_role_assignment")
          .upsert(
            { user_id: profile.user_id, role_id: defaultRole.role_id },
            { onConflict: "user_id,role_id" }
          );
      }
      assignedRoles = ["renter"];
    }

    // Auto-detect active role
    const resolvedRole =
      role && assignedRoles.includes(role)
        ? role
        : assignedRoles.includes("admin")
        ? "admin"
        : assignedRoles.includes("lender")
        ? "lender"
        : assignedRoles.includes("renter")
        ? "renter"
        : "renter";

    // 4. Authenticate using Supabase Auth (stores session in cookies via @supabase/ssr)
    const supabase = await createServerClient();
    const authRes = await supabase.auth.signInWithPassword({
      email: profile.email,
      password,
    });

    if (authRes.error || !authRes.data.user) {
      console.error("Auth sign-in error:", authRes.error);
      return NextResponse.json(
        { message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    // 5. Determine redirection path (เข้าสู่หน้าแดชบอร์ดหลักทันที)
    const redirectTo = "/dashboard";

    const response = NextResponse.json(
      {
        message: "เข้าสู่ระบบสำเร็จ",
        user: {
          id: profile.user_id,
          username: profile.username,
          role: resolvedRole,
          roles: assignedRoles,
        },
        redirectTo,
      },
      { status: 200 }
    );

    response.cookies.set("chaochao_active_role", resolvedRole, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Login route error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}