"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewClient({
  orderId,
  itemName,
}: {
  orderId: string;
  itemName: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/rentals/${orderId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment, imageUrls: [] }),
      });
      const result = await res.json();
      if (!res.ok) {
        setErrorMsg(result.message || "บันทึกรีวิวไม่สำเร็จ");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setErrorMsg("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="p-6 max-w-xl mx-auto bg-white border rounded-xl">
        <p className="text-sm font-semibold text-emerald-700">
          บันทึกรีวิวเรียบร้อยแล้ว ขอบคุณสำหรับความคิดเห็น!
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl mx-auto bg-white border rounded-xl space-y-6">
      <h1 className="text-xl font-bold text-gray-800">
        เขียนรีวิว: {itemName}
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

      {errorMsg && (
        <p className="text-xs font-semibold text-rose-600">{errorMsg}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
      >
        {submitting ? "กำลังบันทึก..." : "โพสต์รีวิว"}
      </button>
    </div>
  );
}
