"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Coins,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  HelpCircle,
  Layers,
  Percent,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Save,
  Scale,
  Search,
  ShieldCheck,
  Ship,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useStore } from "@/components/DataProvider";
import { RecordDrawer } from "@/components/RecordDrawer";
import {
  computeCostSheet,
  emptyItem,
  fmtDate,
  fmtMoney,
  fmtNum,
  fmtPct,
  num,
  today,
  type CostSheetAnalysis,
} from "@/lib/calc";
import { deleteRecord, newId, patchRecord, saveRecord } from "@/lib/db";
import { fetchRateToPKR } from "@/lib/fx";
import { labelOf, MODULES } from "@/lib/modules";
import type { CollectionName, LineItem, Rec } from "@/lib/types";

export type CostSheetWorkspaceProps = {
  initialId?: string;
  onOpenRecord?: (col: CollectionName, id: string) => void;
};

export function CostSheetWorkspace({ initialId, onOpenRecord }: CostSheetWorkspaceProps) {
  const s = useStore();
  const allSheets: Rec[] = s.costSheets ?? [];

  // Currently selected or editing Cost Sheet ID
  const [activeId, setActiveId] = useState<string | null>(initialId || null);

  // Form State
  const [title, setTitle] = useState("Industrial Kraft Paper Supply Deal");
  const [date, setDate] = useState(today());
  const [clientId, setClientId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [project, setProject] = useState("A&SONS WORK");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState<number>(278);
  const [purchaseCurrency, setPurchaseCurrency] = useState("USD");
  const [purchaseExchangeRate, setPurchaseExchangeRate] = useState<number>(278);
  const [status, setStatus] = useState("Draft");
  const [notes, setNotes] = useState("");

  // Line items (Sale & Purchase)
  const [items, setItems] = useState<LineItem[]>([
    {
      description: "100 GSM Virgin Kraft Paper Reels",
      product: "Kraft Paper",
      brand: "Mondi / Stora Enso",
      supplierId: "",
      qty: 100,
      unit: "Ton",
      unitCost: 1200,
      unitPrice: 1500,
    },
  ]);

  // Extra Landed Expenses (in PKR or Deal Currency)
  const [freightAmount, setFreightAmount] = useState<number>(1390000); // e.g. $5,000 ocean freight
  const [customsDutyAmount, setCustomsDutyAmount] = useState<number>(2001600); // 6% customs
  const [clearingAmount, setClearingAmount] = useState<number>(150000); // C&F agent fee
  const [portDemurrageAmount, setPortDemurrageAmount] = useState<number>(80000); // Port charges
  const [insuranceAmount, setInsuranceAmount] = useState<number>(65000); // Marine insurance
  const [bankChargesAmount, setBankChargesAmount] = useState<number>(120000); // Bank LC / TT fee
  const [cartageAmount, setCartageAmount] = useState<number>(240000); // Local cartage
  const [inspectionAmount, setInspectionAmount] = useState<number>(50000); // SGS inspection
  const [otherExpensesAmount, setOtherExpensesAmount] = useState<number>(0);

  // Commission & Brokerage
  const [commissionRecipient, setCommissionRecipient] = useState("Ahmed Trading Broker");
  const [commissionType, setCommissionType] = useState<"percent_sale" | "percent_purchase" | "per_unit" | "fixed">("percent_sale");
  const [commissionRate, setCommissionRate] = useState<number>(1.5); // 1.5% of sale

  // Taxes
  const [taxMode, setTaxMode] = useState<"wht" | "corporate" | "both" | "none">("wht");
  const [whtSaleRate, setWhtSaleRate] = useState<number>(4.0); // 4% WHT on supplies in Pakistan
  const [whtImportRate, setWhtImportRate] = useState<number>(0); // e.g. 5.5% import tax
  const [gstOutputRate, setGstOutputRate] = useState<number>(18.0); // 18% GST output
  const [gstInputRate, setGstInputRate] = useState<number>(18.0); // 18% GST input
  const [incomeTaxRate, setIncomeTaxRate] = useState<number>(29.0); // 29% corporate income tax

  // Target Margin Simulator / What-If Target
  const [targetMarginGoal, setTargetMarginGoal] = useState<number>(10);

  // Status & saving
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "expenses" | "commission" | "taxes" | "waterfall" | "print">("items");

  // Record drawer state for full modal editing
  const [openDrawerId, setOpenDrawerId] = useState<string | null>(null);

  // Auto load active record when activeId changes
  useEffect(() => {
    if (!activeId) return;
    const rec = allSheets.find((x) => x.id === activeId);
    if (!rec) return;

    setTitle(rec.title || "Untitled Deal");
    setDate(rec.date || today());
    setClientId(rec.clientId || "");
    setSupplierId(rec.supplierId || "");
    setProject(rec.project || "A&SONS WORK");
    setCurrency(rec.currency || "USD");
    setExchangeRate(num(rec.exchangeRate || 278));
    setPurchaseCurrency(rec.purchaseCurrency || rec.currency || "USD");
    setPurchaseExchangeRate(num(rec.purchaseExchangeRate || rec.exchangeRate || 278));
    setStatus(rec.status || "Draft");
    setNotes(rec.notes || "");

    if (Array.isArray(rec.items) && rec.items.length) {
      setItems(rec.items);
    }
    setFreightAmount(num(rec.freightAmount));
    setCustomsDutyAmount(num(rec.customsDutyAmount));
    setClearingAmount(num(rec.clearingAmount));
    setPortDemurrageAmount(num(rec.portDemurrageAmount));
    setInsuranceAmount(num(rec.insuranceAmount));
    setBankChargesAmount(num(rec.bankChargesAmount));
    setCartageAmount(num(rec.cartageAmount));
    setInspectionAmount(num(rec.inspectionAmount));
    setOtherExpensesAmount(num(rec.otherExpensesAmount));

    setCommissionRecipient(rec.commissionRecipient || "");
    setCommissionType(rec.commissionType || "percent_sale");
    setCommissionRate(num(rec.commissionRate));

    setTaxMode(rec.taxMode || "wht");
    setWhtSaleRate(num(rec.whtSaleRate ?? 4));
    setWhtImportRate(num(rec.whtImportRate ?? 0));
    setGstOutputRate(num(rec.gstOutputRate ?? 18));
    setGstInputRate(num(rec.gstInputRate ?? 18));
    setIncomeTaxRate(num(rec.incomeTaxRate ?? 29));
  }, [activeId, allSheets]);

  // Real-time calculation state
  const analysis: CostSheetAnalysis = useMemo(() => {
    return computeCostSheet({
      currency,
      exchangeRate,
      purchaseCurrency,
      purchaseExchangeRate,
      items,
      freightAmount,
      customsDutyAmount,
      clearingAmount,
      portDemurrageAmount,
      insuranceAmount,
      bankChargesAmount,
      cartageAmount,
      inspectionAmount,
      otherExpensesAmount,
      commissionType,
      commissionRate,
      taxMode,
      whtSaleRate,
      whtImportRate,
      gstOutputRate,
      gstInputRate,
      incomeTaxRate,
    });
  }, [
    currency,
    exchangeRate,
    purchaseCurrency,
    purchaseExchangeRate,
    items,
    freightAmount,
    customsDutyAmount,
    clearingAmount,
    portDemurrageAmount,
    insuranceAmount,
    bankChargesAmount,
    cartageAmount,
    inspectionAmount,
    otherExpensesAmount,
    commissionType,
    commissionRate,
    taxMode,
    whtSaleRate,
    whtImportRate,
    gstOutputRate,
    gstInputRate,
    incomeTaxRate,
  ]);

  // Target Selling Price Calculator (What-if selling rate to achieve target net margin %)
  const targetRequiredPricePerUnit = useMemo(() => {
    if (analysis.totalQty <= 0) return 0;
    // NetMargin = (Sale - Landed - DirectTax) / Sale => TargetNetMargin = 1 - LandedCost/Sale (approx)
    // Sale = LandedCost / (1 - TargetMargin% - WHT%)
    const marginFrac = targetMarginGoal / 100;
    const whtFrac = taxMode === "corporate" ? 0 : whtSaleRate / 100;
    const denom = Math.max(0.05, 1 - marginFrac - whtFrac);
    const reqTotalSalePKR = analysis.totalLandedCostPKR / denom;
    const reqPricePerUnitPKR = reqTotalSalePKR / analysis.totalQty;
    return exchangeRate > 0 ? reqPricePerUnitPKR / exchangeRate : reqPricePerUnitPKR;
  }, [analysis, targetMarginGoal, taxMode, whtSaleRate, exchangeRate]);

  // Save current Cost Sheet
  async function handleSave() {
    setSaving(true);
    try {
      const dataToSave: Rec = {
        id: activeId || newId("costSheets"),
        title: title.trim() || "Trading Cost Sheet",
        date,
        clientId: clientId || undefined,
        supplierId: supplierId || undefined,
        project: project.trim() || "A&SONS WORK",
        currency,
        exchangeRate: num(exchangeRate),
        purchaseCurrency,
        purchaseExchangeRate: num(purchaseExchangeRate),
        status,
        notes,
        items,
        freightAmount: num(freightAmount),
        customsDutyAmount: num(customsDutyAmount),
        clearingAmount: num(clearingAmount),
        portDemurrageAmount: num(portDemurrageAmount),
        insuranceAmount: num(insuranceAmount),
        bankChargesAmount: num(bankChargesAmount),
        cartageAmount: num(cartageAmount),
        inspectionAmount: num(inspectionAmount),
        otherExpensesAmount: num(otherExpensesAmount),
        commissionRecipient,
        commissionType,
        commissionRate: num(commissionRate),
        taxMode,
        whtSaleRate: num(whtSaleRate),
        whtImportRate: num(whtImportRate),
        gstOutputRate: num(gstOutputRate),
        gstInputRate: num(gstInputRate),
        incomeTaxRate: num(incomeTaxRate),
        ...analysis,
        amount: analysis.totalSale,
        amountPKR: analysis.totalSalePKR,
      };

      const saved = await saveRecord("costSheets", dataToSave, {
        itemsMode: "sale",
        amountField: "totalSale",
        serialPrefix: "CST",
      });

      if (!activeId) {
        setActiveId(saved.id);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  // Pre-load an impressive full trading sample deal
  function handleLoadTradeSample() {
    setTitle("Import & Supply: 100 MT Kraft Paper Reels");
    setDate(today());
    setProject("A&SONS WORK");
    setCurrency("USD");
    setExchangeRate(278.25);
    setPurchaseCurrency("USD");
    setPurchaseExchangeRate(278.25);
    setStatus("Costed");
    setNotes("Direct indent import from Scandinavian mills for commercial client. Includes ocean freight to Karachi, customs duty, C&F clearance, local cartage, and buying agent commission.");
    setItems([
      {
        description: "Virgin Kraft Liner Paper 125 GSM",
        product: "Kraft Paper",
        brand: "Mondi / Billerud",
        supplierId: supplierId || "",
        qty: 60,
        unit: "Ton",
        unitCost: 1150,
        unitPrice: 1480,
      },
      {
        description: "Semi-Chemical Fluting Medium 112 GSM",
        product: "Fluting Medium",
        brand: "Stora Enso",
        supplierId: supplierId || "",
        qty: 40,
        unit: "Ton",
        unitCost: 1050,
        unitPrice: 1390,
      },
    ]);
    setFreightAmount(1250000); // Sea freight 4x 40ft containers
    setCustomsDutyAmount(1860000); // Customs tariff & RD
    setClearingAmount(140000); // Customs clearance GD agent
    setPortDemurrageAmount(95000); // KICT port charges
    setInsuranceAmount(75000); // Marine insurance cover
    setBankChargesAmount(115000); // LC opening & retirement fees
    setCartageAmount(280000); // Port to customer warehouse cartage
    setInspectionAmount(60000); // Pre-shipment inspection SGS
    setOtherExpensesAmount(30000);

    setCommissionRecipient("Tariq & Co. Deal Brokers");
    setCommissionType("percent_sale");
    setCommissionRate(1.5);

    setTaxMode("wht");
    setWhtSaleRate(4.0);
    setWhtImportRate(0);
    setGstOutputRate(18.0);
    setGstInputRate(18.0);
    setIncomeTaxRate(29.0);
  }

  // Convert Cost Sheet to Quotation
  async function handleConvertToQuotation() {
    if (!clientId) {
      alert("Please select a linked Client first before creating a Quotation.");
      return;
    }
    setSaving(true);
    try {
      await handleSave();
      const q = await saveRecord(
        "quotations",
        {
          id: newId("quotations"),
          clientId,
          costSheetId: activeId || undefined,
          date: today(),
          currency,
          exchangeRate,
          title: `Quote based on ${title}`,
          items: items.map((i) => ({ ...i })),
          status: "Draft",
          notes: `Generated from Cost Sheet ${activeId || ""}. Target Gross Margin: ${fmtPct(analysis.grossMarginPct)}, Net Margin: ${fmtPct(analysis.netMarginPct)}.`,
        },
        { itemsMode: "sale", amountField: "totalPrice", serialPrefix: "QT" }
      );
      if (activeId) {
        await patchRecord("costSheets", activeId, { quotationId: q.id, status: "Costed" });
      }
      alert(`Quotation ${q.serial || q.id} successfully created!`);
      onOpenRecord?.("quotations", q.id);
    } finally {
      setSaving(false);
    }
  }

  // Update item
  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === index ? { ...it, ...patch } : it)));
  }

  // Add line item
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  // Remove line item
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Active client & supplier objects
  const clientObj = clientId ? s.byId.clients.get(clientId) : undefined;
  const supplierObj = supplierId ? s.byId.suppliers.get(supplierId) : undefined;

  return (
    <div className="space-y-5">
      {/* Top Header & Deal Selector Bar */}
      <div className="card border border-line bg-surface p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid size-9 place-items-center rounded-xl bg-accent text-accent-ink shadow-xs">
              <Calculator size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink sm:text-lg">
                Trading Cost Sheet & Deal Engine
              </h2>
              <p className="text-xs text-muted">
                Complete commercial costing: Purchase vs Sale, Landed Costs, Broker Commission, Taxes & Net Margin.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sheet Selector dropdown */}
            {allSheets.length > 0 && (
              <select
                className="field h-8 max-w-56 text-xs"
                value={activeId ?? ""}
                onChange={(e) => setActiveId(e.target.value || null)}
              >
                <option value="">＋ New Deal Cost Sheet…</option>
                {allSheets.map((sh) => (
                  <option key={sh.id} value={sh.id}>
                    {sh.serial || "Draft"} · {sh.title || "Untitled"}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={handleLoadTradeSample}
              className="btn btn-ghost h-8 px-2.5 text-xs text-brass hover:bg-brass/10"
              title="Pre-populate Scandinavian Kraft Paper import deal with full landed costs, commission, and tax calculations"
            >
              <Sparkles size={13} />
              <span>Load Paper Trade Sample</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveId(null);
                setTitle("New Deal Costing");
                setItems([emptyItem()]);
              }}
              className="btn btn-ghost h-8 px-2.5 text-xs"
            >
              <Plus size={13} /> New Deal
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary h-8 px-3.5 text-xs font-semibold"
            >
              <Save size={13} />
              <span>{saving ? "Saving…" : savedSuccess ? "✓ Saved" : "Save Cost Sheet"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Headline Metrics Ribbon */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {/* 1. Total Sale */}
        <div className="card border border-line bg-surface p-3 shadow-xs">
          <span className="text-[11px] font-medium text-muted uppercase">Gross Revenue</span>
          <div className="mt-1 font-mono text-base font-bold text-ink truncate">
            {fmtMoney(analysis.totalSale, currency)}
          </div>
          <div className="text-[10px] text-faint truncate">
            ≈ PKR {fmtNum(analysis.totalSalePKR)}
          </div>
        </div>

        {/* 2. Total Purchase Cost */}
        <div className="card border border-line bg-surface p-3 shadow-xs">
          <span className="text-[11px] font-medium text-muted uppercase">Purchase Cost</span>
          <div className="mt-1 font-mono text-base font-bold text-ink truncate">
            {fmtMoney(analysis.totalPurchaseCost, purchaseCurrency)}
          </div>
          <div className="text-[10px] text-faint truncate">
            ≈ PKR {fmtNum(analysis.totalPurchaseCostPKR)}
          </div>
        </div>

        {/* 3. Gross Profit & % */}
        <div className="card border border-line bg-surface p-3 shadow-xs">
          <span className="text-[11px] font-medium text-muted uppercase">Gross Margin</span>
          <div className={`mt-1 font-mono text-base font-bold ${analysis.grossProfitPKR < 0 ? "text-bad" : "text-accent"}`}>
            {fmtPct(analysis.grossMarginPct)}
          </div>
          <div className="text-[10px] text-muted truncate">
            PKR {fmtNum(analysis.grossProfitPKR)}
          </div>
        </div>

        {/* 4. Extra Landed Costs */}
        <div className="card border border-line bg-surface p-3 shadow-xs">
          <span className="text-[11px] font-medium text-muted uppercase">Landed Costs</span>
          <div className="mt-1 font-mono text-base font-bold text-ink truncate">
            PKR {fmtNum(analysis.totalExtraCostsPKR)}
          </div>
          <div className="text-[10px] text-faint">
            Freight, Customs, C&F
          </div>
        </div>

        {/* 5. Broker Commission */}
        <div className="card border border-line bg-surface p-3 shadow-xs">
          <span className="text-[11px] font-medium text-muted uppercase">Commission</span>
          <div className="mt-1 font-mono text-base font-bold text-ink truncate">
            PKR {fmtNum(analysis.totalCommissionPKR)}
          </div>
          <div className="text-[10px] text-muted truncate">
            {commissionType === "percent_sale" ? `${commissionRate}% of sale` : "Deal Broker"}
          </div>
        </div>

        {/* 6. Total Tax To Pay */}
        <div className="card border border-line bg-surface p-3 shadow-xs">
          <span className="text-[11px] font-medium text-muted uppercase">Taxes To Pay</span>
          <div className="mt-1 font-mono text-base font-bold text-warn truncate">
            PKR {fmtNum(analysis.totalTaxPayablePKR)}
          </div>
          <div className="text-[10px] text-faint truncate">
            WHT {whtSaleRate}% + GST
          </div>
        </div>

        {/* 7. Final Net Profit */}
        <div className="card border border-line bg-surface p-3 shadow-xs ring-1 ring-accent/30 bg-accent/5">
          <span className="text-[11px] font-medium text-accent uppercase font-bold">Net Profit</span>
          <div className={`mt-1 font-mono text-base font-bold ${analysis.netProfitPKR < 0 ? "text-bad" : "text-good"}`}>
            PKR {fmtNum(analysis.netProfitPKR)}
          </div>
          <div className="text-[10px] text-good font-semibold">
            {fmtPct(analysis.netMarginPct)} Net Margin
          </div>
        </div>

        {/* 8. Break-Even Price */}
        <div className="card border border-line bg-surface p-3 shadow-xs">
          <span className="text-[11px] font-medium text-muted uppercase">Break-Even / Unit</span>
          <div className="mt-1 font-mono text-base font-bold text-ink truncate">
            {currency} {fmtNum(analysis.breakEvenPriceDealCurrency, 1)}
          </div>
          <div className="text-[10px] text-muted truncate">
            PKR {fmtNum(analysis.breakEvenPricePKR, 0)}/unit
          </div>
        </div>
      </div>

      {/* Main Deal Editor Layout */}
      <div className="card border border-line bg-surface p-5 shadow-[var(--shadow)]">
        {/* Deal Header Inputs */}
        <div className="border-b border-line pb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold text-muted uppercase">Deal Title / Reference</label>
              <input
                type="text"
                className="field mt-1 text-sm font-semibold w-full"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 50 Grundfos Pumps to WAPDA"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted uppercase">Client</label>
              <select
                className="field mt-1 text-xs w-full"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">— Select Client —</option>
                {s.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted uppercase">Primary Supplier</label>
              <select
                className="field mt-1 text-xs w-full"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">— Select Supplier —</option>
                {s.suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted uppercase">Sale Currency & Rate</label>
              <div className="mt-1 flex gap-1">
                <select
                  className="field text-xs w-20"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {(s.settings.currencies ?? ["PKR", "USD", "EUR", "CNY"]).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  className="field text-xs font-mono flex-1"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(Number(e.target.value))}
                  placeholder="PKR rate"
                  title="PKR exchange rate"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted uppercase">Purchase Cur & Rate</label>
              <div className="mt-1 flex gap-1">
                <select
                  className="field text-xs w-20"
                  value={purchaseCurrency}
                  onChange={(e) => setPurchaseCurrency(e.target.value)}
                >
                  {(s.settings.currencies ?? ["PKR", "USD", "EUR", "CNY"]).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  className="field text-xs font-mono flex-1"
                  value={purchaseExchangeRate}
                  onChange={(e) => setPurchaseExchangeRate(Number(e.target.value))}
                  placeholder="PKR rate"
                  title="Purchase exchange rate"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section Tabs inside Cost Sheet */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2.5">
          <div className="inline-flex rounded-lg border border-line bg-surface-2/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("items")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === "items" ? "bg-accent text-accent-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <FileSpreadsheet size={13} />
              <span>1. Items (Sale & Purchase)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("expenses")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === "expenses" ? "bg-accent text-accent-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <Ship size={13} />
              <span>2. Landed Extra Costs ({fmtMoney(analysis.totalExtraCostsPKR, "PKR")})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("commission")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === "commission" ? "bg-accent text-accent-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <Users size={13} />
              <span>3. Broker Commission ({fmtMoney(analysis.totalCommissionPKR, "PKR")})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("taxes")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === "taxes" ? "bg-accent text-accent-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <Receipt size={13} />
              <span>4. Taxes & WHT ({fmtMoney(analysis.totalTaxPayablePKR, "PKR")})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("waterfall")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === "waterfall" ? "bg-accent text-accent-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <TrendingUp size={13} />
              <span>5. P&L Waterfall & Target Simulator</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("print")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === "print" ? "bg-accent text-accent-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <Printer size={13} />
              <span>Print Cost Sheet</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConvertToQuotation}
              className="btn btn-ghost h-8 px-3 text-xs font-semibold text-accent border border-accent/30 hover:bg-accent-soft"
              title="Generate a client quotation pre-filled with this cost sheet's line items and pricing"
            >
              <FileText size={13} /> Create Quotation →
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* TAB 1: LINE ITEMS (Sale Price vs Purchase Cost)                  */}
        {/* ================================================================= */}
        {activeTab === "items" && (
          <div className="mt-4 space-y-4">
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-surface-2/70 text-muted uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="w-10 px-3 py-2 text-center">#</th>
                    <th className="px-3 py-2">Item Description</th>
                    <th className="w-28 px-3 py-2">Product</th>
                    <th className="w-28 px-3 py-2">Brand</th>
                    <th className="w-20 px-3 py-2">Qty</th>
                    <th className="w-20 px-3 py-2">Unit</th>
                    <th className="w-28 px-3 py-2 text-right">Purchase Unit Cost ({purchaseCurrency})</th>
                    <th className="w-28 px-3 py-2 text-right">Sale Unit Rate ({currency})</th>
                    <th className="w-28 px-3 py-2 text-right">Total Purchase</th>
                    <th className="w-28 px-3 py-2 text-right">Total Sale</th>
                    <th className="w-20 px-3 py-2 text-right">Gross %</th>
                    <th className="w-10 px-2 py-2 text-center" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((it, idx) => {
                    const lineCost = num(it.qty) * num(it.unitCost);
                    const linePrice = num(it.qty) * num(it.unitPrice);
                    const lineMargin = linePrice - lineCost;
                    const lineMarginPct = linePrice > 0 ? (lineMargin / linePrice) * 100 : 0;

                    return (
                      <tr key={idx} className="hover:bg-surface-2/30">
                        <td className="px-3 py-2 text-center text-faint">{idx + 1}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            className="field text-xs w-full font-medium"
                            value={it.description}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            placeholder="Description"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            className="field text-xs w-full"
                            value={it.product}
                            onChange={(e) => updateItem(idx, { product: e.target.value })}
                            placeholder="Product"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            className="field text-xs w-full"
                            value={it.brand}
                            onChange={(e) => updateItem(idx, { brand: e.target.value })}
                            placeholder="Brand"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="field text-xs font-mono w-full"
                            value={it.qty}
                            onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            className="field text-xs w-full"
                            value={it.unit}
                            onChange={(e) => updateItem(idx, { unit: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="field text-xs font-mono text-right w-full"
                            value={it.unitCost}
                            onChange={(e) => updateItem(idx, { unitCost: Number(e.target.value) })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="field text-xs font-mono text-right w-full font-semibold text-accent"
                            value={it.unitPrice}
                            onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-muted">
                          {fmtNum(lineCost)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-ink">
                          {fmtNum(linePrice)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${lineMarginPct < 0 ? "text-bad" : "text-good"}`}>
                          {fmtPct(lineMarginPct)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            className="btn btn-ghost h-6 w-6 p-0 text-muted hover:text-bad"
                            onClick={() => removeItem(idx)}
                            disabled={items.length <= 1}
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

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                className="btn btn-ghost border border-line h-8 px-3 text-xs"
                onClick={addItem}
              >
                <Plus size={13} /> Add Line Item
              </button>

              <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
                <div>
                  <span className="text-muted">Total Qty: </span>
                  <strong className="text-ink">{fmtNum(analysis.totalQty)}</strong>
                </div>
                <div>
                  <span className="text-muted">Purchase Total: </span>
                  <strong className="text-ink">{fmtMoney(analysis.totalPurchaseCost, purchaseCurrency)}</strong>
                </div>
                <div>
                  <span className="text-muted">Sale Total: </span>
                  <strong className="text-accent font-bold">{fmtMoney(analysis.totalSale, currency)}</strong>
                </div>
                <div>
                  <span className="text-muted">Gross Profit: </span>
                  <strong className="text-good">{fmtMoney(analysis.grossProfitPKR, "PKR")} ({fmtPct(analysis.grossMarginPct)})</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: LANDED EXTRA COSTS & DIRECT DEAL EXPENSES                 */}
        {/* ================================================================= */}
        {activeTab === "expenses" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-line bg-surface-2/30 p-3 text-xs text-muted flex items-start gap-2">
              <Ship size={16} className="text-accent shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-ink">Commercial Import & Direct Landed Expenses (in PKR)</p>
                <p className="text-[11px] mt-0.5">
                  Enter all shipment, customs duties, terminal handling, port demurrage, cartage, and inspection expenses. These are added to the purchase cost to calculate the exact landed cost per unit.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Freight */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Ship size={13} className="text-accent" /> Ocean / Air Freight (PKR)
                </label>
                <input
                  type="number"
                  className="field text-xs font-mono w-full"
                  value={freightAmount}
                  onChange={(e) => setFreightAmount(Number(e.target.value))}
                  placeholder="Freight Charges"
                />
                <span className="text-[10px] text-faint">Container shipping / airline freight charges</span>
              </div>

              {/* Customs Duty */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Scale size={13} className="text-brass" /> Customs Duty & Regulatory Tariff (PKR)
                </label>
                <input
                  type="number"
                  className="field text-xs font-mono w-full"
                  value={customsDutyAmount}
                  onChange={(e) => setCustomsDutyAmount(Number(e.target.value))}
                  placeholder="Customs Duty, ACD, RD"
                />
                <span className="text-[10px] text-faint">Customs tariff, regulatory duty, additional duty</span>
              </div>

              {/* Clearing & Forwarding */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <FileText size={13} className="text-accent" /> Clearing & Forwarding Agent Fee (PKR)
                </label>
                <input
                  type="number"
                  className="field text-xs font-mono w-full"
                  value={clearingAmount}
                  onChange={(e) => setClearingAmount(Number(e.target.value))}
                  placeholder="C&F Agent Fee"
                />
                <span className="text-[10px] text-faint">Customs broker fee, documentation, GD clearance</span>
              </div>

              {/* Port & Demurrage */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <AlertCircle size={13} className="text-warn" /> Port Demurrage & Terminal Charges (PKR)
                </label>
                <input
                  type="number"
                  className="field text-xs font-mono w-full"
                  value={portDemurrageAmount}
                  onChange={(e) => setPortDemurrageAmount(Number(e.target.value))}
                  placeholder="Port & Demurrage"
                />
                <span className="text-[10px] text-faint">Wharfage, terminal storage, container detention</span>
              </div>

              {/* Insurance */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-good" /> Marine / Transit Insurance (PKR)
                </label>
                <input
                  type="number"
                  className="field text-xs font-mono w-full"
                  value={insuranceAmount}
                  onChange={(e) => setInsuranceAmount(Number(e.target.value))}
                  placeholder="Cargo Insurance"
                />
                <span className="text-[10px] text-faint">Transit insurance premium</span>
              </div>

              {/* Bank Charges */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Coins size={13} className="text-accent" /> Bank LC / SWIFT / TT Fees (PKR)
                </label>
                <input
                  type="number"
                  className="field text-xs font-mono w-full"
                  value={bankChargesAmount}
                  onChange={(e) => setBankChargesAmount(Number(e.target.value))}
                  placeholder="Bank Charges"
                />
                <span className="text-[10px] text-faint">LC opening commission, foreign remittance charges</span>
              </div>

              {/* Local Cartage & Delivery */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Truck size={13} className="text-accent" /> Local Cartage, Transport & Unloading (PKR)
                </label>
                <input
                  type="number"
                  className="field text-xs font-mono w-full"
                  value={cartageAmount}
                  onChange={(e) => setCartageAmount(Number(e.target.value))}
                  placeholder="Truck Cartage"
                />
                <span className="text-[10px] text-faint">Trailer / transport to buyer warehouse, labor</span>
              </div>

              {/* Inspection & Lab */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-accent" /> Inspection / Lab Testing (PKR)
                </label>
                <input
                  type="number"
                  className="field text-xs font-mono w-full"
                  value={inspectionAmount}
                  onChange={(e) => setInspectionAmount(Number(e.target.value))}
                  placeholder="SGS / Lab Inspection"
                />
                <span className="text-[10px] text-faint">Third-party inspection certificates</span>
              </div>

              {/* Other Direct Expenses */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Layers size={13} className="text-muted" /> Other Direct Expenses (PKR)
                </label>
                <input
                  type="number"
                  className="field text-xs font-mono w-full"
                  value={otherExpensesAmount}
                  onChange={(e) => setOtherExpensesAmount(Number(e.target.value))}
                  placeholder="Miscellaneous"
                />
                <span className="text-[10px] text-faint">Stamp duties, legal notarization, incidental costs</span>
              </div>
            </div>

            {/* Landed Expenses Summary */}
            <div className="rounded-lg border border-line bg-surface-2/40 p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase text-muted tracking-wider">Total Direct Landed Costs</span>
                <div className="font-mono text-xl font-bold text-ink mt-0.5">
                  {fmtMoney(analysis.totalExtraCostsPKR, "PKR")}
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-muted">Landed Cost Per Unit</span>
                <div className="font-mono text-base font-bold text-ink">
                  PKR {fmtNum(analysis.landedCostPerUnit, 2)} / unit
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-medium text-muted">% of Total Revenue</span>
                <div className="font-mono text-base font-bold text-accent">
                  {analysis.totalSalePKR > 0 ? fmtPct((analysis.totalExtraCostsPKR / analysis.totalSalePKR) * 100) : "0%"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: COMMISSION & BROKERAGE                                    */}
        {/* ================================================================= */}
        {activeTab === "commission" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-line bg-surface-2/30 p-3 text-xs text-muted flex items-start gap-2">
              <Users size={16} className="text-accent shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-ink">Deal Brokerage & Agent Commissions</p>
                <p className="text-[11px] mt-0.5">
                  Configure commissions payable to sales brokers, buying agents, or trade intermediaries. Commissions are automatically deducted to calculate net operating margin.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-ink">Agent / Broker Recipient Name</label>
                <input
                  type="text"
                  className="field mt-1 text-xs w-full"
                  value={commissionRecipient}
                  onChange={(e) => setCommissionRecipient(e.target.value)}
                  placeholder="e.g. Tariq & Sons Brokerage"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink">Calculation Method</label>
                <select
                  className="field mt-1 text-xs w-full"
                  value={commissionType}
                  onChange={(e) => setCommissionType(e.target.value as any)}
                >
                  <option value="percent_sale">% of Total Gross Sale</option>
                  <option value="percent_purchase">% of Total Purchase Cost</option>
                  <option value="per_unit">Fixed PKR per Unit / Ton</option>
                  <option value="fixed">Lump Sum Fixed Amount (PKR)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink">
                  Commission Rate {commissionType.startsWith("percent") ? "(%)" : "(PKR)"}
                </label>
                <input
                  type="number"
                  step="any"
                  className="field mt-1 text-xs font-mono w-full font-bold text-accent"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Calculated Commission Box */}
            <div className="rounded-lg border border-line bg-surface-2/40 p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase text-muted tracking-wider">Total Commission Payable</span>
                <div className="font-mono text-xl font-bold text-accent mt-0.5">
                  {fmtMoney(analysis.totalCommissionPKR, "PKR")}
                </div>
                {commissionRecipient && (
                  <span className="text-xs text-muted">Payable to: <strong>{commissionRecipient}</strong></span>
                )}
              </div>

              <div className="text-right">
                <span className="text-xs font-medium text-muted">% of Deal Sale</span>
                <div className="font-mono text-base font-bold text-ink">
                  {analysis.totalSalePKR > 0 ? fmtPct((analysis.totalCommissionPKR / analysis.totalSalePKR) * 100) : "0%"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: TAX CALCULATION ENGINE                                    */}
        {/* ================================================================= */}
        {activeTab === "taxes" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-line bg-surface-2/30 p-3 text-xs text-muted flex items-start gap-2">
              <Receipt size={16} className="text-warn shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-ink">Tax Calculation Engine — "How Much Tax Needed to Pay"</p>
                <p className="text-[11px] mt-0.5">
                  Simulate exact tax deductions by the client (Withholding Tax / WHT), customs advance tax on imports, sales tax (Output vs Input GST), and corporate income tax on profits.
                </p>
              </div>
            </div>

            {/* Tax Regime Selector */}
            <div className="rounded-lg border border-line bg-surface p-3">
              <label className="text-xs font-bold text-ink uppercase">Select Tax Treatment Regime</label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer text-xs ${taxMode === "wht" ? "border-accent bg-accent/10 font-semibold" : "border-line"}`}>
                  <input
                    type="radio"
                    name="taxMode"
                    checked={taxMode === "wht"}
                    onChange={() => setTaxMode("wht")}
                    className="accent-[var(--accent)]"
                  />
                  <div>
                    <div>Withholding Tax (WHT Deducted at Source)</div>
                    <span className="text-[10px] text-muted">Standard commercial supply regime (sec 153/148)</span>
                  </div>
                </label>

                <label className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer text-xs ${taxMode === "corporate" ? "border-accent bg-accent/10 font-semibold" : "border-line"}`}>
                  <input
                    type="radio"
                    name="taxMode"
                    checked={taxMode === "corporate"}
                    onChange={() => setTaxMode("corporate")}
                    className="accent-[var(--accent)]"
                  />
                  <div>
                    <div>Corporate Tax on Net Profit (29%)</div>
                    <span className="text-[10px] text-muted">Standard normal tax regime on trading net profit</span>
                  </div>
                </label>

                <label className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer text-xs ${taxMode === "both" ? "border-accent bg-accent/10 font-semibold" : "border-line"}`}>
                  <input
                    type="radio"
                    name="taxMode"
                    checked={taxMode === "both"}
                    onChange={() => setTaxMode("both")}
                    className="accent-[var(--accent)]"
                  />
                  <div>
                    <div>Minimum Tax / Higher of Both</div>
                    <span className="text-[10px] text-muted">WHT adjusted against annual income tax return</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* WHT on Sale */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink">Client WHT on Sale %</span>
                  <span className="font-mono text-accent font-bold">{whtSaleRate}%</span>
                </div>
                <input
                  type="number"
                  step="any"
                  className="field text-xs font-mono w-full"
                  value={whtSaleRate}
                  onChange={(e) => setWhtSaleRate(Number(e.target.value))}
                />
                <div className="text-[11px] text-muted pt-1 flex justify-between">
                  <span>Deducted by Client:</span>
                  <strong className="text-ink font-mono">{fmtMoney(analysis.whtSaleAmountPKR, "PKR")}</strong>
                </div>
              </div>

              {/* WHT on Imports */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink">Customs WHT at Import %</span>
                  <span className="font-mono text-accent font-bold">{whtImportRate}%</span>
                </div>
                <input
                  type="number"
                  step="any"
                  className="field text-xs font-mono w-full"
                  value={whtImportRate}
                  onChange={(e) => setWhtImportRate(Number(e.target.value))}
                />
                <div className="text-[11px] text-muted pt-1 flex justify-between">
                  <span>Paid at Port:</span>
                  <strong className="text-ink font-mono">{fmtMoney(analysis.whtImportAmountPKR, "PKR")}</strong>
                </div>
              </div>

              {/* Sales Tax GST Output */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink">Sales Tax / GST Output %</span>
                  <span className="font-mono text-accent font-bold">{gstOutputRate}%</span>
                </div>
                <input
                  type="number"
                  step="any"
                  className="field text-xs font-mono w-full"
                  value={gstOutputRate}
                  onChange={(e) => setGstOutputRate(Number(e.target.value))}
                />
                <div className="text-[11px] text-muted pt-1 flex justify-between">
                  <span>Output GST Charged:</span>
                  <strong className="text-ink font-mono">{fmtMoney(analysis.gstOutputAmountPKR, "PKR")}</strong>
                </div>
              </div>

              {/* Sales Tax GST Input */}
              <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink">Input GST Paid on Cost %</span>
                  <span className="font-mono text-accent font-bold">{gstInputRate}%</span>
                </div>
                <input
                  type="number"
                  step="any"
                  className="field text-xs font-mono w-full"
                  value={gstInputRate}
                  onChange={(e) => setGstInputRate(Number(e.target.value))}
                />
                <div className="text-[11px] text-muted pt-1 flex justify-between">
                  <span>Net GST to Pay:</span>
                  <strong className="text-ink font-mono">{fmtMoney(analysis.netGstPayablePKR, "PKR")}</strong>
                </div>
              </div>
            </div>

            {/* Total Tax Liability Card */}
            <div className="rounded-lg border border-warn/30 bg-warn/5 p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase text-warn tracking-wider flex items-center gap-1.5">
                  <Receipt size={14} /> Total Estimated Tax Liability on Deal
                </span>
                <div className="font-mono text-2xl font-bold text-warn mt-0.5">
                  {fmtMoney(analysis.totalTaxPayablePKR, "PKR")}
                </div>
                <p className="text-xs text-muted mt-1">
                  Tax withheld or payable to government authorities (FBR / PRA).
                </p>
              </div>

              <div className="text-right font-mono text-xs space-y-1">
                <div>Withholding Tax (WHT): <strong>{fmtMoney(analysis.whtSaleAmountPKR, "PKR")}</strong></div>
                <div>Net Sales Tax (GST): <strong>{fmtMoney(analysis.netGstPayablePKR, "PKR")}</strong></div>
                {taxMode === "corporate" && (
                  <div>Corporate Income Tax ({incomeTaxRate}%): <strong>{fmtMoney(analysis.incomeTaxAmountPKR, "PKR")}</strong></div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: WATERFALL P&L & TARGET MARGIN SIMULATOR                   */}
        {/* ================================================================= */}
        {activeTab === "waterfall" && (
          <div className="mt-4 space-y-5">
            {/* Interactive Target Margin Goal Simulator */}
            <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
                    <Target size={15} className="text-accent" />
                    Target Net Margin Pricing Simulator
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    "If I want a <strong className="text-accent">{targetMarginGoal}% net profit</strong>, what price should I quote the customer?"
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted">Target Margin:</span>
                  <input
                    type="range"
                    min="1"
                    max="35"
                    step="0.5"
                    value={targetMarginGoal}
                    onChange={(e) => setTargetMarginGoal(Number(e.target.value))}
                    className="w-32 accent-[var(--accent)]"
                  />
                  <span className="font-mono text-sm font-bold text-accent w-12 text-right">
                    {targetMarginGoal}%
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-accent/20 pt-3">
                <div>
                  <span className="text-[11px] text-muted">Required Selling Price:</span>
                  <div className="font-mono text-lg font-bold text-ink">
                    {currency} {fmtNum(targetRequiredPricePerUnit, 2)} / unit
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-muted">Required Total Deal Revenue:</span>
                  <div className="font-mono text-lg font-bold text-ink">
                    {fmtMoney(targetRequiredPricePerUnit * analysis.totalQty, currency)}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-muted">Projected Net Cash Profit:</span>
                  <div className="font-mono text-lg font-bold text-good">
                    PKR {fmtNum((targetRequiredPricePerUnit * analysis.totalQty * exchangeRate) * (targetMarginGoal / 100))}
                  </div>
                </div>
              </div>
            </div>

            {/* Deal Income Statement Waterfall */}
            <div className="rounded-lg border border-line bg-surface overflow-hidden">
              <div className="bg-surface-2/60 px-4 py-3 border-b border-line">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Deal Financial Waterfall & Profitability Ladder
                </h3>
              </div>

              <div className="p-4 space-y-2.5 text-xs font-mono">
                {/* 1. Gross Revenue */}
                <div className="flex items-center justify-between border-b border-line/60 pb-2">
                  <span className="font-bold text-ink text-sm">1. Gross Sale Revenue ({currency} {fmtNum(analysis.totalSale)})</span>
                  <span className="font-bold text-ink text-sm">{fmtMoney(analysis.totalSalePKR, "PKR")}</span>
                </div>

                {/* 2. Purchase Cost */}
                <div className="flex items-center justify-between text-muted pl-4">
                  <span>Less: Supplier Purchase Cost ({purchaseCurrency} {fmtNum(analysis.totalPurchaseCost)})</span>
                  <span className="text-bad">- {fmtMoney(analysis.totalPurchaseCostPKR, "PKR")}</span>
                </div>

                {/* 3. Gross Profit */}
                <div className="flex items-center justify-between bg-surface-2/40 px-3 py-1.5 rounded font-bold text-ink border border-line">
                  <span>= Gross Profit ({fmtPct(analysis.grossMarginPct)} Gross Margin)</span>
                  <span className="text-accent">{fmtMoney(analysis.grossProfitPKR, "PKR")}</span>
                </div>

                {/* 4. Extra Landed Expenses */}
                <div className="space-y-1 pl-4 text-muted pt-1">
                  <div className="flex justify-between">
                    <span>• Freight & Shipping:</span>
                    <span>- {fmtMoney(freightAmount, "PKR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Customs Duties & Tariffs:</span>
                    <span>- {fmtMoney(customsDutyAmount, "PKR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• C&F Agent, Demurrage & Terminal:</span>
                    <span>- {fmtMoney(clearingAmount + portDemurrageAmount, "PKR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Insurance, Bank LC & Cartage:</span>
                    <span>- {fmtMoney(insuranceAmount + bankChargesAmount + cartageAmount + inspectionAmount + otherExpensesAmount, "PKR")}</span>
                  </div>
                </div>

                {/* 5. Total Landed Costs Subtotal */}
                <div className="flex items-center justify-between text-muted pl-4 border-t border-line/40 pt-1">
                  <span>Subtotal Landed Expenses:</span>
                  <span className="text-bad">- {fmtMoney(analysis.totalExtraCostsPKR, "PKR")}</span>
                </div>

                {/* 6. Commission */}
                <div className="flex items-center justify-between text-muted pl-4">
                  <span>Less: Broker Commission ({commissionRecipient || "Agent"}):</span>
                  <span className="text-bad">- {fmtMoney(analysis.totalCommissionPKR, "PKR")}</span>
                </div>

                {/* 7. Operating Profit */}
                <div className="flex items-center justify-between bg-surface-2/40 px-3 py-1.5 rounded font-bold text-ink border border-line">
                  <span>= Operating Deal Profit Before Tax ({fmtPct(analysis.operatingMarginPct)})</span>
                  <span className="text-ink">{fmtMoney(analysis.operatingProfitPKR, "PKR")}</span>
                </div>

                {/* 8. Taxes */}
                <div className="flex items-center justify-between text-muted pl-4">
                  <span>Less: Estimated Taxes ({taxMode === "corporate" ? `Corporate ${incomeTaxRate}%` : `WHT ${whtSaleRate}%`}):</span>
                  <span className="text-warn">- {fmtMoney(taxMode === "corporate" ? analysis.incomeTaxAmountPKR : analysis.whtSaleAmountPKR, "PKR")}</span>
                </div>

                {/* 9. Final Net Profit */}
                <div className="flex items-center justify-between bg-good/10 px-4 py-2.5 rounded-lg font-bold text-good border border-good/30 text-sm">
                  <span>= FINAL NET DEAL PROFIT ({fmtPct(analysis.netMarginPct)} Net Margin)</span>
                  <span className="text-base">{fmtMoney(analysis.netProfitPKR, "PKR")}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: PRINT / PDF SUMMARY VIEW                                  */}
        {/* ================================================================= */}
        {activeTab === "print" && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-end gap-2 print:hidden">
              <button
                type="button"
                className="btn btn-primary h-8 px-4 text-xs font-semibold"
                onClick={() => window.print()}
              >
                <Printer size={13} /> Print / Save as PDF
              </button>
            </div>

            <div className="rounded-xl border border-line bg-surface p-6 shadow-sm print:border-none print:shadow-none font-sans">
              {/* Header */}
              <div className="flex items-start justify-between border-b-2 border-line pb-4">
                <div>
                  <h1 className="text-xl font-bold text-ink">COMMERCIAL COSTING SHEET</h1>
                  <p className="text-xs text-muted mt-0.5">{title}</p>
                  <p className="text-xs font-mono text-faint">Serial: {activeId || "DRAFT"} · Date: {fmtDate(date)}</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-ink">{project || "A&SONS WORK"}</span>
                  <p className="text-xs text-muted">Status: <strong className="uppercase">{status}</strong></p>
                </div>
              </div>

              {/* Deal Parties */}
              <div className="mt-4 grid grid-cols-2 gap-4 text-xs border-b border-line pb-4">
                <div>
                  <span className="font-bold text-muted uppercase text-[10px]">Client / Buyer:</span>
                  <p className="font-semibold text-ink text-sm">{clientObj?.name || "Client Not Specified"}</p>
                  <p className="text-muted">{clientObj?.region} · {clientObj?.sector}</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-muted uppercase text-[10px]">Supplier / Origin:</span>
                  <p className="font-semibold text-ink text-sm">{supplierObj?.name || "Supplier Not Specified"}</p>
                  <p className="text-muted">{currency} Rate: {exchangeRate} PKR</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="mt-4">
                <table className="w-full text-left text-xs border border-line">
                  <thead className="bg-surface-2 text-muted font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2">Description</th>
                      <th className="p-2">Product/Brand</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2 text-right">Purchase Unit</th>
                      <th className="p-2 text-right">Sale Unit</th>
                      <th className="p-2 text-right">Total Purchase</th>
                      <th className="p-2 text-right">Total Sale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {items.map((it, i) => (
                      <tr key={i}>
                        <td className="p-2 font-medium">{it.description}</td>
                        <td className="p-2 text-muted">{it.product} {it.brand && `(${it.brand})`}</td>
                        <td className="p-2 text-right font-mono">{it.qty} {it.unit}</td>
                        <td className="p-2 text-right font-mono">{fmtMoney(it.unitCost, purchaseCurrency)}</td>
                        <td className="p-2 text-right font-mono font-semibold">{fmtMoney(it.unitPrice, currency)}</td>
                        <td className="p-2 text-right font-mono">{fmtMoney(num(it.qty) * num(it.unitCost), purchaseCurrency)}</td>
                        <td className="p-2 text-right font-mono font-bold">{fmtMoney(num(it.qty) * num(it.unitPrice), currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Financials Grid */}
              <div className="mt-4 grid grid-cols-2 gap-6 text-xs pt-2">
                <div className="space-y-1.5 border-r border-line pr-4">
                  <span className="font-bold uppercase text-[10px] text-muted">Landed Costs & Overheads</span>
                  <div className="flex justify-between"><span>Freight:</span><span className="font-mono">{fmtMoney(freightAmount, "PKR")}</span></div>
                  <div className="flex justify-between"><span>Customs Duties:</span><span className="font-mono">{fmtMoney(customsDutyAmount, "PKR")}</span></div>
                  <div className="flex justify-between"><span>Clearing & Demurrage:</span><span className="font-mono">{fmtMoney(clearingAmount + portDemurrageAmount, "PKR")}</span></div>
                  <div className="flex justify-between"><span>Insurance, LC & Cartage:</span><span className="font-mono">{fmtMoney(insuranceAmount + bankChargesAmount + cartageAmount + otherExpensesAmount, "PKR")}</span></div>
                  <div className="flex justify-between border-t border-line pt-1 font-bold">
                    <span>Total Landed Costs:</span>
                    <span className="font-mono">{fmtMoney(analysis.totalExtraCostsPKR, "PKR")}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span>Broker Commission ({commissionRecipient || "Agent"}):</span>
                    <span className="font-mono">{fmtMoney(analysis.totalCommissionPKR, "PKR")}</span>
                  </div>
                </div>

                <div className="space-y-1.5 font-mono">
                  <span className="font-bold uppercase text-[10px] text-muted font-sans">Final Profitability</span>
                  <div className="flex justify-between"><span>Gross Revenue:</span><span>{fmtMoney(analysis.totalSalePKR, "PKR")}</span></div>
                  <div className="flex justify-between"><span>Purchase Cost:</span><span>- {fmtMoney(analysis.totalPurchaseCostPKR, "PKR")}</span></div>
                  <div className="flex justify-between text-accent font-semibold"><span>Gross Profit ({fmtPct(analysis.grossMarginPct)}):</span><span>{fmtMoney(analysis.grossProfitPKR, "PKR")}</span></div>
                  <div className="flex justify-between"><span>Landed Costs + Commission:</span><span>- {fmtMoney(analysis.totalExtraCostsPKR + analysis.totalCommissionPKR, "PKR")}</span></div>
                  <div className="flex justify-between"><span>Taxes ({taxMode === "corporate" ? `Corp ${incomeTaxRate}%` : `WHT ${whtSaleRate}%`}):</span><span>- {fmtMoney(taxMode === "corporate" ? analysis.incomeTaxAmountPKR : analysis.whtSaleAmountPKR, "PKR")}</span></div>
                  <div className="flex justify-between border-t-2 border-line pt-1.5 text-good font-bold text-sm font-sans">
                    <span>NET DEAL PROFIT:</span>
                    <span>{fmtMoney(analysis.netProfitPKR, "PKR")} ({fmtPct(analysis.netMarginPct)})</span>
                  </div>
                  <div className="text-[10px] text-muted text-right font-sans pt-1">
                    Break-even: {currency} {fmtNum(analysis.breakEvenPriceDealCurrency, 2)} / unit
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Record Drawer for editing any linked records */}
      {openDrawerId && (
        <RecordDrawer
          col="costSheets"
          id={openDrawerId}
          onClose={() => setOpenDrawerId(null)}
          onOpen={(c, id) => {
            setOpenDrawerId(id);
            onOpenRecord?.(c, id);
          }}
        />
      )}
    </div>
  );
}
