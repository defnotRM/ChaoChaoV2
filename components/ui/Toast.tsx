"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

export interface ToastProps {
  /** ข้อความที่จะแสดง (ถ้าไม่มีจะไม่ render) */
  message: string | null;
  /** ชนิดของแจ้งเตือน (default: "info") */
  type?: ToastType;
  /** ฟังก์ชันเมื่อปิด Toast */
  onClose: () => void;
  /** ระยะเวลาแสดงผล (ms) ค่าเริ่มต้น 4000ms */
  duration?: number;
}

/**
 * Toast Component แบบ Standalone สำหรับเรียกใช้ตรงๆ ในหน้าที่ต้องการ
 */
export function Toast({
  message,
  type = "info",
  onClose,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const typeConfig = {
    success: {
      border: "border-emerald-200",
      bg: "bg-emerald-50",
      text: "text-emerald-900",
      icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />,
    },
    error: {
      border: "border-rose-200",
      bg: "bg-rose-50",
      text: "text-rose-900",
      icon: <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />,
    },
    warning: {
      border: "border-amber-200",
      bg: "bg-amber-50",
      text: "text-amber-900",
      icon: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />,
    },
    info: {
      border: "border-sky-200",
      bg: "bg-sky-50",
      text: "text-slate-800",
      icon: <Info className="h-5 w-5 shrink-0 text-sky-600" />,
    },
  }[type];

  return (
    <div className="fixed bottom-5 right-5 z-50 flex max-w-sm sm:max-w-md w-full px-4 sm:px-0">
      <div
        role="alert"
        className={`flex w-full items-start gap-3 rounded-2xl border p-4 shadow-xl transition-all duration-300 ${typeConfig.border} ${typeConfig.bg} ${typeConfig.text}`}
      >
        <div className="mt-0.5">{typeConfig.icon}</div>
        <div className="flex-1 text-xs sm:text-sm font-medium leading-relaxed">
          {message}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 transition hover:bg-black/5 hover:text-slate-600 cursor-pointer"
          aria-label="ปิดแจ้งเตือน"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Toast Context & Hook สำหรับเรียกใช้แบบ Global (toast.success / error)
   ============================================================ */

interface ToastContextType {
  showToast: (type: ToastType, message: string, duration?: number) => void;
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);
    },
    [],
  );

  const toast = {
    success: (msg: string, dur?: number) => showToast("success", msg, dur),
    error: (msg: string, dur?: number) => showToast("error", msg, dur),
    warning: (msg: string, dur?: number) => showToast("warning", msg, dur),
    info: (msg: string, dur?: number) => showToast("info", msg, dur),
  };

  return (
    <ToastContext.Provider value={{ showToast, toast }}>
      {children}
      {/* Container แสดงรายการ Toast ที่มุมขวาล่าง */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm sm:max-w-md w-full px-4 sm:px-0 pointer-events-none">
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(item.id);
    }, item.duration || 4000);
    return () => clearTimeout(timer);
  }, [item, onDismiss]);

  const config = {
    success: {
      border: "border-emerald-200",
      bg: "bg-emerald-50",
      text: "text-emerald-900",
      icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />,
    },
    error: {
      border: "border-rose-200",
      bg: "bg-rose-50",
      text: "text-rose-900",
      icon: <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />,
    },
    warning: {
      border: "border-amber-200",
      bg: "bg-amber-50",
      text: "text-amber-900",
      icon: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />,
    },
    info: {
      border: "border-sky-200",
      bg: "bg-sky-50",
      text: "text-slate-800",
      icon: <Info className="h-5 w-5 shrink-0 text-sky-600" />,
    },
  }[item.type];

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border p-4 shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${config.border} ${config.bg} ${config.text}`}
    >
      <div className="mt-0.5">{config.icon}</div>
      <div className="flex-1 text-xs sm:text-sm font-medium leading-relaxed">
        {item.message}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="rounded-lg p-1 text-slate-400 transition hover:bg-black/5 hover:text-slate-600 cursor-pointer"
        aria-label="ปิดแจ้งเตือน"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export default Toast;
