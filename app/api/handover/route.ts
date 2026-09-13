import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB/ใบ

function extractPhase(value: string | null | undefined): "before" | "after" {
  if (value && value.toLowerCase().includes("after")) return "after";
  return "before";
}

export async function POST(request: Request) {
  try {
    // 1) ต้องล็อกอินก่อนเสมอ — ไม่เชื่อ userId ที่ client ส่งมาอีกต่อไป
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
    let requestedPhase: string = "before";
    let imageUrls: string[] = [];

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await request.json();
      orderId = json.orderId || "";
      requestedPhase = extractPhase(json.evidenceType || json.phase);
      imageUrls = json.imageUrls || (json.imageUrl ? [json.imageUrl] : []);
      // หมายเหตุ: ไม่อ่าน json.userId แล้ว — ใช้ user.id จาก session เท่านั้น
    } else {
      const formData = await request.formData();
      orderId = (formData.get("orderId") as string | null)?.trim() ?? "";
      requestedPhase = extractPhase(
        (formData.get("evidenceType") as string | null)?.trim() ||
          (formData.get("phase") as string | null)?.trim(),
      );
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

    // 2) เช็คว่าคนที่ล็อกอินอยู่ คือ "ผู้เช่า" หรือ "ผู้ให้เช่า" ของออเดอร์นี้จริง
    let lenderUserId: string | null = null;
    if (order.item_id) {
      const { data: item } = await admin
        .from("item")
        .select("user_id")
        .eq("item_id", order.item_id)
        .maybeSingle();
      lenderUserId = item?.user_id ?? null;
    }

    let actualRole: "renter" | "lender" | null = null;
    if (user.id === order.user_id) {
      actualRole = "renter";
    } else if (lenderUserId && user.id === lenderUserId) {
      actualRole = "lender";
    }

    if (!actualRole) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์อัปโหลดหลักฐานสำหรับออเดอร์นี้" },
        { status: 403 },
      );
    }

    // 3) role มาจาก session เท่านั้น, phase (before/after) มาจาก client ได้ (แค่บอกขั้นตอน ไม่ใช่ตัวตน)
    const evidenceType = `${actualRole}_${requestedPhase}`;

    if (imageUrls.length === 0) {
      imageUrls = [
        "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=60",
      ];
    }

    const rows = imageUrls.map((url) => ({
      order_id: orderId,
      uploaded_by: user.id, // คอลัมน์จริงคือ uploaded_by ไม่ใช่ user_id
      evidence_type: evidenceType,
      image_url: url,
    }));

    const { error: insertError } = await admin
      .from("rentalevidenceimage")
      .insert(rows);
    if (insertError) {
      console.error("Insert evidence error:", insertError);
      return NextResponse.json(
        { message: "บันทึกหลักฐานไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    await admin
      .from("rentalorder")
      .update({ status: "item_sent", updated_at: new Date().toISOString() })
      .eq("order_id", orderId);

    return NextResponse.json(
      {
        ok: true,
        count: rows.length,
        status: "item_sent",
        message: "บันทึกหลักฐานสภาพก่อนให้เช่าและส่งมอบอุปกรณ์เรียบร้อยแล้ว",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/handover error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
