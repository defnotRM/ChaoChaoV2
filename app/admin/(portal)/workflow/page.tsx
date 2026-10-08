"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GitBranch,
  ShieldAlert,
  Eye,
  PowerOff,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Edit2,
  X,
  Save,
  Filter,
  Check,
  ChevronRight,
  Info,
} from "lucide-react";

interface SystemConfigItem {
  config_id: string;
  config_key: string;
  config_value: string;
  value_type: "int" | "numeric" | "bool" | "text";
  description: string | null;
  updated_at: string;
  updated_by: string | null;
  updated_by_username: string | null;
}

interface WorkflowHistoryItem {
  history_id: string;
  workflow_code: string;
  workflow_name: string;
  entity_id: string;
  from_state_code: string;
  from_state_name: string;
  to_state_code: string;
  to_state_name: string;
  action_code: string | null;
  action_description: string | null;
  changed_by_username: string;
  reason: string | null;
  is_violation: boolean;
  changed_at: string;
}

interface WorkflowOption {
  code: string;
  name: string;
}

const FRIENDLY_CONFIG_NAMES: Record<
  string,
  { title: string; unit?: string; note?: string }
> = {
  approval_timeout_hours: {
    title: "เวลาตอบรับคำขอของผู้ให้เช่า",
    unit: "ชั่วโมง",
  },
  payment_timeout_hours: {
    title: "เวลาชำระเงินของผู้เช่าหลังอนุมัติ",
    unit: "ชั่วโมง",
  },
  slip_review_timeout_hours: {
    title: "เวลาตรวจสลิปของผู้ให้เช่า (เกินแล้วอนุมัติอัตโนมัติ)",
    unit: "ชั่วโมง",
  },
  noshow_grace_hours: {
    title: "เวลาผ่อนผันหลังเวลานัดหมาย",
    unit: "ชั่วโมง",
  },
  cancel_threshold_days: {
    title: "เวลายกเลิกขั้นต่ำก่อนวันนัดรับ (น้อยกว่านี้คิดค่าปรับ)",
    unit: "วัน",
  },
  platform_fee_percent: {
    title: "ค่าธรรมเนียมแพลตฟอร์ม",
    unit: "%",
  },
  extra_payment_deadline_hours: {
    title: "เวลาชำระส่วนต่างค่าเสียหาย (เกินแล้วระงับบัญชี)",
    unit: "ชั่วโมง",
  },
  reminder_days_before: {
    title: "แจ้งเตือนล่วงหน้าก่อนวันนัดรับ/คืน",
    unit: "วัน",
    note: "ยังไม่มีผลจริง (ค่าฝังอยู่ใน Cron)",
  },
};

