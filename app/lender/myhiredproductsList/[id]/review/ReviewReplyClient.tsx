"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, MessageSquare, Star } from "lucide-react";

export interface ReviewReplyData {
  orderId: string;
  itemName: string;
  renterName: string;
  review: {
    reviewId: string;
    rating: number;
    comment: string | null;
    lenderReply: string | null;
    lenderReplyAt: string | null;
    createdAt: string;
  } | null;
}

const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ReviewReplyClient({ data }: { data: ReviewReplyData }) {
  const [replyText, setReplyText] = useState(data.review?.lenderReply || "");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedReply, setSavedReply] = useState(
    data.review?.lenderReply || null,
  );

  async function handleSubmit() {
    if (!data.review || !replyText.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/reviews/${data.review.reviewId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(payload?.message ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSavedReply(replyText.trim());
    } catch {
      setErrorMsg("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-6 sm:pb-20 sm:pt-8">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 lg:px-8">
        <Link
          href={`/orders/${data.orderId}`}
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#1b3554]"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับ
        </Link>

        <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-slate-900">
          รีวิวจากผู้เช่า
        </h1>
        <p className="mb-6 text-sm text-slate-500">{data.itemName}</p>

        {!data.review ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            ผู้เช่ายังไม่ได้เขียนรีวิวสำหรับออเดอร์นี้
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  {data.renterName}
                </span>
                <span className="text-xs text-slate-400">
                  {dateTimeFmt.format(new Date(data.review.createdAt))}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-4 w-4 ${n <= data.review!.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-300"}`}
                  />
                ))}
              </div>
              {data.review.comment && (
                <p className="mt-3 text-sm leading-relaxed text-slate-700">
                  {data.review.comment}
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <MessageSquare className="h-4 w-4 text-[#3f6593]" />
                {savedReply ? "คำตอบกลับของคุณ" : "ตอบกลับรีวิวนี้"}
              </h2>

              {savedReply && data.review.lenderReplyAt && (
                <p className="mb-2 text-[11px] text-slate-400">
                  ตอบกลับเมื่อ{" "}
                  {dateTimeFmt.format(new Date(data.review.lenderReplyAt))}
                </p>
              )}

              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={3}
                placeholder="ขอบคุณสำหรับรีวิว หรือชี้แจงเพิ่มเติม..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm outline-none focus:border-[#3f6593] focus:bg-white"
              />

              {errorMsg && (
                <p className="mt-2 text-xs font-semibold text-rose-600">
                  {errorMsg}
                </p>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !replyText.trim()}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-[#000f22] hover:to-[#1b3554] disabled:opacity-50"
              >
                {submitting
                  ? "กำลังบันทึก..."
                  : savedReply
                    ? "แก้ไขคำตอบ"
                    : "ส่งคำตอบ"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
