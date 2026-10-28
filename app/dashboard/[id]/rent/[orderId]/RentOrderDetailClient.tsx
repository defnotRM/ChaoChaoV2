"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Image as ImageIcon,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Printer,
  QrCode,
  Star,
  Upload,
  User,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import CountdownBanner from "./CountdownBanner";
import RenterCancelModal from "@/components/orders/RenterCancelModal";
import OrderDisputeModal from "@/components/orders/OrderDisputeModal";
import OrderReviewSection, {
  type OrderReviewRecord,
} from "@/components/orders/OrderReviewSection";
import {
  OrderEvidenceModal,
  OrderEvidencePanel,
  summarizeEvidence,
  type EvidenceRecord,
} from "@/components/orders/OrderEvidenceSection";

export interface RentOrderDetailData {
  order: {
    order_id: string;
    item_id: string;
    user_id: string;
    meetup_location: string | null;
    return_location: string | null;
    start_date: string;
    end_date: string;
    meetup_time?: string | null;
    return_time?: string | null;
    rental_fee: number;
    deposit: number;
    total_paid: number;
    fee?: number;
    net_income?: number;
    status: string;
    created_at: string;
    updated_at: string;
    cancel_reason?: string | null;
    cancel_reason_image_url?: string | null;
  };
  cancellationReport?: {
    reason: string;
    images: string[];
    verdict?: string | null;
    createdAt?: string;
  } | null;
  item: {
    id: string;
    name: string;
    rentalFeePerDay: number;
    deposit: number;
    imageUrl: string | null;
    conditions: string[];
  };
  owner: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    phones?: string[];
    avatarUrl: string | null;
    status: string;
  };
  renter?: {
    id: string;
    username: string;
    fullName: string;
    avatarUrl: string | null;
  };
  payments: Array<{
    payment_id: string;
    amount: number;
    status: string;
    slip_image_url?: string | null;
    date?: string;
  }>;
  evidence?: EvidenceRecord[];
  review?: OrderReviewRecord | null;
}

const PAYMENT_WINDOW_HOURS = 8;
// ค่าเสียหายเกินเงินประกัน: ผู้เช่าต้องชำระส่วนต่างภายใน 48 ชั่วโมงหลังแอดมินตัดสิน
const ADDITIONAL_PAYMENT_WINDOW_HOURS = 48;

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
      return 1; // ส่งคำขอแล้ว (มีเครื่องหมายถูก) ปัจจุบันรอผู้ให้เช่าอนุมัติ (ขั้นที่ 2)
    case "awaiting_payment":
      return hasPending ? 3 : 2; // ถ้ามี pending slip อยู่ที่ขั้น 4 "ตรวจการชำระ" ถ้าไม่มีอยู่ที่ขั้น 3 "รอชำระเงิน"
    case "paid":
      return 4;
    case "item_sent":
      return 5;
    case "item_returned":
    case "awaiting_additional_payment":
      return 5;
    case "completed":
      return TIMELINE.length;
    default:
      return -1;
  }
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  requested: { label: "รอการอนุมัติ", cls: "bg-amber-500/15 text-amber-800" },
  awaiting_payment: { label: "รอชำระเงิน", cls: "bg-amber-500/15 text-amber-800" },
  paid: { label: "ชำระเงินแล้ว · รอรับของ", cls: "bg-emerald-500/15 text-emerald-700" },
  item_sent: { label: "กำลังเช่า", cls: "bg-sky-500/15 text-sky-700" },
  item_returned: { label: "คืนของแล้ว", cls: "bg-sky-500/15 text-sky-700" },
  awaiting_additional_payment: { label: "รอชำระเพิ่ม", cls: "bg-amber-500/15 text-amber-800" },
  completed: { label: "เสร็จสมบูรณ์", cls: "bg-emerald-500/15 text-emerald-700" },
  renter_noshow: { label: "ผู้เช่าไม่มาตามนัด (หมดเวลา 1 ชม.)", cls: "bg-rose-50 text-rose-700" },
  lender_noshow: { label: "ผู้ให้เช่าไม่มาตามนัด (หมดเวลา 1 ชม.)", cls: "bg-rose-50 text-rose-700" },
  rejected_at_meetup: { label: "ปฏิเสธรับสินค้าหน้างาน", cls: "bg-rose-50 text-rose-700" },
  disputed_at_meetup: { label: "ข้อพิพาทหน้างาน (รอแอดมิน)", cls: "bg-amber-500/15 text-amber-800" },
  refunded_dispute: { label: "คืนเงินจากข้อพิพาทแล้ว", cls: "bg-emerald-500/15 text-emerald-700" },
  item_not_returned: { label: "ไม่คืนสินค้าตามกำหนด", cls: "bg-rose-50 text-rose-700" },
  rejected: { label: "ถูกปฏิเสธ", cls: "bg-rose-50 text-rose-700" },
  rejected_by_lender: { label: "ผู้ให้เช่าปฏิเสธคำขอ", cls: "bg-rose-50 text-rose-700" },
  cancelled: { label: "ยกเลิกแล้ว", cls: "bg-rose-50 text-rose-700" },
  cancelled_by_renter: { label: "ผู้เช่ายกเลิกคำขอ", cls: "bg-rose-50 text-rose-700" },
  cancelled_by_lender: { label: "ผู้ให้เช่ายกเลิกคำขอ", cls: "bg-rose-50 text-rose-700" },
};

