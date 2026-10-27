"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";

// แสดงใต้ Navbar เมื่อบัญชีที่ล็อกอินอยู่ถูกระงับ (useraccount.status = 'Suspended')
export default function SuspendedBanner() {
  const pathname = usePathname();
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    if (pathname?.startsWith("/admin")) {
      setSuspended(false);
      return;
    }
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSuspended(data.user?.status === "Suspended");
      } catch {
        // ignore
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!suspended) return null;

  return (
    <div
      role="alert"
      className="w-full border-b border-rose-200 bg-rose-50 px-4 py-3"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 sm:items-center">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 sm:mt-0" />
        <p className="text-sm text-rose-800">
          <strong className="font-bold">บัญชีของคุณถูกระงับการใช้งาน</strong>{" "}
          ขณะนี้คุณเข้าใช้งานได้เฉพาะหน้าแดชบอร์ดเท่านั้น
          หากเห็นว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ
        </p>
      </div>
    </div>
  );
}
