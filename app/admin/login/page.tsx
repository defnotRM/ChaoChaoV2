"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldAlert,
  Lock,
  User,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { AdminNavbar } from "@/components/admin/AdminNavbar";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
        setLoading(false);
        return;
      }

      // เข้าสู่ระบบสำเร็จ
      router.push(data.redirectTo || "/admin");
      router.refresh();
    } catch (err) {
      console.error("Admin login error:", err);
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100/80">
      <AdminNavbar />
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
        {/* Logo & Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-white shadow-lg shadow-[#1b3554]/25">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            CHAOCHAO Admin Portal
          </h2>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            เข้าสู่ระบบเฉพาะผู้ดูแลระบบ (Restricted Area)
          </p>
        </div>

        {/* Card Form */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-md">
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username / Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                ชื่อผู้ใช้ หรือ อีเมล <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="เช่น admin@chaochao.com"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition hover:border-slate-300 focus:border-[#3f6593] focus:ring-4 focus:ring-sky-100"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                รหัสผ่าน <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition hover:border-slate-300 focus:border-[#3f6593] focus:ring-4 focus:ring-sky-100"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition duration-200 hover:from-[#000f22] hover:to-[#1b3554] active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <span>กำลังตรวจสอบสิทธิ์...</span>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4" />
                  <span>เข้าสู่ระบบผู้ดูแลระบบ</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#1b3554]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>กลับสู่หน้าเว็บ CHAOCHAO</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
