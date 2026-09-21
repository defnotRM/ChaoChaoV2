import { NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await verifyAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    const admin = auth.admin;

    // 1. ดึงข้อมูลค่าธรรมเนียมและสถานะออเดอร์เพื่อคำนวณรายได้แพลตฟอร์ม
    const [
      { data: feeOrders, error: feeError },
      { count: completedOrdersCount, error: orderCountError },
      { count: totalReportsCount, error: reportCountError },
      { count: pendingIdCount, error: idCountError },
      { count: pendingBankCount, error: bankCountError },
      { count: pendingDisputesCount, error: disputeCountError },
    ] = await Promise.all([
      admin
        .from("rentalorder")
        .select("fee, status")
        .not("fee", "is", null),
      admin
        .from("rentalorder")
        .select("*", { count: "exact", head: true })
        .in("status", [
          "completed",
          "awaiting_additional_payment",
          "item_not_returned",
          "refunded_dispute",
          "rejected_at_meetup",
          "renter_noshow",
          "lender_noshow",
        ]),
      admin
        .from("rentalreport")
        .select("*", { count: "exact", head: true }),
      admin
        .from("useraccount")
        .select("*", { count: "exact", head: true })
        .eq("identity_verification_status", "pending"),
      admin
        .from("bankaccount")
        .select("*", { count: "exact", head: true })
        .eq("verification_status", "pending"),
      admin
        .from("rentalreport")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_investigation"),
    ]);

    if (feeError || orderCountError || reportCountError) {
      console.error("Stats query error:", {
        feeError,
        orderCountError,
        reportCountError,
      });
      return NextResponse.json(
        { message: "เกิดข้อผิดพลาดในการดึงข้อมูลสถิติ" },
        { status: 500 }
      );
    }

    // คำนวณรายได้รวมของแพลตฟอร์ม (Platform Revenue = SUM(rentalorder.fee))
    const totalRevenue = (feeOrders || []).reduce((sum, order) => {
      return sum + (Number(order.fee) || 0);
    }, 0);

    const completedTotal = completedOrdersCount || 0;
    const reportsTotal = totalReportsCount || 0;

    // คำนวณอัตราส่วนการเกิดข้อพิพาท (Dispute Ratio)
    // COUNT(rentalreport) / COUNT(rentalorder completed+)
    const disputeRatio =
      completedTotal > 0
        ? Number(((reportsTotal / completedTotal) * 100).toFixed(2))
        : 0;

    const pendingKycTotal = (pendingIdCount || 0) + (pendingBankCount || 0);

    return NextResponse.json({
      totalRevenue,
      disputeRatio,
      totalCompletedOrders: completedTotal,
      totalReports: reportsTotal,
      pendingKycCount: pendingKycTotal,
      pendingIdCount: pendingIdCount || 0,
      pendingBankCount: pendingBankCount || 0,
      pendingDisputesCount: pendingDisputesCount || 0,
    });
  } catch (error) {
    console.error("GET /api/admin/stats error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
