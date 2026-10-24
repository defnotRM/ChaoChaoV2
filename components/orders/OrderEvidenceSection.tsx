"use client";

import { useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
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

const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function summarizeEvidence(
  evidenceList: EvidenceRecord[],
  type: "lender_before" | "renter_before" | "lender_after" | "renter_after"
) {
  const matched = (evidenceList || []).filter((e) => e.evidence_type === type);
  if (matched.length === 0) return null;
  const latest = matched.reduce((acc, cur) =>
    cur.created_at > acc.created_at ? cur : acc
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
              ทั้งคุณและ{otherRoleLabel}ต้องอัปโหลดหลักฐาน (ฝ่ายละไม่เกิน{" "}
              {MAX_PHOTOS} รูป) และเห็นรูปของกันและกัน
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

      {/* ช่องเลือก/ถ่ายรูป (เฉพาะตอนที่ยังไม่ได้อัปโหลด และอยู่ในสถานะที่อัปโหลดได้) */}
      {!alreadyUploaded && canUpload && (
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

      {/* แถวสถานะของเรา */}
      <UploaderRow
        initials={(myName || myRoleLabel).slice(0, 2)}
        name={`คุณ (${myRoleLabel})`}
        done={alreadyUploaded}
        subtitle={
          myEvidence
            ? `อัปโหลดแล้ว ${myEvidence.count} รูป · ${dateTimeFmt.format(
                new Date(myEvidence.uploadedAt)
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
                new Date(otherEvidence.uploadedAt)
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
          evidenceList={evidenceList}
          onSuccess={(res) => {
            onSuccess(res);
            if (res.bothUploaded) {
              onClose();
            }
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
          {initials.toUpperCase()}
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
