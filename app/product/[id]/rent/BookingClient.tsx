"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Send,
  ShieldCheck,
  Star,
  AlertCircle,
  Upload,
  X,
  PlusCircle,
} from "lucide-react";

import type { BookingDraft, BookingPageData, DateRange } from "./types";

import RentalTermsModal from "./RentalTermsModal";

const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const thb = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function formatKey(key: string | null | undefined): string {
  if (!key) return "";
  const clean = key.trim().split("T")[0];
  const parts = clean.split("-").map(Number);
  if (parts.length === 3) {
    const [y, m, d] = parts;
    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 1 && m <= 12) {
      return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
    }
  }
  return clean;
}

function formatMonthTitle(year: number, monthIndex: number): string {
  const m = Math.max(0, Math.min(11, monthIndex));
  return `${THAI_MONTHS_FULL[m]} ${year + 543}`;
}

function getTodayKey(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const now = new Date();
    return keyOf(now.getFullYear(), now.getMonth(), now.getDate());
  }
}

/* ────────────────────────────── date helpers ────────────────────────────── */

function pad(value: number) {
  return String(value).padStart(2, "0");
}

// สร้าง key "YYYY-MM-DD"
function keyOf(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function keyToDate(key: string) {
  const clean = key.trim().split("T")[0];
  const [y, m, d] = clean.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function inclusiveDays(startKey: string, endKey: string) {
  const diff = keyToDate(endKey).getTime() - keyToDate(startKey).getTime();
  return Math.max(1, Math.round(diff / 86_400_000) + 1);
}

function toDateKey(val: string | Date | undefined | null): string {
  if (!val) return "";
  if (typeof val === "string") {
    const clean = val.trim().split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts.map(Number);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return keyOf(y, m - 1, d);
      }
    }
    return clean;
  }
  return keyOf(val.getFullYear(), val.getMonth(), val.getDate());
}

function inRanges(key: string, ranges: DateRange[]) {
  if (!key || !ranges || ranges.length === 0) return false;
  return ranges.some((r) => {
    const s = toDateKey(r.start);
    const e = toDateKey(r.end);
    if (!s || !e) return false;
    return key >= s && key <= e;
  });
}

function monthValue(year: number, month: number) {
  return year * 12 + month;
}

/* ────────────────────────────── component ────────────────────────────── */

