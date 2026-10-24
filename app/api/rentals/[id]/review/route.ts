import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadToStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_REVIEW_PHOTOS = 5;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orderId } = await params;
    const admin = createAdminClient();

    const { data: rev, error } = await admin
      .from("review")
      .select("review_id, order_id, rating, comment, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { message: error.message },
        { status: 500 },
      );
    }

    if (!rev) {
      return NextResponse.json({ review: null });
    }

    const { data: images } = await admin
      .from("reviewimage")
      .select("image_url, created_at")
      .eq("review_id", rev.review_id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      review: {
        review_id: rev.review_id,
        order_id: rev.order_id,
        rating: Number(rev.rating) || 5,
        comment: rev.comment || "",
        created_at: rev.created_at,
        updated_at: rev.updated_at,
        imageUrls: (images || []).map((i) => i.image_url),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || "เกิดข้อผิดพลาดในการดึงข้อมูลรีวิว" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();

    const admin = createAdminClient();

    let rating = 5;
    let comment = "";
    let reqUserId: string | null = null;
    const uploadedUrls: string[] = [];
    let keepImageUrls: string[] = [];

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      rating = Number(body.rating ?? 5);
      comment = String(body.comment ?? "").trim();
      reqUserId = body.userId ? String(body.userId) : null;
      if (Array.isArray(body.imageUrls)) {
        keepImageUrls = body.imageUrls.filter((u: unknown) => typeof u === "string");
      }
    } else {
      const fd = await request.formData();
      rating = Number(fd.get("rating") ?? 5);
      comment = String(fd.get("comment") ?? "").trim();
      reqUserId = fd.get("userId") ? String(fd.get("userId")).trim() : null;

      const existingRaw = fd.getAll("existingImageUrls");
      keepImageUrls = existingRaw
        .map((v) => String(v).trim())
        .filter(Boolean);

      const files = fd
        .getAll("photos")
        .filter((f): f is File => f instanceof File && f.size > 0);

      if (keepImageUrls.length + files.length > MAX_REVIEW_PHOTOS) {
        return NextResponse.json(
          { message: `แนบรูปรีวิวได้ไม่เกิน ${MAX_REVIEW_PHOTOS} รูป` },
          { status: 400 },
        );
      }

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
        const res = await uploadToStorage("reviews", orderId, f, {
          contentType: f.type || "image/png",
        });
        uploadedUrls.push(res.publicUrl);
      }
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { message: "กรุณาเลือกคะแนนดาวระหว่าง 1 ถึง 5 ดาว" },
        { status: 400 },
      );
    }

    const { data: order, error: orderErr } = await admin
      .from("rentalorder")
      .select("order_id, item_id, user_id, status")
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json(
        { message: "ไม่พบคำสั่งเช่านี้" },
        { status: 404 },
      );
    }

    const callerId = sessionUser?.id || reqUserId || order.user_id;
    if (callerId !== order.user_id) {
      return NextResponse.json(
        { message: "เฉพาะผู้เช่าของรายการนี้เท่านั้นที่สามารถเขียนรีวิวได้" },
        { status: 403 },
      );
    }

    if (order.status !== "completed") {
      return NextResponse.json(
        { message: "สามารถเขียนรีวิวได้หลังจากการเช่าเสร็จสมบูรณ์แล้วเท่านั้น" },
        { status: 400 },
      );
    }

    // ตรวจสอบว่ามีรีวิวเดิมหรือไม่
    const { data: existingRev } = await admin
      .from("review")
      .select("review_id")
      .eq("order_id", orderId)
      .maybeSingle();

    let reviewId = existingRev?.review_id as string | undefined;
    const nowIso = new Date().toISOString();

    if (reviewId) {
      const { error: upErr } = await admin
        .from("review")
        .update({
          rating,
          comment: comment || null,
          updated_at: nowIso,
        })
        .eq("review_id", reviewId);

      if (upErr) {
        return NextResponse.json(
          { message: `บันทึกการแก้ไขรีวิวไม่สำเร็จ: ${upErr.message}` },
          { status: 500 },
        );
      }
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("review")
        .insert({
          order_id: orderId,
          rating,
          comment: comment || null,
        })
        .select("review_id")
        .single();

      if (insErr || !inserted) {
        return NextResponse.json(
          { message: `บันทึกรีวิวไม่สำเร็จ: ${insErr?.message || "Unknown"}` },
          { status: 500 },
        );
      }
      reviewId = inserted.review_id;
    }

    const finalImageUrls = [...keepImageUrls, ...uploadedUrls].slice(
      0,
      MAX_REVIEW_PHOTOS,
    );

    // อัปเดตรูปประกอบรีวิว
    await admin.from("reviewimage").delete().eq("review_id", reviewId);
    if (finalImageUrls.length > 0) {
      await admin.from("reviewimage").insert(
        finalImageUrls.map((url) => ({
          review_id: reviewId,
          image_url: url,
        })),
      );
    }

    try {
      revalidatePath(`/product/${order.item_id}`);
      revalidatePath("/products");
    } catch {
      // ignore revalidate errors
    }

    // แจ้งเตือนผู้ให้เช่าเมื่อได้รับรีวิวใหม่
    if (!existingRev) {
      const { data: itemRow } = await admin
        .from("item")
        .select("user_id, item_name")
        .eq("item_id", order.item_id)
        .maybeSingle();

      if (itemRow?.user_id) {
        await admin
          .from("notification")
          .insert({
            user_id: itemRow.user_id,
            type: "order_status",
            title: `ได้รับรีวิว ${rating} ดาวจากผู้เช่า ⭐`,
            message: `ผู้เช่าได้เขียนรีวิวให้ "${itemRow.item_name || "อุปกรณ์ของคุณ"}": ${comment ? `"${comment.slice(0, 80)}"` : `ให้คะแนน ${rating}/5 ดาว`}`,
            link: `/dashboard/${itemRow.user_id}/lend/${orderId}`,
            is_read: false,
          })
          .then(
            () => {},
            () => {},
          );
      }
    }

    return NextResponse.json({
      success: true,
      message: existingRev
        ? "อัปเดตรีวิวของคุณเรียบร้อยแล้ว"
        : "บันทึกรีวิวการเช่าเรียบร้อยแล้ว ขอบคุณสำหรับความคิดเห็น!",
      review: {
        review_id: reviewId,
        order_id: orderId,
        rating,
        comment,
        created_at: nowIso,
        updated_at: nowIso,
        imageUrls: finalImageUrls,
      },
    });
  } catch (err: any) {
    console.error("POST /api/rentals/[id]/review error:", err);
    return NextResponse.json(
      { message: err.message || "เกิดข้อผิดพลาดในการบันทึกรีวิว" },
      { status: 500 },
    );
  }
}
