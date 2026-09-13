import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import DashboardUserClient from "./DashboardUserClient";

export const dynamic = "force-dynamic";

export default async function UserDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  // ต้องล็อกอิน และต้องเป็นเจ้าของ dashboard นี้เอง (หรือ admin) เท่านั้นถึงจะเข้าดูได้
  const supabase = await createClient();
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();

  if (!sessionUser) {
    redirect("/login");
  }

  if (sessionUser.id !== id) {
    const { data: sessionRoles } = await admin
      .from("user_role_assignment")
      .select("role ( role_type )")
      .eq("user_id", sessionUser.id);
    const isAdmin = (sessionRoles || []).some(
      (r: any) => r.role?.role_type === "admin",
    );
    if (!isAdmin) {
      notFound();
    }
  }

  let userProfile = null;
  const { data: profile, error: profileError } = await admin
    .from("useraccount")
    .select(
      "user_id, username, firstname, lastname, email, avatar_url, updated_at, status",
    )
    .eq("user_id", id)
    .maybeSingle();

  userProfile = profile;

  // Auto-sync profile fallback from Supabase Auth
  if (!userProfile) {
    const { data: authUser } = await admin.auth.admin.getUserById(id);
    if (authUser?.user) {
      const u = authUser.user;
      const uName =
        u.user_metadata?.username || u.email?.split("@")[0] || "ผู้ใช้งาน";
      const uEmail = u.email || `${uName}@chaochao.local`;
      const uRole =
        u.user_metadata?.signup_role || u.user_metadata?.role || "renter";

      await admin.from("useraccount").upsert(
        {
          user_id: u.id,
          username: uName,
          email: uEmail,
          national_id: u.user_metadata?.national_id || null,
          status: "Active",
        },
        { onConflict: "user_id" },
      );

      const rolesToAssign = uRole === "both" ? ["renter", "lender"] : [uRole];
      const { data: roleRows } = await admin
        .from("role")
        .select("role_id, role_type")
        .in("role_type", rolesToAssign);

      if (roleRows && roleRows.length > 0) {
        for (const r of roleRows) {
          await admin
            .from("user_role_assignment")
            .upsert(
              { user_id: u.id, role_id: r.role_id },
              { onConflict: "user_id,role_id" },
            );
        }
      }

      userProfile = {
        user_id: u.id,
        username: uName,
        firstname: null,
        lastname: null,
        email: uEmail,
        avatar_url: null,
        updated_at: new Date().toISOString(),
        status: "Active",
      };
    }
  }

  if (!userProfile) {
    notFound();
  }

  const { data: userRoles } = await admin
    .from("user_role_assignment")
    .select("role ( role_type )")
    .eq("user_id", id);

  const roles = (userRoles || [])
    .map((r: any) => r.role?.role_type)
    .filter(Boolean);

  const primaryRole = roles.includes("admin")
    ? "admin"
    : roles.includes("lender")
      ? "lender"
      : "renter";

  const avatarUrl = userProfile.avatar_url || null;

  const targetUser = {
    id: userProfile.user_id,
    username:
      userProfile.username ||
      `${userProfile.firstname || ""} ${userProfile.lastname || ""}`.trim() ||
      "ผู้ใช้งาน",
    avatarUrl,
    role: primaryRole,
    roles: roles.length > 0 ? roles : ["renter"],
  };

  return <DashboardUserClient targetUser={targetUser} />;
}
