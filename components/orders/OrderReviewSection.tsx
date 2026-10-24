"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Loader2,
  Plus,
  Send,
  Star,
  Trash2,
} from "lucide-react";

export interface OrderReviewRecord {
  review_id: string;
  order_id: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at?: string;
  imageUrls: string[];
}

interface SelectedPhoto {
  id: string;
  file: File;
  url: string;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTOS = 5;

const RATING_LABELS: Record<number, string> = {
  1: "แย่มาก (1/5)",
  2: "พอใช้ (2/5)",
  3: "ปานกลาง (3/5)",
  4: "ดีมาก (4/5)",
  5: "ประทับใจมาก (5/5)",
};

const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function OrderReviewSection({
  orderId,
  itemId,
  itemName,
  userId,
  viewerRole,
  renterName,
  renterAvatarUrl,
  lenderName,
  initialReview,
  onReviewSaved,
}: {
  orderId: string;
  itemId: string;
  itemName: string;
  userId: string;
  viewerRole: "renter" | "lender";
  renterName: string;
  renterAvatarUrl?: string | null;
  lenderName: string;
  initialReview?: OrderReviewRecord | null;
  onReviewSaved?: (review: OrderReviewRecord, message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<OrderReviewRecord | null>(
    initialReview ?? null,
  );
  const [isEditing, setIsEditing] = useState<boolean>(!initialReview);
  const [rating, setRating] = useState<number>(initialReview?.rating ?? 5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>(initialReview?.comment ?? "");
  const [existingUrls, setExistingUrls] = useState<string[]>(
    initialReview?.imageUrls ?? [],
  );
  const [newPhotos, setNewPhotos] = useState<SelectedPhoto[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const totalPhotoCount = existingUrls.length + newPhotos.length;

  function onFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files || []);
    e.target.value = "";
    if (chosen.length === 0) return;

    const errors: string[] = [];
    const valid: SelectedPhoto[] = [];
    const remaining = MAX_PHOTOS - totalPhotoCount;

    for (const file of chosen) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push("รองรับเฉพาะไฟล์รูป JPG, PNG หรือ WebP");
        continue;
      }
      if (valid.length >= remaining) {
        errors.push(`แนบรูปประกอบรีวิวได้ไม่เกิน ${MAX_PHOTOS} รูป`);
        break;
      }
      valid.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
      });
    }