export default function AdminWorkflowPage() {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<SystemConfigItem[]>([]);
  const [currentMode, setCurrentMode] = useState<string>("static");
  const [history, setHistory] = useState<WorkflowHistoryItem[]>([]);
  const [violationCount, setViolationCount] = useState<number>(0);
  const [workflowOptions, setWorkflowOptions] = useState<WorkflowOption[]>([]);

  // Filter States
  const [filterViolationsOnly, setFilterViolationsOnly] = useState(false);
  const [selectedWorkflowCode, setSelectedWorkflowCode] = useState<string>("");

  // Edit State
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingKey, setSavingKey] = useState<boolean>(false);

  // Dynamic Mode Confirmation Modal
  const [showDynamicConfirmModal, setShowDynamicConfirmModal] = useState(false);
  const [modeChanging, setModeChanging] = useState(false);

  // Alert State
  const [bannerMessage, setBannerMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const showToast = (type: "success" | "error", text: string) => {
    setBannerMessage({ type, text });
    setTimeout(() => {
      setBannerMessage(null);
    }, 4500);
  };

  // ดึงข้อมูลการตั้งค่า
  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/workflow/config", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setConfigs(data.configs || []);
        setCurrentMode(data.currentMode || "static");
      } else {
        showToast("error", data.message || "ดึงข้อมูลการตั้งค่าไม่สำเร็จ");
      }
    } catch (err: any) {
      showToast("error", "เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อดึงการตั้งค่า");
    }
  }, []);

  // ดึงข้อมูลประวัติ
  const fetchHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterViolationsOnly) params.append("filterViolations", "true");
      if (selectedWorkflowCode) params.append("workflowCode", selectedWorkflowCode);
      params.append("limit", "100");

      const res = await fetch(`/api/admin/workflow/history?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHistory(data.history || []);
        setViolationCount(data.violationCount || 0);
        if (data.workflows) {
          setWorkflowOptions(data.workflows);
        }
      } else {
        showToast("error", data.message || "ดึงประวัติ workflow ไม่สำเร็จ");
      }
    } catch (err: any) {
      showToast("error", "เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อดึงประวัติ");
    }
  }, [filterViolationsOnly, selectedWorkflowCode]);

  // โหลดข้อมูลครั้งแรก
  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchConfigs(), fetchHistory()]);
    setLoading(false);
  }, [fetchConfigs, fetchHistory]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // บันทึกการเปลี่ยนโหมด
  const handleModeChange = async (targetMode: string) => {
    if (targetMode === "dynamic") {
      setShowDynamicConfirmModal(true);
      return;
    }
    await executeModeChange(targetMode);
  };

  const executeModeChange = async (targetMode: string) => {
    setModeChanging(true);
    try {
      const res = await fetch("/api/admin/workflow/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: targetMode }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCurrentMode(data.currentMode);
        showToast("success", data.message || `เปลี่ยนโหมดเป็น ${targetMode} สำเร็จ`);
        await fetchConfigs();
      } else {
        showToast("error", data.message || "ไม่สามารถเปลี่ยนโหมดได้");
      }
    } catch (err: any) {
      showToast("error", "เกิดข้อผิดพลาดในการเปลี่ยนโหมด");
    } finally {
      setModeChanging(false);
      setShowDynamicConfirmModal(false);
    }
  };

  // บันทึกการแก้ไข System Config
  const handleSaveConfig = async (key: string, value: string) => {
    setSavingKey(true);
    try {
      const res = await fetch("/api/admin/workflow/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("success", data.message);
        setEditingKey(null);
        await fetchConfigs();
      } else {
        showToast("error", data.message || "อัปเดตไม่สำเร็จ");
      }
    } catch (err: any) {
      showToast("error", "เกิดข้อผิดพลาดในการบันทึกค่า");
    } finally {
      setSavingKey(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString("th-TH", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const systemConfigList = configs.filter((c) => c.config_key !== "workflow_mode");

  return (
    <div className="space-y-8">
      {/* Toast / Banner Alert */}
      {bannerMessage && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-semibold shadow-lg transition-all ${
            bannerMessage.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {bannerMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{bannerMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            ตั้งค่าระบบและวงจรงาน (Workflow Management)
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            กำหนดโหมดการบังคับใช้กฎของสถานะ (Workflow Mode), แก้ไขค่าตัวแปรระบบ (System Configuration) และติดตามประวัติการเปลี่ยนสถานะ
          </p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#3f6593] hover:bg-sky-50 active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* ส่วนที่ 1: สวิตช์โหมด WORKFLOW (Workflow Mode Switcher) */}
      {/* ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-[#1b3554]" />
              <span>โหมดการทำงานของ Workflow (Workflow Mode)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              ควบคุมระดับการบังคับใช้กฎ 53 เส้นทางเปลี่ยนสถานะในระบบ
            </p>
          </div>

          {/* Current Status Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">โหมดปัจจุบัน:</span>
            {currentMode === "dynamic" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Dynamic (บังคับใช้จริง)
              </span>
            )}
            {currentMode === "shadow" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 px-3 py-1 text-xs font-bold text-[#1b3554]">
                <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
                Shadow (เฝ้าดูและบันทึกข้อผิดพลาด)
              </span>
            )}
            {currentMode === "static" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Static (ใช้ตรรกะเดิมในโค้ด)
              </span>
            )}
          </div>
        </div>

        {/* Mode Selector Cards */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Static Mode */}
          <div
            onClick={() => currentMode !== "static" && !modeChanging && handleModeChange("static")}
            className={`relative rounded-2xl border p-5 transition cursor-pointer ${
              currentMode === "static"
                ? "border-slate-800 bg-slate-50/80 ring-2 ring-slate-800/20"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200/80 text-slate-700">
                <PowerOff className="h-5 w-5" />
              </div>
              {currentMode === "static" && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-xs">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <h3 className="mt-3 text-sm font-bold text-slate-900">Static (ปิดระบบ Workflow)</h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              ไม่ตรวจเส้นทางในฐานข้อมูล แอปจะทำงานตาม Logic ที่เขียนฝังไว้เดิมใน Code เหมาะสำหรับใช้เป็นจุดถอยกลับฉุกเฉิน
            </p>
          </div>

          {/* 2. Shadow Mode */}
          <div
            onClick={() => currentMode !== "shadow" && !modeChanging && handleModeChange("shadow")}
            className={`relative rounded-2xl border p-5 transition cursor-pointer ${
              currentMode === "shadow"
                ? "border-[#1b3554] bg-sky-50/40 ring-2 ring-[#1b3554]/20"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-[#1b3554]">
                <Eye className="h-5 w-5" />
              </div>
              {currentMode === "shadow" && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1b3554] text-white text-xs">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">Shadow (โหมดเฝ้าดู)</h3>
              <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-[#1b3554]">
                แนะนำ
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              ตรวจสอบเส้นทางและสิทธิ์ หากพบการเปลี่ยนสถานะที่ผิดกฎจะจดบันทึกไว้ในประวัติ (SHADOW_VIOLATION) แต่ **ไม่บล็อกผู้ใช้**
            </p>
          </div>

          {/* 3. Dynamic Mode */}
          <div
            onClick={() => currentMode !== "dynamic" && !modeChanging && handleModeChange("dynamic")}
            className={`relative rounded-2xl border p-5 transition cursor-pointer ${
              currentMode === "dynamic"
                ? "border-emerald-600 bg-emerald-50/30 ring-2 ring-emerald-600/20"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <ShieldAlert className="h-5 w-5" />
              </div>
              {currentMode === "dynamic" && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <h3 className="mt-3 text-sm font-bold text-slate-900">Dynamic (บังคับใช้จริง)</h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              บังคับใช้กฎ 53 เส้นทางอย่างเข้มงวด หากไม่มีเส้นทางหรือผู้ทำไม่มีสิทธิ์ ระบบจะสั่ง **ปฏิเสธ (Reject)** ทันที
            </p>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* ส่วนที่ 2: ค่าตั้งระบบ (System Configuration) */}
      {/* ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#1b3554]" />
            <span>ค่ากำหนดระบบ (System Configuration)</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            กำหนดระยะเวลาหมดอายุ (Timeouts), ค่าธรรมเนียม และระยะเวลาดำเนินการต่างๆ การแก้ไขจะมีผลกับ Cron และรอบคำนวณถัดไปทันที
          </p>
        </div>

        <div className="mt-5 divide-y divide-slate-100">
          {systemConfigList.map((cfg) => {
            const meta = FRIENDLY_CONFIG_NAMES[cfg.config_key] || {
              title: cfg.config_key,
            };
            const isEditing = editingKey === cfg.config_key;
            const hasNote = Boolean(meta.note);

            return (
              <div
                key={cfg.config_key}
                className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/60 rounded-xl px-2.5 transition"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">{meta.title}</span>
                    <span className="font-mono text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {cfg.config_key}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-slate-500 border border-slate-200 px-1 rounded">
                      {cfg.value_type}
                    </span>
                    {hasNote && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        <AlertTriangle className="h-3 w-3 text-amber-600" />
                        {meta.note}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {cfg.description || "ไม่มีคำอธิบาย"}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    แก้ไขล่าสุด: {formatDate(cfg.updated_at)} โดย {cfg.updated_by_username || "Admin"}
                  </p>
                </div>

                {/* Value & Actions */}
                <div className="flex items-center gap-3 shrink-0">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          type={cfg.value_type === "int" || cfg.value_type === "numeric" ? "number" : "text"}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-28 rounded-xl border border-[#3f6593] bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-sky-100"
                          placeholder={cfg.config_value}
                          autoFocus
                        />
                      </div>
                      <span className="text-xs text-slate-500">{meta.unit}</span>
                      <button
                        type="button"
                        disabled={savingKey}
                        onClick={() => handleSaveConfig(cfg.config_key, editValue)}
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>{savingKey ? "กำลังบันทึก..." : "บันทึก"}</span>
                      </button>
                      <button
                        type="button"
                        disabled={savingKey}
                        onClick={() => setEditingKey(null)}
                        className="inline-flex items-center rounded-xl border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 active:scale-95 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-base font-extrabold text-[#1b3554]">
                          {cfg.config_value}
                        </span>
                        {meta.unit && (
                          <span className="ml-1 text-xs font-semibold text-slate-500">
                            {meta.unit}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingKey(cfg.config_key);
                          setEditValue(cfg.config_value);
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-[#3f6593] hover:text-[#1b3554] active:scale-95 cursor-pointer"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>แก้ไข</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================ */}
      {/* ส่วนที่ 3: ประวัติ WORKFLOW & รายการผิดกฎ (History & Violations) */}
      {/* ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Eye className="h-5 w-5 text-[#1b3554]" />
              <span>ประวัติการเปลี่ยนสถานะ (Workflow History)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              ติดตามการเปลี่ยนสถานะ 100 แถวล่าสุด และรายการที่โหมด Shadow บันทึกไว้เมื่อพบการละเมิดกฎ
            </p>
          </div>

          {/* Violations Status Indicator */}
          <div>
            {violationCount === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ไม่พบการละเมิดกฎ (0 รายการ)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-bold text-rose-800">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                พบการละเมิดกฎ {violationCount} รายการ
              </span>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Toggle: All vs Violations */}
            <button
              type="button"
              onClick={() => setFilterViolationsOnly(false)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                !filterViolationsOnly
                  ? "bg-[#1b3554] text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              ทั้งหมด ({history.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterViolationsOnly(true)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                filterViolationsOnly
                  ? "bg-rose-600 text-white shadow-sm"
                  : "border border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100"
              }`}
            >
              <AlertTriangle className="h-3 w-3" />
              <span>เฉพาะที่ผิดกฎ ({violationCount})</span>
            </button>

            {/* Workflow Code Dropdown Filter */}
            {workflowOptions.length > 0 && (
              <div className="relative inline-flex items-center">
                <select
                  value={selectedWorkflowCode}
                  onChange={(e) => setSelectedWorkflowCode(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-[#3f6593]"
                >
                  <option value="">ทุกวงจร ({workflowOptions.length} วงจร)</option>
                  {workflowOptions.map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-400">
            แสดง {history.length} รายการล่าสุด
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/80">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider">
                <th className="px-4 py-3">เวลา</th>
                <th className="px-4 py-3">วงจร</th>
                <th className="px-4 py-3">การเปลี่ยนสถานะ</th>
                <th className="px-4 py-3">การกระทำ (Action)</th>
                <th className="px-4 py-3">ผู้ทำ</th>
                <th className="px-4 py-3">สถานะ / เหตุผล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    {filterViolationsOnly
                      ? "ยอดเยี่ยม! ไม่พบรายการที่ละเมิดกฎในเงื่อนไขที่เลือก"
                      : "ยังไม่มีประวัติการเปลี่ยนสถานะในระบบ"}
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr
                    key={row.history_id}
                    className={`transition hover:bg-slate-50/70 ${
                      row.is_violation ? "bg-rose-50/40" : ""
                    }`}
                  >
                    {/* เวลา */}
                    <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                      {formatDate(row.changed_at)}
                    </td>

                    {/* วงจร */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">
                        {row.workflow_name}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-mono">
                        {row.workflow_code}
                      </span>
                    </td>

                    {/* เส้นทาง จาก -> ไป */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {row.from_state_name}
                        </span>
                        <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="rounded bg-[#1b3554]/10 px-2 py-0.5 text-[11px] font-semibold text-[#1b3554]">
                          {row.to_state_name}
                        </span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.action_code ? (
                        <span className="font-mono text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                          {row.action_code}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    {/* ผู้ทำ */}
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">
                      {row.changed_by_username}
                    </td>

                    {/* เหตุผล / Violation status */}
                    <td className="px-4 py-3 max-w-xs">
                      {row.is_violation ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            <AlertTriangle className="h-3 w-3" />
                            SHADOW VIOLATION
                          </span>
                          <p className="text-[11px] text-rose-700 truncate" title={row.reason || ""}>
                            {row.reason}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-600 truncate block" title={row.reason || "ปกติ"}>
                          {row.reason || "ถูกต้องตามเส้นทาง"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL ยืนยันก่อนเปิดโหมด DYNAMIC (High Risk Warning) */}
      {/* ============================================================ */}
      {showDynamicConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-rose-100 pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shrink-0">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  ยืนยันการเปิดโหมด Dynamic
                </h3>
                <p className="text-xs font-semibold text-rose-600">
                  โหมดบังคับใช้กฎ 53 เส้นทางอย่างเข้มงวด
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 space-y-2">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  คำเตือนสำคัญด้านความปลอดภัย
                </p>
                <p>
                  เมื่อเปิดโหมด **Dynamic** ระบบ Database Trigger จะสั่ง **ปฏิเสธ (Block & Throw Exception)** การเปลี่ยนสถานะที่ไม่อยู่ในเส้นทางที่กำหนดทันที
                </p>
                <p>
                  หากยังมีเส้นทางที่ไม่ได้ครอบคลุม หรือผู้ใช้ทำรายการนอกเหนือจากที่ seed ไว้ **จะส่งผลให้ผู้ใช้งานจริงไม่สามารถทำรายการเช่าหรือส่งงานได้**
                </p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 space-y-1.5 text-slate-700">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-sky-600" />
                  เกณฑ์ที่แนะนำก่อนเปิดโหมดนี้:
                </p>
                <ul className="list-disc list-inside space-y-1 pl-1 text-[11px]">
                  <li>ทดสอบในโหมด Shadow บน Staging ครบทุก 9 ฟังก์ชันแอดมินแล้ว</li>
                  <li>ตารางประวัติไม่มีรายการ SHADOW_VIOLATION ค้างอยู่</li>
                  <li>ได้รับการยืนยันความพร้อมร่วมกับทีมงาน (WiWat)</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={modeChanging}
                onClick={() => setShowDynamicConfirmModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={modeChanging}
                onClick={() => executeModeChange("dynamic")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>{modeChanging ? "กำลังเปิดใช้งาน..." : "ยืนยันการเปิดโหมด Dynamic"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
