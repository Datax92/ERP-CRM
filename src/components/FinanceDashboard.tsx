"use client";

import { useMemo, useState } from "react";
import { BarsChart, ChartCard, Kpis, LinesChart, RankBars, SimpleTable } from "./charts";
import { RecordLink } from "./RecordDrawer";
import { fmtCompact, fmtDate, fmtMonth, fmtNum, rateOf } from "@/lib/calc";
import { cashFlows, outstandingReceivables, plLines, sumPL, type Flow } from "@/lib/finance";
import { poInfo, type Store } from "@/lib/derive";
import { MODULES } from "@/lib/modules";
import { groupSum, monthlyMeasures } from "@/lib/report";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const METRICS: Record<string, { label: string; value: (s: Store) => { date: string; v: number }[] }> = {
  sales: { label: "Sales booked", value: (s) => plLines(s, "orders").map((l) => ({ date: l.date, v: l.revenue })) },
  gross: { label: "Gross profit (orders)", value: (s) => plLines(s, "orders").map((l) => ({ date: l.date, v: l.revenue - l.cost })) },
  moneyIn: { label: "Money in", value: (s) => cashFlows(s).filter((f) => f.dir === "in").map((f) => ({ date: f.date, v: f.pkr })) },
  moneyOut: { label: "Money out", value: (s) => cashFlows(s).filter((f) => f.dir === "out").map((f) => ({ date: f.date, v: f.pkr })) },
  expenses: { label: "Expenses", value: (s) => plLines(s, "orders").map((l) => ({ date: l.date, v: l.opex })) },
};

/** Year-vs-year comparison — the extra graphical comparison asked for Accounting & Finance. */
export function YearCompare({ s }: { s: Store }) {
  const years = useMemo(() => {
    const ys = new Set<string>([String(new Date().getFullYear())]);
    cashFlows(s).forEach((f) => ys.add(f.date.slice(0, 4)));
    s.salesOrders.forEach((o) => o.date && ys.add(o.date.slice(0, 4)));
    return [...ys].sort().reverse();
  }, [s]);
  const [metric, setMetric] = useState("sales");
  const [a, setA] = useState(years[0]);
  const [b, setB] = useState(years[1] ?? years[0]);
  const points = METRICS[metric].value(s);
  const data = MONTHS.map((m, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const sum = (y: string) => points.filter((p) => p.date.startsWith(`${y}-${mm}`)).reduce((t, p) => t + p.v, 0);
    return { month: m, a: sum(a), b: sum(b) };
  });
  const sel = (v: string, on: (v: string) => void, opts: [string, string][]) => (
    <select className="field w-auto" value={v} onChange={(e) => on(e.target.value)}>
      {opts.map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  );
  return (
    <ChartCard title="Year-on-year comparison (PKR)" subtitle="Pick a measure and two years">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {sel(metric, setMetric, Object.entries(METRICS).map(([k, m]) => [k, m.label]))}
        {sel(a, setA, years.map((y) => [y, y]))}
        <span className="text-muted">vs</span>
        {sel(b, setB, years.map((y) => [y, y]))}
      </div>
      <LinesChart
        data={data}
        xKey="month"
        money
        series={[
          { key: "a", label: a },
          { key: "b", label: b },
        ]}
      />
    </ChartCard>
  );
}

export function FinanceDashboard({ s, from, to }: { s: Store; from: string; to: string }) {
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const flows = cashFlows(s).filter((f) => inRange(f.date));
  const money = (xs: Flow[]) => xs.reduce((t, f) => t + f.pkr, 0);
  const ins = flows.filter((f) => f.dir === "in");
  const outs = flows.filter((f) => f.dir === "out");
  const pl = sumPL(plLines(s, "orders").filter((l) => inRange(l.date)));
  const payable = s.purchaseOrders.filter((o) => o.status !== "Cancelled").reduce((t, o) => t + poInfo(o, s).outstanding * rateOf(o), 0);

  const monthlyFlow = monthlyMeasures(
    flows,
    [
      { key: "in", value: (r) => (r.dir === "in" ? r.pkr : 0) },
      { key: "out", value: (r) => (r.dir === "out" ? r.pkr : 0) },
    ],
  );
  const nets = monthlyFlow.map((r) => Number(r.in) - Number(r.out));
  const netData = monthlyFlow.map((r, i) => ({ month: r.month, net: nets[i], balance: nets.slice(0, i + 1).reduce((a, b) => a + b, 0) }));

  return (
    <div>
      <Kpis
        items={[
          { label: "Money in (PKR)", value: fmtCompact(money(ins)), tone: "good" },
          { label: "Money out (PKR)", value: fmtCompact(money(outs)) },
          { label: "Net cash flow", value: fmtCompact(money(ins) - money(outs)), tone: money(ins) - money(outs) < 0 ? "bad" : "good" },
          { label: "Gross profit (orders)", value: fmtCompact(pl.gross), sub: `${pl.grossPct.toFixed(1)}% of sales` },
          { label: "Receivable now", value: fmtCompact(outstandingReceivables(s)), tone: "warn" },
          { label: "Payable now", value: fmtCompact(payable), tone: "warn" },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Money in vs money out by month (PKR)">
          <BarsChart
            data={monthlyFlow}
            money
            series={[
              { key: "in", label: "Money in" },
              { key: "out", label: "Money out" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Cash position over time (PKR)" subtitle="Running total of net cash flow in the selected range">
          <LinesChart data={netData} xKey="month" money xFmt={fmtMonth} series={[{ key: "balance", label: "Cash position" }]} />
        </ChartCard>
        <YearCompare s={s} />
        <ChartCard title="Net cash flow by month (PKR)">
          <BarsChart data={netData} money series={[{ key: "net", label: "Net" }]} />
        </ChartCard>
        <ChartCard title="Money in by source (PKR)">
          <RankBars rows={groupSum(ins, (r) => r.kind, (r) => r.pkr)} money color="var(--series-3)" />
        </ChartCard>
        <ChartCard title="Money out by type (PKR)">
          <RankBars rows={groupSum(outs, (r) => r.kind, (r) => r.pkr)} money color="var(--series-2)" />
        </ChartCard>
      </div>
      <div className="mt-4">
        <ChartCard title="Latest money movements">
          <SimpleTable
            head={["Date", "Type", "Party", "In PKR", "Out PKR"]}
            empty="No money movements in this range."
            rows={[...flows]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 25)
              .map((f) => [
                fmtDate(f.date),
                <RecordLink key={f.col + f.id} col={f.col} id={f.id}>
                  {f.kind}
                </RecordLink>,
                f.party || "—",
                f.dir === "in" ? fmtNum(f.pkr) : "",
                f.dir === "out" ? fmtNum(f.pkr) : "",
              ])}
          />
        </ChartCard>
      </div>
      <p className="mt-3 text-xs text-faint">
        Money movements are taken from {MODULES.payments.title}, {MODULES.expenses.title}, {MODULES.investors.title}, taxes/legal amounts in {MODULES.companyDocs.title}, and the account entries on this page.
      </p>
    </div>
  );
}
