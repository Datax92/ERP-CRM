"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Download, Plus, Search } from "lucide-react";
import { useStore } from "./DataProvider";
import { RecordDrawer } from "./RecordDrawer";
import { CellView, Empty, PageHeader } from "./ui";
import { MODULES, type ModuleConfig } from "@/lib/modules";
import type { Store } from "@/lib/derive";
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
      const hay = [...m.searchKeys.map((k) => r[k]), ...m.columns.slice(0, 4).map((c) => c.cell(r, s).text), ...(r.items ?? []).map((i: Rec) => `${i.description} ${i.product} ${i.brand}`)]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

type Props = { col: CollectionName; subtitle?: string; report?: (rows: Rec[], s: Store, f: FilterState) => ReactNode; extraActions?: ReactNode; defaultTab?: "records" | "reports" };

export function ModulePage(props: Props) {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
      <ModulePageInner {...props} />
    </Suspense>
  );
}

function ModulePageInner({ col, subtitle, report, extraActions, defaultTab = "records" }: Props) {
  const s = useStore();
  const m = MODULES[col];
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [tab, setTab] = useState<"records" | "reports">((params.get("tab") as "records" | "reports" | null) ?? defaultTab);
  const [f, setF] = useState<FilterState>({ q: "", from: "", to: "", sel: {} });
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: m.columns.find((c) => c.key === "date") ? "date" : m.columns[0].key, dir: -1 });
  const [limit, setLimit] = useState(100);

  const openId = params.get("id") ?? (params.get("new") ? "new" : null);
  const openRecord = (c: CollectionName, id: string) => {
    if (c === col) router.replace(`${pathname}?id=${id}`, { scroll: false });
    else router.push(`${MODULES[c].href}?id=${id}`);
  };
  const close = () => router.replace(pathname, { scroll: false });

  const filtered = useMemo(() => applyFilters(m, s[col], f, s), [m, s, col, f]);
  const sorted = useMemo(() => {
    const c = m.columns.find((x) => x.key === sort.key) ?? m.columns[0];
    const keyed = filtered.map((r) => {
      const cell = c.cell(r, s);
      return { r, k: cell.sort ?? cell.text };
    });
    keyed.sort((a, b) => (typeof a.k === "number" && typeof b.k === "number" ? a.k - b.k : String(a.k).localeCompare(String(b.k))) * sort.dir);
    return keyed.map((x) => x.r);
  }, [filtered, sort, m, s]);

  const activeFilters = Object.values(f.sel).filter(Boolean).length + (f.from ? 1 : 0) + (f.to ? 1 : 0) + (f.q ? 1 : 0);

  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [m.columns.map((c) => esc(c.label)).join(","), ...sorted.map((r) => m.columns.map((c) => esc(c.cell(r, s).text)).join(","))];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${m.title.replace(/\W+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <PageHeader
        title={m.title}
        subtitle={subtitle}
        actions={
          <>
            {extraActions}
            <button className="btn" onClick={exportCsv} disabled={!sorted.length}>
              <Download size={14} /> Export
            </button>
            <button className="btn btn-primary" onClick={() => router.replace(`${pathname}?new=1`, { scroll: false })}>
              <Plus size={14} /> New {m.singular.toLowerCase()}
            </button>
          </>
        }
      />

      {/* Filters: one row above both the table and the reports */}
      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <label className="relative min-w-48 flex-1">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input className="field pl-8" placeholder="Search…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">From</span>
          <input type="date" className="field" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">To</span>
          <input type="date" className="field" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </label>
        {m.filters.map((def) => (
          <label key={def.key} className="flex flex-col gap-1.5">
            <span className="eyebrow">{def.label}</span>
            <select className="field max-w-44" value={f.sel[def.key] ?? ""} onChange={(e) => setF({ ...f, sel: { ...f.sel, [def.key]: e.target.value } })}>
              <option value="">All</option>
              {def.options(s).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        ))}
        {activeFilters > 0 && (
          <button className="btn" onClick={() => setF({ q: "", from: "", to: "", sel: {} })}>
            Clear ({activeFilters})
          </button>
        )}
      </div>

      {report && (
        <div role="tablist" className="mb-5 inline-flex rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow)]">
          {(["records", "reports"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition ${tab === t ? "bg-accent text-accent-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {t === "records" ? `Records (${filtered.length})` : "Reports & graphs"}
            </button>
          ))}
        </div>
      )}

      {tab === "reports" && report ? (
        report(filtered, s, f)
      ) : s.loading ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : sorted.length === 0 ? (
        <Empty>{s[col].length ? "No records match these filters." : `No ${m.title.toLowerCase()} yet. Use “New ${m.singular.toLowerCase()}” to add the first one.`}</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2/70 text-left">
              <tr>
                {m.columns.map((c) => (
                  <th key={c.key} className={`px-4 py-3 font-medium whitespace-nowrap first:pl-5 last:pr-5 ${c.align === "right" ? "text-right" : ""}`}>
                    <button className="eyebrow inline-flex items-center gap-1 hover:!text-ink" onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? (sort.dir === 1 ? -1 : 1) : -1 })}>
                      {c.label}
                      {sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, limit).map((r) => (
                <tr key={r.id} className="group cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-accent-soft/40" onClick={() => openRecord(col, r.id)}>
                  {m.columns.map((c, ci) => (
                    <td
                      key={c.key}
                      className={`max-w-72 truncate px-4 py-3 first:pl-5 last:pr-5 ${c.align === "right" ? "num text-right whitespace-nowrap" : ""} ${ci === 0 ? "font-medium text-ink" : "text-ink/85"}`}
                    >
                      <CellView cell={c.cell(r, s)} serial={c.key === "serial"} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > limit && (
            <div className="border-t border-line p-2 text-center">
              <button className="btn" onClick={() => setLimit(limit + 200)}>
                Show more ({sorted.length - limit} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {openId && !s.loading && <RecordDrawer key={`${col}-${openId}`} col={col} id={openId} onClose={close} onOpen={openRecord} />}
    </div>
  );
}
