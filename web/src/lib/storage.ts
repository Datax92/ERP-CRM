import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { fb } from "./firebase";
import type { Attachment, CollectionName } from "./types";

/** Check if a file is an image format supported by ImgBB */
export function isImageFile(file: { name: string; type?: string }): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|bmp|webp|svg|ico|tiff?|heic|avif)$/i.test(file.name);
}

/** Resolves the ImgBB API key from settings or environment variables */
export function getImgBBApiKey(customKey?: string): string {
  return (customKey || process.env.NEXT_PUBLIC_IMGBB_API_KEY || "").trim();
}

/** Uploads an image to ImgBB (free image hosting, max 32 MB) */
export async function uploadToImgBB(file: File, apiKey: string): Promise<Attachment> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("ImgBB API key is missing. Please configure it in Settings or set NEXT_PUBLIC_IMGBB_API_KEY.");
  }

  const MAX_SIZE = 32 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error(`"${file.name}" exceeds ImgBB's 32 MB file limit.`);
  }

  const formData = new FormData();
  formData.append("image", file);
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  if (baseName) {
    formData.append("name", baseName);
  }

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`, {
    method: "POST",
    body: formData,
  });

  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: {
      id: string;
      url: string;
      display_url?: string;
      size?: number | string;
      thumb?: { url?: string };
      delete_url?: string;
    };
    error?: { message?: string };
    status_txt?: string;
  } | null;

  if (!res.ok || !json?.success || !json?.data) {
    const msg = json?.error?.message || json?.status_txt || `Upload failed (status ${res.status})`;
    throw new Error(`ImgBB: ${msg}`);
  }

  const data = json.data;
  return {
    name: file.name,
    url: data.display_url || data.url,
    path: `imgbb/${data.id}`,
    size: Number(data.size) || file.size,
    uploadedAt: new Date().toISOString(),
    thumbUrl: data.thumb?.url || data.display_url || data.url,
    deleteUrl: data.delete_url,
    provider: "imgbb",
  };
}

/** Tests an ImgBB API key by uploading a tiny 1x1 test image that auto-expires in 60s */
export async function testImgBBApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: "Please provide an API key." };

  try {
    const formData = new FormData();
    // 1x1 transparent GIF data URI / base64
    formData.append("image", "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
    formData.append("name", "connection_test");
    formData.append("expiration", "60");

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`, {
      method: "POST",
      body: formData,
    });

    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: { message?: string };
    } | null;

    if (!res.ok || !json?.success) {
      const msg = json?.error?.message || `Status ${res.status}`;
      return { ok: false, message: msg };
    }

    return { ok: true, message: "ImgBB API key is valid and working!" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Connection test failed: ${msg}` };
  }
}

/** Uploads to Firebase Storage if configured */
export async function uploadToFirebaseStorage(col: CollectionName, recordId: string, file: File): Promise<Attachment> {
  const safe = file.name.replace(/[^\w.\-() ]+/g, "_");
  const path = `attachments/${col}/${recordId}/${Date.now()}_${safe}`;
  const r = ref(fb().storage, path);
  await uploadBytes(r, file, { contentType: file.type || undefined });
  return {
    name: file.name,
    path,
    url: await getDownloadURL(r),
    size: file.size,
    uploadedAt: new Date().toISOString(),
    provider: "firebase",
  };
}

// Removing an attachment only unlinks it from the record: the same stored file is carried
// forward through the chain (RFQ → quotation → sales order), so it is never deleted here.
export async function uploadAttachment(
  col: CollectionName,
  recordId: string,
  file: File,
  imgbbApiKey?: string,
): Promise<Attachment> {
  const apiKey = getImgBBApiKey(imgbbApiKey);

  // If ImgBB API key is available:
  if (apiKey) {
    if (isImageFile(file)) {
      return await uploadToImgBB(file, apiKey);
    }
    // Non-image file (e.g. PDF, doc): try Firebase Storage if available
    try {
      return await uploadToFirebaseStorage(col, recordId, file);
    } catch {
      throw new Error(
        `"${file.name}" is not an image. ImgBB supports images (JPG, PNG, GIF, WebP). Documents like PDFs require Firebase Storage.`,
      );
    }
  }

  // Fallback to Firebase Storage when no ImgBB key is configured
  try {
    return await uploadToFirebaseStorage(col, recordId, file);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Upload failed for "${file.name}". ImgBB API key is not configured. Enter your key in Settings or set NEXT_PUBLIC_IMGBB_API_KEY in .env.local (free at api.imgbb.com). Firebase fallback failed: ${msg}`,
    );
  }
}

