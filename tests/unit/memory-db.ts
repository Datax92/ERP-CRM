// In-memory stand-in for src/lib/db.ts so the real workflow/derive/report code can be
// exercised without Firebase. Save semantics (totals, serials, timestamps) match db.ts.
import { withTotals } from "@/lib/calc";
import { COLLECTIONS, type CollectionName, type Rec, type Settings } from "@/lib/types";
import type { SaveOptions } from "@/lib/db";
import type { Store } from "@/lib/derive";
import { DEFAULT_SETTINGS } from "@/lib/settings";

export const mem = {
  data: {} as Record<CollectionName, Map<string, Rec>>,
  counters: {} as Record<string, number>,
  settings: { ...DEFAULT_SETTINGS } as Settings,
  seq: 0,
  reset() {
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()])) as Record<CollectionName, Map<string, Rec>>;
    this.counters = {};
    this.settings = { ...DEFAULT_SETTINGS };
    this.seq = 0;
  },
};
mem.reset();

export function newId(col: CollectionName) {
  return `${col}-${++mem.seq}`;
}

export async function saveRecord(col: CollectionName, rec: Rec, opts: SaveOptions = {}): Promise<Rec> {
  const id = rec.id || newId(col);
  let data = withTotals({ ...rec, id }, opts.itemsMode, opts.amountField);
  if (opts.serialPrefix && !data.serial) {
    const key = `${col}-${new Date().getFullYear()}`;
    mem.counters[key] = (mem.counters[key] ?? 0) + 1;
    data.serial = `${opts.serialPrefix}-${new Date().getFullYear()}-${String(mem.counters[key]).padStart(4, "0")}`;
  }
  const now = new Date().toISOString();
  data = { ...data, createdAt: data.createdAt ?? now, updatedAt: now };
  mem.data[col].set(id, data);
  return data;
}

export async function patchRecord(col: CollectionName, id: string, patch: Record<string, unknown>) {
  const cur = mem.data[col].get(id);
  if (!cur) throw new Error(`patch: ${col}/${id} missing`);
  mem.data[col].set(id, { ...cur, ...patch });
}

export async function deleteRecord(col: CollectionName, id: string) {
  mem.data[col].delete(id);
}

export async function saveSettings(settings: Settings) {
  mem.settings = settings;
}

/** Snapshot shaped exactly like the app's live store. */
export function store(): Store {
  const lists = Object.fromEntries(COLLECTIONS.map((c) => [c, [...mem.data[c].values()]])) as Record<CollectionName, Rec[]>;
  const byId = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map(mem.data[c])])) as Store["byId"];
  return { ...lists, byId, settings: mem.settings };
}
