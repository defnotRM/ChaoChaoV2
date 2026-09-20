"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Camera,
  CheckCircle2,
  DollarSign,
  FileText,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  MapPin,
  Package,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
} from "lucide-react";

interface Category {
  category_id: string;
  category_name: string;
}

interface PostProductClientProps {
  categories: Category[];
}

const PRESET_IMAGES = [
  {
    label: "กล้อง Sony Alpha A7 IV",
    url: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80",
  },
  {
    label: "เต็นท์แคมป์ปิ้ง Naturehike",
    url: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&auto=format&fit=crop&q=80",
  },
  {
    label: "สว่านกระแทกไร้สาย Makita",
    url: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&auto=format&fit=crop&q=80",
  },
  {
    label: "ไมโครโฟนไร้สาย DJI Mic 2",
    url: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&auto=format&fit=crop&q=80",
  },
];

const DEFAULT_CONDITIONS = [
  "ตรวจเช็กสภาพอุปกรณ์และทดสอบการใช้งานร่วมกันก่อนรับมอบ",
  "ห้ามนำอุปกรณ์ไปใช้งานในน้ำ หรือในพื้นที่เสี่ยงอันตรายโดยไม่มีอุปกรณ์ป้องกัน",
  "ส่งคืนอุปกรณ์ในสภาพสมบูรณ์และตรงตามวันเวลาที่นัดหมาย",
];

