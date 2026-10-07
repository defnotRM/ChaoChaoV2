"use client";

import { ITEM_CONDITION_LABELS, type ItemCondition } from "@/lib/types/product";

const OPTIONS: Array<{ value: ItemCondition; hint: string }> = [
  { value: "like-new", hint: "แทบไม่มีร่องรอยการใช้งาน" },
  { value: "good", hint: "มีรอยเล็กน้อย ใช้งานได้ปกติ" },
  { value: "fair", hint: "มีร่องรอยชัดเจน แต่ยังใช้งานได้" },
];

/** ตัวเลือกสภาพการใช้งานอุปกรณ์ (ใช้ในหน้าลงประกาศและแก้ไขประกาศ) */
export default function ConditionPicker({
  value,
  onChange,
}: {
  value: ItemCondition | null;
  onChange: (value: ItemCondition) => void;
}) {
  return (
    <div>
      <p
        id="item-condition-label"
        className="block text-xs font-bold text-slate-700 mb-1.5"
      >
        สภาพการใช้งาน <span className="text-rose-500">*</span>
      </p>
      <div
        role="radiogroup"
        aria-labelledby="item-condition-label"
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={`rounded-xl border px-4 py-3 text-left transition active:scale-[0.98] ${
                selected
                  ? "border-[#3f6593] bg-[#c0e6fd]/30 ring-4 ring-sky-100"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span
                className={`block text-sm font-semibold ${
                  selected ? "text-[#1b3554]" : "text-slate-800"
                }`}
              >
                {ITEM_CONDITION_LABELS[opt.value]}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {opt.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