export default function RentOrderDetailClient({
  data,
  userId,
  timeouts: _timeouts,
}: {
  data: RentOrderDetailData;
  userId: string;
  timeouts?: any;
}) {
  const router = useRouter();
  const { order, item, owner, renter, cancellationReport } = data;
  const myAccountName =
    renter?.username || renter?.fullName || "ผู้เช่า";
  const myAvatarUrl = renter?.avatarUrl || null;
  const otherAccountName =
    owner.username || owner.fullName || "ผู้ให้เช่า";
  const otherAvatarUrl = owner.avatarUrl || null;

  const [currentStatus, setCurrentStatus] = useState(order.status);
  const [cancelReason, setCancelReason] = useState<string | null>(order.cancel_reason || null);
  const [paymentsList, setPaymentsList] = useState(data.payments);
  // updated_at ล่าสุดของออเดอร์ (ใช้เป็นจุดเริ่มนับ 48 ชม. ถ้าไม่มีเวลาตัดสินของข้อพิพาท)
  const [orderUpdatedAt, setOrderUpdatedAt] = useState<string>(order.updated_at);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [evidenceList, setEvidenceList] = useState<EvidenceRecord[]>(
    data.evidence || []
  );
  const [orderReview, setOrderReview] = useState<OrderReviewRecord | null>(
    data.review ?? null
  );
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBeforeModal, setShowBeforeModal] = useState(false);
  const [showAfterModal, setShowAfterModal] = useState(false);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [isSubmittingSlip, setIsSubmittingSlip] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showRenterCancelModal, setShowRenterCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loadingDisputes, setLoadingDisputes] = useState(false);

  const fetchDisputes = useCallback(async () => {
    try {
      setLoadingDisputes(true);
      const res = await fetch(`/api/rentals/${order.order_id}/report`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        setDisputes(json.reports || []);
      }
    } catch (err) {
      console.error("fetchDisputes error:", err);
    } finally {
      setLoadingDisputes(false);
    }
  }, [order.order_id]);

  useEffect(() => {
    fetchDisputes();
    // โหลดใหม่เมื่อสถานะออเดอร์เปลี่ยน (เช่น แอดมินตัดสินแล้วเข้า รอชำระเพิ่ม)
  }, [fetchDisputes, currentStatus]);


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
      if (latestOrder.updated_at) {
        setOrderUpdatedAt(latestOrder.updated_at);
      }
      if (latestOrder.cancel_reason) {
        setCancelReason(latestOrder.cancel_reason);
      }

      if (Array.isArray(latestOrder.payment)) {
        setPaymentsList(latestOrder.payment);
      }

      if (Array.isArray(latestOrder.evidence)) {
        setEvidenceList(latestOrder.evidence);
      }
    } catch {
      // ignore
    }
  }, [order.order_id]);

  // Realtime subscription + fallback poll
  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`renter-order-realtime-${order.order_id}`)
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
        }
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
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rentalevidenceimage",
          filter: `order_id=eq.${order.order_id}`,
        },
        () => {
          fetchLatestOrder();
        }
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
  const pendingAmount = paymentsList
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const days = inclusiveDays(order.start_date, order.end_date);
  const rentPerDay = Number(item.rentalFeePerDay) || 0;
  const rentalFee = Number(order.rental_fee) || 0;
  const deposit = Number(order.deposit) || 0;
  const totalPaid = Number(order.total_paid) || 0;
  const rentalBase = rentPerDay * days;
  const discount = rentalBase > rentalFee ? rentalBase - rentalFee : 0;

  const step = statusStep(currentStatus, hasPending);
  const isCancelled = step === -1;
  const chip = STATUS_CHIP[currentStatus] ?? { label: currentStatus, cls: "bg-slate-100 text-slate-600" };

  const canPay = currentStatus === "awaiting_payment" && !hasPending;
  const showCountdown = currentStatus === "awaiting_payment" && !hasPending;
  const deadlineISO = new Date(
    new Date(order.updated_at).getTime() + PAYMENT_WINDOW_HOURS * 3_600_000
  ).toISOString();

  const paymentStatusLabel =
    paidAmount >= totalPaid && totalPaid > 0
      ? "ชำระครบแล้ว"
      : hasPending
        ? "รอตรวจสอบสลิป"
        : "ยังไม่ชำระเงิน";
  const paymentShownAmount = paidAmount > 0 ? paidAmount : pendingAmount;

  // ── ส่วนต่างค่าเสียหายที่เกินเงินประกัน (status = awaiting_additional_payment) ──
  const isAwaitingExtra = currentStatus === "awaiting_additional_payment";
  const timeOf = (v?: string | null) => {
    const t = v ? new Date(v).getTime() : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  const extraDispute = isAwaitingExtra
    ? [...disputes]
        .filter((d: any) => Number(d.damage_amount) > deposit)
        .sort(
          (a: any, b: any) =>
            timeOf(b.updated_at || b.created_at) -
            timeOf(a.updated_at || a.created_at),
        )[0]
    : undefined;
  const damageAmountDue = extraDispute ? Number(extraDispute.damage_amount) : 0;
  const extraDue = damageAmountDue > deposit ? damageAmountDue - deposit : 0;
  const extraStartMs =
    timeOf(extraDispute?.updated_at) || timeOf(orderUpdatedAt) || Date.now();
  const extraDeadlineISO = new Date(
    extraStartMs + ADDITIONAL_PAYMENT_WINDOW_HOURS * 3_600_000,
  ).toISOString();
  // ในสถานะนี้สลิปที่ยัง pending คือสลิปส่วนต่าง (สลิปค่าเช่าเดิมเป็น paid แล้ว)
  const extraSlip = isAwaitingExtra
    ? paymentsList
        .filter((p) => p.status === "pending")
        .sort((a, b) => timeOf(b.date) - timeOf(a.date))[0]
    : undefined;

  const canHandover = currentStatus === "paid" || currentStatus === "item_sent";

  const lenderBefore = summarizeEvidence(evidenceList, "lender_before");
  const renterBefore = summarizeEvidence(evidenceList, "renter_before");
  const lenderAfter = summarizeEvidence(evidenceList, "lender_after");
  const renterAfter = summarizeEvidence(evidenceList, "renter_after");
  const showBeforeSection =
    currentStatus === "paid" ||
    currentStatus === "item_sent" ||
    currentStatus === "item_returned" ||
    currentStatus === "completed" ||
    lenderBefore !== null ||
    renterBefore !== null;
  const showAfterSection =
    currentStatus === "item_sent" ||
    currentStatus === "item_returned" ||
    currentStatus === "completed" ||
    lenderAfter !== null ||
    renterAfter !== null;

  function handleEvidenceSuccess(res: {
    status?: string;
    bothUploaded?: boolean;
    message?: string;
  }) {
    if (res.status) setCurrentStatus(res.status);
    if (res.message) setSuccessMsg(res.message);
    fetchLatestOrder();
    router.refresh();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSlipFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSlipPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!slipPreview && !slipFile) {
      setErrorMsg("กรุณาเลือกรูปภาพสลิปการโอนเงินก่อนดำเนินการ");
      return;
    }

    try {
      setIsSubmittingSlip(true);
      setErrorMsg(null);

      const payload = {
        orderId: order.order_id,
        amount: totalPaid,
        slipImageUrl: slipPreview,
      };

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        setErrorMsg(resData.message || "ส่งหลักฐานการชำระเงินไม่สำเร็จ");
        return;
      }

      setPaymentsList([
        ...paymentsList.filter((p) => p.status !== "pending"),
        {
          payment_id: resData.paymentId || "pending-pay",
          amount: totalPaid,
          status: "pending",
          slip_image_url: resData.slipUrl || slipPreview,
        },
      ]);
      setShowPaymentModal(false);
      setSuccessMsg("อัปโหลดสลิปเรียบร้อยแล้ว รอผู้ให้เช่าตรวจสอบการชำระเงิน");
      router.refresh();
    } catch (err) {
      console.error("Payment submit error:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsSubmittingSlip(false);
    }
  }

  function openExtraModal() {
    setSlipFile(null);
    setSlipPreview(null);
    setErrorMsg(null);
    setShowExtraModal(true);
  }

  // ส่งสลิปส่วนต่างค่าเสียหาย (ผู้ให้เช่าดูอย่างเดียว ไม่มีขั้นตรวจสอบ)
  async function handleSubmitExtraSlip(e: React.FormEvent) {
    e.preventDefault();
    if (!slipPreview) {
      setErrorMsg("กรุณาเลือกรูปภาพสลิปการโอนเงินก่อนส่ง");
      return;
    }
    try {
      setIsSubmittingSlip(true);
      setErrorMsg(null);

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.order_id,
          amount: extraDue,
          slipImageUrl: slipPreview,
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        setErrorMsg(resData.message || "ส่งสลิปไม่สำเร็จ กรุณาลองใหม่");
        return;
      }

      setPaymentsList([
        ...paymentsList.filter((p) => p.status !== "pending"),
        {
          payment_id: resData.paymentId || "pending-extra",
          amount: extraDue,
          status: "pending",
          slip_image_url: resData.slipUrl || slipPreview,
          date: new Date().toISOString(),
        },
      ]);
      setShowExtraModal(false);
      setSlipFile(null);
      setSlipPreview(null);
      setSuccessMsg("ส่งสลิปการโอนส่วนต่างให้ผู้ให้เช่าเรียบร้อยแล้ว");
      fetchLatestOrder();
    } catch (err) {
      console.error("Extra slip submit error:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsSubmittingSlip(false);
    }
  }

  // FR-33: ผู้เช่ายกเลิกคำขอเช่าฟรีก่อนการชำระเงิน
  async function handleCancelUnpaidOrder() {
    if (!confirm("คุณต้องการยกเลิกคำขอเช่านี้ใช่หรือไม่ (ไม่มีค่าใช้จ่าย)?")) return;
    try {
      setIsCancelling(true);
      setErrorMsg(null);
      const res = await fetch(`/api/rentals/${order.order_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "ไม่สามารถยกเลิกคำขอเช่าได้");
        return;
      }
      setCurrentStatus("cancelled");
      setSuccessMsg("ยกเลิกคำขอเช่าเรียบร้อยแล้ว (ไม่มีค่าใช้จ่าย)");
      fetchLatestOrder();
      router.refresh();
    } catch (err) {
      console.error("Cancel unpaid order error:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsCancelling(false);
    }
  }

  // FR-34: ผู้เช่ายกเลิกการเช่าที่ชำระเงินแล้วสำเร็จ
  function handleRenterCancelSuccess(res: any) {
    setCurrentStatus("cancelled");
    setSuccessMsg(res.message || "ขอยกเลิกการเช่าเรียบร้อยแล้ว");
    fetchLatestOrder();
    router.refresh();
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
          <Link href={`/dashboard/${userId}`} className="transition hover:text-[#1b3554]">
            แดชบอร์ด
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-[#1b3554]">รายละเอียดคำสั่งเช่า</span>
        </nav>

        <Link
          href={`/dashboard/${userId}`}
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#1b3554]"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับไปแดชบอร์ด
        </Link>

        {/* หัวกระดาษ */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                รายละเอียดคำสั่งเช่า
              </h1>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${chip.cls}`}>
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
            พิมพ์ใบสรุปคำสั่งเช่า
          </button>
        </header>

        {/* Alerts */}
        {successMsg && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* นาฬิกานับถอยหลัง 48 ชม. (กรณีค่าเสียหายเกินเงินประกัน ต้องชำระส่วนต่าง) */}
        {isAwaitingExtra && (
          <div className="mb-6">
            <CountdownBanner
              deadlineISO={extraDeadlineISO}
              orderId={order.order_id}
              title={
                extraSlip
                  ? "ส่งสลิปส่วนต่างให้ผู้ให้เช่าแล้ว (เวลาที่เหลือสำหรับชำระส่วนต่างค่าเสียหาย)"
                  : "กรุณาชำระส่วนต่างค่าเสียหายภายใน 48 ชั่วโมง มิฉะนั้นระบบจะระงับบัญชีและดำเนินคดีตามกฎหมาย"
              }
              expiredTitle="เลยกำหนดชำระส่วนต่างค่าเสียหาย 48 ชั่วโมงแล้ว — ระบบอาจระงับบัญชีและดำเนินคดีตามกฎหมาย"
              variant={extraSlip ? "info" : "warning"}
              onExpired={fetchLatestOrder}
            />
          </div>
        )}

        {/* Countdown banner (กรณีรอชำระเงิน FR-23: จำกัดเวลา 8 ชม.) */}
        {showCountdown && (
          <div className="mb-6">
            <CountdownBanner
              deadlineISO={deadlineISO}
              orderId={order.order_id}
              title="กรุณาชำระเงินภายในเวลา 8 ชั่วโมงหลังได้รับอนุมัติ มิฉะนั้นคำสั่งเช่าจะถูกยกเลิกอัตโนมัติ"
              expiredTitle="เลยกำหนดเวลาชำระเงิน 8 ชั่วโมงแล้ว — ระบบยกเลิกคำสั่งเช่านี้อัตโนมัติ"
              variant="warning"
              onExpired={fetchLatestOrder}
            />
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem] xl:gap-8">
          {/* ───────────── ฝั่งซ้าย (เนื้อหาหลัก) ───────────── */}
          <div className="min-w-0 space-y-6">
            {/* บัตรแสดงสถานะข้อพิพาท / รายงานปัญหา */}
            {disputes.length > 0 && (
              <section className="rounded-3xl border border-amber-300 bg-amber-50/70 p-5 sm:p-6 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                      <AlertTriangle className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-amber-950">
                        มีรายงานข้อพิพาทสำหรับคำสั่งเช่านี้ ({disputes.length} รายการ)
                      </h3>
                      <p className="text-xs text-amber-700">
                        ทีมงาน Admin กำลังตรวจสอบหลักฐานและดำเนินการระงับข้อพิพาท
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDisputeModal(true)}
                    className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100/50 self-start sm:self-auto"
                  >
                    + ส่งข้อมูลเพิ่มเติม
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  {disputes.map((dsp: any) => {
                    const statusMap: Record<string, { label: string; cls: string }> = {
                      pending_investigation: {
                        label: "กำลังตรวจสอบโดย Admin",
                        cls: "bg-amber-100 text-amber-800 border-amber-200",
                      },
                      resolved: {
                        label: "ระงับข้อพิพาทแล้ว",
                        cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
                      },
                      resolved_renter_fault: {
                        label: "ตัดสิน: ผู้เช่าเป็นฝ่ายผิด",
                        cls: "bg-rose-100 text-rose-800 border-rose-200",
                      },
                      resolved_lender_fault: {
                        label: "ตัดสิน: ผู้ให้เช่าเป็นฝ่ายผิด",
                        cls: "bg-rose-100 text-rose-800 border-rose-200",
                      },
                      dismissed: {
                        label: "ปฏิเสธคำร้อง",
                        cls: "bg-slate-100 text-slate-700 border-slate-200",
                      },
                    };
                    const sInfo = statusMap[dsp.status] || {
                      label: dsp.status,
                      cls: "bg-slate-100 text-slate-700 border-slate-200",
                    };

                    return (
                      <div
                        key={dsp.report_id}
                        className="rounded-2xl border border-amber-200/80 bg-white p-4 text-xs space-y-2 shadow-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <span className="font-bold text-slate-900">
                            ประเภท: {dsp.rentalreporttype?.type_name || "ข้อพิพาทการเช่า"}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 font-bold ${sInfo.cls}`}
                          >
                            {sInfo.label}
                          </span>
                        </div>
                        <p className="text-slate-700 leading-relaxed">
                          <strong>รายละเอียด:</strong> {dsp.description}
                        </p>
                        {dsp.verdict && (
                          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                            <p className="font-bold text-slate-900">คำตัดสินของแอดมิน (Verdict):</p>
                            <p className="text-slate-700 mt-0.5">{dsp.verdict}</p>
                            {dsp.damage_amount > 0 && (
                              <p className="mt-1 font-semibold text-rose-600">
                                จำนวนเงินค่าเสียหาย/ชดเชย: {thb.format(dsp.damage_amount)}
                              </p>
                            )}
                          </div>
                        )}
                        {(dsp.rentalreporttype?.type_name === "false_advertisement" || dsp.description?.includes("ตรงปก") || dsp.verdict?.includes("สินค้าตรงปก")) && (dsp.status === "dismissed" || dsp.verdict?.includes("สินค้าตรงปก")) && (
                          <div className="rounded-xl bg-emerald-50 p-3 border border-emerald-200 text-emerald-800 space-y-1">
                            <p className="font-bold text-xs flex items-center gap-1.5 text-emerald-900">
                              <span className="text-emerald-600 font-bold">✓</span> รายละเอียดการคืนเงิน (สินค้าตรงปก):
                            </p>
                            <p className="text-xs text-emerald-800 leading-relaxed">
                              • คืนเงินประกัน 100% ({thb.format(deposit)}) ให้แก่คุณเรียบร้อยแล้ว
                              <br />
                              • โอนค่าเช่าหลังหักค่าธรรมเนียม 10% ให้แก่ผู้ให้เช่าตามเงื่อนไข
                            </p>
                          </div>
                        )}
                        {dsp.rentalreportimage && dsp.rentalreportimage.length > 0 && (
                          <div>
                            <p className="font-bold text-slate-600 mb-1.5">
                              หลักฐานที่แนบ ({dsp.rentalreportimage.length} รูป):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {dsp.rentalreportimage.map((img: any) => (
                                <a
                                  key={img.report_image_id}
                                  href={img.image_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="h-16 w-16 overflow-hidden rounded-xl border border-slate-200 hover:opacity-80 transition"
                                >
                                  <img
                                    src={img.image_url}
                                    alt="evidence"
                                    className="h-full w-full object-cover"
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {/* 1) ไทม์ไลน์สถานะ 6 ขั้น */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                สถานะการเช่าอุปกรณ์
              </h2>

              {isCancelled ? (
                <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  <div className="flex items-center gap-2.5 font-bold">
                    <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
                    <span>
                      {currentStatus === "renter_noshow"
                        ? "ปิดการเช่า: ผู้เช่าไม่อัปโหลดรูปหลักฐานภายใน 1 ชั่วโมง (ผู้เช่าไม่มาตามนัด)"
                        : currentStatus === "lender_noshow"
                          ? "ปิดการเช่า: ผู้ให้เช่าไม่อัปโหลดรูปหลักฐานภายใน 1 ชั่วโมง (ผู้ให้เช่าไม่มาตามนัด)"
                          : currentStatus === "rejected_at_meetup"
                            ? "ปิดการเช่า: ผู้เช่าปฏิเสธรับสินค้าหน้างาน"
                            : (order.cancel_reason || cancelReason)
                              ? `สถานะ: ยกเลิกคำขอ (${order.cancel_reason || cancelReason})`
                              : `สถานะ: ${chip.label}`}
                    </span>
                  </div>
                  {currentStatus === "renter_noshow" && (
                    <p className="text-xs text-rose-700 leading-relaxed pl-7">
                      ระบบคืนเงินประกันทั้งหมด ({thb.format(deposit)}) ให้แก่ผู้เช่า และโอนค่าเช่าทั้งหมด ({thb.format(rentalFee)}) แก่ผู้ให้เช่า
                    </p>
                  )}
                  {currentStatus === "lender_noshow" && (
                    <p className="text-xs text-rose-700 leading-relaxed pl-7">
                      ระบบคืนเงินทั้งหมด (เงินประกัน {thb.format(deposit)} + ค่าเช่า {thb.format(rentalFee)} = {thb.format(deposit + rentalFee)}) ให้แก่ผู้เช่า
                    </p>
                  )}
                  {currentStatus === "rejected_at_meetup" && (
                    <p className="text-xs text-rose-700 leading-relaxed pl-7">
                      ระบบคืนเงินประกันทั้งหมด ({thb.format(deposit)}) พร้อมค่าเช่า 20% ({thb.format(rentalFee * 0.2)}) รวม {thb.format(deposit + rentalFee * 0.2)} ให้แก่ผู้เช่า และโอนค่าเช่าอีก 80% ({thb.format(rentalFee * 0.8)}) เป็นค่าเสียเวลาแก่ผู้ให้เช่า
                    </p>
                  )}
                  {(order.cancel_reason || cancelReason)?.includes("กะทันหัน") && (
                    <p className="text-xs text-rose-700 leading-relaxed pl-7">
                      ยกเลิกกะทันหัน (ภายใน 2 วันก่อนนัดรับ): ระบบได้คืนเงินประกัน ({thb.format(deposit)}) ให้แก่คุณ และโอนค่าเช่าหลังหักค่าธรรมเนียมให้แก่ผู้ให้เช่าเพื่อชดเชยค่าเสียโอกาสตามเงื่อนไข
                    </p>
                  )}
                  {(order.cancel_reason || cancelReason)?.includes("ล่วงหน้า") && (
                    <p className="text-xs text-rose-700 leading-relaxed pl-7">
                      ยกเลิกล่วงหน้า (มากกว่า 2 วันก่อนนัดรับ): ระบบได้คืนเงินประกันและค่าเช่าเต็มจำนวน 100% ({thb.format(deposit + rentalFee)}) ให้แก่คุณเรียบร้อยแล้ว
                    </p>
                  )}
                  {(order.cancel_reason || cancelReason)?.includes("ไม่ตรวจสลิป") && (
                    <p className="text-xs text-rose-700 leading-relaxed pl-7">
                      ระบบยกเลิกคำสั่งเช่าอัตโนมัติเนื่องจากผู้ให้เช่าไม่ได้ตรวจสอบสลิปภายใน 8 ชั่วโมง ระบบได้คืนเงินทั้งหมด ({thb.format(deposit + rentalFee)}) ให้แก่คุณเรียบร้อยแล้ว
                    </p>
                  )}
                  {cancellationReport && (
                    <div className="rounded-xl border border-rose-200 bg-white p-3.5 shadow-2xs space-y-2 mt-2">
                      <div className="flex items-center gap-2 font-semibold text-rose-900 text-xs">
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                        <span>เหตุผลและหลักฐานการยกเลิก:</span>
                      </div>
                      <p className="text-xs text-slate-700 bg-rose-50/50 rounded-lg p-2.5 border border-rose-100 whitespace-pre-wrap">
                        {cancellationReport.reason}
                      </p>
                      {cancellationReport.images && cancellationReport.images.length > 0 && (
                        <div>
                          <p className="text-[11px] font-medium text-slate-500 mb-1.5">
                            รูปภาพหลักฐานประกอบ ({cancellationReport.images.length} รูป):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {cancellationReport.images.map((imgUrl, idx) => (
                              <a
                                key={idx}
                                href={imgUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="group relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-rose-400 transition"
                              >
                                <img
                                  src={imgUrl}
                                  alt={`หลักฐานการยกเลิกรูปที่ ${idx + 1}`}
                                  className="h-full w-full object-cover group-hover:scale-105 transition duration-200"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <ol className="grid min-w-[600px] grid-cols-6 items-start gap-2">
                    {TIMELINE.map((label, index) => {
                      const isDone = index < step;
                      const isCurrent = index === step;

                      let circleCls = "bg-white text-slate-300 ring-1 ring-slate-200";
                      if (isDone) {
                        circleCls = "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30";
                      } else if (isCurrent) {
                        circleCls = "bg-[#1b3554] text-white ring-4 ring-[#c0e6fd]/50 shadow-sm shadow-[#1b3554]/20";
                      }

                      return (
                        <li key={label} className="flex flex-col items-center justify-start text-center">
                          <div className="flex w-full items-center justify-center">
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${circleCls}`}
                            >
                              {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
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

            {/* 2) ข้อมูลผู้ให้เช่า */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c0e6fd]/30 text-[#1b3554]">
                    <User className="h-5 w-5" />
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">ข้อมูลผู้ให้เช่า</h2>
                </div>
                <Link
                  href={owner.id ? `/chat?userId=${owner.id}` : "/chat"}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1b3554] transition hover:bg-sky-50"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>แชทคุยกับผู้ให้เช่า</span>
                </Link>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-xl font-bold text-white shadow-sm overflow-hidden">
                  {owner.avatarUrl ? (
                    <img src={owner.avatarUrl} alt={owner.username} className="h-full w-full object-cover" />
                  ) : (
                    <span>{(owner.fullName || owner.username || "L").charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-slate-900">
                      {owner.username || owner.fullName}
                    </span>
                    {owner.status === "Active" && (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
                        <BadgeCheck className="h-4 w-4" />
                        ยืนยันตัวตน
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
                    {((owner.phones && owner.phones.length > 0)
                      ? owner.phones
                      : owner.phone
                      ? [owner.phone]
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
                    {owner.email && (
                      <a
                        href={`mailto:${owner.email}`}
                        className="flex items-center gap-1 hover:text-[#1b3554] transition"
                        title={`ส่งอีเมล ${owner.email}`}
                      >
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span>{owner.email}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 3) ข้อมูลอุปกรณ์ที่เช่า */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                ข้อมูลอุปกรณ์ที่เช่า
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
                    <strong className="text-slate-700">{thb.format(rentPerDay)}</strong> / วัน
                  </p>
                  <p className="text-xs text-slate-500">
                    เงินประกันอุปกรณ์:{" "}
                    <strong className="text-slate-700">{thb.format(deposit)}</strong>
                  </p>
                </div>
              </div>

              {/* ข้อตกลง/เงื่อนไขการเช่า */}
              {item.conditions.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="mb-2 text-xs font-bold text-slate-700">เงื่อนไขเฉพาะของอุปกรณ์นี้</h3>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {item.conditions.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3f6593]" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* 3) รายละเอียดช่วงเวลาและจุดนัด */}
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
                    <span className="text-sm font-bold text-slate-900">ระยะเวลาการเช่า</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    {formatDate(order.start_date)} — {formatDate(order.end_date)}
                  </p>
                  <p className="text-xs text-slate-500">รวมทั้งหมด {days} วัน</p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-bold text-slate-900">จุดนัดรับอุปกรณ์</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{order.meetup_location || "—"}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(order.start_date)} · เวลา {(order.meetup_time || "12:00").slice(0, 5)} น.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-bold text-slate-900">จุดนัดคืนอุปกรณ์</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{order.return_location || "—"}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(order.end_date)} · เวลา {(order.return_time || "12:00").slice(0, 5)} น.
                  </p>
                </div>
              </div>
            </section>

            {/* 5) หลักฐานตอนรับของ (ก่อนเริ่มเช่า - ทั้งสองฝ่ายต้องอัปโหลด) */}
            {showBeforeSection && (
              <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                <OrderEvidencePanel
                  orderId={order.order_id}
                  userId={userId}
                  viewerRole="renter"
                  myName={myAccountName}
                  myAvatarUrl={myAvatarUrl}
                  otherName={otherAccountName}
                  otherAvatarUrl={otherAvatarUrl}
                  phase="before"
                  canUpload={currentStatus === "paid"}
                  scheduledDate={order.start_date}
                  scheduledTime={order.meetup_time || "12:00"}
                  rentalFee={rentalFee}
                  deposit={deposit}
                  evidenceList={evidenceList}
                  onSuccess={handleEvidenceSuccess}
                />
              </section>
            )}

            {/* 6) หลักฐานตอนคืนของ (หลังใช้งาน - ทั้งสองฝ่ายต้องอัปโหลด) */}
            {showAfterSection && (
              <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                <OrderEvidencePanel
                  orderId={order.order_id}
                  userId={userId}
                  viewerRole="renter"
                  myName={myAccountName}
                  myAvatarUrl={myAvatarUrl}
                  otherName={otherAccountName}
                  otherAvatarUrl={otherAvatarUrl}
                  phase="after"
                  canUpload={
                    currentStatus === "item_sent" ||
                    currentStatus === "item_returned"
                  }
                  scheduledDate={order.end_date}
                  scheduledTime={order.return_time || "12:00"}
                  rentalFee={rentalFee}
                  deposit={deposit}
                  evidenceList={evidenceList}
                  onSuccess={handleEvidenceSuccess}
                />
              </section>
            )}
            {/* 7) รีวิวการเช่าอุปกรณ์ (แสดงหลังจากการเช่าเสร็จสมบูรณ์) */}
            {currentStatus === "completed" && (
              <OrderReviewSection
                orderId={order.order_id}
                itemId={order.item_id}
                itemName={item.name}
                userId={userId}
                viewerRole="renter"
                renterName={myAccountName}
                renterAvatarUrl={myAvatarUrl}
                lenderName={otherAccountName}
                initialReview={orderReview}
                onReviewSaved={(rev, msg) => {
                  setOrderReview(rev);
                  setSuccessMsg(msg);
                  router.refresh();
                }}
              />
            )}
          </div>

          {/* ───────────── ฝั่งขวา (สรุปค่าใช้จ่าย & การดำเนินการ) ───────────── */}
          <aside className="space-y-6 lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-700">
                สรุปค่าใช้จ่าย
              </h2>
              <dl className="mb-4 space-y-2.5">
                <SummaryRow
                  label={`ค่าเช่า (${days} วัน × ${thb.format(rentPerDay)})`}
                  value={thb.format(rentalBase)}
                />
                {discount > 0 && (
                  <SummaryRow label="ส่วนลดเช่าระยะยาว" value={`−${thb.format(discount)}`} accent />
                )}
                <SummaryRow label="ค่าจัดส่ง" value={thb.format(0)} muted />
                <SummaryRow label="เงินประกัน (คืนภายหลัง)" value={thb.format(deposit)} muted />
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-sm font-bold text-slate-900">ยอดสุทธิ</span>
                  <span className="text-lg font-extrabold text-[#1b3554]">
                    {thb.format(totalPaid)}
                  </span>
                </div>
              </dl>

              {/* สถานะการชำระเงิน */}
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">สถานะการชำระเงิน</span>
                  <span
                    className={`text-xs font-bold ${
                      paidAmount >= totalPaid && totalPaid > 0
                        ? "text-emerald-600"
                        : hasPending
                          ? "text-sky-600"
                          : "text-amber-700"
                    }`}
                  >
                    {paymentStatusLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {thb.format(paymentShownAmount)} / {thb.format(totalPaid)}
                </p>
              </div>

              {/* ปุ่มการทำงาน */}
              <div className="mt-4 space-y-2.5">
                {currentStatus === "requested" ? (
                  <div className="space-y-2">
                    <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200">
                      <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                        <Clock3 className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>ส่งคำขอเช่าแล้ว · รอผู้ให้เช่าอนุมัติ</span>
                      </p>
                      <p className="text-[11px] text-amber-700 mt-1">
                        ผู้ให้เช่ามีเวลาพิจารณาและอนุมัติคำขอภายใน 8 ชั่วโมง
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelUnpaidOrder}
                      disabled={isCancelling}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 active:scale-95 disabled:opacity-50"
                    >
                      {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                      <span>ยกเลิกคำขอเช่า (ฟรี)</span>
                    </button>
                  </div>
                ) : currentStatus === "awaiting_payment" ? (
                  canPay ? (
                    <div className="space-y-2">
                      {paymentsList.some((p) => p.status === "rejected") && (
                        <div className="rounded-2xl bg-rose-50 p-3.5 border border-rose-200 text-xs text-rose-800 space-y-1">
                          <p className="font-bold flex items-center gap-1.5 text-rose-900">
                            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                            <span>สลิปก่อนหน้านี้ไม่ผ่านการตรวจสอบ</span>
                          </p>
                          <p className="text-[11px] text-rose-700">
                            ผู้ให้เช่าได้ปฏิเสธสลิป กรุณาตรวจสอบยอดโอนและแนบสลิปที่ถูกต้องใหม่อีกครั้ง
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPaymentModal(true)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition duration-200 hover:from-[#000f22] hover:to-[#1b3554] active:scale-[0.98]"
                      >
                        <Wallet className="h-4 w-4" />
                        <span>ชำระเงิน / อัปโหลดสลิป</span>
                      </button>
                      <p className="text-center text-[11px] text-slate-500">
                        มีเวลาชำระเงินภายใน 8 ชั่วโมงหลังได้รับอนุมัติ
                      </p>
                      <button
                        type="button"
                        onClick={handleCancelUnpaidOrder}
                        disabled={isCancelling}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 active:scale-95 disabled:opacity-50"
                      >
                        {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                        <span>ยกเลิกคำขอเช่า (ฟรี)</span>
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-sky-50 p-4 border border-sky-200">
                      <p className="text-xs font-semibold text-sky-900 flex items-center gap-1.5">
                        <Clock3 className="h-4 w-4 text-sky-600 shrink-0" />
                        <span>อัปโหลดสลิปแล้ว · รอผู้ให้เช่าตรวจสอบ</span>
                      </p>
                      <p className="text-[11px] text-sky-700 mt-1">
                        ผู้ให้เช่ามีเวลาตรวจสอบสลิปภายใน 8 ชั่วโมง (หากเกินเวลา ระบบจะอนุมัติให้อัตโนมัติ)
                      </p>
                    </div>
                  )
                ) : currentStatus === "paid" ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-200 space-y-2">
                      <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>ชำระเงินเรียบร้อยแล้ว · ขั้นตอนรับของ</span>
                      </p>
                      <p className="text-xs text-emerald-700 leading-relaxed">
                        ทั้งคุณและผู้ให้เช่าต้องถ่ายรูปบันทึกหลักฐานสภาพอุปกรณ์ก่อนเริ่มเช่า (ฝ่ายละไม่เกิน 5 รูป) เมื่ออัปโหลดครบทั้งสองฝ่ายจะเริ่มเช่าทันที
                      </p>
                      <div className="space-y-1.5 border-t border-emerald-200/70 pt-2 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">{myAccountName} (ผู้เช่า):</span>
                          <span className={renterBefore ? "font-bold text-emerald-700" : "font-semibold text-amber-700"}>
                            {renterBefore ? `✓ อัปโหลดแล้ว (${renterBefore.count} รูป)` : "• รออัปโหลด"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">{otherAccountName} (ผู้ให้เช่า):</span>
                          <span className={lenderBefore ? "font-bold text-emerald-700" : "font-semibold text-amber-700"}>
                            {lenderBefore ? `✓ อัปโหลดแล้ว (${lenderBefore.count} รูป)` : "• รออัปโหลด"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBeforeModal(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition duration-200 hover:from-[#000f22] hover:to-[#1b3554] active:scale-95"
                    >
                      <Camera className="h-4 w-4" />
                      <span>
                        {renterBefore
                          ? "ดูรูปหลักฐานรับของ"
                          : "ถ่ายรูปสภาพก่อนรับของ & รับมอบ"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRenterCancelModal(true)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 active:scale-95"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>ขอยกเลิกการเช่า (ก่อนวันนัดรับ)</span>
                    </button>
                  </div>
                ) : currentStatus === "item_sent" || currentStatus === "item_returned" ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-sky-50 p-4 border border-sky-200 space-y-2">
                      <p className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-sky-600 shrink-0" />
                        <span>กำลังเช่าใช้งาน · ขั้นตอนคืนของ</span>
                      </p>
                      <p className="text-xs text-sky-700 leading-relaxed">
                        กำหนดคืนในวันที่ {formatDate(order.end_date)} ที่ {order.return_location || "จุดนัดคืน"} ทั้งคุณและผู้ให้เช่าต้องถ่ายรูปสภาพตอนคืน (ฝ่ายละไม่เกิน 5 รูป) เมื่อครบทั้งสองฝ่ายการเช่าจะเสร็จสมบูรณ์
                      </p>
                      <div className="space-y-1.5 border-t border-sky-200/70 pt-2 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">{myAccountName} (ผู้เช่า):</span>
                          <span className={renterAfter ? "font-bold text-emerald-700" : "font-semibold text-amber-700"}>
                            {renterAfter ? `✓ อัปโหลดแล้ว (${renterAfter.count} รูป)` : "• รออัปโหลด"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">{otherAccountName} (ผู้ให้เช่า):</span>
                          <span className={lenderAfter ? "font-bold text-emerald-700" : "font-semibold text-amber-700"}>
                            {lenderAfter ? `✓ อัปโหลดแล้ว (${lenderAfter.count} รูป)` : "• รออัปโหลด"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAfterModal(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-700/20 transition duration-200 hover:from-emerald-700 hover:to-teal-800 active:scale-95"
                    >
                      <Camera className="h-4 w-4" />
                      <span>
                        {renterAfter
                          ? "ดูรูปหลักฐานการคืนของ"
                          : "ถ่ายรูปสภาพตอนคืนอุปกรณ์"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDisputeModal(true)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-xs font-semibold text-rose-700 transition duration-200 hover:bg-rose-100 active:scale-95"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                      <span>รายงานปัญหาการคืนสินค้า</span>
                    </button>
                  </div>
                ) : currentStatus === "awaiting_additional_payment" ? (
                  <div className="space-y-2.5">
                    <div className="rounded-2xl bg-rose-50 p-4 border border-rose-200 space-y-2">
                      <p className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                        <span>ค่าเสียหายเกินเงินประกัน ต้องชำระส่วนต่าง</span>
                      </p>
                      {extraDue > 0 ? (
                        <dl className="space-y-1 text-xs text-rose-800">
                          <div className="flex items-center justify-between gap-3">
                            <dt>ค่าเสียหายที่แอดมินกำหนด</dt>
                            <dd className="font-semibold">{thb.format(damageAmountDue)}</dd>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <dt>หักจากเงินประกัน</dt>
                            <dd className="font-semibold">−{thb.format(deposit)}</dd>
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t border-rose-200 pt-1.5 text-sm font-extrabold text-rose-900">
                            <dt>ส่วนต่างที่ต้องชำระ</dt>
                            <dd>{thb.format(extraDue)}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="text-xs text-rose-700">กำลังโหลดรายละเอียดค่าเสียหาย...</p>
                      )}
                      <p className="text-[11px] leading-relaxed text-rose-700">
                        โอนส่วนต่างภายใน 48 ชั่วโมง แล้วแนบสลิปเพื่อส่งให้ผู้ให้เช่าดู
                        (ระบบไม่ตรวจสอบสลิปให้)
                      </p>
                    </div>

                    {extraSlip ? (
                      <div className="rounded-2xl bg-sky-50 p-4 border border-sky-200 space-y-2">
                        <p className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-sky-600 shrink-0" />
                          <span>ส่งสลิปให้ผู้ให้เช่าแล้ว</span>
                        </p>
                        {extraSlip.slip_image_url && (
                          <a
                            href={extraSlip.slip_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 underline"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            <span>ดูสลิปที่ส่งไป</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={openExtraModal}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#3f6593] hover:bg-sky-50 active:scale-95"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span>ส่งสลิปใหม่</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={openExtraModal}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition duration-200 hover:from-[#000f22] hover:to-[#1b3554] active:scale-95"
                      >
                        <Wallet className="h-4 w-4" />
                        <span>แนบสลิปการโอนส่วนต่าง</span>
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
                        {orderReview
                          ? `คุณให้คะแนนรีวิวการเช่านี้แล้ว (${orderReview.rating}/5 ดาว)`
                          : "ร่วมแบ่งปันประสบการณ์ของคุณด้วยการเขียนรีวิวอุปกรณ์นี้"}
                      </p>
                    </div>
                    <a
                      href="#order-review-section"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-amber-500/20 transition hover:from-amber-600 hover:to-orange-600 active:scale-95"
                    >
                      <Star className="h-4 w-4 fill-white" />
                      <span>
                        {orderReview ? "ดู / แก้ไขรีวิวของคุณ" : "เขียนรีวิวการเช่า"}
                      </span>
                    </a>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
                    <p className="text-xs font-semibold text-slate-700">
                      สถานะ: {(order.cancel_reason || cancelReason) ? `ยกเลิกคำขอ (${order.cancel_reason || cancelReason})` : chip.label}
                    </p>
                  </div>
                )}
                {/* ปุ่มเปิดข้อพิพาท / รายงานปัญหา */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowDisputeModal(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 active:scale-[0.98]"
                  >
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    <span>รายงานปัญหา / เปิดข้อพิพาทกับ Admin</span>
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Modal ชำระเงิน / อัปโหลดสลิป */}
      {/* Modal เปิดข้อพิพาท */}
      <OrderDisputeModal
        orderId={order.order_id}
        isOpen={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        onSuccess={() => {
          fetchDisputes();
          fetchLatestOrder();
        }}
        userRole="renter"
      />
      {/* Modal ถ่ายรูปรับของ (Step 5 - ทั้งสองฝ่ายต้องอัปโหลด) */}
      <OrderEvidenceModal
        isOpen={showBeforeModal}
        onClose={() => setShowBeforeModal(false)}
        orderId={order.order_id}
        userId={userId}
        viewerRole="renter"
        myName={myAccountName}
        myAvatarUrl={myAvatarUrl}
        otherName={otherAccountName}
        otherAvatarUrl={otherAvatarUrl}
        phase="before"
        canUpload={currentStatus === "paid"}
        scheduledDate={order.start_date}
        scheduledTime={order.meetup_time || "12:00"}
        rentalFee={rentalFee}
        deposit={deposit}
        evidenceList={evidenceList}
        onSuccess={handleEvidenceSuccess}
      />
      {/* Modal ถ่ายรูปคืนของ (Step 6 - ทั้งสองฝ่ายต้องอัปโหลด) */}
      <OrderEvidenceModal
        isOpen={showAfterModal}
        onClose={() => setShowAfterModal(false)}
        orderId={order.order_id}
        userId={userId}
        viewerRole="renter"
        myName={myAccountName}
        myAvatarUrl={myAvatarUrl}
        otherName={otherAccountName}
        otherAvatarUrl={otherAvatarUrl}
        phase="after"
        canUpload={
          currentStatus === "item_sent" || currentStatus === "item_returned"
        }
        scheduledDate={order.end_date}
        scheduledTime={order.return_time || "12:00"}
        rentalFee={rentalFee}
        deposit={deposit}
        evidenceList={evidenceList}
        onSuccess={handleEvidenceSuccess}
      />
      {/* Modal แนบสลิปส่วนต่างค่าเสียหาย (ส่งให้ผู้ให้เช่าดูอย่างเดียว) */}
      {showExtraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowExtraModal(false)}
              disabled={isSubmittingSlip}
              aria-label="ปิด"
              className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 pr-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#c0e6fd]/40 text-[#1b3554]">
                <Wallet className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  แนบสลิปส่วนต่างค่าเสียหาย
                </h3>
                {extraDue > 0 && (
                  <p className="text-xs text-slate-500">
                    ยอดส่วนต่างที่ต้องชำระ {thb.format(extraDue)}
                  </p>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmitExtraSlip} className="mt-4 space-y-4">
              <p className="rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                สลิปนี้จะถูกส่งให้ผู้ให้เช่าดูเท่านั้น ระบบไม่มีการตรวจสอบหรืออนุมัติสลิป
              </p>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  แนบสลิปหลักฐานการโอนเงิน <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-5 text-center hover:bg-slate-50">
                  {slipPreview ? (
                    <div className="space-y-2">
                      <img
                        src={slipPreview}
                        alt="สลิปโอนเงินส่วนต่าง"
                        className="mx-auto max-h-48 rounded-xl object-contain shadow-sm"
                      />
                      <p className="text-xs text-slate-500">{slipFile?.name || "สลิปที่เลือก"}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <Upload className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-slate-700">
                        เลือกรูปภาพสลิปการโอนเงิน
                      </p>
                      <p className="text-[11px] text-slate-400">รองรับไฟล์ JPG, PNG, WebP</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="mt-3 block w-full text-xs text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-[#1b3554] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#000f22]"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-600">{errorMsg}</div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExtraModal(false)}
                  disabled={isSubmittingSlip}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSlip || !slipPreview}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:from-[#000f22] hover:to-[#1b3554] disabled:opacity-50"
                >
                  {isSubmittingSlip ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>ส่งสลิปให้ผู้ให้เช่า</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowPaymentModal(false)}
              className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#c0e6fd]/40 text-[#1b3554]">
                <QrCode className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">ชำระเงิน &amp; อัปโหลดสลิป</h3>
                <p className="text-xs text-slate-500">ยอดชำระสุทธิ {thb.format(totalPaid)}</p>
              </div>
            </div>

            <form onSubmit={handleSubmitPayment} className="mt-4 space-y-4">
              {/* ข้อมูลบัญชีรับเงิน */}
              <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-xs space-y-1.5 text-slate-700">
                <p className="font-bold text-[#1b3554] text-sm">บัญชีธนาคารสำหรับโอนเงิน (ChaoChao Escrow)</p>
                <p>ธนาคารกสิกรไทย (KBANK) · บัญชีออมทรัพย์</p>
                <p className="font-mono font-bold text-slate-900 text-sm">123-4-56789-0 (บจก. เชาเชา แพลตฟอร์ม)</p>
                <p className="text-slate-400 text-[11px]">เงินประกันจะถูกพักไว้ที่ระบบอย่างปลอดภัยจนกว่าการเช่าจะเสร็จสมบูรณ์</p>
              </div>

              {/* อัปโหลดสลิป */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  แนบสลิปหลักฐานการโอนเงิน <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-5 text-center hover:bg-slate-50">
                  {slipPreview ? (
                    <div className="space-y-2">
                      <img src={slipPreview} alt="สลิปโอนเงิน" className="max-h-48 rounded-xl object-contain mx-auto shadow-sm" />
                      <p className="text-xs text-slate-500">{slipFile?.name || "สลิปที่เลือก"}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <Upload className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-slate-700">คลิกเพื่อเลือกรูปภาพสลิป หรือลากไฟล์มาวางที่นี่</p>
                      <p className="text-[11px] text-slate-400">รองรับไฟล์ JPG, PNG (ขนาดไม่เกิน 10MB)</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="mt-3 block w-full text-xs text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-[#1b3554] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#000f22]"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSlip || (!slipFile && !slipPreview)}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:from-[#000f22] hover:to-[#1b3554] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingSlip ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>ยืนยันการแจ้งชำระเงิน</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ขอยกเลิกการเช่า (FR-34) */}
      <RenterCancelModal
        isOpen={showRenterCancelModal}
        onClose={() => setShowRenterCancelModal(false)}
        orderId={order.order_id}
        startDate={order.start_date}
        meetupTime={order.meetup_time}
        rentalFee={rentalFee}
        deposit={deposit}
        totalPaid={totalPaid}
        onSuccess={handleRenterCancelSuccess}
      />
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
      <dt className={`text-sm ${muted ? "text-slate-400" : "text-slate-600"}`}>{label}</dt>
      <dd
        className={`text-sm font-semibold ${accent ? "text-emerald-600" : muted ? "text-slate-400" : "text-slate-800"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function StubButton({
  label,
  primary,
  tone,
}: {
  label: string;
  primary?: boolean;
  tone?: "rose";
}) {
  const base =
    "inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold opacity-60";
  const style = primary
    ? "bg-gradient-to-r from-[#1b3554] to-[#3f6593] text-white"
    : tone === "rose"
      ? "border border-rose-200 bg-white text-rose-500"
      : "border border-slate-200 bg-white text-slate-500";
  return (
    <button type="button" disabled title="ฟีเจอร์กำลังพัฒนา" className={`${base} ${style}`}>
      {label}
    </button>
  );
}
