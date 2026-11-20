"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Download, Printer, Trash2 } from "lucide-react";
import { useStore } from "@/components/DataProvider";
import { ChartCard, RankBars } from "@/components/charts";
import { RecordLink } from "@/components/RecordDrawer";
import { Empty, PageHeader } from "@/components/ui";
import { saveSettings } from "@/lib/db";
import { fmtDate, fmtNum, fmtPct } from "@/lib/calc";
import { reportByKey, STANDARD_REPORTS, type FilterKey, type ReportColumn, type ReportFilters } from "@/lib/standardReports";
import type { MemorizedReport } from "@/lib/types";

export default function ReportsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Reports />
    </Suspense>
  );
}

const FILTER_LABELS: Record<FilterKey, string> = { from: "From", to: "To", region: "Region", sector: "Sector", country: "Country", clientId: "Customer", supplierId: "Supplier" };
const FILTER_KEYS = Object.keys(FILTER_LABELS) as FilterKey[];

function show(v: string | number, c: ReportColumn) {
  if (v === "" || v == null) return "—";
  if (c.kind === "money") return fmtNum(v);
  if (c.kind === "num") return fmtNum(v, 2);
  if (c.kind === "pct") return fmtPct(v);
  if (c.kind === "date") return fmtDate(String(v)) || "—";
  if (c.kind === "days") return `${fmtNum(v)} d`;
  return String(v);
}

