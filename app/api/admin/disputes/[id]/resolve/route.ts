import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const VALID_OUTCOMES = [
  "happy",
  "damaged",
  "lender_noshow",
  "renter_noshow",
  "renter_rejected_meetup",
  "false_advertisement_approved",
  "false_advertisement_rejected",
  "item_not_returned",
  "item_not_returned_rejected",
  "dismiss",
  "suspend_user",
];

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
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

    const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");
    if (rpcError || !isAdmin) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์ผู้ดูแลระบบ (Admin Access Required)" },
        { status: 403 },
      );
    }

    const { id: reportId } = await props.params;
    if (!reportId) {
      return NextResponse.json(
        { message: "กรุณาระบุรหัสข้อพิพาท (reportId)" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const {
      outcome,
      damageAmount = 0,
      verdict,
      reportStatus,
      suspendUserId,
    } = body;

    if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
      return NextResponse.json(
        { message: "ผลการตัดสิน (outcome) ไม่ถูกต้องตามระบบ" },
        { status: 400 },
      );
    }

    if (
      !verdict ||
      typeof verdict !== "string" ||
      verdict.trim().length === 0
    ) {
      return NextResponse.json(
        { message: "กรุณาระบุคำตัดสินหรือเหตุผล (verdict)" },
        { status: 400 },
      );
    }

    const validReportStatuses = [
      "resolved_renter_fault",
      "resolved_lender_fault",
      "dismissed",
    ];
    if (!reportStatus || !validReportStatuses.includes(reportStatus)) {
      return NextResponse.json(
        { message: "สถานะรายงาน (reportStatus) ไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // 1. ดึงข้อมูลรายงาน
    const { data: report, error: reportError } = await admin
      .from("rentalreport")
      .select("*, rentalorder(order_id, user_id, item(user_id))")
      .eq("report_id", reportId)
      .maybeSingle();

    if (reportError || !report) {
      return NextResponse.json(
        { message: "ไม่พบข้อพิพาทที่ต้องการตัดสิน" },
        { status: 404 },
      );
    }

    let settleResult: string | null = null;

    // 2. ถ้าเป็น order-related dispute และไม่ใช่ dismiss/suspend ให้เรียก settle_rental_order RPC
    const isRpcOutcome = [
      "happy",
      "damaged",
      "lender_noshow",
      "renter_noshow",
      "renter_rejected_meetup",
      "false_advertisement_approved",
      "false_advertisement_rejected",
      "item_not_returned",
      "item_not_returned_rejected",
    ].includes(outcome);

    if (report.order_id && isRpcOutcome) {
      const { data: rpcData, error: settleError } = await supabase.rpc(
        "settle_rental_order",
        {
          p_order_id: report.order_id,
          p_caller_id: user.id,
          p_outcome: outcome,
          p_damage_amount: Number(damageAmount) || 0,
        },
      );

      if (settleError) {
        console.error("Error settling rental order via RPC:", settleError);
        return NextResponse.json(
          {
            message:
              "เกิดข้อผิดพลาดในการตัดยอดเงินออเดอร์ (RPC settle_rental_order)",
            details: settleError.message,
          },
          { status: 500 },
        );
      }

      settleResult = rpcData;
    }

    // 3. อัปเดตข้อมูล rentalreport
    const { error: updateReportError } = await admin
      .from("rentalreport")
      .update({
        status: reportStatus,
        verdict: verdict.trim(),
        damage_amount: Number(damageAmount) || null,
        updated_at: new Date().toISOString(),
      })
      .eq("report_id", reportId);

    if (updateReportError) {
      console.error("Error updating rentalreport:", updateReportError);
      return NextResponse.json(
        {
          message: "บันทึกคำตัดสินลงตาราง rentalreport ไม่สำเร็จ",
          details: updateReportError.message,
        },
        { status: 500 },
      );
    }

    // 4. กรณีต้องการแบน/ระงับบัญชี (FR-39)
    if (suspendUserId) {
      const { error: suspendError } = await admin
        .from("useraccount")
        .update({
          status: "Suspended",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", suspendUserId);

      if (suspendError) {
        console.warn("Failed to suspend useraccount:", suspendError);
      }
    }

    // 5. ส่งการแจ้งเตือนไปยังคู่กรณี — เฉพาะกรณีที่ไม่มี order ให้ trigger จัดการเองอยู่แล้ว
    // (ถ้ามี order_id + เป็น outcome ที่เรียก settle_rental_order ไปแล้ว trigger บน
    // rentalorder จะสร้างแจ้งเตือนให้อัตโนมัติอยู่แล้ว ไม่ต้อง insert ซ้ำตรงนี้อีก)
    const skipNotification = report.order_id && isRpcOutcome;

    if (!skipNotification)
      try {
        const notificationsToInsert = [];

        // แจ้งเตือนผู้รายงาน
        if (report.reporter_id) {
          notificationsToInsert.push({
            user_id: report.reporter_id,
            type: "dispute_resolved",
            title: "ข้อพิพาทได้รับการตัดสินแล้ว",
            message: `คำตัดสิน: ${verdict.trim()}`,
            related_order_id: report.order_id || null,
          });
        }

        // แจ้งเตือนอีกฝ่าย (ถ้ามี)
        const order = report.rentalorder;
        if (order) {
          const renterId = order.user_id;
          const lenderId = order.item?.user_id;
          const counterpartId =
            report.reporter_id === renterId ? lenderId : renterId;

          if (counterpartId && counterpartId !== report.reporter_id) {
            notificationsToInsert.push({
              user_id: counterpartId,
              type: "dispute_resolved",
              title: "ข้อพิพาทได้รับการตัดสินแล้ว",
              message: `คำตัดสิน: ${verdict.trim()}`,
              related_order_id: report.order_id || null,
            });
          }
        } else if (
          report.reported_user_id &&
          report.reported_user_id !== report.reporter_id
        ) {
          notificationsToInsert.push({
            user_id: report.reported_user_id,
            type: "dispute_resolved",
            title: "รายงานบัญชีได้รับการตัดสินแล้ว",
            message: `คำตัดสิน: ${verdict.trim()}`,
            related_order_id: null,
          });
        }

        if (notificationsToInsert.length > 0) {
          await admin.from("notification").insert(notificationsToInsert);
        }
      } catch (notifErr) {
        console.warn(
          "Failed to send dispute resolution notifications:",
          notifErr,
        );
      }

    return NextResponse.json({
      ok: true,
      message: "ตัดสินข้อพิพาทเรียบร้อยแล้ว",
      settleResult,
    });
  } catch (error) {
    console.error("POST /api/admin/disputes/[id]/resolve error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}
