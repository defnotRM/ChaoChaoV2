"use client";

import { useEffect } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

export default function RentalTermsModal({
  open,
  submitting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!submitting) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rental-terms-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#c0e6fd]/40 text-[#1b3554]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3
              id="rental-terms-title"
              className="text-lg font-bold text-slate-900"
            >
              ยืนยันการส่งคำขอเช่า และเงื่อนไขความรับผิดชอบ
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              โปรดตรวจสอบและยอมรับเงื่อนไขการใช้งานก่อนดำเนินการ
            </p>
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-slate-700 marker:text-[#3f6593]">
            <li>
              <b>การยกเลิกล่วงหน้า:</b> หากท่านทำรายการยกเลิกมากกว่า 2
              วันก่อนวันนัดรับ
              ระบบคืนเงินประกันและค่าเช่าเต็มจำนวนให้แก่ท่าน
            </li>
            <li>
              <b>การยกเลิกกะทันหัน:</b> หากท่านทำรายการยกเลิกน้อยกว่าหรือเท่ากับ 2
              วันก่อนวันนัดรับ ระบบขอสงวนสิทธิ์ยึดเงินค่าเช่า 100%
              เพื่อชดเชยค่าเสียหายให้แก่ผู้ให้เช่า
              โดยท่านจะได้รับคืนเฉพาะเงินประกันเต็มจำนวน
            </li>
            <li>
              <b>กรณีสินค้าสูญหาย:</b> หากสินค้าสูญหายระหว่างการเช่า
              ระบบขอสงวนสิทธิ์ยึดเงินค่าเช่าและค่าประกันทั้งหมด
              เพื่อชดเชยให้แก่ผู้ให้เช่า
            </li>
            <li>
              <b>กรณีสินค้าเสียหาย:</b> หากสินค้าเสียหายระหว่างการเช่า
              ระบบจะดำเนินการหักค่าเสียหายจากวงเงินประกันของท่าน
              เพื่อชดเชยให้แก่ผู้ให้เช่า
              <ul className="mt-2 list-disc space-y-2 pl-5">
                <li>
                  หากมูลค่าความเสียหายสูงกว่าวงเงินประกัน
                  ผู้เช่าตกลงจะชำระส่วนต่างที่เหลือตามจริงให้ครบถ้วนภายใน 48
                  ชั่วโมง มิฉะนั้นระบบจะระงับบัญชีของท่าน
                  และดำเนินคดีตามกฎหมาย
                </li>
                <li>
                  หากผู้เช่าปฏิเสธการชำระส่วนต่างค่าเสียหายภายในเวลาที่กำหนด
                  ระบบจะระงับบัญชีของท่านถาวร และดำเนินคดีตามกฎหมาย
                </li>
              </ul>
            </li>
          </ul>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[#3f6593] hover:bg-sky-50 hover:text-[#1b3554] active:scale-95 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition duration-200 hover:from-[#000f22] hover:to-[#1b3554] active:scale-95 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{submitting ? "กำลังส่งคำขอ..." : "ยอมรับ"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}