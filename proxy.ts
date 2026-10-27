import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// หน้าเดียวที่บัญชีถูกระงับ (Suspended) เข้าได้ คือแดชบอร์ดของตัวเอง
// ("/dashboard" จะพาไปที่ /dashboard/<user id> เหมือนผู้ใช้ปกติ)
// ถ้าหน้าแดชบอร์ดจริงใช้ URL อื่น ให้แก้ที่สองฟังก์ชันนี้ที่เดียว
function suspendedHome(userId: string) {
  return `/dashboard/${userId}`;
}
function isSuspendedAllowedPath(pathname: string, userId: string) {
  const home = suspendedHome(userId);
  return pathname === "/dashboard" || pathname === home;
}

// อ่านสถานะบัญชีด้วย service role (ไม่พึ่ง RLS) ถ้าเช็กไม่ได้ให้ปล่อยผ่านเพื่อไม่ให้เว็บล่มทั้งระบบ
async function isSuspendedUser(userId: string): Promise<boolean> {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) return false;
  try {
    const admin = createSupabaseClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await admin
      .from("useraccount")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.status === "Suspended";
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    "";

  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    "";

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const activeRole = request.cookies.get("chaochao_active_role")?.value;

  // 0. บัญชีถูกระงับ: บล็อกการเข้าใช้งาน และเตะออกจากระบบทันที
  if (user && (await isSuspendedUser(user.id))) {
    await supabase.auth.signOut();
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "suspended");
    return NextResponse.redirect(loginUrl);
  }

  // 1. ถ้าเป็น Admin: ล็อคให้อยู่เฉพาะใน /admin/* เท่านั้น
  if (activeRole === "admin" && user) {
    if (pathname === "/admin/login") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (!pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return response;
  }

  // 2. ถ้าไม่ใช่ Admin พยายามเข้า /admin/* (ยกเว้น /admin/login) ให้ redirect ไป /admin/login
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  // 3. ป้องกันหน้า / และ /users สำหรับผู้ใช้ทั่วไปที่ยังไม่ได้ล็อกอิน
  const isProtected =
    pathname === "/" ||
    pathname === "/users" ||
    pathname.startsWith("/users/");

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 4. ถ้าล็อกอินแล้วและเข้ามาหน้า /login หรือ /register ให้ส่งไปหน้าแรก
  if ((pathname === "/login" || pathname === "/register") && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes
     * - public files (images, svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
