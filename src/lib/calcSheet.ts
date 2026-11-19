import { num } from "./calc";

/**
 * Client "Calculation Sheet": one row per cost head, each entered either as a
 * fixed amount ("1500") or a percentage ("2%"). Amounts are in the document's currency.
 *
 * Percent bases follow import valuation:
 *  - ordinary heads: % of the ex-works factory price
 *  - Customs Duty: % of the CIF value (ex-works through insurance)
 *  - Sales Tax: % of CIF + Customs Duty
 *  - Advance Income Tax: % of CIF + Customs Duty + Sales Tax
 */
export type CalcHeadKey =
  | "packing" | "inland" | "exportDecl" | "fob" | "freight" | "insurance" | "destPort"
  | "customsDuty" | "salesTax" | "incomeTax"
  | "clearing" | "bankVendor" | "bankClient" | "lcCharges";

export type CalcHead = { key: CalcHeadKey; label: string; base: "exWorks" | "cif" | "cifCd" | "cifCdSt"; tax?: boolean; cif?: boolean };

export const CALC_HEADS: CalcHead[] = [
  { key: "packing", label: "Seaworthy Packing Charges", base: "exWorks", cif: true },
  { key: "inland", label: "Inland Transportation Charges", base: "exWorks", cif: true },
  { key: "exportDecl", label: "Export Declaration Charges", base: "exWorks", cif: true },
  { key: "fob", label: "FOB / Port Charges", base: "exWorks", cif: true },
  { key: "freight", label: "Sea/Air Freight Charges", base: "exWorks", cif: true },
  { key: "insurance", label: "Insurance Charges", base: "exWorks", cif: true },
  { key: "destPort", label: "Destination Port Charges (THC, D/O, Handling)", base: "exWorks" },
  { key: "customsDuty", label: "Customs Duty (CD)", base: "cif", tax: true },
  { key: "salesTax", label: "Sales Tax (GST / VAT)", base: "cifCd", tax: true },
  { key: "incomeTax", label: "Advance Income Tax (WHT)", base: "cifCdSt", tax: true },
  { key: "clearing", label: "Clearing Agent Fee & Port Charges", base: "exWorks" },
  { key: "bankVendor", label: "Bank Charges (Payment to Vendor)", base: "exWorks" },
  { key: "bankClient", label: "Bank Charges (Payment Receive from Client)", base: "exWorks" },
  { key: "lcCharges", label: "CAD - L/C Charges", base: "exWorks" },
];

/** Section headings the sheet is grouped under, by the first head of each section. */
export const CALC_SECTIONS: Partial<Record<CalcHeadKey, string>> = {
  packing: "Export & shipping",
  customsDuty: "Duties & taxes",
  clearing: "Clearing & bank",
};

export const BASE_HINT: Record<CalcHead["base"], string> = {
  exWorks: "% of ex-works price",
  cif: "% of CIF value",
  cifCd: "% of CIF + customs duty",
  cifCdSt: "% of CIF + duty + sales tax",
};

export type CalcSheetInput = {
  /** Ex-works price override; empty means use the items' cost total. */
  exWorks?: number | null;
  /** Sale value override; empty means use the document's sale value. */
  saleValue?: number | null;
  /** Raw "% or fixed" entries, e.g. { freight: "1200", customsDuty: "20%" }. */
  rows?: Partial<Record<CalcHeadKey, string>>;
};

export type CalcSheetResult = {
  exWorks: number;
  saleValue: number;
  amounts: Record<CalcHeadKey, number>;
  totalExpenses: number;
  landedCost: number;
  /** Ex-works plus packing, inland transport, export declaration and FOB charges. */
  fobValue: number;
  /** FOB plus sea/air freight. */
  cfrValue: number;
  netMargin: number;
  netMarginPct: number;
};

/** "2%" → percent 2, "1,500" → fixed 1500, "" → nothing. */
export function parseCharge(raw: string | undefined): { pct: boolean; value: number } | null {
  const t = String(raw ?? "").replace(/,/g, "").trim();
  if (!t) return null;
  const pct = t.endsWith("%");
  const value = Number(pct ? t.slice(0, -1).trim() : t);
  return Number.isFinite(value) ? { pct, value } : null;
}

export function computeCalcSheet(input: CalcSheetInput | undefined, defaults: { exWorks: number; saleValue: number }): CalcSheetResult {
  const rows = input?.rows ?? {};
  const exWorks = input?.exWorks != null && String(input.exWorks) !== "" ? num(input.exWorks) : num(defaults.exWorks);
  const saleValue = input?.saleValue != null && String(input.saleValue) !== "" ? num(input.saleValue) : num(defaults.saleValue);
  const amounts = {} as Record<CalcHeadKey, number>;
  const bases = { exWorks, cif: exWorks, cifCd: 0, cifCdSt: 0 };

  const amountFor = (h: CalcHead) => {
    const c = parseCharge(rows[h.key]);
    if (!c) return 0;
    return c.pct ? (bases[h.base] * c.value) / 100 : c.value;
  };

  // CIF heads first, then the taxes in cascade, then everything else.
  for (const h of CALC_HEADS.filter((h) => h.cif)) { amounts[h.key] = amountFor(h); bases.cif += amounts[h.key]; }
  amounts.customsDuty = amountFor(CALC_HEADS.find((h) => h.key === "customsDuty")!);
  bases.cifCd = bases.cif + amounts.customsDuty;
  amounts.salesTax = amountFor(CALC_HEADS.find((h) => h.key === "salesTax")!);
  bases.cifCdSt = bases.cifCd + amounts.salesTax;
  amounts.incomeTax = amountFor(CALC_HEADS.find((h) => h.key === "incomeTax")!);
  for (const h of CALC_HEADS) if (amounts[h.key] === undefined) amounts[h.key] = amountFor(h);

  const totalExpenses = CALC_HEADS.reduce((sum, h) => sum + amounts[h.key], 0);
  const landedCost = exWorks + totalExpenses;
  const netMargin = saleValue - landedCost;
  const fobValue = exWorks + amounts.packing + amounts.inland + amounts.exportDecl + amounts.fob;
  const cfrValue = fobValue + amounts.freight;
  return { exWorks, saleValue, amounts, totalExpenses, landedCost, fobValue, cfrValue, netMargin, netMarginPct: saleValue ? (netMargin / saleValue) * 100 : 0 };
}
