"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, Coins, RefreshCw, X } from "lucide-react";
import { useStore } from "./DataProvider";
import { fmtNum, num } from "@/lib/calc";
import {
  convertCurrency,
  fetchExchangeRates,
  fetchRateToPKR,
  MAJOR_CURRENCIES,
  type ExchangeRateData,
} from "@/lib/fx";

export function CurrencyModal({
  open,
  onClose,
  initialAmount = 1000,
  initialFrom = "USD",
  initialTo = "PKR",
}: {
  open: boolean;
  onClose: () => void;
  initialAmount?: number;
  initialFrom?: string;
  initialTo?: string;
}) {
  const { settings } = useStore();
  const [amount, setAmount] = useState<number | string>(initialAmount);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [ratesData, setRatesData] = useState<ExchangeRateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const allCurrencies = Array.from(
    new Set([...MAJOR_CURRENCIES, ...(settings.currencies ?? [])])
  );

  async function loadRates(baseCur = from) {
    setLoading(true);
    setErr("");
    try {
      const data = await fetchExchangeRates(baseCur === "PKR" ? "USD" : baseCur);
      setRatesData(data);
    } catch {
      setErr("Failed to fetch latest exchange rates. Check internet connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void loadRates(from);
    }
  }, [open, from]);

  if (!open) return null;

  const numAmount = num(amount);
  const { converted, rate } = convertCurrency({
    amount: numAmount,
    from,
    to,
    ratesData: ratesData ?? undefined,
  });

  function handleSwap() {
    const prevFrom = from;
    setFrom(to);
    setTo(prevFrom);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="card w-full max-w-lg border border-line bg-surface p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
              <Coins size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink">Currency Converter</h3>
              <p className="text-xs text-muted">Real-time international trade exchange rates</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded p-1 text-faint hover:bg-surface-2 hover:text-ink"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Inputs */}
        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Amount</span>
            <input
              type="number"
              step="any"
              min="0"
              className="field text-base font-medium"
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Enter amount"
            />
          </label>

          <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">From</span>
              <select
                className="field text-sm font-semibold"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                {allCurrencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="btn mt-4 size-9 place-items-center p-0"
              onClick={handleSwap}
              title="Swap currencies"
            >
              <ArrowRightLeft size={14} />
            </button>

            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">To</span>
              <select
                className="field text-sm font-semibold"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                {allCurrencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Quick Select Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs text-faint">Quick to:</span>
            {MAJOR_CURRENCIES.map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => setTo(cur)}
                className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                  to === cur
                    ? "bg-accent text-accent-ink"
                    : "border border-line bg-surface text-muted hover:text-ink hover:bg-surface-2"
                }`}
              >
                {cur}
              </button>
            ))}
          </div>

          {/* Result Card */}
          <div className="mt-3 rounded-lg border border-line bg-surface-2/60 p-4">
            <div className="text-xs text-muted">
              {from} {fmtNum(numAmount, 2)} =
            </div>
            <div className="mt-1 text-2xl font-bold tracking-tight text-accent">
              {to} {fmtNum(converted, 2)}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span>
                1 {from} = {fmtNum(rate, 4)} {to}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                onClick={() => loadRates(from)}
                disabled={loading}
              >
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh rates
              </button>
            </div>
          </div>

          {err && <p className="text-xs text-bad">{err}</p>}

          {/* Reference Rates Table */}
          <div className="mt-3">
            <div className="text-xs font-semibold text-ink">Popular Exchange Rates vs PKR</div>
            <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {MAJOR_CURRENCIES.filter((c) => c !== "PKR").map((cur) => {
                const pkrVal = ratesData
                  ? convertCurrency({ amount: 1, from: cur, to: "PKR", ratesData }).converted
                  : 0;
                return (
                  <div
                    key={cur}
                    onClick={() => {
                      setFrom(cur);
                      setTo("PKR");
                    }}
                    className="cursor-pointer rounded border border-line bg-surface p-2 hover:bg-surface-2"
                  >
                    <span className="font-semibold text-ink">1 {cur}</span>
                    <span className="block text-muted">
                      {pkrVal ? `≈ PKR ${fmtNum(pkrVal, 2)}` : "…"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
