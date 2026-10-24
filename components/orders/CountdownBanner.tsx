"use client";

import { useEffect, useState, useRef } from "react";
import { AlertTriangle, Clock3 } from "lucide-react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export interface CountdownBannerProps {
  deadlineISO: string;
  orderId?: string;
  title?: string;
  expiredTitle?: string;
  variant?: "warning" | "info" | "danger";
  onExpired?: () => void;
}

export default function CountdownBanner({
  deadlineISO,
  orderId,
  title = "กรุณาดำเนินการภายในเวลาที่กำหนด",
  expiredTitle = "เลยกำหนดเวลาแล้ว — ระบบอาจดำเนินการยกเลิกหรือปรับสถานะอัตโนมัติ",
  variant = "warning",
  onExpired,
}: CountdownBannerProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [offsetMs, setOffsetMs] = useState<number>(0);
  const onExpiredCalledRef = useRef(false);

  // ดึงค่า offset จำลองเวลาถ้ามี orderId
  useEffect(() => {
    if (!orderId) return;
    let active = true;
    const fetchOffset = async () => {
      try {
        const res = await fetch(`/api/simulated-time?orderId=${orderId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active && typeof data.offsetSeconds === "number") {
          setOffsetMs(data.offsetSeconds * 1000);
        }
      } catch {
        // ignore
      }
    };

    fetchOffset();
    const id = setInterval(fetchOffset, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [orderId]);

  useEffect(() => {
    const target = new Date(deadlineISO).getTime();
    const tick = () => {
      const now = Date.now() + offsetMs;
      const diff = target - now;
      setRemaining(diff);

      if (diff <= 0 && !onExpiredCalledRef.current) {
        onExpiredCalledRef.current = true;
        if (onExpired) onExpired();
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadlineISO, offsetMs, onExpired]);

  // ก่อน mount ปล่อยว่างเพื่อเลี่ยง hydration mismatch
  if (remaining === null) return null;

  const expired = remaining <= 0;

  if (expired) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-sm text-rose-700">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <span>
          <strong className="font-semibold">{expiredTitle}</strong>
        </span>
      </div>
    );
  }

  const totalSec = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const colorStyles =
    variant === "info"
      ? {
          wrapper: "border-sky-200 bg-sky-50 text-sky-800",
          icon: "text-sky-600",
          nums: "text-sky-900",
          box: "bg-white/70 ring-sky-200",
        }
      : {
          wrapper: "border-amber-200 bg-amber-50 text-amber-800",
          icon: "text-amber-600",
          nums: "text-amber-900",
          box: "bg-white/70 ring-amber-200",
        };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3.5 text-sm ${colorStyles.wrapper}`}
    >
      <span className="inline-flex items-center gap-2">
        <Clock3 className={`h-5 w-5 shrink-0 ${colorStyles.icon}`} />
        <span>{title}</span>
      </span>
      <span
        className={`inline-flex items-center gap-1 font-mono text-base font-bold tabular-nums ${colorStyles.nums}`}
      >
        <TimeBox value={pad(hours)} boxCls={colorStyles.box} />
        <span>:</span>
        <TimeBox value={pad(minutes)} boxCls={colorStyles.box} />
        <span>:</span>
        <TimeBox value={pad(seconds)} boxCls={colorStyles.box} />
      </span>
    </div>
  );
}

function TimeBox({ value, boxCls }: { value: string; boxCls: string }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 ring-1 ${boxCls}`}>{value}</span>
  );
}
