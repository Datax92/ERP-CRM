"use client";

import { useEffect, useState } from "react";
import type { Column } from "@/lib/modules";

type Layout = { order: string[]; hidden: string[]; widths: Record<string, number> };
const empty: Layout = { order: [], hidden: [], widths: {} };
export function useTableColumns(id: string, definitions: Column[]) {
  const [layout, setLayout] = useState<Layout>(empty);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`erp-columns:${id}`) || "null");
      if (saved && Array.isArray(saved.order) && Array.isArray(saved.hidden)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLayout({ order: saved.order, hidden: saved.hidden, widths: saved.widths || {} });
      }
    } catch { /* A corrupt browser preference must never prevent opening records. */ }
    setReady(true);
  }, [id]);
  useEffect(() => {
    if (ready) try { localStorage.setItem(`erp-columns:${id}`, JSON.stringify(layout)); } catch { /* Private browsing */ }
  }, [layout, ready, id]);
  const keys = [...new Set([...layout.order, ...definitions.map(c => c.key)])].filter(k => definitions.some(c => c.key === k));
  const ordered = keys.map(k => definitions.find(c => c.key === k)!);
  const visible = ordered.filter(c => !layout.hidden.includes(c.key));
  const columns = visible.length ? visible : ordered.slice(0, 1);
  const move = (from: string, to: string) => {
    if (from === to || !keys.includes(from) || !keys.includes(to)) return;
    const next = keys.filter(k => k !== from); next.splice(keys.indexOf(to), 0, from);
    setLayout(p => ({ ...p, order: next }));
  };
  const resize = (key: string, width: number) => setLayout(p => ({ ...p, widths: { ...p.widths, [key]: Math.max(100, Math.min(700, width)) } }));
  const controls = <details className="relative">
    <summary className="btn cursor-pointer">Columns + / −</summary>
    <div className="absolute left-0 z-30 mt-2 w-72 max-h-96 overflow-auto rounded-lg border border-line bg-surface p-3 shadow-xl">
      <p className="mb-2 text-xs text-muted">Drag a column header to reorder. Drag header edges to resize. Use ← / → on a handle to move it.</p>
      {ordered.map(c => <label key={c.key} className="flex gap-2 py-1 text-sm">
        <input type="checkbox" aria-label={`Show ${c.label} column`} checked={columns.some(v => v.key === c.key)} disabled={columns.length === 1 && columns[0].key === c.key}
          onChange={e => setLayout(p => ({ ...p, hidden: e.target.checked ? p.hidden.filter(k => k !== c.key) : [...p.hidden, c.key] }))} />{c.label}
      </label>)}
      <button className="btn mt-2" onClick={() => setLayout(empty)}>Reset columns</button>
    </div>
  </details>;
  return { columns, controls, move, resize, width: (key: string) => layout.widths[key] || 180 };
}
