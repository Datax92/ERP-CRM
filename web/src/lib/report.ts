import { monthKey, num } from "./calc";
import type { Rec } from "./types";

/** Every month between the first and last key, so gaps show as zero rather than vanishing. */
export function monthRange(keys: string[]): string[] {
  const ks = keys.filter(Boolean).sort();
  if (!ks.length) return [];
  const out: string[] = [];
  let [y, m] = ks[0].split("-").map(Number);
  const [ey, em] = ks[ks.length - 1].split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.slice(-36);
}

/** Monthly buckets: `split` names the series a row belongs to, `value` its contribution. */
export function monthly(rows: Rec[], opts: { date?: (r: Rec) => string | undefined; split?: (r: Rec) => string; value?: (r: Rec) => number; series: string[] }) {
  const date = opts.date ?? ((r: Rec) => r.date);
  const buckets = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const k = monthKey(date(r));
    if (!k) continue;
    const b = buckets.get(k) ?? {};
    const s = opts.split ? opts.split(r) : opts.series[0];
    b[s] = (b[s] ?? 0) + (opts.value ? opts.value(r) : 1);
    buckets.set(k, b);
  }
  return monthRange([...buckets.keys()]).map((month) => {
    const row: Record<string, string | number> = { month };
    for (const s of opts.series) row[s] = buckets.get(month)?.[s] ?? 0;
    return row;
  });
}

/** Several measures per month from the same rows (e.g. total price and margin). */
export function monthlyMeasures(rows: Rec[], measures: { key: string; value: (r: Rec) => number }[], date: (r: Rec) => string | undefined = (r) => r.date) {
  const buckets = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const k = monthKey(date(r));
    if (!k) continue;
    const b = buckets.get(k) ?? {};
    for (const m of measures) b[m.key] = (b[m.key] ?? 0) + m.value(r);
    buckets.set(k, b);
  }
  return monthRange([...buckets.keys()]).map((month) => {
    const row: Record<string, string | number> = { month };
    for (const m of measures) row[m.key] = buckets.get(month)?.[m.key] ?? 0;
    return row;
  });
}

export function groupSum(rows: Rec[], key: (r: Rec) => string | string[] | undefined, value: (r: Rec) => number = () => 1) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    const ks = Array.isArray(k) ? k : [k];
    for (const x of ks) {
      const label = x || "Not set";
      m.set(label, (m.get(label) ?? 0) + value(r));
    }
  }
  return [...m.entries()].map(([label, value]) => ({ label, value }));
}

/** Fold anything past the first `n` categories into "Other" (palette has a fixed number of slots). */
export function topN(names: string[], weights: Map<string, number>, n: number) {
  const sorted = [...names].sort((a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0));
  return sorted.length <= n ? sorted : [...sorted.slice(0, n), "Other"];
}

export type ProductRow = { product: string; lines: number; qty: number; value: number; cost: number };

/** Product-wise totals from line items, converted to PKR with each document's rate. */
export function productWise(rows: Rec[]): ProductRow[] {
  const m = new Map<string, ProductRow>();
  for (const r of rows) {
    const rate = !r.currency || r.currency === "PKR" ? 1 : num(r.exchangeRate);
    for (const it of r.items ?? []) {
      const p = it.product || it.description || "Unspecified";
      const row = m.get(p) ?? { product: p, lines: 0, qty: 0, value: 0, cost: 0 };
      row.lines++;
      row.qty += num(it.qty);
      row.value += num(it.qty) * num(it.unitPrice) * rate;
      row.cost += num(it.qty) * num(it.unitCost) * rate;
      m.set(p, row);
    }
  }
  return [...m.values()].sort((a, b) => b.value + b.cost - (a.value + a.cost) || b.qty - a.qty);
}
