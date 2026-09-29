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

export function rateOf(rec: Partial<Rec>): number {
  if (!rec.currency || rec.currency === "PKR") return 1;
  return num(rec.exchangeRate);
}

export type CostSheetAnalysis = {
  totalQty: number;
  totalSale: number;
  totalSalePKR: number;
  totalPurchaseCost: number;
  totalPurchaseCostPKR: number;
  grossProfitPKR: number;
  grossMarginPct: number;
  totalExtraCostsPKR: number;
  totalCommissionPKR: number;
  operatingProfitPKR: number;
  operatingMarginPct: number;
  whtSaleAmountPKR: number;
  whtImportAmountPKR: number;
  gstOutputAmountPKR: number;
  gstInputAmountPKR: number;
  netGstPayablePKR: number;
  incomeTaxAmountPKR: number;
  totalTaxPayablePKR: number;
  netProfitPKR: number;
  netMarginPct: number;
  totalLandedCostPKR: number;
  landedCostPerUnit: number;
  breakEvenPricePKR: number;
  breakEvenPriceDealCurrency: number;
  netProfitPerUnit: number;
};

export function computeCostSheet(rec: Partial<Rec>): CostSheetAnalysis {
  const saleRate = rateOf(rec);
  const purchaseCur = rec.purchaseCurrency || rec.currency || "PKR";
  const purchaseRate = purchaseCur === "PKR" ? 1 : num(rec.purchaseExchangeRate || rec.exchangeRate || 1);

  // Line items
  const items: LineItem[] = rec.items ?? [];
  let totalQty = 0;
  let totalSale = 0;
  let totalPurchaseCost = 0;

  for (const it of items) {
    const q = num(it.qty);
    totalQty += q;
    totalSale += q * num(it.unitPrice);
    totalPurchaseCost += q * num(it.unitCost);
  }

  // If manual override totals are provided
  if (!items.length && rec.totalSale) {
    totalSale = num(rec.totalSale);
    totalPurchaseCost = num(rec.totalPurchaseCost);
    totalQty = num(rec.totalQty || 1);
  }

  const totalSalePKR = totalSale * saleRate;
  const totalPurchaseCostPKR = totalPurchaseCost * purchaseRate;
  const grossProfitPKR = totalSalePKR - totalPurchaseCostPKR;
  const grossMarginPct = totalSalePKR > 0 ? (grossProfitPKR / totalSalePKR) * 100 : 0;

  // Extra expenses (array + dedicated fields)
  let totalExtraCostsPKR = 0;
  if (Array.isArray(rec.extraCosts)) {
    for (const c of rec.extraCosts) {
      const r = c.currency === "PKR" || !c.currency ? 1 : num(c.exchangeRate || saleRate);
      totalExtraCostsPKR += num(c.amount) * r;
    }
  }

  // Itemized shortcut fields if set
  const freightPKR = num(rec.freightAmount) * (rec.freightCurrency && rec.freightCurrency !== "PKR" ? num(rec.freightRate || saleRate) : 1);
  const customsDutyPKR = num(rec.customsDutyAmount) * (rec.customsCurrency && rec.customsCurrency !== "PKR" ? num(rec.customsRate || saleRate) : 1);
  const clearingPKR = num(rec.clearingAmount);
  const portDemurragePKR = num(rec.portDemurrageAmount);
  const insurancePKR = num(rec.insuranceAmount);
  const bankChargesPKR = num(rec.bankChargesAmount);
  const cartagePKR = num(rec.cartageAmount);
  const inspectionPKR = num(rec.inspectionAmount);
  const otherExpensesPKR = num(rec.otherExpensesAmount);

  totalExtraCostsPKR += freightPKR + customsDutyPKR + clearingPKR + portDemurragePKR + insurancePKR + bankChargesPKR + cartagePKR + inspectionPKR + otherExpensesPKR;

  // Commission
  let totalCommissionPKR = 0;
  if (Array.isArray(rec.commissions)) {
    for (const comm of rec.commissions) {
      if (comm.type === "percent_sale") {
        totalCommissionPKR += totalSalePKR * (num(comm.rate) / 100);
      } else if (comm.type === "percent_purchase") {
        totalCommissionPKR += totalPurchaseCostPKR * (num(comm.rate) / 100);
      } else if (comm.type === "per_unit") {
        totalCommissionPKR += totalQty * num(comm.rate);
      } else {
        totalCommissionPKR += num(comm.amountPKR || comm.rate);
      }
    }
  }

  // Quick commission fields
  if (rec.commissionRate && (!Array.isArray(rec.commissions) || !rec.commissions.length)) {
    const cType = rec.commissionType || "percent_sale";
    const cRate = num(rec.commissionRate);
    if (cType === "percent_sale") {
      totalCommissionPKR += totalSalePKR * (cRate / 100);
    } else if (cType === "percent_purchase") {
      totalCommissionPKR += totalPurchaseCostPKR * (cRate / 100);
    } else if (cType === "per_unit") {
      totalCommissionPKR += totalQty * cRate;
    } else {
      totalCommissionPKR += cRate;
    }
  } else if (rec.commissionAmount && (!Array.isArray(rec.commissions) || !rec.commissions.length)) {
    totalCommissionPKR += num(rec.commissionAmount);
  }

  // Operating profit before tax
  const operatingProfitPKR = grossProfitPKR - totalExtraCostsPKR - totalCommissionPKR;
  const operatingMarginPct = totalSalePKR > 0 ? (operatingProfitPKR / totalSalePKR) * 100 : 0;

  // Taxes
  const whtSaleRate = num(rec.whtSaleRate || 0);
  const whtSaleAmountPKR = totalSalePKR * (whtSaleRate / 100);

  const whtImportRate = num(rec.whtImportRate || 0);
  const whtImportAmountPKR = totalPurchaseCostPKR * (whtImportRate / 100);

  const gstOutputRate = num(rec.gstOutputRate || 0);
  const gstInputRate = num(rec.gstInputRate || 0);
  const gstOutputAmountPKR = totalSalePKR * (gstOutputRate / 100);
  const gstInputAmountPKR = totalPurchaseCostPKR * (gstInputRate / 100);
  const netGstPayablePKR = Math.max(0, gstOutputAmountPKR - gstInputAmountPKR);

  const incomeTaxRate = num(rec.incomeTaxRate || (rec.applyIncomeTax ? 29 : 0));
  const incomeTaxAmountPKR = operatingProfitPKR > 0 ? operatingProfitPKR * (incomeTaxRate / 100) : 0;

  const taxMode = rec.taxMode || "wht";
  let totalTaxPayablePKR = 0;
  if (taxMode === "wht") {
    totalTaxPayablePKR = whtSaleAmountPKR + whtImportAmountPKR + netGstPayablePKR;
  } else if (taxMode === "corporate") {
    totalTaxPayablePKR = incomeTaxAmountPKR + netGstPayablePKR;
  } else if (taxMode === "both") {
    totalTaxPayablePKR = Math.max(whtSaleAmountPKR, incomeTaxAmountPKR) + whtImportAmountPKR + netGstPayablePKR;
  } else {
    totalTaxPayablePKR = 0;
  }

  const directTaxOutflow = taxMode === "corporate" ? incomeTaxAmountPKR : whtSaleAmountPKR;
  const netProfitPKR = operatingProfitPKR - directTaxOutflow;
  const netMarginPct = totalSalePKR > 0 ? (netProfitPKR / totalSalePKR) * 100 : 0;

  const totalLandedCostPKR = totalPurchaseCostPKR + totalExtraCostsPKR + totalCommissionPKR;
  const landedCostPerUnit = totalQty > 0 ? totalLandedCostPKR / totalQty : 0;

  const whtDivisor = Math.max(0.01, 1 - (taxMode === "corporate" ? 0 : whtSaleRate / 100));
  const breakEvenTotalPKR = totalLandedCostPKR / whtDivisor;
  const breakEvenPricePKR = totalQty > 0 ? breakEvenTotalPKR / totalQty : 0;
  const breakEvenPriceDealCurrency = saleRate > 0 ? breakEvenPricePKR / saleRate : breakEvenPricePKR;

  const netProfitPerUnit = totalQty > 0 ? netProfitPKR / totalQty : 0;

  return {
    totalQty,
    totalSale,
    totalSalePKR,
    totalPurchaseCost,
    totalPurchaseCostPKR,
    grossProfitPKR,
    grossMarginPct,
    totalExtraCostsPKR,
    totalCommissionPKR,
    operatingProfitPKR,
    operatingMarginPct,
    whtSaleAmountPKR,
    whtImportAmountPKR,
    gstOutputAmountPKR,
    gstInputAmountPKR,
    netGstPayablePKR,
    incomeTaxAmountPKR,
    totalTaxPayablePKR,
    netProfitPKR,
    netMarginPct,
    totalLandedCostPKR,
    landedCostPerUnit,
    breakEvenPricePKR,
    breakEvenPriceDealCurrency,
    netProfitPerUnit,
  };
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

  // If this record has costSheet / trading attributes, compute full costing analysis
  if (rec.extraCosts || rec.whtSaleRate || rec.commissions || rec.isCostSheet || rec.purchaseCurrency) {
    const analysis = computeCostSheet(out);
    Object.assign(out, analysis);
    if (!out.amount) out.amount = analysis.totalSale;
    if (!out.amountPKR) out.amountPKR = analysis.totalSalePKR;
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
