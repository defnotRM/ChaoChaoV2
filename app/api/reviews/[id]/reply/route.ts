import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: reviewId } = await params;

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
    const replyText: string = (body.reply || "").trim();

    if (!replyText) {
      return NextResponse.json(
        { message: "กรุณากรอกข้อความตอบกลับ" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: review, error: reviewError } = await admin
      .from("review")
      .select("review_id, order_id")
      .eq("review_id", reviewId)
      .maybeSingle();

    if (reviewError || !review) {
      return NextResponse.json({ message: "ไม่พบรีวิวนี้" }, { status: 404 });
    }

    const { data: order } = await admin
      .from("rentalorder")
      .select("item_id")
      .eq("order_id", review.order_id)
      .maybeSingle();

    let lenderId: string | null = null;
    if (order?.item_id) {
      const { data: item } = await admin
        .from("item")
        .select("user_id")
        .eq("item_id", order.item_id)
        .maybeSingle();
      lenderId = item?.user_id ?? null;
    }

    if (user.id !== lenderId) {
      return NextResponse.json(
        {
          message: "เฉพาะผู้ให้เช่าของสินค้าชิ้นนี้เท่านั้นที่ตอบกลับรีวิวได้",
        },
        { status: 403 },
      );
    }

    const { error: updateError } = await admin
      .from("review")
      .update({
        lender_reply: replyText,
        lender_reply_at: new Date().toISOString(),
      })
      .eq("review_id", reviewId);

    if (updateError) {
      console.error("Error saving review reply:", updateError);
      return NextResponse.json(
        { message: "บันทึกคำตอบไม่สำเร็จ" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "ตอบกลับรีวิวเรียบร้อยแล้ว",
    });
  } catch (error) {
    console.error("POST /api/reviews/[id]/reply error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}

// FR-43: ผู้ให้เช่าลบคำตอบของตัวเองได้
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: reviewId } = await params;

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

    const admin = createAdminClient();

    const { data: review, error: reviewError } = await admin
      .from("review")
      .select("review_id, order_id")
      .eq("review_id", reviewId)
      .maybeSingle();

    if (reviewError || !review) {
      return NextResponse.json({ message: "ไม่พบรีวิวนี้" }, { status: 404 });
    }

    const { data: order } = await admin
      .from("rentalorder")
      .select("item_id")
      .eq("order_id", review.order_id)
      .maybeSingle();

    let lenderId: string | null = null;
    if (order?.item_id) {
      const { data: item } = await admin
        .from("item")
        .select("user_id")
        .eq("item_id", order.item_id)
        .maybeSingle();
      lenderId = item?.user_id ?? null;
    }

    if (user.id !== lenderId) {
      return NextResponse.json(
        { message: "เฉพาะผู้ให้เช่าของสินค้าชิ้นนี้เท่านั้นที่ลบคำตอบได้" },
        { status: 403 },
      );
    }

    const { error: updateError } = await admin
      .from("review")
      .update({ lender_reply: null, lender_reply_at: null })
      .eq("review_id", reviewId);

    if (updateError) {
      console.error("Error deleting review reply:", updateError);
      return NextResponse.json(
        { message: "ลบคำตอบไม่สำเร็จ" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, message: "ลบคำตอบเรียบร้อยแล้ว" });
  } catch (error) {
    console.error("DELETE /api/reviews/[id]/reply error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
