import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB/ใบ

export async function POST(request: Request) {
  try {
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

    // เอา fallback รูปปลอมออก — บังคับต้องแนบรูปจริง
    if (imageUrls.length === 0) {
      return NextResponse.json(
        { message: "กรุณาแนบรูปหลักฐานอย่างน้อย 1 รูป" },
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

    const rows = imageUrls.map((url) => ({
      order_id: orderId,
      uploaded_by: user.id,
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

    // เช็คว่าฝั่งผู้เช่าอัปโหลดหลักฐานคืนของ (renter_after) แล้วหรือยัง
    // ปิดยอด (settle happy) ก็ต่อเมื่อ "ทั้งคู่" อัปโหลดครบแล้วเท่านั้น
    const { data: renterEvidence } = await admin
      .from("rentalevidenceimage")
      .select("evidence_type")
      .eq("order_id", orderId)
      .eq("evidence_type", "renter_after")
      .limit(1);

    const renterUploaded = (renterEvidence?.length ?? 0) > 0;

    if (!renterUploaded) {
      return NextResponse.json(
        {
          ok: true,
          count: rows.length,
          status: order.status,
          message:
            "บันทึกหลักฐานของคุณเรียบร้อยแล้ว กำลังรอผู้เช่าอัปโหลดหลักฐานคืนของด้วย",
        },
        { status: 201 },
      );
    }

    // ทั้งคู่อัปโหลดครบแล้ว — เรียก RPC ปิดยอดจริง
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
          "บันทึกหลักฐานครบทั้งสองฝ่ายแล้ว เสร็จสิ้นการเช่าเรียบร้อยแล้ว",
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
