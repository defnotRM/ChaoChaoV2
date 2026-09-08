import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const roleFilter = searchParams.get("role")?.trim() || "all";

    const admin = createAdminClient();

    // 1. Fetch users from useraccount
    let query = admin
      .from("useraccount")
      .select("user_id, username, bio, avatar_url, banner_url, status, updated_at, created_at")
      .neq("status", "Suspended")
      .neq("status", "Banned")
      .order("created_at", { ascending: false });

    const { data: dbUsers, error: usersError } = await query;

    if (usersError) {
      console.error("Error fetching db users:", usersError);
    }

    let allUsers = [...(dbUsers || [])];
    const existingIds = new Set(allUsers.map((u) => u.user_id));

    const authRoleMap = new Map<string, string[]>();

    // 2. Fetch all registered auth users to guarantee no newly registered user is missed
    try {
      const { data: authData } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (authData?.users && authData.users.length > 0) {
        for (const au of authData.users) {
          const uRole =
            au.user_metadata?.signup_role ||
            au.user_metadata?.role ||
            "renter";
          const rolesToAssign =
            uRole === "both"
              ? ["renter", "lender"]
              : uRole === "admin"
              ? ["admin"]
              : uRole === "lender"
              ? ["lender"]
              : ["renter"];
          authRoleMap.set(au.id, rolesToAssign);

          const uName =
            au.user_metadata?.username ||
            au.email?.split("@")[0] ||
            "ผู้ใช้งาน";
          const uEmail = au.email || `${uName.toLowerCase()}@chaochao.local`;
          const uNatId = au.user_metadata?.national_id || null;

          if (!existingIds.has(au.id)) {
            allUsers.unshift({
              user_id: au.id,
              username: uName,
              bio: "",
              avatar_url: au.user_metadata?.avatar_url || null,
              banner_url: null,
              status: "Active",
              updated_at: au.updated_at || new Date().toISOString(),
              created_at: au.created_at || new Date().toISOString(),
            });
            existingIds.add(au.id);

            // Auto-sync into useraccount in the background
            try {
              await admin
                .from("useraccount")
                .upsert(
                  {
                    user_id: au.id,
                    username: uName,
                    email: uEmail,
                    national_id: uNatId,
                    status: "Active",
                  },
                  { onConflict: "user_id" }
                );
            } catch {
              // ignore sync errors
            }
          }
        }
      }
    } catch (listErr) {
      console.error("Auto-sync auth users error:", listErr);
    }

    if (q) {
      const qLower = q.toLowerCase();
      allUsers = allUsers.filter(
        (u) =>
          u.username?.toLowerCase().includes(qLower) ||
          u.bio?.toLowerCase().includes(qLower)
      );
    }

    if (!allUsers || allUsers.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const userIds = allUsers.map((u) => u.user_id);

    // 3. Fetch roles from DB and item ownership
    const [{ data: roleAssignments }, { data: allRoles }, { data: allItems }] = await Promise.all([
      admin
        .from("user_role_assignment")
        .select("user_id, role_id")
        .in("user_id", userIds),
      admin.from("role").select("role_id, role_type"),
      admin
        .from("item")
        .select("user_id, status")
        .in("user_id", userIds),
    ]);

    const roleTypeById = new Map<string, string>();
    const roleIdByType = new Map<string, string>();
    (allRoles || []).forEach((r) => {
      roleTypeById.set(r.role_id, r.role_type);
      roleIdByType.set(r.role_type, r.role_id);
    });

    const rolesMap = new Map<string, string[]>();
    (roleAssignments || []).forEach((ra: any) => {
      const type = roleTypeById.get(ra.role_id);
      if (type) {
        const current = rolesMap.get(ra.user_id) || [];
        if (!current.includes(type)) {
          current.push(type);
        }
        rolesMap.set(ra.user_id, current);
      }
    });

    // Count items and identify users who have listed items (definite lenders)
    const itemCountMap = new Map<string, number>();
    const lenderUserIdsFromItems = new Set<string>();
    (allItems || []).forEach((it) => {
      if (it.status === "available") {
        itemCountMap.set(it.user_id, (itemCountMap.get(it.user_id) || 0) + 1);
      }
      lenderUserIdsFromItems.add(it.user_id);
    });

    // Reconcile and auto-sync roles for all users
    for (const u of allUsers) {
      let userRoles = rolesMap.get(u.user_id) || [];

      // If user has no roles in DB, use Auth metadata
      if (userRoles.length === 0 && authRoleMap.has(u.user_id)) {
        userRoles = [...(authRoleMap.get(u.user_id) || [])];
      }

      // If Auth metadata has lender or admin, include it
      const fromAuth = authRoleMap.get(u.user_id) || [];
      if (fromAuth.includes("lender") && !userRoles.includes("lender")) {
        userRoles.push("lender");
      }
      if (fromAuth.includes("admin") && !userRoles.includes("admin")) {
        userRoles.push("admin");
      }

      // If user has listed items in item table, they are definitely a lender
      if (lenderUserIdsFromItems.has(u.user_id) && !userRoles.includes("lender")) {
        userRoles.push("lender");
      }

      if (userRoles.length === 0) {
        userRoles = ["renter"];
      }

      rolesMap.set(u.user_id, userRoles);

      // Auto-sync missing role assignments into DB in background
      for (const rType of userRoles) {
        const rId = roleIdByType.get(rType);
        if (rId) {
          try {
            await admin
              .from("user_role_assignment")
              .upsert(
                { user_id: u.user_id, role_id: rId },
                { onConflict: "user_id,role_id" }
              );
          } catch {
            // ignore background sync error
          }
        }
      }
    }

    // 4. Format & Filter by role
    let formattedUsers = allUsers.map((u) => {
      const roles = rolesMap.get(u.user_id) || [];
      const isLender = roles.includes("lender");
      const isRenter = roles.includes("renter");
      const isAdmin = roles.includes("admin");

      const primaryRole = isAdmin
        ? "admin"
        : isLender && isRenter
        ? "both"
        : isLender
        ? "lender"
        : "renter";

      const roleLabel = isAdmin
        ? "ผู้ดูแลระบบ"
        : isLender && isRenter
        ? "ผู้ให้เช่า / ผู้เช่า"
        : isLender
        ? "ผู้ให้เช่า"
        : "ผู้เช่า";

      return {
        id: u.user_id,
        username: u.username,
        bio: u.bio || "",
        avatarUrl: u.avatar_url || null,
        bannerUrl: u.banner_url || null,
        role: roleLabel,
        primaryRole,
        itemCount: itemCountMap.get(u.user_id) || 0,
        createdAt: u.created_at,
      };
    });

    if (roleFilter === "lender") {
      formattedUsers = formattedUsers.filter(
        (u) => u.primaryRole === "lender" || u.primaryRole === "both"
      );
    } else if (roleFilter === "renter") {
      formattedUsers = formattedUsers.filter(
        (u) => u.primaryRole === "renter" || u.primaryRole === "both"
      );
    }

    return NextResponse.json(
      { users: formattedUsers },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("Users GET error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
