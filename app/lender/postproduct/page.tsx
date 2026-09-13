import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert, ArrowLeft, LayoutDashboard } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import PostProductClient from "./PostProductClient";

export const dynamic = "force-dynamic";

export default async function PostProductPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login?redirect=/lender/postproduct");
  }

  const isLender =
    currentUser.roles.includes("lender") || currentUser.roles.includes("admin");

  if (!isLender) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/70 px-4 py-16">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg shadow-slate-100">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-8 ring-amber-50/60">
            <ShieldAlert className="h-7 w-7" />
          </div>

          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            เฉพาะบัญชีผู้ให้เช่า (Lender)
          </h1>

          <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
            บัญชีของคุณ{" "}
            <span className="font-semibold text-slate-700">
              @{currentUser.username}
            </span>{" "}
            ปัจจุบันมีสถานะเป็นผู้เช่า (Renter) จึงยังไม่สามารถลงประกาศสินค้าได้
          </p>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Link
              href={`/dashboard/${currentUser.id}`}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1b3554] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#000f22]"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>แดชบอร์ดของคุณ</span>
            </Link>

            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>หน้าหลัก</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: categories } = await admin
    .from("itemcategory")
    .select("category_id, category_name")
    .order("category_name", { ascending: true });

  return (
    <div className="min-h-screen bg-slate-50/70 pb-20 pt-6 sm:pb-24 sm:pt-8">
      <PostProductClient categories={categories || []} />
    </div>
  );
}
