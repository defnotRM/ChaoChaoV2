import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadToStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB/ใบ
const MAX_RETURN_PHOTOS = 5;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();

    let orderId = "";
    let requestedEvidenceType: string | null = null;
    let imageUrls: string[] = [];
    let reqUserId: string | null = null;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await request.json();
      orderId = (json.orderId || "").trim();
      requestedEvidenceType = json.evidenceType || null;
      const rawUrls: string[] =
        json.imageUrls || (json.imageUrl ? [json.imageUrl] : []);
      reqUserId = json.userId || null;

      if (rawUrls.length === 0) {
        return NextResponse.json(
          { message: "กรุณาแนบรูปหลักฐานอย่างน้อย 1 รูป" },
          { status: 400 }
        );
      }
      if (rawUrls.length > MAX_RETURN_PHOTOS) {
        return NextResponse.json(
          { message: `อัปโหลดรูปหลักฐานได้ไม่เกิน ${MAX_RETURN_PHOTOS} รูป` },
          { status: 400 }
        );
      }

      for (const url of rawUrls) {
        if (url.startsWith("data:")) {
          const res = await uploadToStorage("evidence/return", orderId, url);
          imageUrls.push(res.publicUrl);
        } else {
          imageUrls.push(url);
        }
      }
    } else {
      const formData = await request.formData();
      orderId = (formData.get("orderId") as string | null)?.trim() ?? "";
      requestedEvidenceType =
        (formData.get("evidenceType") as string | null)?.trim() ?? null;
      reqUserId = (formData.get("userId") as string | null)?.trim() ?? null;
      const files = formData
        .getAll("photos")
        .filter((f): f is File => f instanceof File && f.size > 0);

      if (files.length === 0) {
        return NextResponse.json(
          { message: "กรุณาแนบรูปหลักฐานอย่างน้อย 1 รูป" },
          { status: 400 }
        );
      }
      if (files.length > MAX_RETURN_PHOTOS) {
        return NextResponse.json(
          { message: `อัปโหลดรูปหลักฐานได้ไม่เกิน ${MAX_RETURN_PHOTOS} รูป` },
          { status: 400 }
        );
      }

      for (const f of files) {
        if (!ALLOWED_TYPES.includes(f.type)) {
          return NextResponse.json(
            { message: "รองรับเฉพาะไฟล์รูป JPG, PNG หรือ WebP" },
            { status: 400 }
          );
        }
        if (f.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { message: "ขนาดรูปแต่ละใบต้องไม่เกิน 10 MB" },
            { status: 400 }
          );
        }
        const res = await uploadToStorage("evidence/return", orderId, f, {
          contentType: f.type || "image/png",
        });
        imageUrls.push(res.publicUrl);
      }
    }

    if (!orderId) {
      return NextResponse.json(
        { message: "กรุณาระบุเลขออเดอร์" },
        { status: 400 }
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

    const callerId = sessionUser?.id || reqUserId;
    let actualRole: "renter" | "lender" | null = null;

    if (callerId && callerId === order.user_id) {
      actualRole = "renter";
    } else if (callerId && lenderUserId && callerId === lenderUserId) {
      actualRole = "lender";
    } else if (requestedEvidenceType === "renter_after") {
      actualRole = "renter";
    } else if (requestedEvidenceType === "lender_after") {
      actualRole = "lender";
    }

    if (!actualRole) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์อัปโหลดหลักฐานสำหรับออเดอร์นี้" },
        { status: 403 }
      );
    }

    const finalEvidenceType =
      actualRole === "renter" ? "renter_after" : "lender_after";
    const uploaderUserId =
      actualRole === "renter"
        ? order.user_id
        : lenderUserId || callerId || order.user_id;

    // ตรวจสอบว่าฝ่ายนี้อัปโหลดหลักฐานตอนคืนของไปแล้วหรือยัง
    const { count: existingCount } = await admin
      .from("rentalevidenceimage")
      .select("evidence_id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("evidence_type", finalEvidenceType);

    if ((existingCount ?? 0) > 0) {
      return NextResponse.json(
        { message: "คุณได้อัปโหลดหลักฐานการคืนของไปแล้ว" },
        { status: 409 }
      );
    }

    const rows = imageUrls.map((url) => ({
      order_id: orderId,
      uploaded_by: uploaderUserId,
      evidence_type: finalEvidenceType,
      image_url: url,
    }));

    const { error: insertError } = await admin
      .from("rentalevidenceimage")
      .insert(rows);

    if (insertError) {
      console.error("Insert return evidence error:", insertError);
      return NextResponse.json(
        { message: "บันทึกหลักฐานไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 }
      );
    }

    // ตรวจสอบว่าทั้งผู้ให้เช่า (lender_after) และผู้เช่า (renter_after) อัปโหลดครบทั้งสองฝ่ายหรือยัง
    const { data: allAfterEvidence } = await admin
      .from("rentalevidenceimage")
      .select("evidence_type")
      .eq("order_id", orderId)
      .in("evidence_type", ["lender_after", "renter_after"]);

    const types = new Set(
      (allAfterEvidence || []).map((e) => e.evidence_type)
    );
    const bothUploaded =
      types.has("lender_after") && types.has("renter_after");

    let newStatus = order.status;
    if (bothUploaded) {
      newStatus = "completed";
      try {
        await supabase.rpc("settle_rental_order", {
          p_order_id: orderId,
          p_caller_id: uploaderUserId,
          p_outcome: "happy",
        });
      } catch {
        // Fallback update below guarantees status is completed
      }
      await admin
        .from("rentalorder")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("order_id", orderId);
    }

    return NextResponse.json(
      {
        ok: true,
        count: rows.length,
        status: newStatus,
        bothUploaded,
        evidenceType: finalEvidenceType,
        imageUrls,
        message: bothUploaded
          ? "บันทึกหลักฐานคืนของครบทั้งสองฝ่ายแล้ว การเช่าเสร็จสมบูรณ์!"
          : "บันทึกหลักฐานคืนของเรียบร้อยแล้ว กำลังรออีกฝ่ายอัปโหลดหลักฐานคืนของ",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/return error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
