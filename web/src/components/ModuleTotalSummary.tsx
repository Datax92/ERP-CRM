"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, Check, ChevronDown, Coins, Info, RefreshCw, Zap } from "lucide-react";
import { useStore } from "./DataProvider";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/calc";
import {
  CURRENCY_SYMBOLS,
  MAJOR_CURRENCIES,
  calculateEntriesTotal,
  getLiveRate,
  type ExchangeRateData,
  type TotalSummaryResult,
} from "@/lib/fx";
import type { Column } from "@/lib/modules";
import type { CollectionName, Rec } from "@/lib/types";

export type ModuleTotalBannerProps = {
  col: CollectionName;
  title: string;
  rows: Rec[];
  targetCurrency: string;
  onCurrencyChange: (cur: string) => void;
  ratesData: ExchangeRateData | null;
  rateMode: "realtime" | "saved";
  onRateModeChange: (mode: "realtime" | "saved") => void;
  onRefreshRates: () => Promise<void>;
  refreshingRates: boolean;
};

/**
 * Top summary card displayed at the start of entries list.
 * Displays final total price, multi-currency switcher, realtime exchange rate status,
 * and breakdown across current and previous entries.
 */
export function ModuleTotalBanner({
  col,
  title,
  rows,
  targetCurrency,
  onCurrencyChange,
  ratesData,
  rateMode,
  onRateModeChange,
  onRefreshRates,
  refreshingRates,
}: ModuleTotalBannerProps) {
  const { settings } = useStore();
  const [showBreakdown, setShowBreakdown] = useState(false);

  const summary: TotalSummaryResult = useMemo(() => {
    return calculateEntriesTotal({
      rows,
      col,
      targetCurrency,
      ratesData,
      rateMode,
    });
  }, [rows, col, targetCurrency, ratesData, rateMode]);

  const allCurrencies = useMemo(() => {
    const set = new Set([...MAJOR_CURRENCIES, ...(settings.currencies ?? [])]);
    return Array.from(set);
  }, [settings.currencies]);

  // Key live exchange rates relative to PKR
  const liveRatesDisplay = useMemo(() => {
    const usdToPKR = getLiveRate({ from: "USD", to: "PKR", ratesData });
    const eurToPKR = getLiveRate({ from: "EUR", to: "PKR", ratesData });
    const aedToPKR = getLiveRate({ from: "AED", to: "PKR", ratesData });
    const sarToPKR = getLiveRate({ from: "SAR", to: "PKR", ratesData });
    const gbpToPKR = getLiveRate({ from: "GBP", to: "PKR", ratesData });
    return { usdToPKR, eurToPKR, aedToPKR, sarToPKR, gbpToPKR };
  }, [ratesData]);

  // Breakdown of original currencies
  const currencyBreakdownList = useMemo(() => {
    return Object.entries(summary.currencies).filter(([_, info]) => info.count > 0);
  }, [summary.currencies]);

  const isSale = col === "quotations" || col === "salesOrders";
  const isPayment = col === "payments";
  const isRfq = col === "rfqs";

  return (
    <div className="card mb-5 overflow-hidden border border-line bg-surface p-4 shadow-[var(--shadow)]">
      {/* Header bar: Title, entries count badge, and Rate Mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
            <Coins size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">
                Final Total Price · {title}
              </h3>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                {summary.count} {summary.count === 1 ? "entry" : "entries"}
              </span>
            </div>
            <p className="text-xs text-muted">
              Real-time converted value across current & previous entries
            </p>
          </div>
        </div>

        {/* Rate mode toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2/60 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onRateModeChange("realtime")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
              rateMode === "realtime"
                ? "bg-accent text-accent-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
            title="Convert current and previous entries using today's real-time live market exchange rates"
          >
            <Zap size={12} />
            <span>Real-time Live Rates</span>
          </button>
          <button
            type="button"
            onClick={() => onRateModeChange("saved")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
              rateMode === "saved"
                ? "bg-surface text-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
            title="Convert using original exchange rate saved on each record"
          >
            <span>Saved Record Rates</span>
          </button>
        </div>
      </div>

      {/* Main Total Section */}
      <div className="mt-3.5 grid grid-cols-1 items-center gap-4 lg:grid-cols-12">
        {/* Big Total Price Display */}
        <div className="lg:col-span-7">
          <div className="eyebrow !text-muted mb-1">
            {isPayment
              ? "Total Payment Volume"
              : isRfq
                ? "Total Requested Items"
                : `Total Value in ${targetCurrency}`}
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {CURRENCY_SYMBOLS[targetCurrency] || targetCurrency} {fmtNum(summary.total, 2)}
            </span>
            <span className="text-sm font-semibold text-accent">
              {targetCurrency}
            </span>

            {/* If target is not PKR, show PKR base equivalent */}
            {targetCurrency !== "PKR" && (
              <span className="text-xs text-faint">
                ≈ PKR {fmtNum(summary.totalPKR, 0)}
              </span>
            )}
          </div>

          {/* Quotations / Sales Orders Cost & Margin */}
          {isSale && summary.totalMargin != null && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted border-t border-line/60 pt-2">
              <span>
                Total Cost:{" "}
                <strong className="text-ink">
                  {targetCurrency} {fmtNum(summary.totalCost, 2)}
                </strong>
              </span>
              <span
                className={
                  summary.totalMargin < 0 ? "text-bad font-medium" : "text-good font-medium"
                }
              >
                Total Margin: {targetCurrency} {fmtNum(summary.totalMargin, 2)} (
                {fmtPct(summary.marginPct)})
              </span>
            </div>
          )}

          {/* Payments Received vs Paid */}
          {isPayment && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted border-t border-line/60 pt-2">
              <span className="text-good font-medium">
                Received: {targetCurrency} {fmtNum(summary.totalReceived, 2)}
              </span>
              <span className="text-warn font-medium">
                Paid: {targetCurrency} {fmtNum(summary.totalPaid, 2)}
              </span>
              <span className="font-semibold text-ink">
                Net Cash Flow: {targetCurrency} {fmtNum(summary.netPayment, 2)}
              </span>
            </div>
          )}

          {/* RFQ total item quantities */}
          {isRfq && summary.totalQty != null && (
            <div className="mt-2 text-xs text-muted">
              Total quantity across all inquiries:{" "}
              <strong className="text-ink">{fmtNum(summary.totalQty)} units</strong>
            </div>
          )}
        </div>

        {/* Currency Selector Pills */}
        <div className="rounded-lg border border-line bg-surface-2/40 p-3 lg:col-span-5">
          <div className="flex items-center justify-between gap-1 mb-2">
            <span className="eyebrow !text-muted flex items-center gap-1.5">
              <ArrowRightLeft size={11} className="text-accent" />
              <span>Show Total In Currency:</span>
            </span>
            <button
              type="button"
              onClick={onRefreshRates}
              disabled={refreshingRates}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
              title="Refresh real-time exchange rates"
            >
              <RefreshCw size={10} className={refreshingRates ? "animate-spin" : ""} />
              <span>{refreshingRates ? "Fetching…" : "Live Refresh"}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {allCurrencies.slice(0, 7).map((cur) => {
              const active = targetCurrency === cur;
              return (
                <button
                  key={cur}
                  type="button"
                  onClick={() => onCurrencyChange(cur)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-accent text-accent-ink shadow-xs ring-1 ring-accent"
                      : "border border-line bg-surface text-ink/80 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {cur}
                </button>
              );
            })}

            {/* Dropdown for other currencies */}
            <select
              className="field h-7 max-w-28 px-2 py-0 text-xs font-medium"
              value={targetCurrency}
              onChange={(e) => onCurrencyChange(e.target.value)}
              aria-label="Target currency"
            >
              {allCurrencies.map((c) => (
                <option key={c} value={c}>
                  {c} {CURRENCY_SYMBOLS[c] ? `(${CURRENCY_SYMBOLS[c]})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Real-time Exchange Rate Bar & Original Currency Breakdown */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-2.5 text-[11.5px] text-muted">
        {/* Real-time rates indicator */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <span className="inline-block size-2 rounded-full bg-good animate-pulse" />
            <span>Real-time Live Rates:</span>
          </span>

          <span className="font-mono text-ink/80">
            1 USD = ₨ {fmtNum(liveRatesDisplay.usdToPKR, 2)}
          </span>
          <span className="text-line">•</span>
          <span className="font-mono text-ink/80">
            1 EUR = ₨ {fmtNum(liveRatesDisplay.eurToPKR, 2)}
          </span>
          <span className="text-line">•</span>
          <span className="font-mono text-ink/80">
            1 AED = ₨ {fmtNum(liveRatesDisplay.aedToPKR, 2)}
          </span>
          <span className="text-line">•</span>
          <span className="font-mono text-ink/80">
            1 SAR = ₨ {fmtNum(liveRatesDisplay.sarToPKR, 2)}
          </span>
        </div>

        {/* Breakdown Toggle */}
        {currencyBreakdownList.length > 0 && (
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline"
          >
            <span>Original entries breakdown ({currencyBreakdownList.length} currencies)</span>
            <ChevronDown
              size={12}
              className={`transition-transform ${showBreakdown ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Expanded Breakdown Drawer */}
      {showBreakdown && currencyBreakdownList.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-line bg-surface-2/40 p-2.5 text-xs">
          <div className="eyebrow !text-muted mb-1.5">
            Breakdown of original entered currencies:
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {currencyBreakdownList.map(([cur, info]) => {
              const liveRateToTarget = getLiveRate({ from: cur, to: targetCurrency, ratesData });
              const convertedSubtotal = info.totalAmount * liveRateToTarget;
              return (
                <div key={cur} className="rounded border border-line bg-surface p-2">
                  <div className="flex items-center justify-between font-semibold text-ink">
                    <span>{cur}</span>
                    <span className="rounded bg-accent/10 px-1 text-[10px] text-accent">
                      {info.count} {info.count === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[13px] font-bold text-ink">
                    {cur} {fmtNum(info.totalAmount, 2)}
                  </div>
                  <div className="text-[11px] text-muted">
                    ≈ {targetCurrency} {fmtNum(convertedSubtotal, 2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export type ModuleTotalFooterProps = {
  col: CollectionName;
  columns: Column[];
  rows: Rec[];
  targetCurrency: string;
  ratesData: ExchangeRateData | null;
  rateMode: "realtime" | "saved";
};

/**
 * Table <tfoot> placed at the end of the entries table.
 * Aligns the final total price, cost, and margin directly with their matching table columns.
 */
export function ModuleTotalFooter({
  col,
  columns,
  rows,
  targetCurrency,
  ratesData,
  rateMode,
}: ModuleTotalFooterProps) {
  const summary: TotalSummaryResult = useMemo(() => {
    return calculateEntriesTotal({
      rows,
      col,
      targetCurrency,
      ratesData,
      rateMode,
    });
  }, [rows, col, targetCurrency, ratesData, rateMode]);

  if (!summary.hasAmounts && summary.totalQty == null) {
    return null;
  }

  return (
    <tfoot className="border-t-2 border-line bg-surface-2/90 font-medium">
      <tr>
        {columns.map((c, ci) => {
          // First column: Total label and count
          if (ci === 0) {
            return (
              <td key={c.key} className="px-4 py-3 pl-5 text-left font-bold text-ink">
                <div className="flex items-center gap-1.5">
                  <Coins size={14} className="text-accent shrink-0" />
                  <span>Total ({summary.count} entries)</span>
                </div>
                <span className="block text-[11px] font-normal text-muted">
                  in {targetCurrency} ({rateMode === "realtime" ? "Live market rate" : "Saved rate"})
                </span>
              </td>
            );
          }

          // Total Price / Headline Amount column
          if (c.key === "total" || (c.key === "amount" && col !== "investors")) {
            return (
              <td key={c.key} className="num px-4 py-3 text-right font-extrabold text-ink whitespace-nowrap">
                <div className="text-sm font-bold text-accent">
                  {targetCurrency} {fmtNum(summary.total, 2)}
                </div>
                {targetCurrency !== "PKR" && (
                  <div className="text-[11px] font-normal text-muted">
                    ≈ PKR {fmtNum(summary.totalPKR, 0)}
                  </div>
                )}
              </td>
            );
          }

          // Margin amount column
          if (c.key === "margin" && summary.totalMargin != null) {
            return (
              <td key={c.key} className="num px-4 py-3 text-right font-bold text-good whitespace-nowrap">
                {targetCurrency} {fmtNum(summary.totalMargin, 2)}
              </td>
            );
          }

          // Margin % column
          if (c.key === "marginPct" && summary.marginPct != null) {
            return (
              <td key={c.key} className="num px-4 py-3 text-right font-bold text-good whitespace-nowrap">
                {fmtPct(summary.marginPct)}
              </td>
            );
          }

          // PKR column
          if (c.key === "pkr") {
            return (
              <td key={c.key} className="num px-4 py-3 text-right font-bold text-ink whitespace-nowrap">
                PKR {fmtNum(summary.totalPKR, 0)}
              </td>
            );
          }

          // RFQ / Delivery Qty column
          if (c.key === "qty" && summary.totalQty != null) {
            return (
              <td key={c.key} className="num px-4 py-3 text-right font-bold text-ink whitespace-nowrap">
                {fmtNum(summary.totalQty)}
              </td>
            );
          }

          // Investor amount column
          if (col === "investors" && c.key === "amount") {
            return (
              <td key={c.key} className="num px-4 py-3 text-right font-bold text-ink whitespace-nowrap">
                {targetCurrency} {fmtNum(summary.total, 2)}
              </td>
            );
          }

          // Payment direction / status column
          if (col === "payments" && c.key === "direction") {
            return (
              <td key={c.key} className="px-4 py-3 text-left text-xs text-muted">
                {summary.totalReceived != null && (
                  <div>Rec: {fmtNum(summary.totalReceived, 0)}</div>
                )}
                {summary.totalPaid != null && (
                  <div>Paid: {fmtNum(summary.totalPaid, 0)}</div>
                )}
              </td>
            );
          }

          return <td key={c.key} className="px-4 py-3" />;
        })}
      </tr>
    </tfoot>
  );
}

/**
 * Compact bar shown right at the end of the entries table.
 */
export function ModuleTotalEndBar({
  rows,
  col,
  targetCurrency,
  onCurrencyChange,
  ratesData,
  rateMode,
}: {
  rows: Rec[];
  col: CollectionName;
  targetCurrency: string;
  onCurrencyChange: (cur: string) => void;
  ratesData: ExchangeRateData | null;
  rateMode: "realtime" | "saved";
}) {
  const summary: TotalSummaryResult = useMemo(() => {
    return calculateEntriesTotal({
      rows,
      col,
      targetCurrency,
      ratesData,
      rateMode,
    });
  }, [rows, col, targetCurrency, ratesData, rateMode]);

  if (!summary.hasAmounts && summary.totalQty == null) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/80 px-4 py-2.5 text-xs shadow-xs">
      <div className="flex items-center gap-2">
        <Coins size={15} className="text-accent" />
        <span className="font-semibold text-ink">
          Final Price of All {summary.count} Entries:
        </span>
        <span className="font-mono text-sm font-bold text-accent">
          {targetCurrency} {fmtNum(summary.total, 2)}
        </span>
        {targetCurrency !== "PKR" && (
          <span className="text-muted">(≈ PKR {fmtNum(summary.totalPKR, 0)})</span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-muted">Change currency:</span>
        {MAJOR_CURRENCIES.slice(0, 5).map((cur) => (
          <button
            key={cur}
            type="button"
            onClick={() => onCurrencyChange(cur)}
            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition ${
              targetCurrency === cur
                ? "bg-accent text-accent-ink"
                : "border border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            {cur}
          </button>
        ))}
      </div>
    </div>
  );
}
