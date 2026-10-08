import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// รายชื่อสมาชิกสาธารณะ (หน้า /users) — อ่านอย่างเดียว
// ห้ามเขียนฐานข้อมูลใน GET นี้: route นี้ไม่ต้องล็อกอิน และเคยสร้างบัญชี/สิทธิ์จาก
// user_metadata (ผู้ใช้แก้เองได้) ซึ่งทำให้ยกระดับเป็น admin ได้ และเคยปลดการระงับบัญชี
// โปรไฟล์และสิทธิ์สร้างตอนสมัครสมาชิก (/api/register, /api/auth/me) อยู่แล้ว
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const roleFilter = searchParams.get("role")?.trim() || "all";

    const admin = createAdminClient();

    // 1. ดึงสมาชิกที่ยังใช้งานได้ (ไม่รวมบัญชีที่ถูกระงับ/แบน)
    const { data: dbUsers, error: usersError } = await admin
      .from("useraccount")
      .select(
        "user_id, username, bio, avatar_url, banner_url, status, updated_at, created_at",
      )
      .neq("status", "Suspended")
      .neq("status", "Banned")
      .order("created_at", { ascending: false });

    if (usersError) {
      console.error("Error fetching db users:", usersError);
      return NextResponse.json(
        { message: "ไม่สามารถดึงรายชื่อสมาชิกได้" },
        { status: 500 },
      );
    }

    let allUsers = dbUsers || [];

    if (q) {
      const qLower = q.toLowerCase();
      allUsers = allUsers.filter(
        (u) =>
          u.username?.toLowerCase().includes(qLower) ||
          u.bio?.toLowerCase().includes(qLower),
      );
    }

    if (allUsers.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const userIds = allUsers.map((u) => u.user_id);

    // 2. สิทธิ์จริงจากตาราง user_role_assignment และสินค้าของผู้ใช้
    const [
      { data: roleAssignments },
      { data: allRoles },
      { data: allItems },
    ] = await Promise.all([
      admin
        .from("user_role_assignment")
        .select("user_id, role_id")
        .in("user_id", userIds),
      admin.from("role").select("role_id, role_type"),
      admin.from("item").select("user_id, status").in("user_id", userIds),
    ]);

    const roleTypeById = new Map<string, string>();
    (allRoles || []).forEach((r) => roleTypeById.set(r.role_id, r.role_type));

    const rolesMap = new Map<string, string[]>();
    (roleAssignments || []).forEach((ra) => {
      const type = roleTypeById.get(ra.role_id);
      if (!type) return;
      const current = rolesMap.get(ra.user_id) || [];
      if (!current.includes(type)) current.push(type);
      rolesMap.set(ra.user_id, current);
    });

    const itemCountMap = new Map<string, number>();
    const lenderUserIdsFromItems = new Set<string>();
    (allItems || []).forEach((it) => {
      if (it.status === "available") {
        itemCountMap.set(it.user_id, (itemCountMap.get(it.user_id) || 0) + 1);
      }
      lenderUserIdsFromItems.add(it.user_id);
    });

    // 3. จัดรูปแบบ (ใช้เพื่อแสดงผลเท่านั้น ไม่เขียนกลับ)
    let formattedUsers = allUsers.map((u) => {
      const roles = [...(rolesMap.get(u.user_id) || [])];
      if (lenderUserIdsFromItems.has(u.user_id) && !roles.includes("lender")) {
        roles.push("lender");
      }
      if (roles.length === 0) roles.push("renter");

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
        (u) => u.primaryRole === "lender" || u.primaryRole === "both",
      );
    } else if (roleFilter === "renter") {
      formattedUsers = formattedUsers.filter(
        (u) => u.primaryRole === "renter" || u.primaryRole === "both",
      );
    }

    return NextResponse.json(
      { users: formattedUsers },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error("Users GET error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
