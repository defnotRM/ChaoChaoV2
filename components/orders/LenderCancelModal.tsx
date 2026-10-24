"use client";

import { useState } from "react";
import { AlertTriangle, X, Loader2, Camera, Trash2, Info } from "lucide-react";

interface LenderCancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  totalPaid: number;
  onSuccess: (res: any) => void;
}

const thb = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 2,
});

export default function LenderCancelModal({
  isOpen,
  onClose,
  orderId,
  totalPaid,
  onSuccess,
}: LenderCancelModalProps) {
  const [reason, setReason] = useState("");
  const [imageFiles, setImageFiles] = useState<{ file: File; preview: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (imageFiles.length + files.length > 5) {
      setErrorMsg("แนบรูปภาพหลักฐานได้ไม่เกิน 5 รูป");
      return;
    }

    const newItems: { file: File; preview: string }[] = [];
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newItems.push({ file, preview: reader.result as string });
        if (newItems.length === files.length) {
          setImageFiles((prev) => [...prev, ...newItems].slice(0, 5));
        }
      };
      reader.readAsDataURL(file);
    });
    setErrorMsg(null);
  }

  function handleRemoveImage(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setErrorMsg("กรุณาระบุเหตุผลในการยกเลิกอย่างน้อย 5 ตัวอักษร");
      return;
    }
    if (imageFiles.length === 0) {
      setErrorMsg("กรุณาแนบรูปภาพหลักฐานอย่างน้อย 1 รูป");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const imageUrls = imageFiles.map((img) => img.preview);

      const res = await fetch(`/api/rentals/${orderId}/cancel-by-lender`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          imageUrls,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "ไม่สามารถยกเลิกคำสั่งเช่าได้");
        return;
      }

      onSuccess(data);
      onClose();
    } catch (err: any) {
      console.error("Cancel by lender error:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-7 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="text-lg font-bold text-slate-900">
              ยกเลิกคำสั่งเช่า (ผู้ให้เช่า FR-35)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {errorMsg}
          </div>
        )}

        {/* Notice */}
        <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 space-y-1.5 text-xs text-sky-950">
          <div className="flex items-center gap-1.5 font-bold text-sky-900">
            <Info className="h-4 w-4 text-sky-600 shrink-0" />
            <span>เงื่อนไขการยกเลิกโดยผู้ให้เช่า:</span>
          </div>
          <p className="text-sky-800 leading-relaxed">
            ระบบจะทำการคืนเงินเต็มจำนวน 100% ({thb.format(totalPaid)}) ให้แก่ผู้เช่าโดยอัตโนมัติ คุณต้องแนบเหตุผลและรูปภาพหลักฐานประกอบ (เช่น อุปกรณ์ชำรุด หรือเหตุสุดวิสัย) เพื่อเก็บเป็นหลักฐานการตรวจสอบย้อนหลัง
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* เหตุผล */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              เหตุผลในการยกเลิกคำสั่งเช่า <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="กรุณาระบุเหตุผลอย่างละเอียด เช่น อุปกรณ์เกิดความเสียหายก่อนส่งมอบ..."
              disabled={isSubmitting}
              className="w-full rounded-2xl border border-slate-200 p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1b3554] focus:outline-hidden focus:ring-1 focus:ring-[#1b3554]"
            />
          </div>

          {/* รูปหลักฐาน */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                รูปถ่ายหลักฐานประกอบ (1–5 รูป) <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-500">{imageFiles.length}/5 รูป</span>
            </div>

            {/* Preview grid */}
            {imageFiles.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {imageFiles.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group">
                    <img src={img.preview} alt={`preview-${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      disabled={isSubmitting}
                      className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white hover:bg-rose-600 transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {imageFiles.length < 5 && (
              <label className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition">
                <Camera className="h-5 w-5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">คลิกเพื่ออัปโหลดรูปภาพหลักฐาน</span>
                <span className="text-[10px] text-slate-400">รองรับไฟล์ JPG, PNG, WebP</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleFileSelect}
                  disabled={isSubmitting}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* ปุ่มกดยืนยัน / ปิด */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition"
            >
              ปิดหน้าต่าง
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim() || imageFiles.length === 0}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 active:scale-95 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>กำลังดำเนินการ...</span>
                </>
              ) : (
                <span>ยืนยันยกเลิกคำสั่งเช่า & คืนเงิน</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
