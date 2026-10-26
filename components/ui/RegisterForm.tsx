"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  CreditCard,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Upload,
  Trash2,
  Camera,
  Landmark,
  Mail,
  Phone,
} from "lucide-react";
import {
  registerSchema,
  type RegisterFormData,
} from "@/lib/validations/register";

export default function RegisterForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstname: "",
      lastname: "",
      username: "",
      phone: "",
      email: "",
      password: "",
      nationalId: "",
    },
  });

  const selectedRole = watch("role");
  const isLenderRole = selectedRole === "lender" || selectedRole === "both";

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง (PNG, JPG, WEBP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("ขนาดไฟล์ต้องไม่เกิน 5 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAvatarPreview(result);
      setValue("avatarImageUrl", result, { shouldValidate: true });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview(null);
    setValue("avatarImageUrl", undefined, { shouldValidate: true });
  };

  const handleIdCardFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง (PNG, JPG, WEBP)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("ขนาดไฟล์ต้องไม่เกิน 10 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setIdCardPreview(result);
      setValue("idCardImageUrl", result, { shouldValidate: true });
    };
    reader.readAsDataURL(file);
  };

  const handleSelfieFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง (PNG, JPG, WEBP)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("ขนาดไฟล์ต้องไม่เกิน 10 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setSelfiePreview(result);
      setValue("idCardSelfieImageUrl", result, { shouldValidate: true });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveIdCard = () => {
    setIdCardPreview(null);
    setValue("idCardImageUrl", undefined, { shouldValidate: true });
  };

  const handleRemoveSelfie = () => {
    setSelfiePreview(null);
    setValue("idCardSelfieImageUrl", undefined, { shouldValidate: true });
  };

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok) {
        setServerError(result.message ?? "เกิดข้อผิดพลาดในการสมัครสมาชิก");
        return;
      }

      alert("สมัครสมาชิกสำเร็จ! กำลังนำท่านไปยังหน้าเข้าสู่ระบบ");
      router.push("/login");
    } catch (error) {
      console.error(error);
      setServerError("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์");
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-white">
      {/* ฝั่งซ้าย: Branding (แสดงผลเฉพาะจอ Desktop lg ขึ้นไป) */}
      <div className="relative hidden w-1/2 flex-col items-center justify-center bg-gradient-to-br from-[#000f22] via-[#3f6593] to-[#1b3554] p-12 text-white lg:flex">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/10 backdrop-blur-sm">
            <img
              src="/logo.svg"
              alt="ChaoChao"
              className="h-full w-full rounded-2xl object-cover"
            />
          </div>
          <h2 className="text-3xl font-bold">สร้างบัญชีใหม่</h2>
          <p className="mt-4 text-[#c0e6fd]">
            เริ่มต้นใช้งานระบบจัดการเช่า/ให้เช่า ของอิเล็กทรอนิกส์
          </p>
        </div>
      </div>

      {/* ฝั่งขวา: Form */}
      <div className="flex w-full flex-1 items-center justify-center bg-slate-50 p-6 lg:w-1/2 lg:bg-white lg:p-16">
        <div className="w-full max-w-md">
          {/* โลโก้ (แสดงเฉพาะจอมือถือ) */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:items-start">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#1b3554] lg:hidden">
              <img
                src="/logo.svg"
                alt="ChaoChao"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="text-center lg:text-left">
              <h1 className="text-2xl font-bold text-[#000f22] lg:text-3xl">
                สมัครสมาชิก
              </h1>
              <p className="mt-1 text-sm text-[#5b86b6]">
                กรุณากรอกข้อมูลเพื่อสร้างบัญชีผู้ใช้งาน
              </p>
            </div>
          </div>

          {/* Server Error Banner */}
          {serverError && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm font-medium text-red-600">
                {serverError}
              </p>
            </div>
          )}

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            {/* Avatar Upload (Optional) */}
            <div className="flex flex-col items-center justify-center pb-1">
              <div className="relative group">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[#c0e6fd] bg-[#c0e6fd]/20 text-[#3f6593] shadow-sm transition hover:border-[#3f6593]">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar Preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Camera className="h-7 w-7 text-[#5b86b6]" />
                  )}
                </div>

                <label
                  htmlFor="register-avatar-input"
                  className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100"
                  title="เลือกรูปโปรไฟล์"
                >
                  <Camera className="h-5 w-5 text-white" />
                </label>

                <input
                  id="register-avatar-input"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />

                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="absolute -top-1 -right-1 rounded-full bg-red-600 p-1 text-white shadow-sm hover:bg-red-700"
                    title="ลบรูป"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <label
                htmlFor="register-avatar-input"
                className="mt-2 cursor-pointer text-xs font-semibold text-[#3f6593] hover:underline"
              >
                {avatarPreview ? "เปลี่ยนรูปโปรไฟล์" : "+ รูปภาพโปรไฟล์ (ไม่บังคับ)"}
              </label>
            </div>

            {/* ชื่อ-นามสกุล (FR-03 / FR-05) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="firstname"
                  className="mb-1.5 block text-sm font-medium text-[#1b3554]"
                >
                  ชื่อจริง
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                  <input
                    id="firstname"
                    type="text"
                    autoComplete="given-name"
                    placeholder="กรอกชื่อจริง..."
                    {...register("firstname")}
                    className={`w-full rounded-xl border-2 bg-[#c0e6fd]/10 py-3 pl-10 pr-3 text-sm text-[#000f22] outline-none transition placeholder:text-[#80aad3] focus:ring-2 ${
                      errors.firstname
                        ? "border-red-500 focus:ring-red-100"
                        : "border-[#c0e6fd] focus:border-[#3f6593] focus:ring-[#c0e6fd]/50"
                    }`}
                  />
                </div>
                {errors.firstname && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {errors.firstname.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="lastname"
                  className="mb-1.5 block text-sm font-medium text-[#1b3554]"
                >
                  นามสกุล
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                  <input
                    id="lastname"
                    type="text"
                    autoComplete="family-name"
                    placeholder="กรอกนามสกุล..."
                    {...register("lastname")}
                    className={`w-full rounded-xl border-2 bg-[#c0e6fd]/10 py-3 pl-10 pr-3 text-sm text-[#000f22] outline-none transition placeholder:text-[#80aad3] focus:ring-2 ${
                      errors.lastname
                        ? "border-red-500 focus:ring-red-100"
                        : "border-[#c0e6fd] focus:border-[#3f6593] focus:ring-[#c0e6fd]/50"
                    }`}
                  />
                </div>
                {errors.lastname && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {errors.lastname.message}
                  </p>
                )}
              </div>
            </div>

            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-sm font-medium text-[#1b3554]"
              >
                ชื่อผู้ใช้ (Username)
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="none"
                  placeholder="กรอกชื่อผู้ใช้ (a-z, 0-9, _)"
                  {...register("username")}
                  className={`w-full rounded-xl border-2 bg-[#c0e6fd]/10 py-3 pl-10 pr-3 text-sm text-[#000f22] outline-none transition placeholder:text-[#80aad3] focus:ring-2 ${
                    errors.username
                      ? "border-red-500 focus:ring-red-100"
                      : "border-[#c0e6fd] focus:border-[#3f6593] focus:ring-[#c0e6fd]/50"
                  }`}
                />
              </div>
              {errors.username && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.username.message}
                </p>
              )}
            </div>

            {/* เบอร์โทรศัพท์ & อีเมล (FR-03 / FR-05) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="phone"
                  className="mb-1.5 block text-sm font-medium text-[#1b3554]"
                >
                  เบอร์โทรศัพท์
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    placeholder="เช่น 0812345678"
                    {...register("phone")}
                    className={`w-full rounded-xl border-2 bg-[#c0e6fd]/10 py-3 pl-10 pr-3 text-sm text-[#000f22] outline-none transition placeholder:text-[#80aad3] focus:ring-2 ${
                      errors.phone
                        ? "border-red-500 focus:ring-red-100"
                        : "border-[#c0e6fd] focus:border-[#3f6593] focus:ring-[#c0e6fd]/50"
                    }`}
                  />
                </div>
                {errors.phone && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {errors.phone.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-[#1b3554]"
                >
                  อีเมล
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    placeholder="name@example.com"
                    {...register("email")}
                    className={`w-full rounded-xl border-2 bg-[#c0e6fd]/10 py-3 pl-10 pr-3 text-sm text-[#000f22] outline-none transition placeholder:text-[#80aad3] focus:ring-2 ${
                      errors.email
                        ? "border-red-500 focus:ring-red-100"
                        : "border-[#c0e6fd] focus:border-[#3f6593] focus:ring-[#c0e6fd]/50"
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {errors.email.message}
                  </p>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[#1b3554]"
              >
                รหัสผ่าน
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="อย่างน้อย 8 ตัวอักษร (A-Z, a-z, 0-9)"
                  {...register("password")}
                  className={`w-full rounded-xl border-2 bg-[#c0e6fd]/10 py-3 pl-10 pr-11 text-sm text-[#000f22] outline-none transition placeholder:text-[#80aad3] focus:ring-2 ${
                    errors.password
                      ? "border-red-500 focus:ring-red-100"
                      : "border-[#c0e6fd] focus:border-[#3f6593] focus:ring-[#c0e6fd]/50"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5b86b6] hover:text-[#1b3554]"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* National ID */}
            <div>
              <label
                htmlFor="nationalId"
                className="mb-1.5 block text-sm font-medium text-[#1b3554]"
              >
                เลขบัตรประชาชน
              </label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                <input
                  id="nationalId"
                  type="text"
                  inputMode="numeric"
                  maxLength={13}
                  placeholder="กรอกเลขบัตรประชาชน 13 หลัก"
                  {...register("nationalId")}
                  className={`w-full rounded-xl border-2 bg-[#c0e6fd]/10 py-3 pl-10 pr-3 text-sm text-[#000f22] outline-none transition placeholder:text-[#80aad3] focus:ring-2 ${
                    errors.nationalId
                      ? "border-red-500 focus:ring-red-100"
                      : "border-[#c0e6fd] focus:border-[#3f6593] focus:ring-[#c0e6fd]/50"
                  }`}
                />
              </div>
              {errors.nationalId && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.nationalId.message}
                </p>
              )}
            </div>

            {/* Role - segmented toggle */}
            <div>
              <p className="mb-1.5 text-sm font-medium text-[#1b3554]">
                ประเภทผู้ใช้งาน
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="relative cursor-pointer">
                  <input
                    type="radio"
                    value="renter"
                    className="peer sr-only"
                    {...register("role")}
                  />
                  <div className="rounded-xl border-2 border-[#c0e6fd] py-3 text-center text-sm font-medium text-[#3f6593] transition hover:border-[#3f6593] peer-checked:border-[#1b3554] peer-checked:bg-[#1b3554] peer-checked:text-white">
                    ผู้เช่า
                  </div>
                </label>
                <label className="relative cursor-pointer">
                  <input
                    type="radio"
                    value="lender"
                    className="peer sr-only"
                    {...register("role")}
                  />
                  <div className="rounded-xl border-2 border-[#c0e6fd] py-3 text-center text-sm font-medium text-[#3f6593] transition hover:border-[#3f6593] peer-checked:border-[#1b3554] peer-checked:bg-[#1b3554] peer-checked:text-white">
                    ผู้ให้เช่า
                  </div>
                </label>

                <label className="relative col-span-2 cursor-pointer">
                  <input
                    type="radio"
                    value="both"
                    className="peer sr-only"
                    {...register("role")}
                  />
                  <div className="rounded-xl border-2 border-[#c0e6fd] py-3 text-center text-sm font-medium text-[#3f6593] transition hover:border-[#3f6593] peer-checked:border-[#1b3554] peer-checked:bg-[#1b3554] peer-checked:text-white">
                    ทั้งผู้เช่าและผู้ให้เช่า
                  </div>
                </label>
              </div>
              {errors.role && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.role.message}
                </p>
              )}
            </div>

            {/* KYC Documents for Lenders (FR-05) */}
            {isLenderRole && (
              <div className="space-y-4 rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-[#1b3554]" />
                  <div>
                    <h3 className="text-sm font-bold text-[#000f22]">
                      เอกสารยืนยันตัวตนผู้ให้เช่า (KYC) *
                    </h3>
                    <p className="text-xs text-slate-500">
                      ข้อมูลจะถูกส่งให้แอดมินตรวจสอบตัวตนของผู้ให้เช่าอย่างปลอดภัย
                    </p>
                  </div>
                </div>

                {/* 1. รูปบัตรประชาชน */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1b3554]">
                    1. ภาพถ่ายบัตรประชาชน (เห็นข้อมูลชัดเจน) *
                  </label>
                  {idCardPreview ? (
                    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                      <img
                        src={idCardPreview}
                        alt="ID Card Preview"
                        className="h-32 w-full rounded-lg object-contain bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveIdCard}
                        className="absolute right-3 top-3 rounded-lg bg-red-600/90 p-1.5 text-white shadow-sm transition hover:bg-red-700"
                        title="ลบรูป"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="id-card-input"
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white/80 py-4 transition hover:border-[#3f6593] hover:bg-white ${
                        errors.idCardImageUrl
                          ? "border-red-400"
                          : "border-[#c0e6fd]"
                      }`}
                    >
                      <Upload className="h-6 w-6 text-[#5b86b6]" />
                      <span className="mt-1 text-xs font-medium text-[#3f6593]">
                        คลิกเพื่ออัปโหลดภาพบัตรประชาชน
                      </span>
                      <span className="text-[10px] text-slate-400">
                        PNG, JPG หรือ WEBP (ไม่เกิน 10MB)
                      </span>
                      <input
                        id="id-card-input"
                        type="file"
                        accept="image/*"
                        onChange={handleIdCardFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                  {errors.idCardImageUrl && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.idCardImageUrl.message}
                    </p>
                  )}
                </div>

                {/* 2. รูปเซลฟี่คู่กับบัตรประชาชน */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1b3554]">
                    2. ภาพถ่ายบุคคลคู่กับบัตรประชาชน *
                  </label>
                  {selfiePreview ? (
                    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                      <img
                        src={selfiePreview}
                        alt="Selfie Preview"
                        className="h-32 w-full rounded-lg object-contain bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveSelfie}
                        className="absolute right-3 top-3 rounded-lg bg-red-600/90 p-1.5 text-white shadow-sm transition hover:bg-red-700"
                        title="ลบรูป"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="selfie-input"
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white/80 py-4 transition hover:border-[#3f6593] hover:bg-white ${
                        errors.idCardSelfieImageUrl
                          ? "border-red-400"
                          : "border-[#c0e6fd]"
                      }`}
                    >
                      <Camera className="h-6 w-6 text-[#5b86b6]" />
                      <span className="mt-1 text-xs font-medium text-[#3f6593]">
                        คลิกเพื่ออัปโหลดรูปบุคคลคู่กับบัตรประชาชน
                      </span>
                      <span className="text-[10px] text-slate-400">
                        PNG, JPG หรือ WEBP (ไม่เกิน 10MB)
                      </span>
                      <input
                        id="selfie-input"
                        type="file"
                        accept="image/*"
                        onChange={handleSelfieFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                  {errors.idCardSelfieImageUrl && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.idCardSelfieImageUrl.message}
                    </p>
                  )}
                </div>

                {/* 3. ข้อมูลบัญชีธนาคารสำหรับรับเงินโอนค่าเช่า */}
                <div className="pt-3 border-t border-sky-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Landmark className="h-4 w-4 text-[#1b3554]" />
                    <div>
                      <h4 className="text-xs font-bold text-[#000f22]">
                        3. บัญชีธนาคาร (สำหรับรับเงินโอนค่าเช่า) *
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        รายได้จากการปล่อยเช่าจะถูกโอนเข้าบัญชีนี้หลังแอดมินตรวจสอบ
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Bank Name */}
                    <div>
                      <label htmlFor="bankName" className="mb-1 block text-xs font-semibold text-[#1b3554]">
                        ธนาคาร *
                      </label>
                      <select
                        id="bankName"
                        {...register("bankName")}
                        className={`w-full rounded-xl border-2 bg-white py-2.5 px-3 text-xs text-[#000f22] outline-none transition focus:ring-2 ${
                          errors.bankName
                            ? "border-red-500 focus:ring-red-100"
                            : "border-[#c0e6fd] focus:border-[#3f6593] focus:ring-[#c0e6fd]/50"
                        }`}
                      >
                        <option value="">-- เลือกธนาคาร --</option>
                        <option value="กสิกรไทย">ธนาคารกสิกรไทย (KBANK)</option>
                        <option value="ไทยพาณิชย์">ธนาคารไทยพาณิชย์ (SCB)</option>
                        <option value="กรุงเทพ">ธนาคารกรุงเทพ (BBL)</option>
                        <option value="กรุงไทย">ธนาคารกรุงไทย (KTB)</option>
                        <option value="กรุงศรีอยุธยา">ธนาคารกรุงศรีอยุธยา (BAY)</option>
                        <option value="ทหารไทยธนชาต">ธนาคารทหารไทยธนชาต (TTB)</option>
                        <option value="ออมสิน">ธนาคารออมสิน (GSB)</option>
                        <option value="ธ.ก.ส.">ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)</option>
                        <option value="ยูโอบี">ธนาคารยูโอบี (UOB)</option>
                        <option value="อื่นๆ">ธนาคารอื่นๆ</option>
                      </select>
                      {errors.bankName && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {errors.bankName.message}
                        </p>
                      )}
                    </div>

                    {/* Account Number */}
                    <div>
                      <label htmlFor="accountNumber" className="mb-1 block text-xs font-semibold text-[#1b3554]">
                        เลขที่บัญชี *
                      </label>
                      <input
                        id="accountNumber"
                        type="text"
                        inputMode="numeric"
                        maxLength={15}
                        placeholder="กรอกเลขที่บัญชีธนาคาร (เฉพาะตัวเลข เช่น 1234567890)"
                        {...register("accountNumber")}
                        className={`w-full rounded-xl border-2 bg-white py-2.5 px-3 text-xs text-[#000f22] outline-none transition placeholder:text-[#80aad3] focus:ring-2 ${
                          errors.accountNumber
                            ? "border-red-500 focus:ring-red-100"
                            : "border-[#c0e6fd] focus:border-[#3f6593] focus:ring-[#c0e6fd]/50"
                        }`}
                      />
                      {errors.accountNumber && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {errors.accountNumber.message}
                        </p>
                      )}
                    </div>

                    {/* Account Name */}
                    <div>
                      <label htmlFor="accountName" className="mb-1 block text-xs font-semibold text-[#1b3554]">
                        ชื่อบัญชี (ตรงตามสมุดบัญชี) *
                      </label>
                      <input
                        id="accountName"
                        type="text"
                        placeholder="เช่น นาย สมชาย ใจดี"
                        {...register("accountName")}
                        className={`w-full rounded-xl border-2 bg-white py-2.5 px-3 text-xs text-[#000f22] outline-none transition placeholder:text-[#80aad3] focus:ring-2 ${
                          errors.accountName
                            ? "border-red-500 focus:ring-red-100"
                            : "border-[#c0e6fd] focus:border-[#3f6593] focus:ring-[#c0e6fd]/50"
                        }`}
                      />
                      {errors.accountName && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {errors.accountName.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-gradient-to-r from-[#3f6593] to-[#1b3554] py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#1b3554]/20 transition hover:from-[#1b3554] hover:to-[#000f22] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
            </button>

            {/* ลิงก์ไปหน้า Login */}
            <p className="text-center text-sm text-[#5b86b6]">
              มีบัญชีอยู่แล้ว?{" "}
              <a
                href="/login"
                className="font-medium text-[#1b3554] hover:underline"
              >
                เข้าสู่ระบบ
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
