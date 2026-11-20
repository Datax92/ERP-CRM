"use client";

import Link from "next/link";
import { useStore } from "@/components/DataProvider";
import { BarsChart, ChartCard, SimpleTable } from "@/components/charts";
import { PipelineRoute } from "@/components/TradeRoute";
import { RecordLink } from "@/components/RecordDrawer";
import { AppIcon } from "@/components/AppIcons";
import { Badge } from "@/components/ui";
import { daysFromToday, fmtCompact, fmtDate, fmtMoney, lateness, num, rateOf, today } from "@/lib/calc";
import { clientInfo, piInfo, poInfo, shipmentInfo, soInfo } from "@/lib/derive";
import { plLines, sumPL, outstandingReceivables } from "@/lib/finance";
import { companyDocStatus, labelOf, MODULES } from "@/lib/modules";
import { monthly as monthlyCounts, monthlyMeasures } from "@/lib/report";
import { STANDARD_REPORTS } from "@/lib/standardReports";
import { FEATURES } from "@/lib/features";
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

  const currentMonthStr = t.slice(0, 7);
  const currentYearStr = t.slice(0, 4);
  const allSched = s.schedule ?? [];
  const todayTasks = allSched.filter((tItem) => !tItem.isDailyLog && (!tItem.horizon || tItem.horizon === "Daily") && tItem.date === t);
  const pendingTodayTasks = todayTasks.filter((tItem) => tItem.status !== "Completed");
  const activeLongTermTasks = allSched.filter((tItem) => !tItem.isDailyLog && (tItem.horizon === "Monthly" || tItem.horizon === "Yearly / Long-term" || tItem.isMilestone) && tItem.status !== "Completed");

  const monthly = monthlyMeasures(
    s.salesOrders.filter((o) => o.status !== "Cancelled"),
    [
      { key: "sales", value: (o) => num(o.amountPKR) },
      { key: "margin", value: (o) => num(o.marginPKR) },
    ],
  ).slice(-12);

  const salesYear = soYear.reduce((a, o) => a + num(o.amountPKR), 0);
  const marginYear = soYear.reduce((a, o) => a + num(o.marginPKR), 0);
  const receivable = outstandingReceivables(s);
  const profit = sumPL(plLines(s, "orders").filter((line) => line.date.startsWith(year)));

  // Customer analysis, payments, shipments and messages.
  const customers = STANDARD_REPORTS.find((r) => r.key === "customerAnalysis")!.run(s, {}).rows.slice(0, 8);
  const liveSos = s.salesOrders.filter((o) => o.status !== "Cancelled");
  const soTotal = liveSos.reduce((a, o) => a + num(o.amountPKR), 0);
  const soPaid = liveSos.reduce((a, o) => a + soInfo(o, s).received * rateOf(o), 0);
  const partly = liveSos.filter((o) => soInfo(o, s).payment === "Partially paid").length;
  const shipments = s.shipments.filter((x) => x.status !== "Cancelled" && !shipmentInfo(x, s).delivered);
  const unread = s.inbox.messages.filter((m) => m.toUid === s.user.uid && !m.readAt && !m.archivedByTo);
  const docsFlow = monthlyCounts(
    [...s.rfqs.map((r) => ({ ...r, kind: "RFQs" })), ...s.quotations.map((r) => ({ ...r, kind: "Quotations" })), ...liveSos.map((r) => ({ ...r, kind: "Sales orders" }))],
    { split: (r) => r.kind, series: ["RFQs", "Quotations", "Sales orders"] },
  ).slice(-12);

  return (
    <div>
      <div className="dhero mt-4">
        <div className="dhero-t"><span className="kicker">{greeting()}</span><h1>Dashboard</h1><p>{year} overview · {fmtDate(t)}</p></div>
        <span className="spacer" />
        <div className="dhero-acts"><Link className="btn dhero-print" href="/profit-loss">Profit & loss</Link><Link className="btn dhero-print" href="/schedule">Tasks & planner</Link></div>
      </div>
      <div className="dtop">
        <Link href="/profit-loss" className={`dbig ${profit.net < 0 ? 'loss' : ''}`}>
          <span className="k">Net profit</span><b className="v">{fmtMoney(profit.net, 'PKR')}</b><span className="f">Orders basis · {year}</span>
          <span className="dbig-rows"><span>Revenue <b>{fmtMoney(profit.revenue, 'PKR')}</b></span><span>Gross profit <b>{fmtMoney(profit.gross, 'PKR')}</b></span></span>
        </Link>
        <div className="dfigs">
          {[
            { label: 'Sales booked', value: fmtCompact(salesYear), sub: `${soYear.length} orders · PKR`, icon: 'sales', href: '/sales-orders' },
            { label: 'Order margin', value: fmtCompact(marginYear), sub: 'PKR', icon: 'pnl', href: '/profit-loss' },
            { label: 'Receivables', value: fmtCompact(receivable), sub: 'PKR to collect', icon: 'receivables', href: '/payments' },
            { label: 'Payables', value: fmtCompact(payable), sub: 'PKR to suppliers', icon: 'finance', href: '/purchase-orders' },
            { label: 'Open RFQs', value: String(openRfqs.length), sub: 'Client inquiries', icon: 'projects', href: '/rfqs' },
            { label: 'Inactive clients', value: String(inactive), sub: 'Follow up with clients', icon: 'agents', href: '/clients' },
            { label: 'Open quotations', value: String(openQuotes.length), sub: 'Offers awaiting reply', icon: 'proforma', href: '/quotations' },
            { label: 'Shipments on the way', value: String(shipments.length), sub: `${shipments.filter((x) => shipmentInfo(x, s).missing.length).length} missing documents`, icon: 'shipment', href: '/shipments' },
          ].map((metric) => <Link key={metric.label} href={metric.href} className="dfig"><span className="dfig-ic"><AppIcon name={metric.icon} size={32} /></span><span className="dfig-t"><span className="k">{metric.label}</span><b className="v">{metric.value}</b><span className="f">{metric.sub}</span></span></Link>)}
        </div>
      </div>

      {/* Signature: every open deal, stop by stop along the trade route. */}
      <section className="card mb-6 px-6 py-6 sm:px-8">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-[22px] text-ink">On the route now</h2>
          <span className="text-xs text-muted">Open business at each stop of the deal · tap a stop to see it</span>
        </div>
        <PipelineRoute s={s} />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Sales and margin" subtitle="Last 12 months, PKR" className="lg:col-span-2">
          <BarsChart
            data={monthly}
            money
            series={[
              { key: "sales", label: "Sales" },
              { key: "margin", label: "Margin" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Conversion" subtitle="All-time documents at each step">
          <ol className="space-y-4">
            {funnel.map((f, i) => {
              const top = funnel[0].n || 1;
              const prev = i ? funnel[i - 1].n : 0;
              return (
                <li key={f.label}>
                  <Link href={f.href} className="group block">
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-[13px] text-ink group-hover:text-accent">{f.label}</span>
                      <span className="num text-[13px] text-muted">
                        <span className="font-medium text-ink">{f.n}</span>
                        {i > 0 && prev ? <span className="ml-1.5 text-faint">{Math.round((f.n / prev) * 100)}%</span> : null}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2">
                      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${f.n ? Math.max(2, (f.n / top) * 100) : 0}%` }} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </ChartCard>

        <ChartCard
          title="Schedule & Tasks Planner"
          subtitle={`${pendingTodayTasks.length} daily pending · ${activeLongTermTasks.length} monthly/yearly active`}
          className="lg:col-span-1"
        >
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-ink">Action Items & Agenda</span>
            <Link href="/schedule" className="font-medium text-accent hover:underline">
              Open Planner →
            </Link>
          </div>
          {todayTasks.length === 0 ? (
            <p className="text-sm text-muted">
              No tasks scheduled for today.{" "}
              <Link href="/schedule" className="text-accent underline font-medium">
                Plan your day
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-line text-xs">
              {todayTasks.slice(0, 6).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`size-2 rounded-full shrink-0 ${
                        task.status === "Completed"
                          ? "bg-good"
                          : task.priority === "Urgent"
                            ? "bg-bad"
                            : task.priority === "High"
                              ? "bg-warn"
                              : "bg-accent"
                      }`}
                    />
                    <Link
                      href={`/schedule?id=${task.id}`}
                      className={`truncate font-medium text-ink hover:text-accent ${
                        task.status === "Completed" ? "line-through text-muted" : ""
                      }`}
                    >
                      {task.time ? `${task.time} ` : ""}{task.title}
                    </Link>
                  </div>
                  <Badge tone={task.status === "Completed" ? "good" : task.priority === "Urgent" ? "bad" : "muted"}>
                    {task.status === "Completed" ? "Done" : task.priority || "Pending"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard title="Follow-ups due" subtitle="Next follow-up date is today or earlier" className="lg:col-span-1">
          <TodoList items={followUps.map(({ col, r }) => ({ col, r, note: `due ${fmtDate(r.nextFollowUpDate)}` }))} empty="No follow-ups due." />
        </ChartCard>
        <ChartCard title="Needs attention" subtitle="Late orders, RFQ deadlines, overdue payments, expiring documents" className="lg:col-span-2">
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

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Customer analysis" subtitle="RFQs, quotations, sales orders and business total per customer" className="lg:col-span-2">
          <SimpleTable
            head={["Customer", "RFQs", "Quotations", "Sales orders", "Business PKR", "Outstanding PKR"]}
            empty="No customer business yet."
            rows={customers.map((r) => [
              <RecordLink key={r.link!.id} col="clients" id={r.link!.id}>{String(r.cells[0])}</RecordLink>,
              String(r.cells[3]),
              String(r.cells[4]),
              String(r.cells[6]),
              fmtCompact(r.cells[8]),
              fmtCompact(r.cells[10]),
            ])}
          />
          <p className="mt-3 text-xs"><Link className="text-accent hover:underline" href="/reports?r=customerAnalysis">Full customer analysis report →</Link></p>
        </ChartCard>
        <ChartCard title="Payments" subtitle="All live sales orders, PKR">
          <dl className="dpay">
            <div><dt>Total payment</dt><dd>{fmtMoney(soTotal, "PKR")}</dd></div>
            <div><dt>Received</dt><dd className="text-good">{fmtMoney(soPaid, "PKR")}</dd></div>
            <div><dt>Remaining</dt><dd className="text-bad">{fmtMoney(Math.max(0, soTotal - soPaid), "PKR")}</dd></div>
            <div><dt>Partially paid orders</dt><dd>{partly}</dd></div>
            <div><dt>Payable to suppliers</dt><dd>{fmtMoney(payable, "PKR")}</dd></div>
          </dl>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" title={`${soTotal ? Math.round((soPaid / soTotal) * 100) : 0}% received`}>
            <div className="h-2 rounded-full bg-good" style={{ width: `${soTotal ? Math.min(100, (soPaid / soTotal) * 100) : 0}%` }} />
          </div>
          <p className="mt-3 text-xs"><Link className="text-accent hover:underline" href="/payments?tab=reports">Payment balances →</Link></p>
        </ChartCard>
        <ChartCard title="RFQs, quotations and orders" subtitle="Documents per month, last 12 months" className="lg:col-span-2">
          <BarsChart data={docsFlow} series={[{ key: "RFQs", label: "RFQs" }, { key: "Quotations", label: "Quotations" }, { key: "Sales orders", label: "Sales orders" }]} />
        </ChartCard>
        <ChartCard title={FEATURES.messaging ? "Shipments & messages" : "Shipments on the way"} subtitle={FEATURES.messaging ? `${shipments.length} shipments on the way · ${unread.length} unread messages` : `${shipments.length} shipments not yet delivered`}>
          {shipments.length === 0 ? <p className="text-sm text-muted">No shipment on the way.</p> : (
            <ul className="divide-y divide-line text-sm">
              {shipments.slice(0, 5).map((x) => { const i = shipmentInfo(x, s); return (
                <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                  <RecordLink col="shipments" id={x.id}>{labelOf("shipments", x, s)}</RecordLink>
                  <Badge tone={i.late?.overdue ? "bad" : "info"}>{i.late?.overdue ? `${i.late.days}d late` : x.status}</Badge>
                </li>
              ); })}
            </ul>
          )}
          {FEATURES.messaging && <div className="mt-3 border-t border-line pt-3">
            {unread.length === 0 ? <p className="text-sm text-muted">No unread messages.</p> : unread.slice(0, 4).map((m) => (
              <Link key={m.id} href={`/messages?m=${m.id}`} className="block truncate py-1 text-sm hover:text-accent"><b>{m.fromName || m.fromEmail}</b> · {m.subject || "(no subject)"}</Link>
            ))}
            <Link href="/messages" className="mt-1 inline-block text-xs text-accent hover:underline">Open messages →</Link>
          </div>}
        </ChartCard>
      </div>
    </div>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function TodoList({ items, empty }: { items: { col: CollectionName; r: Rec; note: string; tone?: "bad" | "warn" }[]; empty: string }) {
  const s = useStore();
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {items.slice(0, 12).map(({ col, r, note, tone }) => (
        <li key={col + r.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="min-w-0 truncate">
            <span className="eyebrow mr-2 hidden sm:inline">{MODULES[col].singular}</span>
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
