"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/components/DataProvider";
import { BarsChart, ChartCard, Kpis, RankBars, SimpleTable } from "@/components/charts";
import { YearCompare } from "@/components/FinanceDashboard";
import { RecordLink } from "@/components/RecordDrawer";
import { PageHeader } from "@/components/ui";
import { fmtCompact, fmtDate, fmtNum, fmtPct, num } from "@/lib/calc";
import { plLines, sumPL, type PLBasis } from "@/lib/finance";
import { soInfo } from "@/lib/derive";
import { groupSum, monthlyMeasures } from "@/lib/report";

export default function ProfitLossPage() {
  const s = useStore();
  const years = useMemo(() => {
    const ys = new Set<string>([String(new Date().getFullYear())]);
    plLines(s, "cash").forEach((l) => ys.add(l.date.slice(0, 4)));
    plLines(s, "orders").forEach((l) => ys.add(l.date.slice(0, 4)));
    return [...ys].sort().reverse();
  }, [s]);
  const [year, setYear] = useState(years[0]);
  const [basis, setBasis] = useState<PLBasis>("orders");

  const lines = plLines(s, basis).filter((l) => year === "all" || l.date.startsWith(year));
  const t = sumPL(lines);
  const monthly = monthlyMeasures(
    lines.map((l, i) => ({ id: String(i), ...l })),
    [
      { key: "revenue", value: (r) => r.revenue },
      { key: "cost", value: (r) => r.cost + r.opex },
      { key: "net", value: (r) => r.revenue + r.otherIncome - r.cost - r.opex },
    ],
  );

  const orders = s.salesOrders
    .filter((o) => o.status !== "Cancelled" && (year === "all" || o.date?.startsWith(year)))
    .map((o) => ({ o, i: soInfo(o, s) }))
    .sort((a, b) => b.i.profitPKR - a.i.profitPKR);

  const statement: [string, number, boolean?][] = [
    [basis === "orders" ? "Sales (orders booked)" : "Sales (payments received)", t.revenue],
    [basis === "orders" ? "Cost of goods (purchase orders)" : "Paid to vendors", -t.cost],
    ["Gross profit", t.gross, true],
    ["Operating expenses, taxes & legal", -t.opex],
    ["Other income", t.otherIncome],
    ["Net profit", t.net, true],
    ["Charity", -t.charity],
    ["Zakat", -t.zakat],
    ["Net after charity & zakat", t.afterGiving, true],
  ];

  return (
    <div>
      <PageHeader
        title="Profit / Loss"
        subtitle="Calculated from sales orders, purchase orders, payments, expenses and company costs."
        actions={
          <>
            <select className="field w-auto" value={basis} onChange={(e) => setBasis(e.target.value as PLBasis)} aria-label="Basis">
              <option value="orders">Orders basis</option>
              <option value="cash">Cash basis</option>
            </select>
            <select className="field w-auto" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
              <option value="all">All years</option>
            </select>
          </>
        }
      />
      <Kpis
        items={[
          { label: "Sales (PKR)", value: fmtCompact(t.revenue) },
          { label: "Gross profit", value: fmtCompact(t.gross), sub: fmtPct(t.grossPct) },
          { label: "Expenses", value: fmtCompact(t.opex) },
          { label: "Net profit", value: fmtCompact(t.net), tone: t.net < 0 ? "bad" : "good" },
          { label: "Charity + Zakat", value: fmtCompact(t.charity + t.zakat) },
          { label: "Net after giving", value: fmtCompact(t.afterGiving), tone: t.afterGiving < 0 ? "bad" : undefined },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Statement (PKR)">
          <table className="w-full text-sm">
            <tbody>
              {statement.map(([label, v, strong]) => (
                <tr key={label} className={`border-b border-line last:border-0 ${strong ? "font-semibold" : ""}`}>
                  <td className="py-1.5">{label}</td>
                  <td className={`py-1.5 text-right ${v < 0 ? "text-muted" : ""} ${strong && v < 0 ? "text-bad" : ""}`}>{fmtNum(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
        <ChartCard title="Sales, costs and net profit by month (PKR)" subtitle="Costs include purchases and expenses">
          <BarsChart
            data={monthly}
            money
            series={[
              { key: "revenue", label: "Sales" },
              { key: "cost", label: "Costs" },
              { key: "net", label: "Net profit" },
            ]}
          />
        </ChartCard>
        <YearCompare s={s} />
        <ChartCard title="Gross profit by client (PKR)" subtitle="Orders basis">
          <RankBars rows={groupSum(orders.map(({ o, i }) => ({ id: o.id, client: s.byId.clients.get(o.clientId)?.name, p: i.profitPKR })), (r) => r.client, (r) => r.p)} money />
        </ChartCard>
      </div>
      <div className="mt-4">
        <ChartCard title="Profit per sales order" subtitle="Revenue minus purchase-order cost (quoted cost where no PO exists yet)">
          <SimpleTable
            head={["SO", "Client", "Date", "Revenue PKR", "Cost PKR", "Profit PKR", "Margin %"]}
            empty="No sales orders in this period."
            rows={orders.slice(0, 50).map(({ o, i }) => [
              <RecordLink key={o.id} col="salesOrders" id={o.id}>
                {o.serial}
              </RecordLink>,
              s.byId.clients.get(o.clientId)?.name ?? "—",
              fmtDate(o.date),
              fmtNum(o.amountPKR),
              `${fmtNum(i.costPKR)}${i.costIsActual ? "" : " (est.)"}`,
              <span key="p" className={i.profitPKR < 0 ? "text-bad" : ""}>
                {fmtNum(i.profitPKR)}
              </span>,
              num(o.amountPKR) ? fmtPct((i.profitPKR / num(o.amountPKR)) * 100) : "—",
            ])}
          />
        </ChartCard>
      </div>
    </div>
  );
}
