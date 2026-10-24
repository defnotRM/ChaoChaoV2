"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  FileText,
  Save,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Camera,
  Upload,
  Trash2,
  KeyRound,
  ImageIcon,
  Phone,
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  Building,
  Clock,
  ExternalLink,
  X,
  Edit3,
} from "lucide-react";
import Link from "next/link";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [bannerUrl, setBannerUrl] = useState<string>("");
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [bannerImgError, setBannerImgError] = useState(false);
  const [idCardImgError, setIdCardImgError] = useState(false);
  const [selfieImgError, setSelfieImgError] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [status, setStatus] = useState("Active");

  // Notifications
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [generalSuccess, setGeneralSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  // KYC & Bank Account State
  const [identityStatus, setIdentityStatus] = useState<string>("unverified");
  const [nationalId, setNationalId] = useState<string>("");
  const [idCardUrl, setIdCardUrl] = useState<string | null>(null);
  const [idCardSelfieUrl, setIdCardSelfieUrl] = useState<string | null>(null);
  const [bankAccount, setBankAccount] = useState<{
    id: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    verificationStatus: string;
  } | null>(null);

  // KYC Modal State
  const [showKycModal, setShowKycModal] = useState(false);
  const [kycNationalId, setKycNationalId] = useState("");
  const [kycBankName, setKycBankName] = useState("");
  const [kycAccountNumber, setKycAccountNumber] = useState("");
  const [kycAccountName, setKycAccountName] = useState("");
  const [kycIdCardFile, setKycIdCardFile] = useState<File | null>(null);
  const [kycSelfieFile, setKycSelfieFile] = useState<File | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycModalError, setKycModalError] = useState<string | null>(null);
  const [kycSuccessNotice, setKycSuccessNotice] = useState<string | null>(null);

  // Image Preview Lightbox State
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // Delete Account State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reset image error states when URLs change
  useEffect(() => {
    setAvatarImgError(false);
  }, [avatarUrl]);

  useEffect(() => {
    setBannerImgError(false);
  }, [bannerUrl]);

  useEffect(() => {
    setIdCardImgError(false);
  }, [idCardUrl]);

  useEffect(() => {
    setSelfieImgError(false);
  }, [idCardSelfieUrl]);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/profile", {
        cache: "no-store",
        headers: { Pragma: "no-cache" },
      });
      if (res.status === 401) {
        setUsername("ผู้ใช้งานทดลอง (Guest)");
        setBio("ยินดีต้อนรับสู่ระบบ ChaoChao");
        setRoles(["ผู้เช่า (Renter)", "ผู้ให้เช่า (Lender)"]);
        setStatus("Active");
        return;
      }

      const data = await res.json();
      if (res.ok && data.user) {
        setUsername(data.user.username || "");
        setBio(data.user.bio || "");
        setAvatarUrl(data.user.avatarUrl || "");
        setBannerUrl(data.user.bannerUrl || "");
        setRoles(data.user.roles || []);
        setStatus(data.user.status || "Active");
        setNationalId(data.user.nationalId || "");
        setIdentityStatus(data.user.identityVerificationStatus || "unverified");
        setIdCardUrl(data.user.idCardUrl || null);
        setIdCardSelfieUrl(data.user.idCardSelfieUrl || null);
        setBankAccount(data.user.bankAccount || null);

        if (Array.isArray(data.user.phones)) {
          setPhone1(data.user.phones[0] || "");
          setPhone2(data.user.phones[1] || "");
        }
      } else {
        setGeneralError(data.message || "ไม่สามารถโหลดข้อมูลโปรไฟล์ได้");
      }
    } catch (err) {
      console.error(err);
      setGeneralError("เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [router]);

  // Upload Avatar
  const handleAvatarFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarNotice("กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง (JPG, PNG, WEBP, GIF)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarNotice("ขนาดไฟล์ต้องไม่เกิน 5 MB");
      return;
    }

    setAvatarNotice(null);
    setUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setAvatarNotice(result.message || "อัปโหลดรูปภาพไม่สำเร็จ");
        return;
      }

      setAvatarUrl(result.avatarUrl);
      setAvatarNotice("อัปโหลดรูปภาพโปรไฟล์สำเร็จ!");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth-state-change"));
      }
      router.refresh();
    } catch (err) {
      console.error(err);
      setAvatarNotice("เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Remove Avatar
  const handleRemoveAvatar = async () => {
    setAvatarNotice(null);
    setUploadingAvatar(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          bio,
          avatarUrl: "",
        }),
      });

      if (res.ok) {
        setAvatarUrl("");
        setAvatarNotice("ลบรูปโปรไฟล์เรียบร้อยแล้ว");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("auth-state-change"));
        }
        router.refresh();
      } else {
        const result = await res.json();
        setAvatarNotice(result.message || "ไม่สามารถลบรูปโปรไฟล์ได้");
      }
    } catch (err) {
      console.error(err);
      setAvatarNotice("เกิดข้อผิดพลาดในการลบรูปภาพ");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Upload Banner
  const handleBannerFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setBannerNotice("กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง (JPG, PNG, WEBP, GIF)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setBannerNotice("ขนาดไฟล์ต้องไม่เกิน 5 MB");
      return;
    }

    setBannerNotice(null);
    setUploadingBanner(true);

    try {
      const formData = new FormData();
      formData.append("banner", file);

      const res = await fetch("/api/profile/banner", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setBannerNotice(result.message || "อัปโหลดภาพแบนเนอร์ไม่สำเร็จ");
        return;
      }

      setBannerUrl(result.bannerUrl);
      setBannerNotice("อัปโหลดภาพแบนเนอร์สำเร็จ!");
      router.refresh();
    } catch (err) {
      console.error(err);
      setBannerNotice("เกิดข้อผิดพลาดในการอัปโหลดภาพแบนเนอร์");
    } finally {
      setUploadingBanner(false);
    }
  };

  // Remove Banner
  const handleRemoveBanner = async () => {
    setBannerNotice(null);
    setUploadingBanner(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          bio,
          bannerUrl: "",
        }),
      });

      if (res.ok) {
        setBannerUrl("");
        setBannerNotice("ลบภาพแบนเนอร์เรียบร้อยแล้ว");
        router.refresh();
      } else {
        const result = await res.json();
        setBannerNotice(result.message || "ไม่สามารถลบภาพแบนเนอร์ได้");
      }
    } catch (err) {
      console.error(err);
      setBannerNotice("เกิดข้อผิดพลาดในการลบภาพแบนเนอร์");
    } finally {
      setUploadingBanner(false);
    }
  };

  // 1. Save ONLY Username, Bio & Phones
  const handleSaveGeneralInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setGeneralSuccess(null);

    if (!username.trim()) {
      setGeneralError("กรุณากรอกชื่อผู้ใช้");
      return;
    }

    if (username.length < 4 || username.length > 20) {
      setGeneralError("ชื่อผู้ใช้ต้องมีความยาว 4 - 20 ตัวอักษร");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setGeneralError("ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษร a-z, A-Z, 0-9 และ _");
      return;
    }

    const p1 = phone1.trim().replace(/\D/g, "");
    const p2 = phone2.trim().replace(/\D/g, "");

    if (phone1.trim()) {
      if (p1.length !== 10) {
        setGeneralError("เบอร์โทรศัพท์ 1 ต้องมีความยาว 10 หลักพอดี (เฉพาะตัวเลข เช่น 0812345678)");
        return;
      }
    }

    if (phone2.trim()) {
      if (p2.length !== 10) {
        setGeneralError("เบอร์โทรศัพท์ 2 ต้องมีความยาว 10 หลักพอดี (เฉพาะตัวเลข เช่น 0898765432)");
        return;
      }
    }

    const phones = [p1, p2].filter(Boolean);

    setSavingGeneral(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          bio: bio.trim(),
          phones,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setGeneralError(result.message || "ไม่สามารถบันทึกข้อมูลได้");
        return;
      }

      setGeneralSuccess("บันทึกข้อมูลทั่วไปและเบอร์โทรศัพท์เรียบร้อยแล้ว!");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth-state-change"));
      }
      router.refresh();
    } catch (err) {
      console.error(err);
      setGeneralError("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์");
    } finally {
      setSavingGeneral(false);
    }
  };

  // 2. Save ONLY Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!newPassword) {
      setPasswordError("กรุณากรอกรหัสผ่านใหม่");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }

    if (
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword)
    ) {
      setPasswordError("รหัสผ่านต้องประกอบด้วยตัวพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          bio: bio.trim(),
          password: newPassword.trim(),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setPasswordError(result.message || "ไม่สามารถเปลี่ยนรหัสผ่านได้");
        return;
      }

      setPasswordSuccess("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error(err);
      setPasswordError("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์");
    } finally {
      setSavingPassword(false);
    }
  };

  // 3. Delete Account (Soft Delete)
  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setIsDeletingAccount(true);

    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setDeleteError(data.message || "ไม่สามารถลบบัญชีผู้ใช้ได้");
        setIsDeletingAccount(false);
        return;
      }

      // Sign out from Supabase client
      const supabase = createBrowserClient();
      await supabase.auth.signOut();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth-state-change"));
      }

      alert("ลบบัญชีผู้ใช้งานเรียบร้อยแล้ว ระบบจะนำคุณกลับสู่หน้าแรก");
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error(err);
      setDeleteError("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์");
      setIsDeletingAccount(false);
    }
  };

  // KYC Mask & Handlers
  const maskNationalId = (id: string) => {
    if (!id || id.length < 13) return id || "-";
    return `${id.slice(0, 1)}-${id.slice(1, 5)}-XXXXX-${id.slice(10, 12)}-${id.slice(12)}`;
  };

  const maskBankAccountNumber = (acc: string) => {
    if (!acc || acc.length < 6) return acc || "-";
    return `${acc.slice(0, 3)}-X-XX${acc.slice(-3)}`;
  };

  const handleOpenKycModal = () => {
    setKycNationalId(nationalId || "");
    setKycBankName(bankAccount?.bankName || "");
    setKycAccountNumber(bankAccount?.accountNumber || "");
    setKycAccountName(bankAccount?.accountName || "");
    setKycIdCardFile(null);
    setKycSelfieFile(null);
    setKycModalError(null);
    setShowKycModal(true);
  };

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycModalError(null);

    if (kycNationalId && kycNationalId.length !== 13) {
      setKycModalError("เลขประจำตัวประชาชนต้องมี 13 หลัก");
      return;
    }

    if (kycAccountNumber && !/^\d{8,15}$/.test(kycAccountNumber)) {
      setKycModalError("เลขที่บัญชีธนาคารต้องเป็นตัวเลข 8-15 หลัก");
      return;
    }

    setKycSubmitting(true);
    try {
      const formData = new FormData();
      if (kycNationalId) formData.append("nationalId", kycNationalId);
      if (kycBankName) formData.append("bankName", kycBankName);
      if (kycAccountNumber) formData.append("accountNumber", kycAccountNumber);
      if (kycAccountName) formData.append("accountName", kycAccountName);
      if (kycIdCardFile) formData.append("idCard", kycIdCardFile);
      if (kycSelfieFile) formData.append("selfie", kycSelfieFile);

      const res = await fetch("/api/profile/kyc", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) {
        setKycModalError(result.message || "เกิดข้อผิดพลาดในการส่งข้อมูล");
        return;
      }

      setKycSuccessNotice("ส่งข้อมูลยืนยันตัวตนเรียบร้อยแล้ว รอการตรวจสอบจากผู้ดูแลระบบ");
      setShowKycModal(false);
      await fetchProfile();
    } catch (err) {
      console.error(err);
      setKycModalError("เกิดข้อผิดพลาดในการส่งข้อมูล");
    } finally {
      setKycSubmitting(false);
    }
  };

  const roleLabels: Record<string, string> = {
    renter: "ผู้เช่า",
    lender: "ผู้ให้เช่า",
    admin: "ผู้ดูแลระบบ",
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#3f6593] border-t-transparent"></div>
          <p className="text-sm font-medium text-[#3f6593]">
            กำลังโหลดข้อมูลโปรไฟล์...
          </p>
        </div>
      </div>
    );
  }

  const initialLetter = username ? username[0].toUpperCase() : "U";

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#1b3554] transition hover:text-[#3f6593]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>กลับสู่หน้าหลัก</span>
        </Link>

        {/* ========================================================================= */}
        {/* Profile Card Header with Customizable Banner */}
        {/* ========================================================================= */}
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          {/* Narrow Banner with Upload Button */}
          <div className="group relative h-28 sm:h-36 w-full overflow-hidden bg-gradient-to-r from-[#000f22] via-[#1b3554] to-[#3f6593]">
            {bannerUrl && !bannerImgError ? (
              <img
                src={bannerUrl}
                alt="Cover Banner"
                className="h-full w-full object-cover"
                onError={() => setBannerImgError(true)}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-[#000f22] via-[#1b3554] to-[#3f6593]" />
            )}

            {/* Banner Action Buttons (Top Right) */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <label
                htmlFor="banner-upload-input"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-black/70 active:scale-95 shadow-sm"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>{uploadingBanner ? "กำลังอัปโหลด..." : "เปลี่ยนภาพแบนเนอร์"}</span>
              </label>

              {bannerUrl && (
                <button
                  type="button"
                  onClick={handleRemoveBanner}
                  disabled={uploadingBanner}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600/80 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-red-700 active:scale-95 shadow-sm disabled:opacity-50"
                  title="ลบภาพแบนเนอร์"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>ลบ</span>
                </button>
              )}
            </div>

            <input
              id="banner-upload-input"
              type="file"
              accept="image/*"
              onChange={handleBannerFileChange}
              className="hidden"
            />
          </div>

          {/* Profile Details Bar */}
          <div className="relative px-6 pb-6 pt-2 sm:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              {/* Circular Avatar + Name/Role aligned cleanly */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5">
                {/* Avatar with Camera Trigger */}
                <div className="group relative -mt-12 sm:-mt-16 flex h-24 w-24 sm:h-28 sm:w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-2xl sm:text-3xl font-bold text-white shadow-xl ring-4 ring-white">
                  {avatarUrl && !avatarImgError ? (
                    <img
                      src={avatarUrl}
                      alt={username}
                      className="h-full w-full object-cover"
                      onError={() => setAvatarImgError(true)}
                    />
                  ) : (
                    <span>{initialLetter}</span>
                  )}

                  {/* Hover Overlay */}
                  <label
                    htmlFor="avatar-upload-input"
                    className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100"
                  >
                    <Camera className="h-5 w-5 text-white" />
                    <span className="mt-0.5 text-[10px] font-medium text-white">
                      เปลี่ยนรูป
                    </span>
                  </label>
                </div>

                <input
                  id="avatar-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />

                {/* Name, Roles, Status */}
                <div className="pb-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                      {username || "ผู้ใช้งาน"}
                    </h1>
                    
                    {/* Role Badges */}
                    {(() => {
                      const expandedRoles: string[] = [];
                      if (roles && roles.length > 0) {
                        roles.forEach((r) => {
                          if (r === "both" || r === "ผู้ให้เช่า / ผู้เช่า") {
                            if (!expandedRoles.includes("lender")) expandedRoles.push("lender");
                            if (!expandedRoles.includes("renter")) expandedRoles.push("renter");
                          } else if (!expandedRoles.includes(r)) {
                            expandedRoles.push(r);
                          }
                        });
                      }
                      if (expandedRoles.length === 0) {
                        expandedRoles.push("renter");
                      }

                      return expandedRoles.map((r) => {
                        const isLender = r === "lender" || r === "ผู้ให้เช่า";
                        const isRenter = r === "renter" || r === "ผู้เช่า";
                        const isAdmin = r === "admin" || r === "ผู้ดูแลระบบ";

                        const label = isAdmin
                          ? "ผู้ดูแลระบบ"
                          : isLender
                          ? "ผู้ให้เช่า"
                          : isRenter
                          ? "ผู้เช่า"
                          : r;

                        return (
                          <span
                            key={r}
                            className="inline-flex items-center rounded-full border border-[#80aad3]/40 bg-[#c0e6fd]/40 px-3 py-0.5 text-xs font-semibold text-[#1b3554] shadow-2xs"
                          >
                            {label}
                          </span>
                        );
                      });
                    })()}
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    สถานะบัญชี:{" "}
                    <span
                      className={
                        status === "Active"
                          ? "font-semibold text-emerald-600"
                          : "font-semibold text-red-600"
                      }
                    >
                      {status}
                    </span>
                  </p>
                </div>
              </div>

              {/* Avatar Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <label
                  htmlFor="avatar-upload-input"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
                >
                  <Upload className="h-3.5 w-3.5 text-[#3f6593]" />
                  <span>{uploadingAvatar ? "กำลังอัปโหลด..." : "อัปโหลดรูปโปรไฟล์"}</span>
                </label>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/70 px-3.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>ลบรูป</span>
                  </button>
                )}
              </div>
            </div>

            {/* Banner / Avatar Notices */}
            {(avatarNotice || bannerNotice) && (
              <div className="mt-4 space-y-2">
                {avatarNotice && (
                  <div className="rounded-xl bg-sky-50 p-2.5 text-xs font-medium text-sky-800 ring-1 ring-sky-200">
                    {avatarNotice}
                  </div>
                )}
                {bannerNotice && (
                  <div className="rounded-xl bg-indigo-50 p-2.5 text-xs font-medium text-indigo-800 ring-1 ring-indigo-200">
                    {bannerNotice}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 1: General Information (Username, Bio & Phone Numbers) */}
        {/* ========================================================================= */}
        <form
          onSubmit={handleSaveGeneralInfo}
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-[#000f22]">
                ข้อมูลทั่วไป (ชื่อผู้ใช้, ประวัติย่อ และเบอร์โทรศัพท์)
              </h2>
              <p className="mt-0.5 text-xs text-[#5b86b6]">
                แก้ไขชื่อผู้ใช้ ประวัติย่อ และเบอร์โทรติดต่อ โดยไม่ต้องเปลี่ยนรหัสผ่าน
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c0e6fd]/30 text-[#1b3554]">
              <User className="h-5 w-5" />
            </div>
          </div>

          {/* General Notifications */}
          {generalError && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm font-medium">{generalError}</p>
            </div>
          )}

          {generalSuccess && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm font-medium">{generalSuccess}</p>
            </div>
          )}

          <div className="mt-6 space-y-5">
            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-sm font-medium text-[#1b3554]"
              >
                ชื่อผู้ใช้ (Username)
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="กรอกชื่อผู้ใช้..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm text-[#000f22] outline-none transition focus:border-[#3f6593] focus:bg-white focus:ring-2 focus:ring-[#c0e6fd]/50"
                />
              </div>
            </div>

            {/* Phone Numbers (Max 2) */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="phone1"
                  className="mb-1.5 block text-sm font-medium text-[#1b3554]"
                >
                  เบอร์โทรศัพท์ 1 (หลัก)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                  <input
                    id="phone1"
                    type="tel"
                    value={phone1}
                    onChange={(e) =>
                      setPhone1(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    placeholder="เช่น 0812345678"
                    maxLength={10}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm text-[#000f22] outline-none transition focus:border-[#3f6593] focus:bg-white focus:ring-2 focus:ring-[#c0e6fd]/50"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  เบอร์ติดต่อหลัก (ความยาว 10 หลัก)
                </p>
              </div>

              <div>
                <label
                  htmlFor="phone2"
                  className="mb-1.5 block text-sm font-medium text-[#1b3554]"
                >
                  เบอร์โทรศัพท์ 2 (สำรอง - ไม่บังคับ)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                  <input
                    id="phone2"
                    type="tel"
                    value={phone2}
                    onChange={(e) =>
                      setPhone2(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    placeholder="เช่น 0898765432 (ถ้ามี)"
                    maxLength={10}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm text-[#000f22] outline-none transition focus:border-[#3f6593] focus:bg-white focus:ring-2 focus:ring-[#c0e6fd]/50"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  เบอร์ติดต่อสำรอง (ความยาว 10 หลัก)
                </p>
              </div>
            </div>

            {/* Bio */}
            <div>
              <label
                htmlFor="bio"
                className="mb-1.5 block text-sm font-medium text-[#1b3554]"
              >
                ประวัติย่อ / รายละเอียดเกี่ยวกับตัวคุณ (Bio)
              </label>
              <div className="relative">
                <FileText className="absolute left-3.5 top-3.5 h-4 w-4 text-[#5b86b6]" />
                <textarea
                  id="bio"
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="เขียนแนะนำตัวสั้น ๆ เช่น ประสบการณ์ อุปกรณ์ที่สนใจ กฎการนัดรับ..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm text-[#000f22] outline-none transition focus:border-[#3f6593] focus:bg-white focus:ring-2 focus:ring-[#c0e6fd]/50"
                />
              </div>
              <p className="mt-1 text-right text-xs text-slate-400">
                {bio.length} / 500 ตัวอักษร
              </p>
            </div>
          </div>

          {/* Dedicated Save Button for General Info */}
          <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={savingGeneral}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3f6593] to-[#1b3554] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#1b3554]/20 transition hover:from-[#1b3554] hover:to-[#000f22] active:scale-95 disabled:opacity-50"
            >
              {savingGeneral ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>กำลังบันทึกข้อมูล...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>บันทึกข้อมูลทั่วไป</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* ========================================================================= */}
        {/* SECTION 2: KYC & Bank Account (การยืนยันตัวตนและบัญชีรับเงิน) */}
        {/* ========================================================================= */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#000f22]">
                  การยืนยันตัวตน & บัญชีรับเงิน (KYC & Payout)
                </h2>
                {identityStatus === "verified" && bankAccount?.verificationStatus === "verified" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    อนุมัติสมบูรณ์
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                    <Clock className="h-3.5 w-3.5" />
                    {identityStatus === "pending" ? "รอการตรวจสอบ" : "อยู่ระหว่างดำเนินการ"}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[#5b86b6]">
                สถานะการตรวจสอบบัตรประชาชนและข้อมูลบัญชีธนาคารสำหรับรับเงินโอนค่าเช่าของผู้ให้เช่า
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenKycModal}
              className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#1b3554] shadow-sm transition hover:bg-slate-50 active:scale-95"
            >
              <Edit3 className="h-3.5 w-3.5 text-[#3f6593]" />
              <span>{identityStatus === "verified" ? "อัปเดตข้อมูล" : "ส่งเอกสาร / แก้ไขข้อมูล"}</span>
            </button>
          </div>

          {/* KYC Success Alert */}
          {kycSuccessNotice && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm font-medium">{kycSuccessNotice}</p>
            </div>
          )}

          {/* 2-Column Grid: ID Card KYC & Bank Account */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Column 1: Identity Verification (บัตรประชาชน) */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#1b3554]">
                    <ShieldCheck className="h-4 w-4 text-[#3f6593]" />
                    <span>ข้อมูลบัตรประชาชน (KYC)</span>
                  </div>

                  {/* Status Badge */}
                  {identityStatus === "verified" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                      อนุมัติแล้ว
                    </span>
                  ) : identityStatus === "pending" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      <Clock className="h-3 w-3" />
                      รอตรวจสอบ
                    </span>
                  ) : identityStatus === "rejected" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100/80 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                      <AlertCircle className="h-3 w-3" />
                      ไม่ผ่านการอนุมัติ
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      ยังไม่ยืนยัน
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">เลขประจำตัวประชาชน</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {maskNationalId(nationalId)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">สถานะการตรวจสอบ</span>
                    <span className="font-medium text-slate-700">
                      {identityStatus === "verified"
                        ? "ได้รับการรับรองตัวตนแล้ว"
                        : identityStatus === "pending"
                        ? "เจ้าหน้าที่กำลังตรวจสอบข้อมูล"
                        : identityStatus === "rejected"
                        ? "เอกสารไม่ผ่าน กรุณาอัปโหลดใหม่"
                        : "ยังไม่ได้ส่งเอกสารยืนยันตัวตน"}
                    </span>
                  </div>
                </div>

                {/* Document Thumbnails */}
                <div className="mt-4">
                  <span className="block text-xs font-semibold text-slate-600 mb-2">
                    เอกสารที่อัปโหลดไว้:
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {idCardUrl && !idCardImgError ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ url: idCardUrl, title: "รูปภาพบัตรประชาชน" })}
                        className="group relative h-16 w-24 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition hover:border-[#3f6593] hover:ring-2 hover:ring-[#c0e6fd]/50"
                      >
                        <img
                          src={idCardUrl}
                          alt="ID Card"
                          className="h-full w-full object-cover transition group-hover:scale-105"
                          onError={() => setIdCardImgError(true)}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                          <ExternalLink className="h-4 w-4 text-white" />
                        </div>
                      </button>
                    ) : (
                      <div className="flex h-16 w-24 flex-col items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-1 text-center">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600 mb-0.5" />
                        <span className="text-[9px] font-semibold text-amber-800 leading-tight">
                          {idCardUrl ? "ไฟล์ไม่สมบูรณ์" : "ไม่มีรูปบัตร"}
                        </span>
                      </div>
                    )}

                    {idCardSelfieUrl && !selfieImgError ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ url: idCardSelfieUrl, title: "รูปเซลฟี่คู่กับบัตรประชาชน" })}
                        className="group relative h-16 w-24 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition hover:border-[#3f6593] hover:ring-2 hover:ring-[#c0e6fd]/50"
                      >
                        <img
                          src={idCardSelfieUrl}
                          alt="Selfie with ID"
                          className="h-full w-full object-cover transition group-hover:scale-105"
                          onError={() => setSelfieImgError(true)}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                          <ExternalLink className="h-4 w-4 text-white" />
                        </div>
                      </button>
                    ) : (
                      <div className="flex h-16 w-24 flex-col items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-1 text-center">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600 mb-0.5" />
                        <span className="text-[9px] font-semibold text-amber-800 leading-tight">
                          {idCardSelfieUrl ? "ไฟล์ไม่สมบูรณ์" : "ไม่มีรูปเซลฟี่"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {identityStatus !== "verified" && (
                <div className="mt-4 pt-3 border-t border-slate-200/60">
                  <button
                    type="button"
                    onClick={handleOpenKycModal}
                    className="w-full rounded-xl bg-gradient-to-r from-[#3f6593] to-[#1b3554] py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95"
                  >
                    {identityStatus === "rejected" ? "อัปโหลดเอกสารบัตรใหม่" : "ส่งเอกสารยืนยันตัวตน"}
                  </button>
                </div>
              )}
            </div>

            {/* Column 2: Bank Account (บัญชีธนาคารสำหรับรับเงิน) */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#1b3554]">
                    <CreditCard className="h-4 w-4 text-[#3f6593]" />
                    <span>บัญชีธนาคารรับเงินโอนค่าเช่า</span>
                  </div>

                  {/* Status Badge */}
                  {bankAccount?.verificationStatus === "verified" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                      อนุมัติแล้ว
                    </span>
                  ) : bankAccount?.verificationStatus === "pending" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      <Clock className="h-3 w-3" />
                      รอตรวจสอบ
                    </span>
                  ) : bankAccount?.verificationStatus === "rejected" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100/80 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                      <AlertCircle className="h-3 w-3" />
                      ไม่ผ่าน
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      ยังไม่ระบุ
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">ธนาคาร</span>
                    <span className="font-semibold text-slate-800">
                      {bankAccount?.bankName || "-"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">เลขที่บัญชี</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {bankAccount?.accountNumber ? maskBankAccountNumber(bankAccount.accountNumber) : "-"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">ชื่อบัญชี</span>
                    <span className="font-semibold text-slate-800">
                      {bankAccount?.accountName || "-"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">สถานะบัญชี</span>
                    <span className="font-medium text-slate-700">
                      {bankAccount?.verificationStatus === "verified"
                        ? "พร้อมรับเงินโอนค่าเช่า"
                        : bankAccount?.verificationStatus === "pending"
                        ? "รอเจ้าหน้าที่ตรวจสอบความถูกต้อง"
                        : bankAccount?.verificationStatus === "rejected"
                        ? "ข้อมูลบัญชีไม่ถูกต้อง กรุณาแก้ไข"
                        : "ยังไม่ได้ผูกบัญชีธนาคาร"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60">
                <button
                  type="button"
                  onClick={handleOpenKycModal}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95"
                >
                  {bankAccount ? "แก้ไขข้อมูลบัญชีธนาคาร" : "เพิ่มบัญชีธนาคาร"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: Security & Password */}
        {/* ========================================================================= */}
        <form
          onSubmit={handleChangePassword}
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-[#000f22]">
                ความปลอดภัยและรหัสผ่าน
              </h2>
              <p className="mt-0.5 text-xs text-[#5b86b6]">
                เปลี่ยนรหัสผ่านเพื่อความปลอดภัยของบัญชีของคุณ
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <KeyRound className="h-5 w-5" />
            </div>
          </div>

          {/* Password Notifications */}
          {passwordError && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm font-medium">{passwordError}</p>
            </div>
          )}

          {passwordSuccess && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm font-medium">{passwordSuccess}</p>
            </div>
          )}

          <div className="mt-6 space-y-5">
            {/* New Password */}
            <div>
              <label
                htmlFor="newPassword"
                className="mb-1.5 block text-sm font-medium text-[#1b3554]"
              >
                รหัสผ่านใหม่
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                <input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="อย่างน้อย 8 ตัวอักษร (A-Z, a-z, 0-9)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-10 text-sm text-[#000f22] outline-none transition focus:border-[#3f6593] focus:bg-white focus:ring-2 focus:ring-[#c0e6fd]/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5b86b6] transition hover:text-[#1b3554]"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-sm font-medium text-[#1b3554]"
              >
                ยืนยันรหัสผ่านใหม่
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b86b6]" />
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านใหม่อีกครั้งเพื่อยืนยัน..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm text-[#000f22] outline-none transition focus:border-[#3f6593] focus:bg-white focus:ring-2 focus:ring-[#c0e6fd]/50"
                />
              </div>
            </div>
          </div>

          {/* Dedicated Save Button for Password */}
          <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={savingPassword || !newPassword}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#1b3554] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingPassword ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>กำลังเปลี่ยนรหัสผ่าน...</span>
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  <span>บันทึกรหัสผ่านใหม่</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* ========================================================================= */}
        {/* SECTION 3: Danger Zone (ลบบัญชีผู้ใช้งาน - Soft Delete) */}
        {/* ========================================================================= */}
        <div className="rounded-3xl border border-red-200 bg-red-50/30 p-6 shadow-sm sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-red-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-red-700">
                ลบบัญชีผู้ใช้งาน (Delete Account)
              </h2>
              <p className="mt-0.5 text-xs text-red-600/80">
                เมื่อลบบัญชี ระบบจะปิดการใช้งานบัญชี ซ่อนสินค้าของคุณทั้งหมด และไม่สามารถเข้าสู่ระบบได้อีก
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(true);
                setDeleteError(null);
                setDeleteConfirmText("");
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-95"
            >
              <Trash2 className="h-4 w-4" />
              <span>ลบบัญชีของฉัน</span>
            </button>
          </div>
        </div>

        {/* Modal ยืนยันการลบบัญชี */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-center gap-3 text-red-600">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    ยืนยันการลบบัญชีผู้ใช้?
                  </h3>
                  <p className="text-xs text-slate-500">
                    การดำเนินการนี้ไม่สามารถยกเลิกได้ในภายหลัง
                  </p>
                </div>
              </div>

              {deleteError && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <p>⚠️ <strong>เมื่อกดยืนยัน:</strong></p>
                <ul className="list-disc pl-5 space-y-1 text-slate-500">
                  <li>บัญชีของคุณจะถูกปิดการใช้งาน (Deactivated) ทันที</li>
                  <li>สินค้าที่คุณลงประกาศไว้ทั้งหมดจะถูกซ่อนออกจากหน้าร้าน</li>
                  <li>เอกสารยืนยันตัวตน (KYC) และข้อมูลส่วนตัวจะถูกลบ</li>
                  <li>ประวัติการเช่าในอดีตจะคงอยู่เพื่อความโปร่งใสทางบัญชี</li>
                </ul>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  พิมพ์คำว่า <span className="font-bold text-red-600">DELETE</span> เพื่อยืนยัน:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="พิมพ์ DELETE ที่นี่"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeletingAccount}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText.trim().toUpperCase() !== "DELETE" || isDeletingAccount}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-xs font-semibold text-white shadow-md transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isDeletingAccount ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>กำลังลบบัญชี...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>ยืนยันลบบัญชีถาวร</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* KYC & Bank Account Modal */}
        {/* ========================================================================= */}
        {showKycModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto sm:p-8">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#000f22]">
                    ส่งข้อมูลยืนยันตัวตน & บัญชีรับเงิน
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    อัปเดตบัตรประชาชนและบัญชีธนาคารสำหรับรับเงินโอนค่าเช่า
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowKycModal(false)}
                  className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {kycModalError && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{kycModalError}</span>
                </div>
              )}

              <form onSubmit={handleSubmitKyc} className="mt-5 space-y-4">
                {/* National ID */}
                <div>
                  <label className="block text-xs font-semibold text-[#1b3554] mb-1">
                    เลขประจำตัวประชาชน (13 หลัก)
                  </label>
                  <input
                    type="text"
                    maxLength={13}
                    inputMode="numeric"
                    value={kycNationalId}
                    onChange={(e) => setKycNationalId(e.target.value.replace(/\D/g, ""))}
                    placeholder="เช่น 1234567890123"
                    className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-[#c0e6fd]/50"
                  />
                </div>

                {/* ID Card Image Upload */}
                <div>
                  <label className="block text-xs font-semibold text-[#1b3554] mb-1">
                    รูปถ่ายบัตรประชาชน {idCardUrl && <span className="font-normal text-slate-400">(มีรูปเดิมแล้ว อัปโหลดเฉพาะเมื่อต้องการเปลี่ยน)</span>}
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setKycIdCardFile(e.target.files?.[0] || null)}
                    className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-[#c0e6fd]/50 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-[#1b3554]"
                  />
                </div>

                {/* Selfie Image Upload */}
                <div>
                  <label className="block text-xs font-semibold text-[#1b3554] mb-1">
                    รูปถ่ายเซลฟี่คู่กับบัตรประชาชน {idCardSelfieUrl && <span className="font-normal text-slate-400">(มีรูปเดิมแล้ว อัปโหลดเฉพาะเมื่อต้องการเปลี่ยน)</span>}
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setKycSelfieFile(e.target.files?.[0] || null)}
                    className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-[#c0e6fd]/50 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-[#1b3554]"
                  />
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className="block text-xs font-bold text-[#1b3554] mb-3">
                    ข้อมูลบัญชีธนาคาร (สำหรับรับเงินโอนค่าเช่า)
                  </span>

                  <div className="space-y-3">
                    {/* Bank Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        ธนาคาร
                      </label>
                      <select
                        value={kycBankName}
                        onChange={(e) => setKycBankName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-[#c0e6fd]/50"
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
                    </div>

                    {/* Account Number */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        เลขที่บัญชีธนาคาร
                      </label>
                      <input
                        type="text"
                        maxLength={15}
                        inputMode="numeric"
                        value={kycAccountNumber}
                        onChange={(e) => setKycAccountNumber(e.target.value.replace(/\D/g, ""))}
                        placeholder="กรอกเฉพาะตัวเลข เช่น 1234567890"
                        className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-[#c0e6fd]/50"
                      />
                    </div>

                    {/* Account Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        ชื่อบัญชีธนาคาร (ตรงตามสมุดบัญชี)
                      </label>
                      <input
                        type="text"
                        value={kycAccountName}
                        onChange={(e) => setKycAccountName(e.target.value)}
                        placeholder="เช่น นาย สมชาย ใจดี"
                        className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-xs text-slate-800 outline-none transition focus:border-[#3f6593] focus:ring-2 focus:ring-[#c0e6fd]/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowKycModal(false)}
                    disabled={kycSubmitting}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={kycSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#3f6593] to-[#1b3554] px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-50"
                  >
                    {kycSubmitting ? (
                      <>
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>กำลังส่งข้อมูล...</span>
                      </>
                    ) : (
                      <span>ส่งข้อมูลให้ตรวจสอบ</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Image Preview Lightbox */}
        {/* ========================================================================= */}
        {previewImage && (
          <div
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-2xl w-full rounded-2xl bg-white p-4 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-sm font-bold text-slate-800">{previewImage.title}</span>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-center max-h-[70vh] overflow-hidden rounded-xl bg-slate-50">
                <img
                  src={previewImage.url}
                  alt={previewImage.title}
                  className="max-h-[70vh] w-auto object-contain"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
