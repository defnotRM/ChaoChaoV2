"use client";

import { useEffect, useState } from "react";
import {
  Scale,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  X,
  ExternalLink,
  ShieldAlert,
  Calendar,
  DollarSign,
  User,
  Package,
  FileText,
  RefreshCw,
  Search,
  ChevronRight,
  UserX,
} from "lucide-react";

interface ReportImage {
  report_image_id: string;
  image_url: string;
}

interface DisputeReport {
  report_id: string;
  order_id: string | null;
  reporter_id: string;
  reported_user_id: string | null;
  report_type_id: string;
  description: string;
  status:
    | "pending_investigation"
    | "resolved_renter_fault"
    | "resolved_lender_fault"
    | "dismissed";
  verdict: string | null;
  damage_amount: number | null;
  created_at: string;
  updated_at: string;
  rentalreporttype?: {
    type_name: string;
  };
  rentalreportimage?: ReportImage[];
  reporter?: {
    user_id: string;
    username: string;
    email: string;
    firstname: string | null;
    lastname: string | null;
    avatar_url: string | null;
  };
  reported_user?: {
    user_id: string;
    username: string;
    email: string;
    firstname: string | null;
    lastname: string | null;
    avatar_url: string | null;
    status: string;
  };
  rentalorder?: {
    order_id: string;
    user_id: string;
    item_id: string;
    rental_fee: number;
    deposit: number;
    fee: number;
    status: string;
    start_date: string;
    end_date: string;
    meetup_location: string | null;
    return_location: string | null;
    renter?: {
      user_id: string;
      username: string;
      email: string;
      firstname: string | null;
      lastname: string | null;
    };
    item?: {
      item_id: string;
      item_name: string;
      user_id: string;
      lender?: {
        user_id: string;
        username: string;
        email: string;
        firstname: string | null;
        lastname: string | null;
      };
      itemimage?: Array<{
        image_url: string;
        is_primary: boolean;
      }>;
    };
  };
}

const thb = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

