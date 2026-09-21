import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ตรวจสอบสิทธิ์ Admin สำหรับ Server Components และ Layouts
 * หากไม่มี session จะ redirect ไปยัง /login
 * หากไม่ใช่ admin จะส่ง 404 notFound()
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/admin/login");
  }

  const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");

  if (rpcError || !isAdmin) {
    redirect("/admin/login?error=unauthorized");
  }

  const admin = createAdminClient();

  return {
    user,
    supabase,
    admin,
  };
}

/**
 * ตรวจสอบสิทธิ์ Admin สำหรับ Route Handlers (app/api/admin/...)
 * คืนค่า status 401 หรือ 403 หากไม่มีสิทธิ์
 */
export async function verifyAdminApi() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      authorized: false as const,
      user: null,
      response: NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
        { status: 401 },
      ),
    };
  }

  const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");

  if (rpcError || !isAdmin) {
    return {
      authorized: false as const,
      user,
      response: NextResponse.json(
        { message: "คุณไม่มีสิทธิ์ผู้ดูแลระบบ (Admin Access Required)" },
        { status: 403 },
      ),
    };
  }

  const admin = createAdminClient();

  return {
    authorized: true as const,
    user,
    supabase,
    admin,
  };
}
