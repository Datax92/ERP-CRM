import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { fb } from "./firebase";
import type { Attachment, CollectionName } from "./types";

// Removing an attachment only unlinks it from the record: the same stored file is carried
// forward through the chain (RFQ → quotation → sales order), so it is never deleted here.
export async function uploadAttachment(col: CollectionName, recordId: string, file: File): Promise<Attachment> {
  const safe = file.name.replace(/[^\w.\-() ]+/g, "_");
  const path = `attachments/${col}/${recordId}/${Date.now()}_${safe}`;
  const r = ref(fb().storage, path);
  await uploadBytes(r, file, { contentType: file.type || undefined });
  return { name: file.name, path, url: await getDownloadURL(r), size: file.size, uploadedAt: new Date().toISOString() };
}
