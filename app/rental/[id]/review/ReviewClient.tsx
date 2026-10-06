"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";

interface ExistingReview {
  rating: number;
  comment: string;
  images: string[];
}

export default function ReviewClient({
  orderId,
  itemName,
  existingReview,
}: {
  orderId: string;
  itemName: string;
  existingReview: ExistingReview | null;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(!existingReview);
  const [wasDeleted, setWasDeleted] = useState(false);

  const [rating, setRating] = useState(existingReview?.rating ?? 5);
  const [comment, setComment] = useState(existingReview?.comment ?? "");
  const [imagePreviews, setImagePreviews] = useState<string[]>(
    existingReview?.images ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const MAX_PHOTOS = 5;

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const remaining = MAX_PHOTOS - imagePreviews.length;
    const toAdd = files.slice(0, remaining);
    for (const file of toAdd) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  }

  function removeImage(index: number) {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/rentals/${orderId}/review`, {
        method: existingReview ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment, imageUrls: imagePreviews }),
      });
      const result = await res.json();
      if (!res.ok) {
        setErrorMsg(result.message || "บันทึกรีวิวไม่สำเร็จ");
        return;
      }
      setIsEditing(false);
      setJustSaved(true);
      router.refresh();
    } catch {
      setErrorMsg("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("ยืนยันลบรีวิวนี้? การลบไม่สามารถย้อนกลับได้")) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/rentals/${orderId}/review`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (!res.ok) {
        setErrorMsg(result.message || "ลบรีวิวไม่สำเร็จ");
        return;
      }
      setWasDeleted(true);
      router.refresh();
    } catch {
      setErrorMsg("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setDeleting(false);
    }
  }

  if (wasDeleted) {
    return (
      <div className="p-6 max-w-xl mx-auto bg-white border rounded-xl">
        <p className="text-sm font-semibold text-slate-600">
          ลบรีวิวเรียบร้อยแล้ว
        </p>
      </div>
    );
  }

  // โหมดดูอย่างเดียว (มีรีวิวอยู่แล้ว และไม่ได้กด "แก้ไข")
  if (existingReview && !isEditing) {
    return (
      <div className="p-6 max-w-xl mx-auto bg-white border rounded-xl space-y-4">
        <h1 className="text-xl font-bold text-gray-800">
          รีวิวของคุณ: {itemName}
        </h1>

        {justSaved && (
          <p className="text-xs font-semibold text-emerald-700">
            บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว
          </p>
        )}

        <div className="flex gap-1 text-2xl">
          {[1, 2, 3, 4, 5].map((star) => (
            <span
              key={star}
              className={star <= rating ? "text-yellow-400" : "text-gray-300"}
            >
              ★
            </span>
          ))}
        </div>

        {comment && (
          <p className="text-sm leading-relaxed text-slate-700">{comment}</p>
        )}

        {imagePreviews.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {imagePreviews.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`รูปที่ ${i + 1}`}
                className="aspect-square rounded-lg border object-cover"
              />
            ))}
          </div>
        )}

        {errorMsg && (
          <p className="text-xs font-semibold text-rose-600">{errorMsg}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            แก้ไขรีวิว
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-lg border border-rose-200 bg-rose-50 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          >
            {deleting ? "กำลังลบ..." : "ลบรีวิว"}
          </button>
        </div>
      </div>
    );
  }

  // โหมดฟอร์ม (สร้างใหม่ หรือกำลังแก้ไข)
  return (
    <div className="p-6 max-w-xl mx-auto bg-white border rounded-xl space-y-6">
      <h1 className="text-xl font-bold text-gray-800">
        {existingReview ? "แก้ไขรีวิว" : "เขียนรีวิว"}: {itemName}
      </h1>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          ให้คะแนนประสบการณ์
        </label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className={`text-2xl ${star <= rating ? "text-yellow-400" : "text-gray-300"}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          ความเห็นเพิ่มเติม
        </label>
        <textarea
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="บอกเล่าประสบการณ์ สภาพสินค้า หรือการให้บริการของผู้ให้เช่า..."
          className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          แนบรูปภาพประกอบ (ไม่บังคับ สูงสุด {MAX_PHOTOS} รูป)
        </label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {imagePreviews.map((url, i) => (
            <div
              key={i}
              className="relative aspect-square overflow-hidden rounded-lg border"
            >
              <img
                src={url}
                alt={`รูปที่ ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {imagePreviews.length < MAX_PHOTOS && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:bg-gray-50">
              <Camera className="h-5 w-5" />
              <span className="text-[10px] font-medium">เพิ่มรูป</span>
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
      </div>

      {errorMsg && (
        <p className="text-xs font-semibold text-rose-600">{errorMsg}</p>
      )}

      <div className="flex gap-3">
        {existingReview && (
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              setRating(existingReview.rating);
              setComment(existingReview.comment);
              setImagePreviews(existingReview.images);
              setErrorMsg(null);
            }}
            className="flex-1 py-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ยกเลิก
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {submitting
            ? "กำลังบันทึก..."
            : existingReview
              ? "บันทึกการแก้ไข"
              : "โพสต์รีวิว"}
        </button>
      </div>
    </div>
  );
}
