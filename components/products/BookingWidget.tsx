"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Star,
} from "lucide-react";

const thb = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

export interface BookingWidgetProps {
  productId: string;
  pricePerDay: number;
  deposit: number;
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl?: string | null;
  ownerIsVerified: boolean;
  ownerRating: number;
  ownerReviewCount: number;
  productStatus?: string;
}

export default function BookingWidget({
  productId,
  pricePerDay,
  deposit,
  ownerId,
  ownerName,
  ownerAvatarUrl,
  ownerIsVerified,
  ownerRating,
  ownerReviewCount,
  productStatus = "available",
}: BookingWidgetProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    role: string;
    roles: string[];
  } | null>(null);
  const [status, setStatus] = useState(productStatus);
  const [isTogglingHide, setIsTogglingHide] = useState(false);

  useEffect(() => {
    setStatus(productStatus);
  }, [productStatus]);

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
      }
    }
    loadUser();
  }, []);

  async function handleToggleHide() {
    const nextStatus = status === "inactive" ? "available" : "inactive";
    setIsTogglingHide(true);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setStatus(nextStatus);
        router.refresh();
      }
    } catch {
      // ignore
    } finally {
      setIsTogglingHide(false);
    }
  }

  const roles =
    currentUser?.roles || (currentUser?.role ? [currentUser.role] : []);
  const isOwner = Boolean(currentUser?.id && currentUser.id === ownerId);
  const isAdmin =
    currentUser !== null &&
    (roles.includes("admin") ||
      roles.includes("ผู้ดูแลระบบ") ||
      currentUser.role === "admin");
  const isLenderOnly =
    currentUser !== null &&
    (roles.includes("lender") ||
      roles.includes("ผู้ให้เช่า") ||
      currentUser.role === "lender") &&
    !roles.includes("renter") &&
    !roles.includes("ผู้เช่า") &&
    !roles.includes("both") &&
    !roles.includes("ผู้ให้เช่า / ผู้เช่า") &&
    !roles.includes("admin") &&
    !roles.includes("ผู้ดูแลระบบ");

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* ราคา */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold text-[#1b3554]">
          {thb.format(pricePerDay)}
        </span>
        <span className="text-sm font-medium text-slate-500">/ วัน</span>
      </div>

      <p className="mt-2 text-sm text-slate-600">
        + เงินประกัน{" "}
        <span className="font-semibold text-slate-800">
          {thb.format(deposit)}
        </span>{" "}
        <span className="text-slate-400">(คืนเมื่อจบการเช่า)</span>
      </p>

      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        เงินประกันพักไว้กับ Chaochao ไม่ได้โอนตรงให้ผู้ปล่อยเช่า
      </p>

      {/* ปุ่มหลัก → หน้าเลือกวันเช่า */}
      {isAdmin ? (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-400 opacity-80 shadow-none"
          >
            <ShieldAlert className="h-5 w-5 text-rose-500" />
            <span>ไม่สามารถเช่าได้ (บัญชีแอดมิน)</span>
          </button>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-center text-xs text-rose-800">
            <p className="font-medium">
              คุณเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ (Admin)
              ซึ่งไม่สามารถทำรายการเช่าอุปกรณ์ได้
            </p>
          </div>
        </div>
      ) : isOwner ? (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-400 opacity-80 shadow-none"
            title="คุณเป็นเจ้าของอุปกรณ์นี้ ไม่สามารถเช่าสินค้าของตนเองได้"
          >
            <CalendarDays className="h-5 w-5 text-slate-400" />
            <span>คุณเป็นเจ้าของอุปกรณ์นี้</span>
          </button>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-2.5 text-center text-xs text-sky-800">
            <p className="font-medium">
              คุณเป็นผู้ลงประกาศอุปกรณ์ชิ้นนี้ ไม่สามารถกดเช่าสินค้าของตนเองได้
            </p>
          </div>
        </div>
      ) : status === "inactive" ? (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-400 opacity-80 shadow-none"
          >
            <EyeOff className="h-5 w-5 text-slate-400" />
            <span>สินค้านี้ถูกซ่อนประกาศชั่วคราว</span>
          </button>
        </div>
      ) : isLenderOnly ? (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-400 opacity-80 shadow-none"
            title="บัญชีของคุณเป็นผู้ให้เช่าเท่านั้น ไม่สามารถกดเช่าสินค้าได้"
          >
            <CalendarDays className="h-5 w-5 text-slate-400" />
            <span>ไม่สามารถเช่าได้ (บัญชีผู้ให้เช่า)</span>
          </button>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-center text-xs text-amber-800">
            <p className="font-medium">
              บัญชีของคุณเป็นผู้ให้เช่าเท่านั้น หากต้องการเช่าอุปกรณ์
              กรุณาเพิ่มบทบาทผู้เช่าหรือสลับบัญชี
            </p>
          </div>
        </div>
      ) : (
        <>
          <Link
            href={`/product/${productId}/rent`}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-3.5 text-base font-semibold text-white shadow-md shadow-[#1b3554]/15 transition duration-200 hover:from-[#000f22] hover:to-[#1b3554] active:scale-[0.98]"
          >
            <CalendarDays className="h-5 w-5" />
            <span>เลือกวันที่เช่า →</span>
          </Link>
          <p className="mt-2.5 text-center text-xs leading-relaxed text-slate-400">
            เลือกช่วงวันและจุดนัดรับ–คืนตัวจริง พร้อมราคาสุทธิ ในขั้นตอนถัดไป
          </p>
        </>
      )}

      {/* การ์ดความน่าเชื่อถือของผู้ให้เช่า (FR-19) */}
      <div className="mt-5 rounded-2xl border border-slate-200 p-3.5">
        <div className="flex items-center gap-3">
          {ownerAvatarUrl ? (
            <Image
              src={ownerAvatarUrl}
              alt={ownerName}
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-full object-cover shadow-sm"
              unoptimized={
                ownerAvatarUrl.startsWith("data:") ||
                ownerAvatarUrl.startsWith("blob:")
              }
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-base font-bold text-white">
              {ownerName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-bold text-slate-900">
                {ownerName}
              </p>
              {ownerIsVerified ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                  ยืนยันตัวตนแล้ว
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  รอยืนยันตัวตน
                </span>
              )}
            </div>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-slate-700">
                {ownerRating.toFixed(1)}
              </span>
              <span className="text-slate-400">
                คะแนนเฉลี่ยผู้ให้เช่า ({ownerReviewCount} รีวิว)
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* เจ้าของประกาศ: แสดงปุ่มแก้ไขประกาศ และปุ่มซ่อน/แสดงข้อมูลสินค้า */}
      {isOwner && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            href={`/lender/editmyproduct/${productId}`}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[#3f6593] hover:bg-sky-50 hover:text-[#1b3554] active:scale-95"
          >
            <Pencil className="h-4 w-4" />
            แก้ไขประกาศ
          </Link>
          <button
            type="button"
            onClick={handleToggleHide}
            disabled={isTogglingHide || status === "rented"}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
              status === "inactive"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {isTogglingHide ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === "inactive" ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            <span>
              {status === "inactive" ? "เปิดแสดงสินค้า" : "ซ่อนข้อมูลสินค้า"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