    if (valid.length > 0) {
      setNewPhotos((prev) => [...prev, ...valid]);
    }
    setErrorMsg(errors.length > 0 ? [...new Set(errors)].join(" • ") : null);
  }

  function removeExistingUrl(urlToRemove: string) {
    setExistingUrls((prev) => prev.filter((u) => u !== urlToRemove));
  }

  function removeNewPhoto(id: string) {
    setNewPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessBanner(null);

    try {
      const fd = new FormData();
      fd.append("userId", userId);
      fd.append("rating", String(rating));
      fd.append("comment", comment.trim());
      existingUrls.forEach((u) => fd.append("existingImageUrls", u));
      newPhotos.forEach((p) => fd.append("photos", p.file));

      const res = await fetch(`/api/rentals/${orderId}/review`, {
        method: "POST",
        body: fd,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(payload?.message || "บันทึกรีวิวไม่สำเร็จ");
        return;
      }

      newPhotos.forEach((p) => URL.revokeObjectURL(p.url));
      setNewPhotos([]);

      const savedReview: OrderReviewRecord = payload.review;
      setReview(savedReview);
      setExistingUrls(savedReview.imageUrls || []);
      setIsEditing(false);
      setSuccessBanner(
        payload.message || "บันทึกรีวิวการเช่าเรียบร้อยแล้ว ขอบคุณครับ!",
      );
      onReviewSaved?.(
        savedReview,
        payload.message || "บันทึกรีวิวการเช่าเรียบร้อยแล้ว",
      );
    } catch {
      setErrorMsg("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  // กรณีฝั่งผู้ให้เช่าดูรีวิว
  if (viewerRole === "lender") {
    return (
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
              <Star className="h-5 w-5 fill-amber-400 text-amber-500" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                รีวิวจากผู้เช่าหลังจบการเช่า
              </h3>
              <p className="text-xs text-slate-500">
                ความคิดเห็นและคะแนนความพึงพอใจจาก {renterName} (ผู้เช่า)
              </p>
            </div>
          </div>
          {review && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>ผู้เช่ารีวิวแล้ว</span>
            </span>
          )}
        </div>

        {!review ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center text-xs text-slate-500">
            ผู้เช่ายังไม่ได้เขียนรีวิวสำหรับการเช่าครั้งนี้
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                {renterAvatarUrl ? (
                  <img
                    src={renterAvatarUrl}
                    alt={renterName}
                    className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-xs font-bold text-white">
                    {(renterName || "R").slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {renterName} (ผู้เช่า)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    รีวิวเมื่อ {dateTimeFmt.format(new Date(review.created_at))}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 shadow-2xs ring-1 ring-amber-200">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i < review.rating
                        ? "fill-amber-400 text-amber-400"
                        : "fill-slate-200 text-slate-200"
                    }`}
                  />
                ))}
                <span className="ml-1 text-xs font-bold text-slate-800">
                  {review.rating}.0
                </span>
              </div>
            </div>

            {review.comment ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {review.comment}
              </p>
            ) : (
              <p className="mt-3 text-xs italic text-slate-400">
                (ผู้เช่าให้คะแนนดาวโดยไม่ได้ระบุข้อความเพิ่มเติม)
              </p>
            )}

            {review.imageUrls && review.imageUrls.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {review.imageUrls.map((url, idx) => (
                  <a
                    key={`${url}-${idx}`}
                    href={url.startsWith("data:") ? undefined : url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block aspect-square overflow-hidden rounded-xl ring-1 ring-amber-200"
                  >
                    <img
                      src={url}
                      alt={`รูปรีวิวที่ ${idx + 1}`}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  // กรณีฝั่งผู้เช่า: เขียนรีวิว / ดูรีวิวของตัวเอง / แก้ไขรีวิว
  const activeStars = hoverRating || rating;

  return (
    <section
      id="order-review-section"
      className="overflow-hidden rounded-3xl border border-amber-200/90 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600">
            <Star className="h-5 w-5 fill-amber-400 text-amber-500" />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              เขียนรีวิวการเช่าอุปกรณ์
            </h3>
            <p className="text-xs text-slate-500">
              แบ่งปันประสบการณ์เช่า <strong>{itemName}</strong> จาก{" "}
              <strong>{lenderName} (ผู้ให้เช่า)</strong>
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            review && !isEditing
              ? "bg-emerald-500/15 text-emerald-700"
              : "bg-amber-500/15 text-amber-800"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              review && !isEditing ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {review && !isEditing ? "รีวิวเรียบร้อยแล้ว" : "รอคุณเขียนรีวิว"}
        </span>
      </div>

      {successBanner && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successBanner}</span>
        </div>
      )}

      {review && !isEditing ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {renterAvatarUrl ? (
                  <img
                    src={renterAvatarUrl}
                    alt={renterName}
                    className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-xs font-bold text-white">
                    {(renterName || "R").slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {renterName} (ผู้เช่า)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    โพสต์เมื่อ {dateTimeFmt.format(new Date(review.created_at))}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 shadow-2xs ring-1 ring-amber-200">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i < review.rating
                        ? "fill-amber-400 text-amber-400"
                        : "fill-slate-200 text-slate-200"
                    }`}
                  />
                ))}
                <span className="ml-1.5 text-xs font-bold text-slate-800">
                  {RATING_LABELS[review.rating] || `${review.rating}/5`}
                </span>
              </div>
            </div>

            {review.comment ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {review.comment}
              </p>
            ) : (
              <p className="mt-3 text-xs italic text-slate-400">
                (ไม่ได้ระบุความคิดเห็นเพิ่มเติม)
              </p>
            )}

            {review.imageUrls && review.imageUrls.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {review.imageUrls.map((url, idx) => (
                  <a
                    key={`${url}-${idx}`}
                    href={url.startsWith("data:") ? undefined : url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block aspect-square overflow-hidden rounded-xl ring-1 ring-amber-200"
                  >
                    <img
                      src={url}
                      alt={`รูปรีวิวที่ ${idx + 1}`}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/product/${itemId}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1b3554] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>ดูรีวิวของคุณบนหน้าสินค้า</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setRating(review.rating);
                setComment(review.comment || "");
                setExistingUrls(review.imageUrls || []);
                setIsEditing(true);
                setSuccessBanner(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>แก้ไขรีวิว</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* ข้อมูลผู้รีวิว */}
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3.5 py-2.5">
            {renterAvatarUrl ? (
              <img
                src={renterAvatarUrl}
                alt={renterName}
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-xs font-bold text-white">
                {(renterName || "R").slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900">
                รีวิวในชื่อ: {renterName} (ผู้เช่า)
              </p>
              <p className="text-[11px] text-slate-500">
                รีวิวนี้จะแสดงในหน้ารายละเอียดสินค้าพร้อมชื่อและรูปโปรไฟล์ของคุณ
              </p>
            </div>
          </div>

          {/* ให้คะแนนดาว 1-5 */}
          <div>
            <label className="mb-2 block text-xs font-bold text-slate-700">
              ให้คะแนนความพึงพอใจ <span className="text-rose-500">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/40 px-4 py-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="rounded-lg p-1 transition hover:scale-110 active:scale-95 cursor-pointer"
                    aria-label={`ให้คะแนน ${star} ดาว`}
                  >
                    <Star
                      className={`h-7 w-7 transition ${
                        star <= activeStars
                          ? "fill-amber-400 text-amber-400 drop-shadow-2xs"
                          : "fill-slate-200 text-slate-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-900 ring-1 ring-amber-200">
                {RATING_LABELS[activeStars] || `${activeStars}/5`}
              </span>
            </div>
          </div>

          {/* ความคิดเห็น */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              ความคิดเห็นเกี่ยวกับอุปกรณ์และการให้บริการ
            </label>
            <textarea
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="บอกเล่าประสบการณ์การใช้งาน สภาพอุปกรณ์ความตรงปก หรือความสะดวกในการนัดรับ-คืนกับผู้ให้เช่า..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#3f6593] focus:bg-white focus:outline-none"
            />
          </div>

          {/* แนบรูปภาพประกอบรีวิว (สูงสุด 5 รูป) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                รูปภาพประกอบรีวิว (ไม่บังคับ · {totalPhotoCount}/{MAX_PHOTOS} รูป)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {existingUrls.map((url, idx) => (
                <div
                  key={`existing-${idx}`}
                  className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-slate-200"
                >
                  <img
                    src={url}
                    alt={`รูปรีวิวเดิมที่ ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeExistingUrl(url)}
                    disabled={submitting}
                    className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-rose-600 shadow-sm transition hover:bg-white"
                    aria-label="ลบรูป"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {newPhotos.map((photo, idx) => (
                <div
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-slate-200"
                >
                  <img
                    src={photo.url}
                    alt={`รูปรีวิวใหม่ที่ ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeNewPhoto(photo.id)}
                    disabled={submitting}
                    className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-rose-600 shadow-sm transition hover:bg-white"
                    aria-label="ลบรูป"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {totalPhotoCount < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={submitting}
                  className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-[#3f6593] hover:bg-sky-50/50 hover:text-[#3f6593] cursor-pointer"
                >
                  {totalPhotoCount === 0 ? (
                    <Camera className="h-5 w-5" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                  <span className="text-[11px] font-semibold">เพิ่มรูป</span>
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
          </div>

          {errorMsg && (
            <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-600">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {review && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setErrorMsg(null);
                }}
                disabled={submitting}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition hover:from-[#000f22] hover:to-[#1b3554] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span>
                {submitting
                  ? "กำลังบันทึกรีวิว..."
                  : review
                    ? "บันทึกการแก้ไขรีวิว"
                    : "โพสต์รีวิวการเช่า"}
              </span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
