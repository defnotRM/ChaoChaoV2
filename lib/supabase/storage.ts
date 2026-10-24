import {
  uploadToStorage,
  uploadMultipleToStorage,
  type StorageCategory,
  type UploadOptions,
  type UploadResult,
} from "../storage";

export * from "../storage";
export { uploadToStorage as uploadImageToStorage };

export interface UploadMultipleImagesOptions {
  bucket?: string;
  folder?: string;
  filenamePrefix?: string;
}

export async function uploadMultipleImagesToStorage(
  files: (Buffer | File | string)[],
  options?: UploadMultipleImagesOptions,
): Promise<string[]>;
export async function uploadMultipleImagesToStorage(
  category: StorageCategory,
  folderId: string,
  inputs: (Buffer | File | string)[],
  options?: UploadOptions,
): Promise<UploadResult[]>;
export async function uploadMultipleImagesToStorage(
  arg1: any,
  arg2?: any,
  arg3?: any,
  arg4?: any,
): Promise<any> {
  if (Array.isArray(arg1)) {
    const files = arg1 as (Buffer | File | string)[];
    const opts = (arg2 || {}) as UploadMultipleImagesOptions;
    const category: StorageCategory =
      opts.bucket === "item-images" || !opts.bucket
        ? "items"
        : (opts.bucket as StorageCategory);
    const folderId = opts.folder || "general";
    const results = await uploadMultipleToStorage(category, folderId, files);
    return results.map((r) => r.publicUrl);
  } else {
    return uploadMultipleToStorage(arg1, arg2, arg3, arg4);
  }
}

