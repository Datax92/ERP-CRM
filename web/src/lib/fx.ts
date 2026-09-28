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
  TRY: "₺",
};

export type ExchangeRateData = {
  base: string;
  rates: Record<string, number>;
  timeLastUpdate?: string;
};

const ratesCache = new Map<string, { data: ExchangeRateData; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fetches all current exchange rates for a base currency from open.er-api.com.
 * Uses in-memory caching to avoid redundant calls.
 */
export async function fetchExchangeRates(base = "USD"): Promise<ExchangeRateData> {
  const normBase = (base || "USD").toUpperCase();
  const cached = ratesCache.get(normBase);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

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
  };

  ratesCache.set(normBase, { data: result, timestamp: Date.now() });
  return result;
}

/**
 * Latest rate for 1 unit of `currency` in PKR, from open.er-api.com.
 * The user can always override the value.
 */
export async function fetchRateToPKR(currency: string): Promise<number> {
  const cur = (currency || "PKR").toUpperCase();
  if (cur === "PKR") return 1;
  const rates = await fetchExchangeRates(cur);
  const rate = rates.rates.PKR;
  if (!rate) throw new Error(`PKR rate not available for ${cur}`);
  return Math.round(rate * 100) / 100;
}

/**
 * Convert an amount between any two currencies.
 * If document rate to PKR is provided, it prioritizes that custom rate for PKR conversions.
 */
export function convertCurrency({
  amount,
  from,
  to,
  docRateToPKR,
  ratesData,
}: {
  amount: number;
  from: string;
  to: string;
  docRateToPKR?: number;
  ratesData?: ExchangeRateData;
}): { converted: number; rate: number } {
  const normFrom = (from || "PKR").toUpperCase();
  const normTo = (to || "PKR").toUpperCase();

  if (normFrom === normTo) {
    return { converted: amount, rate: 1 };
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

  // If we have rates data for the `from` currency:
  if (ratesData && ratesData.base === normFrom && ratesData.rates[normTo]) {
    const rate = ratesData.rates[normTo]!;
    return { converted: amount * rate, rate };
  }

  // If we have rates data with another base (e.g. USD):
  if (ratesData && ratesData.rates[normFrom] && ratesData.rates[normTo]) {
    const rateFrom = ratesData.rates[normFrom]!;
    const rateTo = ratesData.rates[normTo]!;
    const crossRate = rateTo / rateFrom;
    return { converted: amount * crossRate, rate: crossRate };
  }

  // Fallback: If docRateToPKR is present and converting between foreign currencies
  if (docRateToPKR && normFrom !== "PKR") {
    const amountInPKR = amount * docRateToPKR;
    if (normTo === "PKR") return { converted: amountInPKR, rate: docRateToPKR };
  }

  return { converted: amount, rate: 1 };
}

