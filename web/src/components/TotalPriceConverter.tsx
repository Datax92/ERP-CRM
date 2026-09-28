"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Coins, RefreshCw } from "lucide-react";
import { useStore } from "./DataProvider";
import { fmtNum, fmtPct, num } from "@/lib/calc";
import {
  convertCurrency,
  fetchExchangeRates,
  fetchRateToPKR,
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
  const [fetchingRate, setFetchingRate] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
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
        const base = docCurrency === "PKR" ? "USD" : docCurrency;
        const data = await fetchExchangeRates(base);
        if (!cancelled) setRatesData(data);
      } catch {
        // Fall back gracefully to PKR doc rate
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docCurrency]);

  // Amount in PKR
  const amountPKR = useMemo(() => {
    if (docCurrency === "PKR") return amount;
    return amount * currentRateToPKR;
  }, [amount, docCurrency, currentRateToPKR]);

  // Converted amount in target currency
  const { converted: convertedTotal, rate: targetRate } = useMemo(() => {
    return convertCurrency({
      amount,
      from: docCurrency,
      to: targetCurrency,
      docRateToPKR: currentRateToPKR,
      ratesData: ratesData ?? undefined,
    });
  }, [amount, docCurrency, targetCurrency, currentRateToPKR, ratesData]);

  // Converted cost and margin (if sale mode)
  const convertedCost = useMemo(() => {
    if (totalCost == null) return null;
    return convertCurrency({
      amount: totalCost,
      from: docCurrency,
      to: targetCurrency,
      docRateToPKR: currentRateToPKR,
      ratesData: ratesData ?? undefined,
    }).converted;
  }, [totalCost, docCurrency, targetCurrency, currentRateToPKR, ratesData]);

  const convertedMargin = useMemo(() => {
    if (margin == null) return null;
    return convertCurrency({
      amount: margin,
      from: docCurrency,
      to: targetCurrency,
      docRateToPKR: currentRateToPKR,
      ratesData: ratesData ?? undefined,
    }).converted;
  }, [margin, docCurrency, targetCurrency, currentRateToPKR, ratesData]);

  async function handleFetchLiveRate() {
    if (docCurrency === "PKR") return;
    setFetchingRate(true);
    try {
      const live = await fetchRateToPKR(docCurrency);
      if (onRateChange) onRateChange(live);
      setManualRateInput(String(live));
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
                1 {docCurrency} = {fmtNum(currentRateToPKR, 2)} PKR
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
          <div className="mt-1 text-xl font-bold tracking-tight text-ink">
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
          <div className="mt-1 text-xl font-bold tracking-tight text-ink">
            PKR {fmtNum(amountPKR, 2)}
          </div>

          {hasCost && totalCost != null && (
            <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted border-t border-line/60 pt-1.5">
              <span>Cost: PKR {fmtNum(totalCost * currentRateToPKR, 2)}</span>
              {isSale && margin != null && (
                <span className={margin < 0 ? "text-bad font-medium" : "text-good font-medium"}>
                  Margin: PKR {fmtNum(margin * currentRateToPKR, 2)} ({fmtPct(marginPct)})
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
            <div className="text-lg font-bold text-accent">
              {targetCurrency} {fmtNum(convertedTotal, 2)}
            </div>
          </div>

          <div className="text-right text-xs">
            <div className="text-muted">
              Conversion rate:
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
