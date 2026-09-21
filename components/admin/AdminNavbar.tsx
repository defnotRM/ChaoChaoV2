"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  ShieldCheck,
  Scale,
  LogOut,
  Menu,
  X,
  ShieldAlert,
  User as UserIcon,
} from "lucide-react";

interface AdminNavbarProps {
  user?: {
    id?: string;
    email?: string;
  } | null;
}

export function AdminNavbar({ user }: AdminNavbarProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.push("/admin/login");
    router.refresh();
  };

  const navItems = [
    {
      label: "ภาพรวม",
      href: "/admin",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: "ตรวจสอบยืนยันตัวตน (KYC)",
      href: "/admin/kyc",
      icon: ShieldCheck,
      exact: false,
    },
    {
      label: "ตัดสินข้อพิพาท",
      href: "/admin/disputes",
      icon: Scale,
      exact: false,
    },
  ];

  const isActive = (itemHref: string, exact: boolean) => {
    if (exact) {
      return pathname === itemHref;
    }
    return pathname.startsWith(itemHref);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* โลโก้และ Brand */}
        <div className="flex items-center gap-3">
          <Link href={user ? "/admin" : "/admin/login"} className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] text-white shadow-md shadow-[#1b3554]/15">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-extrabold text-[#1b3554]">
                CHAOCHAO
              </span>
              <span className="ml-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Admin
              </span>
            </div>
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            ผู้ดูแลระบบ
          </span>
        </div>

        {/* Desktop Navigation */}
        {user && (
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition ${
                    active
                      ? "bg-[#1b3554] text-white shadow-sm shadow-[#1b3554]/20"
                      : "text-slate-600 hover:bg-slate-100 hover:text-[#1b3554]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {/* ขวาสุด: แสดงชื่อผู้ใช้ และปุ่มออกจากระบบ หรือ ลิงก์กลับหน้าหลัก */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[#1b3554]">
                  <UserIcon className="h-4 w-4" />
                </div>
                <span className="font-semibold text-slate-800">
                  {user.email || "Admin"}
                </span>
              </div>

              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogout}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 active:scale-95 disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{loggingOut ? "กำลังออก..." : "ออกจากระบบ"}</span>
              </button>

              {/* Mobile menu button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden inline-flex items-center justify-center rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            >
              <span>กลับสู่หน้าหลัก</span>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {user && mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pb-4 pt-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-xs text-slate-500 font-medium">
              เข้าสู่ระบบในฐานะ: {user.email || user.id || "Admin"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-700">
              Admin
            </span>
          </div>
          <div className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-[#1b3554] text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              disabled={loggingOut}
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              <span>ออกจากระบบ</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
