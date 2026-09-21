import { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminNavbar } from "@/components/admin/AdminNavbar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Panel | CHAOCHAO",
  description: "ระบบจัดการสำหรับผู้ดูแลระบบ CHAOCHAO",
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await requireAdmin();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AdminNavbar user={{ id: user.id, email: user.email }} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
