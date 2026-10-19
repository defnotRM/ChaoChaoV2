"use client";

import React, { useEffect, useCallback } from "react";
import {
  AlertTriangle,
  HelpCircle,
  Info,
  Loader2,
  ShieldAlert,
  X,
} from "lucide-react";

export type ConfirmDialogVariant = "danger" | "warning" | "info" | "primary";

export interface ConfirmDialogProps {
  /** ควบคุมการเปิด/ปิด Dialog */
  isOpen: boolean;
  /** ฟังก์ชันเมื่อกดปิดหรือกดยกเลิก */
  onClose: () => void;
  /** ฟังก์ชันเมื่อกดยืนยัน (รองรับ async function) */
  onConfirm: () => void | Promise<void>;
  /** หัวข้อกล่องยืนยัน */
  title: string;
  /** รายละเอียดคำอธิบาย */
  description?: React.ReactNode;
  /** ข้อความปุ่มยืนยัน (ค่าเริ่มต้น: "ยืนยัน") */
  confirmText?: string;
  /** ข้อความปุ่มยกเลิก (ค่าเริ่มต้น: "ยกเลิก") */
  cancelText?: string;
  /** โทนสีและไอคอนตามความสำคัญ (ค่าเริ่มต้น: "danger") */
  variant?: ConfirmDialogVariant;
  /** สถานะกำลังดำเนินการ (ปุ่มจะหมุนและกดซ้ำไม่ได้) */
  isLoading?: boolean;
  /** กำหนดไอคอนเอง (ถ้าไม่ใส่จะใช้ไอคอนตาม variant) */
  icon?: React.ReactNode;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  variant = "danger",
  isLoading = false,
  icon,
}: ConfirmDialogProps) {
  // ปิดด้วยปุ่ม Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onClose();
      }
    },
    [isLoading, onClose],
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      // ป้องกันหน้าหลังเลื่อนขณะเปิด Modal
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // โทนสีและไอคอนตาม Variant
  const variantStyles = {
    danger: {
      cardBorder: "border-rose-200",
      headerBorder: "border-rose-100",
      iconBox: "bg-rose-100 text-rose-600",
      defaultIcon: <ShieldAlert className="h-6 w-6" />,
      confirmBtn:
        "bg-rose-600 text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 active:scale-95 focus-visible:ring-rose-500",
      descBox: "border-rose-200/80 bg-rose-50/70 text-rose-900",
    },
    warning: {
      cardBorder: "border-amber-200",
      headerBorder: "border-amber-100",
      iconBox: "bg-amber-100 text-amber-700",
      defaultIcon: <AlertTriangle className="h-6 w-6" />,
      confirmBtn:
        "bg-amber-600 text-white shadow-md shadow-amber-600/20 hover:bg-amber-700 active:scale-95 focus-visible:ring-amber-500",
      descBox: "border-amber-200/80 bg-amber-50/70 text-amber-900",
    },
    info: {
      cardBorder: "border-sky-200",
      headerBorder: "border-sky-100",
      iconBox: "bg-sky-100 text-[#1b3554]",
      defaultIcon: <Info className="h-6 w-6" />,
      confirmBtn:
        "bg-[#1b3554] text-white shadow-md shadow-[#1b3554]/20 hover:bg-[#000f22] active:scale-95 focus-visible:ring-sky-600",
      descBox: "border-sky-200/80 bg-sky-50/70 text-slate-800",
    },
    primary: {
      cardBorder: "border-slate-200/80",
      headerBorder: "border-slate-100",
      iconBox: "bg-[#c0e6fd]/40 text-[#1b3554]",
      defaultIcon: <HelpCircle className="h-6 w-6" />,
      confirmBtn:
        "bg-gradient-to-r from-[#1b3554] to-[#3f6593] text-white shadow-md shadow-[#1b3554]/15 hover:from-[#000f22] hover:to-[#1b3554] active:scale-95 focus-visible:ring-[#3f6593]",
      descBox: "border-slate-200 bg-slate-50 text-slate-700",
    },
  }[variant];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={() => {
          if (!isLoading) onClose();
        }}
      />

      {/* Modal Container */}
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-3xl border bg-white p-6 shadow-2xl transition-all duration-200 ${variantStyles.cardBorder}`}
      >
        {/* Close Button (มุมขวาบน) */}
        {!isLoading && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-hidden cursor-pointer"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Header ส่วนหัว */}
        <div className={`flex items-start gap-3.5 border-b pb-4 ${variantStyles.headerBorder}`}>
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${variantStyles.iconBox}`}
          >
            {icon || variantStyles.defaultIcon}
          </div>
          <div className="pr-6 pt-0.5">
            <h3
              id="confirm-dialog-title"
              className="text-base sm:text-lg font-bold text-slate-900 leading-snug"
            >
              {title}
            </h3>
          </div>
        </div>

        {/* Content คำอธิบาย */}
        {description && (
          <div className="mt-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
            {typeof description === "string" ? (
              <div
                className={`rounded-2xl border p-3.5 leading-relaxed ${variantStyles.descBox}`}
              >
                {description}
              </div>
            ) : (
              description
            )}
          </div>
        )}

        {/* Action Buttons ปุ่มกดยืนยัน/ยกเลิก */}
        <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={async () => {
              await onConfirm();
            }}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 cursor-pointer ${variantStyles.confirmBtn}`}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
