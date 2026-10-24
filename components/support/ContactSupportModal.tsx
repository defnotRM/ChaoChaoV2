"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  X,
  Headphones,
  MessageSquare,
  Mail,
  Phone,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

interface ContactSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: string;
  orderId?: string;
}

const ADMIN_USER_ID = "c6290b79-7197-4c19-945e-f481b7d77819";

export default function ContactSupportModal({
  isOpen,
  onClose,
  defaultCategory = "general",
  orderId,
}: ContactSupportModalProps) {
  const [tab, setTab] = useState<"channels" | "ticket">("channels");
  const [category, setCategory] = useState(defaultCategory);
  const [subject, setSubject] = useState(
    orderId ? `สอบถามปัญหาคำสั่งเช่า #${orderId.slice(0, 8)}` : ""
  );
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setErrorMsg("กรุณากรอกหัวข้อเรื่องและรายละเอียดของปัญหา");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject,
          message,
          name,
          email,
          phone,
          orderId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "เกิดข้อผิดพลาดในการส่งข้อมูล");
      }

      setSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err.message || "ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c0e6fd]/30 text-[#1b3554]">
            <Headphones className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              ติดต่อ Admin / ฝ่ายบริการลูกค้า
            </h2>
            <p className="text-xs text-slate-500">
              ศูนย์ช่วยเหลือและรายงานปัญหาแพลตฟอร์ม ChaoChao
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100/80 p-1.5 text-xs font-bold text-slate-600">
          <button
            type="button"
            onClick={() => setTab("channels")}
            className={`rounded-xl py-2.5 transition ${
              tab === "channels"
                ? "bg-white text-[#1b3554] shadow-sm"
                : "hover:text-slate-900"
            }`}
          >
            ช่องทางติดต่อด่วน
          </button>
          <button
            type="button"
            onClick={() => setTab("ticket")}
            className={`rounded-xl py-2.5 transition ${
              tab === "ticket"
                ? "bg-white text-[#1b3554] shadow-sm"
                : "hover:text-slate-900"
            }`}
          >
            ส่งเรื่องแจ้งแอดมิน (Direct Ticket)
          </button>
        </div>

        {tab === "channels" ? (
          <div className="mt-5 space-y-3.5">
            {/* 1. Official In-app Chat */}
            <div className="group rounded-2xl border border-sky-100 bg-sky-50/50 p-4 transition hover:border-sky-300 hover:bg-sky-50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1b3554] text-white shadow-sm">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      แชทโดยตรงกับทีมงาน ChaoChao Official
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-600">
                      สอบถามเรื่องทั่วไป แจ้งปัญหาเร่งด่วน หรือติดตามผลข้อพิพาทในระบบแชท
                    </p>
                  </div>
                </div>
                <Link
                  href={`/chat?userId=${ADMIN_USER_ID}`}
                  onClick={onClose}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#1b3554] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#000f22]"
                >
                  <span>เปิดแชท</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* 2. Line Official */}
            <div className="group rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                    <span className="font-bold text-sm tracking-tighter">LINE</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      LINE Official Account
                    </h3>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-emerald-800">
                      @chaochao_support
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      มีเจ้าหน้าที่คอยช่วยเหลือทุกวัน 08:30 - 20:00 น.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy("@chaochao_support", "line")}
                    className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-white px-2.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{copiedKey === "line" ? "คัดลอกแล้ว" : "คัดลอก ID"}</span>
                  </button>
                  <a
                    href="https://line.me/ti/p/@chaochao_support"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    <span>เพิ่มเพื่อน</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* 3. Email */}
            <div className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50/60">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#1b3554]">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      อีเมลฝ่ายบริการลูกค้า
                    </h3>
                    <p className="mt-0.5 font-mono text-xs text-slate-600">
                      support@chaochao.com
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      ตอบกลับภายใน 24 ชั่วโมงทำการ
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy("support@chaochao.com", "email")}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{copiedKey === "email" ? "คัดลอกแล้ว" : "คัดลอก"}</span>
                  </button>
                  <a
                    href="mailto:support@chaochao.com?subject=ChaoChao%20Support%20Inquiry"
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#1b3554] hover:bg-sky-50"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>ส่งเมล</span>
                  </a>
                </div>
              </div>
            </div>

            {/* 4. Hotline */}
            <div className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50/60">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#1b3554]">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      โทรศัพท์ศูนย์บริการ (Hotline)
                    </h3>
                    <p className="mt-0.5 font-mono text-xs font-bold text-slate-800">
                      02-123-4567
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      ให้บริการวันจันทร์ - วันอาทิตย์ 08:30 - 20:00 น.
                    </p>
                  </div>
                </div>
                <a
                  href="tel:021234567"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#1b3554] hover:bg-sky-50"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span>โทรออก</span>
                </a>
              </div>
            </div>
          </div>
        ) : submitted ? (
          <div className="mt-6 rounded-2xl bg-emerald-50 p-6 text-center border border-emerald-200 space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-emerald-950">
              ส่งข้อความถึงแอดมินเรียบร้อยแล้ว!
            </h3>
            <p className="text-xs text-emerald-800 leading-relaxed max-w-md mx-auto">
              ระบบได้ส่งการแจ้งเตือนไปยังทีมผู้ดูแลระบบเรียบร้อยแล้ว
              เจ้าหน้าที่จะตรวจสอบข้อมูลและติดต่อกลับตามช่องทางที่คุณให้ไว้โดยเร็วที่สุด
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                เสร็จสิ้น / ปิดหน้าต่าง
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitTicket} className="mt-5 space-y-4 text-xs">
            {errorMsg && (
              <div className="flex items-center gap-2 rounded-2xl bg-rose-50 p-3 text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                ประเภทปัญหา / หัวข้อสอบถาม <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-[#1b3554] focus:outline-none focus:ring-1 focus:ring-[#1b3554]"
              >
                <option value="general">สอบถามข้อมูลการใช้งานทั่วไป</option>
                <option value="payment">ปัญหาการชำระเงิน / ค่าเช่า / เงินประกัน</option>
                <option value="account">ปัญหาเกี่ยวกับบัญชี / การยืนยันตัวตน (KYC)</option>
                <option value="dispute">รายงานข้อพิพาทคำสั่งเช่า / ร้องเรียนผู้ใช้งาน</option>
                <option value="bug">แจ้งข้อผิดพลาดของระบบ (Bug Report)</option>
                <option value="other">เรื่องอื่นๆ</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                หัวข้อเรื่อง <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="ระบุหัวข้อปัญหาโดยสรุป เช่น โอนเงินแล้วแต่สถานะไม่อัปเดต"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 focus:border-[#1b3554] focus:outline-none focus:ring-1 focus:ring-[#1b3554]"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                รายละเอียดของปัญหา <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="อธิบายรายละเอียด สิ่งที่เกิดขึ้น หรือรหัสคำสั่งเช่า เพื่อให้ทีมงานตรวจสอบได้รวดเร็วขึ้น..."
                className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 focus:border-[#1b3554] focus:outline-none focus:ring-1 focus:ring-[#1b3554]"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ชื่อของคุณ
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ชื่อ-นามสกุล"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#1b3554] focus:outline-none focus:ring-1 focus:ring-[#1b3554]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  อีเมลติดต่อกลับ
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#1b3554] focus:outline-none focus:ring-1 focus:ring-[#1b3554]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08X-XXX-XXXX"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#1b3554] focus:outline-none focus:ring-1 focus:ring-[#1b3554]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setTab("channels")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                ย้อนกลับ
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-5 py-2.5 text-xs font-semibold text-white shadow-md transition hover:from-[#000f22] hover:to-[#1b3554] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span>ส่งเรื่องถึง Admin</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
