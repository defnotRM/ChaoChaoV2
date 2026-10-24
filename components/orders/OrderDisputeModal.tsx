"use client";

import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  X,
  Upload,
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
} from "lucide-react";

interface ReportType {
  report_type_id: string;
  type_name: string;
}

interface OrderDisputeModalProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userRole: "renter" | "lender";
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  damaged_item: "สินค้าชำรุดเสียหาย / ใช้งานไม่ได้ตามปกติ",
  false_advertisement: "สินค้าไม่ตรงปก / ข้อมูลไม่ตรงกับที่ระบุ",
  stolen_item: "ผู้เช่าไม่คืนสินค้าตามกำหนด / ขาดการติดต่อ",
  account_report: "รายงานพฤติกรรมมิชอบ / การทุจริตของคู่สัญญา",
  other: "ปัญหาอื่นๆ ที่ต้องการให้ Admin ช่วยเหลือ",
};

export default function OrderDisputeModal({
  orderId,
  isOpen,
  onClose,
  onSuccess,
  userRole,
}: OrderDisputeModalProps) {
  const [reportTypes, setReportTypes] = useState<ReportType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setDescription("");
      setSelectedFiles([]);
      setFilePreviews([]);

      const fetchTypes = async () => {
        setLoadingTypes(true);
        try {
          const res = await fetch(`/api/rentals/${orderId}/report`);
          const data = await res.json();
          if (res.ok && data.reportTypes) {
            setReportTypes(data.reportTypes);
            if (data.reportTypes.length > 0) {
              setSelectedTypeId(data.reportTypes[0].report_type_id);
            }
          }
        } catch (err) {
          console.error("Fetch report types error:", err);
        } finally {
          setLoadingTypes(false);
        }
      };

      fetchTypes();
    }
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = 5 - selectedFiles.length;
    if (remainingSlots <= 0) {
      setErrorMsg("สามารถแนบรูปถ่ายหลักฐานได้สูงสุด 5 รูป");
      return;
    }

    const newFiles = files.slice(0, remainingSlots);
    const updatedFiles = [...selectedFiles, ...newFiles];
    setSelectedFiles(updatedFiles);

    // Create previews
    const newPreviews = newFiles.map((file) => URL.createObjectURL(file));
    setFilePreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemoveFile = (index: number) => {
    const updatedFiles = selectedFiles.filter((_, i) => i !== index);
    const updatedPreviews = filePreviews.filter((_, i) => i !== index);
    setSelectedFiles(updatedFiles);
    setFilePreviews(updatedPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedTypeId) {
      setErrorMsg("กรุณาเลือกประเภทของปัญหา");
      return;
    }

    if (!description.trim() || description.trim().length < 10) {
      setErrorMsg("กรุณาระบุรายละเอียดของปัญหาอย่างน้อย 10 ตัวอักษร");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("reportTypeId", selectedTypeId);
      formData.append("description", description.trim());

      selectedFiles.forEach((file) => {
        formData.append("images", file);
      });

      const res = await fetch(`/api/rentals/${orderId}/report`, {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setErrorMsg(result.message || "เกิดข้อผิดพลาดในการส่งรายงาน");
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Submit dispute error:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto sm:p-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                รายงานปัญหา / เปิดข้อพิพาทกับ Admin
              </h3>
              <p className="text-xs text-slate-500">
                รายการเช่า #{orderId.slice(0, 8)} ({userRole === "lender" ? "ผู้ให้เช่า" : "ผู้เช่า"})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notice */}
        <div className="mt-4 rounded-2xl bg-amber-50/70 p-3.5 border border-amber-200/80 text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold">โปรดระบุข้อเท็จจริงและแนบหลักฐาน</p>
            <p className="mt-0.5 text-amber-700">
              เมื่อส่งรายงาน ทีมงาน Admin จะทำการตรวจสอบหลักฐานจากทั้งสองฝ่าย และพิจารณาความเสียหายหรือการคืนเงินมัดจำตามความเป็นจริง
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Report Type */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              ประเภทของปัญหา <span className="text-rose-500">*</span>
            </label>
            {loadingTypes ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>กำลังโหลดรายการปัญหา...</span>
              </div>
            ) : (
              <select
                value={selectedTypeId}
                onChange={(e) => setSelectedTypeId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-[#c0e6fd]/50"
              >
                {reportTypes.map((t) => (
                  <option key={t.report_type_id} value={t.report_type_id}>
                    {REPORT_TYPE_LABELS[t.type_name] || t.type_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              รายละเอียดของปัญหา <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="อธิบายเหตุการณ์หรือปัญหาที่พบ เช่น อุปกรณ์มีรอยแตกบริเวณเลนส์, ไม่สามารถติดต่อผู้เช่าได้, สินค้าไม่ตรงกับรูป..."
              className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-[#c0e6fd]/50"
            />
            <p className="mt-1 text-right text-[11px] text-slate-400">
              {description.length} ตัวอักษร (อย่างน้อย 10 ตัวอักษร)
            </p>
          </div>

          {/* Images Upload */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              แนบรูปถ่ายหลักฐาน (สูงสุด 5 รูป)
            </label>

            {/* Previews */}
            {filePreviews.length > 0 && (
              <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {filePreviews.map((preview, idx) => (
                  <div key={idx} className="group relative h-20 overflow-hidden rounded-xl border border-slate-200">
                    <img src={preview} alt="หลักฐาน" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100 text-white"
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedFiles.length < 5 && (
              <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 text-center cursor-pointer hover:bg-slate-50 transition">
                <Camera className="h-5 w-5 text-slate-400 mb-1" />
                <span className="text-xs font-semibold text-slate-600">
                  คลิกเพื่ออัปโหลดรูปภาพหลักฐาน ({selectedFiles.length}/5)
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  รองรับไฟล์ JPG, PNG, WEBP (ขนาดไม่เกิน 5MB)
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || !description.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-rose-600/20 transition hover:from-rose-700 hover:to-rose-800 active:scale-95 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>กำลังส่งรายงาน...</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>ส่งรายงานให้ Admin</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
