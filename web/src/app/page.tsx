"use client";

import Link from "next/link";
import { useStore } from "@/components/DataProvider";
import { BarsChart, ChartCard, Kpis } from "@/components/charts";
import { RecordLink } from "@/components/RecordDrawer";
import { Badge, PageHeader } from "@/components/ui";
import { daysFromToday, fmtCompact, fmtDate, fmtMoney, lateness, num, rateOf, today } from "@/lib/calc";
import { clientInfo, piInfo, poInfo, soInfo } from "@/lib/derive";
import { outstandingReceivables } from "@/lib/finance";
import { companyDocStatus, labelOf, MODULES } from "@/lib/modules";
import { monthlyMeasures } from "@/lib/report";
import { stageKind } from "@/lib/stages";
import type { CollectionName, Rec } from "@/lib/types";

export default function Dashboard() {
  const s = useStore();
  const t = today();
  const year = t.slice(0, 4);
  const openRfqs = s.rfqs.filter((r) => stageKind("rfqs", r.status) === "open");
  const openQuotes = s.quotations.filter((r) => stageKind("quotations", r.status) === "open");
  const soYear = s.salesOrders.filter((o) => o.status !== "Cancelled" && o.date?.startsWith(year));
  const payable = s.purchaseOrders.filter((o) => o.status !== "Cancelled").reduce((a, o) => a + poInfo(o, s).outstanding * rateOf(o), 0);

  // Conversion funnel through the chain
  const funnel = [
    { label: "RFQs", n: s.rfqs.length, href: "/rfqs" },
    { label: "Quotations", n: s.quotations.length, href: "/quotations" },
    { label: "Sales orders", n: s.salesOrders.filter((o) => o.status !== "Cancelled").length, href: "/sales-orders" },
    { label: "Delivered", n: s.salesOrders.filter((o) => soInfo(o, s).delivered || o.status === "Delivered" || o.status === "Closed").length, href: "/deliveries" },
  ];

  const followUps: { col: CollectionName; r: Rec }[] = [
    ...openQuotes.map((r) => ({ col: "quotations" as const, r })),
    ...s.salesOrders.filter((r) => stageKind("salesOrders", r.status) === "open").map((r) => ({ col: "salesOrders" as const, r })),
    ...s.purchaseOrders.filter((r) => stageKind("purchaseOrders", r.status) === "open").map((r) => ({ col: "purchaseOrders" as const, r })),
    ...s.marketing.map((r) => ({ col: "marketing" as const, r })),
  ]
    .filter(({ r }) => r.nextFollowUpDate && r.nextFollowUpDate <= t)
    .sort((a, b) => a.r.nextFollowUpDate.localeCompare(b.r.nextFollowUpDate));

  const lateOrders = s.salesOrders
    .filter((o) => stageKind("salesOrders", o.status) === "open")
    .map((o) => ({ o, l: lateness(o.expectedDeliveryDate, soInfo(o, s).deliveredDate) }))
    .filter((x) => x.l?.overdue);
  const duesRfq = openRfqs.filter((r) => r.dueDate && r.dueDate <= daysFromToday(3));
  const docs = s.companyDocs.filter((d) => ["Expired", "Expiring soon"].includes(companyDocStatus(d)));
  const inactive = s.clients.filter((c) => !clientInfo(c, s).active).length;

  const monthly = monthlyMeasures(
    s.salesOrders.filter((o) => o.status !== "Cancelled"),
    [
      { key: "sales", value: (o) => num(o.amountPKR) },
      { key: "margin", value: (o) => num(o.marginPKR) },
    ],
  ).slice(-12);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Today is ${fmtDate(t)}`} />
      <Kpis
        items={[
          { label: "Open RFQs", value: String(openRfqs.length), sub: duesRfq.length ? `${duesRfq.length} due soon or overdue` : undefined, tone: duesRfq.length ? "warn" : undefined },
          { label: "Open quotations", value: String(openQuotes.length), sub: `PKR ${fmtCompact(openQuotes.reduce((a, q) => a + num(q.amountPKR), 0))}` },
          { label: `Sales ${year} (PKR)`, value: fmtCompact(soYear.reduce((a, o) => a + num(o.amountPKR), 0)), sub: `${soYear.length} orders` },
          { label: "Receivable (PKR)", value: fmtCompact(outstandingReceivables(s)), tone: "warn" },
          { label: "Payable to vendors (PKR)", value: fmtCompact(payable), tone: "warn" },
          { label: "Inactive clients", value: String(inactive), sub: `> ${s.settings.inactiveDays} days`, tone: inactive ? "warn" : undefined },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Workflow conversion" subtitle="All-time records at each step">
          <div className="space-y-2">
            {funnel.map((f, i) => {
              const top = funnel[0].n || 1;
              const prev = i ? funnel[i - 1].n : 0;
              return (
                <Link key={f.label} href={f.href} className="block hover:opacity-80">
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span>{f.label}</span>
                    <span className="text-muted">
                      {f.n}
                      {i > 0 && prev ? <span className="ml-1 text-faint">({Math.round((f.n / prev) * 100)}% of previous)</span> : null}
                    </span>
                  </div>
                  <div className="h-3 rounded-sm bg-surface-2">
                    <div className="h-3 rounded-sm" style={{ width: `${f.n ? Math.max(2, (f.n / top) * 100) : 0}%`, background: "var(--series-1)" }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </ChartCard>
        <ChartCard title="Sales and margin, last 12 months (PKR)">
          <BarsChart
            data={monthly}
            money
            series={[
              { key: "sales", label: "Sales" },
              { key: "margin", label: "Margin" },
            ]}
          />
        </ChartCard>

        <ChartCard title="Follow-ups due" subtitle="Next follow-up date is today or earlier">
          <TodoList items={followUps.map(({ col, r }) => ({ col, r, note: `due ${fmtDate(r.nextFollowUpDate)}` }))} empty="No follow-ups due." />
        </ChartCard>
        <ChartCard title="Needs attention">
          <TodoList
            empty="Nothing overdue."
            items={[
              ...lateOrders.map(({ o, l }) => ({ col: "salesOrders" as const, r: o, note: `${l!.days} days late`, tone: "bad" as const })),
              ...duesRfq.map((r) => ({ col: "rfqs" as const, r, note: `RFQ due ${fmtDate(r.dueDate)}`, tone: "warn" as const })),
              ...docs.map((d) => ({ col: "companyDocs" as const, r: d, note: companyDocStatus(d), tone: "warn" as const })),
              ...s.proformaInvoices
                .filter((p) => p.dueDate && p.dueDate < t && p.status !== "Cancelled" && p.type !== "From Supplier")
                .filter((p) => piInfo(p, s).pending > 0)
                .map((p) => ({ col: "proformaInvoices" as const, r: p, note: `payment overdue · ${fmtMoney(p.amount, p.currency)}`, tone: "bad" as const })),
            ]}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function TodoList({ items, empty }: { items: { col: CollectionName; r: Rec; note: string; tone?: "bad" | "warn" }[]; empty: string }) {
  const s = useStore();
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {items.slice(0, 12).map(({ col, r, note, tone }) => (
        <li key={col + r.id} className="flex items-center justify-between gap-2 py-1.5">
          <span className="min-w-0 truncate">
            <span className="mr-2 text-xs text-faint">{MODULES[col].singular}</span>
            <RecordLink col={col} id={r.id}>
              {labelOf(col, r, s) || r.prospectName || r.subject || "Open"}
            </RecordLink>
          </span>
          <Badge tone={tone ?? "warn"}>{note}</Badge>
        </li>
      ))}
    </ul>
  );
}
