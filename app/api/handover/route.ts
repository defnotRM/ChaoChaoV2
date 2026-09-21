import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadMultipleImagesToStorage } from "@/lib/supabase/storage";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB/ใบ

function extractPhase(value: string | null | undefined): "before" | "after" {
  if (value && value.toLowerCase().includes("after")) return "after";
  return "before";
}

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
    let requestedPhase: string = "before";
    let imageUrls: string[] = [];

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await request.json();
      orderId = json.orderId || "";
      requestedPhase = extractPhase(json.evidenceType || json.phase);
      const rawUrls = json.imageUrls || (json.imageUrl ? [json.imageUrl] : []);
      try {
        imageUrls = await uploadMultipleImagesToStorage(rawUrls, {
          bucket: "rental-evidence",
          folder: orderId,
          filenamePrefix: `handover_${requestedPhase}`,
        });
      } catch (uploadErr) {
        console.warn("Storage upload failed for handover (JSON), fallback:", uploadErr);
        imageUrls = rawUrls;
      }
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
      }

      try {
        imageUrls = await uploadMultipleImagesToStorage(files, {
          bucket: "rental-evidence",
          folder: orderId,
          filenamePrefix: `handover_${requestedPhase}`,
        });
      } catch (uploadErr) {
        console.warn("Storage upload failed for handover (files), fallback to base64:", uploadErr);
        for (const f of files) {
          const buffer = Buffer.from(await f.arrayBuffer());
          const mime = f.type || "image/png";
          imageUrls.push(`data:${mime};base64,${buffer.toString("base64")}`);
        }
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

    const evidenceType = `${actualRole}_${requestedPhase}`;

    const rows = imageUrls.map((url) => ({
      order_id: orderId,
      uploaded_by: user.id,
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

    // เช็คว่าอีกฝ่ายอัปโหลดหลักฐานแล้วหรือยัง — สถานะจะขยับเป็น item_sent
    // ก็ต่อเมื่อ "ทั้งคู่" อัปโหลดครบแล้วเท่านั้น ไม่ใช่ฝ่ายใดฝ่ายหนึ่งอัปแล้วเดินหน้าเลย
    const { data: existingEvidence } = await admin
      .from("rentalevidenceimage")
      .select("evidence_type")
      .eq("order_id", orderId)
      .in("evidence_type", ["renter_before", "lender_before"]);

    const types = new Set((existingEvidence || []).map((e) => e.evidence_type));
    const bothUploaded =
      types.has("renter_before") && types.has("lender_before");

    let newStatus = order.status;
    if (bothUploaded) {
      newStatus = "item_sent";
      await admin
        .from("rentalorder")
        .update({ status: "item_sent", updated_at: new Date().toISOString() })
        .eq("order_id", orderId);
    }

    return NextResponse.json(
      {
        ok: true,
        count: rows.length,
        status: newStatus,
        bothUploaded,
        message: bothUploaded
          ? "บันทึกหลักฐานครบทั้งสองฝ่ายแล้ว เริ่มเช่าได้เลย"
          : "บันทึกหลักฐานของคุณเรียบร้อยแล้ว กำลังรออีกฝ่ายอัปโหลด",
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
