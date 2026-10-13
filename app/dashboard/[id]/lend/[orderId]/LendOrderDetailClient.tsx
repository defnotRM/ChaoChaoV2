"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import CountdownBanner from "./CountdownBanner";
import type { OrderTimeouts } from "@/lib/system-config";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Clock3,
  CreditCard,
  DollarSign,
  Image as ImageIcon,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Printer,
  ShieldAlert,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Upload,
  User,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react";

export interface LendOrderData {
  order: {
    order_id: string;
    item_id: string;
    user_id: string;
    meetup_location: string | null;
    return_location: string | null;
    start_date: string;
    end_date: string;
    rental_fee: number;
    deposit: number;
    total_paid: number;
    status: string;
    created_at: string;
    updated_at: string;
  };
  item: {
    id: string;
    name: string;
    rentalFeePerDay: number;
    deposit: number;
    imageUrl: string | null;
  };
  renter: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    phones?: string[];
    avatarUrl: string | null;
  };
  payments: Array<{
    payment_id: string;
    amount: number;
    status: string;
    slip_image_url?: string | null;
    date?: string;
  }>;
  lenderAfterCount?: number;
}
const MAX_AFTER_PHOTOS = 5; // หลักฐานตอนคืนของ ไม่เกิน 5 รูป
const thb = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d)));
}
function inclusiveDays(start: string, end: string) {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  return Math.floor((e - s) / 86_400_000) + 1;
}
function orderNo(orderId: string, createdAt: string) {
  const be = new Date(createdAt).getFullYear() + 543;
  return `#RNT-${be}-${orderId.slice(0, 6).toUpperCase()}`;
}

const TIMELINE = [
  "ส่งคำขอ",
  "ผู้ให้เช่าอนุมัติ",
  "รอชำระเงิน",
  "ตรวจการชำระ",
  "รับของ",
  "คืนของ",
];