function Reports() {
  const s = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const key = params.get("r") || STANDARD_REPORTS[0].key;
  const def = reportByKey(key) ?? STANDARD_REPORTS[0];
  const filters: ReportFilters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ""]).filter(([, v]) => v));
  const [memName, setMemName] = useState("");
  const [naming, setNaming] = useState(false);
  const [msg, setMsg] = useState("");

  const go = (r: string, f: ReportFilters) => {
    const next = new URLSearchParams({ r });
    Object.entries(f).forEach(([k, v]) => v && next.set(k, String(v)));
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const setFilter = (k: FilterKey, v: string) => go(def.key, { ...filters, [k]: v });

  const result = def.run(s, filters);
  const totals = result.columns.map((c, i) => (c.total ? result.rows.reduce((t, r) => t + (Number(r.cells[i]) || 0), 0) : null));
  const chartCol = def.chartBy !== undefined ? result.columns[def.chartBy] : undefined;
  const chart = chartCol
    ? result.rows.map((r) => ({ label: String(r.cells[0]) + (def.key === "regionSector" || def.key === "marketingByRegion" ? ` · ${r.cells[1]}` : ""), value: Number(r.cells[def.chartBy!]) || 0 }))
    : [];

  const regions = [...new Set([...s.settings.regions, ...s.clients.map((c) => c.region)].filter(Boolean))].sort();
  const sectors = [...new Set([...s.settings.sectors, ...s.clients.map((c) => c.sector)].filter(Boolean))].sort();
  const countries = [...new Set(s.clients.map((c) => c.country).filter(Boolean))].sort();
  const options: Partial<Record<FilterKey, [string, string][]>> = {
    region: regions.map((x) => [x, x]),
    sector: sectors.map((x) => [x, x]),
    country: countries.map((x) => [x, x]),
    clientId: [...s.clients].sort((a, b) => String(a.name).localeCompare(String(b.name))).map((c) => [c.id, c.name]),
    supplierId: [...s.suppliers].sort((a, b) => String(a.name).localeCompare(String(b.name))).map((c) => [c.id, c.name]),
  };

  async function memorize() {
    const name = memName.trim() || `${def.title}${filters.region ? ` – ${filters.region}` : ""}`;
    const created = new Date();
    const m: MemorizedReport = { id: `mr-${created.getTime().toString(36)}`, name, report: def.key, filters: filters as Record<string, string>, createdAt: created.toISOString(), createdBy: s.user.email ?? "" };
    try {
      await saveSettings({ ...s.settings, memorizedReports: [...s.settings.memorizedReports, m] });
      setMsg(`Memorized as “${name}”.`);
      setNaming(false);
      setMemName("");
    } catch (e) {
      setMsg(`Could not memorize: ${(e as Error).message}`);
    }
  }
  async function forget(id: string) {
    await saveSettings({ ...s.settings, memorizedReports: s.settings.memorizedReports.filter((m) => m.id !== id) }).catch((e) => setMsg((e as Error).message));
  }

  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [result.columns.map((c) => esc(c.label)).join(","), ...result.rows.map((r) => r.cells.map((v) => esc(String(v ?? ""))).join(","))];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${def.key}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const groups = [...new Set(STANDARD_REPORTS.map((r) => r.group))];
  const activeFilters = Object.entries(filters).filter(([k, v]) => v && def.filters.includes(k as FilterKey));
  const filterText = activeFilters.map(([k, v]) => `${FILTER_LABELS[k as FilterKey]}: ${k === "clientId" ? s.byId.clients.get(v as string)?.name : k === "supplierId" ? s.byId.suppliers.get(v as string)?.name : k === "from" || k === "to" ? fmtDate(v as string) : v}`).join(" · ");

  return (
    <div>
      <PageHeader title="Reports" subtitle="Standard reports for customers, sales, payments, suppliers and operations — memorize any report with its filters to run it again." />
      <div className="erp-reports">
        <aside className="erp-report-list card" data-noprint>
          {groups.map((g) => (
            <div key={g}>
              <h4>{g}</h4>
              {STANDARD_REPORTS.filter((r) => r.group === g).map((r) => (
                <button key={r.key} type="button" aria-current={r.key === def.key ? "true" : undefined} onClick={() => go(r.key, {})}>
                  {r.title}
                </button>
              ))}
            </div>
          ))}
          <div>
            <h4>Memorized reports</h4>
            {s.settings.memorizedReports.length === 0 && <p className="px-2 text-xs text-muted">Run a report, set its filters and press “Memorize” to keep it here.</p>}
            {s.settings.memorizedReports.map((m) => (
              <div key={m.id} className="erp-report-mem">
                <button type="button" onClick={() => go(m.report, m.filters)} title={reportByKey(m.report)?.title}>
                  <Bookmark size={12} /> {m.name}
                </button>
                <button type="button" className="erp-report-del" aria-label={`Delete memorized report ${m.name}`} onClick={() => forget(m.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="card erp-report-head">
            <div>
              <h2>{def.title}</h2>
              <p>{def.description}</p>
              {filterText && <p className="erp-report-filters-text">{filterText}</p>}
            </div>
            <div className="flex flex-wrap gap-2" data-noprint>
              {naming ? (
                <>
                  <input className="field w-56" autoFocus value={memName} onChange={(e) => setMemName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && memorize()} placeholder="Name, e.g. Cement customers 2026" aria-label="Memorized report name" />
                  <button type="button" className="btn btn-primary" onClick={memorize}>Save</button>
                  <button type="button" className="btn" onClick={() => setNaming(false)}>Cancel</button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => setNaming(true)}><Bookmark size={14} /> Memorize</button>
              )}
              <button type="button" className="btn" onClick={exportCsv} disabled={!result.rows.length}><Download size={14} /> Export</button>
              <button type="button" className="btn" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            </div>
          </div>
          {msg && <p role="status" className="mb-3 text-sm">{msg}</p>}

          <div className="erp-filter-panel card mb-4" data-noprint>
            {def.filters.map((k) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="eyebrow">{FILTER_LABELS[k]}</span>
                {k === "from" || k === "to" ? (
                  <input type="date" className="field" value={filters[k] ?? ""} onChange={(e) => setFilter(k, e.target.value)} />
                ) : (
                  <select className="field" value={filters[k] ?? ""} onChange={(e) => setFilter(k, e.target.value)}>
                    <option value="">All</option>
                    {(options[k] ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
              </label>
            ))}
            {activeFilters.length > 0 && <button type="button" className="btn self-end" onClick={() => go(def.key, {})}>Clear</button>}
          </div>

          {chartCol && chart.some((c) => c.value) && (
            <ChartCard title={`Top ${Math.min(10, chart.filter((c) => c.value).length)} by ${chartCol.label.replace(/^./, (x) => x.toLowerCase())}`} className="mb-4">
              <RankBars rows={chart.filter((c) => c.value)} money={chartCol.kind === "money"} />
            </ChartCard>
          )}

          {result.rows.length === 0 ? (
            <Empty>No records for this report and these filters.</Empty>
          ) : (
            <div className="card overflow-x-auto">
              <table className="erp-report-table">
                <thead>
                  <tr>{result.columns.map((c) => <th key={c.label} className={c.kind === "text" || c.kind === "date" ? "" : "r"}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>
                      {r.cells.map((v, j) => (
                        <td key={j} className={result.columns[j].kind === "text" || result.columns[j].kind === "date" ? "" : "r num"}>
                          {j === 0 && r.link ? <RecordLink col={r.link.col} id={r.link.id}>{show(v, result.columns[j])}</RecordLink> : show(v, result.columns[j])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {totals.some((t) => t !== null) && (
                  <tfoot>
                    <tr>
                      {result.columns.map((c, i) => (
                        <th key={c.label} className={i === 0 ? "" : "r num"}>{i === 0 ? `Total · ${result.rows.length} rows` : totals[i] === null ? "" : show(totals[i]!, c)}</th>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
