import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";

  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
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
