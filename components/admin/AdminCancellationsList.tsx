"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  FileText,
  Package,
  User,
  X,
  XCircle,
  Calendar,
  CheckCircle2,
} from "lucide-react";

export interface CancelledOrderItem {
  order_id: string;
  item_name: string;
  lender_name: string;
  renter_name: string;
  total_paid: number;
  rental_fee: number;
  deposit: number;
  cancel_reason: string;
  images: string[];
  updated_at: string;
}

interface AdminCancellationsListProps {
  cancellations: CancelledOrderItem[];
}

const thb = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

export default function AdminCancellationsList({
  cancellations,
}: AdminCancellationsListProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              รายการยกเลิกคำสั่งเช่าและรูปหลักฐาน (FR-35 Cancellations)
            </h2>
            <span className="text-xs text-slate-500">
              กรณีผู้ให้เช่ายกเลิกคำสั่งเช่าที่ชำระเงินแล้วก่อนวันนัดรับ พร้อมเหตุผลและรูปหลักฐาน
            </span>
          </div>
        </div>
        <Link
          href="/admin/disputes?status=lender_cancellation"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b3554] hover:underline"
        >
          <span>ดูในระบบข้อพิพาท</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* List */}
      {!cancellations || cancellations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-800">
            ไม่มีรายการขอยกเลิกคำสั่งเช่า
          </p>
          <p className="text-xs text-slate-400">
            เมื่อมีผู้ให้เช่ายกเลิกคำสั่งเช่าตามเงื่อนไข FR-35 ข้อมูลเหตุผลและรูปถ่ายจะปรากฏที่นี่
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {cancellations.map((item) => (
            <div
              key={item.order_id}
              className="py-4 first:pt-0 last:pb-0 space-y-3"
            >
              {/* Order Meta Header */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200">
                    FR-35 ยกเลิกโดยผู้ให้เช่า
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-700">
                    #{item.order_id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {item.item_name}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(item.updated_at).toLocaleDateString("th-TH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    คืนเงิน 100%: {thb.format(item.total_paid)}
                  </span>
                </div>
              </div>

              {/* Renter & Lender Info */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>ผู้ให้เช่า (ผู้ยกเลิก):</span>
                  <span className="font-bold text-slate-800">
                    {item.lender_name}
                  </span>
                </div>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>ผู้เช่า (ผู้รับเงินคืน):</span>
                  <span className="font-bold text-slate-800">
                    {item.renter_name}
                  </span>
                </div>
              </div>

              {/* Reason */}
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  เหตุผลการยกเลิก:
                </span>
                <p className="text-xs text-slate-800 bg-rose-50/50 p-2.5 rounded-xl border border-rose-100 leading-relaxed whitespace-pre-wrap">
                  {item.cancel_reason}
                </p>
              </div>

              {/* Proof Images Gallery */}
              {item.images && item.images.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    รูปภาพหลักฐาน ({item.images.length} รูป):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {item.images.map((imgUrl, idx) => (
                      <div
                        key={idx}
                        onClick={() => setPreviewImage(imgUrl)}
                        className="group relative h-20 w-20 cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-100 hover:border-rose-400 transition"
                      >
                        <img
                          src={imgUrl}
                          alt={`หลักฐาน ${idx + 1}`}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                          <Eye className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl bg-white p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute right-4 top-4 rounded-full bg-slate-900/70 p-2 text-white hover:bg-slate-900 transition"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewImage}
              alt="หลักฐานขยาย"
              className="max-h-[85vh] w-auto rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
