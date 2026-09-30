"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  FileSpreadsheet,
  Percent,
  Plus,
  Printer,
  Receipt,
  Scale,
  ShieldCheck,
  Ship,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useStore } from "@/components/DataProvider";
import {
  computeCostSheet,
  fmtMoney,
  fmtNum,
  fmtPct,
  num,
  type CostSheetAnalysis,
} from "@/lib/calc";
import { labelOf } from "@/lib/modules";
import type { CollectionName, ExtraCostItem, LineItem, Rec } from "@/lib/types";

export type QuotationCostSheetProps = {
  data: Rec;
  set: (patch: Partial<Rec>) => void;
  col?: CollectionName;
};

const COMMON_COST_CATEGORIES = [
  "Sea / Air Freight",
  "Customs Duty & Taxes",
  "Clearing & Forwarding (C&F)",
  "Port Demurrage & THC",
  "Transit Insurance",
  "Local Cartage & Delivery",
  "Inspection & Lab Test",
  "Bank LC / TT Charges",
  "Miscellaneous Landed Cost",
];

export function QuotationCostSheet({ data, set, col = "quotations" }: QuotationCostSheetProps) {
  const s = useStore();
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"expenses" | "commission" | "taxes">("expenses");
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Compute live analysis
  const analysis: CostSheetAnalysis = useMemo(() => computeCostSheet(data), [data]);

  const items: LineItem[] = data.items ?? [];
  const extraCosts: ExtraCostItem[] = Array.isArray(data.extraCosts) ? data.extraCosts : [];
  const currency = data.currency || "PKR";
  const exchangeRate = num(data.exchangeRate || 1);

  // Quick commission state on record
  const commissionType = data.commissionType || (data.commissionRate ? "percent_sale" : "none");
  const commissionRate = num(data.commissionRate);
  const commissionAgent = data.commissionAgent || "";

  // Tax settings on record
  const whtSaleRate = data.whtSaleRate !== undefined ? num(data.whtSaleRate) : 5;
  const applyGst = Boolean(data.applyGst || data.gstOutputRate);
  const gstOutputRate = applyGst ? num(data.gstOutputRate || 18) : 0;
  const gstInputRate = applyGst ? num(data.gstInputRate || 18) : 0;
  const whtImportRate = num(data.whtImportRate || 0);

  // Extra cost actions
  const addExtraCost = (category: string) => {
    const newItem: ExtraCostItem = {
      category,
      amount: 0,
      currency: "PKR",
      exchangeRate: 1,
    };
    set({ extraCosts: [...extraCosts, newItem] });
  };

  const updateExtraCost = (index: number, patch: Partial<ExtraCostItem>) => {
    const updated = [...extraCosts];
    updated[index] = { ...updated[index], ...patch };
    set({ extraCosts: updated });
  };

  const removeExtraCost = (index: number) => {
    const updated = extraCosts.filter((_, i) => i !== index);
    set({ extraCosts: updated });
  };

  // Commission handlers
  const handleCommissionTypeChange = (type: string) => {
    if (type === "none") {
      set({ commissionType: "none", commissionRate: 0, commissionAgent: "" });
    } else {
      set({ commissionType: type, commissionRate: commissionRate || (type === "percent_sale" ? 2 : 5000) });
    }
  };

  // Tax handlers
  const handleWhtPreset = (rate: number) => {
    set({ whtSaleRate: rate });
  };

  const handleGstToggle = (checked: boolean) => {
    set({
      applyGst: checked,
      gstOutputRate: checked ? 18 : 0,
      gstInputRate: checked ? 18 : 0,
    });
  };

  const isProfitable = analysis.netProfitPKR >= 0;
  const netMargin = analysis.netMarginPct;

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface shadow-sm overflow-hidden transition-all">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
            <Calculator size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink text-sm">Deal Cost Sheet & Margin Analysis</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  netMargin >= 15
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : netMargin > 0
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                }`}
              >
                {netMargin >= 15 ? <Sparkles size={11} /> : netMargin > 0 ? <TrendingUp size={11} /> : <AlertCircle size={11} />}
                Net Margin: {fmtPct(netMargin)}
              </span>
            </div>
            <p className="text-xs text-muted">
              Auto-calculates item procurement, landed freight/handling, broker commission, and exact government tax liabilities.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm inline-flex items-center gap-1.5 text-xs font-medium border border-line bg-surface hover:bg-surface-2"
            onClick={() => setShowPrintModal(true)}
            title="Print official cost sheet"
          >
            <Printer size={13} />
            <span>Print Cost Sheet</span>
          </button>
          <button
            type="button"
            className="btn btn-sm inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <span>Collapse</span>
                <ChevronUp size={14} />
              </>
            ) : (
              <>
                <span>Expand</span>
                <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Ribbon (Always visible for fast glance) */}
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-7 border-b border-line bg-surface/50 text-xs">
        <div className="rounded-lg border border-line/60 bg-surface-2/40 p-2">
          <span className="block text-[11px] text-muted">Quoted Sale</span>
          <span className="block font-semibold text-ink text-sm">
            {currency} {fmtNum(analysis.totalSale, 2)}
          </span>
          {currency !== "PKR" && (
            <span className="block text-[10px] text-faint">Rs. {fmtMoney(analysis.totalSalePKR)}</span>
          )}
        </div>

        <div className="rounded-lg border border-line/60 bg-surface-2/40 p-2">
          <span className="block text-[11px] text-muted">Goods Sourcing Cost</span>
          <span className="block font-semibold text-ink text-sm">
            Rs. {fmtMoney(analysis.totalPurchaseCostPKR)}
          </span>
          <span className="block text-[10px] text-muted">Gross: {fmtPct(analysis.grossMarginPct)}</span>
        </div>

        <div className="rounded-lg border border-line/60 bg-surface-2/40 p-2">
          <span className="block text-[11px] text-muted">Landed Extra Costs</span>
          <span className="block font-semibold text-ink text-sm">
            Rs. {fmtMoney(analysis.totalExtraCostsPKR)}
          </span>
          <span className="block text-[10px] text-muted">{extraCosts.length} item(s)</span>
        </div>

        <div className="rounded-lg border border-line/60 bg-surface-2/40 p-2">
          <span className="block text-[11px] text-muted">Broker Commission</span>
          <span className="block font-semibold text-ink text-sm">
            Rs. {fmtMoney(analysis.totalCommissionPKR)}
          </span>
          <span className="block text-[10px] text-muted">
            {commissionType === "none" ? "None" : commissionType === "percent_sale" ? `${commissionRate}% sale` : "Active"}
          </span>
        </div>

        <div className="rounded-lg border border-line/60 bg-surface-2/40 p-2">
          <span className="block text-[11px] text-muted">Taxes to Pay</span>
          <span className="block font-semibold text-ink text-sm">
            Rs. {fmtMoney(analysis.totalTaxPayablePKR)}
          </span>
          <span className="block text-[10px] text-muted">WHT {whtSaleRate}% {applyGst ? "+ GST" : ""}</span>
        </div>

        <div
          className={`rounded-lg border p-2 col-span-2 sm:col-span-2 lg:col-span-2 ${
            isProfitable
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
              : "border-rose-500/30 bg-rose-500/5 text-rose-800 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider">Net Take-Home Profit</span>
            <span className="text-[11px] font-semibold">{fmtPct(analysis.netMarginPct)} net</span>
          </div>
          <span className="block text-base font-bold">
            Rs. {fmtMoney(analysis.netProfitPKR)}
          </span>
          <div className="mt-0.5 flex items-center justify-between text-[10px] opacity-85">
            <span>Break-even selling rate:</span>
            <span className="font-semibold">
              {currency} {fmtNum(analysis.breakEvenPriceDealCurrency, 2)} / unit
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Simple Inputs */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Tab Selector */}
          <div className="flex border-b border-line gap-2">
            <button
              type="button"
              className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === "expenses"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-muted hover:text-ink"
              }`}
              onClick={() => setActiveTab("expenses")}
            >
              <Truck size={14} />
              <span>1. Landed Extra Costs ({extraCosts.length})</span>
            </button>
            <button
              type="button"
              className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === "commission"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-muted hover:text-ink"
              }`}
              onClick={() => setActiveTab("commission")}
            >
              <Users size={14} />
              <span>2. Broker Commission ({analysis.totalCommissionPKR > 0 ? `Rs. ${fmtMoney(analysis.totalCommissionPKR)}` : "None"})</span>
            </button>
            <button
              type="button"
              className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === "taxes"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-muted hover:text-ink"
              }`}
              onClick={() => setActiveTab("taxes")}
            >
              <Receipt size={14} />
              <span>3. Taxes to Pay (Rs. {fmtMoney(analysis.totalTaxPayablePKR)})</span>
            </button>
          </div>

          {/* Tab 1: Landed Extra Expenses */}
          {activeTab === "expenses" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">
                  Quick Add Landed Expenses (Sea/Air Freight, Customs, C&F, Demurrage, Cartage):
                </span>
                <span className="text-xs font-semibold text-ink">
                  Total Landed Costs: Rs. {fmtMoney(analysis.totalExtraCostsPKR)}
                </span>
              </div>

              {/* Quick Chip Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {COMMON_COST_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-ink hover:border-[var(--accent)] hover:bg-surface-2 transition-all"
                    onClick={() => addExtraCost(cat)}
                  >
                    <Plus size={11} className="text-[var(--accent)]" />
                    <span>{cat}</span>
                  </button>
                ))}
              </div>

              {/* Items List */}
              {extraCosts.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Expense Category</th>
                        <th className="px-3 py-2 font-medium w-36">Amount</th>
                        <th className="px-3 py-2 font-medium w-28">Currency</th>
                        <th className="px-3 py-2 font-medium w-32 text-right">In PKR</th>
                        <th className="px-2 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {extraCosts.map((c, idx) => {
                        const itemRate = c.currency === "PKR" || !c.currency ? 1 : num(c.exchangeRate || exchangeRate || 280);
                        const itemPKR = num(c.amount) * itemRate;
                        return (
                          <tr key={idx} className="hover:bg-surface-2/30">
                            <td className="px-3 py-1.5">
                              <input
                                className="field py-1 text-xs w-full"
                                value={c.category}
                                placeholder="Expense description"
                                onChange={(e) => updateExtraCost(idx, { category: e.target.value })}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                className="field py-1 text-xs w-full"
                                value={c.amount || ""}
                                placeholder="0"
                                onChange={(e) => updateExtraCost(idx, { amount: num(e.target.value) })}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <select
                                className="field py-1 text-xs w-full"
                                value={c.currency || "PKR"}
                                onChange={(e) => updateExtraCost(idx, { currency: e.target.value })}
                              >
                                <option value="PKR">PKR</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="CNY">CNY</option>
                                <option value="AED">AED</option>
                              </select>
                            </td>
                            <td className="px-3 py-1.5 text-right font-medium text-ink whitespace-nowrap">
                              Rs. {fmtMoney(itemPKR)}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                className="btn btn-danger p-1 text-muted hover:text-bad"
                                onClick={() => removeExtraCost(idx)}
                                title="Remove expense"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-line p-3 text-center text-xs text-muted">
                  No extra expenses added to this deal yet. Click any button above (e.g. <strong>+ Sea Freight</strong> or <strong>+ Cartage</strong>) to add.
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Broker Commission */}
          {activeTab === "commission" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">
                  Sales Broker, Buying Agent or Consultant Commission:
                </span>
                <span className="text-xs font-semibold text-ink">
                  Total Commission: Rs. {fmtMoney(analysis.totalCommissionPKR)}
                </span>
              </div>

              {/* Commission Type Selector */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "none", label: "No Commission" },
                  { id: "percent_sale", label: "% of Sale Price" },
                  { id: "percent_purchase", label: "% of Purchase Cost" },
                  { id: "per_unit", label: "Fixed Rs. Per Unit" },
                  { id: "flat", label: "Fixed Lump-Sum (PKR)" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                      commissionType === m.id
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-line bg-surface text-muted hover:text-ink"
                    }`}
                    onClick={() => handleCommissionTypeChange(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {commissionType !== "none" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg border border-line bg-surface-2/40">
                  <div>
                    <label className="block text-[11px] text-muted mb-1">Agent / Broker Name</label>
                    <input
                      className="field py-1 text-xs w-full"
                      placeholder="e.g. Tariq Broker"
                      value={commissionAgent}
                      onChange={(e) => set({ commissionAgent: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-muted mb-1">
                      {commissionType === "percent_sale" || commissionType === "percent_purchase"
                        ? "Commission Percentage (%)"
                        : commissionType === "per_unit"
                        ? "Amount per unit (PKR)"
                        : "Lump-sum Amount (PKR)"}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="field py-1 text-xs w-full font-medium"
                      placeholder="0"
                      value={commissionRate || ""}
                      onChange={(e) => set({ commissionRate: num(e.target.value) })}
                    />
                  </div>

                  <div className="flex flex-col justify-center">
                    <span className="text-[11px] text-muted">Computed Brokerage Payout:</span>
                    <span className="text-sm font-bold text-ink">
                      Rs. {fmtMoney(analysis.totalCommissionPKR)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Taxes (How much tax needed to pay) */}
          {activeTab === "taxes" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">
                  Government Tax Deductions & Liability (WHT & Sales Tax / GST):
                </span>
                <span className="text-xs font-bold text-ink">
                  Total Tax Outflow: Rs. {fmtMoney(analysis.totalTaxPayablePKR)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* WHT Card */}
                <div className="rounded-lg border border-line bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Client WHT (Sec 153)</span>
                    <span className="text-xs font-bold text-[var(--accent)]">
                      Rs. {fmtMoney(analysis.whtSaleAmountPKR)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-tight">
                    Withholding tax deducted by the customer from your invoice payment.
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {[
                      { r: 5, label: "5% (Goods)" },
                      { r: 11, label: "11% (Services)" },
                      { r: 0, label: "0% (Exempt)" },
                    ].map((p) => (
                      <button
                        key={p.r}
                        type="button"
                        className={`rounded px-2 py-1 text-[11px] font-medium border transition-all ${
                          whtSaleRate === p.r
                            ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                            : "border-line bg-surface text-muted"
                        }`}
                        onClick={() => handleWhtPreset(p.r)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-muted">Custom Rate:</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="field py-0.5 text-xs w-20 text-center"
                      value={whtSaleRate}
                      onChange={(e) => set({ whtSaleRate: num(e.target.value) })}
                    />
                    <span className="text-xs text-muted">%</span>
                  </div>
                </div>

                {/* GST Card */}
                <div className="rounded-lg border border-line bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Sales Tax / GST</span>
                    <span className="text-xs font-bold text-ink">
                      Rs. {fmtMoney(analysis.netGstPayablePKR)}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={applyGst}
                      onChange={(e) => handleGstToggle(e.target.checked)}
                    />
                    <span className="text-xs font-medium text-ink">Apply 18% Sales Tax (GST)</span>
                  </label>
                  {applyGst && (
                    <div className="space-y-1 text-[11px] text-muted pt-1 border-t border-line/60">
                      <div className="flex justify-between">
                        <span>Output GST (from client):</span>
                        <span className="font-medium text-ink">Rs. {fmtMoney(analysis.gstOutputAmountPKR)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Input GST (paid on cost):</span>
                        <span className="font-medium text-ink">- Rs. {fmtMoney(analysis.gstInputAmountPKR)}</span>
                      </div>
                      <div className="flex justify-between pt-1 font-semibold text-ink border-t border-line/40">
                        <span>Net GST to pay FBR:</span>
                        <span>Rs. {fmtMoney(analysis.netGstPayablePKR)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Import Advance Tax */}
                <div className="rounded-lg border border-line bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Import WHT (Sec 148)</span>
                    <span className="text-xs font-bold text-ink">
                      Rs. {fmtMoney(analysis.whtImportAmountPKR)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-tight">
                    Advance income tax paid at customs during port import clearance.
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <span className="text-[11px] text-muted">Import Tax Rate:</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="field py-0.5 text-xs w-20 text-center"
                      value={whtImportRate}
                      placeholder="0"
                      onChange={(e) => set({ whtImportRate: num(e.target.value) })}
                    />
                    <span className="text-xs text-muted">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Printable Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm print:p-0 print:bg-white">
          <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-surface p-6 shadow-2xl print:max-h-none print:shadow-none print:p-0 print:border-none">
            {/* Modal actions */}
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3 print:hidden">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="text-[var(--accent)]" size={18} />
                <span className="font-semibold text-ink text-sm">Official Commercial Deal Cost Sheet</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer size={14} />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm p-1.5 text-muted hover:text-ink"
                  onClick={() => setShowPrintModal(false)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Print Document Content */}
            <div className="space-y-6 text-ink p-4 border border-line rounded-lg print:border-none print:p-0">
              {/* Header */}
              <div className="flex justify-between items-start border-b-2 border-ink pb-4">
                <div>
                  <h1 className="text-xl font-bold tracking-tight uppercase">Commercial Deal Costing Sheet</h1>
                  <p className="text-xs text-muted">Internal Profitability & Sourcing Audit</p>
                </div>
                <div className="text-right text-xs space-y-0.5">
                  <div className="font-bold text-sm text-[var(--accent)]">{data.serial || "QUOTATION"}</div>
                  <div>Date: <strong>{data.date || new Date().toISOString().slice(0, 10)}</strong></div>
                  <div>Client: <strong>{s.byId.clients.get(data.clientId)?.name || data.clientName || "—"}</strong></div>
                  <div>Currency: <strong>{currency} (Rate: {exchangeRate})</strong></div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">1. Itemized Quotation & Sourcing Cost</h3>
                <table className="w-full text-xs border border-line">
                  <thead className="bg-surface-2 text-muted text-left">
                    <tr>
                      <th className="p-2 border-b">#</th>
                      <th className="p-2 border-b">Description / Product</th>
                      <th className="p-2 border-b text-center">Qty</th>
                      <th className="p-2 border-b text-right">Unit Sourcing Cost</th>
                      <th className="p-2 border-b text-right">Offered Rate</th>
                      <th className="p-2 border-b text-right">Line Sourcing Cost</th>
                      <th className="p-2 border-b text-right">Line Sale</th>
                      <th className="p-2 border-b text-right">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {items.map((it, idx) => {
                      const cost = num(it.qty) * num(it.unitCost);
                      const sale = num(it.qty) * num(it.unitPrice);
                      const mPct = sale > 0 ? ((sale - cost) / sale) * 100 : 0;
                      return (
                        <tr key={idx}>
                          <td className="p-2 text-muted">{idx + 1}</td>
                          <td className="p-2 font-medium">
                            {it.description || it.product || "Item"}
                            {it.brand ? ` (${it.brand})` : ""}
                          </td>
                          <td className="p-2 text-center">{it.qty} {it.unit || "Nos"}</td>
                          <td className="p-2 text-right">{currency} {fmtNum(it.unitCost, 2)}</td>
                          <td className="p-2 text-right font-medium">{currency} {fmtNum(it.unitPrice, 2)}</td>
                          <td className="p-2 text-right">{currency} {fmtNum(cost, 2)}</td>
                          <td className="p-2 text-right font-semibold">{currency} {fmtNum(sale, 2)}</td>
                          <td className="p-2 text-right">{fmtPct(mPct)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-surface-2/60 font-semibold border-t-2 border-line">
                    <tr>
                      <td colSpan={5} className="p-2 text-right">Total Item Cost & Sale:</td>
                      <td className="p-2 text-right">{currency} {fmtNum(analysis.totalPurchaseCost, 2)}</td>
                      <td className="p-2 text-right font-bold">{currency} {fmtNum(analysis.totalSale, 2)}</td>
                      <td className="p-2 text-right">{fmtPct(analysis.grossMarginPct)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Expenses & Taxes Table */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">2. Landed Extra Expenses</h3>
                  <table className="w-full text-xs border border-line">
                    <tbody className="divide-y divide-line">
                      {extraCosts.length > 0 ? (
                        extraCosts.map((c, i) => (
                          <tr key={i}>
                            <td className="p-1.5">{c.category}</td>
                            <td className="p-1.5 text-right font-medium">
                              Rs. {fmtMoney(num(c.amount) * (c.currency === "PKR" || !c.currency ? 1 : exchangeRate))}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="p-2 text-center text-muted">No extra expenses entered</td>
                        </tr>
                      )}
                      <tr className="bg-surface-2/60 font-semibold border-t">
                        <td className="p-1.5">Total Extra Expenses:</td>
                        <td className="p-1.5 text-right">Rs. {fmtMoney(analysis.totalExtraCostsPKR)}</td>
                      </tr>
                      {analysis.totalCommissionPKR > 0 && (
                        <tr className="bg-amber-500/5 font-semibold">
                          <td className="p-1.5">Broker Commission ({commissionAgent || "Agent"}):</td>
                          <td className="p-1.5 text-right">Rs. {fmtMoney(analysis.totalCommissionPKR)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">3. Government Taxes</h3>
                  <table className="w-full text-xs border border-line">
                    <tbody className="divide-y divide-line">
                      <tr>
                        <td className="p-1.5">Client Withholding Tax ({whtSaleRate}%):</td>
                        <td className="p-1.5 text-right font-medium">Rs. {fmtMoney(analysis.whtSaleAmountPKR)}</td>
                      </tr>
                      {applyGst && (
                        <tr>
                          <td className="p-1.5">Net GST Payable (18% Output - Input):</td>
                          <td className="p-1.5 text-right font-medium">Rs. {fmtMoney(analysis.netGstPayablePKR)}</td>
                        </tr>
                      )}
                      {analysis.whtImportAmountPKR > 0 && (
                        <tr>
                          <td className="p-1.5">Import Advance Tax (Sec 148):</td>
                          <td className="p-1.5 text-right font-medium">Rs. {fmtMoney(analysis.whtImportAmountPKR)}</td>
                        </tr>
                      )}
                      <tr className="bg-surface-2/60 font-semibold border-t">
                        <td className="p-1.5">Total Tax Liability:</td>
                        <td className="p-1.5 text-right">Rs. {fmtMoney(analysis.totalTaxPayablePKR)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Line Summary Card */}
              <div className="rounded-lg border-2 border-ink p-4 bg-surface-2/40 space-y-2">
                <div className="flex justify-between items-center text-sm border-b pb-2">
                  <span className="font-bold">Deal Financial Summary & Profitability</span>
                  <span className="text-xs font-semibold">In Pakistani Rupees (PKR)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-muted block">Total Quoted Value:</span>
                    <span className="text-sm font-bold">Rs. {fmtMoney(analysis.totalSalePKR)}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Total Landed Costs:</span>
                    <span className="text-sm font-bold">
                      Rs. {fmtMoney(analysis.totalPurchaseCostPKR + analysis.totalExtraCostsPKR + analysis.totalCommissionPKR)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">Break-even Selling Price:</span>
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                      {currency} {fmtNum(analysis.breakEvenPriceDealCurrency, 2)} / unit
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">Net Take-Home Profit:</span>
                    <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                      Rs. {fmtMoney(analysis.netProfitPKR)} ({fmtPct(analysis.netMarginPct)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="pt-8 grid grid-cols-3 gap-6 text-xs text-center border-t border-line">
                <div>
                  <div className="border-b border-line pb-8"></div>
                  <span className="mt-1 block text-muted">Costed By / Prepared By</span>
                </div>
                <div>
                  <div className="border-b border-line pb-8"></div>
                  <span className="mt-1 block text-muted">Commercial Manager</span>
                </div>
                <div>
                  <div className="border-b border-line pb-8"></div>
                  <span className="mt-1 block text-muted">Director Approval</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
