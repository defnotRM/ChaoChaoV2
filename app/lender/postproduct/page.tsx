import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import PostProductClient from "./PostProductClient";
import Link from "next/link";
import { ShieldAlert, Clock, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PostProductPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();

  if (user) {
    const [{ data: profile }, { data: bank }] = await Promise.all([
      admin
        .from("useraccount")
        .select("identity_verification_status, id_card_url, id_card_selfie_url")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("bankaccount")
        .select("verification_status, account_number")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const isMissingKyc =
      !profile?.id_card_url ||
      !profile?.id_card_selfie_url ||
      !bank?.account_number;

    const isPending =
      profile?.identity_verification_status !== "verified" ||
      bank?.verification_status !== "verified";

    if (isMissingKyc || isPending) {
      return (
        <div className="min-h-screen bg-slate-50/70 pb-20 pt-6 sm:pb-24 sm:pt-8">
          <div className="mx-auto max-w-2xl px-4 py-12">
            <div className="rounded-3xl border border-slate-200/80 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                {isMissingKyc ? (
                  <ShieldAlert className="h-8 w-8" />
                ) : (
                  <Clock className="h-8 w-8 text-sky-600" />
                )}
              </div>
              <h1 className="text-xl font-bold text-slate-900">
                {isMissingKyc
                  ? "จำเป็นต้องยืนยันตัวตนก่อนลงประกาศให้เช่า"
                  : "รอการตรวจสอบตัวตนจากผู้ดูแลระบบ"}
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {isMissingKyc
                  ? "ผู้ปล่อยเช่าต้องผ่านการลงทะเบียนยืนยันตัวตน (บัตรประชาชนและบัญชีธนาคาร) และได้รับการอนุมัติจากแอดมินก่อนจึงจะสามารถลงประกาศสินค้าได้"
                  : "ข้อมูลบัตรประชาชนและบัญชีธนาคารของคุณอยู่ระหว่างรอแอดมินตรวจสอบตัวตน เมื่อได้รับการอนุมัติแล้ว คุณจะสามารถลงประกาศสินค้าได้ทันที"}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/profile"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1b3554] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3f6593]"
                >
                  ไปที่หน้าโปรไฟล์เพื่อตรวจสอบ
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" /> กลับหน้าหลัก
                </Link>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

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
