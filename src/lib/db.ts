import { collection, deleteDoc, doc, runTransaction, setDoc } from "firebase/firestore";
import { fb } from "./firebase";
import { withTotals } from "./calc";
import type { CollectionName, ItemsMode, Rec, Settings } from "./types";

export function newId(col: CollectionName) {
  return doc(collection(fb().db, col)).id;
}

/** Sequential per-year serial, e.g. RFQ-2026-0007. */
async function nextSerial(col: CollectionName, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const ref = doc(fb().db, "counters", `${col}-${year}`);
  try {
    const n = await runTransaction(fb().db, async (tx) => {
      const snap = await tx.get(ref);
      const next = (snap.exists() ? (snap.data().next as number) : 0) + 1;
      tx.set(ref, { next });
      return next;
    });
    return `${prefix}-${year}-${String(n).padStart(4, "0")}`;
  } catch {
    // Transactions need a connection; offline saves get a unique temporary number instead.
    return `${prefix}-${year}-T${Date.now().toString(36).toUpperCase()}`;
  }
}

export type SaveOptions = { itemsMode?: ItemsMode; amountField?: string; serialPrefix?: string };

export async function saveRecord(col: CollectionName, rec: Rec, opts: SaveOptions = {}): Promise<Rec> {
  const id = rec.id || newId(col);
  const ref = doc(fb().db, col, id);
  const now = new Date().toISOString();
  let data = withTotals({ ...rec, id }, opts.itemsMode, opts.amountField);
  if (opts.serialPrefix && !data.serial) data.serial = await nextSerial(col, opts.serialPrefix);
  data = {
    ...data,
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  };
  const { id: _omit, ...payload } = data;
  void _omit;
  await setDoc(ref, payload);
  return data;
}

/** Partial update that keeps totals intact (used by workflow status changes). */
export async function patchRecord(col: CollectionName, id: string, patch: Record<string, unknown>) {
  await setDoc(doc(fb().db, col, id), { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function deleteRecord(col: CollectionName, id: string) {
  await deleteDoc(doc(fb().db, col, id));
}

export async function saveSettings(settings: Settings) {
  await setDoc(doc(fb().db, "meta", "settings"), settings);
}
