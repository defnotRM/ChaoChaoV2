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
