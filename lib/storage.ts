import { createAdminClient } from "@/lib/supabase/admin";

export type StorageCategory =
  | "avatars"
  | "banners"
  | "items"
  | "slips"
  | "evidence/handover"
  | "evidence/return"
  | "kyc"
  | "disputes";

export interface UploadOptions {
  fileName?: string;
  contentType?: string;
  upsert?: boolean;
}

export interface UploadResult {
  publicUrl: string;
  path: string;
  bucket: string;
}

const PRIMARY_BUCKET = "chaochao";

// Legacy bucket mapping for synchronization and backward compatibility
const LEGACY_BUCKET_MAP: Record<StorageCategory, { bucket: string; subPathPrefix?: string }> = {
  avatars: { bucket: "avatars" },
  banners: { bucket: "banners" },
  items: { bucket: "item-images" },
  slips: { bucket: "slips" },
  "evidence/handover": { bucket: "rental-evidence" },
  "evidence/return": { bucket: "rental-evidence" },
  kyc: { bucket: "kyc" },
  disputes: { bucket: "rental-evidence" },
};

function getExtensionFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

function parseDataUri(dataUri: string): { mimeType: string; buffer: Buffer } | null {
  const match = dataUri.match(/^data:([a-zA-Z0-9\/+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

/**
 * Uploads a file (Buffer, File, or base64 Data URI) to Supabase Storage,
 * categorizing it into the appropriate folder.
 */
export async function uploadToStorage(
  category: StorageCategory,
  folderId: string,
  input: Buffer | File | string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const admin = createAdminClient();
  const cleanFolderId = folderId ? folderId.trim().replace(/[^a-zA-Z0-9_-]/g, "_") : "general";

  let buffer: Buffer;
  let mimeType = options.contentType || "image/png";
  let originalExt = "";

  if (typeof input === "string") {
    // If it's already an existing HTTP(S) URL (and not base64), return it directly
    if (input.startsWith("http://") || input.startsWith("https://")) {
      return {
        publicUrl: input,
        path: input,
        bucket: PRIMARY_BUCKET,
      };
    }

    const parsed = parseDataUri(input);
    if (!parsed) {
      throw new Error("Invalid base64 data URI format");
    }
    buffer = parsed.buffer;
    mimeType = options.contentType || parsed.mimeType;
    originalExt = getExtensionFromMime(mimeType);
  } else if (Buffer.isBuffer(input)) {
    buffer = input;
    originalExt = getExtensionFromMime(mimeType);
  } else {
    // input is Web API File
    const file = input as File;
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    mimeType = file.type || mimeType;
    originalExt = file.name?.split(".").pop()?.toLowerCase() || getExtensionFromMime(mimeType);
  }

  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  const ext = originalExt ? `.${originalExt}` : `.${getExtensionFromMime(mimeType)}`;
  const fileName = options.fileName || `${category.replace(/\//g, "_")}_${timestamp}_${rand}${ext}`;

  // Primary path in 'chaochao' bucket: e.g. "slips/order-123/slip_12345_abc.png"
  const primaryPath = `${category}/${cleanFolderId}/${fileName}`;

  // 1. Upload to primary categorized bucket 'chaochao'
  let primaryUploadSuccess = false;
  let { error: primaryError } = await admin.storage
    .from(PRIMARY_BUCKET)
    .upload(primaryPath, buffer, {
      contentType: mimeType,
      upsert: options.upsert ?? true,
    });

  if (
    primaryError &&
    (primaryError.message?.includes("Bucket not found") ||
      (primaryError as any).error === "Bucket not found")
  ) {
    try {
      await admin.storage.createBucket(PRIMARY_BUCKET, { public: true });
      const retry = await admin.storage
        .from(PRIMARY_BUCKET)
        .upload(primaryPath, buffer, {
          contentType: mimeType,
          upsert: options.upsert ?? true,
        });
      primaryError = retry.error;
    } catch (e) {
      console.warn("Failed auto-creating primary bucket:", e);
    }
  }

  if (!primaryError) {
    primaryUploadSuccess = true;
  } else {
    console.error(
      `Failed to upload to primary bucket ${PRIMARY_BUCKET} at ${primaryPath}:`,
      primaryError
    );
  }

  // 2. Also sync to legacy bucket if different, to maintain 100% backward compatibility
  let legacyUploadSuccess = false;
  const legacyConfig = LEGACY_BUCKET_MAP[category];
  const legacyPath = `${cleanFolderId}/${fileName}`;
  if (legacyConfig && legacyConfig.bucket !== PRIMARY_BUCKET) {
    try {
      let { error: legErr } = await admin.storage
        .from(legacyConfig.bucket)
        .upload(legacyPath, buffer, {
          contentType: mimeType,
          upsert: options.upsert ?? true,
        });

      if (
        legErr &&
        (legErr.message?.includes("Bucket not found") ||
          (legErr as any).error === "Bucket not found")
      ) {
        await admin.storage.createBucket(legacyConfig.bucket, { public: true });
        const retryLeg = await admin.storage
          .from(legacyConfig.bucket)
          .upload(legacyPath, buffer, {
            contentType: mimeType,
            upsert: options.upsert ?? true,
          });
        legErr = retryLeg.error;
      }

      if (!legErr) {
        legacyUploadSuccess = true;
      }
    } catch (e) {
      console.warn(
        `Sync to legacy bucket ${legacyConfig.bucket} skipped or failed:`,
        e
      );
    }
  }

  if (primaryUploadSuccess) {
    const { data: primaryPubData } = admin.storage
      .from(PRIMARY_BUCKET)
      .getPublicUrl(primaryPath);

    return {
      publicUrl: primaryPubData.publicUrl,
      path: primaryPath,
      bucket: PRIMARY_BUCKET,
    };
  }

  if (legacyUploadSuccess && legacyConfig) {
    const { data: legPubData } = admin.storage
      .from(legacyConfig.bucket)
      .getPublicUrl(legacyPath);

    return {
      publicUrl: legPubData.publicUrl,
      path: legacyPath,
      bucket: legacyConfig.bucket,
    };
  }

  // Fallback public url
  const { data: primaryPubData } = admin.storage
    .from(PRIMARY_BUCKET)
    .getPublicUrl(primaryPath);

  return {
    publicUrl: primaryPubData.publicUrl,
    path: primaryPath,
    bucket: PRIMARY_BUCKET,
  };
}

/**
 * Uploads multiple items concurrently to Supabase Storage under the specified category.
 */
export async function uploadMultipleToStorage(
  category: StorageCategory,
  folderId: string,
  inputs: (Buffer | File | string)[],
  options: UploadOptions = {}
): Promise<UploadResult[]> {
  const uploadPromises = inputs.map((input) =>
    uploadToStorage(category, folderId, input, options)
  );
  return Promise.all(uploadPromises);
}
