"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Coins, RefreshCw, Zap } from "lucide-react";
import { useStore } from "./DataProvider";
import { fmtNum, fmtPct, num } from "@/lib/calc";
import {
  convertCurrency,
  fetchExchangeRates,
  fetchRateToPKR,
  getLiveRate,
  MAJOR_CURRENCIES,
  type ExchangeRateData,
} from "@/lib/fx";

export type TotalPriceConverterProps = {
  amount: number;
  currency: string;
  exchangeRate?: number;
  onRateChange?: (rate: number) => void;
  totalCost?: number;
  margin?: number;
  marginPct?: number;
  mode?: "sale" | "cost" | "amount" | "basic";
  label?: string;
  className?: string;
};

export function TotalPriceConverter({
  amount,
  currency,
  exchangeRate,
  onRateChange,
  totalCost,
  margin,
  marginPct,
  mode = "sale",
  label = "Total price",
  className = "",
}: TotalPriceConverterProps) {
  const { settings } = useStore();
  const docCurrency = (currency || "PKR").toUpperCase();
  const currentRateToPKR = docCurrency === "PKR" ? 1 : num(exchangeRate) || 1;

  // Default target currency: if doc is foreign, default to PKR; if doc is PKR, default to USD
  const [targetCurrency, setTargetCurrency] = useState<string>(
    docCurrency === "PKR" ? "USD" : "PKR"
  );
  const [ratesData, setRatesData] = useState<ExchangeRateData | null>(null);
  const [liveRatePKR, setLiveRatePKR] = useState<number | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [rateMode, setRateMode] = useState<"realtime" | "saved">("realtime");
  const [manualRateInput, setManualRateInput] = useState(String(currentRateToPKR));

  // Sync manual input when exchangeRate changes externally
  useEffect(() => {
    setManualRateInput(String(currentRateToPKR));
  }, [currentRateToPKR]);

  // Load exchange rates for doc currency
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchExchangeRates("USD");
        if (!cancelled) {
          setRatesData(data);
          const live = getLiveRate({ from: docCurrency, to: "PKR", ratesData: data });
          setLiveRatePKR(Math.round(live * 100) / 100);

          // Auto-apply live rate if currentRateToPKR is default 1 for foreign currency
          if (docCurrency !== "PKR" && onRateChange && (!exchangeRate || exchangeRate <= 1)) {
            onRateChange(Math.round(live * 100) / 100);
          }
        }
      } catch {
        // Fall back gracefully
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docCurrency]);

  // Active rate to PKR depending on rateMode
  const activeRateToPKR = useMemo(() => {
    if (docCurrency === "PKR") return 1;
    if (rateMode === "realtime" && liveRatePKR && liveRatePKR > 0) {
      return liveRatePKR;
    }
    return currentRateToPKR > 1 ? currentRateToPKR : (liveRatePKR ?? 276.91);
  }, [docCurrency, rateMode, liveRatePKR, currentRateToPKR]);

  // Amount in PKR
  const amountPKR = useMemo(() => {
    if (docCurrency === "PKR") return amount;
    return amount * activeRateToPKR;
  }, [amount, docCurrency, activeRateToPKR]);

  // Converted amount in target currency using realtime or saved rate
  const { converted: convertedTotal, rate: targetRate } = useMemo(() => {
    return convertCurrency({
      amount,
      from: docCurrency,
      to: targetCurrency,
      docRateToPKR: activeRateToPKR,
      ratesData: ratesData ?? undefined,
      preferRealtime: rateMode === "realtime",
    });
  }, [amount, docCurrency, targetCurrency, activeRateToPKR, ratesData, rateMode]);

  // Converted cost and margin (if sale mode)
  const convertedCost = useMemo(() => {
    if (totalCost == null) return null;
    return convertCurrency({
      amount: totalCost,
      from: docCurrency,
      to: targetCurrency,
      docRateToPKR: activeRateToPKR,
      ratesData: ratesData ?? undefined,
      preferRealtime: rateMode === "realtime",
    }).converted;
  }, [totalCost, docCurrency, targetCurrency, activeRateToPKR, ratesData, rateMode]);

  const convertedMargin = useMemo(() => {
    if (margin == null) return null;
    return convertCurrency({
      amount: margin,
      from: docCurrency,
      to: targetCurrency,
      docRateToPKR: activeRateToPKR,
      ratesData: ratesData ?? undefined,
      preferRealtime: rateMode === "realtime",
    }).converted;
  }, [margin, docCurrency, targetCurrency, activeRateToPKR, ratesData, rateMode]);

  async function handleFetchLiveRate() {
    if (docCurrency === "PKR") return;
    setFetchingRate(true);
    try {
      const data = await fetchExchangeRates("USD", true);
      setRatesData(data);
      const live = getLiveRate({ from: docCurrency, to: "PKR", ratesData: data });
      const rounded = Math.round(live * 100) / 100;
      setLiveRatePKR(rounded);
      if (onRateChange) onRateChange(rounded);
      setManualRateInput(String(rounded));
    } catch {
      // Ignore network errors
    } finally {
      setFetchingRate(false);
    }
  }

  function handleSaveRate() {
    const val = Number(manualRateInput);
    if (val > 0 && onRateChange) {
      onRateChange(val);
    }
    setEditingRate(false);
  }

  const allCurrencies = useMemo(() => {
    const set = new Set([...MAJOR_CURRENCIES, ...(settings.currencies ?? [])]);
    return Array.from(set);
  }, [settings.currencies]);

  const isSale = mode === "sale";
  const hasCost = mode === "cost" || isSale;

  return (
    <div className={`mt-3 rounded-lg border border-line bg-surface p-3.5 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-accent-soft text-accent">
            <Coins size={15} />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold text-ink">
              {label} & Currency Converter
            </h4>
            <p className="text-[11px] text-muted">
              Live multi-currency calculation and exchange rates
            </p>
          </div>
        </div>

        {/* Rate Mode Toggle & Live Rate */}
        <div className="flex flex-wrap items-center gap-2">
          {docCurrency !== "PKR" && (
            <div className="flex items-center gap-1 rounded bg-surface-2 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setRateMode("realtime")}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
                  rateMode === "realtime"
                    ? "bg-accent text-accent-ink shadow-xs"
                    : "text-muted hover:text-ink"
                }`}
                title="Use realtime live market rate"
              >
                <Zap size={11} /> Realtime Live Rate
              </button>
              <button
                type="button"
                onClick={() => setRateMode("saved")}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                  rateMode === "saved"
                    ? "bg-surface text-ink shadow-xs"
                    : "text-muted hover:text-ink"
                }`}
                title="Use saved document rate"
              >
                Document Rate
              </button>
            </div>
          )}

          {docCurrency !== "PKR" && (
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span>Rate:</span>
              {editingRate ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    className="field h-6 w-24 px-1.5 py-0 text-xs font-mono"
                    value={manualRateInput}
                    onChange={(e) => setManualRateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRate();
                      if (e.key === "Escape") setEditingRate(false);
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-primary h-6 px-1.5 text-[11px]"
                    onClick={handleSaveRate}
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="font-mono font-medium text-ink underline decoration-dashed hover:text-accent"
                  onClick={() => setEditingRate(true)}
                  title="Click to edit exchange rate"
                >
                  1 {docCurrency} = {fmtNum(activeRateToPKR, 2)} PKR
                </button>
              )}
              {onRateChange && (
                <button
                  type="button"
                  className="btn h-6 px-1.5 text-xs"
                  title="Fetch today's live rate from Open Exchange Rates"
                  onClick={handleFetchLiveRate}
                  disabled={fetchingRate}
                >
                  <RefreshCw size={11} className={fetchingRate ? "animate-spin" : ""} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Real-time Rate Notification if document rate differs */}
      {docCurrency !== "PKR" && liveRatePKR && Math.abs(currentRateToPKR - liveRatePKR) > 0.05 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300">
          <span>
            Today&apos;s real-time live rate is <strong>1 {docCurrency} = {fmtNum(liveRatePKR, 2)} PKR</strong> (Saved on record: {fmtNum(currentRateToPKR, 2)} PKR).
          </span>
          {onRateChange && (
            <button
              type="button"
              onClick={() => {
                onRateChange(liveRatePKR);
                setManualRateInput(String(liveRatePKR));
              }}
              className="font-semibold underline hover:text-amber-900 dark:hover:text-amber-100"
            >
              Apply Live Rate
            </button>
          )}
        </div>
      )}

      {/* Main Totals Display (Document vs Base PKR) */}
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {/* Document Total */}
        <div className="rounded-md border border-line bg-surface-2/60 p-2.5">
          <div className="flex items-center justify-between">
            <span className="eyebrow !text-muted">
              {docCurrency === "PKR" ? "Total Price" : `Total (${docCurrency})`}
            </span>
            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent">
              {docCurrency}
            </span>
          </div>
          <div className="mt-1 text-xl font-bold tracking-tight text-ink font-mono">
            {docCurrency} {fmtNum(amount, 2)}
          </div>

          {hasCost && totalCost != null && (
            <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted border-t border-line/60 pt-1.5">
              <span>Cost: {docCurrency} {fmtNum(totalCost, 2)}</span>
              {isSale && margin != null && (
                <span className={margin < 0 ? "text-bad font-medium" : "text-good font-medium"}>
                  Margin: {docCurrency} {fmtNum(margin, 2)} ({fmtPct(marginPct)})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Base PKR Total */}
        <div className="rounded-md border border-line bg-surface-2/60 p-2.5">
          <div className="flex items-center justify-between">
            <span className="eyebrow !text-muted">Company Base (PKR)</span>
            <span className="rounded bg-brass/10 px-1.5 py-0.5 text-[11px] font-semibold text-brass">
              PKR
            </span>
          </div>
          <div className="mt-1 text-xl font-bold tracking-tight text-ink font-mono">
            PKR {fmtNum(amountPKR, 2)}
          </div>

          {hasCost && totalCost != null && (
            <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted border-t border-line/60 pt-1.5">
              <span>Cost: PKR {fmtNum(totalCost * activeRateToPKR, 2)}</span>
              {isSale && margin != null && (
                <span className={margin < 0 ? "text-bad font-medium" : "text-good font-medium"}>
                  Margin: PKR {fmtNum(margin * activeRateToPKR, 2)} ({fmtPct(marginPct)})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Currency Converter Switcher */}
      <div className="mt-3 rounded-md border border-line/80 bg-surface-2/30 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
            <ArrowRightLeft size={13} className="text-accent" />
            <span>Convert total price to:</span>
          </span>

          {/* Quick Currency Pills */}
          <div className="flex flex-wrap items-center gap-1">
            {allCurrencies.slice(0, 7).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => setTargetCurrency(cur)}
                className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                  targetCurrency === cur
                    ? "bg-accent text-accent-ink shadow-xs"
                    : "bg-surface border border-line text-muted hover:text-ink hover:bg-surface-2"
                }`}
              >
                {cur}
              </button>
            ))}

            {/* Select for other currencies */}
            <select
              className="field h-6 max-w-24 px-1.5 py-0 text-xs"
              value={targetCurrency}
              onChange={(e) => setTargetCurrency(e.target.value)}
              aria-label="Select target currency"
            >
              {allCurrencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Converted Output Banner */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-surface px-3 py-2">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Converted Total in {targetCurrency}
            </div>
            <div className="text-lg font-bold text-accent font-mono">
              {targetCurrency} {fmtNum(convertedTotal, 2)}
            </div>
          </div>

          <div className="text-right text-xs">
            <div className="text-muted">
              Real-time conversion rate:
            </div>
            <div className="font-mono font-medium text-ink">
              1 {docCurrency} = {fmtNum(targetRate, 4)} {targetCurrency}
            </div>
          </div>
        </div>

        {/* Converted Cost & Margin (if in sale mode and target is different) */}
        {isSale && convertedCost != null && convertedMargin != null && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
            <span>
              Converted cost:{" "}
              <strong className="text-ink">
                {targetCurrency} {fmtNum(convertedCost, 2)}
              </strong>
            </span>
            <span className={convertedMargin < 0 ? "text-bad" : "text-good"}>
              Converted margin:{" "}
              <strong>
                {targetCurrency} {fmtNum(convertedMargin, 2)}
              </strong>{" "}
              ({fmtPct(marginPct)})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
