import { fmtNum, fmtPct, num } from "./calc";
import type { CollectionName, Rec } from "./types";

/**
 * Currencies prominently used in the trade ERP and quick-switch pills.
 */
export const MAJOR_CURRENCIES = ["PKR", "USD", "EUR", "AED", "SAR", "CNY", "GBP"] as const;

export const CURRENCY_SYMBOLS: Record<string, string> = {
  PKR: "₨",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "AED",
  SAR: "SAR",
  CNY: "¥",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
  TRY: "₺",
};

export type ExchangeRateData = {
  base: string;
  rates: Record<string, number>;
  timeLastUpdate?: string;
  source?: "live" | "cache" | "fallback";
};

const ratesCache = new Map<string, { data: ExchangeRateData; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache for real-time freshness

// Fallback rates if network is offline
export const FALLBACK_RATES_USD: Record<string, number> = {
  USD: 1,
  PKR: 276.91,
  EUR: 0.88,
  GBP: 0.75,
  AED: 3.67,
  SAR: 3.75,
  CNY: 7.23,
  JPY: 154.5,
  CAD: 1.39,
  AUD: 1.54,
  TRY: 34.2,
};

/**
 * Fetches all current exchange rates for a base currency from open.er-api.com.
 * Uses in-memory and localStorage caching to ensure high speed and offline availability.
 * When force = true, it bypasses the cache and gets up-to-the-minute market rates.
 */
export async function fetchExchangeRates(base = "USD", force = false): Promise<ExchangeRateData> {
  const normBase = (base || "USD").toUpperCase();

  if (!force) {
    const cached = ratesCache.get(normBase);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // Try loading from localStorage
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`trade_erp_rates_${normBase}`);
        if (stored) {
          const parsed = JSON.parse(stored) as { data: ExchangeRateData; timestamp: number };
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
            ratesCache.set(normBase, parsed);
            return parsed.data;
          }
        }
      } catch {
        // Ignore localStorage read errors
      }
    }
  }

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(normBase)}`);
    if (!res.ok) throw new Error(`Rate service returned status ${res.status}`);
    const json = (await res.json()) as {
      result?: string;
      base_code?: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };

    if (json.result !== "success" || !json.rates) {
      throw new Error("Exchange rates data unavailable");
    }

    const result: ExchangeRateData = {
      base: json.base_code || normBase,
      rates: json.rates,
      timeLastUpdate: json.time_last_update_utc,
      source: "live",
    };

    ratesCache.set(normBase, { data: result, timestamp: Date.now() });

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          `trade_erp_rates_${normBase}`,
          JSON.stringify({ data: result, timestamp: Date.now() })
        );
      } catch {
        // Ignore storage write error
      }
    }

    return result;
  } catch (err) {
    // Check if we have cached rates from previous fetch
    const cached = ratesCache.get(normBase);
    if (cached) return { ...cached.data, source: "cache" };

    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`trade_erp_rates_${normBase}`);
        if (stored) {
          const parsed = JSON.parse(stored) as { data: ExchangeRateData };
          if (parsed.data?.rates) return { ...parsed.data, source: "cache" };
        }
      } catch {
        // Ignore
      }
    }

    // Fallback to offline defaults
    return {
      base: "USD",
      rates: FALLBACK_RATES_USD,
      timeLastUpdate: new Date().toUTCString(),
      source: "fallback",
    };
  }
}

/**
 * Calculates the exact live cross exchange rate from one currency to another in real-time.
 */
export function getLiveRate({
  from,
  to,
  ratesData,
}: {
  from: string;
  to: string;
  ratesData?: ExchangeRateData | null;
}): number {
  const normFrom = (from || "PKR").toUpperCase();
  const normTo = (to || "PKR").toUpperCase();
  if (normFrom === normTo) return 1;

  const rates = ratesData?.rates ?? FALLBACK_RATES_USD;
  const base = (ratesData?.base || "USD").toUpperCase();

  const rateToFrom = normFrom === base ? 1 : rates[normFrom];
  const rateToTo = normTo === base ? 1 : rates[normTo];

  if (rateToFrom && rateToTo && rateToFrom > 0) {
    return rateToTo / rateToFrom;
  }

  // Cross-rate via USD fallback
  const fallbackFrom = FALLBACK_RATES_USD[normFrom] ?? 1;
  const fallbackTo = FALLBACK_RATES_USD[normTo] ?? 1;
  return fallbackTo / fallbackFrom;
}

/**
 * Latest rate for 1 unit of `currency` in PKR, fetched in real-time.
 */
export async function fetchRateToPKR(currency: string, force = false): Promise<number> {
  const cur = (currency || "PKR").toUpperCase();
  if (cur === "PKR") return 1;
  const rates = await fetchExchangeRates("USD", force);
  const rate = getLiveRate({ from: cur, to: "PKR", ratesData: rates });
  return Math.round(rate * 100) / 100;
}

/**
 * Convert an amount between any two currencies.
 * Supports realtime live market rates (preferred for current and previous entries)
 * or saved document rates.
 */
export function convertCurrency({
  amount,
  from,
  to,
  docRateToPKR,
  ratesData,
  preferRealtime = false,
}: {
  amount: number;
  from: string;
  to: string;
  docRateToPKR?: number;
  ratesData?: ExchangeRateData | null;
  preferRealtime?: boolean;
}): { converted: number; rate: number } {
  const normFrom = (from || "PKR").toUpperCase();
  const normTo = (to || "PKR").toUpperCase();

  if (normFrom === normTo) {
    return { converted: amount, rate: 1 };
  }

  // If real-time is preferred or docRateToPKR is uncalibrated (e.g. 1 for USD, which is clearly a default):
  const isUncalibrated = normFrom !== "PKR" && (!docRateToPKR || docRateToPKR <= 1);
  if (preferRealtime || isUncalibrated) {
    const rate = getLiveRate({ from: normFrom, to: normTo, ratesData });
    return { converted: amount * rate, rate };
  }

  // If converting from foreign currency to PKR and a document exchange rate is specified:
  if (normTo === "PKR" && normFrom !== "PKR" && docRateToPKR && docRateToPKR > 0) {
    return { converted: amount * docRateToPKR, rate: docRateToPKR };
  }

  // If converting from PKR to foreign currency and document rate is specified:
  if (normFrom === "PKR" && normTo !== "PKR" && docRateToPKR && docRateToPKR > 0) {
    const rate = 1 / docRateToPKR;
    return { converted: amount * rate, rate };
  }

  // If ratesData available:
  const rate = getLiveRate({ from: normFrom, to: normTo, ratesData });
  return { converted: amount * rate, rate };
}

/**
 * Extract financial information from any ERP record.
 */
export function getRecordAmount(col: CollectionName, r: Rec): {
  amount: number;
  currency: string;
  savedRate: number;
  totalCost?: number;
  margin?: number;
  direction?: string;
  qty?: number;
} {
  const currency = (r.currency || "PKR").toUpperCase();
  const savedRate = num(r.exchangeRate) || 1;
  let amount = 0;
  let totalCost: number | undefined;
  let margin: number | undefined;
  let direction: string | undefined;
  let qty: number | undefined;

  switch (col) {
    case "quotations":
    case "salesOrders": {
      amount = num(r.amount);
      if (!amount && r.items?.length) {
        amount = r.items.reduce((s: number, i: any) => s + num(i.qty) * num(i.unitPrice), 0);
      }
      totalCost = num(r.totalCost);
      if (!totalCost && r.items?.length) {
        totalCost = r.items.reduce((s: number, i: any) => s + num(i.qty) * num(i.unitCost), 0);
      }
      margin = num(r.margin ?? (amount - (totalCost || 0)));
      break;
    }
    case "purchaseOrders": {
      amount = num(r.amount);
      if (!amount && r.items?.length) {
        amount = r.items.reduce((s: number, i: any) => s + num(i.qty) * num(i.unitCost), 0);
      }
      totalCost = amount;
      break;
    }
    case "proformaInvoices": {
      amount = num(r.amount);
      if (!amount && r.items?.length) {
        amount = r.items.reduce(
          (s: number, i: any) =>
            s + num(i.qty) * (r.type === "From Supplier" ? num(i.unitCost) : num(i.unitPrice)),
          0
        );
      }
      break;
    }
    case "payments": {
      amount = num(r.amount);
      direction = r.direction ?? "Received";
      break;
    }
    case "expenses": {
      amount = num(r.amountValue ?? r.amount ?? num(r.qty || 1) * num(r.unitCost));
      break;
    }
    case "financeEntries": {
      amount = num(r.amountValue ?? r.amount ?? num(r.qty || 1) * num(r.unitCost));
      direction = r.direction ?? "Out";
      break;
    }
    case "investors": {
      amount = num(r.principal ?? r.amount);
      break;
    }
    case "companyDocs": {
      amount = num(r.amountValue ?? r.amount);
      break;
    }
    case "rfqs": {
      qty = (r.items ?? []).reduce((s: number, i: any) => s + num(i.qty), 0);
      break;
    }
    default: {
      amount = num(r.amount ?? r.total ?? r.price ?? 0);
      break;
    }
  }

  return { amount, currency, savedRate, totalCost, margin, direction, qty };
}

export type TotalSummaryResult = {
  total: number;
  totalPKR: number;
  targetCurrency: string;
  count: number;
  totalCost?: number;
  totalMargin?: number;
  marginPct?: number;
  totalReceived?: number;
  totalPaid?: number;
  netPayment?: number;
  totalQty?: number;
  hasAmounts: boolean;
  currencies: Record<string, { count: number; totalAmount: number }>;
  ratesUsed: Record<string, number>;
};

/**
 * Calculates the aggregated total across all entries in a module.
 * Converts every entry (current and previous) to the target currency using
 * real-time exchange rates (or saved document rates if selected).
 */
export function calculateEntriesTotal({
  rows,
  col,
  targetCurrency = "PKR",
  ratesData,
  rateMode = "realtime",
}: {
  rows: Rec[];
  col: CollectionName;
  targetCurrency?: string;
  ratesData?: ExchangeRateData | null;
  rateMode?: "realtime" | "saved";
}): TotalSummaryResult {
  const normTarget = (targetCurrency || "PKR").toUpperCase();
  let total = 0;
  let totalPKR = 0;
  let totalCost = 0;
  let totalMargin = 0;
  let totalReceived = 0;
  let totalPaid = 0;
  let totalQty = 0;
  let hasAmounts = false;

  const currencies: Record<string, { count: number; totalAmount: number }> = {};
  const ratesUsed: Record<string, number> = {};

  for (const r of rows) {
    const info = getRecordAmount(col, r);
    const cur = info.currency;

    if (!currencies[cur]) {
      currencies[cur] = { count: 0, totalAmount: 0 };
    }
    currencies[cur].count++;
    currencies[cur].totalAmount += info.amount;

    if (info.qty != null) {
      totalQty += info.qty;
    }

    if (info.amount > 0 || info.totalCost != null) {
      hasAmounts = true;
    }

    // Determine exchange rate to target and to PKR
    let rateToTarget: number;
    let rateToPKR: number;

    if (rateMode === "saved") {
      // Use saved document rate to PKR, then convert PKR to target
      rateToPKR = cur === "PKR" ? 1 : info.savedRate;
      const pkrToTarget = getLiveRate({ from: "PKR", to: normTarget, ratesData });
      rateToTarget = rateToPKR * pkrToTarget;
    } else {
      // Strict real-time market rates for this and previous entries
      rateToTarget = getLiveRate({ from: cur, to: normTarget, ratesData });
      rateToPKR = getLiveRate({ from: cur, to: "PKR", ratesData });
    }

    ratesUsed[cur] = rateToTarget;

    const convertedAmount = info.amount * rateToTarget;
    const amountInPKR = info.amount * rateToPKR;

    if (col === "payments") {
      if (info.direction === "Paid") {
        totalPaid += convertedAmount;
      } else {
        totalReceived += convertedAmount;
      }
      total += convertedAmount;
    } else {
      total += convertedAmount;
    }

    totalPKR += amountInPKR;

    if (info.totalCost != null) {
      totalCost += info.totalCost * rateToTarget;
    }
    if (info.margin != null) {
      totalMargin += info.margin * rateToTarget;
    }
  }

  const isSale = col === "quotations" || col === "salesOrders";
  const hasMargin = isSale && (total > 0 || totalCost > 0);
  const marginPct = total > 0 ? (totalMargin / total) * 100 : 0;
  const netPayment = totalReceived - totalPaid;

  return {
    total,
    totalPKR,
    targetCurrency: normTarget,
    count: rows.length,
    totalCost: hasMargin || col === "purchaseOrders" ? totalCost : undefined,
    totalMargin: hasMargin ? totalMargin : undefined,
    marginPct: hasMargin ? marginPct : undefined,
    totalReceived: col === "payments" ? totalReceived : undefined,
    totalPaid: col === "payments" ? totalPaid : undefined,
    netPayment: col === "payments" ? netPayment : undefined,
    totalQty: col === "rfqs" ? totalQty : undefined,
    hasAmounts,
    currencies,
    ratesUsed,
  };
}
