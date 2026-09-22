import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;

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

  const body = await request.json().catch(() => ({}));
  const rating = Number(body.rating);
  const comment: string = body.comment || "";
  const imageUrls: string[] = Array.isArray(body.imageUrls)
    ? body.imageUrls
    : [];

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json(
      { message: "กรุณาให้คะแนน 1-5 ดาว" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("submit_rental_review", {
    p_order_id: orderId,
    p_user_id: user.id,
    p_rating: rating,
    p_comment: comment,
    p_images: imageUrls,
  });

  if (error) {
    console.error("submit_rental_review error:", error);
    return NextResponse.json(
      { message: error.message || "บันทึกรีวิวไม่สำเร็จ" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: true, reviewId: data, message: "บันทึกรีวิวเรียบร้อยแล้ว" },
    { status: 201 },
  );
}

// FR-42: ผู้เช่าแก้ไขรีวิวของตัวเองได้
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;

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

  const body = await request.json().catch(() => ({}));
  const rating = Number(body.rating);
  const comment: string = body.comment || "";
  const imageUrls: string[] = Array.isArray(body.imageUrls)
    ? body.imageUrls
    : [];

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json(
      { message: "กรุณาให้คะแนน 1-5 ดาว" },
      { status: 400 },
    );
  }

  const { data: review, error: fetchError } = await supabase
    .from("review")
    .select("review_id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (fetchError || !review) {
    return NextResponse.json({ message: "ไม่พบรีวิวนี้" }, { status: 404 });
  }

  // RLS (review_update) เช็คสิทธิ์ให้อยู่แล้วว่าต้องเป็นคู่กรณีของ order นี้
  const { error: updateError } = await supabase
    .from("review")
    .update({ rating, comment, updated_at: new Date().toISOString() })
    .eq("review_id", review.review_id);

  if (updateError) {
    console.error("Error updating review:", updateError);
    return NextResponse.json(
      { message: "แก้ไขรีวิวไม่สำเร็จ" },
      { status: 400 },
    );
  }

  // แทนที่รูปทั้งหมดด้วยชุดใหม่ (ลบของเดิมก่อนเสมอ ไม่พึ่ง cascade)
  await supabase.from("reviewimage").delete().eq("review_id", review.review_id);
  if (imageUrls.length > 0) {
    await supabase
      .from("reviewimage")
      .insert(
        imageUrls.map((url) => ({
          review_id: review.review_id,
          image_url: url,
        })),
      );
  }

  return NextResponse.json({ ok: true, message: "แก้ไขรีวิวเรียบร้อยแล้ว" });
}

// FR-43: ผู้เช่าลบรีวิวของตัวเองได้
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;

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

  const { data: review, error: fetchError } = await supabase
    .from("review")
    .select("review_id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (fetchError || !review) {
    return NextResponse.json({ message: "ไม่พบรีวิวนี้" }, { status: 404 });
  }

  await supabase.from("reviewimage").delete().eq("review_id", review.review_id);

  // RLS (review_delete) เช็คสิทธิ์ให้อยู่แล้วว่าต้องเป็นผู้เช่าเจ้าของรีวิวนี้
  const { error: deleteError } = await supabase
    .from("review")
    .delete()
    .eq("review_id", review.review_id);

  if (deleteError) {
    console.error("Error deleting review:", deleteError);
    return NextResponse.json({ message: "ลบรีวิวไม่สำเร็จ" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "ลบรีวิวเรียบร้อยแล้ว" });
}
