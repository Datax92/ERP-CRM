"use client";

import Link from "next/link";
import { useStore } from "@/components/DataProvider";
import { BarsChart, ChartCard } from "@/components/charts";
import { PipelineRoute } from "@/components/TradeRoute";
import { RecordLink } from "@/components/RecordDrawer";
import { Badge } from "@/components/ui";
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

  return (
    <div>
      <h1 className="sr-only">Dashboard</h1>
      {/* Hero: the one number the owner opens the ledger for, set on the house colours. */}
      <section className="relative mb-6 overflow-hidden rounded-2xl border border-sidebar-line bg-sidebar px-6 py-7 text-sidebar-ink shadow-[var(--shadow-lg)] sm:px-9 sm:py-9">
        <svg aria-hidden viewBox="0 0 800 220" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22]">
          <path d="M-20 180 C 160 60, 300 200, 460 110 S 700 30, 840 70" fill="none" stroke="var(--brass)" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
          <circle cx="460" cy="110" r="4" fill="var(--brass)" />
          <circle cx="700" cy="52" r="4" fill="var(--brass)" />
        </svg>
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div>
            <div className="eyebrow !text-sidebar-muted">{greeting()} · {fmtDate(t)}</div>
            <div className="mt-4 text-[13px] text-sidebar-muted">Sales booked in {year}</div>
            <div className="display num mt-1 text-[52px] leading-none text-white sm:text-[64px]">
              <span className="mr-2 align-top font-sans text-base font-medium tracking-wide text-brass">PKR</span>
              {fmtCompact(salesYear)}
            </div>
            <div className="mt-3 text-[13px] text-sidebar-muted">
              {soYear.length} orders · margin <span className="text-sidebar-ink">PKR {fmtCompact(marginYear)}</span>
              {salesYear ? <span> ({((marginYear / salesYear) * 100).toFixed(1)}%)</span> : null}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-6 sm:gap-10">
            {(
              [
                ["To collect", fmtCompact(receivable), "/payments", true],
                ["To pay vendors", fmtCompact(payable), "/purchase-orders", true],
                ["Quiet clients", String(inactive), "/clients", false],
              ] as const
            ).map(([k, v, href, money]) => (
              <Link key={k} href={href} className="group block">
                <dt className="eyebrow !text-sidebar-muted group-hover:!text-brass">{k}</dt>
                <dd className="display num mt-1.5 text-xl whitespace-nowrap text-white sm:text-2xl">
                  {money && <span className="mr-1 font-sans text-[10px] font-medium tracking-wide text-brass">PKR</span>}
                  {v}
                </dd>
              </Link>
            ))}
          </dl>
        </div>
      </section>

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
