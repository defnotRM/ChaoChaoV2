import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TrendingUp,
  Scale,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Banknote,
  FileText,
} from "lucide-react";

export const dynamic = "force-dynamic";

const thb = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

export default async function AdminDashboardPage() {
  const admin = createAdminClient();

  const [
    { data: feeOrders },
    { count: completedOrdersCount },
    { count: totalReportsCount },
    { count: pendingIdCount },
    { count: pendingBankCount },
    { count: pendingDisputesCount },
    { data: recentDisputes },
    { data: recentKycUsers },
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
    admin.from("rentalreport").select("*", { count: "exact", head: true }),
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
    admin
      .from("rentalreport")
      .select(
        `
        report_id,
        description,
        status,
        created_at,
        rentalreporttype (type_name),
        reporter:useraccount!rentalreport_reporter_id_fkey (username)
      `
      )
      .eq("status", "pending_investigation")
      .order("created_at", { ascending: false })
      .limit(4),
    admin
      .from("useraccount")
      .select("user_id, username, email, created_at, identity_verification_status")
      .eq("identity_verification_status", "pending")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const totalRevenue = (feeOrders || []).reduce((sum, order) => {
    return sum + (Number(order.fee) || 0);
  }, 0);

  const completedTotal = completedOrdersCount || 0;
  const reportsTotal = totalReportsCount || 0;
  const disputeRatio =
    completedTotal > 0
      ? Number(((reportsTotal / completedTotal) * 100).toFixed(1))
      : 0;

  const pendingKycTotal = (pendingIdCount || 0) + (pendingBankCount || 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          ภาพรวมระบบ (Executive Dashboard)
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          สรุปรายได้แพลตฟอร์ม อัตราส่วนข้อพิพาท และคิวงานที่ต้องดำเนินการ
        </p>
      </div>

      {/* Core Metrics + Queue Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: รายได้แพลตฟอร์ม */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              รายได้แพลตฟอร์ม
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {thb.format(totalRevenue)}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              ค่าคอมมิชชัน 10% จาก {completedTotal} รายการเช่าที่สำเร็จ
            </p>
          </div>
        </div>

        {/* Metric 2: อัตราข้อพิพาท */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              อัตราเกิดข้อพิพาท
            </span>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                disputeRatio > 10
                  ? "bg-rose-500/10 text-rose-600"
                  : "bg-sky-500/10 text-[#1b3554]"
              }`}
            >
              <Scale className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {disputeRatio}%
              </span>
              <span className="text-xs font-medium text-slate-500">
                ({reportsTotal} รายงาน)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              สัดส่วนข้อพิพาทต่อออเดอร์เช่าทั้งหมด
            </p>
          </div>
        </div>

        {/* Queue 1: คิวรอตรวจสอบยืนยันตัวตน KYC */}
        <Link
          href="/admin/kyc"
          className="group block overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:border-[#3f6593] hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              รอตรวจ KYC
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 transition group-hover:scale-105">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {pendingKycTotal}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                บัตร {pendingIdCount || 0} ใบ · ธนาคาร {pendingBankCount || 0} บัญชี
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#1b3554]" />
          </div>
        </Link>

        {/* Queue 2: คิวรอตัดสินข้อพิพาท */}
        <Link
          href="/admin/disputes"
          className="group block overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:border-[#3f6593] hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              รอตัดสินข้อพิพาท
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 transition group-hover:scale-105">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {pendingDisputesCount || 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                รายงานที่รอแอดมินตัดสิน
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#1b3554]" />
          </div>
        </Link>
      </div>

      {/* Action Queues Section */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* คิวข้อพิพาทรอดำเนินการ */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  ข้อพิพาทรอดำเนินการ (Disputes Queue)
                </h2>
                <span className="text-xs text-slate-500">
                  รายงานที่ต้องตัดสินความเสียหายหรือการคืนเงิน
                </span>
              </div>
            </div>
            <Link
              href="/admin/disputes"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b3554] hover:underline"
            >
              <span>ดูทั้งหมด</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentDisputes && recentDisputes.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentDisputes.map((dispute: any) => {
                const typeName =
                  dispute.rentalreporttype?.type_name || "ข้อพิพาท";
                const reporterName =
                  dispute.reporter?.username || "ผู้ใช้ไม่ระบุชื่อ";
                return (
                  <div
                    key={dispute.report_id}
                    className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                          {typeName}
                        </span>
                        <span className="text-xs text-slate-500">
                          โดย {reporterName}
                        </span>
                      </div>
                      <p className="line-clamp-1 text-xs text-slate-700">
                        {dispute.description}
                      </p>
                    </div>
                    <Link
                      href="/admin/disputes"
                      className="ml-4 shrink-0 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                    >
                      ตรวจสอบ
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-slate-800">
                ไม่มีข้อพิพาทค้างอยู่
              </p>
              <p className="text-xs text-slate-400">
                ระบบทำงานปกติและไม่มีข้อพิพาทที่รอดำเนินการ
              </p>
            </div>
          )}
        </div>

        {/* คิวรอตรวจ KYC */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c0e6fd]/30 text-[#1b3554]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  รอตรวจสอบตัวตน (Pending KYC)
                </h2>
                <span className="text-xs text-slate-500">
                  ผู้ใช้งานที่อัปโหลดบัตรประชาชนและรอการอนุมัติ
                </span>
              </div>
            </div>
            <Link
              href="/admin/kyc"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b3554] hover:underline"
            >
              <span>ดูทั้งหมด</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentKycUsers && recentKycUsers.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentKycUsers.map((u: any) => (
                <div
                  key={u.user_id}
                  className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {u.username}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({u.email})
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      ยื่นเรื่องเมื่อ:{" "}
                      {new Date(u.created_at).toLocaleDateString("th-TH")}
                    </p>
                  </div>
                  <Link
                    href="/admin/kyc"
                    className="ml-4 shrink-0 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    ตรวจบัตร
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-slate-800">
                ไม่มีผู้ใช้รอตรวจบัตร
              </p>
              <p className="text-xs text-slate-400">
                การยืนยันตัวตนทั้งหมดได้รับการตรวจสอบครบถ้วนแล้ว
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
