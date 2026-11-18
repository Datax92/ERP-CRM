"use client";

import { useMemo } from "react";
import { Calculator, Printer } from "lucide-react";
import { useStore } from "./DataProvider";
import { fmtNum, itemTotals, num, rateOf } from "@/lib/calc";
import { BASE_HINT, CALC_HEADS, computeCalcSheet, type CalcHeadKey, type CalcSheetInput } from "@/lib/calcSheet";
import type { CollectionName, Rec } from "@/lib/types";

/**
 * The client's Calculation Sheet (landed cost → total expenses → net margin),
 * shown inside quotations and purchase orders. Stored on the record as `calcSheet`.
 */
export function CalculationSheet({ data, set, col }: { data: Rec; set: (patch: Partial<Rec>) => void; col: CollectionName }) {
  const s = useStore();
  const sheet: CalcSheetInput = data.calcSheet ?? {};
  const currency = data.currency || "PKR";
  const totals = itemTotals(data.items);

  // Sale value: a quotation's offered price; a purchase order's linked sales order.
  const defaultSale = useMemo(() => {
    if (col !== "purchaseOrders") return totals.totalPrice;
    const so = data.salesOrderId ? s.byId.salesOrders.get(data.salesOrderId) : undefined;
    if (!so) return 0;
    if ((so.currency || "PKR") === currency) return num(so.amount);
    const rate = rateOf(data) || 1;
    return num(so.amountPKR) / rate;
  }, [col, totals.totalPrice, data, s.byId.salesOrders, currency]);

  const r = computeCalcSheet(sheet, { exWorks: totals.totalCost, saleValue: defaultSale });

  const update = (patch: CalcSheetInput) => {
    const next: CalcSheetInput = { ...sheet, ...patch, rows: { ...(sheet.rows ?? {}), ...(patch.rows ?? {}) } };
    const res = computeCalcSheet(next, { exWorks: totals.totalCost, saleValue: defaultSale });
    // Firestore rejects undefined; keep stored values plain.
    set({
      calcSheet: {
        rows: next.rows ?? {},
        exWorks: next.exWorks ?? null,
        saleValue: next.saleValue ?? null,
        landedCost: res.landedCost,
        totalExpenses: res.totalExpenses,
        netMargin: res.netMargin,
        netMarginPct: res.netMarginPct,
      },
    });
  };
  const setRow = (key: CalcHeadKey, value: string) => update({ rows: { [key]: value } });
  const money = (n: number) => (n ? fmtNum(n, 2) : "0");
  const overrideInput = (field: "exWorks" | "saleValue", fallback: number) => (
    <input
      type="number"
      step="any"
      className="field h-8 w-full py-1 text-right text-sm"
      value={sheet[field] ?? ""}
      placeholder={fallback ? fmtNum(fallback, 2) : "0"}
      onChange={(e) => update({ [field]: e.target.value === "" ? null : Number(e.target.value) })}
    />
  );

  const cell = "border border-line px-3 py-1.5";
  const amountCell = `${cell} text-right tabular-nums bg-info-soft/40 font-medium text-ink`;

  return (
    <div className="calc-sheet mt-4 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 bg-[#22345a] px-4 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <Calculator size={16} />
          <span className="text-sm font-semibold tracking-wide uppercase">Calculation sheet</span>
          <span className="text-xs opacity-75">({currency})</span>
        </div>
        <button type="button" className="inline-flex items-center gap-1 rounded-md border border-white/30 px-2 py-1 text-xs hover:bg-white/10 print:hidden" onClick={() => printSheet()}>
          <Printer size={12} /> Print
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-[#344d7a] text-left text-white">
              <th className="w-10 border border-white/20 px-3 py-2 text-center">#</th>
              <th className="border border-white/20 px-3 py-2">Cost Head / Expense Stage</th>
              <th className="w-44 border border-white/20 px-3 py-2 text-center">% or Fix Charges</th>
              <th className="w-40 border border-white/20 px-3 py-2 text-center">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${cell} text-center text-muted`}>1</td>
              <td className={`${cell} font-semibold text-ink`}>Ex-works Factory Price<span className="block text-[11px] font-normal text-faint">Defaults to the items&apos; cost total</span></td>
              <td className={cell}>{overrideInput("exWorks", totals.totalCost)}</td>
              <td className={amountCell}>{money(r.exWorks)}</td>
            </tr>
            {CALC_HEADS.map((h, i) => (
              <tr key={h.key}>
                <td className={`${cell} text-center text-muted`}>{i + 2}</td>
                <td className={`${cell} ${h.tax ? "font-semibold" : ""} text-ink`}>{h.label}</td>
                <td className={`${cell} ${h.tax ? "bg-info-soft/30" : ""}`}>
                  <input
                    className="field h-8 w-full py-1 text-right text-sm"
                    value={sheet.rows?.[h.key] ?? ""}
                    placeholder={h.tax ? "e.g. 20%" : "e.g. 1500 or 2%"}
                    title={`Type an amount, or a percentage (${BASE_HINT[h.base]})`}
                    onChange={(e) => setRow(h.key, e.target.value)}
                  />
                </td>
                <td className={amountCell}>{money(r.amounts[h.key])}</td>
              </tr>
            ))}
            <tr className="bg-surface-2">
              <td colSpan={3} className={`${cell} text-right font-medium uppercase text-muted`}>Total Buy Cost (Landed Cost)</td>
              <td className={`${cell} text-right font-semibold tabular-nums text-ink`}>{money(r.landedCost)}</td>
            </tr>
            <tr className="bg-warn-soft">
              <td colSpan={3} className={`${cell} border-t-2 border-t-ink/40 text-right font-bold uppercase text-ink`}>Total Expenses</td>
              <td className={`${cell} border-t-2 border-t-ink/40 text-right font-bold tabular-nums text-ink`}>{money(r.totalExpenses)}</td>
            </tr>
            <tr>
              <td colSpan={2} className={`${cell} text-right text-muted`}>Sale value{col === "purchaseOrders" ? " (linked sales order)" : " (offered price)"}</td>
              <td className={cell}>{overrideInput("saleValue", defaultSale)}</td>
              <td className={`${cell} text-right tabular-nums text-ink`}>{money(r.saleValue)}</td>
            </tr>
            <tr className="bg-surface-2">
              <td colSpan={3} className={`${cell} text-right font-medium uppercase text-muted`}>
                Net Margin {r.saleValue ? <span className="normal-case">({r.netMarginPct.toFixed(2)}%)</span> : null}
              </td>
              <td className={`${cell} text-right font-bold tabular-nums ${r.netMargin < 0 ? "text-bad" : r.netMargin > 0 ? "text-good" : "text-ink"}`}>{money(r.netMargin)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[11px] text-faint">
        Type a fixed amount (1500) or a percentage (2%). Percentages use the ex-works price; customs duty uses the CIF value, sales tax adds duty, and income tax adds both.
      </p>
    </div>
  );
}

function printSheet() {
  const el = document.querySelector(".calc-sheet");
  if (!el) return;
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input").forEach((inp) => {
    const span = document.createElement("span");
    span.textContent = (inp as HTMLInputElement).value || "";
    inp.replaceWith(span);
  });
  clone.querySelectorAll("button").forEach((b) => b.remove());
  w.document.write(`<!doctype html><html><head><title>Calculation sheet</title><style>
    body{font-family:Calibri,Segoe UI,Arial,sans-serif;margin:24px;color:#111}
    table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #ccc;padding:6px 10px}
    thead tr{background:#344d7a;color:#fff}.text-right{text-align:right}.text-center{text-align:center}
    .bg-warn-soft{background:#fff7c2}.font-bold,.font-semibold{font-weight:700}div:first-child{font-weight:700}p{font-size:11px;color:#666}
  </style></head><body>${clone.outerHTML}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
