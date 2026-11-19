"use client";

import { useMemo } from "react";
import { Printer } from "lucide-react";
import { useStore } from "./DataProvider";
import { fmtNum, itemTotals, num, rateOf } from "@/lib/calc";
import { BASE_HINT, CALC_HEADS, CALC_SECTIONS, computeCalcSheet, type CalcHeadKey, type CalcSheetInput } from "@/lib/calcSheet";
import type { CollectionName, Rec } from "@/lib/types";

/**
 * The client's Calculation Sheet (landed cost → total expenses → net margin),
 * its own tab in quotations, sales orders and purchase orders. Stored on the record as `calcSheet`.
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
        fobValue: res.fobValue,
        cfrValue: res.cfrValue,
        totalExpenses: res.totalExpenses,
        netMargin: res.netMargin,
        netMarginPct: res.netMarginPct,
      },
    });
  };
  const money = (n: number) => `${currency} ${fmtNum(n, 2)}`;
  const amountInput = (field: "exWorks" | "saleValue", fallback: number, label: string) => (
    <input
      type="number"
      step="any"
      aria-label={label}
      className="calc-in"
      value={sheet[field] ?? ""}
      placeholder={fmtNum(fallback, 2)}
      onChange={(e) => update({ [field]: e.target.value === "" ? null : Number(e.target.value) })}
    />
  );

  return (
    <div className="calc-sheet">
      <div className="calc-kpis">
        <Kpi k="Ex-works price" v={money(r.exWorks)} />
        <Kpi k="Total expenses" v={money(r.totalExpenses)} />
        <Kpi k="Landed cost" v={money(r.landedCost)} />
        <Kpi k={col === "purchaseOrders" ? "Sale value (sales order)" : "Sale value"} v={money(r.saleValue)} />
        <Kpi k="Net margin" v={money(r.netMargin)} tone={r.netMargin < 0 ? "neg" : r.netMargin > 0 ? "pos" : ""} hi />
        <Kpi k="Net margin %" v={r.saleValue ? `${r.netMarginPct.toFixed(2)}%` : "—"} tone={r.netMargin < 0 ? "neg" : ""} />
      </div>

      <div className="calc-panel">
        <div className="calc-panel-h">
          <h3>Calculation sheet</h3>
          <span className="calc-sub">Type an amount (1500) or a percentage (2%)</span>
          <button type="button" className="btn" onClick={() => printSheet()}><Printer size={13} /> Print</button>
        </div>
        <table className="calc-table">
          <thead>
            <tr><th className="no">#</th><th>Cost head</th><th>% or fixed</th><th className="r">Amount ({currency})</th></tr>
          </thead>
          <tbody>
            <tr className="base">
              <td className="no">1</td>
              <td>Ex-works Factory Price</td>
              <td className="basis">{amountInput("exWorks", totals.totalCost, "Ex-works factory price")}<small>From items&apos; cost; type to change</small></td>
              <td className="r">{fmtNum(r.exWorks, 2)}</td>
            </tr>
            {CALC_HEADS.map((h, i) => (
              <Row key={h.key} section={CALC_SECTIONS[h.key]}>
                <td className="no">{i + 2}</td>
                <td className={h.tax ? "strong" : ""}>{h.label}</td>
                <td className="basis">
                  <input
                    className="calc-in"
                    aria-label={h.label}
                    value={sheet.rows?.[h.key] ?? ""}
                    placeholder={h.tax ? "e.g. 20%" : ""}
                    title={`A fixed amount, or a percentage (${BASE_HINT[h.base]})`}
                    onChange={(e) => update({ rows: { [h.key as CalcHeadKey]: e.target.value } })}
                  />
                  {h.tax && <small>{BASE_HINT[h.base]}</small>}
                </td>
                <td className="r">{r.amounts[h.key] ? fmtNum(r.amounts[h.key], 2) : "—"}</td>
              </Row>
            ))}
            <tr className="total"><td /><td colSpan={2}>Total expenses</td><td className="r">{fmtNum(r.totalExpenses, 2)}</td></tr>
            <tr className="total"><td /><td colSpan={2}>Total buy cost (landed cost)</td><td className="r">{fmtNum(r.landedCost, 2)}</td></tr>
            <tr>
              <td />
              <td>Sale value</td>
              <td className="basis">{amountInput("saleValue", defaultSale, "Sale value")}<small>{col === "purchaseOrders" ? "From the linked sales order" : col === "salesOrders" ? "From the order's selling prices" : "From the offered price"}</small></td>
              <td className="r">{fmtNum(r.saleValue, 2)}</td>
            </tr>
            <tr className={`result ${r.netMargin < 0 ? "loss" : ""}`}>
              <td /><td colSpan={2}>Net margin{r.saleValue ? ` (${r.netMarginPct.toFixed(2)}%)` : ""}</td><td className="r">{fmtNum(r.netMargin, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ k, v, tone = "", hi }: { k: string; v: string; tone?: string; hi?: boolean }) {
  return <div className={`calc-kpi ${hi ? "hi" : ""}`}><span className="k">{k}</span><span className={`v ${tone}`}>{v}</span></div>;
}

function Row({ section, children }: { section?: string; children: React.ReactNode }) {
  return (
    <>
      {section && <tr className="sec"><td colSpan={4}>{section}</td></tr>}
      <tr>{children}</tr>
    </>
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
  clone.querySelectorAll("button, small").forEach((b) => b.remove());
  w.document.write(`<!doctype html><html><head><title>Calculation sheet</title><style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111;font-size:13px}
    .calc-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.calc-kpi{border:1px solid #ddd;padding:8px}.calc-kpi .k{display:block;color:#666;font-size:11px}.calc-kpi .v{font-weight:700}
    h3{margin:0 0 8px}.calc-sub{display:none}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}.r{text-align:right}
    tr.sec td{font-weight:700;text-transform:uppercase;font-size:11px;color:#22345a;background:#f3f5f9}tr.base td,tr.total td,tr.result td{font-weight:700}tr.result td{border-top:3px double #333}
  </style></head><body>${clone.outerHTML}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
