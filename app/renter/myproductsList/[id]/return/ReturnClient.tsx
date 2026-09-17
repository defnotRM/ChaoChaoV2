"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, Trash2, Upload } from "lucide-react";

export interface ReturnPageData {
  orderId: string;
  itemName: string;
  imageUrl: string | null;
  returnLocation: string | null;
  startDate: string;
  endDate: string;
  deposit: number;
  status: string;
  ownerName: string;
  ownerId: string;
  renterEvidence: { count: number; uploadedAt: string } | null;
  lenderEvidence: { count: number; uploadedAt: string } | null;
}

const dateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTOS = 5;

function formatDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

export default function ReturnClient({ data }: { data: ReturnPageData }) {
  const router = useRouter();
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const alreadyUploaded = data.renterEvidence !== null;

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const remaining = MAX_PHOTOS - previews.length;
    if (remaining <= 0) {
      setErrorMsg(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูป`);
      return;
    }

    const toAdd = files.slice(0, remaining);
    for (const file of toAdd) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setErrorMsg("รองรับเฉพาะไฟล์รูป JPG, PNG หรือ WebP");
        continue;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
    setErrorMsg(null);
  }

  function removePreview(index: number) {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (previews.length === 0) {
      setErrorMsg("กรุณาแนบรูปหลักฐานอย่างน้อย 1 รูป");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/rentals/${data.orderId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidenceType: "renter_after",
          imageUrls: previews,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(payload?.message ?? "อัปโหลดหลักฐานไม่สำเร็จ");
        return;
      }
      router.refresh();
    } catch {
      setErrorMsg("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-6 sm:pb-20 sm:pt-8">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Link
            href="/renter/mydashboard"
            className="transition hover:text-[#1b3554]"
          >
            รายการเช่าของฉัน
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-[#1b3554]">คืนอุปกรณ์</span>
        </nav>

        <Link
          href={`/renter/myproductsList/${data.orderId}`}
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#1b3554]"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับไปรายละเอียดการเช่า
        </Link>

        <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          คืนอุปกรณ์ &amp; บันทึกสภาพหลังใช้งาน
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {data.itemName} · กำหนดคืนวันที่ {formatDate(data.endDate)}
          {data.returnLocation ? ` · ${data.returnLocation}` : ""}
        </p>

        {alreadyUploaded ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>
              คุณอัปโหลดหลักฐานคืนของแล้ว ({data.renterEvidence?.count} รูป)
              กำลังรอผู้ให้เช่า{" "}
              {data.lenderEvidence
                ? "ตรวจสอบและยืนยันรับคืน"
                : "มารับของและยืนยัน"}
            </span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-3 text-sm font-bold text-slate-900">
              ถ่ายรูปสภาพอุปกรณ์ตอนคืน (สูงสุด {MAX_PHOTOS} รูป)
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              ถ่ายให้เห็นสภาพชัดเจนทุกมุม ไว้เป็นหลักฐานเทียบกับตอนรับของ
            </p>

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {previews.map((url, i) => (
                <div
                  key={i}
                  className="relative aspect-square overflow-hidden rounded-xl border border-slate-200"
                >
                  <img
                    src={url}
                    alt={`หลักฐาน ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePreview(i)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {previews.length < MAX_PHOTOS && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 text-slate-400 hover:bg-slate-50">
                  <Camera className="h-6 w-6" />
                  <span className="text-[10px] font-semibold">เพิ่มรูป</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleFiles}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {errorMsg && (
              <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
                {errorMsg}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || previews.length === 0}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-700/20 transition hover:from-emerald-700 hover:to-teal-800 active:scale-95 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              <span>{submitting ? "กำลังอัปโหลด..." : "ยืนยันคืนอุปกรณ์"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
