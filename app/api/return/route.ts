import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB/ใบ

export async function POST(request: Request) {
  try {
    // 1) ต้องล็อกอินก่อนเสมอ — ไม่เชื่อ userId ที่ client ส่งมาอีกต่อไป (เหมือน /api/handover)
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
        { status: 401 },
      );
    }

    let orderId = "";
    let imageUrls: string[] = [];

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await request.json();
      orderId = json.orderId || "";
      imageUrls = json.imageUrls || (json.imageUrl ? [json.imageUrl] : []);
    } else {
      const formData = await request.formData();
      orderId = (formData.get("orderId") as string | null)?.trim() ?? "";
      const files = formData
        .getAll("photos")
        .filter((f): f is File => f instanceof File);

      for (const f of files) {
        if (!ALLOWED_TYPES.includes(f.type)) {
          return NextResponse.json(
            { message: "รองรับเฉพาะไฟล์รูป JPG, PNG หรือ WebP" },
            { status: 400 },
          );
        }
        if (f.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { message: "ขนาดรูปแต่ละใบต้องไม่เกิน 10 MB" },
            { status: 400 },
          );
        }
        const buffer = Buffer.from(await f.arrayBuffer());
        const mime = f.type || "image/png";
        imageUrls.push(`data:${mime};base64,${buffer.toString("base64")}`);
      }
    }

    if (!orderId) {
      return NextResponse.json(
        { message: "กรุณาระบุเลขออเดอร์" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: order, error: orderError } = await admin
      .from("rentalorder")
      .select("order_id, user_id, item_id, status")
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์นี้" }, { status: 404 });
    }

    // 2) เฉพาะเจ้าของสินค้า (ผู้ให้เช่า) ของ order นี้เท่านั้นที่ยืนยันรับคืนของได้
    let lenderUserId: string | null = null;
    if (order.item_id) {
      const { data: item } = await admin
        .from("item")
        .select("user_id")
        .eq("item_id", order.item_id)
        .maybeSingle();
      lenderUserId = item?.user_id ?? null;
    }

    if (user.id !== lenderUserId) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์ยืนยันรับคืนสินค้าสำหรับออเดอร์นี้" },
        { status: 403 },
      );
    }

    if (imageUrls.length === 0) {
      imageUrls = [
        "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=60",
      ];
    }

    const rows = imageUrls.map((url) => ({
      order_id: orderId,
      uploaded_by: user.id, // คอลัมน์จริงคือ uploaded_by ไม่ใช่ user_id
      evidence_type: "lender_after",
      image_url: url,
    }));

    const { error: insertError } = await admin
      .from("rentalevidenceimage")
      .insert(rows);
    if (insertError) {
      console.error("Insert return evidence error:", insertError);
      return NextResponse.json(
        { message: "บันทึกหลักฐานไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    // 3) เรียก RPC ปิดยอดจริง แทนที่จะ set status "completed" ตรงๆ แบบเดิม
    // สมมติฐาน: ไม่มีข้อพิพาทใดๆ (ของปกติ) — ถ้ามีรายงานสินค้าเสียหาย/ไม่คืนของ
    // ทีหลัง แอดมินจะเป็นคนเรียก settle_rental_order ซ้ำด้วย outcome อื่นแทน
    const { data: outcome, error: settleError } = await supabase.rpc(
      "settle_rental_order",
      {
        p_order_id: orderId,
        p_caller_id: user.id,
        p_outcome: "happy",
      },
    );

    if (settleError) {
      console.error("settle_rental_order error:", settleError);
      return NextResponse.json(
        { message: "บันทึกหลักฐานสำเร็จ แต่ปิดยอดไม่สำเร็จ กรุณาติดต่อแอดมิน" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        count: rows.length,
        status: outcome,
        message:
          "บันทึกหลักฐานสภาพหลังการใช้งานและเสร็จสิ้นการเช่าเรียบร้อยแล้ว",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/return error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