export default function PostProductClient({
  categories,
}: PostProductClientProps) {
  const router = useRouter();

  // Current logged in user
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    role: string;
    roles: string[];
  } | null>(null);

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

  // Form states
  const [itemName, setItemName] = useState("");
  const [categoryId, setCategoryId] = useState(
    categories[0]?.category_id || "c1111111-1111-1111-1111-111111111111",
  );
  const [description, setDescription] = useState("");
  const [originalPrice, setOriginalPrice] = useState<string>("");
  const [rentalFeePerDay, setRentalFeePerDay] = useState<string>("");
  const [deposit, setDeposit] = useState<string>("");

  // Images
  const [imageUrls, setImageUrls] = useState<string[]>([
    "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80",
  ]);
  const [newImageUrl, setNewImageUrl] = useState("");

  // Location — รองรับหลายที่ต่อประเภท (นัดรับ/นัดคืน)
  type LocationEntry = {
    description: string;
    no: string;
    alley: string;
    road: string;
    province: string;
    district: string;
    subdistrict: string;
  };

  const emptyLocation = (): LocationEntry => ({
    description: "",
    no: "",
    alley: "",
    road: "",
    province: "กรุงเทพมหานคร",
    district: "",
    subdistrict: "",
  });

  const [sameLocation, setSameLocation] = useState(true);
  const [meetupLocations, setMeetupLocations] = useState<LocationEntry[]>([
    {
      ...emptyLocation(),
      description: "BTS สยาม / พญาไท (นัดรับที่สถานี)",
      district: "ปทุมวัน",
      subdistrict: "ปทุมวัน",
    },
  ]);
  const [returnLocations, setReturnLocations] = useState<LocationEntry[]>([
    emptyLocation(),
  ]);

  function updateLocation(
    list: LocationEntry[],
    setList: (v: LocationEntry[]) => void,
    index: number,
    field: keyof LocationEntry,
    value: string,
  ) {
    const next = [...list];
    next[index] = { ...next[index], [field]: value };
    setList(next);
  }

  function addLocation(
    list: LocationEntry[],
    setList: (v: LocationEntry[]) => void,
  ) {
    setList([...list, emptyLocation()]);
  }

  function removeLocation(
    list: LocationEntry[],
    setList: (v: LocationEntry[]) => void,
    index: number,
  ) {
    if (list.length <= 1) return;
    setList(list.filter((_, i) => i !== index));
  }

  // Dates
  const todayStr = new Date().toISOString().split("T")[0];
  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  const sixMonthsLaterStr = sixMonthsLater.toISOString().split("T")[0];

  const [availabilityStart, setAvailabilityStart] = useState(todayStr);
  const [availabilityEnd, setAvailabilityEnd] = useState(sixMonthsLaterStr);

  // Conditions
  const [conditions, setConditions] = useState<string[]>(DEFAULT_CONDITIONS);
  const [newCondition, setNewCondition] = useState("");

  // Submit states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleAddImage(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!imageUrls.includes(trimmed)) {
      setImageUrls([...imageUrls, trimmed]);
    }
    setNewImageUrl("");
  }

  function handleRemoveImage(index: number) {
    if (imageUrls.length <= 1) {
      alert("ต้องมีรูปภาพสินค้าอย่างน้อย 1 รูป");
      return;
    }
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  }

  function handleAddCondition() {
    const trimmed = newCondition.trim();
    if (!trimmed) return;
    setConditions([...conditions, trimmed]);
    setNewCondition("");
  }

  function handleRemoveCondition(index: number) {
    setConditions(conditions.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!itemName.trim()) {
      setErrorMessage("กรุณากรอกชื่อสินค้า");
      return;
    }
    const fee = Number(rentalFeePerDay);
    if (!fee || fee <= 0) {
      setErrorMessage("กรุณาระบุค่าเช่าต่อวันให้ถูกต้อง");
      return;
    }
    const dep = Number(deposit);
    if (isNaN(dep) || dep < 0) {
      setErrorMessage("กรุณาระบุเงินประกันให้ถูกต้อง");
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        categoryId: categoryId || null,
        itemName: itemName.trim(),
        description: description.trim(),
        originalPrice: originalPrice ? Number(originalPrice) : undefined,
        rentalFeePerDay: fee,
        deposit: dep,
        images: [],
        locations: [
          ...meetupLocations.map((l) => ({
            description: l.description.trim() || "จุดนัดรับที่ตกลงกัน",
            no: l.no.trim() || "-",
            alley: l.alley.trim() || null,
            road: l.road.trim() || null,
            subdistrict: l.subdistrict.trim(),
            district: l.district.trim(),
            province: l.province.trim(),
            location_type: sameLocation ? "both" : "meetup",
          })),
          ...(sameLocation
            ? []
            : returnLocations.map((l) => ({
                description: l.description.trim() || "จุดนัดคืนที่ตกลงกัน",
                no: l.no.trim() || "-",
                alley: l.alley.trim() || null,
                road: l.road.trim() || null,
                subdistrict: l.subdistrict.trim(),
                district: l.district.trim(),
                province: l.province.trim(),
                location_type: "return",
              }))),
        ],
        availabilityStart,
        availabilityEnd,
        conditions: conditions.filter(Boolean),
      };

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.message || data.error || "เกิดข้อผิดพลาดในการลงประกาศสินค้า",
        );
      }

      setSuccessMessage("ลงประกาศสินค้าสำเร็จเรียบร้อยแล้ว!");
      const createdItemId = data.itemId || data.data?.itemId;

      setTimeout(() => {
        if (createdItemId) {
          router.push(`/product/${createdItemId}`);
        } else {
          router.push("/");
        }
      }, 1200);
    } catch (err: any) {
      console.error("Error posting product:", err);
      setErrorMessage(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav
        aria-label="เส้นทางนำทาง"
        className="mb-4 flex items-center gap-2 text-xs text-slate-500"
      >
        <Link href="/" className="transition hover:text-[#1b3554]">
          หน้าแรก
        </Link>
        <span>/</span>
        <Link href="/lender" className="transition hover:text-[#1b3554]">
          ผู้ให้เช่า
        </Link>
        <span>/</span>
        <span className="font-semibold text-[#1b3554]">ลงประกาศสินค้าใหม่</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#c0e6fd]/30 text-[#1b3554]">
              <Sparkles className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              ลงประกาศให้เช่าอุปกรณ์
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            กรอกรายละเอียดอุปกรณ์ กำหนดราคา และสถานที่นัดรับเพื่อเปิดให้เช่าบน
            CHAOCHAO
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#1b3554]"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับไปแดชบอร์ด
        </Link>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: ข้อมูลสินค้า */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
            <Tag className="h-5 w-5 text-sky-600" />
            <h2 className="text-lg font-bold text-slate-900">
              1. ข้อมูลพื้นฐานอุปกรณ์
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ชื่ออุปกรณ์ / สินค้า <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="เช่น Sony Alpha A7 IV พร้อมเลนส์ 24-70mm GM II"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  หมวดหมู่สินค้า <span className="text-rose-500">*</span>
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none focus:ring-2 focus:ring-sky-100"
                >
                  {categories.map((c) => (
                    <option key={c.category_id} value={c.category_id}>
                      {c.category_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ราคาประเมินอุปกรณ์ (บาท){" "}
                  <span className="text-slate-400 font-normal">
                    (ไม่บังคับ)
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={originalPrice}
                  onChange={(e) => setOriginalPrice(e.target.value)}
                  placeholder="เช่น 75000"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                รายละเอียดและคุณสมบัติอุปกรณ์
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ระบุสเปก สภาพการใช้งาน อุปกรณ์เสริมที่มีให้ในเซ็ต (แบตเตอรี่, เมมโมรี่การ์ด, กระเป๋า ฯลฯ)"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>
          </div>
        </section>

        {/* Section 2: ราคาและเงินประกัน */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">
              2. อัตราค่าเช่าและเงินประกัน
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ค่าเช่าต่อวัน (บาท / วัน){" "}
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  required
                  value={rentalFeePerDay}
                  onChange={(e) => setRentalFeePerDay(e.target.value)}
                  placeholder="เช่น 850"
                  className="w-full rounded-xl border border-slate-200 pl-4 pr-12 py-3 text-sm font-semibold text-slate-900 transition focus:border-[#1b3554] focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
                <span className="absolute right-4 top-3.5 text-xs font-medium text-slate-400">
                  ฿ / วัน
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                เงินประกัน / มัดจำ (บาท){" "}
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  required
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="เช่น 3000"
                  className="w-full rounded-xl border border-slate-200 pl-4 pr-12 py-3 text-sm font-semibold text-slate-900 transition focus:border-[#1b3554] focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
                <span className="absolute right-4 top-3.5 text-xs font-medium text-slate-400">
                  ฿
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-emerald-50/70 p-3.5 text-xs text-emerald-800 border border-emerald-100">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p>
              เงินประกันจะถูกพักไว้ในระบบอย่างปลอดภัย
              และจะถูกโอนคืนให้ผู้เช่าเมื่อส่งคืนอุปกรณ์เสร็จสมบูรณ์
            </p>
          </div>
        </section>

        {/* Section 3: รูปภาพอุปกรณ์ */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
            <div className="flex items-center gap-2.5">
              <Camera className="h-5 w-5 text-sky-600" />
              <h2 className="text-lg font-bold text-slate-900">
                3. รูปภาพอุปกรณ์
              </h2>
            </div>
            <span className="text-xs text-slate-400">ภาพตัวอย่างสินค้า</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-5">
            {/* กล่องรูปภาพ Placeholder เหมือนในรูป */}
            <div className="relative flex aspect-square w-48 sm:w-56 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-[#eaf0f6] shadow-sm">
              <Package className="h-20 w-20 text-[#a0b5ce]" strokeWidth={1.5} />
            </div>

            {/* กล่องปุ่มเพิ่มรูป (กดแล้วยังไม่มีอะไรเกิดขึ้นตามต้องการ) */}
            <div className="flex flex-1 flex-col justify-center space-y-3 w-full">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                }}
                className="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-7 text-center transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition group-hover:scale-105">
                  <Plus className="h-5 w-5 text-slate-600" />
                </div>
                <span className="mt-3 text-sm font-semibold text-slate-700">
                  เพิ่มรูปภาพอุปกรณ์
                </span>
                <span className="mt-1 text-xs text-slate-400">
                  รองรับไฟล์ PNG, JPG หรือ WEBP (ขนาดไม่เกิน 5MB)
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Section 4: สถานที่นัดรับและวันว่าง */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
            <MapPin className="h-5 w-5 text-sky-600" />
            <h2 className="text-lg font-bold text-slate-900">
              4. สถานที่นัดรับและช่วงเวลาให้เช่า
            </h2>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sameLocation}
                onChange={(e) => setSameLocation(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm font-semibold text-slate-700">
                สถานที่นัดรับและนัดคืนเป็นที่เดียวกัน
              </span>
            </label>

            {/* จุดนัดรับ */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-700">
                {sameLocation ? "จุดนัดรับ–คืนอุปกรณ์" : "จุดนัดรับอุปกรณ์"}{" "}
                <span className="text-rose-500">*</span>
              </p>
              {meetupLocations.map((loc, i) => (
                <div
                  key={i}
                  className="space-y-3 rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="text"
                      required
                      value={loc.description}
                      onChange={(e) =>
                        updateLocation(
                          meetupLocations,
                          setMeetupLocations,
                          i,
                          "description",
                          e.target.value,
                        )
                      }
                      placeholder="เช่น BTS สยาม / ห้างเซ็นทรัลเวิลด์ / บริเวณอนุสาวรีย์ชัยฯ"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                    {meetupLocations.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          removeLocation(meetupLocations, setMeetupLocations, i)
                        }
                        className="mt-1 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      placeholder="บ้านเลขที่"
                      value={loc.no}
                      onChange={(e) =>
                        updateLocation(
                          meetupLocations,
                          setMeetupLocations,
                          i,
                          "no",
                          e.target.value,
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="ซอย"
                      value={loc.alley}
                      onChange={(e) =>
                        updateLocation(
                          meetupLocations,
                          setMeetupLocations,
                          i,
                          "alley",
                          e.target.value,
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="ถนน"
                      value={loc.road}
                      onChange={(e) =>
                        updateLocation(
                          meetupLocations,
                          setMeetupLocations,
                          i,
                          "road",
                          e.target.value,
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      placeholder="จังหวัด"
                      value={loc.province}
                      onChange={(e) =>
                        updateLocation(
                          meetupLocations,
                          setMeetupLocations,
                          i,
                          "province",
                          e.target.value,
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="เขต / อำเภอ"
                      value={loc.district}
                      onChange={(e) =>
                        updateLocation(
                          meetupLocations,
                          setMeetupLocations,
                          i,
                          "district",
                          e.target.value,
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="แขวง / ตำบล"
                      value={loc.subdistrict}
                      onChange={(e) =>
                        updateLocation(
                          meetupLocations,
                          setMeetupLocations,
                          i,
                          "subdistrict",
                          e.target.value,
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addLocation(meetupLocations, setMeetupLocations)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-[#1b3554] hover:text-[#1b3554]"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่มสถานที่นัดรับ
              </button>
            </div>

            {/* จุดนัดคืน (แยกก็ต่อเมื่อไม่ติ๊ก "ที่เดียวกัน") */}
            {!sameLocation && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700">
                  จุดนัดคืนอุปกรณ์ <span className="text-rose-500">*</span>
                </p>
                {returnLocations.map((loc, i) => (
                  <div
                    key={i}
                    className="space-y-3 rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="text"
                        required
                        value={loc.description}
                        onChange={(e) =>
                          updateLocation(
                            returnLocations,
                            setReturnLocations,
                            i,
                            "description",
                            e.target.value,
                          )
                        }
                        placeholder="เช่น BTS สยาม / ห้างเซ็นทรัลเวิลด์ / บริเวณอนุสาวรีย์ชัยฯ"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none focus:ring-2 focus:ring-sky-100"
                      />
                      {returnLocations.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            removeLocation(
                              returnLocations,
                              setReturnLocations,
                              i,
                            )
                          }
                          className="mt-1 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <input
                        type="text"
                        placeholder="บ้านเลขที่"
                        value={loc.no}
                        onChange={(e) =>
                          updateLocation(
                            returnLocations,
                            setReturnLocations,
                            i,
                            "no",
                            e.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="ซอย"
                        value={loc.alley}
                        onChange={(e) =>
                          updateLocation(
                            returnLocations,
                            setReturnLocations,
                            i,
                            "alley",
                            e.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="ถนน"
                        value={loc.road}
                        onChange={(e) =>
                          updateLocation(
                            returnLocations,
                            setReturnLocations,
                            i,
                            "road",
                            e.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <input
                        type="text"
                        placeholder="จังหวัด"
                        value={loc.province}
                        onChange={(e) =>
                          updateLocation(
                            returnLocations,
                            setReturnLocations,
                            i,
                            "province",
                            e.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="เขต / อำเภอ"
                        value={loc.district}
                        onChange={(e) =>
                          updateLocation(
                            returnLocations,
                            setReturnLocations,
                            i,
                            "district",
                            e.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="แขวง / ตำบล"
                        value={loc.subdistrict}
                        onChange={(e) =>
                          updateLocation(
                            returnLocations,
                            setReturnLocations,
                            i,
                            "subdistrict",
                            e.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    addLocation(returnLocations, setReturnLocations)
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-[#1b3554] hover:text-[#1b3554]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  เพิ่มสถานที่นัดคืน
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  วันที่เริ่มต้นเปิดให้เช่า{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={availabilityStart}
                  onChange={(e) => setAvailabilityStart(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  วันที่สิ้นสุดเปิดให้เช่า{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={availabilityEnd}
                  onChange={(e) => setAvailabilityEnd(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: เงื่อนไขการเช่า */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
            <div className="flex items-center gap-2.5">
              <FileText className="h-5 w-5 text-sky-600" />
              <h2 className="text-lg font-bold text-slate-900">
                5. เงื่อนไขและข้อตกลงการเช่า
              </h2>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            {conditions.map((c, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50/50 px-4 py-2.5"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{c}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveCondition(idx)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newCondition}
              onChange={(e) => setNewCondition(e.target.value)}
              placeholder="พิมพ์เงื่อนไขเพิ่มเติม เช่น ห้ามนำไปใช้งานในสถานที่เปียกชื้น"
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 transition focus:border-[#1b3554] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddCondition}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-900"
            >
              <Plus className="h-4 w-4" />
              เพิ่มเงื่อนไข
            </button>
          </div>
        </section>

        {/* Error / Success Alerts */}
        {errorMessage && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 shadow-sm flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 shadow-sm flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Submit Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-center text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ยกเลิก
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b3554] to-[#3f6593] px-8 py-3.5 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/15 transition duration-200 hover:from-[#000f22] hover:to-[#1b3554] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>กำลังบันทึกและลงประกาศ...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>ลงประกาศสินค้าทันที</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
