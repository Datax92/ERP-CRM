"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, GripVertical, Copy, Download, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useStore } from "./DataProvider";
import { ModuleTotalBanner, ModuleTotalEndBar, ModuleTotalFooter } from "./ModuleTotalSummary";
import { countryFlag } from "@/lib/country";
import { MarketingChannels } from "./MarketingChannels";
import { collapseCampaigns, marketingChannel, summarize, type MarketingCampaign, type MarketingChannel } from "@/lib/marketing";
import { ContactCell } from "./ContactCell";
import { useColumnDrag } from "./useColumnDrag";
import { useTableColumns } from "./TableColumns";
import { stageKind } from "@/lib/stages";
import { RecordDrawer } from "./RecordDrawer";
import { CellView, Empty, PageHeader } from "./ui";
import { fetchExchangeRates, type ExchangeRateData } from "@/lib/fx";
import { MODULES, type Cell, type ModuleConfig } from "@/lib/modules";
import { fmtDate } from "@/lib/calc";
import { deliveryInfo, shipmentOrder, soInfo, type Store } from "@/lib/derive";
import type { CollectionName, Rec } from "@/lib/types";

export type FilterState = { q: string; from: string; to: string; sel: Record<string, string> };

export function applyFilters(m: ModuleConfig, rows: Rec[], f: FilterState, s: Store): Rec[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    const d: string = r.date ?? r.createdAt?.slice(0, 10) ?? "";
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    for (const def of m.filters) {
      const want = f.sel[def.key];
      if (!want) continue;
      const got = def.get(r, s);
      if (Array.isArray(got) ? !got.includes(want) : got !== want) return false;
    }
    if (q) {
      const hay = [
        ...m.searchKeys.map((k) => r[k]),
        ...m.columns.slice(0, 4).map((c) => c.cell(r, s).text),
        ...(m.col === "marketing" ? [s.byId.clients.get(r.clientId)?.email, s.byId.clients.get(r.clientId)?.whatsapp, s.byId.clients.get(r.clientId)?.mobile] : []),
        ...(r.items ?? []).map((i: Rec) => `${i.description} ${i.product} ${i.brand}`),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const contactGroup = (r: Rec, key: string, col: CollectionName) => key === "hierarchy" ? (col === "clients" ? [r.region, r.country, r.sector] : [r.region, r.country]).map(x => x || "Unspecified").join(" / ") : String(r[key] || "Unspecified");

type TableLine = { r: Rec; campaign?: MarketingCampaign; member?: boolean };

/** The single line shown for a group send: how many people were reached, and in which sectors. */
function campaignCell(key: string, g: MarketingCampaign, open: boolean, s: Store, fallback: Cell): Cell {
  const clients = g.members.map((x) => s.byId.clients.get(x.clientId)).filter((c): c is Rec => !!c);
  const count = new Set(g.members.map((x) => x.clientId || x.id)).size;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  switch (key) {
    case "who": return { text: `${open ? "▾" : "▸"} ${g.row.campaignGroup} (${plural(count, "client")})`, sort: fallback.sort };
    case "region": return { text: summarize(clients.map((c) => c.region), "regions") || "—" };
    case "sector": return { text: summarize(clients.map((c) => c.sector), "sectors") || "—" };
    case "clientEmail": return { text: plural(clients.filter((c) => c.email).length, "email") };
    case "clientWhatsapp": return { text: plural(clients.filter((c) => c.whatsapp || c.mobile).length, "number") };
    case "status": return new Set(g.members.map((x) => x.status)).size > 1 ? { text: "Mixed", tone: "info" } : fallback;
    case "response": return new Set(g.members.map((x) => x.response)).size > 1 ? { text: "Mixed", tone: "info" } : fallback;
    case "lastContactDate": return { text: fmtDate(g.row.lastContactDate || g.row.date) || "—", sort: g.row.lastContactDate || g.row.date || "" };
    case "lastContactDetails": return { text: g.row.lastContactDetails || g.row.subject || "—" };
    case "activity":
    case "inactiveDays": return { text: "—" };
    default: return fallback;
  }
}

const FINANCIAL_MODULES: Record<string, boolean> = {
  deliveries: true,
  quotations: true,
  salesOrders: true,
  purchaseOrders: true,
  proformaInvoices: true,
  payments: true,
  expenses: true,
  financeEntries: true,
  investors: true,
  companyDocs: true,
  rfqs: true,
};

type Props = {
  col: CollectionName;
  subtitle?: string;
  report?: (rows: Rec[], s: Store, f: FilterState) => ReactNode;
  extraActions?: ReactNode;
  /** Shown under the page header, above the filters. */
  banner?: ReactNode;
  defaultTab?: "records" | "reports";
};

export function ModulePage(props: Props) {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
      <ModulePageInner key={props.col} {...props} />
    </Suspense>
  );
}

function ModulePageInner({ col, subtitle, report, extraActions, banner, defaultTab = "records" }: Props) {
  const s = useStore();
  const m = MODULES[col];
  // Modules re-arranged to the client's sheet start from the new column order.
  const table = useTableColumns(col === "marketing" ? "marketing-client-contact-v3" : col === "payments" ? "payments-debit-credit-v1" : ["rfqs", "quotations", "salesOrders", "purchaseOrders"].includes(col) ? `${col}-client-sheet-v1` : col, m.columns);
  const tableRef = useRef<HTMLTableElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const columnDrag = useColumnDrag(tableRef, viewportRef, table.move);
  const [section, setSection] = useState(col === "shipments" ? "all" : "open");
  const sections = useMemo(() => {
    if (!["rfqs", "quotations", "salesOrders", "purchaseOrders", "shipments"].includes(col)) return [];
    const name = col === "rfqs" ? "RFQs" : col === "shipments" ? "Shipments" : m.title;
    const all = s[col];
    const open = all.filter(r => stageKind(col, r.status) === "open");
    const closed = all.filter(r => stageKind(col, r.status) !== "open");
    const workflow = [{ key: "open", label: `Open ${name}`, rows: open }, { key: "closed", label: `Closed ${name}`, rows: closed }];
    if (col === "rfqs") return [...workflow, { key: "all", label: "All RFQs", rows: all }];
    if (col !== "shipments") return workflow;
    const payments = new Map<string, string>();
    const payment = (shipment: Rec) => {
      const order = shipmentOrder(shipment, s);
      if (!order || order.status === "Cancelled" || shipment.status === "Cancelled") return "";
      if (!payments.has(order.id)) payments.set(order.id, soInfo(order, s).payment);
      return payments.get(order.id);
    };
    return [
      { key: "all", label: "Shipping Docs / Invoice", rows: all },
      { key: "paid", label: "Payment Received", rows: all.filter(r => payment(r) === "Paid") },
      ...workflow,
      { key: "due", label: "Payment Dues", rows: all.filter(r => ["Unpaid", "Partially paid"].includes(payment(r) || "")) },
    ];
  }, [col, m.title, s]);
  const sectionRows = sections.find(item => item.key === section)?.rows ?? s[col];
  const [groupBy, setGroupBy] = useState("");
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());
  const [copyMessage, setCopyMessage] = useState("");
  const isContact = col === "clients" || col === "suppliers";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const channelParam = params.get("channel") || "all";
  const marketingView: MarketingChannel = ["email", "whatsapp", "call", "other"].includes(channelParam) ? channelParam as MarketingChannel : "all";
  const tab = params.get('tab') === 'reports' && report ? 'reports' : params.get('tab') === 'records' ? 'records' : defaultTab;
  const setTab = (value: 'records' | 'reports') => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', value);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const [f, setF] = useState<FilterState>({ q: "", from: "", to: "", sel: {} });
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({
    key: m.columns.find((c) => c.key === "date") ? "date" : m.columns[0].key,
    dir: -1,
  });
  const [limit, setLimit] = useState(100);

  // Currency & Real-time exchange rate state
  const [targetCurrency, setTargetCurrency] = useState<string>("PKR");
  const [rateMode, setRateMode] = useState<"realtime" | "saved">("realtime");
  const [ratesData, setRatesData] = useState<ExchangeRateData | null>(null);
  const [refreshingRates, setRefreshingRates] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedCur = localStorage.getItem("trade_erp_target_currency");
        // Restore browser currency preferences after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (savedCur) setTargetCurrency(savedCur);
      } catch {
        // Ignore localStorage error
      }
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await fetchExchangeRates("USD");
        if (!cancelled) setRatesData(data);
      } catch {
        // Fallback gracefully
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCurrencyChange = (cur: string) => {
    setTargetCurrency(cur);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("trade_erp_target_currency", cur);
      } catch {
        // Ignore
      }
    }
  };

  const handleRefreshRates = async () => {
    setRefreshingRates(true);
    try {
      const data = await fetchExchangeRates("USD", true);
      setRatesData(data);
    } catch {
      // Ignore
    } finally {
      setRefreshingRates(false);
    }
  };

  const openId = params.get("id") ?? (params.get("new") ? "new" : null);
  const recordUrl = (id?: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete('id'); next.delete('new');
    if (id !== 'new') next.delete('client');
    if (id) next.set(id === 'new' ? 'new' : 'id', id === 'new' ? '1' : id);
    return `${pathname}${next.size ? `?${next}` : ''}`;
  };
  const openRecord = (c: CollectionName, id: string) => {
    if (c === col) router.replace(recordUrl(id), { scroll: false });
    else router.push(`${MODULES[c].href}?id=${id}`);
  };
  const close = () => router.replace(recordUrl(), { scroll: false });

  const filtered = useMemo(() => applyFilters(m, sectionRows, f, s).filter(r =>
    (col !== "marketing" || marketingView === "all" || marketingChannel(r.channel) === marketingView)
  ), [m, s, col, f, sectionRows, marketingView]);
  const sorted = useMemo(() => {
    const c = m.columns.find((x) => x.key === sort.key) ?? m.columns[0];
    const keyed = filtered.map((r) => {
      const cell = c.cell(r, s);
      return { r, k: cell.sort ?? cell.text };
    });
    keyed.sort(
      (a, b) =>
        (typeof a.k === "number" && typeof b.k === "number"
          ? a.k - b.k
          : String(a.k).localeCompare(String(b.k))) * sort.dir
    );
    const result = keyed.map((x) => x.r);
    if (groupBy) result.sort((a, b) => contactGroup(a, groupBy, col).localeCompare(contactGroup(b, groupBy, col)));
    return result;
  }, [filtered, sort, m, s, groupBy, col]);
  // A group send is one line in the marketing list; opening it shows each client.
  const lines = useMemo<TableLine[]>(() => col !== "marketing" ? sorted.map((r) => ({ r })) : collapseCampaigns(sorted).flatMap((g) =>
    g.members.length < 2 ? [{ r: g.row }] : [{ r: g.row, campaign: g }, ...(openCampaigns.has(g.key) ? g.members.map((r) => ({ r, member: true })) : [])]
  ), [col, sorted, openCampaigns]);
  const toggleCampaign = (key: string) => setOpenCampaigns((prev) => { const next = new Set(prev); if (!next.delete(key)) next.add(key); return next; });

  const panelFilters = Object.values(f.sel).filter(Boolean).length + (f.from ? 1 : 0) + (f.to ? 1 : 0);
  const activeFilters = panelFilters + (f.q ? 1 : 0);
  const [showFilters, setShowFilters] = useState(false);

  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      table.columns.map((c) => esc(c.label)).join(","),
      ...sorted.map((r) => table.columns.map((c) => esc(c.cell(r, s).text)).join(",")),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${m.title.replace(/\W+/g, "-").toLowerCase()}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const marketingPreset = col === "marketing" ? {
    ...(["email", "whatsapp", "call"].includes(marketingView) ? { channel: { email: "Email", whatsapp: "WhatsApp", call: "Call" }[marketingView as "email" | "whatsapp" | "call"] } : {}),
    ...(s.byId.clients.has(params.get("client") || "") ? { clientId: params.get("client") } : {}),
  } : undefined;
  const isFinancial = FINANCIAL_MODULES[col] === true;
  const financialRows = col === 'deliveries' ? sorted.map((r) => { const i = deliveryInfo(r, s); return { ...r, currency: i.currency, exchangeRate: i.exchangeRate, amount: i.value, amountPKR: i.valuePKR, totalCostPKR: i.costPKR, marginPKR: i.marginPKR }; }) : sorted;

  return (
    <div>
      <PageHeader
        title={m.title}
        subtitle={subtitle}
        actions={
          <>
            {extraActions}
            {table.controls}
            {isContact && <button className="btn" disabled={!sorted.some(r => r.email || r.emailCc1 || r.emailCc2)} onClick={async () => {
              // Main email plus both CC addresses.
              const emails = [...new Set(sorted.flatMap(r => [r.email, r.emailCc1, r.emailCc2].flatMap(e => String(e || "").split(/[;,\s]+/))).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
              try { await navigator.clipboard.writeText(emails.join("; ")); setCopyMessage(`All ${emails.length} email addresses have been copied.`); }
              catch { setCopyMessage("Could not access clipboard. Allow clipboard access and try again."); }
            }}><Copy size={14} /> Copy all emails</button>}
            <button className="btn" onClick={exportCsv} disabled={!sorted.length}>
              <Download size={14} /> Export
            </button>
            <button
              className="btn btn-primary"
              onClick={() => router.replace(recordUrl('new'), { scroll: false })}
            >
              <Plus size={14} /> New {m.singular.toLowerCase()}
            </button>
          </>
        }
      />

      {banner}
      {col === "marketing" && <MarketingChannels rows={s.marketing} value={marketingView} onChange={value => {
        const next = new URLSearchParams(params.toString()); next.set("channel", value); next.delete("new"); next.delete("id"); router.replace(`${pathname}?${next}`, { scroll: false });
      }} />}
      {copyMessage && <p role="status" className="mb-3 text-sm">{copyMessage}</p>}
      {sections.length > 0 && <div className="erp-tabs mb-3" role="tablist" aria-label={col === "rfqs" ? "RFQ sections" : m.title}>
        {sections.map(item => <button key={item.key} role="tab" aria-selected={section === item.key} onClick={() => { setSection(item.key); setLimit(100); }}>{item.label} ({item.rows.length})</button>)}
      </div>}
      {col === "clients" && <div className="erp-value-tabs">
        {(["sector", "country"] as const).map((key) => {
          // Counts respect every other filter, so the two rows can be combined.
          const base = applyFilters(m, s.clients, { ...f, sel: { ...f.sel, [key]: "" } }, s);
          const selected = f.sel[key] ?? "";
          const counts = new Map<string, number>();
          base.forEach((r) => { if (r[key]) counts.set(r[key], (counts.get(r[key]) ?? 0) + 1); });
          if (selected && !counts.has(selected)) counts.set(selected, 0);
          const label = key === "sector" ? "Sector" : "Country";
          return <div key={key} className="erp-value-tab-row">
            <span>{label}</span>
            <div role="tablist" aria-label={`Clients by ${key}`}>
              <button type="button" role="tab" aria-selected={!selected} onClick={() => setF({ ...f, sel: { ...f.sel, [key]: "" } })}>All ({base.length})</button>
              {[...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([value, n]) => (
                <button type="button" role="tab" key={value} aria-selected={selected === value} onClick={() => setF({ ...f, sel: { ...f.sel, [key]: value } })}>
                  {key === "country" && countryFlag(value) ? `${countryFlag(value)} ` : ""}{value} ({n})
                </button>
              ))}
            </div>
          </div>;
        })}
      </div>}
      {/* Filters: one compact toolbar; the detailed filters open only when asked for. */}
      <div className="erp-filters card">
        <div className="erp-filter-bar">
          <label className="relative min-w-48 flex-1">
            <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
            <input
              className="field pl-8"
              placeholder="Search…"
              aria-label={`Search ${m.title.toLowerCase()}`}
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
            />
          </label>
          {isContact && <label className="erp-filter-inline">
            <span>Group by</span>
            <select className="field" aria-label="Group contacts by" value={groupBy} onChange={e => setGroupBy(e.target.value)}><option value="">No grouping</option><option value="hierarchy">{col === "clients" ? "Region → Country → Sector" : "Region → Country"}</option><option value="region">Region</option><option value="country">Country</option>{col === "clients" && <option value="sector">Sector</option>}</select>
          </label>}
          <button type="button" className={`btn ${showFilters || panelFilters ? "erp-filter-on" : ""}`} aria-expanded={showFilters} onClick={() => setShowFilters(v => !v)}>
            <SlidersHorizontal size={14} /> Filters{panelFilters ? ` (${panelFilters})` : ""}
          </button>
          {activeFilters > 0 && (
            <button className="btn" onClick={() => { setF({ q: "", from: "", to: "", sel: {} }); }}>
              Clear ({activeFilters})
            </button>
          )}
        </div>
        {showFilters && <div className="erp-filter-panel">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">From</span>
            <input type="date" className="field" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">To</span>
            <input type="date" className="field" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </label>
          {m.filters.filter(def => col !== "marketing" || def.key !== "channel").map((def) => (
            <label key={def.key} className="flex flex-col gap-1">
              <span className="eyebrow">{def.label}</span>
              <select
                aria-label={def.label}
                className="field"
                value={f.sel[def.key] ?? ""}
                onChange={(e) => setF({ ...f, sel: { ...f.sel, [def.key]: e.target.value } })}
              >
                <option value="">All</option>
                {def.options(s).map((o) => (
                  <option key={o} value={o}>{def.key === "country" ? `${countryFlag(o) || "🌐"} ${o}` : o}</option>
                ))}
              </select>
            </label>
          ))}
        </div>}
      </div>

      {report && (
        <div
          role="tablist"
          aria-label="View"
          className="erp-tabs mb-3"
        >
          {(["records", "reports"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className="transition"
            >
              {t === "records" ? `Records (${filtered.length})` : "Reports & graphs"}
            </button>
          ))}
        </div>
      )}

      {/* Total Price Banner at the START of the entries */}
      {isFinancial && tab === "records" && sorted.length > 0 && (
        <ModuleTotalBanner
          col={col}
          title={m.title}
          rows={financialRows}
          targetCurrency={targetCurrency}
          onCurrencyChange={handleCurrencyChange}
          ratesData={ratesData}
          rateMode={rateMode}
          onRateModeChange={setRateMode}
          onRefreshRates={handleRefreshRates}
          refreshingRates={refreshingRates}
        />
      )}

      {tab === "reports" && report ? (
        report(filtered, s, f)
      ) : s.loading ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : sorted.length === 0 ? (
        <Empty>
          {s[col].length
            ? "No records match these filters."
            : `No ${m.title.toLowerCase()} yet. Use “New ${m.singular.toLowerCase()}” to add the first one.`}
        </Empty>
      ) : (
        <>
          <div ref={viewportRef} className={`card overflow-x-auto erp-column-viewport ${isContact ? "erp-contact-grid" : ""}`}>
            <table ref={tableRef} onClickCapture={columnDrag.captureClick} className="erp-table erp-compact-table text-sm" style={{ tableLayout: "fixed", width: table.columns.reduce((total, c) => total + table.width(c.key), 0), minWidth: "100%" }} aria-label={m.title}>
              <thead className="border-b border-line bg-surface-2/70 text-left">
                <tr>
                  {table.columns.map((c) => (
                    <th
                      key={c.key}
                      style={{ width: table.width(c.key), position: "relative" }}
                      data-column-key={c.key}
                      onPointerDown={e => columnDrag.start(c.key, e)}
                      onDragStart={e => e.preventDefault()}
                      className={`px-4 py-3 font-medium whitespace-nowrap first:pl-5 last:pr-5 ${
                        c.align === "right" ? "text-right" : ""
                      }`}
                    >
                      <button aria-label={`Move ${c.label} column`} className="erp-column-grip inline-flex cursor-grab text-faint" title="Drag to move the whole column"
                        onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); const i = table.columns.findIndex(x => x.key === c.key); const target = table.columns[i + (e.key === "ArrowLeft" ? -1 : 1)]; if (target) table.move(c.key, target.key); } }}><GripVertical size={13} /></button>
                      <button
                        className="eyebrow inline-flex items-center gap-1 hover:!text-ink"
                        onClick={() =>
                          setSort({
                            key: c.key,
                            dir: sort.key === c.key ? (sort.dir === 1 ? -1 : 1) : -1,
                          })
                        }
                      >
                        {c.label}
                        {sort.key === c.key &&
                          (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                      <span role="separator" aria-label={`Resize ${c.label} column`} aria-orientation="vertical" tabIndex={0} className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none hover:bg-accent/20"
                        onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); table.resize(c.key, table.width(c.key) + (e.key === "ArrowRight" ? 20 : -20)); } }}
                        onPointerDown={e => { e.preventDefault(); const start = e.clientX, width = table.width(c.key); e.currentTarget.setPointerCapture(e.pointerId); const el = e.currentTarget; const move = (ev: PointerEvent) => table.resize(c.key, width + ev.clientX - start); const end = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", end); el.removeEventListener("pointercancel", end); }; el.addEventListener("pointermove", move); el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end); }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.slice(0, limit).map(({ r, campaign, member }, index) => (
                  <Fragment key={campaign ? `campaign-${campaign.key}` : r.id}>
                  {groupBy && (index === 0 || contactGroup(lines[index - 1].r, groupBy, col) !== contactGroup(r, groupBy, col)) && <tr className="bg-surface-2"><th scope="rowgroup" colSpan={table.columns.length} className="px-4 py-2 text-left text-xs font-semibold">{contactGroup(r, groupBy, col)}</th></tr>}
                  <tr
                    tabIndex={0}
                    aria-expanded={campaign ? openCampaigns.has(campaign.key) : undefined}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (campaign) toggleCampaign(campaign.key); else openRecord(col, r.id); } }}
                    className={`group cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-accent-soft/40 ${member ? "erp-campaign-member" : ""}`}
                    onClick={() => { if (campaign) toggleCampaign(campaign.key); else openRecord(col, r.id); }}
                  >
                    {table.columns.map((c, ci) => {
                      const base = c.cell(r, s);
                      const cell = campaign ? campaignCell(c.key, campaign, openCampaigns.has(campaign.key), s, base) : base;
                      return (
                      <td
                        key={c.key}
                        data-column-key={c.key}
                        title={cell.text === "—" ? undefined : cell.text}
                        className={`max-w-72 truncate px-4 py-3 first:pl-5 last:pr-5 ${
                          c.align === "right" ? "num text-right whitespace-nowrap" : ""
                        } ${ci === 0 ? "font-medium text-ink" : "text-ink/85"}`}
                      >
                        <span className={/margin|profit/i.test(c.key) ? (Number(cell.sort) < 0 ? "text-bad" : Number(cell.sort) > 0 ? "text-good" : "") : ""}>{isContact ? <ContactCell column={c.key} cell={cell} /> : <CellView cell={cell} serial={c.key === "serial"} />}</span>
                      </td>
                    ); })}
                  </tr>
                  </Fragment>
                ))}
              </tbody>

              {/* Total Price at the END of entries in the table footer */}
              {isFinancial && (
                <ModuleTotalFooter
                  col={col}
                  columns={table.columns}
                  rows={financialRows}
                  targetCurrency={targetCurrency}
                  ratesData={ratesData}
                  rateMode={rateMode}
                />
              )}
            </table>
            {lines.length > limit && (
              <div className="border-t border-line p-2 text-center">
                <button className="btn" onClick={() => setLimit(limit + 200)}>
                  Show more ({lines.length - limit} remaining)
                </button>
              </div>
            )}
          </div>

          {/* Bottom compact summary bar at the end */}
          {isFinancial && (
            <ModuleTotalEndBar
              rows={financialRows}
              col={col}
              targetCurrency={targetCurrency}
              onCurrencyChange={handleCurrencyChange}
              ratesData={ratesData}
              rateMode={rateMode}
            />
          )}
        </>
      )}

      {openId && !s.loading && (
        <RecordDrawer
          key={`${col}-${openId}`}
          col={col}
          initialValues={marketingPreset}
          id={openId}
          onClose={close}
          onOpen={openRecord}
        />
      )}
    </div>
  );
}
