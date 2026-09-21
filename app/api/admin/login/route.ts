import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { message: "กรุณากรอกชื่อผู้ใช้/อีเมล และรหัสผ่าน" },
        { status: 400 }
      );
    }

    const cleanInput = String(username).trim();
    const isEmail = cleanInput.includes("@");
    const admin = createAdminClient();

    // 1. ตรวจสอบข้อมูลใน useraccount
    let query = admin
      .from("useraccount")
      .select("user_id, username, email, status");

    if (isEmail) {
      query = query.ilike("email", cleanInput);
    } else {
      query = query.ilike("username", cleanInput);
    }

    const { data: profile } = await query.maybeSingle();

    if (!profile) {
      return NextResponse.json(
        { message: "ไม่พบชื่อผู้ใช้หรืออีเมลนี้ในระบบ" },
        { status: 401 }
      );
    }

    if (profile.status === "Suspended" || profile.status === "Banned") {
      return NextResponse.json(
        { message: `บัญชีผู้ใช้นี้ถูกระงับการใช้งาน (${profile.status})` },
        { status: 403 }
      );
    }

    // 2. ล็อกอินผ่าน Supabase Auth เพื่อสร้าง session cookie
    const supabase = await createServerClient();
    const authRes = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: String(password),
    });

    if (authRes.error || !authRes.data.user) {
      console.error("Admin auth sign-in error:", authRes.error);
      return NextResponse.json(
        { message: "รหัสผ่านไม่ถูกต้อง หรือข้อมูลการเข้าสู่ระบบไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    // 3. ตรวจสอบสิทธิ์ว่ามี role admin จริงหรือไม่
    const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");

    if (rpcError || !isAdmin) {
      // หากไม่ใช่ admin ให้ logout ออกทันที
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          message:
            "บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบผู้ดูแลระบบ (Admin Access Required)",
        },
        { status: 403 }
      );
    }

    // 4. บันทึก cookie active role เป็น admin และ redirect ไปที่ /admin
    const response = NextResponse.json(
      {
        ok: true,
        message: "เข้าสู่ระบบผู้ดูแลระบบสำเร็จ",
        redirectTo: "/admin",
        user: {
          id: profile.user_id,
          username: profile.username,
          email: profile.email,
          role: "admin",
        },
      },
      { status: 200 }
    );

    response.cookies.set("chaochao_active_role", "admin", {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("POST /api/admin/login error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
