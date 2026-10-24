"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Clock, X, Loader2, CheckCircle2 } from "lucide-react";
import { parseBangkokWindow } from "@/lib/simulated-time";

interface RenterCancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  startDate: string;
  meetupTime?: string | null;
  rentalFee: number;
  deposit: number;
  totalPaid: number;
  onSuccess: (res: any) => void;
}

const thb = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 2,
});

export default function RenterCancelModal({
  isOpen,
  onClose,
  orderId,
  startDate,
  meetupTime,
  rentalFee,
  deposit,
  totalPaid,
  onSuccess,
}: RenterCancelModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diffDays, setDiffDays] = useState<number | null>(null);
  const [isAdvance, setIsAdvance] = useState<boolean>(true);

  // คำนวณวันคงเหลืออิงตามเวลาจริงหรือ simulated time
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const calculateTime = async () => {
      try {
        let nowMs = Date.now();
        const res = await fetch(`/api/simulated-time?orderId=${orderId}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const json = await res.json();
          if (json.nowMs) nowMs = json.nowMs;
        }

        const pickupWin = parseBangkokWindow(startDate, meetupTime);
        const diff = (pickupWin.startMs - nowMs) / (86_400 * 1000);

        if (active) {
          setDiffDays(diff);
          setIsAdvance(diff > 2);
        }
      } catch {
        const pickupWin = parseBangkokWindow(startDate, meetupTime);
        const diff = (pickupWin.startMs - Date.now()) / (86_400 * 1000);
        if (active) {
          setDiffDays(diff);
          setIsAdvance(diff > 2);
        }
      }
    };

    calculateTime();
    return () => {
      active = false;
    };
  }, [isOpen, orderId, startDate, meetupTime]);

  if (!isOpen) return null;

  async function handleConfirmCancel() {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await fetch(`/api/rentals/${orderId}/cancel-by-renter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "ไม่สามารถยกเลิกคำสั่งเช่าได้");
        return;
      }

      onSuccess(data);
      onClose();
    } catch (err: any) {
      console.error("Cancel by renter error:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsSubmitting(false);
    }
  }

  // คำนวณยอดเงิน
  const refundDeposit = deposit;
  const refundRentalFee = isAdvance ? rentalFee : 0;
  const totalRefund = isAdvance ? totalPaid : deposit;
  const lenderCompensation = isAdvance ? 0 : Math.round(rentalFee * 0.9 * 100) / 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="text-lg font-bold text-slate-900">
              ขอยกเลิกรายการเช่า (FR-34)
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

        {/* Badge แจ้งประเภทการยกเลิก */}
        {isAdvance ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 space-y-1 text-xs text-emerald-900">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>กรณีที่ 1: ยกเลิกล่วงหน้า (มากกว่า 2 วันก่อนวันนัดรับ)</span>
            </div>
            <p className="text-emerald-700 leading-relaxed">
              คุณดำเนินการยกเลิกล่วงหน้า {diffDays !== null ? `${diffDays.toFixed(1)} วัน` : "มากกว่า 2 วัน"} ก่อนวันนัดรับสินค้า ระบบจะคืนเงินค่าเช่าและเงินประกันเต็มจำนวน 100% ให้แก่คุณ
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 space-y-1.5 text-xs text-amber-950">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-800">
              <Clock className="h-4 w-4 text-amber-600" />
              <span>กรณีที่ 2: ยกเลิกกะทันหัน (น้อยกว่าหรือเท่ากับ 2 วันก่อนวันนัดรับ)</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              คุณขอยกเลิก {diffDays !== null ? `${diffDays.toFixed(1)} วัน` : "น้อยกว่าหรือเท่ากับ 2 วัน"} ก่อนวันนัดรับสินค้า ระบบจะคืนเงินประกัน 100% ให้คุณ และโอนค่าเช่าหลังหักค่าธรรมเนียมให้แก่ผู้ให้เช่าเป็นค่าเสียโอกาส
            </p>
          </div>
        )}

        {/* สรุปรายการเงินคืน */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
          <p className="font-bold text-slate-800">สรุปการคืนเงินเข้าบัญชีของคุณ:</p>
          <div className="flex justify-between text-slate-600">
            <span>เงินประกันสินค้า (100%):</span>
            <span className="font-semibold text-slate-900">+{thb.format(refundDeposit)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>เงินค่าเช่า:</span>
            <span className={`font-semibold ${isAdvance ? "text-slate-900" : "text-amber-700"}`}>
              {isAdvance ? `+${thb.format(refundRentalFee)} (คืน 100%)` : "฿0.00 (ชดเชยให้ผู้ให้เช่า)"}
            </span>
          </div>
          {!isAdvance && lenderCompensation > 0 && (
            <div className="flex justify-between text-[11px] text-slate-500 border-t border-slate-200/60 pt-1.5">
              <span>ค่าเสียโอกาสโอนให้ผู้ให้เช่า (หลังหัก 10%):</span>
              <span className="font-medium text-slate-700">{thb.format(lenderCompensation)}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-slate-200 pt-2 text-sm">
            <span className="font-bold text-slate-900">ยอดเงินที่คุณจะได้รับคืนสุทธิ:</span>
            <span className="text-base font-extrabold text-emerald-700">
              {thb.format(totalRefund)}
            </span>
          </div>
        </div>

        {/* ปุ่มกดยืนยัน / ปิด */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition"
          >
            ปิดหน้าต่าง
          </button>
          <button
            type="button"
            onClick={handleConfirmCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 active:scale-95 transition disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>กำลังดำเนินการ...</span>
              </>
            ) : (
              <span>ยืนยันการยกเลิกการเช่า</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
