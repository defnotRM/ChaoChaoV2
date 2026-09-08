import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ user: null });
    }

    const admin = createAdminClient();
    let { data: profile } = await admin
      .from("useraccount")
      .select("username, email, avatar_url, updated_at, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      const uName = user.user_metadata?.username || user.email?.split("@")[0] || "ผู้ใช้งาน";
      const uEmail = user.email || `${uName}@chaochao.local`;
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

      const uRole = user.user_metadata?.signup_role || user.user_metadata?.role || "renter";
      const rolesToAssign = uRole === "both" ? ["renter", "lender"] : [uRole];
      const { data: roleRows } = await admin
        .from("role")
        .select("role_id, role_type")
        .in("role_type", rolesToAssign);

      if (roleRows && roleRows.length > 0) {
        for (const r of roleRows) {
          await admin.from("user_role_assignment").upsert(
            { user_id: user.id, role_id: r.role_id },
            { onConflict: "user_id,role_id" }
          );
        }
      }

      profile = {
        username: uName,
        email: uEmail,
        avatar_url: null,
        updated_at: new Date().toISOString(),
        status: "Active",
      };
    }

    const [{ data: userRoles }, { data: allRoles }] = await Promise.all([
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

    let roles = (userRoles || [])
      .map((r: any) => roleTypeById.get(r.role_id))
      .filter((r): r is string => Boolean(r));

    if (roles.length === 0) {
      const uRole = user.user_metadata?.signup_role || user.user_metadata?.role || "renter";
      roles = uRole === "both" ? ["renter", "lender"] : [uRole];
    }

    const cookieStore = await cookies();
    const activeRoleCookie = cookieStore.get("chaochao_active_role")?.value;

    const role =
      activeRoleCookie && (roles.includes(activeRoleCookie) || activeRoleCookie === "admin")
        ? activeRoleCookie
        : roles.includes("admin")
        ? "admin"
        : roles.includes("lender")
        ? "lender"
        : roles.includes("renter")
        ? "renter"
        : user.user_metadata?.role || "renter";

    const avatarUrl = profile?.avatar_url || null;

    return NextResponse.json({
      user: {
        id: user.id,
        username:
          profile?.username ||
          user.user_metadata?.username ||
          user.email?.split("@")[0] ||
          "ผู้ใช้งาน",
        avatarUrl,
        role,
        roles,
      },
    });
  } catch (error) {
    console.error("Error in /api/auth/me:", error);
    return NextResponse.json({ user: null });
  }
}
