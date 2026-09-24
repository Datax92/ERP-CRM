"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { fmtCompact, fmtMonth, fmtNum } from "@/lib/calc";
import { Empty } from "./ui";

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

// SVG attributes (fill, stroke) don't accept CSS var(), so chart colours are read from the
// theme tokens at runtime and re-read when the OS switches between light and dark.
const TOKENS = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-6", "--faint", "--grid", "--surface", "--surface-2"];
const LIGHT = "#2a78d6|#eb6834|#1baf7a|#eda100|#e87ba4|#008300|#8a8984|#e7e6e2|#fcfcfb|#f0efec";
const readTokens = () => {
  const cs = getComputedStyle(document.documentElement);
  return TOKENS.map((t) => cs.getPropertyValue(t).trim()).join("|") || LIGHT;
};
const subscribeScheme = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
function useChartColors() {
  const v = useSyncExternalStore(subscribeScheme, readTokens, () => LIGHT).split("|");
  return { series: v.slice(0, 6), faint: v[6], grid: v[7], surface: v[8], surface2: v[9] };
}

export type Kpi = { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn" };

export function Kpis({ items }: { items: Kpi[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((k) => (
        <div key={k.label} className="card p-3">
          <div className="text-xs text-muted">{k.label}</div>
          <div className={`mt-1 text-lg font-semibold tracking-tight ${k.tone === "bad" ? "text-bad" : k.tone === "good" ? "text-good" : k.tone === "warn" ? "text-warn" : ""}`}>{k.value}</div>
          {k.sub && <div className="mt-0.5 text-xs text-faint">{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`card p-4 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export type SeriesDef = { key: string; label: string };

function TipBox({ active, payload, label, money, labelFmt }: TooltipContentProps<number, string> & { money?: boolean; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{labelFmt ? labelFmt(String(label)) : String(label)}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium text-ink">{money ? `PKR ${fmtNum(p.value)}` : fmtNum(p.value, 1)}</span>
        </div>
      ))}
    </div>
  );
}

const axisProps = (faint: string) => ({ stroke: faint, fontSize: 11, tickLine: false, axisLine: false }) as const;

/** Monthly (or any categorical x) bars. `stacked` for parts of a whole, grouped otherwise. */
export function BarsChart({ data, series, xKey = "month", money, stacked, height = 240, xIsMonth = true }: { data: Record<string, string | number>[]; series: SeriesDef[]; xKey?: string; money?: boolean; stacked?: boolean; height?: number; xIsMonth?: boolean }) {
  const c = useChartColors();
  if (!data.length) return <Empty>No data in this range.</Empty>;
  const fmtX = (v: string) => (xIsMonth ? fmtMonth(v) : v);
  const axis = axisProps(c.faint);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey={xKey} {...axis} tickFormatter={fmtX} />
        <YAxis {...axis} width={44} tickFormatter={(v) => fmtCompact(v)} />
        <Tooltip cursor={{ fill: c.surface2 }} content={(p) => <TipBox {...(p as TooltipContentProps<number, string>)} money={money} labelFmt={fmtX} />} />
        {series.length > 1 && <Legend itemSorter={null} iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />}
        {series.map((sd, i) => (
          <Bar
            key={sd.key}
            dataKey={sd.key}
            name={sd.label}
            fill={c.series[i]}
            stackId={stacked ? "a" : undefined}
            radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
            stroke={c.surface}
            strokeWidth={stacked ? 1 : 0}
            maxBarSize={40}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LinesChart({ data, series, xKey, money, height = 240, xFmt }: { data: Record<string, string | number>[]; series: SeriesDef[]; xKey: string; money?: boolean; height?: number; xFmt?: (v: string) => string }) {
  const c = useChartColors();
  if (!data.length) return <Empty>No data in this range.</Empty>;
  const axis = axisProps(c.faint);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey={xKey} {...axis} tickFormatter={xFmt} />
        <YAxis {...axis} width={44} tickFormatter={(v) => fmtCompact(v)} />
        <Tooltip cursor={{ stroke: c.faint, strokeDasharray: "3 3" }} content={(p) => <TipBox {...(p as TooltipContentProps<number, string>)} money={money} labelFmt={xFmt} />} />
        {series.length > 1 && <Legend itemSorter={null} iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />}
        {series.map((sd, i) => (
          <Line key={sd.key} type="monotone" dataKey={sd.key} name={sd.label} stroke={c.series[i]} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: c.surface, fill: c.series[i] }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Ranked horizontal bars (top clients, regions, products). Values are always labelled. */
export function RankBars({ rows, money, max = 10, color = SERIES[0] }: { rows: { label: string; value: number; sub?: string }[]; money?: boolean; max?: number; color?: string }) {
  const top = [...rows].sort((a, b) => b.value - a.value).slice(0, max);
  if (!top.length || top.every((r) => !r.value)) return <Empty>No data in this range.</Empty>;
  const peak = Math.max(...top.map((r) => r.value)) || 1;
  return (
    <ul className="space-y-2">
      {top.map((r) => (
        <li key={r.label} title={`${r.label}: ${money ? "PKR " : ""}${fmtNum(r.value)}`}>
          <div className="mb-0.5 flex justify-between gap-2 text-xs">
            <span className="truncate text-ink">{r.label}</span>
            <span className="shrink-0 text-muted">
              {money ? `PKR ${fmtCompact(r.value)}` : fmtNum(r.value)}
              {r.sub && <span className="ml-1 text-faint">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-sm bg-surface-2">
            <div className="h-2 rounded-sm" style={{ width: `${Math.max(2, (r.value / peak) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SimpleTable({ head, rows, empty = "Nothing to show." }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-2 py-1.5 font-medium ${i > 0 && /(PKR|Value|Amount|%|days|Count|Margin|Cost|Price|Paid|Pending|Outstanding|Qty|Total|Late|Revenue|Profit)/i.test(h) ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((c, j) => (
                <td key={j} className={`px-2 py-1.5 ${j > 0 && /(PKR|Value|Amount|%|days|Count|Margin|Cost|Price|Paid|Pending|Outstanding|Qty|Total|Late|Revenue|Profit)/i.test(head[j]) ? "text-right whitespace-nowrap" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