function statusStep(status: string, hasPending: boolean): number {
  switch (status) {
    case "requested":
      return 1; // อยู่ที่ขั้นที่ 2 "ผู้ให้เช่าอนุมัติ" รอผู้ให้เช่ากดอนุมัติ
    case "awaiting_payment":
      return hasPending ? 3 : 2;
    case "paid":
      return 4; // ขั้นที่ 5 "รับของ" รอผู้ให้เช่าถ่ายรูปก่อนให้เช่าและส่งมอบ
    case "item_sent":
    case "item_returned":
    case "awaiting_additional_payment":
      return 5; // ขั้นที่ 6 "คืนของ" รอผู้ให้เช่าตรวจสภาพหลังใช้งาน
    case "completed":
      return TIMELINE.length; // ครบทุกขั้น (6)
    default:
      return -1; // rejected / cancelled
  }
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  requested: {
    label: "คำขอใหม่ รออนุมัติ",
    cls: "bg-amber-500/15 text-amber-800 border-amber-200",
  },
  awaiting_payment: {
    label: "อนุมัติแล้ว รอผู้เช่าชำระเงิน",
    cls: "bg-sky-500/15 text-sky-800 border-sky-200",
  },
  paid: {
    label: "ชำระเงินแล้ว รอนัดส่งมอบ",
    cls: "bg-emerald-500/15 text-emerald-800 border-emerald-200",
  },
  item_sent: {
    label: "ผู้เช่ากำลังใช้งาน",
    cls: "bg-emerald-500/15 text-emerald-800 border-emerald-200",
  },
  item_returned: {
    label: "ส่งคืนแล้ว รอตรวจสภาพ",
    cls: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  awaiting_additional_payment: {
    label: "รอชำระเพิ่ม",
    cls: "bg-amber-500/15 text-amber-800 border-amber-200",
  },
  completed: {
    label: "เสร็จสมบูรณ์",
    cls: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  },
  rejected: {
    label: "ปฏิเสธคำขอแล้ว",
    cls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  cancelled: {
    label: "ผู้เช่ายกเลิกคำขอ",
    cls: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

export default function LendOrderDetailClient({
  data,
  userId,
  timeouts,
}: {
  data: LendOrderData;
  userId: string;
  timeouts: OrderTimeouts;
}) {
  const router = useRouter();
  const { order, item, renter, payments } = data;

  const [currentStatus, setCurrentStatus] = useState<string>(order.status);
  const [paymentsList, setPaymentsList] = useState(payments);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals for Before & After evidence
  const [showAfterModal, setShowAfterModal] = useState<boolean>(false);
  const [afterFiles, setAfterFiles] = useState<File[]>([]);
  const [afterPreviews, setAfterPreviews] = useState<string[]>([]);
  const [afterDone, setAfterDone] = useState<boolean>(
    (data.lenderAfterCount ?? 0) > 0,
  );
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [slipLightboxUrl, setSlipLightboxUrl] = useState<string | null>(null);
  const [showRejectSlipForm, setShowRejectSlipForm] = useState(false);
  const [rejectSlipReason, setRejectSlipReason] = useState("");
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelImagePreview, setCancelImagePreview] = useState<string | null>(
    null,
  );
  const [reportModalType, setReportModalType] = useState<
    "damaged_item" | "stolen_item" | null
  >(null);
  const [reportDescription, setReportDescription] = useState("");
  const [reportImagePreview, setReportImagePreview] = useState<string | null>(
    null,
  );
  const [isReporting, setIsReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);

  const isOverdue =
    new Date(`${order.end_date}T00:00:00Z`).getTime() < Date.now();

  const fetchLatestOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/rentals/${order.order_id}`, {
        cache: "no-store",
        headers: { Pragma: "no-cache" },
      });
      if (!res.ok) return;
      const json = await res.json();
      const latestOrder = json.data || json;
      if (!latestOrder) return;

      if (latestOrder.status) {
        setCurrentStatus(latestOrder.status);
      }

      if (Array.isArray(latestOrder.payment)) {
        setPaymentsList(latestOrder.payment);
      }
    } catch {
      // ignore
    }
  }, [order.order_id]);

  // ปิดหน้าดูสลิปเต็มจอด้วยปุ่ม Esc
  useEffect(() => {
    if (!slipLightboxUrl) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSlipLightboxUrl(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slipLightboxUrl]);

  // Realtime subscription + fallback poll
  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`lender-order-realtime-${order.order_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rentalorder",
          filter: `order_id=eq.${order.order_id}`,
        },
        (payload) => {
          if (payload.new && (payload.new as any).status) {
            setCurrentStatus((payload.new as any).status);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payment",
          filter: `order_id=eq.${order.order_id}`,
        },
        () => {
          fetchLatestOrder();
        },
      )
      .subscribe();

    const interval = setInterval(fetchLatestOrder, 1500);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [order.order_id, fetchLatestOrder]);

  const hasPending = paymentsList.some((p) => p.status === "pending");
  const paidAmount = paymentsList
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const days = inclusiveDays(order.start_date, order.end_date);
  const rentPerDay = Number(item.rentalFeePerDay) || 0;
  const rentalFee = Number(order.rental_fee) || 0;
  const deposit = Number(order.deposit) || 0;
  const totalPaid = Number(order.total_paid) || 0;

  const step = statusStep(currentStatus, hasPending);
  const isCancelled = step === -1;
  const chip = STATUS_CHIP[currentStatus] ?? {
    label: currentStatus,
    cls: "bg-slate-100 text-slate-600",
  };

  async function handleApprovePayment() {
    try {
      setIsUpdating(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch("/api/payments/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.order_id }),
      });

      const result = await res.json();
      if (!res.ok) {
        setErrorMsg(result.message || "ไม่สามารถยืนยันการชำระเงินได้");
        return;
      }

      setCurrentStatus("paid");
      setSuccessMsg(
        "ตรวจสอบและยืนยันการชำระเงินเรียบร้อยแล้ว เข้าสู่ขั้นตอนส่งมอบอุปกรณ์",
      );
      router.refresh();
    } catch (err) {
      console.error("Error approving payment:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsUpdating(false);
    }
  }

  // ปฏิเสธสลิป: payment -> rejected ออเดอร์ยังรอชำระเงิน ให้ผู้เช่าอัปโหลดใหม่
  async function handleRejectSlip() {
    try {
      setIsUpdating(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch("/api/payments/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.order_id,
          reason: rejectSlipReason,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setErrorMsg(result.message || "ปฏิเสธสลิปไม่สำเร็จ");
        return;
      }

      setPaymentsList((list) =>
        list.map((p) =>
          p.status === "pending" ? { ...p, status: "rejected" } : p,
        ),
      );
      setShowRejectSlipForm(false);
      setRejectSlipReason("");
      setSuccessMsg(
        result.message || "ปฏิเสธสลิปแล้ว ระบบแจ้งให้ผู้เช่าอัปโหลดสลิปใหม่",
      );
      router.refresh();
    } catch (err) {
      console.error("Error rejecting slip:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleUpdateStatus(
    newStatus: "awaiting_payment" | "rejected_by_lender",
  ) {
    try {
      setIsUpdating(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch(`/api/rentals/${order.order_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await res.json();
      if (!res.ok) {
        setErrorMsg(result.message || "ไม่สามารถเปลี่ยนสถานะได้");
        return;
      }

      setCurrentStatus(newStatus);
      setSuccessMsg(
        newStatus === "awaiting_payment"
          ? "อนุมัติคำขอเช่าเรียบร้อยแล้ว ระบบได้แจ้งเตือนให้ผู้เช่าชำระเงิน"
          : "ปฏิเสธคำขอเช่าเรียบร้อยแล้ว",
      );
      router.refresh();
    } catch (err) {
      console.error("Error updating order status:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsUpdating(false);
    }
  }

  // ยกเลิกก่อนจ่ายเงิน (ผู้ให้เช่ายังไม่ได้รับเงิน ไม่มีเงื่อนไข ไม่มีฟอร์ม)
  async function handleCancelBeforePayment() {
    if (!window.confirm("ยืนยันยกเลิกรายการเช่านี้?")) return;
    try {
      setIsUpdating(true);
      setErrorMsg(null);

      const res = await fetch(`/api/rentals/${order.order_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      const result = await res.json();
      if (!res.ok) {
        setErrorMsg(result.message || "ยกเลิกไม่สำเร็จ");
        return;
      }

      setCurrentStatus("cancelled");
      setPaymentsList((list) =>
        list.map((p) =>
          p.status === "pending" ? { ...p, status: "rejected" } : p,
        ),
      );
      setSuccessMsg("ยกเลิกรายการเช่าเรียบร้อยแล้ว");
      router.refresh();
    } catch (err) {
      console.error("Cancel before payment error:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleOpenChat() {
    const res = await fetch("/api/chat/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.order_id }),
    });
    const data = await res.json();
    if (data.roomId) router.push(`/chat?roomId=${data.roomId}`);
  }

  // ยกเลิกรายการเช่าหลังชำระเงินแล้ว (ต้องแนบเหตุผล+รูปตาม FR-32)
  async function handleSubmitCancel(e: React.FormEvent) {
    e.preventDefault();
    try {
      setIsUpdating(true);
      setErrorMsg(null);

      const res = await fetch(`/api/rentals/${order.order_id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason,
          imageUrl: cancelImagePreview,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setErrorMsg(result.message || "ยกเลิกไม่สำเร็จ");
        return;
      }

      setCurrentStatus(result.status);
      setShowCancelModal(false);
      setSuccessMsg(result.message || "ยกเลิกรายการเช่าเรียบร้อยแล้ว");
      router.refresh();
    } catch (err) {
      console.error("Cancel submit error:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleSubmitReport() {
    if (!reportModalType) return;
    setIsReporting(true);
    setReportError(null);
    try {
      const res = await fetch(`/api/rentals/${order.order_id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: reportModalType,
          description: reportDescription,
          imageUrls: reportImagePreview ? [reportImagePreview] : [],
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setReportError(result.message || "ส่งรายงานไม่สำเร็จ");
        return;
      }
      setReportSuccess(result.message);
      setReportModalType(null);
      setReportDescription("");
      setReportImagePreview(null);
      router.refresh();
    } catch (err) {
      console.error("Report submit error:", err);
      setReportError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsReporting(false);
    }
  }

  // รับคืนอุปกรณ์ & บันทึกสภาพหลังการใช้งาน
  async function handleSubmitAfterReturn(e: React.FormEvent) {
    e.preventDefault();
    if (afterFiles.length === 0) {
      setErrorMsg("กรุณาแนบรูปถ่ายสภาพอุปกรณ์อย่างน้อย 1 รูป");
      return;
    }
    try {
      setIsUpdating(true);
      setErrorMsg(null);

      const formData = new FormData();
      formData.append("orderId", order.order_id);
      afterFiles.forEach((f) => formData.append("photos", f));

      const res = await fetch("/api/return", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) {
        setErrorMsg(result.message || "บันทึกหลักฐานไม่สำเร็จ");
        return;
      }

      setShowAfterModal(false);
      setAfterFiles([]);
      setAfterPreviews([]);
      setAfterDone(true);
      if (result.bothUploaded) {
        setCurrentStatus("completed");
        setSuccessMsg(
          "ตรวจสอบสภาพหลังการใช้งานและเสร็จสิ้นการเช่าเรียบร้อยแล้ว",
        );
      } else {
        setSuccessMsg(
          "บันทึกหลักฐานของคุณแล้ว กำลังรอผู้เช่าอัปโหลดหลักฐานคืนของ",
        );
      }
      router.refresh();
    } catch (err) {
      console.error("Return submit error:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-6 sm:pb-20 sm:pt-8">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb + back */}
        <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Link href="/" className="transition hover:text-[#1b3554]">
            หน้าแรก
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href={`/dashboard/${userId}`}
            className="transition hover:text-[#1b3554]"
          >
            แดชบอร์ดผู้ให้เช่า
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-[#1b3554]">จัดการคำขอเช่า</span>
        </nav>

        <Link
          href={`/dashboard/${userId}`}
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#1b3554]"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับไปแดชบอร์ดผู้ให้เช่า
        </Link>

        {/* Header */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                จัดการคำขอเช่าอุปกรณ์
              </h1>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${chip.cls}`}
              >
                {chip.label}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled
            title="ฟีเจอร์กำลังพัฒนา"
            className="inline-flex cursor-not-allowed items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-400 opacity-60 shadow-sm sm:self-auto"
          >
            <Printer className="h-4 w-4" />
            พิมพ์ใบคำขอเช่า
          </button>
        </header>

        {/* Alerts */}
        {successMsg && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem] xl:gap-8">
          {/* ───────────── ฝั่งซ้าย (ข้อมูลคำขอและผู้เช่า) ───────────── */}
          <div className="min-w-0 space-y-6">
            {/* 1) ไทม์ไลน์สถานะ 6 ขั้น */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                สถานะการเช่าอุปกรณ์
              </h2>

              {isCancelled ? (
                <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <XCircle className="h-5 w-5 shrink-0" />
                  <span>รายการนี้ถูกยกเลิกหรือปฏิเสธแล้ว</span>
                </div>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <ol className="grid min-w-[600px] grid-cols-6 items-start gap-2">
                    {TIMELINE.map((label, index) => {
                      const isDone = index < step;
                      const isCurrent = index === step;

                      let circleCls =
                        "bg-white text-slate-300 ring-1 ring-slate-200";
                      if (isDone) {
                        circleCls =
                          "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30";
                      } else if (isCurrent) {
                        circleCls =
                          "bg-[#1b3554] text-white ring-4 ring-[#c0e6fd]/50 shadow-sm shadow-[#1b3554]/20";
                      }

                      return (
                        <li
                          key={label}
                          className="flex flex-col items-center justify-start text-center"
                        >
                          <div className="flex w-full items-center justify-center">
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${circleCls}`}
                            >
                              {isDone ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : (
                                index + 1
                              )}
                            </span>
                          </div>
                          <span
                            className={`mt-2 block text-xs ${
                              isCurrent
                                ? "font-bold text-[#1b3554]"
                                : isDone
                                  ? "font-semibold text-slate-700"
                                  : "text-slate-400"
                            }`}
                          >
                            {label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </section>

            {/* 2) ข้อมูลผู้เช่าที่ส่งคำขอเข้ามา */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c0e6fd]/30 text-[#1b3554]">
                    <User className="h-5 w-5" />
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    ข้อมูลผู้เช่า
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleOpenChat}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1b3554] transition hover:bg-sky-50"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>แชทคุยกับผู้เช่า</span>
                </button>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-xl font-bold text-white shadow-sm">
                  {renter.avatarUrl ? (
                    <img
                      src={renter.avatarUrl}
                      alt={renter.username}
                      className="h-full w-full rounded-2xl object-cover"
                    />
                  ) : (
                    <span>{renter.username.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-slate-900">
                      {renter.username || renter.fullName}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
                    {(renter.phones && renter.phones.length > 0
                      ? renter.phones
                      : renter.phone
                        ? [renter.phone]
                        : []
                    ).map((ph, idx) => (
                      <a
                        key={idx}
                        href={`tel:${ph}`}
                        className="flex items-center gap-1 hover:text-[#1b3554] transition"
                        title={`โทร ${ph}`}
                      >
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        <span>{ph}</span>
                      </a>
                    ))}
                    {renter.email && (
                      <a
                        href={`mailto:${renter.email}`}
                        className="flex items-center gap-1 hover:text-[#1b3554] transition"
                        title={`ส่งอีเมล ${renter.email}`}
                      >
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span>{renter.email}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 3) ข้อมูลอุปกรณ์ที่ถูกขอเช่า */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                ข้อมูลอุปกรณ์ของคุณ
              </h2>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 sm:h-28 sm:w-28">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-10 w-10 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Link
                    href={`/product/${order.item_id}`}
                    className="block text-base font-bold text-slate-900 transition hover:text-[#1b3554]"
                  >
                    {item.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    อัตราค่าเช่าที่ตั้งไว้:{" "}
                    <strong className="text-slate-700">
                      {thb.format(rentPerDay)}
                    </strong>{" "}
                    / วัน
                  </p>
                  <p className="text-xs text-slate-500">
                    เงินประกันอุปกรณ์:{" "}
                    <strong className="text-slate-700">
                      {thb.format(deposit)}
                    </strong>
                  </p>
                </div>
              </div>
            </section>

            {/* 4) รายละเอียดช่วงเวลาและจุดนัด */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                วันและสถานที่นัดหมาย
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c0e6fd]/30 text-[#1b3554]">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      ระยะเวลาการเช่า
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    {formatDate(order.start_date)} —{" "}
                    {formatDate(order.end_date)}
                  </p>
                  <p className="text-xs text-slate-500">
                    รวมทั้งหมด {days} วัน
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      จุดนัดรับอุปกรณ์
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    {order.meetup_location || "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(order.start_date)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      จุดนัดคืนอุปกรณ์
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    {order.return_location || "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(order.end_date)}
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* ───────────── ฝั่งขวา (การตัดสินใจ & สรุปยอดรายได้) ───────────── */}
          <aside className="space-y-6 lg:sticky lg:top-24">
            {/* กล่องการกระทำของผู้ให้เช่า */}
            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-700">
                การดำเนินการของผู้ให้เช่า
              </h2>

              {currentStatus === "requested" ? (
                <div className="space-y-3">
                  <CountdownBanner
                    deadlineISO={new Date(
                      new Date(order.created_at).getTime() +
                        timeouts.approvalHours * 3_600_000,
                    ).toISOString()}
                  />
                  <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200">
                    <p className="text-xs font-semibold text-amber-900">
                      มีคำขอเช่าใหม่ส่งเข้ามา
                    </p>
                    <p className="text-[11px] text-amber-700 mt-1">
                      กรุณาตรวจสอบวันและจุดนัดหมาย ภายใน 8 ชั่วโมง
                      จากนั้นกดอนุมัติเพื่อให้ผู้เช่าดำเนินการชำระเงิน
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus("awaiting_payment")}
                    disabled={isUpdating}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-700/20 transition duration-200 hover:from-emerald-700 hover:to-teal-800 active:scale-95 disabled:opacity-50"
                  >
                    {isUpdating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ThumbsUp className="h-4 w-4" />
                    )}
                    <span>อนุมัติการขอเช่า</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus("rejected_by_lender")}
                    disabled={isUpdating}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-2.5 text-sm font-semibold text-rose-600 transition duration-200 hover:bg-rose-50 active:scale-95 disabled:opacity-50"
                  >
                    <ThumbsDown className="h-4 w-4" />
                    <span>ปฏิเสธคำขอ</span>
                  </button>
                </div>
              ) : currentStatus === "awaiting_payment" ? (
                hasPending ? (
                  <div className="space-y-3">
                    <CountdownBanner
                      deadlineISO={new Date(
                        new Date(
                          paymentsList.find((p) => p.status === "pending")
                            ?.date || order.updated_at,
                        ).getTime() +
                          timeouts.slipReviewHours * 3_600_000,
                      ).toISOString()}
                    />
                    <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200">
                      <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                        <Clock3 className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>
                          ผู้เช่าอัปโหลดสลิปแล้ว (ยอด {thb.format(totalPaid)})
                        </span>
                      </p>
                      <p className="text-[11px] text-amber-700 mt-1">
                        กรุณาตรวจสอบยอดเงินในบัญชีธนาคาร
                        จากนั้นกดปุ่มยืนยันการชำระเงิน
                      </p>
                      {paymentsList.find((p) => p.status === "pending")
                        ?.slip_image_url && (
                        <div className="mt-2">
                          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-sky-700">
                            <ImageIcon className="h-3.5 w-3.5" />
                            <span>รูปสลิปหลักฐาน</span>
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setSlipLightboxUrl(
                                paymentsList.find((p) => p.status === "pending")
                                  ?.slip_image_url || null,
                              )
                            }
                            className="group relative block cursor-zoom-in overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                            aria-label="ดูสลิปโอนเงินขนาดเต็ม"
                          >
                            <img
                              src={
                                paymentsList.find((p) => p.status === "pending")
                                  ?.slip_image_url || ""
                              }
                              alt="สลิปโอนเงิน"
                              className="max-h-64 rounded-xl border border-amber-200 object-contain shadow-sm transition group-hover:opacity-90"
                            />
                            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
                              <ZoomIn className="h-3.5 w-3.5" />
                              กดเพื่อขยาย
                            </span>
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleApprovePayment}
                      disabled={isUpdating}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-700/20 transition duration-200 hover:from-emerald-700 hover:to-teal-800 active:scale-95 disabled:opacity-50"
                    >
                      {isUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span>ตรวจสอบและยืนยันการชำระเงิน</span>
                    </button>

                    {showRejectSlipForm ? (
                      <div className="space-y-2.5 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                        <label
                          htmlFor="reject-slip-reason"
                          className="block text-xs font-bold text-rose-800"
                        >
                          เหตุผลที่ปฏิเสธสลิป{" "}
                          <span className="font-normal text-rose-600">
                            (ไม่บังคับ แจ้งให้ผู้เช่าทราบ)
                          </span>
                        </label>
                        <textarea
                          id="reject-slip-reason"
                          rows={2}
                          maxLength={300}
                          value={rejectSlipReason}
                          onChange={(e) => setRejectSlipReason(e.target.value)}
                          placeholder="เช่น ยอดเงินไม่ตรง / ไม่พบเงินเข้าบัญชี / สลิปไม่ชัด"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#3f6593] focus:ring-4 focus:ring-sky-100"
                        />
                        <p className="text-[11px] text-rose-700">
                          ผู้เช่าจะได้รับแจ้งเตือนให้อัปโหลดสลิปใหม่ภายใน 8
                          ชั่วโมง รายการเช่ายังไม่ถูกยกเลิก
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowRejectSlipForm(false);
                              setRejectSlipReason("");
                            }}
                            disabled={isUpdating}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                          >
                            กลับ
                          </button>
                          <button
                            type="button"
                            onClick={handleRejectSlip}
                            disabled={isUpdating}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 active:scale-95 disabled:opacity-50"
                          >
                            {isUpdating ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                            ยืนยันปฏิเสธสลิป
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowRejectSlipForm(true)}
                        disabled={isUpdating}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 active:scale-95 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        <span>ปฏิเสธสลิป ให้ผู้เช่าอัปโหลดใหม่</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="rounded-2xl bg-sky-50 p-4 border border-sky-200 space-y-2">
                      <div className="flex items-center gap-2 text-sky-800 font-bold text-sm">
                        <Clock className="h-4 w-4 text-sky-600" />
                        <span>อนุมัติแล้ว · รอผู้เช่าชำระเงิน</span>
                      </div>
                      <p className="text-xs text-sky-700">
                        ระบบเปิดให้ผู้เช่าโอนเงินและอัปโหลดสลิปแล้ว
                        เมื่อผู้เช่าโอนแล้วคุณจะสามารถกดตรวจรับการชำระเงินได้ที่นี่
                      </p>
                      {paymentsList.some((p) => p.status === "rejected") && (
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                          <XCircle className="h-3.5 w-3.5 shrink-0" />
                          คุณปฏิเสธสลิปก่อนหน้าแล้ว · รอผู้เช่าอัปโหลดสลิปใหม่
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelBeforePayment}
                      disabled={isUpdating}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>ยกเลิกรายการเช่า</span>
                    </button>
                  </div>
                )
              ) : currentStatus === "paid" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-200 space-y-1">
                    <p className="text-xs font-bold text-emerald-900">
                      ผู้เช่าชำระเงินเรียบร้อยแล้ว
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      กรุณาถ่ายรูปบันทึกสภาพอุปกรณ์ก่อนส่งมอบ
                      จากนั้นส่งมอบอุปกรณ์ให้ผู้เช่า
                    </p>
                  </div>
                  <Link
                    href={`/renter/myproductsList/${order.order_id}/handover`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition duration-200 hover:from-[#000f22] hover:to-[#1b3554] active:scale-95"
                  >
                    <Camera className="h-4 w-4" />
                    <span>ถ่ายรูปสภาพก่อนให้เช่า &amp; ส่งมอบ</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>ยกเลิกรายการเช่า</span>
                  </button>
                </div>
              ) : currentStatus === "item_sent" ||
                currentStatus === "item_returned" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-sky-50 p-4 border border-sky-200 space-y-1">
                    <p className="text-xs font-bold text-sky-900">
                      อุปกรณ์กำลังถูกเช่าใช้งาน
                    </p>
                    <p className="text-[11px] text-sky-700">
                      นัดหมายรับคืนในวันที่ {formatDate(order.end_date)}{" "}
                      เมื่อได้รับของคืนแล้ว ให้ถ่ายรูปบันทึกสภาพหลังการใช้งาน
                    </p>
                  </div>
                  {afterDone ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-xs font-bold text-emerald-900">
                        ส่งหลักฐานสภาพหลังใช้งานแล้ว
                      </p>
                      <p className="mt-1 text-[11px] text-emerald-700">
                        กำลังรอผู้เช่าอัปโหลดหลักฐานคืนของ เมื่อผู้เช่าส่งครบ
                        ระบบจะปิดงานให้อัตโนมัติ (รีเฟรชหน้าเพื่อดูสถานะล่าสุด)
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAfterModal(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-700/20 transition duration-200 hover:from-emerald-700 hover:to-teal-800 active:scale-95"
                    >
                      <Camera className="h-4 w-4" />
                      <span>ถ่ายรูปสภาพหลังใช้งาน &amp; เสร็จสิ้นการเช่า</span>
                    </button>
                  )}
                  {isOverdue && (
                    <button
                      type="button"
                      onClick={() => setReportModalType("stolen_item")}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>รายงานผู้เช่าไม่คืนสินค้า</span>
                    </button>
                  )}
                </div>
              ) : currentStatus === "completed" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-200 space-y-1.5">
                    <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>การเช่าเสร็จสมบูรณ์เรียบร้อยแล้ว</span>
                    </p>
                    <p className="text-xs text-emerald-700">
                      ตรวจรับอุปกรณ์คืนและบันทึกสภาพเรียบร้อยแล้ว
                    </p>
                  </div>
                  {reportSuccess ? (
                    <p className="text-xs font-semibold text-sky-700">
                      {reportSuccess}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReportModalType("damaged_item")}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                    >
                      รายงานสินค้าเสียหาย
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-700">
                    สถานะ: {chip.label}
                  </p>
                </div>
              )}
            </div>

            {/* สรุปค่าใช้จ่าย & รายได้ */}
            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-700">
                สรุปค่าเช่าและรายได้
              </h2>
              <dl className="mb-4 space-y-2.5">
                <SummaryRow
                  label={`ค่าเช่า (${days} วัน × ${thb.format(rentPerDay)})`}
                  value={thb.format(rentalFee)}
                />
                <SummaryRow
                  label="เงินประกัน (พักไว้กับระบบ)"
                  value={thb.format(deposit)}
                  muted
                />
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-sm font-bold text-slate-900">
                    รายได้สุทธิของคุณ
                  </span>
                  <span className="text-lg font-extrabold text-emerald-700">
                    +{thb.format(rentalFee)}
                  </span>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>

      {/* Modal 2: ถ่ายรูปสภาพสินค้าหลังการใช้งาน (Step 6) */}
      {showAfterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowAfterModal(false)}
              className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Camera className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  ถ่ายรูปสภาพอุปกรณ์หลังการใช้งาน
                </h3>
                <p className="text-xs text-slate-500">
                  บันทึกเป็นหลักฐานหลังรับอุปกรณ์คืนและเสร็จสิ้นการเช่า
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitAfterReturn} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  รูปถ่ายสภาพอุปกรณ์หลังใช้งาน{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-5 text-center hover:bg-slate-50">
                  {afterPreviews.length > 0 ? (
                    <div className="grid w-full grid-cols-3 gap-2">
                      {afterPreviews.map((src, i) => (
                        <div key={src} className="relative">
                          <img
                            src={src}
                            alt={`สภาพหลังใช้งาน ${i + 1}`}
                            className="h-24 w-full rounded-xl object-cover shadow-sm"
                          />
                          <button
                            type="button"
                            aria-label="ลบรูป"
                            onClick={() => {
                              setAfterFiles((p) => p.filter((_, x) => x !== i));
                              setAfterPreviews((p) =>
                                p.filter((_, x) => x !== i),
                              );
                            }}
                            className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-500 p-1 text-white shadow"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <Upload className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-slate-700">
                        คลิกเพื่อเลือกรูปภาพ (เลือกได้หลายรูป)
                      </p>
                      <p className="text-[11px] text-slate-400">
                        ถ่ายให้ครบทุกมุม รวมถึงจุดที่มีตำหนิ
                      </p>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-slate-500">
                    แนบแล้ว {afterFiles.length}/{MAX_AFTER_PHOTOS} รูป
                  </p>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      if (picked.length === 0) return;
                      const room = Math.max(
                        MAX_AFTER_PHOTOS - afterFiles.length,
                        0,
                      );
                      if (picked.length > room) {
                        setErrorMsg(`แนบรูปได้สูงสุด ${MAX_AFTER_PHOTOS} รูป`);
                      }
                      const take = picked.slice(0, room);
                      setAfterFiles((p) => [...p, ...take]);
                      setAfterPreviews((p) => [
                        ...p,
                        ...take.map((f) => URL.createObjectURL(f)),
                      ]);
                    }}
                    className="mt-3 block w-full text-xs text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-700"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAfterModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50"
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>ยืนยันตรวจรับคืน &amp; เสร็จสิ้นการเช่า</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {slipLightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="สลิปโอนเงินขนาดเต็ม"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
        >
          <button
            type="button"
            aria-label="ปิด"
            onClick={() => setSlipLightboxUrl(null)}
            className="absolute inset-0 bg-[#000f22]/85 backdrop-blur-sm"
          />
          <div className="relative z-10 flex max-h-full w-full max-w-2xl flex-col">
            <div className="mb-3 flex items-center justify-between gap-3 text-white">
              <p className="text-sm font-medium">
                สลิปโอนเงิน · ยอด {thb.format(totalPaid)}
              </p>
              <div className="flex items-center gap-2">
                {/* สลิปเก่าบางรายการเก็บเป็น data URI ซึ่งเบราว์เซอร์ไม่ให้เปิดในแท็บใหม่ */}
                {!slipLightboxUrl.startsWith("data:") && (
                  <a
                    href={slipLightboxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold transition hover:bg-white/20"
                  >
                    เปิดในแท็บใหม่
                  </a>
                )}
                <button
                  type="button"
                  autoFocus
                  aria-label="ปิด"
                  onClick={() => setSlipLightboxUrl(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <img
              src={slipLightboxUrl}
              alt="สลิปโอนเงินขนาดเต็ม"
              className="max-h-[80vh] w-full rounded-2xl bg-white object-contain"
            />
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              ยกเลิกรายการเช่า
            </h3>
            <p className="text-xs text-slate-500">
              ต้องชี้แจงเหตุผลและแนบรูปหลักฐานให้ผู้เช่าเห็น
              ระบบจะคืนเงินให้ผู้เช่าเต็มจำนวนเสมอ
            </p>

            <form onSubmit={handleSubmitCancel} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  เหตุผลที่ยกเลิก <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  required
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm outline-none focus:border-[#3f6593] focus:bg-white"
                  placeholder="เช่น อุปกรณ์ชำรุดกะทันหัน ไม่สามารถให้เช่าได้"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  รูปหลักฐานประกอบ <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-5 text-center hover:bg-slate-50">
                  {cancelImagePreview ? (
                    <img
                      src={cancelImagePreview}
                      alt="หลักฐานยกเลิก"
                      className="max-h-48 rounded-xl object-contain mx-auto shadow-sm"
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <Upload className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-slate-700">
                        คลิกเพื่อเลือกรูปภาพ
                      </p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () =>
                          setCancelImagePreview(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="mt-3 block w-full text-xs text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-[#1b3554] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#000f22]"
                  />
                </div>
              </div>

              {errorMsg && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                  {errorMsg}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelModal(false);
                    setErrorMsg(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ปิด
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-rose-700 disabled:opacity-50"
                >
                  {isUpdating ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reportModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {reportModalType === "damaged_item"
                ? "รายงานสินค้าเสียหาย"
                : "รายงานผู้เช่าไม่คืนสินค้า"}
            </h3>
            <p className="text-xs text-slate-500">
              แอดมินจะตรวจสอบและตัดสินภายหลัง กรุณาอธิบายรายละเอียดให้ชัดเจน
            </p>

            <div className="mt-4 space-y-4">
              <textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                required
                rows={3}
                placeholder={
                  reportModalType === "damaged_item"
                    ? "อธิบายลักษณะความเสียหาย เช่น รอยแตก ใช้งานไม่ได้ ฯลฯ"
                    : "อธิบายสถานการณ์ เช่น ติดต่อผู้เช่าไม่ได้ เลยกำหนดคืนกี่วันแล้ว"
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm outline-none focus:border-[#3f6593] focus:bg-white"
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  รูปหลักฐานประกอบ (ถ้ามี)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () =>
                        setReportImagePreview(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-[#1b3554] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#000f22]"
                />
                {reportImagePreview && (
                  <img
                    src={reportImagePreview}
                    alt="หลักฐาน"
                    className="mt-2 max-h-40 rounded-xl object-contain"
                  />
                )}
              </div>
            </div>

            {reportError && (
              <p className="mt-3 text-xs font-semibold text-rose-600">
                {reportError}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setReportModalType(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleSubmitReport}
                disabled={isReporting || !reportDescription.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-rose-700 disabled:opacity-50"
              >
                {isReporting ? "กำลังส่ง..." : "ส่งรายงาน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={`text-sm ${muted ? "text-slate-400" : "text-slate-600"}`}>
        {label}
      </dt>
      <dd
        className={`text-sm font-semibold ${accent ? "text-emerald-600" : muted ? "text-slate-400" : "text-slate-800"}`}
      >
        {value}
      </dd>
    </div>
  );
}