export default function BookingClient({
  data,
  initialSimulatedTime,
}: {
  data: BookingPageData;
  initialSimulatedTime?: string;
}) {
  const { item, owner, locations, availability, bookedRanges, rating } = data;
  const router = useRouter();

  const [simulatedNowIso, setSimulatedNowIso] = useState<string>(
    initialSimulatedTime || new Date().toISOString(),
  );

  useEffect(() => {
    let active = true;
    async function loadSimulated() {
      try {
        const res = await fetch("/api/simulated-time", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (active && json.simulatedNowIso) {
            setSimulatedNowIso(json.simulatedNowIso);
          }
        }
      } catch {
        // ignore
      }
    }
    loadSimulated();
    const timer = setInterval(loadSimulated, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const todayKey = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(simulatedNowIso));
    } catch {
      return simulatedNowIso.split("T")[0];
    }
  }, [simulatedNowIso]);

  // ขอบเขตเดือนที่เลื่อนดูได้ = ยึดตามช่วง availability ที่ผู้ให้เช่าเปิดไว้จริง
  const bounds = useMemo(() => {
    const simDate = new Date(simulatedNowIso);
    const validNow = Number.isNaN(simDate.getTime()) ? new Date() : simDate;
    const currentMonth = monthValue(validNow.getFullYear(), validNow.getMonth());

    if (availability.length === 0) {
      return { min: currentMonth - 6, max: currentMonth + 12 };
    }
    const validStarts = availability
      .map((a) => toDateKey(a.start))
      .filter(Boolean)
      .map((k) => keyToDate(k));
    const validEnds = availability
      .map((a) => toDateKey(a.end))
      .filter(Boolean)
      .map((k) => keyToDate(k));

    if (validStarts.length === 0 || validEnds.length === 0) {
      return { min: currentMonth - 6, max: currentMonth + 12 };
    }

    const minDate = new Date(Math.min(...validStarts.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...validEnds.map((d) => d.getTime())));

    const startMonth = monthValue(minDate.getFullYear(), minDate.getMonth());
    const endMonth = monthValue(maxDate.getFullYear(), maxDate.getMonth());

    return { min: startMonth, max: endMonth };
  }, [availability, simulatedNowIso]);

  // ตั้งปฏิทินให้เปิดมาที่เดือนแรกของช่วงที่ผู้ให้เช่าเปิดไว้ทันที
  const initialMonth = useMemo(() => {
    const simDate = new Date(simulatedNowIso);
    const validNow = Number.isNaN(simDate.getTime()) ? new Date() : simDate;
    const curMonth = monthValue(validNow.getFullYear(), validNow.getMonth());

    if (availability.length === 0) {
      return curMonth;
    }

    const validStarts = availability
      .map((a) => toDateKey(a.start))
      .filter(Boolean);

    if (validStarts.length > 0) {
      const firstDate = keyToDate(validStarts[0]);
      const openMonth = monthValue(firstDate.getFullYear(), firstDate.getMonth());
      return Math.max(openMonth, curMonth);
    }

    return curMonth;
  }, [availability, simulatedNowIso]);

  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [startKey, setStartKey] = useState<string | null>(null);
  const [endKey, setEndKey] = useState<string | null>(null);
  const [meetupTime, setMeetupTime] = useState<string>("12:00");
  const [returnTime, setReturnTime] = useState<string>("12:00");
  const meetupOptions = locations.filter(
    (l) => l.locationType === "meetup" || l.locationType === "both",
  );
  const returnOptions = locations.filter(
    (l) => l.locationType === "return" || l.locationType === "both",
  );

  const [pickupId, setPickupId] = useState<string | null>(
    meetupOptions.length === 1 ? meetupOptions[0].id : null,
  );
  const [returnId, setReturnId] = useState<string | null>(
    returnOptions.length === 1 ? returnOptions[0].id : null,
  );
  const [draft, setDraft] = useState<BookingDraft | null>(null);

  const [prevItemId, setPrevItemId] = useState(item.id);
  if (prevItemId !== item.id) {
    setPrevItemId(item.id);
    setViewMonth(initialMonth);
    setStartKey(null);
    setEndKey(null);
    setDraft(null);
  }

  const viewYear = Math.floor(viewMonth / 12);
  const viewMonthIndex = viewMonth % 12;

  const isBooked = (key: string) => inRanges(key, bookedRanges);
  const isOpen = (key: string) => {
    if (availability.length === 0) return true;
    return inRanges(key, availability);
  };
  const isSelectable = (key: string) =>
    isOpen(key) && !isBooked(key) && key >= todayKey && item.status === "available";

  useEffect(() => {
    if (startKey && startKey < todayKey) {
      setStartKey(null);
      setEndKey(null);
      setDraft(null);
    }
  }, [startKey, todayKey]);

  useEffect(() => {
    const simDate = new Date(simulatedNowIso);
    const validNow = Number.isNaN(simDate.getTime()) ? new Date() : simDate;
    const curMonth = monthValue(validNow.getFullYear(), validNow.getMonth());
    setViewMonth((prev) => (prev < curMonth ? curMonth : prev));
  }, [simulatedNowIso]);

  // ไม่ให้ช่วงคร่อมวันที่ถูกจอง/นอกช่วงเปิดจอง
  function spanIsClear(from: string, to: string) {
    const cur = keyToDate(from);
    const end = keyToDate(to);
    while (cur <= end) {
      const k = keyOf(cur.getFullYear(), cur.getMonth(), cur.getDate());
      if (!isSelectable(k)) return false;
      cur.setDate(cur.getDate() + 1);
    }
    return true;
  }

  function handleDayClick(key: string) {
    if (!isSelectable(key)) return;
    setDraft(null); // แก้วันแล้ว draft เดิมล้าสมัย

    // เริ่มเลือกใหม่
    if (!startKey || (startKey && endKey)) {
      setStartKey(key);
      setEndKey(null);
      return;
    }
    // มี start แล้ว กำลังเลือก end
    if (key < startKey) {
      setStartKey(key);
      setEndKey(null);
      return;
    }
    if (key === startKey) {
      setEndKey(key);
      return;
    }
    if (spanIsClear(startKey, key)) {
      setEndKey(key);
    } else {
      // ช่วงคร่อมวันที่จองไม่ได้/นอกช่วงเปิดจอง → เริ่มต้นใหม่ที่วันที่คลิก
      setStartKey(key);
      setEndKey(null);
    }
  }

  /* ── month grid ── */
  const cells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonthIndex, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonthIndex + 1, 0).getDate();
    const list: Array<{ key: string; day: number } | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) list.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      list.push({ key: keyOf(viewYear, viewMonthIndex, d), day: d });
    }
    return list;
  }, [viewYear, viewMonthIndex]);

  /* ── pricing ── */
  const days = startKey && endKey ? inclusiveDays(startKey, endKey) : 0;
  const rentalFee = days * item.rentalFeePerDay;
  const totalPayable = rentalFee + item.deposit;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    role: string;
    roles: string[];
  } | null>(null);

  // Renter KYC & Bank Account State (FR-04)
  const [renterKyc, setRenterKyc] = useState<{
    loaded: boolean;
    nationalId: string;
    idCardUrl: string | null;
    idCardSelfieUrl: string | null;
    identityVerificationStatus: string;
    bankAccount: {
      bankName: string;
      accountNumber: string;
      accountName: string;
      verificationStatus: string;
    } | null;
  }>({
    loaded: false,
    nationalId: "",
    idCardUrl: null,
    idCardSelfieUrl: null,
    identityVerificationStatus: "unverified",
    bankAccount: null,
  });

  const [showRenterKycModal, setShowRenterKycModal] = useState(false);
  const [kycNationalId, setKycNationalId] = useState("");
  const [kycBankName, setKycBankName] = useState("");
  const [kycAccountNumber, setKycAccountNumber] = useState("");
  const [kycAccountName, setKycAccountName] = useState("");
  const [kycIdCardFile, setKycIdCardFile] = useState<File | null>(null);
  const [kycSelfieFile, setKycSelfieFile] = useState<File | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycModalError, setKycModalError] = useState<string | null>(null);
  const [kycSuccessNotice, setKycSuccessNotice] = useState<string | null>(null);
  const [addingRenterRole, setAddingRenterRole] = useState(false);

  async function refreshUserAndKyc() {
    try {
      const [meRes, profileRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/profile", { cache: "no-store" }),
      ]);
      if (meRes.ok) {
        const meData = await meRes.json();
        setCurrentUser(meData.user || null);
      }
      if (profileRes.ok) {
        const pData = await profileRes.json();
        if (pData.user) {
          setRenterKyc({
            loaded: true,
            nationalId: pData.user.nationalId || "",
            idCardUrl: pData.user.idCardUrl || null,
            idCardSelfieUrl: pData.user.idCardSelfieUrl || null,
            identityVerificationStatus:
              pData.user.identityVerificationStatus || "unverified",
            bankAccount: pData.user.bankAccount || null,
          });
          setKycNationalId(pData.user.nationalId || "");
          setKycBankName(pData.user.bankAccount?.bankName || "");
          setKycAccountNumber(pData.user.bankAccount?.accountNumber || "");
          setKycAccountName(pData.user.bankAccount?.accountName || "");
        }
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshUserAndKyc();
  }, []);

  const hasAllRenterKycDocs = Boolean(
    renterKyc.idCardUrl &&
      renterKyc.idCardSelfieUrl &&
      renterKyc.bankAccount?.bankName &&
      renterKyc.bankAccount?.accountNumber &&
      renterKyc.bankAccount?.accountName
  );
  const isRenterKycRejected =
    renterKyc.identityVerificationStatus === "rejected" ||
    renterKyc.bankAccount?.verificationStatus === "rejected";
  const isRenterKycVerified =
    hasAllRenterKycDocs &&
    renterKyc.identityVerificationStatus === "verified" &&
    renterKyc.bankAccount?.verificationStatus === "verified";

  async function handleSubmitRenterKyc(e: React.FormEvent) {
    e.preventDefault();
    setKycModalError(null);

    if (kycNationalId && kycNationalId.length !== 13) {
      setKycModalError("เลขประจำตัวประชาชนต้องมี 13 หลัก");
      return;
    }
    if (!renterKyc.idCardUrl && !kycIdCardFile) {
      setKycModalError("กรุณาอัปโหลดรูปถ่ายบัตรประชาชน");
      return;
    }
    if (!renterKyc.idCardSelfieUrl && !kycSelfieFile) {
      setKycModalError("กรุณาอัปโหลดรูปถ่ายบุคคลคู่กับบัตรประชาชน");
      return;
    }
    if (
      !kycBankName.trim() ||
      !kycAccountNumber.trim() ||
      !kycAccountName.trim()
    ) {
      setKycModalError("กรุณากรอกข้อมูลบัญชีธนาคารให้ครบถ้วน");
      return;
    }
    if (!/^\d{8,15}$/.test(kycAccountNumber.trim())) {
      setKycModalError("เลขที่บัญชีธนาคารต้องเป็นตัวเลข 8-15 หลัก");
      return;
    }

    setKycSubmitting(true);
    try {
      const formData = new FormData();
      if (kycNationalId) formData.append("nationalId", kycNationalId);
      formData.append("bankName", kycBankName.trim());
      formData.append("accountNumber", kycAccountNumber.trim());
      formData.append("accountName", kycAccountName.trim());
      if (kycIdCardFile) formData.append("idCard", kycIdCardFile);
      if (kycSelfieFile) formData.append("selfie", kycSelfieFile);

      const res = await fetch("/api/profile/kyc", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) {
        setKycModalError(result.message || "เกิดข้อผิดพลาดในการส่งข้อมูล");
        return;
      }

      setKycSuccessNotice(
        "ลงทะเบียนรูปถ่ายบัตรประชาชน รูปคู่บัตร และบัญชีธนาคารเรียบร้อยแล้ว กรุณารอแอดมินตรวจสอบตัวตนก่อนส่งคำขอเช่า"
      );
      setShowRenterKycModal(false);
      await refreshUserAndKyc();
    } catch {
      setKycModalError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setKycSubmitting(false);
    }
  }

  async function handleQuickAddRenterRole() {
    setAddingRenterRole(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/profile/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole: "renter" }),
      });
      const result = await res.json();
      if (res.ok) {
        await refreshUserAndKyc();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("auth-state-change"));
        }
        router.refresh();
      } else {
        setSubmitError(result.message || "ไม่สามารถสมัครบทบาทผู้เช่าเพิ่มได้");
      }
    } catch {
      setSubmitError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setAddingRenterRole(false);
    }
  }

  const roles =
    currentUser?.roles || (currentUser?.role ? [currentUser.role] : []);
  const isLenderOnly =
    currentUser !== null &&
    (roles.includes("lender") ||
      roles.includes("ผู้ให้เช่า") ||
      currentUser.role === "lender") &&
    !roles.includes("renter") &&
    !roles.includes("ผู้เช่า") &&
    !roles.includes("both") &&
    !roles.includes("ผู้ให้เช่า / ผู้เช่า") &&
    !roles.includes("admin") &&
    !roles.includes("ผู้ดูแลระบบ");

  const isMeetupInPast = useMemo(() => {
    if (!startKey) return false;
    if (startKey < todayKey) return true;
    try {
      const pickupMs = new Date(
        `${startKey}T${(meetupTime || "12:00").padStart(5, "0")}:00+07:00`,
      ).getTime();
      const currentSimMs = new Date(simulatedNowIso).getTime();
      return pickupMs < currentSimMs;
    } catch {
      return false;
    }
  }, [startKey, todayKey, meetupTime, simulatedNowIso]);

  const isReturnBeforePickup = useMemo(() => {
    if (!startKey || !endKey) return false;
    try {
      const pickupMs = new Date(
        `${startKey}T${(meetupTime || "12:00").padStart(5, "0")}:00+07:00`,
      ).getTime();
      const returnMs = new Date(
        `${endKey}T${(returnTime || "12:00").padStart(5, "0")}:00+07:00`,
      ).getTime();
      return returnMs <= pickupMs;
    } catch {
      return false;
    }
  }, [startKey, endKey, meetupTime, returnTime]);

  const canContinue = Boolean(
    startKey &&
      endKey &&
      pickupId &&
      returnId &&
      !isLenderOnly &&
      !isMeetupInPast &&
      !isReturnBeforePickup,
  );

  async function handleSubmitBooking() {
    if (!canContinue || !startKey || !endKey) return;
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      // ตรวจสอบวันและเวลานัดรับสินค้า ต้องไม่เป็นเวลาในอดีต (TC09)
      if (startKey) {
        const currentSimMs = new Date(simulatedNowIso).getTime();
        const pickupMs = new Date(
          `${startKey}T${(meetupTime || "12:00").padStart(5, "0")}:00+07:00`,
        ).getTime();
        if (pickupMs < currentSimMs) {
          setSubmitError(
            "ช่วงเวลาที่เลือกไม่ถูกต้อง ไม่สามารถเลือกวันหรือเวลานัดรับในอดีตได้",
          );
          setIsSubmitting(false);
          setShowTermsModal(false);
          return;
        }
      }

      if (startKey && endKey) {
        const pickupMs = new Date(
          `${startKey}T${(meetupTime || "12:00").padStart(5, "0")}:00+07:00`,
        ).getTime();
        const returnMs = new Date(
          `${endKey}T${(returnTime || "12:00").padStart(5, "0")}:00+07:00`,
        ).getTime();
        if (returnMs <= pickupMs) {
          setSubmitError(
            "ช่วงเวลาที่เลือกไม่ถูกต้อง เวลานัดคืนสินค้าต้องอยู่หลังเวลานัดรับสินค้า",
          );
          setIsSubmitting(false);
          setShowTermsModal(false);
          return;
        }
      }

      const pickup = locations.find((l) => l.id === pickupId);
      const returnLoc = locations.find((l) => l.id === returnId);

      const payload = {
        itemId: item.id,
        startDate: startKey,
        endDate: endKey,
        meetupTime: meetupTime || "12:00",
        returnTime: returnTime || "12:00",
        meetupLocation:
          pickup?.description || pickup?.fullAddress || "จุดนัดรับที่ตกลงกัน",
        returnLocation:
          returnLoc?.description ||
          returnLoc?.fullAddress ||
          "จุดนัดคืนที่ตกลงกัน",
        rentalFee,
        deposit: item.deposit,
        totalPaid: totalPayable,
      };

      const res = await fetch("/api/rentals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        setShowTermsModal(false);
        if (result.code === "KYC_REQUIRED") {
          setShowRenterKycModal(true);
        }
        setSubmitError(
          result.message || "ส่งคำขอเช่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
        );
        return;
      }

      // ส่งคำขอเช่าสำเร็จ นำผู้เช่าไปจัดการสถานะต่อใน Dashboard
      const targetUserId = result.userId;
      if (targetUserId) {
        router.push(`/dashboard/${targetUserId}/rent/${result.orderId}`);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      console.error("Submit booking error:", err);
      setShowTermsModal(false)
      setSubmitError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsSubmitting(false);
    }
  }

  const atMinMonth = viewMonth <= bounds.min;
  const atMaxMonth = viewMonth >= bounds.max;

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-6 sm:pb-20 sm:pt-8">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav
          aria-label="เส้นทางนำทาง"
          className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-500"
        >
          <Link href="/" className="transition hover:text-[#1b3554]">
            หน้าแรก
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="/products" className="transition hover:text-[#1b3554]">
            สินค้าสำหรับเช่า
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href={`/product/${item.id}`}
            className="max-w-[16rem] truncate font-medium text-slate-700 hover:text-[#1b3554]"
          >
            {item.name}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-[#1b3554]">จองเช่าอุปกรณ์</span>
        </nav>

        <Link
          href={`/product/${item.id}`}
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#1b3554]"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          กลับไปหน้ารายละเอียดอุปกรณ์
        </Link>

        <header className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            เลือกวันที่เช่า &amp; จุดนัดรับ–คืน
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            เลือกช่วงวันที่ต้องการเช่า และจุดนัดรับ–คืนอุปกรณ์
            จากนั้นกดส่งคำขอเช่าเพื่อดำเนินการในแดชบอร์ด
          </p>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem] xl:gap-8">
          {/* ───────────── คอลัมน์ซ้าย ───────────── */}
          <div className="min-w-0 space-y-6">
            {/* ปฏิทินคิวว่าง */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c0e6fd]/30 text-[#1b3554]">
                    <CalendarDays className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">
                        ปฏิทินคิวว่าง
                      </h2>
                      {todayKey && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                          <Clock3 className="h-3 w-3 text-sky-600" />
                          <span>วันปัจจุบันในระบบ: <strong>{formatKey(todayKey)}</strong></span>
                        </span>
                      )}
                      {availability.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {availability.map((r, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800"
                            >
                              <Clock3 className="h-3 w-3 text-sky-600" />
                              <span>
                                ช่วงที่เปิดให้เช่า: {formatKey(r.start)} –{" "}
                                {formatKey(r.end)}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                      {bookedRanges.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {bookedRanges.map((b, idx) => (
                            <span
                              key={`booked-${idx}`}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              <span>
                                มีคนจองแล้ว: {formatKey(b.start)} –{" "}
                                {formatKey(b.end)}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{item.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewMonth((v) => v - 1)}
                    disabled={atMinMonth}
                    aria-label="เดือนก่อนหน้า"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-[#3f6593] hover:text-[#1b3554] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="w-32 text-center text-sm font-semibold text-slate-800">
                    {formatMonthTitle(viewYear, viewMonthIndex)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMonth((v) => v + 1)}
                    disabled={atMaxMonth}
                    aria-label="เดือนถัดไป"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-[#3f6593] hover:text-[#1b3554] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* หัวตารางวัน */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="py-1.5">
                    {label}
                  </div>
                ))}
              </div>

              {/* วัน */}
              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((cell, index) => {
                  if (!cell) return <div key={`empty-${index}`} />;
                  const { key, day } = cell;
                  const booked = isBooked(key);
                  const open = isOpen(key);
                  const isPast = key < todayKey;
                  const selectable = open && !booked && !isPast;
                  const isStart = key === startKey;
                  const isEnd = key === endKey;
                  const isEndpoint = isStart || isEnd;
                  const inRange =
                    startKey && endKey && key > startKey && key < endKey;
                  // ระหว่างเลือก: ไฮไลต์ start เดี่ยว ๆ ด้วย
                  const activeSingle = isStart && !endKey;

                  let cls =
                    "text-slate-700 hover:bg-sky-50 hover:text-[#1b3554]";
                  if (isPast) {
                    cls =
                      "bg-slate-100/70 text-slate-300 line-through decoration-slate-300 cursor-not-allowed";
                  } else if (!open) {
                    cls = "bg-slate-50/70 text-slate-300 cursor-not-allowed";
                  } else if (booked) {
                    cls =
                      "bg-rose-50 text-rose-400 line-through decoration-rose-300 cursor-not-allowed";
                  } else if (isEndpoint || activeSingle) {
                    cls =
                      "bg-[#1b3554] text-white font-bold shadow-sm shadow-[#1b3554]/20";
                  } else if (inRange) {
                    cls = "bg-[#c0e6fd]/60 text-[#1b3554] font-semibold";
                  }

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!selectable}
                      onClick={() => handleDayClick(key)}
                      aria-pressed={isEndpoint}
                      aria-label={`${formatKey(key)}${
                        booked ? " ถูกจองแล้ว" : !open ? " นอกช่วงเปิดจอง" : ""
                      }`}
                      title={
                        booked
                          ? `วันที่ ${formatKey(key)} ถูกจองแล้ว`
                          : !open
                            ? `วันที่ ${formatKey(key)} อยู่นอกช่วงที่เปิดให้เช่า`
                            : `วันที่ ${formatKey(key)} ว่าง (สามารถเลือกได้)`
                      }
                      className={`flex aspect-square items-center justify-center rounded-lg text-sm transition ${cls} ${
                        selectable ? "cursor-pointer" : "cursor-not-allowed"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <LegendDot className="bg-[#1b3554]" label="วันที่เลือก" />
                <LegendDot className="bg-[#c0e6fd]/70" label="ในช่วงเช่า" />
                <LegendDot
                  className="bg-white ring-1 ring-slate-200"
                  label="ว่าง"
                />
                <LegendDot className="bg-rose-100" label="ถูกจองแล้ว" />
                <LegendDot className="bg-slate-100" label="นอกช่วงเปิดจอง" />
              </div>

              {startKey && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-[#1b3554]">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {endKey ? (
                    <span>
                      เลือก <strong>{formatKey(startKey)}</strong> ถึง{" "}
                      <strong>{formatKey(endKey)}</strong> ({days} วัน) · เวลานัดรับ{" "}
                      <strong>{meetupTime} น.</strong> / คืน{" "}
                      <strong>{returnTime} น.</strong>
                    </span>
                  ) : (
                    <span>
                      เริ่ม <strong>{formatKey(startKey)}</strong> —
                      เลือกวันสิ้นสุดอีกครั้ง
                    </span>
                  )}
                </div>
              )}

              {/* เลือกเวลานัดรับ–คืนสินค้า (FR-28 / FR-29) */}
              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="mb-3 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-[#1b3554]" />
                  <h3 className="text-sm font-bold text-slate-900">
                    กำหนดเวลานัดรับและคืนอุปกรณ์
                  </h3>
                </div>
                <p className="mb-4 text-xs text-slate-500">
                  ทั้งผู้เช่าและผู้ให้เช่าต้องถ่ายและอัปโหลดรูปภาพหลักฐานภายใน{" "}
                  <strong className="text-slate-700">1 ชั่วโมง</strong> นับจากเวลานัดรับและเวลานัดคืนสินค้า
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <label className="block text-xs font-bold text-slate-700">
                      เวลานัดรับอุปกรณ์ {startKey ? `(${formatKey(startKey)})` : ""}
                    </label>
                    <input
                      type="time"
                      value={meetupTime}
                      onChange={(e) => setMeetupTime(e.target.value || "12:00")}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-[#1b3554] shadow-xs focus:border-[#3f6593] focus:outline-none"
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {["09:00", "10:00", "12:00", "15:00", "18:00"].map((t) => {
                        const isPastPreset =
                          startKey === todayKey &&
                          new Date(`${startKey}T${t}:00+07:00`).getTime() <
                            new Date(simulatedNowIso).getTime();
                        return (
                          <button
                            key={`meetup-${t}`}
                            type="button"
                            disabled={isPastPreset}
                            onClick={() => setMeetupTime(t)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                              isPastPreset
                                ? "cursor-not-allowed bg-slate-100 text-slate-300 line-through"
                                : meetupTime === t
                                  ? "bg-[#1b3554] text-white"
                                  : "border border-slate-200 bg-white text-slate-600 hover:border-[#3f6593]"
                            }`}
                          >
                            {t} น.
                          </button>
                        );
                      })}
                    </div>
                    {isMeetupInPast && (
                      <p className="mt-2 text-xs font-semibold text-rose-600">
                        เวลานัดรับอุปกรณ์ไม่สามารถเป็นเวลาในอดีตได้ (เวลาปัจจุบันในระบบ:{" "}
                        {new Date(simulatedNowIso).toLocaleTimeString("th-TH", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Bangkok",
                        })}{" "}
                        น.)
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <label className="block text-xs font-bold text-slate-700">
                      เวลานัดคืนอุปกรณ์ {endKey ? `(${formatKey(endKey)})` : ""}
                    </label>
                    <input
                      type="time"
                      value={returnTime}
                      onChange={(e) => setReturnTime(e.target.value || "12:00")}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-[#1b3554] shadow-xs focus:border-[#3f6593] focus:outline-none"
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {["09:00", "10:00", "12:00", "15:00", "18:00"].map((t) => {
                        const isInvalidReturnPreset =
                          startKey === endKey && t <= meetupTime;
                        return (
                          <button
                            key={`return-${t}`}
                            type="button"
                            disabled={isInvalidReturnPreset}
                            onClick={() => setReturnTime(t)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                              isInvalidReturnPreset
                                ? "cursor-not-allowed bg-slate-100 text-slate-300 line-through"
                                : returnTime === t
                                  ? "bg-[#1b3554] text-white"
                                  : "border border-slate-200 bg-white text-slate-600 hover:border-[#3f6593]"
                            }`}
                          >
                            {t} น.
                          </button>
                        );
                      })}
                    </div>
                    {isReturnBeforePickup && (
                      <p className="mt-2 text-xs font-semibold text-rose-600">
                        เวลานัดคืนอุปกรณ์ต้องอยู่หลังเวลานัดรับอุปกรณ์
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* จุดรับ–คืน */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-center gap-2.5 border-b border-slate-100 pb-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c0e6fd]/30 text-[#1b3554]">
                  <MapPin className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  จุดนัดรับ–คืนอุปกรณ์
                </h2>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <LocationPicker
                  title="จุดรับของ"
                  locations={meetupOptions}
                  selectedId={pickupId}
                  onSelect={(id) => {
                    setPickupId(id);
                    setDraft(null);
                  }}
                />
                <LocationPicker
                  title="จุดคืนของ"
                  locations={returnOptions}
                  selectedId={returnId}
                  onSelect={(id) => {
                    setReturnId(id);
                    setDraft(null);
                  }}
                />
              </div>
            </section>

            {/* รายละเอียดเงินประกัน & เงื่อนไข */}
            <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  การคุ้มครองและเงินประกัน
                </h2>
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    เงินประกัน{" "}
                    <strong className="text-slate-800">
                      {thb.format(item.deposit)}
                    </strong>{" "}
                    จะถูกพักไว้ที่ระบบ Chaochao และคืนเข้าบัญชีคุณเต็มจำนวน
                    เมื่อผู้ให้เช่าตรวจสอบสภาพอุปกรณ์หลังส่งคืนเรียบร้อย
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    ถ่ายรูปหลักฐานสภาพอุปกรณ์ร่วมกันทั้งตอนรับและคืน
                    เพื่อความปลอดภัยทั้งสองฝ่าย
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* ───────────── คอลัมน์ขวา: สรุปคำสั่งเช่า ───────────── */}
          <aside className="space-y-6 lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              {/* ข้อมูลสินค้าสั้น ๆ */}
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      sizes="56px"
                      className="object-cover"
                      unoptimized={item.imageUrl.startsWith("data:") || item.imageUrl.startsWith("blob:")}
                    />
                  ) : (
                    <Package className="h-7 w-7 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {thb.format(item.rentalFeePerDay)} / วัน
                  </p>
                </div>
              </div>

              {/* ข้อมูลผู้ให้เช่า */}
              <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-slate-50 p-3">
                {owner.avatarUrl ? (
                  <Image
                    src={owner.avatarUrl}
                    alt={owner.displayName}
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-full object-cover shadow-sm"
                    unoptimized={owner.avatarUrl.startsWith("data:") || owner.avatarUrl.startsWith("blob:")}
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-xs font-bold text-white">
                    {owner.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {owner.displayName}
                    </p>
                    {owner.isVerified && (
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    )}
                  </div>
                  {rating && (
                    <p className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span>
                        {rating.average.toFixed(1)} ({rating.count} รีวิว)
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* สรุปราคา */}
              <div className="my-5 border-t border-slate-100 pt-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700">
                  สรุปค่าใช้จ่าย
                </h3>

                {days > 0 ? (
                  <dl className="space-y-2.5">
                    <PriceRow
                      label={`ค่าเช่า (${days} วัน × ${thb.format(item.rentalFeePerDay)})`}
                      value={thb.format(rentalFee)}
                    />
                    <PriceRow
                      label="เงินประกัน (คืนเมื่อเสร็จสิ้น)"
                      value={thb.format(item.deposit)}
                      muted
                    />

                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-sm font-bold text-slate-900">
                          ยอดรวมที่ต้องชำระ
                        </dt>
                        <dd className="text-xl font-extrabold text-[#1b3554]">
                          {thb.format(totalPayable)}
                        </dd>
                      </div>
                      <p className="mt-1 text-right text-[11px] text-slate-400">
                        (ค่าเช่าสุทธิ {thb.format(rentalFee)} + เงินประกัน{" "}
                        {thb.format(item.deposit)})
                      </p>
                    </div>
                  </dl>
                ) : (
                  <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                    เลือกช่วงวันที่เช่าเพื่อดูราคา
                  </p>
                )}
              </div>

              {isLenderOnly ? (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled
                    className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-400 opacity-80 shadow-none"
                    title="บัญชีของคุณเป็นผู้ให้เช่าเท่านั้น ไม่สามารถส่งคำขอเช่าได้"
                  >
                    <Send className="h-5 w-5 text-slate-400" />
                    <span>ไม่สามารถส่งคำขอได้ (บัญชีผู้ให้เช่า)</span>
                  </button>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs text-amber-800 space-y-2">
                    <p className="font-medium">
                      บัญชีของคุณเป็นผู้ให้เช่าเท่านั้น หากต้องการเช่าอุปกรณ์
                      กรุณาสมัครบทบาทผู้เช่าเพิ่ม
                    </p>
                    <button
                      type="button"
                      disabled={addingRenterRole}
                      onClick={handleQuickAddRenterRole}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1b3554] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#3f6593] disabled:opacity-50"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>
                        {addingRenterRole
                          ? "กำลังเพิ่มบทบาท..."
                          : "สมัครบทบาทผู้เช่าเพิ่มทันที"}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* FR-04: ตรวจสอบข้อมูลรูปบัตรประชาชน + รูปคู่บัตร + บัญชีธนาคาร ของผู้เช่า */}
                  {currentUser && renterKyc.loaded && !isRenterKycVerified && (
                    <div
                      className={`rounded-2xl border p-3.5 text-xs ${
                        !hasAllRenterKycDocs || isRenterKycRejected
                          ? "border-amber-200 bg-amber-50/90 text-amber-900"
                          : "border-sky-200 bg-sky-50/90 text-sky-900"
                      }`}
                    >
                      {!hasAllRenterKycDocs || isRenterKycRejected ? (
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <div>
                              <p className="font-bold">
                                ลงทะเบียนยืนยันตัวตนก่อนส่งคำขอเช่าครั้งแรก
                              </p>
                              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                                กรุณาอัปโหลดรูปถ่ายบัตรประชาชน รูปถ่ายบุคคลคู่กับบัตรประชาชน และข้อมูลบัญชีธนาคาร เพื่อให้แอดมินตรวจสอบตัวตนก่อนส่งคำขอเช่า
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowRenterKycModal(true)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1b3554] px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#3f6593]"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            <span>ลงทะเบียนบัตรประชาชนและบัญชีธนาคาร</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                            <div>
                              <p className="font-bold">
                                รอแอดมินตรวจสอบตัวตนของผู้เช่า
                              </p>
                              <p className="mt-0.5 text-[11px] leading-relaxed text-sky-800">
                                คุณได้ลงทะเบียนรูปบัตรประชาชน รูปคู่บัตร และบัญชีธนาคารแล้ว กรุณารอแอดมินอนุมัติตัวตนก่อนส่งคำขอเช่า
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowRenterKycModal(true)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#1b3554] transition hover:bg-sky-50"
                          >
                            <span>ดู / แก้ไขข้อมูลที่ส่งไว้</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {kycSuccessNotice && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                      {kycSuccessNotice}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (
                        currentUser &&
                        renterKyc.loaded &&
                        (!hasAllRenterKycDocs || isRenterKycRejected)
                      ) {
                        setShowRenterKycModal(true);
                        return;
                      }

                      // ตรวจสอบวันและเวลานัดรับสินค้า ต้องไม่เป็นเวลาในอดีต (TC09)
                      if (startKey) {
                        const currentSimMs = new Date(simulatedNowIso).getTime();
                        const pickupMs = new Date(
                          `${startKey}T${(meetupTime || "12:00").padStart(5, "0")}:00+07:00`,
                        ).getTime();
                        if (pickupMs < currentSimMs) {
                          setSubmitError(
                            "ช่วงเวลาที่เลือกไม่ถูกต้อง ไม่สามารถเลือกวันหรือเวลานัดรับในอดีตได้",
                          );
                          return;
                        }
                      }

                      if (startKey && endKey) {
                        const pickupMs = new Date(
                          `${startKey}T${(meetupTime || "12:00").padStart(5, "0")}:00+07:00`,
                        ).getTime();
                        const returnMs = new Date(
                          `${endKey}T${(returnTime || "12:00").padStart(5, "0")}:00+07:00`,
                        ).getTime();
                        if (returnMs <= pickupMs) {
                          setSubmitError(
                            "ช่วงเวลาที่เลือกไม่ถูกต้อง เวลานัดคืนสินค้าต้องอยู่หลังเวลานัดรับสินค้า",
                          );
                          return;
                        }
                      }

                      setSubmitError(null);
                      setShowTermsModal(true);
                    }}
                    disabled={!canContinue || isSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-3.5 text-base font-semibold text-white shadow-md shadow-[#1b3554]/15 transition duration-200 hover:from-[#000f22] hover:to-[#1b3554] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                    <span>
                      {isSubmitting ? "กำลังส่งคำขอเช่า..." : "ส่งคำขอเช่า"}
                    </span>
                  </button>
                </div>
              )}

              {submitError && (
                <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
                  {submitError}
                </div>
              )}

              {!isLenderOnly && (
                <p className="mt-2.5 text-center text-xs text-slate-400">
                  เมื่อส่งคำขอแล้ว คุณสามารถติดตามและดำเนินการต่อในแดชบอร์ด
                </p>
              )}

              {!isLenderOnly && !canContinue && (startKey || pickupId) && (
                <p className="mt-2 text-center text-xs text-amber-600">
                  {!endKey
                    ? "กรุณาเลือกช่วงวันที่เช่าให้ครบ"
                    : "กรุณาเลือกจุดรับและจุดคืนอุปกรณ์"}
                </p>
              )}
            </div>

            {/* แผงยืนยัน */}
            {draft && <DraftPanel draft={draft} />}
          </aside>
        </div>
      </div>
      <RentalTermsModal
        open={showTermsModal}
        submitting={isSubmitting}
        onCancel={() => setShowTermsModal(false)}
        onConfirm={handleSubmitBooking}
      />

      {/* Modal ลงทะเบียนยืนยันตัวตนและบัญชีธนาคารสำหรับผู้เช่าที่ต้องการส่งคำขอเช่าครั้งแรก (FR-04) */}
      {showRenterKycModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-[#000f22]">
                  ลงทะเบียนยืนยันตัวตนผู้เช่า (สำหรับการเช่าครั้งแรก)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  กรุณาอัปโหลดรูปถ่ายบัตรประชาชน รูปถ่ายบุคคลคู่กับบัตรประชาชน และบัญชีธนาคาร เพื่อให้แอดมินตรวจสอบตัวตนของผู้เช่า
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRenterKycModal(false)}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {kycModalError && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{kycModalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitRenterKyc} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1b3554]">
                  เลขประจำตัวประชาชน (13 หลัก)
                </label>
                <input
                  type="text"
                  maxLength={13}
                  inputMode="numeric"
                  value={kycNationalId}
                  onChange={(e) =>
                    setKycNationalId(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="เช่น 1234567890123"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-[#c0e6fd]/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1b3554]">
                  1. รูปถ่ายบัตรประชาชน *{" "}
                  {renterKyc.idCardUrl && (
                    <span className="font-normal text-emerald-600">
                      (มีรูปเดิมในระบบแล้ว)
                    </span>
                  )}
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) =>
                    setKycIdCardFile(e.target.files?.[0] || null)
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-[#c0e6fd]/50 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-[#1b3554]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1b3554]">
                  2. รูปถ่ายบุคคลคู่กับบัตรประชาชน *{" "}
                  {renterKyc.idCardSelfieUrl && (
                    <span className="font-normal text-emerald-600">
                      (มีรูปเดิมในระบบแล้ว)
                    </span>
                  )}
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) =>
                    setKycSelfieFile(e.target.files?.[0] || null)
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-[#c0e6fd]/50 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-[#1b3554]"
                />
              </div>

              <div className="border-t border-slate-100 pt-3">
                <span className="mb-3 block text-xs font-bold text-[#1b3554]">
                  3. ข้อมูลบัญชีธนาคาร (สำหรับรับเงินประกันคืน) *
                </span>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      ธนาคาร *
                    </label>
                    <select
                      value={kycBankName}
                      onChange={(e) => setKycBankName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-[#c0e6fd]/50"
                    >
                      <option value="">-- เลือกธนาคาร --</option>
                      <option value="กสิกรไทย">ธนาคารกสิกรไทย (KBANK)</option>
                      <option value="ไทยพาณิชย์">ธนาคารไทยพาณิชย์ (SCB)</option>
                      <option value="กรุงเทพ">ธนาคารกรุงเทพ (BBL)</option>
                      <option value="กรุงไทย">ธนาคารกรุงไทย (KTB)</option>
                      <option value="กรุงศรีอยุธยา">ธนาคารกรุงศรีอยุธยา (BAY)</option>
                      <option value="ทหารไทยธนชาต">ธนาคารทหารไทยธนชาต (TTB)</option>
                      <option value="ออมสิน">ธนาคารออมสิน (GSB)</option>
                      <option value="ธ.ก.ส.">ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)</option>
                      <option value="ยูโอบี">ธนาคารยูโอบี (UOB)</option>
                      <option value="อื่นๆ">ธนาคารอื่นๆ</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      เลขที่บัญชีธนาคาร *
                    </label>
                    <input
                      type="text"
                      maxLength={15}
                      inputMode="numeric"
                      value={kycAccountNumber}
                      onChange={(e) =>
                        setKycAccountNumber(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="กรอกเฉพาะตัวเลข เช่น 1234567890"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-[#c0e6fd]/50"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      ชื่อบัญชีธนาคาร (ตรงตามสมุดบัญชี) *
                    </label>
                    <input
                      type="text"
                      value={kycAccountName}
                      onChange={(e) => setKycAccountName(e.target.value)}
                      placeholder="เช่น นาย สมชาย ใจดี"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-[#c0e6fd]/50"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRenterKycModal(false)}
                  disabled={kycSubmitting}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={kycSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#3f6593] to-[#1b3554] px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-50"
                >
                  {kycSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>กำลังส่งข้อมูล...</span>
                    </>
                  ) : (
                    <span>ส่งข้อมูลให้แอดมินตรวจสอบ</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────── ชิ้นส่วนย่อย ────────────────────────────── */

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  );
}

function LocationPicker({
  title,
  locations,
  selectedId,
  onSelect,
}: {
  title: string;
  locations: BookingPageData["locations"];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
        {title}
      </p>
      {locations.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-400">
          ยังไม่มีจุดนัดสำหรับอุปกรณ์นี้
        </p>
      ) : (
        <div className="space-y-2">
          {locations.map((loc) => {
            const selected = loc.id === selectedId;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => onSelect(loc.id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                  selected
                    ? "border-[#3f6593] bg-sky-50 ring-2 ring-sky-100"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    selected
                      ? "bg-[#1b3554] text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">
                    {loc.description}
                  </span>
                  {loc.fullAddress && (
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                      {loc.fullAddress}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PriceRow({
  label,
  value,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className={`text-sm ${muted ? "text-slate-400" : "text-slate-600"}`}>
        {label}
      </dt>
      <dd
        className={`shrink-0 text-sm font-semibold ${
          highlight ? "text-emerald-600" : "text-slate-800"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function DraftPanel({ draft }: { draft: BookingDraft }) {
  const rows: Array<[string, string]> = [
    ["item_id", draft.item_id],
    ["user_id", draft.user_id ?? "— (รอ auth)"],
    ["start_date", draft.start_date],
    ["end_date", draft.end_date],
    ["meetup_location", draft.meetup_location],
    ["return_location", draft.return_location],
    ["rental_fee", String(draft.rental_fee)],
    ["deposit", String(draft.deposit)],
    ["fee", String(draft.fee)],
    ["net_income", String(draft.net_income)],
    ["total_paid", String(draft.total_paid)],
    ["status", draft.status],
  ];
  return (
    <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        <h3 className="text-sm font-bold text-slate-900">
          บันทึกร่างคำขอเรียบร้อย
        </h3>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        ข้อมูลนี้พร้อมส่งต่อไปยังขั้นตอน “ส่งคำขอเช่า” (ยังไม่บันทึกลงฐานข้อมูล)
      </p>
      <dl className="mt-4 divide-y divide-emerald-100 overflow-hidden rounded-xl border border-emerald-100 bg-white text-xs">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-start justify-between gap-3 px-3 py-2"
          >
            <dt className="font-mono text-slate-400">{k}</dt>
            <dd className="break-all text-right font-medium text-slate-700">
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <MessageCircle className="h-3.5 w-3.5 shrink-0" />
        เก็บไว้ที่ sessionStorage · key: chaochao:bookingDraft
      </p>
    </div>
  );
}
