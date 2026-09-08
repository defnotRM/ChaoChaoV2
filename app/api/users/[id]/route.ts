import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const userId = params.id;

    if (!userId) {
      return NextResponse.json(
        { message: "กรุณาระบุรหัสผู้ใช้งาน" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Fetch user profile
    const { data: userRow, error: userError } = await admin
      .from("useraccount")
      .select("user_id, username, bio, avatar_url, banner_url, status, updated_at, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    let user = userRow;

    // Fallback: If not found in useraccount, fetch from auth.users and auto-sync
    if (!user) {
      try {
        const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
        if (authUser?.user) {
          const au = authUser.user;
          const uName =
            au.user_metadata?.username ||
            au.email?.split("@")[0] ||
            "ผู้ใช้งาน";
          const uEmail = au.email || `${uName.toLowerCase()}@chaochao.local`;
          const uNatId = au.user_metadata?.national_id || null;

          await admin.from("useraccount").upsert(
            {
              user_id: au.id,
              username: uName,
              email: uEmail,
              national_id: uNatId,
              status: "Active",
            },
            { onConflict: "user_id" }
          );

          user = {
            user_id: au.id,
            username: uName,
            bio: "",
            avatar_url: au.user_metadata?.avatar_url || null,
            banner_url: null,
            status: "Active",
            updated_at: au.updated_at || new Date().toISOString(),
            created_at: au.created_at || new Date().toISOString(),
          };

          const uRole =
            au.user_metadata?.signup_role ||
            au.user_metadata?.role ||
            "renter";
          const rolesToAssign =
            uRole === "both" ? ["renter", "lender"] : [uRole];
          const { data: roleRows } = await admin
            .from("role")
            .select("role_id, role_type")
            .in("role_type", rolesToAssign);

          if (roleRows && roleRows.length > 0) {
            for (const r of roleRows) {
              await admin.from("user_role_assignment").upsert(
                { user_id: au.id, role_id: r.role_id },
                { onConflict: "user_id,role_id" }
              );
            }
          }
        }
      } catch (authFetchErr) {
        console.error("Auth user fallback error:", authFetchErr);
      }
    }

    if (!user) {
      return NextResponse.json(
        { message: "ไม่พบข้อมูลผู้ใช้งานนี้" },
        { status: 404 }
      );
    }

    // 2. Fetch roles using Zero-Join pattern and item ownership
    const [{ data: roleAssignments }, { data: allRoles }, { data: items }] =
      await Promise.all([
        admin
          .from("user_role_assignment")
          .select("role_id")
          .eq("user_id", userId),
        admin.from("role").select("role_id, role_type"),
        admin
          .from("item")
          .select("item_id, item_name, description, rental_fee_per_day, deposit, status, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

    const roleTypeById = new Map<string, string>();
    (allRoles || []).forEach((r) => {
      roleTypeById.set(r.role_id, r.role_type);
    });

    let roles = (roleAssignments || [])
      .map((ra: any) => roleTypeById.get(ra.role_id))
      .filter((r): r is string => Boolean(r));

    // If user has listed items, guarantee lender role
    if (items && items.length > 0 && !roles.includes("lender")) {
      roles.push("lender");
    }

    // If roles still empty, fallback to metadata
    if (roles.length === 0) {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(userId);
        const uRole =
          authUser?.user?.user_metadata?.signup_role ||
          authUser?.user?.user_metadata?.role ||
          "renter";
        roles = uRole === "both" ? ["renter", "lender"] : [uRole];
      } catch {
        roles = ["renter"];
      }
    }

    const isLender = roles.includes("lender");
    const isRenter = roles.includes("renter");
    const isAdmin = roles.includes("admin");

    const roleLabel = isAdmin
      ? "ผู้ดูแลระบบ"
      : isLender && isRenter
      ? "ผู้ให้เช่า / ผู้เช่า"
      : isLender
      ? "ผู้ให้เช่า"
      : "ผู้เช่า";

    // 3. Fetch primary images for items
    const itemIds = (items || []).map((it) => it.item_id);
    let imagesMap = new Map<string, string>();

    if (itemIds.length > 0) {
      const { data: images } = await admin
        .from("itemimage")
        .select("item_id, image_url, is_primary")
        .in("item_id", itemIds);

      (images || []).forEach((img) => {
        if (img.is_primary || !imagesMap.has(img.item_id)) {
          imagesMap.set(img.item_id, img.image_url);
        }
      });
    }

    const formattedItems = (items || []).map((it) => ({
      id: it.item_id,
      name: it.item_name,
      description: it.description || "",
      rentalFeePerDay: it.rental_fee_per_day || 0,
      deposit: it.deposit || 0,
      status: it.status,
      imageUrl: imagesMap.get(it.item_id) || null,
      createdAt: it.created_at,
    }));

    return NextResponse.json(
      {
        user: {
          id: user.user_id,
          username: user.username,
          bio: user.bio || "",
          avatarUrl: user.avatar_url || null,
          bannerUrl: user.banner_url || null,
          role: roleLabel,
          isLender,
          isRenter,
          createdAt: user.created_at,
        },
        items: formattedItems,
      },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("User profile GET error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
