"use client";

import React, { useState } from "react";

export default function ConfirmReturnPage() {
  const [, setImages] = useState<File[]>([]);
  const [hasDamage, setHasDamage] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white border rounded-xl space-y-6">
      <h1 className="text-xl font-bold text-gray-800">ยืนยันการส่งคืนสินค้า</h1>
      <p className="text-sm text-gray-500">
        อัปโหลดหลักฐานสภาพสินค้าหลังใช้งานเสร็จสิ้น (US-19)
      </p>

      {/* Damage Check */}
      <div className="p-4 bg-gray-50 rounded-lg border">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={hasDamage}
            onChange={(e) => setHasDamage(e.target.checked)}
          />
          พบความชำรุด/เสียหายของสินค้า
        </label>
      </div>

      {/* Upload Evidence */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <input
          type="file"
          multiple
          className="hidden"
          id="after-evidence"
          accept="image/*"
          onChange={handleImageChange}
        />
        <label htmlFor="after-evidence" className="cursor-pointer space-y-2 block">
          <p className="text-sm text-gray-600">แนบรูปภาพสภาพสินค้า ณ วันคืน</p>
        </label>
      </div>

      <button className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition">
        ส่งคืนสินค้าและขอคืนเงินประกัน
      </button>
    </div>
  );
}
