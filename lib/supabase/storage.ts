import { createAdminClient } from "./admin";

interface UploadOptions {
  bucket: string;
  folder?: string;
  filenamePrefix?: string;
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/**
 * Uploads an image (Base64 data URI, raw Buffer, File, or existing HTTP URL) to Supabase Storage
 * and returns the public URL. If the input is already an HTTP(S) URL, it returns it directly.
 */
export async function uploadImageToStorage(
  input: string | File | Buffer,
  options: UploadOptions,
): Promise<string> {
  const { bucket, folder = "general", filenamePrefix = "file" } = options;

  // 1) If input is already a hosted URL, return as-is
  if (typeof input === "string" && (input.startsWith("http://") || input.startsWith("https://"))) {
    return input;
  }

  let buffer: Buffer;
  let mimeType = "image/png";
  let extension = "png";

  // 2) Handle string (Base64 Data URI or plain Base64)
  if (typeof input === "string") {
    const dataUriMatch = input.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
    if (dataUriMatch) {
      mimeType = dataUriMatch[1].toLowerCase();
      buffer = Buffer.from(dataUriMatch[2], "base64");
    } else {
      // Plain base64 string
      buffer = Buffer.from(input, "base64");
    }
    extension = MIME_TO_EXT[mimeType] || "png";
  } else if (input instanceof Buffer) {
    // 3) Handle raw Buffer
    buffer = input;
  } else if (typeof (input as File)?.arrayBuffer === "function") {
    // 4) Handle File / Blob
    const file = input as File;
    buffer = Buffer.from(await file.arrayBuffer());
    mimeType = file.type || "image/png";
    extension = MIME_TO_EXT[mimeType] || file.name?.split(".").pop()?.toLowerCase() || "png";
  } else {
    throw new Error("Unsupported image input type");
  }

  const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const filePath = `${cleanFolder}/${filenamePrefix}_${timestamp}_${randomSuffix}.${extension}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error(`Failed to upload to Supabase Storage (${bucket}/${filePath}):`, uploadError);
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(bucket).getPublicUrl(filePath);

  return publicUrl;
}

/**
 * Uploads multiple images in parallel to Supabase Storage and returns an array of public URLs.
 */
export async function uploadMultipleImagesToStorage(
  inputs: (string | File | Buffer)[],
  options: UploadOptions,
): Promise<string[]> {
  if (!inputs || inputs.length === 0) return [];
  return Promise.all(
    inputs.map((item, index) =>
      uploadImageToStorage(item, {
        ...options,
        filenamePrefix: `${options.filenamePrefix || "img"}_${index + 1}`,
      }),
    ),
  );
}
