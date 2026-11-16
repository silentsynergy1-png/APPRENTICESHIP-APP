"use client";

import { getBrowserClient } from "@/lib/supabase/client";

export const BUCKET = "user-files";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Downscales large photos before upload (site phones produce 5–12 MB images and reception
 * is often poor). Formats the browser can't decode (e.g. HEIC on Android) are uploaded as-is.
 */
export async function compressImage(file: File, maxDim = 2000, quality = 0.82): Promise<File> {
  if (!IMAGE_TYPES.includes(file.type) || file.size < 600_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function extFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" };
  return map[file.type] ?? (fromName && fromName.length <= 5 ? fromName : "bin");
}

/**
 * Uploads straight from the browser to the user's private folder. Storage RLS rejects any
 * path outside `<userId>/`, and the server re-validates the path when recording the file.
 */
export async function uploadUserFile(userId: string, area: string, file: File): Promise<{ path: string; mime: string; size: number }> {
  const path = `${userId}/${area}/${crypto.randomUUID()}.${extFor(file)}`;
  const { error } = await getBrowserClient().storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
    cacheControl: "3600",
  });
  if (error) throw new Error(/size/i.test(error.message) ? "That file is too large." : /mime|type/i.test(error.message) ? "That file type isn't supported." : "Upload failed. Check your connection and try again.");
  return { path, mime: file.type, size: file.size };
}
