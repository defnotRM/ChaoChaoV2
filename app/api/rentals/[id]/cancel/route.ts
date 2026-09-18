import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
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
    const reason: string | undefined = body.reason?.trim();
    const imageUrl: string | undefined = body.imageUrl;

    const admin = createAdminClient();

    const { data: order, error: orderError } = await admin
      .from("rentalorder")
      .select("order_id, user_id, item_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์นี้" }, { status: 404 });
    }

    let lenderId: string | null = null;
    if (order.item_id) {
      const { data: item } = await admin
        .from("item")
        .select("user_id")
        .eq("item_id", order.item_id)
        .maybeSingle();
      lenderId = item?.user_id ?? null;
    }

    let role: "renter" | "lender" | null = null;
    if (user.id === order.user_id) role = "renter";
    else if (user.id === lenderId) role = "lender";

    if (!role) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์ยกเลิกออเดอร์นี้" },
        { status: 403 },
      );
    }

    // FR-32: ผู้ให้เช่ายกเลิกต้องชี้แจงเหตุผล + แนบรูปหลักฐานเสมอ
    if (role === "lender") {
      if (!reason) {
        return NextResponse.json(
          { message: "กรุณาระบุเหตุผลที่ยกเลิก" },
          { status: 400 },
        );
      }
      if (!imageUrl) {
        return NextResponse.json(
          { message: "กรุณาแนบรูปหลักฐานประกอบการยกเลิก" },
          { status: 400 },
        );
      }
      await admin
        .from("rentalorder")
        .update({ cancel_reason: reason, cancel_reason_image_url: imageUrl })
        .eq("order_id", orderId);
    }

    const { data: newStatus, error: rpcError } = await supabase.rpc(
      "cancel_rental_order",
      {
        p_order_id: orderId,
        p_caller_id: user.id,
        p_caller_role: role,
      },
    );

    if (rpcError) {
      console.error("cancel_rental_order error:", rpcError);
      return NextResponse.json(
        { message: rpcError.message || "ยกเลิกไม่สำเร็จ" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: newStatus,
      message: "ยกเลิกรายการเช่าเรียบร้อยแล้ว",
    });
  } catch (error) {
    console.error("POST /api/rentals/[id]/cancel error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