export default function AdminDisputesPage() {
  const [reports, setReports] = useState<DisputeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending_investigation");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal ดูรูปหลักฐาน
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Modal ตัดสินข้อพิพาท (Resolve Dialog)
  const [selectedDispute, setSelectedDispute] = useState<DisputeReport | null>(
    null
  );
  const [selectedOutcome, setSelectedOutcome] = useState<string>("");
  const [damageAmount, setDamageAmount] = useState<number>(0);
  const [verdictText, setVerdictText] = useState<string>("");
  const [reportStatus, setReportStatus] = useState<
    "resolved_renter_fault" | "resolved_lender_fault" | "dismissed"
  >("resolved_renter_fault");
  const [suspendUser, setSuspendUser] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchDisputes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/disputes?status=${statusFilter}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      } else {
        setMessage({ type: "error", text: "ไม่สามารถดึงข้อมูลข้อพิพาทได้" });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, [statusFilter]);

  const openResolveDialog = (dispute: DisputeReport) => {
    setSelectedDispute(dispute);
    const type = dispute.rentalreporttype?.type_name || "other";

    // ตั้งค่าเริ่มต้นตามประเภทข้อพิพาท
    if (type === "damaged_item") {
      setSelectedOutcome("damaged");
      setReportStatus("resolved_renter_fault");
      setDamageAmount(0);
      setVerdictText("อนุมัติข้อพิพาทสินค้าชำรุดเสียหาย และหักค่าเสียหายตามที่กำหนด");
    } else if (type === "stolen_item") {
      setSelectedOutcome("item_not_returned");
      setReportStatus("resolved_renter_fault");
      setDamageAmount(0);
      setVerdictText("อนุมัติข้อพิพาท ผู้เช่าไม่คืนสินค้าตามกำหนด มอบเงินประกันและค่าเช่าแก่ผู้ให้เช่า");
    } else if (type === "false_advertisement") {
      setSelectedOutcome("false_advertisement_approved");
      setReportStatus("resolved_lender_fault");
      setDamageAmount(0);
      setVerdictText("อนุมัติข้อพิพาทสินค้าไม่ตรงปก คืนเงินค่าเช่าและเงินประกันเต็มจำนวนแก่ผู้เช่า");
    } else {
      setSelectedOutcome("dismiss");
      setReportStatus("dismissed");
      setDamageAmount(0);
      setVerdictText("ตรวจสอบรายงานแล้ว");
    }
    setSuspendUser(false);
  };

  const handleResolve = async () => {
    if (!selectedDispute) return;
    if (!verdictText.trim()) {
      setMessage({ type: "error", text: "กรุณาระบุคำตัดสินหรือเหตุผล" });
      return;
    }

    setActionLoading(true);
    setMessage(null);

    try {
      let suspendUserId: string | undefined = undefined;
      if (suspendUser) {
        // เลือกว่าจะแบนใคร
        if (selectedDispute.reported_user_id) {
          suspendUserId = selectedDispute.reported_user_id;
        } else if (reportStatus === "resolved_renter_fault" && selectedDispute.rentalorder) {
          suspendUserId = selectedDispute.rentalorder.user_id; // renter
        } else if (reportStatus === "resolved_lender_fault" && selectedDispute.rentalorder) {
          suspendUserId = selectedDispute.rentalorder.item?.user_id; // lender
        }
      }

      const res = await fetch(
        `/api/admin/disputes/${selectedDispute.report_id}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outcome: selectedOutcome,
            damageAmount: Number(damageAmount) || 0,
            verdict: verdictText.trim(),
            reportStatus,
            suspendUserId,
          }),
        }
      );

      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: "success",
          text: data.message || "บันทึกคำตัดสินข้อพิพาทเรียบร้อยแล้ว",
        });
        setSelectedDispute(null);
        fetchDisputes();
      } else {
        setMessage({
          type: "error",
          text: data.message || "เกิดข้อผิดพลาดในการตัดสินข้อพิพาท",
        });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.description?.toLowerCase().includes(q) ||
      r.order_id?.toLowerCase().includes(q) ||
      r.reporter?.username?.toLowerCase().includes(q) ||
      r.rentalreporttype?.type_name?.toLowerCase().includes(q) ||
      r.rentalorder?.item?.item_name?.toLowerCase().includes(q)
    );
  });

  const getReportTypeBadge = (typeName?: string) => {
    switch (typeName) {
      case "damaged_item":
        return {
          label: "สินค้าเสียหาย",
          bg: "bg-rose-50 text-rose-700 border-rose-200",
        };
      case "stolen_item":
        return {
          label: "ผู้เช่าไม่คืนของ",
          bg: "bg-amber-50 text-amber-800 border-amber-200",
        };
      case "false_advertisement":
        return {
          label: "สินค้าไม่ตรงปก",
          bg: "bg-purple-50 text-purple-700 border-purple-200",
        };
      case "account_report":
        return {
          label: "รายงานบัญชีผู้ใช้",
          bg: "bg-red-50 text-red-800 border-red-200",
        };
      default:
        return {
          label: typeName || "ข้อพิพาททั่วไป",
          bg: "bg-slate-100 text-slate-700 border-slate-200",
        };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending_investigation":
        return {
          label: "รอการตัดสิน",
          bg: "bg-amber-500/15 text-amber-800",
          dot: "bg-amber-500",
        };
      case "resolved_renter_fault":
        return {
          label: "ผู้เช่าผิด (หักเงิน/ยึดประกัน)",
          bg: "bg-sky-500/15 text-sky-800",
          dot: "bg-sky-500",
        };
      case "resolved_lender_fault":
        return {
          label: "ผู้ให้เช่าผิด (คืนเงินผู้เช่า)",
          bg: "bg-indigo-500/15 text-indigo-800",
          dot: "bg-indigo-500",
        };
      case "dismissed":
        return {
          label: "ยกเลิกคำร้อง (ปกติ)",
          bg: "bg-slate-100 text-slate-700",
          dot: "bg-slate-400",
        };
      default:
        return { label: status, bg: "bg-slate-100 text-slate-700", dot: "bg-slate-400" };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            ตัดสินข้อพิพาทและรายงาน (Dispute Resolution)
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            พิจารณาหลักฐาน ตรวจสอบข้อร้องเรียน และสั่งตัดยอดเงินตามเงื่อนไข
          </p>
        </div>
        <button
          type="button"
          onClick={fetchDisputes}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#3f6593] hover:bg-sky-50 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>รีเฟรชข้อพิพาท</span>
        </button>
      </div>

      {/* Alert Message */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-2xl p-4 text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setStatusFilter("pending_investigation")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              statusFilter === "pending_investigation"
                ? "bg-white text-[#1b3554] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            รอการตัดสิน (Pending)
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              statusFilter === "all"
                ? "bg-white text-[#1b3554] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ทั้งหมด (All)
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("dismissed")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              statusFilter === "dismissed"
                ? "bg-white text-[#1b3554] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ยกเลิกแล้ว
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหารหัสออเดอร์, ชื่อสินค้า, ผู้ร้อง..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-sky-100"
          />
        </div>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <RefreshCw className="h-8 w-8 animate-spin text-[#1b3554]" />
          <p className="mt-3 text-sm font-medium">กำลังโหลดข้อมูลข้อพิพาท...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h3 className="mt-3 text-base font-bold text-slate-900">
            ไม่มีรายการข้อพิพาทในสถานะนี้
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            เมื่อมีผู้ใช้งานรายงานข้อพิพาท รายการจะปรากฏที่นี่เพื่อรอแอดมินตัดสิน
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredReports.map((report) => {
            const typeInfo = getReportTypeBadge(
              report.rentalreporttype?.type_name
            );
            const statusInfo = getStatusBadge(report.status);
            const order = report.rentalorder;
            const isPending = report.status === "pending_investigation";

            return (
              <div
                key={report.report_id}
                className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition hover:shadow-md"
              >
                {/* Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${typeInfo.bg}`}
                    >
                      {typeInfo.label}
                    </span>
                    {report.order_id && (
                      <span className="font-mono text-xs text-slate-500">
                        Order ID: {report.order_id.substring(0, 8)}...
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.bg}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`}
                      />
                      {statusInfo.label}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(report.created_at).toLocaleDateString("th-TH", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Body Details */}
                <div className="p-6">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* ข้อมูล 1: ผู้ร้องเรียน & รายละเอียดคำร้อง */}
                    <div className="space-y-3 lg:col-span-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1b3554] text-xs font-bold text-white">
                          {report.reporter?.username?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900">
                              ผู้ร้องเรียน: {report.reporter?.username}
                            </span>
                            <span className="text-xs text-slate-400">
                              ({report.reporter?.email})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* คำอธิบาย */}
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <span className="text-xs font-bold text-slate-600 block mb-1">
                          รายละเอียดข้อพิพาทที่รายงาน:
                        </span>
                        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                          {report.description}
                        </p>
                      </div>

                      {/* รูปหลักฐาน */}
                      {report.rentalreportimage &&
                        report.rentalreportimage.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-xs font-bold text-slate-600 block">
                              รูปถ่ายหลักฐาน ({report.rentalreportimage.length} รูป):
                            </span>
                            <div className="flex flex-wrap gap-2.5">
                              {report.rentalreportimage.map((img) => (
                                <div
                                  key={img.report_image_id}
                                  onClick={() => setPreviewImage(img.image_url)}
                                  className="group relative h-20 w-20 cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition hover:border-[#3f6593]"
                                >
                                  <img
                                    src={img.image_url}
                                    alt="Evidence"
                                    className="h-full w-full object-cover transition group-hover:scale-105"
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                                    <Eye className="h-4 w-4 text-white" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* ผลตัดสินเดิม (ถ้ามี) */}
                      {report.verdict && (
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3.5">
                          <span className="text-xs font-bold text-emerald-800 block mb-0.5">
                            คำตัดสินของแอดมิน:
                          </span>
                          <p className="text-xs text-emerald-900">
                            {report.verdict}
                          </p>
                          {report.damage_amount !== null &&
                            report.damage_amount > 0 && (
                              <p className="mt-1 text-xs font-semibold text-emerald-800">
                                หักค่าเสียหาย: {thb.format(report.damage_amount)}
                              </p>
                            )}
                        </div>
                      )}
                    </div>

                    {/* ข้อมูล 2: รายละเอียดออเดอร์และการเงิน */}
                    {order ? (
                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
                        <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5">
                          <Package className="h-4 w-4 text-[#1b3554]" />
                          <h4 className="text-xs font-bold text-slate-900">
                            ข้อมูลรายการเช่า
                          </h4>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          <div>
                            <span className="text-slate-400">สินค้า:</span>{" "}
                            <span className="font-bold text-slate-800">
                              {order.item?.item_name || "ไม่มีข้อมูลสินค้า"}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-slate-400">ผู้ให้เช่า:</span>
                            <span className="font-medium text-slate-700">
                              {order.item?.lender?.username || "-"}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-slate-400">ผู้เช่า:</span>
                            <span className="font-medium text-slate-700">
                              {order.renter?.username || "-"}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-slate-400">ค่าเช่า:</span>
                            <span className="font-semibold text-slate-800">
                              {thb.format(order.rental_fee)}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-slate-400">เงินประกัน (Deposit):</span>
                            <span className="font-bold text-[#1b3554]">
                              {thb.format(order.deposit)}
                            </span>
                          </div>

                          <div className="flex justify-between border-t border-slate-200/80 pt-1.5">
                            <span className="text-slate-400">สถานะ Order:</span>
                            <span className="font-mono font-medium text-slate-700">
                              {order.status}
                            </span>
                          </div>
                        </div>

                        {isPending && (
                          <button
                            type="button"
                            onClick={() => openResolveDialog(report)}
                            className="mt-2 w-full rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] py-2.5 text-xs font-semibold text-white shadow-md transition hover:from-[#000f22] hover:to-[#1b3554] active:scale-95"
                          >
                            <Scale className="inline-block h-3.5 w-3.5 mr-1.5" />
                            <span>ตัดสินข้อพิพาทนี้</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      // กรณีรายงานบัญชี
                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
                        <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5">
                          <User className="h-4 w-4 text-red-600" />
                          <h4 className="text-xs font-bold text-slate-900">
                            ข้อมูลบัญชีที่ถูกรายงาน
                          </h4>
                        </div>

                        {report.reported_user ? (
                          <div className="space-y-1.5 text-xs">
                            <div>
                              <span className="text-slate-400">ชื่อผู้ใช้:</span>{" "}
                              <span className="font-bold text-slate-800">
                                {report.reported_user.username}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">อีเมล:</span>{" "}
                              <span className="text-slate-700">
                                {report.reported_user.email}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">สถานะบัญชีปัจจุบัน:</span>{" "}
                              <span
                                className={`font-semibold ${
                                  report.reported_user.status === "Suspended"
                                    ? "text-rose-600"
                                    : "text-emerald-700"
                                }`}
                              >
                                {report.reported_user.status}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">
                            ไม่มีข้อมูลบัญชีที่ถูกระบุ
                          </p>
                        )}

                        {isPending && (
                          <button
                            type="button"
                            onClick={() => openResolveDialog(report)}
                            className="mt-2 w-full rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] py-2.5 text-xs font-semibold text-white shadow-md transition hover:from-[#000f22] hover:to-[#1b3554] active:scale-95"
                          >
                            <Scale className="inline-block h-3.5 w-3.5 mr-1.5" />
                            <span>พิจารณาคำร้อง</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal ดูรูปภาพหลักฐาน */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-3xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">รูปถ่ายหลักฐาน</h3>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 flex max-h-[75vh] items-center justify-center overflow-auto rounded-2xl bg-slate-900/5 p-2">
              <img
                src={previewImage}
                alt="Evidence"
                className="max-h-[70vh] w-auto rounded-xl object-contain"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <a
                href={previewImage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>เปิดรูปในแท็บใหม่</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal ตัดสินข้อพิพาท (Dispute Resolution Dialog) */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-[#1b3554]" />
                <h3 className="text-base font-bold text-slate-900">
                  ตัดสินข้อพิพาท
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDispute(null)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* สรุปประเภท */}
              <div className="rounded-2xl bg-slate-50 p-3.5 text-xs text-slate-600 space-y-1">
                <div>
                  <span className="font-bold text-slate-800">ประเภท:</span>{" "}
                  {selectedDispute.rentalreporttype?.type_name || "ข้อพิพาท"}
                </div>
                {selectedDispute.rentalorder && (
                  <div>
                    <span className="font-bold text-slate-800">เงินประกันในระบบ:</span>{" "}
                    <span className="font-bold text-[#1b3554]">
                      {thb.format(selectedDispute.rentalorder.deposit)}
                    </span>
                  </div>
                )}
              </div>

              {/* ตัวเลือก Outcome ตามประเภทข้อพิพาท */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  ผลการตัดสิน (Outcome):
                </label>

                {selectedDispute.rentalreporttype?.type_name ===
                  "damaged_item" && (
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-sky-50/50">
                      <input
                        type="radio"
                        name="outcome"
                        value="damaged"
                        checked={selectedOutcome === "damaged"}
                        onChange={() => {
                          setSelectedOutcome("damaged");
                          setReportStatus("resolved_renter_fault");
                        }}
                        className="mt-0.5 text-[#1b3554]"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 block">
                          อนุมัติ: สินค้าเสียหายจริง (หักเงินประกันผู้เช่า)
                        </span>
                        <span className="text-slate-500">
                          ระบุจำนวนค่าเสียหาย ระบบจะหักจากเงินประกันและโอนให้ผู้ให้เช่า
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-sky-50/50">
                      <input
                        type="radio"
                        name="outcome"
                        value="happy"
                        checked={selectedOutcome === "happy"}
                        onChange={() => {
                          setSelectedOutcome("happy");
                          setReportStatus("dismissed");
                        }}
                        className="mt-0.5 text-[#1b3554]"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 block">
                          ปฏิเสธ: สินค้าไม่เสียหาย / สึกหรอตามปกติ
                        </span>
                        <span className="text-slate-500">
                          คืนเงินประกันเต็มจำนวนแก่ผู้เช่า และปิดรายการตามปกติ
                        </span>
                      </div>
                    </label>
                  </div>
                )}

                {selectedDispute.rentalreporttype?.type_name ===
                  "stolen_item" && (
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-sky-50/50">
                      <input
                        type="radio"
                        name="outcome"
                        value="item_not_returned"
                        checked={selectedOutcome === "item_not_returned"}
                        onChange={() => {
                          setSelectedOutcome("item_not_returned");
                          setReportStatus("resolved_renter_fault");
                        }}
                        className="mt-0.5 text-[#1b3554]"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 block">
                          อนุมัติ: ผู้เช่าไม่คืนสินค้าจริง
                        </span>
                        <span className="text-slate-500">
                          ยึดเงินประกันทั้งหมดมอบให้ผู้ให้เช่า พร้อมค่าเช่า
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-sky-50/50">
                      <input
                        type="radio"
                        name="outcome"
                        value="item_not_returned_rejected"
                        checked={selectedOutcome === "item_not_returned_rejected"}
                        onChange={() => {
                          setSelectedOutcome("item_not_returned_rejected");
                          setReportStatus("dismissed");
                        }}
                        className="mt-0.5 text-[#1b3554]"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 block">
                          ปฏิเสธ: ผู้เช่าได้คืนสินค้าเรียบร้อยแล้ว
                        </span>
                        <span className="text-slate-500">
                          ปิดยอดตามปกติ คืนเงินประกันแก่ผู้เช่า
                        </span>
                      </div>
                    </label>
                  </div>
                )}

                {selectedDispute.rentalreporttype?.type_name ===
                  "false_advertisement" && (
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-sky-50/50">
                      <input
                        type="radio"
                        name="outcome"
                        value="false_advertisement_approved"
                        checked={selectedOutcome === "false_advertisement_approved"}
                        onChange={() => {
                          setSelectedOutcome("false_advertisement_approved");
                          setReportStatus("resolved_lender_fault");
                        }}
                        className="mt-0.5 text-[#1b3554]"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 block">
                          อนุมัติ: สินค้าไม่ตรงปกจริง (ผู้ให้เช่าผิด)
                        </span>
                        <span className="text-slate-500">
                          คืนเงินค่าเช่าและเงินประกันเต็มจำนวนแก่ผู้เช่า
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-sky-50/50">
                      <input
                        type="radio"
                        name="outcome"
                        value="false_advertisement_rejected"
                        checked={selectedOutcome === "false_advertisement_rejected"}
                        onChange={() => {
                          setSelectedOutcome("false_advertisement_rejected");
                          setReportStatus("dismissed");
                        }}
                        className="mt-0.5 text-[#1b3554]"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 block">
                          ปฏิเสธ: สินค้าตรงตามที่ระบุไว้
                        </span>
                        <span className="text-slate-500">
                          ยกเลิกข้อพิพาท ดำเนินการต่อตามปกติ
                        </span>
                      </div>
                    </label>
                  </div>
                )}

                {/* กรณี Other / Account report */}
                {!["damaged_item", "stolen_item", "false_advertisement"].includes(
                  selectedDispute.rentalreporttype?.type_name || ""
                ) && (
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-sky-50/50">
                      <input
                        type="radio"
                        name="outcome"
                        value="suspend_user"
                        checked={selectedOutcome === "suspend_user"}
                        onChange={() => {
                          setSelectedOutcome("suspend_user");
                          setReportStatus("resolved_lender_fault");
                          setSuspendUser(true);
                        }}
                        className="mt-0.5 text-[#1b3554]"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 block">
                          อนุมัติคำร้อง: พบการกระทำผิดกฎ
                        </span>
                        <span className="text-slate-500">
                          ระงับบัญชีผู้ใช้งานที่ถูกรายงาน
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-sky-50/50">
                      <input
                        type="radio"
                        name="outcome"
                        value="dismiss"
                        checked={selectedOutcome === "dismiss"}
                        onChange={() => {
                          setSelectedOutcome("dismiss");
                          setReportStatus("dismissed");
                          setSuspendUser(false);
                        }}
                        className="mt-0.5 text-[#1b3554]"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 block">
                          ยกเลิกคำร้อง (Dismiss)
                        </span>
                        <span className="text-slate-500">
                          หลักฐานไม่เพียงพอหรือไม่พบการกระทำผิด
                        </span>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* ช่องกรอกจำนวนค่าเสียหาย (กรณี damaged) */}
              {selectedOutcome === "damaged" && (
                <div className="space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50/40 p-3.5">
                  <label className="text-xs font-bold text-slate-800">
                    ระบุจำนวนค่าเสียหาย (บาท) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="เช่น 500"
                    value={damageAmount || ""}
                    onChange={(e) => setDamageAmount(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-[#3f6593]"
                  />
                  {selectedDispute.rentalorder && (
                    <div className="mt-2 text-xs text-slate-600">
                      {damageAmount <= selectedDispute.rentalorder.deposit ? (
                        <span className="text-emerald-700 font-medium">
                          ✓ หักจากเงินประกัน {thb.format(damageAmount)} (คืนเงินประกันส่วนที่เหลือ {thb.format(selectedDispute.rentalorder.deposit - damageAmount)} ให้ผู้เช่า)
                        </span>
                      ) : (
                        <span className="text-amber-800 font-medium">
                          ⚠ ยึดเงินประกันเต็มจำนวน {thb.format(selectedDispute.rentalorder.deposit)} และเรียกเก็บเพิ่มเติมอีก {thb.format(damageAmount - selectedDispute.rentalorder.deposit)} บาทจากผู้เช่า
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ตัวเลือกระงับบัญชี */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={suspendUser}
                    onChange={(e) => setSuspendUser(e.target.checked)}
                    className="rounded text-rose-600"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    ระงับการใช้งานบัญชีผู้ใช้คู่กรณี (Suspend Account)
                  </span>
                </label>
                <p className="mt-1 ml-6 text-xs text-slate-500">
                  สำหรับกรณีทำผิดกฎร้ายแรง ไม่คืนสินค้า หรือโกง
                </p>
              </div>

              {/* ช่องกรอกคำตัดสิน */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  คำอธิบายคำตัดสิน / เหตุผล (Verdict) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={verdictText}
                  onChange={(e) => setVerdictText(e.target.value)}
                  placeholder="ระบุเหตุผลในการตัดสิน จะส่งเป็นข้อความแจ้งเตือนถึงทั้งสองฝ่าย..."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setSelectedDispute(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleResolve}
                className="rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-2 text-xs font-semibold text-white shadow-md transition hover:from-[#000f22] hover:to-[#1b3554] active:scale-95 disabled:opacity-50"
              >
                {actionLoading ? "กำลังบันทึก..." : "ยืนยันคำตัดสิน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
