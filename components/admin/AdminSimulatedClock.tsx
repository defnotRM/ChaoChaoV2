"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FastForward,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";

interface ActiveOrderPreset {
  order_id: string;
  item_name: string;
  start_date: string;
  end_date: string;
  meetup_time: string;
  return_time: string;
  status: string;
}

const fullDateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function toBangkokDateAndTimeInputs(ms: number) {
  const d = new Date(ms);
  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { datePart, timePart };
}

function addMinutesToTimeStr(dateStr: string, timeStr: string, addMinutes: number) {
  const cleanDate = dateStr.trim().split("T")[0];
  const parts = (timeStr || "12:00").split(":");
  const hh = String(parts[0] ?? "12").padStart(2, "0");
  const mm = String(parts[1] ?? "00").padStart(2, "0");
  const targetMs =
    new Date(`${cleanDate}T${hh}:${mm}:00+07:00`).getTime() +
    addMinutes * 60 * 1000;
  return toBangkokDateAndTimeInputs(targetMs);
}

export default function AdminSimulatedClock({
  onClockChanged,
}: {
  onClockChanged?: () => void;
}) {
  const [offsetSeconds, setOffsetSeconds] = useState<number>(0);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [tickNowMs, setTickNowMs] = useState<number>(() => Date.now());
  const [inputDate, setInputDate] = useState<string>("");
  const [inputTime, setInputTime] = useState<string>("12:00");
  const [activeOrders, setActiveOrders] = useState<ActiveOrderPreset[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchClock = useCallback(async (initInputs = false) => {
    try {
      const res = await fetch("/api/simulated-time?includeOrders=1", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const offset = Number(data.offsetSeconds || 0);
      const simMs = Date.now() + offset * 1000;
      setOffsetSeconds(offset);
      setIsSimulated(Boolean(data.isSimulated));
      setTickNowMs(simMs);
      if (Array.isArray(data.activeOrders)) {
        setActiveOrders(data.activeOrders);
      }
      if (initInputs) {
        const { datePart, timePart } = toBangkokDateAndTimeInputs(simMs);
        setInputDate(datePart);
        setInputTime(timePart);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchClock(true);
  }, [fetchClock]);

  useEffect(() => {
    const id = setInterval(() => {
      setTickNowMs(Date.now() + offsetSeconds * 1000);
    }, 1000);
    return () => clearInterval(id);
  }, [offsetSeconds]);

  async function applyClockAction(payload: Record<string, any>) {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/simulated-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const offset = Number(data.offsetSeconds || 0);
        const simMs = Date.now() + offset * 1000;
        setOffsetSeconds(offset);
        setIsSimulated(Boolean(data.isSimulated));
        setTickNowMs(simMs);
        const { datePart, timePart } = toBangkokDateAndTimeInputs(simMs);
        setInputDate(datePart);
        setInputTime(timePart);
        setFeedback(data.message || "อัปเดตเวลาจำลองเรียบร้อยแล้ว");
        fetchClock(false);
        onClockChanged?.();
      } else {
        setFeedback(data.message || "ตั้งเวลาจำลองไม่สำเร็จ");
      }
    } catch {
      setFeedback("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-white shadow-sm">
            <Clock3 className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                นาฬิกา &amp; ปฏิทินจำลองเวลาของระบบ (Admin Time Simulator)
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold ${
                  isSimulated
                    ? "bg-amber-500/15 text-amber-800 ring-1 ring-amber-300"
                    : "bg-emerald-500/15 text-emerald-700"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isSimulated ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                  }`}
                />
                {isSimulated ? "กำลังจำลองเวลา" : "เวลาจริง (Real-Time)"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              ใช้จำลองวันที่และเวลาเพื่อทดสอบการนับถอยหลัง 1 ชั่วโมง และการตัดจบอัตโนมัติตามเงื่อนไข FR-28 และ FR-29
            </p>
          </div>
        </div>

        {/* หน้าปัดนาฬิกาปัจจุบัน */}
        <div className="rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-right text-white shadow-sm">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-sky-300">
            เวลาของระบบปัจจุบัน (Asia/Bangkok)
          </span>
          <span className="font-mono text-base font-extrabold tracking-tight sm:text-lg">
            {fullDateTimeFmt.format(new Date(tickNowMs))}
          </span>
        </div>
      </div>

      {/* แถวตั้งวันที่ + เวลาด้วยตัวเอง */}
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              เลือกวันที่จำลอง
            </label>
            <div className="relative">
              <input
                type="date"
                value={inputDate}
                onChange={(e) => setInputDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-[#3f6593] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              เลือกเวลาจำลอง (น.)
            </label>
            <input
              type="time"
              value={inputTime}
              onChange={(e) => setInputTime(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-[#3f6593] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={busy || !inputDate}
              onClick={() =>
                applyClockAction({
                  action: "set",
                  date: inputDate,
                  time: inputTime || "12:00",
                })
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-[#000f22] hover:to-[#1b3554] disabled:opacity-50 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" />
              <span>ตั้งวันและเวลาจำลอง</span>
            </button>
          </div>
        </div>

        {/* ปุ่มลัดเลื่อนเวลา */}
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              applyClockAction({ action: "shift", deltaSeconds: 15 * 60 })
            }
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-[#3f6593] hover:bg-sky-50 disabled:opacity-50 cursor-pointer"
          >
            <FastForward className="h-3.5 w-3.5 text-[#3f6593]" />
            <span>+15 นาที</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              applyClockAction({ action: "shift", deltaSeconds: 60 * 60 })
            }
            className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
          >
            <FastForward className="h-3.5 w-3.5 text-amber-700" />
            <span>+1 ชั่วโมง (ทดสอบครบเวลา)</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              applyClockAction({ action: "shift", deltaSeconds: 86400 })
            }
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-[#3f6593] hover:bg-sky-50 disabled:opacity-50 cursor-pointer"
          >
            <CalendarDays className="h-3.5 w-3.5 text-[#3f6593]" />
            <span>+1 วัน</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyClockAction({ action: "reset" })}
            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>รีเซ็ตเป็นเวลาจริง</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{feedback}</span>
        </div>
      )}

      {/* รายการคำสั่งเช่าที่กำลังดำเนินการ — กดวาร์ปเวลาได้ในคลิกเดียว */}
      {activeOrders.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>
                ทางลัดจำลองเวลาตามคำสั่งเช่าล่าสุด (กดปุ่มเพื่อวาร์ปไปยังเวลานัดรับ/คืนของออเดอร์นั้นทันที)
              </span>
            </p>
            <button
              type="button"
              onClick={() => fetchClock(false)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#1b3554] cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              <span>รีเฟรชรายการ</span>
            </button>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {activeOrders.slice(0, 6).map((ord) => {
              const expiredPickup = addMinutesToTimeStr(
                ord.start_date,
                ord.meetup_time,
                65,
              );
              const expiredReturn = addMinutesToTimeStr(
                ord.end_date,
                ord.return_time,
                65,
              );

              return (
                <div
                  key={ord.order_id}
                  className="flex flex-col justify-between gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">
                        {ord.item_name}{" "}
                        <span className="font-mono text-[11px] font-normal text-slate-400">
                          (#{ord.order_id.slice(0, 6).toUpperCase()})
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        นัดรับ: <strong>{ord.start_date}</strong> เวลา{" "}
                        <strong>{ord.meetup_time} น.</strong> · นัดคืน:{" "}
                        <strong>{ord.end_date}</strong> เวลา{" "}
                        <strong>{ord.return_time} น.</strong>
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-[#1b3554] ring-1 ring-slate-200">
                      {ord.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        applyClockAction({
                          action: "set",
                          date: ord.start_date,
                          time: ord.meetup_time,
                        })
                      }
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                    >
                      ⏱️ วาร์ปถึงเวลานัดรับ ({ord.meetup_time})
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        applyClockAction({
                          action: "set",
                          date: expiredPickup.datePart,
                          time: expiredPickup.timePart,
                        })
                      }
                      className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                    >
                      ⚠️ เลยเวลานัดรับ +1 ชม.
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        applyClockAction({
                          action: "set",
                          date: ord.end_date,
                          time: ord.return_time,
                        })
                      }
                      className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-sky-700 disabled:opacity-50 cursor-pointer"
                    >
                      ⏱️ วาร์ปถึงเวลานัดคืน ({ord.return_time})
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        applyClockAction({
                          action: "set",
                          date: expiredReturn.datePart,
                          time: expiredReturn.timePart,
                        })
                      }
                      className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                    >
                      ⚠️ เลยเวลานัดคืน +1 ชม.
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
