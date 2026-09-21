"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  CreditCard,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  X,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Search,
} from "lucide-react";

interface UserKyc {
  user_id: string;
  username: string;
  email: string;
  firstname: string | null;
  lastname: string | null;
  national_id: string | null;
  id_card_url: string | null;
  id_card_selfie_url: string | null;
  identity_verification_status: "pending" | "verified" | "rejected";
  created_at: string;
  status: string;
}

interface BankKyc {
  bank_account_id: string;
  user_id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  verification_status: "pending" | "verified" | "rejected";
  created_at: string;
}

export default function AdminKycPage() {
  const [users, setUsers] = useState<UserKyc[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankKyc[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "identity" | "bank">("all");
  const [statusFilter, setStatusFilter] = useState<"pending" | "all" | "verified" | "rejected">("pending");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal ดูรูปภาพ
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // Modal ปฏิเสธ (Reject Dialog)
  const [rejectDialog, setRejectDialog] = useState<{
    target: "identity" | "bank";
    userId: string;
    bankAccountId?: string;
    userName: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchKycData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/kyc?status=${statusFilter}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setBankAccounts(data.bankAccounts || []);
      } else {
        setMessage({ type: "error", text: "ไม่สามารถดึงข้อมูล KYC ได้" });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKycData();
  }, [statusFilter]);

  const handleUpdateStatus = async (
    target: "identity" | "bank",
    userId: string,
    status: "verified" | "rejected",
    bankAccountId?: string,
    reason?: string
  ) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/kyc/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          status,
          bankAccountId,
          rejectionReason: reason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: "success",
          text: data.message || "อัปเดตสถานะเรียบร้อยแล้ว",
        });
        setRejectDialog(null);
        setRejectionReason("");
        // รีเฟรชข้อมูล
        fetchKycData();
      } else {
        setMessage({
          type: "error",
          text: data.message || "เกิดข้อผิดพลาดในการอัปเดต",
        });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.national_id?.toLowerCase().includes(q) ||
      `${u.firstname || ""} ${u.lastname || ""}`.toLowerCase().includes(q)
    );
  });

  const filteredBanks = bankAccounts.filter((b) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.account_name?.toLowerCase().includes(q) ||
      b.account_number?.toLowerCase().includes(q) ||
      b.bank_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            ตรวจสอบยืนยันตัวตน (KYC & Bank Verification)
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            ตรวจสอบความถูกต้องของบัตรประชาชน รูปถ่ายคู่บัตร และบัญชีธนาคาร
          </p>
        </div>
        <button
          type="button"
          onClick={fetchKycData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#3f6593] hover:bg-sky-50 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* Alert Message */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-2xl p-4 text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tabs & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        {/* Type Tabs */}
        <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "all"
                ? "bg-white text-[#1b3554] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ทั้งหมด
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("identity")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "identity"
                ? "bg-white text-[#1b3554] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>บัตรประชาชน ({filteredUsers.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bank")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "bank"
                ? "bg-white text-[#1b3554] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>บัญชีธนาคาร ({filteredBanks.length})</span>
          </button>
        </div>

        {/* Status Filter & Search */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาชื่อ, บัญชี, เลขบัตร..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-sky-100"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-[#3f6593]"
          >
            <option value="pending">เฉพาะรอดำเนินการ (Pending)</option>
            <option value="verified">อนุมัติแล้ว (Verified)</option>
            <option value="rejected">ปฏิเสธแล้ว (Rejected)</option>
            <option value="all">สถานะทั้งหมด (All)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <RefreshCw className="h-8 w-8 animate-spin text-[#1b3554]" />
          <p className="mt-3 text-sm font-medium">กำลังโหลดข้อมูล KYC...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ส่วนที่ 1: ตรวจสอบบัตรประชาชน */}
          {(activeTab === "all" || activeTab === "identity") && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#1b3554]" />
                <h2 className="text-lg font-bold text-slate-900">
                  รายการตรวจสอบบัตรประชาชน (Identity Verification)
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                  {filteredUsers.length}
                </span>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="rounded-3xl border border-slate-200/80 bg-white p-8 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                  <p className="mt-2 text-sm font-bold text-slate-800">
                    ไม่มีรายการบัตรประชาชนที่ตรงกับเงื่อนไข
                  </p>
                  <p className="text-xs text-slate-400">
                    เมื่อผู้ใช้งานอัปโหลดรูปบัตรประชาชน รายการจะแสดงขึ้นที่นี่
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {filteredUsers.map((u) => {
                    const isPending =
                      u.identity_verification_status === "pending";
                    const isVerified =
                      u.identity_verification_status === "verified";
                    const isRejected =
                      u.identity_verification_status === "rejected";

                    return (
                      <div
                        key={u.user_id}
                        className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:shadow-md"
                      >
                        {/* Header ของ Card */}
                        <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-slate-900">
                                {u.firstname && u.lastname
                                  ? `${u.firstname} ${u.lastname}`
                                  : u.username}
                              </h3>
                              <span className="text-xs text-slate-400">
                                (@{u.username})
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">{u.email}</p>
                            {u.national_id && (
                              <p className="mt-1 text-xs font-mono font-medium text-slate-700">
                                เลขประจำตัว: {u.national_id}
                              </p>
                            )}
                          </div>

                          {/* Badge สถานะ */}
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                              isVerified
                                ? "bg-emerald-500/15 text-emerald-700"
                                : isRejected
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-amber-500/15 text-amber-800"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isVerified
                                  ? "bg-emerald-500"
                                  : isRejected
                                  ? "bg-rose-500"
                                  : "bg-amber-500"
                              }`}
                            />
                            {isVerified
                              ? "อนุมัติแล้ว"
                              : isRejected
                              ? "ปฏิเสธแล้ว"
                              : "รอดำเนินการ"}
                          </span>
                        </div>

                        {/* ภาพบัตรประชาชน + ภาพเซลฟี่ */}
                        <div className="grid grid-cols-2 gap-3">
                          {/* บัตรประชาชน */}
                          <div className="space-y-1.5">
                            <span className="text-xs font-bold text-slate-600">
                              รูปบัตรประชาชน:
                            </span>
                            {u.id_card_url ? (
                              <div
                                onClick={() =>
                                  setPreviewImage({
                                    url: u.id_card_url!,
                                    title: `บัตรประชาชน - ${u.username}`,
                                  })
                                }
                                className="group relative aspect-video cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition hover:border-[#3f6593]"
                              >
                                <img
                                  src={u.id_card_url}
                                  alt="ID Card"
                                  className="h-full w-full object-cover transition group-hover:scale-105"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                                  <Eye className="h-5 w-5 text-white" />
                                </div>
                              </div>
                            ) : (
                              <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                                ยังไม่มีรูป
                              </div>
                            )}
                          </div>

                          {/* รูปเซลฟี่คู่บัตร */}
                          <div className="space-y-1.5">
                            <span className="text-xs font-bold text-slate-600">
                              รูปเซลฟี่คู่บัตร:
                            </span>
                            {u.id_card_selfie_url ? (
                              <div
                                onClick={() =>
                                  setPreviewImage({
                                    url: u.id_card_selfie_url!,
                                    title: `เซลฟี่คู่บัตร - ${u.username}`,
                                  })
                                }
                                className="group relative aspect-video cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition hover:border-[#3f6593]"
                              >
                                <img
                                  src={u.id_card_selfie_url}
                                  alt="Selfie with ID"
                                  className="h-full w-full object-cover transition group-hover:scale-105"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                                  <Eye className="h-5 w-5 text-white" />
                                </div>
                              </div>
                            ) : (
                              <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                                ยังไม่มีรูป
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                          {isPending && (
                            <>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() =>
                                  setRejectDialog({
                                    target: "identity",
                                    userId: u.user_id,
                                    userName: u.username,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 active:scale-95 disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>ปฏิเสธ</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() =>
                                  handleUpdateStatus(
                                    "identity",
                                    u.user_id,
                                    "verified"
                                  )
                                }
                                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-[#000f22] hover:to-[#1b3554] active:scale-95 disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>อนุมัติบัตรประชาชน</span>
                              </button>
                            </>
                          )}
                          {!isPending && (
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() =>
                                handleUpdateStatus(
                                  "identity",
                                  u.user_id,
                                  isVerified ? "rejected" : "verified"
                                )
                              }
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              เปลี่ยนเป็น {isVerified ? "ปฏิเสธ" : "อนุมัติ"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ส่วนที่ 2: ตรวจสอบบัญชีธนาคาร */}
          {(activeTab === "all" || activeTab === "bank") && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#1b3554]" />
                <h2 className="text-lg font-bold text-slate-900">
                  รายการตรวจสอบบัญชีธนาคาร (Bank Account Verification)
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                  {filteredBanks.length}
                </span>
              </div>

              {filteredBanks.length === 0 ? (
                <div className="rounded-3xl border border-slate-200/80 bg-white p-8 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                  <p className="mt-2 text-sm font-bold text-slate-800">
                    ไม่มีรายการบัญชีธนาคารที่ตรงกับเงื่อนไข
                  </p>
                  <p className="text-xs text-slate-400">
                    เมื่อผู้ใช้งานเพิ่มบัญชีธนาคาร รายการจะแสดงขึ้นที่นี่
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredBanks.map((b) => {
                    const isPending = b.verification_status === "pending";
                    const isVerified = b.verification_status === "verified";
                    const isRejected = b.verification_status === "rejected";

                    return (
                      <div
                        key={b.bank_account_id}
                        className="flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:shadow-md"
                      >
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1b3554]">
                              <Building2 className="h-4 w-4" />
                              {b.bank_name}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                isVerified
                                  ? "bg-emerald-500/15 text-emerald-700"
                                  : isRejected
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-amber-500/15 text-amber-800"
                              }`}
                            >
                              {isVerified
                                ? "อนุมัติแล้ว"
                                : isRejected
                                ? "ปฏิเสธ"
                                : "รอตรวจ"}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <div>
                              <span className="text-xs text-slate-400">
                                ชื่อบัญชี:
                              </span>
                              <p className="text-sm font-bold text-slate-800">
                                {b.account_name}
                              </p>
                            </div>
                            <div>
                              <span className="text-xs text-slate-400">
                                เลขที่บัญชี:
                              </span>
                              <p className="text-sm font-mono font-semibold text-slate-900">
                                {b.account_number}
                              </p>
                            </div>
                            <div>
                              <span className="text-xs text-slate-400">
                                วันที่เพิ่ม:
                              </span>
                              <p className="text-xs text-slate-500">
                                {new Date(b.created_at).toLocaleDateString(
                                  "th-TH"
                                )}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                          {isPending && (
                            <>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() =>
                                  setRejectDialog({
                                    target: "bank",
                                    userId: b.user_id,
                                    bankAccountId: b.bank_account_id,
                                    userName: b.account_name,
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>ปฏิเสธ</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() =>
                                  handleUpdateStatus(
                                    "bank",
                                    b.user_id,
                                    "verified",
                                    b.bank_account_id
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-[#000f22] hover:to-[#1b3554]"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>อนุมัติบัญชี</span>
                              </button>
                            </>
                          )}
                          {!isPending && (
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() =>
                                handleUpdateStatus(
                                  "bank",
                                  b.user_id,
                                  isVerified ? "rejected" : "verified",
                                  b.bank_account_id
                                )
                              }
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              เปลี่ยนเป็น {isVerified ? "ปฏิเสธ" : "อนุมัติ"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal ดูรูปภาพขนาดใหญ่ */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-3xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">
                {previewImage.title}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 flex max-h-[75vh] items-center justify-center overflow-auto rounded-2xl bg-slate-900/5 p-2">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[70vh] w-auto rounded-xl object-contain"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <a
                href={previewImage.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>เปิดรูปในแท็บใหม่</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal ปฏิเสธ (Rejection Reason Dialog) */}
      {rejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                ปฏิเสธการยืนยัน (
                {rejectDialog.target === "identity"
                  ? "บัตรประชาชน"
                  : "บัญชีธนาคาร"}
                )
              </h3>
              <button
                type="button"
                onClick={() => setRejectDialog(null)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-600">
              ผู้ใช้:{" "}
              <span className="font-bold text-slate-800">
                {rejectDialog.userName}
              </span>
            </p>

            <div className="mt-4 space-y-2">
              <label className="text-xs font-bold text-slate-700">
                เหตุผลที่ปฏิเสธ (จะส่งเป็นข้อความแจ้งเตือนถึงผู้ใช้)
              </label>
              <textarea
                rows={3}
                placeholder="เช่น รูปถ่ายบัตรไม่ชัดเจน, บัญชีธนาคารชื่อไม่ตรงกับบัตร..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectDialog(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  handleUpdateStatus(
                    rejectDialog.target,
                    rejectDialog.userId,
                    "rejected",
                    rejectDialog.bankAccountId,
                    rejectionReason
                  )
                }
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoading ? "กำลังบันทึก..." : "ยืนยันการปฏิเสธ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
