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

// Map each logical upload category directly to its designated Supabase Storage bucket
export const CATEGORY_BUCKET_MAP: Record<
  StorageCategory,
  { bucket: string; subPathPrefix?: string }
> = {
  avatars: { bucket: "avatars" },
  banners: { bucket: "banners" },
  items: { bucket: "item-images" },
  slips: { bucket: "slips" },
  "evidence/handover": { bucket: "rental-evidence", subPathPrefix: "handover" },
  "evidence/return": { bucket: "rental-evidence", subPathPrefix: "return" },
  kyc: { bucket: "kyc" },
  disputes: { bucket: "rental-evidence", subPathPrefix: "disputes" },
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
 * Uploads a file (Buffer, File, or base64 Data URI) to its dedicated Supabase Storage bucket,
 * organized into subfolders (e.g. avatars/{userId}/avatar_123.png).
 */
export async function uploadToStorage(
  category: StorageCategory,
  folderId: string,
  input: Buffer | File | string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const admin = createAdminClient();
  const cleanFolderId = folderId ? folderId.trim().replace(/[^a-zA-Z0-9_-]/g, "_") : "general";

  const target = CATEGORY_BUCKET_MAP[category] || { bucket: category };
  const bucketName = target.bucket;

  let buffer: Buffer;
  let mimeType = options.contentType || "image/png";
  let originalExt = "";

  if (typeof input === "string") {
    // If it's already an existing HTTP(S) URL (and not base64), return it directly
    if (input.startsWith("http://") || input.startsWith("https://")) {
      return {
        publicUrl: input,
        path: input,
        bucket: bucketName,
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

  // File path within the dedicated bucket:
  // e.g. avatars/{userId}/avatar_123.png, slips/{orderId}/slip_123.png
  const folderPath = target.subPathPrefix ? `${target.subPathPrefix}/${cleanFolderId}` : cleanFolderId;
  const filePath = `${folderPath}/${fileName}`;

  // Upload directly to the dedicated bucket
  let { error: uploadError } = await admin.storage
    .from(bucketName)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: options.upsert ?? true,
    });

  // If bucket doesn't exist, auto-create it as public and retry
  if (
    uploadError &&
    (uploadError.message?.includes("Bucket not found") ||
      (uploadError as any).error === "Bucket not found")
  ) {
    try {
      await admin.storage.createBucket(bucketName, { public: true });
      const retry = await admin.storage
        .from(bucketName)
        .upload(filePath, buffer, {
          contentType: mimeType,
          upsert: options.upsert ?? true,
        });
      uploadError = retry.error;
    } catch (e) {
      console.warn(`Failed auto-creating bucket ${bucketName}:`, e);
    }
  }

  if (uploadError) {
    console.error(`Failed to upload to bucket ${bucketName} at ${filePath}:`, uploadError);
    throw new Error(`Upload to storage failed: ${uploadError.message}`);
  }

  const { data: pubData } = admin.storage
    .from(bucketName)
    .getPublicUrl(filePath);

  return {
    publicUrl: pubData.publicUrl,
    path: filePath,
    bucket: bucketName,
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
