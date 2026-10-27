"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flag, Loader2, X } from "lucide-react";

const MIN_REASON = 10;
const MAX_REASON = 1000;

interface CurrentUser {
  id: string;
  role: string;
  roles: string[];
}

export default function ReportAccountButton({
  reportedUserId,
  reportedName,
}: {
  reportedUserId: string;
  reportedName: string;
}) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user || null);
        }
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) closeModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting]);

  const roles =
    currentUser?.roles || (currentUser?.role ? [currentUser.role] : []);
  const isAdmin = roles.includes("admin") || currentUser?.role === "admin";
  const isSelf = currentUser?.id === reportedUserId;

  // ไม่แสดงปุ่มให้เจ้าของบัญชีเอง และแอดมิน (รอโหลดสถานะผู้ใช้ก่อนเพื่อไม่ให้ปุ่มกะพริบ)
  if (!loaded || isSelf || isAdmin) return null;

  function openModal() {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    setReason("");
    setErrorMsg(null);
    setDone(false);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  async function handleSubmit() {
    const text = reason.trim();
    if (text.length < MIN_REASON) {
      setErrorMsg(`กรุณาระบุเหตุผลอย่างน้อย ${MIN_REASON} ตัวอักษร`);
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/users/${reportedUserId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: text }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(result.message || "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      setDone(true);
    } catch {
      setErrorMsg("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-50 active:scale-95"
      >
        <Flag className="h-3.5 w-3.5" />
        <span>รายงานบัญชีผู้ใช้</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!submitting) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-account-title"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={closeModal}
              disabled={submitting}
              aria-label="ปิด"
              className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>

            {done ? (
              <div className="py-4 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700">
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <h3 className="mt-3 text-lg font-bold text-slate-900">
                  ส่งรายงานเรียบร้อยแล้ว
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  แอดมินจะตรวจสอบรายงานและพิจารณาตามความเหมาะสม
                </p>
                <button
                  type="button"
                  onClick={closeModal}
                  className="mt-5 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition hover:from-[#000f22] hover:to-[#1b3554] active:scale-95"
                >
                  ปิด
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 pr-8">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                    <Flag className="h-5 w-5" />
                  </span>
                  <div>
                    <h3
                      id="report-account-title"
                      className="text-lg font-bold text-slate-900"
                    >
                      รายงานบัญชีผู้ใช้
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      บัญชีที่รายงาน:{" "}
                      <strong className="text-slate-700">{reportedName}</strong>
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  <label
                    htmlFor="report-reason"
                    className="text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    เหตุผลที่ต้องการรายงาน{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="report-reason"
                    rows={5}
                    maxLength={MAX_REASON}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="อธิบายพฤติกรรมหรือปัญหาที่พบ เช่น ข้อมูลไม่ตรงความจริง ไม่ปฏิบัติตามข้อตกลง..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3f6593] focus:ring-4 focus:ring-sky-100"
                  />
                  <p className="text-right text-[11px] text-slate-400">
                    {reason.length}/{MAX_REASON}
                  </p>
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  รายงานจะถูกส่งให้ผู้ดูแลระบบตรวจสอบเท่านั้น
                  ผู้ให้เช่าจะไม่เห็นเหตุผลที่คุณกรอก
                </p>

                {errorMsg && (
                  <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
                    {errorMsg}
                  </div>
                )}

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[#3f6593] hover:bg-sky-50 hover:text-[#1b3554] active:scale-95 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition duration-200 hover:from-[#000f22] hover:to-[#1b3554] active:scale-95 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{submitting ? "กำลังส่ง..." : "ส่งรายงาน"}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
