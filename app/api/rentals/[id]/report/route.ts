import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
        { status: 401 }
      );
    }

    const { id: orderId } = await props.params;
    const admin = createAdminClient();

    const [reportsRes, typesRes] = await Promise.all([
      admin
        .from("rentalreport")
        .select(
          `
          report_id,
          order_id,
          reporter_id,
          reported_user_id,
          report_type_id,
          description,
          status,
          verdict,
          damage_amount,
          created_at,
          updated_at,
          rentalreporttype (
            report_type_id,
            type_name
          ),
          rentalreportimage (
            report_image_id,
            image_url
          )
        `
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      admin.from("rentalreporttype").select("report_type_id, type_name"),
    ]);

    return NextResponse.json({
      reports: reportsRes.data || [],
      reportTypes: typesRes.data || [],
    });
  } catch (error: any) {
    console.error("GET rental report error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการดึงข้อมูลรายงานข้อพิพาท" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
        { status: 401 }
      );
    }

    const { id: orderId } = await props.params;
    if (!orderId) {
      return NextResponse.json(
        { message: "กรุณาระบุรหัสคำสั่งเช่า" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Fetch rentalorder to check participants
    const { data: order, error: orderError } = await admin
      .from("rentalorder")
      .select("order_id, user_id, status, item(user_id, item_name)")
      .eq("order_id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { message: "ไม่พบข้อมูลคำสั่งเช่า" },
        { status: 404 }
      );
    }

    const renterId = order.user_id;
    const lenderId = (order.item as any)?.user_id;

    if (user.id !== renterId && user.id !== lenderId) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์ในการรายงานข้อพิพาทสำหรับรายการนี้" },
        { status: 403 }
      );
    }

    const reportedUserId = user.id === renterId ? lenderId : renterId;

    // 2. Parse form data
    const formData = await request.formData();
    const reportTypeId = formData.get("reportTypeId") as string;
    const description = (formData.get("description") as string)?.trim();
    const damageAmountRaw = formData.get("damageAmount") as string;
    const damageAmount =
      damageAmountRaw && !isNaN(Number(damageAmountRaw))
        ? Number(damageAmountRaw)
        : null;
    const imageFiles = formData.getAll("images") as File[];

    if (!reportTypeId) {
      return NextResponse.json(
        { message: "กรุณาเลือกประเภทของปัญหา/ข้อพิพาท" },
        { status: 400 }
      );
    }

    if (!description || description.length < 10) {
      return NextResponse.json(
        { message: "กรุณาระบุรายละเอียดของปัญหาอย่างน้อย 10 ตัวอักษร" },
        { status: 400 }
      );
    }

    // 3. Upload evidence images to Supabase Storage
    const uploadedUrls: string[] = [];
    if (imageFiles && imageFiles.length > 0) {
      for (const file of imageFiles) {
        if (file && file.size > 0 && file.type?.startsWith("image/")) {
          try {
            const ext = file.name.split(".").pop()?.toLowerCase() || "png";
            const uploadRes = await uploadToStorage(
              "disputes",
              orderId,
              file,
              {
                fileName: `dispute_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`,
                contentType: file.type || "image/png",
              }
            );
            if (uploadRes.publicUrl) {
              uploadedUrls.push(uploadRes.publicUrl);
            }
          } catch (uploadErr) {
            console.warn("Dispute image upload failed:", uploadErr);
          }
        }
      }
    }

    // 4. Insert into rentalreport
    const { data: newReport, error: insertError } = await admin
      .from("rentalreport")
      .insert({
        order_id: orderId,
        reporter_id: user.id,
        reported_user_id: reportedUserId,
        report_type_id: reportTypeId,
        description,
        damage_amount: damageAmount,
        status: "pending_investigation",
      })
      .select("report_id")
      .single();

    if (insertError || !newReport) {
      console.error("Insert rentalreport error:", insertError);
      return NextResponse.json(
        { message: "ไม่สามารถบันทึกรายงานข้อพิพาทได้", details: insertError?.message },
        { status: 500 }
      );
    }

    // 5. Insert images into rentalreportimage
    if (uploadedUrls.length > 0) {
      const imageRows = uploadedUrls.map((url) => ({
        report_id: newReport.report_id,
        image_url: url,
      }));
      await admin.from("rentalreportimage").insert(imageRows);
    }

    // 6. Send notification to the reported party
    try {
      await admin.from("notification").insert({
        user_id: reportedUserId,
        type: "dispute_opened",
        title: "มีการเปิดข้อพิพาทในรายการเช่า",
        message: `มีรายงานข้อพิพาทเกี่ยวกับรายการเช่า #${orderId.slice(0, 8)} ทีมงาน Admin กำลังดำเนินการตรวจสอบ`,
        related_order_id: orderId,
        is_read: false,
      });
    } catch (notifErr) {
      console.warn("Notification error:", notifErr);
    }

    return NextResponse.json({
      success: true,
      message: "ส่งรายงานข้อพิพาทให้แอดมินเรียบร้อยแล้ว แอดมินจะดำเนินการตรวจสอบโดยเร็วที่สุด",
      reportId: newReport.report_id,
    });
  } catch (error: any) {
    console.error("POST rental report error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการส่งรายงานข้อพิพาท", details: error.message },
      { status: 500 }
    );
  }
}
