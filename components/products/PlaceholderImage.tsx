"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

function joinClassNames(...classNames: Array<string | undefined | false>) {
  return classNames.filter(Boolean).join(" ");
}

// seed ที่เป็น URL รูปจริง (Supabase Storage / ลิงก์ภายนอก / data URI)
function isImageSource(seed: string) {
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(seed);
}

/**
 * แสดงรูปสินค้าจริงถ้า seed เป็น URL รูป
 * ถ้าไม่มีรูป (seed เป็นชื่อสินค้า) หรือโหลดรูปไม่สำเร็จ จะแสดงไอคอนแทน
 */
export function PlaceholderImage({
  seed,
  className,
  rounded = "rounded-xl",
  alt,
  fit = "cover",
}: {
  seed: string;
  className?: string;
  rounded?: string;
  alt?: string;
  fit?: "cover" | "contain";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = isImageSource(seed) && failedSrc !== seed;

  if (showImage) {
    return (
      <div
        className={joinClassNames(
          "overflow-hidden",
          fit === "cover" ? "bg-slate-100" : "bg-transparent",
          rounded,
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก Storage หลายโดเมน ไม่ผ่าน next/image */}
        <img
          src={seed}
          alt={alt ?? "รูปสินค้า"}
          loading="lazy"
          onError={() => setFailedSrc(seed)}
          className={joinClassNames(
            "h-full w-full",
            fit === "cover" ? "object-cover" : "object-contain",
          )}
        />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={alt ?? `ภาพตัวอย่างสินค้า ${seed}`}
      className={joinClassNames(
        "flex items-center justify-center bg-gradient-to-br",
        "from-[#2980B9] to-[#6DD5FA]",
        rounded,
        className,
      )}
    >
      <ImageIcon
        aria-hidden="true"
        className="h-[28%] w-[28%] text-white/70"
        strokeWidth={1.8}
      />
    </div>
  );
}
