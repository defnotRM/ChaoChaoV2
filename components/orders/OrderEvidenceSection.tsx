"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  Lightbulb,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

export interface EvidenceRecord {
  evidence_id: string;
  evidence_type: string; // "lender_before" | "renter_before" | "lender_after" | "renter_after"
  image_url: string;
  created_at: string;
  uploaded_by?: string;
}

interface SelectedPhoto {
  id: string;
  file: File;
  url: string;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTOS = 5;

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

const timeOnlyFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

function formatThaiDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  const clean = dateStr.trim().split("T")[0];
  const [y, m, d] = clean.split("-").map(Number);
  if (!y || !m || !d) return clean;
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

function normalizeTimeStr(timeStr?: string | null) {
  const raw = (timeStr || "12:00").trim();
  const parts = raw.split(":");
  const hh = String(parts[0] ?? "12").padStart(2, "0");
  const mm = String(parts[1] ?? "00").padStart(2, "0");
  return `${hh}:${mm}`;
}

function computeWindowMs(
  dateStr?: string | null,
  timeStr?: string | null,
  graceHours: number = 1,
) {
  const cleanDate = (dateStr || "").trim().split("T")[0] || "2026-01-01";
  const hhmm = normalizeTimeStr(timeStr);
  const startObj = new Date(`${cleanDate}T${hhmm}:00+07:00`);
  const startMs = Number.isNaN(startObj.getTime())
    ? 1767225600000
    : startObj.getTime();
  const deadlineMs = startMs + graceHours * 3600 * 1000;
  return { startMs, deadlineMs, hhmm };
}

function formatRemainingMMSS(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatWaitDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} วัน`);
  if (hrs > 0) parts.push(`${hrs} ชม.`);
  if (mins > 0) parts.push(`${mins} นาที`);
  if (days === 0 && hrs === 0) parts.push(`${secs} วินาที`);
  return parts.join(" ") || "0 วินาที";
}

export function summarizeEvidence(
  evidenceList: EvidenceRecord[],
  type: "lender_before" | "renter_before" | "lender_after" | "renter_after",
) {
  const matched = (evidenceList || []).filter((e) => e.evidence_type === type);
  if (matched.length === 0) return null;
  const latest = matched.reduce((acc, cur) =>
    cur.created_at > acc.created_at ? cur : acc,
  );
  return {
    count: matched.length,
    uploadedAt: latest.created_at,
    imageUrls: matched.map((m) => m.image_url),
  };
}

export function OrderEvidencePanel({
  orderId,
  userId,
  viewerRole,
  myName,
  otherName,
  phase,
  canUpload,
  scheduledDate,
  scheduledTime,
  rentalFee = 0,
  deposit = 0,
  evidenceList,
  onSuccess,
}: {
  orderId: string;
  userId: string;
  viewerRole: "lender" | "renter";
  myName: string;
  otherName: string;
  phase: "before" | "after";
  canUpload: boolean;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  rentalFee?: number;
  deposit?: number;
  evidenceList: EvidenceRecord[];
  onSuccess: (res: {
    status?: string;
    bothUploaded?: boolean;
    message?: string;
  }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Simulated clock state
  const [mounted, setMounted] = useState<boolean>(false);
  const [offsetSeconds, setOffsetSeconds] = useState<number>(0);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [graceHours, setGraceHours] = useState<number>(1);
  const [realNowMs, setRealNowMs] = useState<number>(0);
  const expiredTriggeredRef = useRef<boolean>(false);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // FR-28 กรณีที่ 3: ปฏิเสธรับสินค้า
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<
    "changed_mind" | "not_as_advertised"
  >("changed_mind");
  const [rejectDescription, setRejectDescription] = useState<string>("");
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const syncSimulatedTime = useCallback(async () => {
    try {
      const res = await fetch(`/api/simulated-time?orderId=${orderId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.offsetSeconds === "number") {
        setOffsetSeconds(data.offsetSeconds);
        setIsSimulated(Boolean(data.isSimulated));
        setRealNowMs(Date.now());
      }
      if (typeof data.graceHours === "number" && data.graceHours > 0) {
        setGraceHours(data.graceHours);
      }
      if (Array.isArray(data.processed) && data.processed.length > 0) {
        onSuccessRef.current({});
      }
    } catch {
      // ignore
    }
  }, [orderId]);

  useEffect(() => {
    setMounted(true);
    setRealNowMs(Date.now());
    const timerId = setInterval(() => {
      setRealNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    syncSimulatedTime();
    const pollId = setInterval(syncSimulatedTime, 2500);
    return () => clearInterval(pollId);
  }, [syncSimulatedTime]);

  const { startMs, deadlineMs, hhmm } = computeWindowMs(
    scheduledDate,
    scheduledTime,
    graceHours,
  );
  const simulatedNowMs = realNowMs + offsetSeconds * 1000;
  const effectiveNowMs =
    mounted && realNowMs > 0 ? simulatedNowMs : startMs;
  const deadlineTimeStr = timeOnlyFmt.format(new Date(deadlineMs));
  const isBeforeWindow = Boolean(scheduledDate) && effectiveNowMs < startMs;
  const isWithinWindow =
    !scheduledDate || (effectiveNowMs >= startMs && effectiveNowMs <= deadlineMs);
  const isExpiredWindow = Boolean(scheduledDate) && effectiveNowMs > deadlineMs;
  const remainingMs = Math.max(0, deadlineMs - effectiveNowMs);
  const totalWindowMs = Math.max(1, deadlineMs - startMs);
  const progressPercent = Math.min(
    100,
    Math.max(0, (remainingMs / totalWindowMs) * 100),
  );

  // เมื่อเวลาจำลอง/จริงพ้นเส้นตาย 1 ชั่วโมง ให้เรียกตรวจสอบและตัดจบออเดอร์ทันที
  useEffect(() => {
    if (isExpiredWindow && canUpload && !expiredTriggeredRef.current) {
      expiredTriggeredRef.current = true;
      syncSimulatedTime();
    } else if (!isExpiredWindow) {
      expiredTriggeredRef.current = false;
    }
  }, [isExpiredWindow, canUpload, syncSimulatedTime]);

  const isLender = viewerRole === "lender";
  const myType =
    phase === "before"
      ? isLender
        ? "lender_before"
        : "renter_before"
      : isLender
        ? "lender_after"
        : "renter_after";
  const otherType =
    phase === "before"
      ? isLender
        ? "renter_before"
        : "lender_before"
      : isLender
        ? "renter_after"
        : "lender_after";

  const myEvidence = summarizeEvidence(evidenceList, myType);
  const otherEvidence = summarizeEvidence(evidenceList, otherType);

  const myRoleLabel = isLender ? "ผู้ให้เช่า" : "ผู้เช่า";
  const otherRoleLabel = isLender ? "ผู้เช่า" : "ผู้ให้เช่า";

  const actionLabel =
    phase === "before"
      ? isLender
        ? "ส่งมอบของ"
        : "รับของ"
      : isLender
        ? "รับของคืน"
        : "คืนของ";

  const phaseTitle =
    phase === "before"
      ? `หลักฐานตอน${actionLabel} (ก่อนเริ่มเช่า)`
      : `หลักฐานตอน${actionLabel} (หลังใช้งาน)`;

  const alreadyUploaded = myEvidence !== null;
  const bothUploaded = myEvidence !== null && otherEvidence !== null;
  const attachedCount = photos.length;
  const canUploadNow = canUpload && isWithinWindow && !alreadyUploaded;

  // ผู้เช่าสามารถกดปฏิเสธรับสินค้าได้ตาม FR-28 กรณีที่ 3 เมื่ออัปโหลดรูปรับของแล้วและยังอยู่ในกรอบ 1 ชม.
  const canRenterRejectPickup =
    viewerRole === "renter" &&
    phase === "before" &&
    alreadyUploaded &&
    isWithinWindow;

  function onFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files || []);
    e.target.value = "";
    if (chosen.length === 0) return;

    const errors: string[] = [];
    const valid: SelectedPhoto[] = [];
    const remaining = MAX_PHOTOS - photos.length;

    for (const file of chosen) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push("รองรับเฉพาะไฟล์รูป JPG, PNG หรือ WebP");
        continue;
      }
      if (valid.length >= remaining) {
        errors.push(`อัปโหลดได้ไม่เกิน ${MAX_PHOTOS} รูป`);
        break;
      }
      valid.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
      });
    }

    if (valid.length > 0) setPhotos((prev) => [...prev, ...valid]);
    setErrorMsg(errors.length > 0 ? [...new Set(errors)].join(" • ") : null);
  }

  function removePhoto(id: string) {
    setErrorMsg(null);
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleSubmit() {
    const files = photos.map((p) => p.file);
    if (files.length === 0) {
      setErrorMsg("กรุณาแนบรูปหลักฐานอย่างน้อย 1 รูป");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const fd = new FormData();
      fd.append("orderId", orderId);
      fd.append("userId", userId);
      fd.append("evidenceType", myType);
      files.forEach((f) => fd.append("photos", f));

      const endpoint = phase === "before" ? "/api/handover" : "/api/return";
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg(payload?.message ?? "อัปโหลดหลักฐานไม่สำเร็จ");
        return;
      }

      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      onSuccess({
        status: payload.status,
        bothUploaded: payload.bothUploaded,
        message: payload.message,
      });
    } catch {
      setErrorMsg("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmRejectPickup() {
    if (rejectReason === "not_as_advertised" && !rejectDescription.trim()) {
      setRejectError("กรุณาระบุรายละเอียดว่าสินค้าไม่ตรงปกอย่างไร");
      return;
    }
    setIsRejecting(true);
    setRejectError(null);
    try {
      const res = await fetch(`/api/rentals/${orderId}/reject-pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: rejectReason,
          description: rejectDescription.trim() || undefined,
          imageUrls: myEvidence?.imageUrls || [],
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRejectError(payload?.message || "ไม่สามารถปฏิเสธรับสินค้าได้");
        return;
      }
      setShowRejectModal(false);
      onSuccess({
        status: payload.status,
        message: payload.message,
      });
    } catch {
      setRejectError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsRejecting(false);
    }
  }

  const renterRefund20 = deposit + Math.round(rentalFee * 0.2 * 100) / 100;
  const lenderCompensation80 = Math.round(rentalFee * 0.8 * 100) / 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c0e6fd]/30 text-[#1b3554]">
            <Camera className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900">{phaseTitle}</h3>
            <p className="text-xs text-slate-500">
              ทั้งคุณและ{otherRoleLabel}ต้องอัปโหลดหลักฐานภายใน {graceHours}{" "}
              ชั่วโมงจากเวลานัด (ฝ่ายละไม่เกิน {MAX_PHOTOS} รูป)
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            bothUploaded
              ? "bg-emerald-500/15 text-emerald-700"
              : alreadyUploaded
                ? "bg-sky-500/15 text-sky-700"
                : "bg-amber-500/15 text-amber-800"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              bothUploaded
                ? "bg-emerald-500"
                : alreadyUploaded
                  ? "bg-sky-500"
                  : "bg-amber-500"
            }`}
          />
          {bothUploaded
            ? "ครบทั้ง 2 ฝ่ายแล้ว"
            : alreadyUploaded
              ? `รอ${otherRoleLabel}อัปโหลด`
              : "รอคุณอัปโหลดหลักฐาน"}
        </span>
      </div>

      {/* กล่องแสดงเวลานัดหมาย & เวลานับถอยหลัง 1 ชั่วโมง (FR-28 / FR-29) */}
      {scheduledDate && !bothUploaded && (
        <div
          className={`rounded-2xl border p-4 ${
            isWithinWindow
              ? "border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-sky-50"
              : isBeforeWindow
                ? "border-amber-200 bg-amber-50/80"
                : "border-rose-200 bg-rose-50/80"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock3
                className={`h-5 w-5 shrink-0 ${
                  isWithinWindow
                    ? "text-emerald-600 animate-pulse"
                    : isBeforeWindow
                      ? "text-amber-600"
                      : "text-rose-600"
                }`}
              />
              <div>
                <p
                  className={`text-xs font-bold ${
                    isWithinWindow
                      ? "text-emerald-950"
                      : isBeforeWindow
                        ? "text-amber-950"
                        : "text-rose-950"
                  }`}
                >
                  {isWithinWindow
                    ? `กำลังเปิดให้อัปโหลดรูปหลักฐาน${actionLabel} (ภายใน ${graceHours} ชั่วโมง)`
                    : isBeforeWindow
                      ? `ยังไม่ถึงเวลานัด${actionLabel} — กรุณารอให้ถึงเวลานัดหมาย`
                      : `หมดเขตอัปโหลดรูปหลักฐาน${actionLabel}แล้ว (เกิน ${graceHours} ชั่วโมง)`}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  เวลานัดหมาย: <strong>{formatThaiDate(scheduledDate)}</strong>{" "}
                  เวลา <strong>{hhmm} น.</strong> (อัปโหลดได้ถึง{" "}
                  <strong>{deadlineTimeStr} น.</strong>)
                </p>
              </div>
            </div>

            {isWithinWindow ? (
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  เวลาที่เหลือ
                </span>
                <span
                  suppressHydrationWarning
                  className="font-mono text-2xl font-extrabold tracking-tight text-[#1b3554]"
                >
                  {mounted ? formatRemainingMMSS(remainingMs) : "--:--"}
                </span>
              </div>
            ) : isBeforeWindow ? (
              <div className="rounded-xl bg-white/90 px-3 py-1.5 text-right shadow-2xs ring-1 ring-amber-200">
                <span className="block text-[10px] font-semibold text-amber-700">
                  เปิดให้อัปโหลดในอีก
                </span>
                <span
                  suppressHydrationWarning
                  className="font-mono text-xs font-bold text-amber-950"
                >
                  {mounted
                    ? formatWaitDuration(startMs - effectiveNowMs)
                    : "กำลังซิงก์..."}
                </span>
              </div>
            ) : (
              <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white">
                00:00 (หมดเวลา)
              </span>
            )}
          </div>

          {isWithinWindow && (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/80 ring-1 ring-emerald-200">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    progressPercent > 25 ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {mounted && isSimulated && (
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] text-slate-600">
              <span>
                🕒 โหมดเวลาจำลอง Admin ปัจจุบัน:{" "}
                <strong suppressHydrationWarning className="text-[#1b3554]">
                  {dateTimeFmt.format(new Date(effectiveNowMs))} น.
                </strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* คำแนะนำ */}
      <div className="flex items-start gap-2 rounded-2xl border border-sky-100 bg-sky-50/50 px-4 py-3">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-xs leading-relaxed text-slate-600">
          <strong className="text-slate-800">
            {phase === "before"
              ? isLender
                ? "ถ่ายให้ครบก่อนส่งมอบของให้ผู้เช่าเสมอ"
                : "ถ่ายให้ครบก่อนรับของออกจากจุดนัดเสมอ"
              : isLender
                ? "ถ่ายให้ครบเมื่อได้รับของคืนจากผู้เช่า"
                : "ถ่ายให้ครบก่อนส่งคืนของให้ผู้ให้เช่า"}
          </strong>{" "}
          — ถ่ายให้ครบทุกมุม รวมถึงจุดที่มีตำหนิ (สูงสุด {MAX_PHOTOS} รูป)
          เมื่อทั้งคุณและ{otherRoleLabel}อัปโหลดครบทั้งสองฝ่าย
          ระบบจะเลื่อนสถานะไปยังขั้นถัดไปโดยอัตโนมัติ
        </p>
      </div>

      {/* ช่องเลือก/ถ่ายรูป (เฉพาะตอนที่ถึงเวลานัดและยังอยู่ในกรอบ 1 ชม.) */}
      {canUploadNow && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              เลือกรูปหลักฐานของคุณ ({attachedCount}/{MAX_PHOTOS} รูป)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-slate-200"
              >
                <img
                  src={photo.url}
                  alt={`รูปหลักฐานที่ ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  disabled={submitting}
                  className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-rose-600 shadow-sm transition hover:bg-white disabled:opacity-50"
                  aria-label={`ลบรูปที่ ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded-md bg-black/50 px-1.5 py-0.5 text-center text-[10px] font-medium text-white">
                  รูปที่ {index + 1}
                </span>
              </div>
            ))}

            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={submitting}
                className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-[#3f6593] hover:bg-sky-50/50 hover:text-[#3f6593] disabled:opacity-50"
              >
                {photos.length === 0 ? (
                  <Camera className="h-6 w-6" />
                ) : (
                  <Plus className="h-6 w-6" />
                )}
                <span className="text-[11px] font-semibold">
                  {photos.length === 0 ? "ถ่าย / เลือกรูป" : "เพิ่มรูป"}
                </span>
              </button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={onFilesChosen}
          />

          {errorMsg && (
            <p className="mt-2 text-xs font-medium text-rose-600">{errorMsg}</p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={attachedCount === 0 || submitting}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition hover:from-[#000f22] hover:to-[#1b3554] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            <span>
              {submitting
                ? "กำลังอัปโหลดหลักฐาน..."
                : `ยืนยัน${actionLabel} / อัปโหลดหลักฐาน (${attachedCount} รูป)`}
            </span>
          </button>
        </div>
      )}

      {/* FR-28 กรณีที่ 3: ปุ่มปฏิเสธรับสินค้าหลังผู้เช่าอัปโหลดรูปภายในเวลา */}
      {canRenterRejectPickup && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>
                  ต้องการปฏิเสธรับสินค้าหรือไม่? (FR-28 กรณีที่ 3)
                </span>
              </p>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                คุณอัปโหลดรูปหลักฐานภายในเวลาแล้ว หากไม่ต้องการรับสินค้า
                ระบบจะปิดการเช่า คืนเงินประกัน 100% พร้อมค่าเช่า 20% ให้คุณ
                และโอนค่าเช่า 80% ให้ผู้ให้เช่า
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRejectModal(true)}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700 active:scale-95"
            >
              <XCircle className="h-4 w-4" />
              <span>ปฏิเสธรับสินค้า</span>
            </button>
          </div>
        </div>
      )}

      {/* แถวสถานะของเรา */}
      <UploaderRow
        initials={(myName || myRoleLabel).slice(0, 2)}
        name={`คุณ (${myRoleLabel})`}
        done={alreadyUploaded}
        subtitle={
          myEvidence
            ? `อัปโหลดแล้ว ${myEvidence.count} รูป · ${dateTimeFmt.format(
                new Date(myEvidence.uploadedAt),
              )}`
            : attachedCount > 0
              ? `เลือกไว้ ${attachedCount} รูป · กดปุ่มยืนยันด้านบนเพื่อบันทึก`
              : "ยังไม่ได้อัปโหลดหลักฐาน"
        }
      >
        {myEvidence && myEvidence.imageUrls.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {myEvidence.imageUrls.map((url, index) => (
              <a
                key={`${url}-${index}`}
                href={url.startsWith("data:") ? undefined : url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-square overflow-hidden rounded-xl ring-1 ring-emerald-200"
              >
                <img
                  src={url}
                  alt={`รูปหลักฐานของคุณ ${index + 1}`}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
                <span className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-0.5 truncate rounded bg-emerald-600/85 px-1 py-0.5 text-[10px] font-medium text-white">
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                  รูปที่ {index + 1}
                </span>
              </a>
            ))}
          </div>
        )}
      </UploaderRow>

      {/* แถวสถานะอีกฝ่าย + รูปหลักฐานของอีกฝ่าย */}
      <UploaderRow
        initials={(otherName || otherRoleLabel).slice(0, 2)}
        name={`${otherName} (${otherRoleLabel})`}
        done={otherEvidence !== null}
        subtitle={
          otherEvidence
            ? `อัปโหลดแล้ว ${otherEvidence.count} รูป · ${dateTimeFmt.format(
                new Date(otherEvidence.uploadedAt),
              )}`
            : `รอ${otherRoleLabel}อัปโหลดหลักฐาน`
        }
      >
        {otherEvidence && otherEvidence.imageUrls.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {otherEvidence.imageUrls.map((url, index) => (
              <a
                key={`${url}-${index}`}
                href={url.startsWith("data:") ? undefined : url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-square overflow-hidden rounded-xl ring-1 ring-slate-200"
              >
                <img
                  src={url}
                  alt={`รูปหลักฐานของ${otherRoleLabel} ${index + 1}`}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
                <span className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-0.5 truncate rounded bg-slate-800/75 px-1 py-0.5 text-[10px] font-medium text-white">
                  รูปที่ {index + 1}
                </span>
              </a>
            ))}
          </div>
        )}
      </UploaderRow>

      <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 shrink-0 text-[#3f6593]" />
        <span>
          รูปหลักฐานของทั้งสองฝ่ายจะถูกเก็บไว้ในระบบเพื่อใช้เปรียบเทียบสภาพอุปกรณ์หากมีข้อพิพาท
        </span>
      </div>

      {/* Modal ปฏิเสธรับสินค้า (FR-28 กรณีที่ 3) */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowRejectModal(false)}
              className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900">
              ยืนยันการปฏิเสธรับสินค้า (FR-28 กรณีที่ 3)
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              เลือกรูปแบบการปฏิเสธรับสินค้าหน้างานภายในกรอบเวลา 1 ชั่วโมง
            </p>

            <div className="mt-4 space-y-3">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                  rejectReason === "changed_mind"
                    ? "border-rose-500 bg-rose-50/50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="rejectReason"
                  value="changed_mind"
                  checked={rejectReason === "changed_mind"}
                  onChange={() => setRejectReason("changed_mind")}
                  className="mt-1"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-900">
                    ปฏิเสธรับสินค้า (ตามเงื่อนไข FR-28 กรณีที่ 3)
                  </p>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    ปิดการเช่าทันที โดยระบบจะคืนเงินประกันทั้งหมดพร้อมค่าเช่า
                    20% ให้ผู้เช่า ({thb.format(renterRefund20)})
                    และโอนค่าเช่าอีก 80% ({thb.format(lenderCompensation80)})
                    เป็นค่าเสียเวลาแก่ผู้ให้เช่า
                  </p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                  rejectReason === "not_as_advertised"
                    ? "border-rose-500 bg-rose-50/50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="rejectReason"
                  value="not_as_advertised"
                  checked={rejectReason === "not_as_advertised"}
                  onChange={() => setRejectReason("not_as_advertised")}
                  className="mt-1"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-900">
                    สินค้าไม่ตรงปก / ชำรุดเสียหาย (ส่งให้แอดมินตรวจสอบ)
                  </p>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    ส่งรายงานข้อพิพาทพร้อมรูปที่ถ่ายไว้ให้แอดมินพิจารณาคืนเงิน
                    100%
                  </p>
                </div>
              </label>

              {rejectReason === "not_as_advertised" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ระบุรายละเอียดความไม่ตรงปก{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={rejectDescription}
                    onChange={(e) => setRejectDescription(e.target.value)}
                    placeholder="อธิบายจุดที่ชำรุดหรือไม่ตรงตามประกาศ..."
                    className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 focus:border-[#3f6593] focus:outline-none"
                  />
                </div>
              )}

              {rejectError && (
                <p className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-600">
                  {rejectError}
                </p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectPickup}
                disabled={isRejecting}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-rose-700 disabled:opacity-50"
              >
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span>ยืนยันการปฏิเสธสินค้า</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function OrderEvidenceModal({
  isOpen,
  onClose,
  orderId,
  userId,
  viewerRole,
  myName,
  otherName,
  phase,
  canUpload,
  scheduledDate,
  scheduledTime,
  rentalFee,
  deposit,
  evidenceList,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  userId: string;
  viewerRole: "lender" | "renter";
  myName: string;
  otherName: string;
  phase: "before" | "after";
  canUpload: boolean;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  rentalFee?: number;
  deposit?: number;
  evidenceList: EvidenceRecord[];
  onSuccess: (res: {
    status?: string;
    bothUploaded?: boolean;
    message?: string;
  }) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="ปิดหน้าต่าง"
        >
          <X className="h-5 w-5" />
        </button>

        <OrderEvidencePanel
          orderId={orderId}
          userId={userId}
          viewerRole={viewerRole}
          myName={myName}
          otherName={otherName}
          phase={phase}
          canUpload={canUpload}
          scheduledDate={scheduledDate}
          scheduledTime={scheduledTime}
          rentalFee={rentalFee}
          deposit={deposit}
          evidenceList={evidenceList}
          onSuccess={(res) => {
            onSuccess(res);
          }}
        />
      </div>
    </div>
  );
}

function UploaderRow({
  initials,
  name,
  subtitle,
  done,
  children,
}: {
  initials: string;
  name: string;
  subtitle: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-xs font-bold text-white">
          {(initials || "U").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{name}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            done
              ? "bg-emerald-500/15 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              done ? "bg-emerald-500" : "bg-slate-400"
            }`}
          />
          {done ? "เสร็จแล้ว" : "รอดำเนินการ"}
        </span>
      </div>
      {children}
    </div>
  );
}
