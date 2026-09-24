import type { ItemsMode, LineItem, Rec } from "./types";

export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export function emptyItem(): LineItem {
  return { description: "", product: "", brand: "", supplierId: "", qty: 1, unit: "Nos", unitCost: 0, unitPrice: 0 };
}

export type Totals = { totalCost: number; totalPrice: number; margin: number; marginPct: number };

export function itemTotals(items: LineItem[] | undefined): Totals {
  let totalCost = 0;
  let totalPrice = 0;
  for (const it of items ?? []) {
    totalCost += num(it.qty) * num(it.unitCost);
    totalPrice += num(it.qty) * num(it.unitPrice);
  }
  const margin = totalPrice - totalCost;
  const marginPct = totalPrice ? (margin / totalPrice) * 100 : 0;
  return { totalCost, totalPrice, margin, marginPct };
}

export function rateOf(rec: Rec): number {
  if (!rec.currency || rec.currency === "PKR") return 1;
  return num(rec.exchangeRate);
}

/**
 * Stored totals so reports never re-type numbers. `amount` is the document's headline value
 * in its own currency; `amountPKR` is the same converted with the document's exchange rate.
 */
export function withTotals(rec: Rec, mode: ItemsMode | undefined, amountField?: string): Rec {
  const out: Rec = { ...rec };
  if (mode === "sale" || mode === "cost") {
    const t = itemTotals(rec.items);
    Object.assign(out, t);
    out.amount = mode === "sale" ? t.totalPrice : t.totalCost;
  } else if (amountField) {
    out.amount = num(rec[amountField]);
  }
  if (mode !== "basic" && "amount" in out) {
    const r = rateOf(out);
    out.amountPKR = num(out.amount) * r;
    if (mode === "sale") {
      out.totalCostPKR = num(out.totalCost) * r;
      out.marginPKR = num(out.margin) * r;
    }
  }
  return out;
}

// ---------- dates ----------
// Local calendar dates (not UTC) so "today" is right in Pakistan after midnight.
const localDate = (d: Date) => d.toLocaleDateString("en-CA");
export const today = () => localDate(new Date());
export const daysFromToday = (n: number) => localDate(new Date(Date.now() + n * 86400000));

export function daysBetween(from?: string, to?: string): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Late days vs an expected date. Pending items past their date count as overdue. */
export function lateness(expected?: string, actual?: string): { days: number; overdue: boolean } | null {
  if (!expected) return null;
  if (actual) return { days: Math.max(0, daysBetween(expected, actual) ?? 0), overdue: false };
  const d = daysBetween(expected, today()) ?? 0;
  return d > 0 ? { days: d, overdue: true } : { days: 0, overdue: false };
}

export const monthKey = (d?: string) => (d ? d.slice(0, 7) : "");
export const yearKey = (d?: string) => (d ? d.slice(0, 4) : "");

// ---------- formatting ----------
const nf0 = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });

export const fmtNum = (n: unknown, digits = 0) => (digits ? nf2 : nf0).format(num(n));

export function fmtMoney(n: unknown, currency = "PKR") {
  return `${currency} ${nf0.format(num(n))}`;
}

export function fmtCompact(n: unknown) {
  const v = num(n);
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return nf0.format(v);
}

export const fmtPct = (n: unknown) => `${num(n).toFixed(1)}%`;

export function fmtDate(d?: string) {
  if (!d) return "";
  const t = Date.parse(d);
  if (Number.isNaN(t)) return d;
  return new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtMonth(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}
