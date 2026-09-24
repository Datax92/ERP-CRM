"use client";

import type { ReactNode } from "react";
import { BarsChart, ChartCard, Kpis, RankBars, SimpleTable, type Kpi } from "./charts";
import { Badge } from "./ui";
import { RecordLink } from "./RecordDrawer";
import { fmtCompact, fmtDate, fmtMoney, fmtNum, fmtPct, lateness, num, rateOf, daysFromToday } from "@/lib/calc";
import { clientInfo, deliveryInfo, piInfo, poInfo, soInfo, supplierInfo, supplierPrices, type Store } from "@/lib/derive";
import { companyDocStatus, statusTone } from "@/lib/modules";
import { groupSum, monthly, monthlyMeasures, productWise, topN } from "@/lib/report";
import { stageKind } from "@/lib/stages";
import type { CollectionName, Rec } from "@/lib/types";

const Grid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>;
const pkr = (r: Rec) => num(r.amountPKR);
const clientName = (s: Store, id?: string) => (id && s.byId.clients.get(id)?.name) || "Unknown client";
const supplierName = (s: Store, id?: string) => (id && s.byId.suppliers.get(id)?.name) || "Unknown supplier";
const pct = (a: number, b: number) => (b ? fmtPct((a / b) * 100) : "—");

const OUTCOME = [
  { key: "Open", label: "Open" },
  { key: "Success", label: "Closed – success" },
  { key: "Unsuccessful", label: "Closed – unsuccessful" },
];
const outcomeOf = (col: CollectionName, status: string) => {
  const k = stageKind(col, status);
  return k === "won" ? "Success" : k === "lost" ? "Unsuccessful" : "Open";
};

function CurrencyTotals({ rows }: { rows: Rec[] }) {
  const m = new Map<string, { n: number; foreign: number; pkr: number }>();
  rows.forEach((r) => {
    const c = r.currency || "PKR";
    const x = m.get(c) ?? { n: 0, foreign: 0, pkr: 0 };
    x.n++;
    x.foreign += num(r.amount);
    x.pkr += pkr(r);
    m.set(c, x);
  });
  return (
    <SimpleTable
      head={["Currency", "Count", "Total (foreign)", "Total PKR"]}
      rows={[...m.entries()].map(([c, x]) => [c, fmtNum(x.n), fmtMoney(x.foreign, c), fmtMoney(x.pkr)])}
      empty="No documents."
    />
  );
}

function ProductTable({ rows, showValue }: { rows: Rec[]; showValue: "sale" | "cost" | "none" }) {
  const p = productWise(rows).slice(0, 25);
  const head = ["Product", "Lines", "Qty"];
  if (showValue === "sale") head.push("Value PKR", "Margin PKR", "Margin %");
  if (showValue === "cost") head.push("Cost PKR");
  return (
    <SimpleTable
      head={head}
      empty="No line items."
      rows={p.map((r) => {
        const base: ReactNode[] = [r.product, fmtNum(r.lines), fmtNum(r.qty, 2)];
        if (showValue === "sale") base.push(fmtNum(r.value), fmtNum(r.value - r.cost), pct(r.value - r.cost, r.value));
        if (showValue === "cost") base.push(fmtNum(r.cost));
        return base;
      })}
    />
  );
}

function LateTable({ col, rows, expected, actual, party }: { col: CollectionName; rows: Rec[]; expected: (r: Rec) => string | undefined; actual: (r: Rec) => string | undefined; party: (r: Rec) => string }) {
  const late = rows
    .filter((r) => stageKind(col, r.status) !== "lost")
    .map((r) => ({ r, l: lateness(expected(r), actual(r)) }))
    .filter((x) => x.l && x.l.days > 0)
    .sort((a, b) => b.l!.days - a.l!.days);
  return (
    <SimpleTable
      head={["Document", "Party", "Expected", "Actual", "Late days"]}
      empty="No late deliveries."
      rows={late.slice(0, 20).map(({ r, l }) => [
        <RecordLink key={r.id} col={col} id={r.id}>
          {r.serial}
        </RecordLink>,
        party(r),
        fmtDate(expected(r)),
        actual(r) ? fmtDate(actual(r)) : <Badge tone="bad">Not yet</Badge>,
        `${l!.days}${l!.overdue ? " (overdue)" : ""}`,
      ])}
    />
  );
}

/** Shared report for the document chain modules (RFQ → Delivery), per the Excel's reporting rows. */
export function pipelineReport(col: CollectionName) {
  return function PipelineReport(rows: Rec[], s: Store) {
    const valued = col !== "rfqs";
    // Margin exists wherever a selling price is known: on the document itself, or via the linked sales order.
    const sale = col === "quotations" || col === "salesOrders" || col === "purchaseOrders" || col === "deliveries" || (col === "proformaInvoices" && rows.every((r) => r.type !== "From Supplier"));
    const valueOf = (r: Rec) => (col === "deliveries" ? deliveryInfo(r, s).valuePKR : pkr(r));
    const marginOf = (r: Rec) => (col === "deliveries" ? deliveryInfo(r, s).marginPKR : col === "purchaseOrders" ? poInfo(r, s).marginPKR : num(r.marginPKR));
    const saleValueOf = (r: Rec) => (col === "purchaseOrders" ? poInfo(r, s).salePKR : valueOf(r));
    const status = (r: Rec) => (col === "proformaInvoices" ? piInfo(r, s).status : r.status);
    const outcome = (r: Rec) => (col === "proformaInvoices" ? (piInfo(r, s).status === "Paid" ? "Success" : r.status === "Cancelled" ? "Unsuccessful" : "Open") : outcomeOf(col, r.status));
    const total = rows.length;
    const open = rows.filter((r) => outcome(r) === "Open").length;
    const won = rows.filter((r) => outcome(r) === "Success").length;
    const lost = rows.filter((r) => outcome(r) === "Unsuccessful").length;
    const live = rows.filter((r) => outcome(r) !== "Unsuccessful");
    const value = live.reduce((t, r) => t + valueOf(r), 0);
    const margin = live.reduce((t, r) => t + marginOf(r), 0);
    const saleValue = live.reduce((t, r) => t + saleValueOf(r), 0);

    const kpis: Kpi[] = [
      { label: `Total ${col === "rfqs" ? "RFQs" : "documents"}`, value: fmtNum(total) },
      { label: "Open", value: fmtNum(open) },
      { label: col === "rfqs" ? "Converted to proposal" : "Closed – success", value: fmtNum(won), sub: pct(won, total), tone: "good" },
      { label: "Closed – unsuccessful", value: fmtNum(lost), sub: pct(lost, total), tone: lost ? "bad" : undefined },
    ];
    if (valued) kpis.push({ label: col === "purchaseOrders" ? "Total cost (PKR)" : "Total price (PKR)", value: fmtCompact(value), sub: col === "deliveries" ? "from linked sales orders" : "excl. unsuccessful" });
    if (sale) kpis.push({ label: "Margin", value: fmtCompact(margin), sub: `${pct(margin, saleValue)} margin`, tone: margin < 0 ? "bad" : undefined });
    if (col === "quotations") kpis.push({ label: "Converted to SO", value: fmtNum(rows.filter((q) => s.salesOrders.some((o) => o.quotationId === q.id)).length) });
    if (col === "salesOrders") {
      const delivered = rows.filter((r) => soInfo(r, s).delivered).length;
      kpis.push({ label: "Delivered", value: fmtNum(delivered), sub: pct(delivered, total) });
      kpis.push({ label: "PO issued to supplier", value: fmtNum(rows.filter((r) => soInfo(r, s).poIssued).length) });
    }
    if (col === "purchaseOrders") {
      const paid = rows.reduce((t, r) => t + poInfo(r, s).paid * rateOf(r), 0);
      const periods = rows.map((r) => num(r.deliveryPeriodDays)).filter(Boolean);
      kpis.push({ label: "Payment to vendors", value: fmtCompact(paid), sub: `${fmtCompact(Math.max(0, value - paid))} outstanding` });
      kpis.push({ label: "Delivered", value: fmtNum(rows.filter((r) => poInfo(r, s).delivered).length) });
      kpis.push({ label: "Confirmed by supplier", value: fmtNum(rows.filter((r) => r.orderConfirmed).length) });
      kpis.push({ label: "Avg delivery period", value: periods.length ? `${Math.round(periods.reduce((a, b) => a + b, 0) / periods.length)} days` : "—" });
    }
    if (col === "proformaInvoices") {
      const toClient = rows.filter((r) => r.type !== "From Supplier" && r.status !== "Cancelled");
      const fromSup = rows.filter((r) => r.type === "From Supplier" && r.status !== "Cancelled");
      const sumPaid = (xs: Rec[]) => xs.reduce((t, r) => t + piInfo(r, s).paid * rateOf(r), 0);
      const pending = toClient.reduce((t, r) => t + piInfo(r, s).pending * rateOf(r), 0);
      kpis.push({ label: "Payment receipt (PKR)", value: fmtCompact(sumPaid(toClient)), tone: "good" });
      kpis.push({ label: "Pending from clients", value: fmtCompact(pending), tone: pending ? "warn" : undefined });
      kpis.push({ label: "PI issued by suppliers", value: fmtNum(fromSup.length), sub: `PKR ${fmtCompact(sumPaid(fromSup))} paid to vendors` });
      kpis.push({ label: "Order confirmation", value: fmtNum(rows.filter((r) => r.orderConfirmed).length), sub: `of ${fmtNum(total)}` });
      kpis.push({ label: "Delivered", value: fmtNum(rows.filter((r) => piInfo(r, s).delivered).length) });
    }
    if (col === "deliveries") {
      const done = rows.filter((r) => r.status === "Delivered");
      const onTime = done.filter((r) => !deliveryInfo(r, s).late?.days).length;
      const periods = done.map((r) => deliveryInfo(r, s).periodDays).filter((d): d is number => d != null);
      kpis.push({ label: "On-time rate", value: pct(onTime, done.length) });
      kpis.push({ label: "Avg delivery period", value: periods.length ? `${Math.round(periods.reduce((a, b) => a + b, 0) / periods.length)} days` : "—" });
      kpis.push({ label: "Order confirmation", value: fmtNum(rows.filter((r) => r.orderConfirmed).length), sub: `of ${fmtNum(total)}` });
      kpis.push({ label: "Payment receipt (PKR)", value: fmtCompact(rows.reduce((t, r) => t + deliveryInfo(r, s).receivedPKR, 0)), tone: "good" });
      kpis.push({ label: "Payment to vendor (PKR)", value: fmtCompact(rows.reduce((t, r) => t + deliveryInfo(r, s).vendorPaidPKR, 0)) });
    }

    const partyOf = (r: Rec) => (col === "purchaseOrders" || r.type === "From Supplier" ? supplierName(s, r.supplierId) : clientName(s, r.clientId));
    const monthlyCount = monthly(rows, { split: outcome, series: OUTCOME.map((o) => o.key) });
    const monthlyValue = monthlyMeasures(live, [
      { key: "value", value: valueOf },
      ...(sale ? [{ key: "margin", value: marginOf }] : []),
    ]);
    const methodsOf = (r: Rec) => (col === "proformaInvoices" ? piInfo(r, s).methods : col === "deliveries" ? deliveryInfo(r, s).methods : []);

    return (
      <div>
        <Kpis items={kpis} />
        <Grid>
          <ChartCard title="Comparison by date" subtitle="Documents per month, by outcome">
            <BarsChart data={monthlyCount} series={OUTCOME} stacked />
          </ChartCard>
          {valued ? (
            <ChartCard title="Value by month (PKR)" subtitle={sale ? "Total value and margin" : "Total value"}>
              <BarsChart data={monthlyValue} series={sale ? [{ key: "value", label: col === "purchaseOrders" ? "Total cost" : "Total price" }, { key: "margin", label: "Margin" }] : [{ key: "value", label: "Value" }]} money />
            </ChartCard>
          ) : (
            <ChartCard title="By status">
              <RankBars rows={groupSum(rows, status)} />
            </ChartCard>
          )}
          <ChartCard title="Comparison by client" subtitle={valued ? "Top 10 by value (PKR)" : "Top 10 by count"}>
            <RankBars rows={groupSum(valued ? live : rows, partyOf, valued ? valueOf : undefined)} money={valued} />
          </ChartCard>
          {valued && (
            <ChartCard title="By status">
              <RankBars rows={groupSum(rows, status)} />
            </ChartCard>
          )}
          {(col === "rfqs" || col === "quotations" || col === "salesOrders") && (
            <>
              <ChartCard title="By region">
                <RankBars rows={groupSum(rows, (r) => r.region)} />
              </ChartCard>
              <ChartCard title="By sector">
                <RankBars rows={groupSum(rows, (r) => r.sector)} />
              </ChartCard>
            </>
          )}
          {col !== "rfqs" && col !== "deliveries" && (
            <ChartCard title="Follow-up status">
              <RankBars rows={groupSum(rows.filter((r) => outcome(r) === "Open"), (r) => r.followUpStatus)} />
            </ChartCard>
          )}
          {(col === "salesOrders" || col === "purchaseOrders" || col === "deliveries") && (
            <ChartCard title="Incoterms">
              <RankBars rows={groupSum(rows, (r) => r.incoterm)} />
            </ChartCard>
          )}
          {(col === "purchaseOrders" || col === "proformaInvoices" || col === "salesOrders") && (
            <ChartCard title="Payment terms" subtitle="Advance / credit / LC…">
              <RankBars rows={groupSum(rows, (r) => r.paymentTerms)} />
            </ChartCard>
          )}
          {(col === "proformaInvoices" || col === "deliveries") && (
            <ChartCard title="Payment method" subtitle="Payments recorded against these documents">
              <RankBars rows={groupSum(rows.flatMap((r) => methodsOf(r).map((m) => ({ id: r.id, m }))), (x) => x.m)} />
            </ChartCard>
          )}
          {valued && col !== "deliveries" && (
            <ChartCard title="Total in foreign currency / PKR">
              <CurrencyTotals rows={live} />
            </ChartCard>
          )}
        </Grid>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <ChartCard title="Product-wise" subtitle="From line items">
            <ProductTable rows={live} showValue={sale ? "sale" : valued ? "cost" : "none"} />
          </ChartCard>
          {col === "salesOrders" && (
            <ChartCard title="Late deliveries" subtitle="Promised delivery date vs. delivered date">
              <LateTable col={col} rows={rows} expected={(r) => r.expectedDeliveryDate} actual={(r) => soInfo(r, s).deliveredDate} party={partyOf} />
            </ChartCard>
          )}
          {col === "purchaseOrders" && (
            <ChartCard title="Delivery period & shipment dates">
              <SimpleTable
                head={["PO", "Supplier", "Confirmed", "Delivery period days", "Shipment (origin)", "Expected arrival", "Actual arrival"]}
                empty="No purchase orders."
                rows={rows
                  .filter((r) => r.status !== "Cancelled")
                  .slice(0, 30)
                  .map((r) => [
                    <RecordLink key={r.id} col="purchaseOrders" id={r.id}>
                      {r.serial}
                    </RecordLink>,
                    partyOf(r),
                    r.orderConfirmed ? "Yes" : "No",
                    r.deliveryPeriodDays ? fmtNum(r.deliveryPeriodDays) : "—",
                    fmtDate(r.shipmentOriginDate) || "—",
                    fmtDate(r.expectedArrivalDate) || "—",
                    fmtDate(r.actualArrivalDate) || "—",
                  ])}
              />
            </ChartCard>
          )}
          {col === "purchaseOrders" && (
            <ChartCard title="Late deliveries from suppliers" subtitle="Expected arrival vs. actual arrival">
              <LateTable col={col} rows={rows} expected={(r) => r.expectedArrivalDate} actual={(r) => r.actualArrivalDate} party={partyOf} />
            </ChartCard>
          )}
          {col === "deliveries" && (
            <ChartCard title="Late deliveries">
              <LateTable col={col} rows={rows} expected={(r) => r.expectedDeliveryDate} actual={(r) => (r.status === "Delivered" ? r.deliveredDate : undefined)} party={partyOf} />
            </ChartCard>
          )}
          {col === "salesOrders" && (
            <ChartCard title="Shipment dates">
              <SimpleTable
                head={["SO", "Client", "Incoterm", "Shipment (origin)", "Shipment (delivery)", "Delivered"]}
                empty="No orders."
                rows={rows
                  .filter((r) => r.status !== "Cancelled")
                  .slice(0, 30)
                  .map((r) => {
                    const i = soInfo(r, s);
                    return [
                      <RecordLink key={r.id} col="salesOrders" id={r.id}>
                        {r.serial}
                      </RecordLink>,
                      partyOf(r),
                      r.incoterm || "—",
                      fmtDate(i.shipmentOriginDate) || "—",
                      fmtDate(r.expectedDeliveryDate) || "—",
                      fmtDate(i.deliveredDate) || "—",
                    ];
                  })}
              />
            </ChartCard>
          )}
          {col === "proformaInvoices" && (
            <ChartCard title="Pending proformas" subtitle="Sent but not fully paid">
              <SimpleTable
                head={["PI", "Type", "Party", "Date", "Amount", "Paid", "Pending"]}
                empty="Nothing pending."
                rows={rows
                  .map((r) => ({ r, i: piInfo(r, s) }))
                  .filter(({ r, i }) => r.status !== "Cancelled" && i.pending > 0)
                  .map(({ r, i }) => [
                    <RecordLink key={r.id} col="proformaInvoices" id={r.id}>
                      {r.serial}
                    </RecordLink>,
                    r.type,
                    partyOf(r),
                    fmtDate(r.date),
                    fmtMoney(r.amount, r.currency),
                    fmtMoney(i.paid, r.currency),
                    fmtMoney(i.pending, r.currency),
                  ])}
              />
            </ChartCard>
          )}
          {col !== "rfqs" && (
            <ChartCard title="Recent feedback">
              <SimpleTable
                head={["Document", "Party", "Date", "Feedback"]}
                empty="No feedback recorded."
                rows={rows
                  .filter((r) => r.feedback)
                  .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                  .slice(0, 15)
                  .map((r) => [
                    <RecordLink key={r.id} col={col} id={r.id}>
                      {r.serial}
                    </RecordLink>,
                    partyOf(r),
                    fmtDate(r.date),
                    <span key="f" className="line-clamp-2">
                      {r.feedback}
                    </span>,
                  ])}
              />
            </ChartCard>
          )}
        </div>
      </div>
    );
  };
}

export function clientsReport(rows: Rec[], s: Store) {
  const info = new Map(rows.map((r) => [r.id, clientInfo(r, s)]));
  const inactive = rows.filter((r) => !info.get(r.id)!.active);
  return (
    <div>
      <Kpis
        items={[
          { label: "Clients", value: fmtNum(rows.length) },
          { label: "Registered", value: fmtNum(rows.filter((r) => r.registration === "Registered").length) },
          { label: "Unregistered", value: fmtNum(rows.filter((r) => r.registration !== "Registered").length) },
          { label: "Active", value: fmtNum(rows.length - inactive.length), sub: `within ${s.settings.inactiveDays} days`, tone: "good" },
          { label: "Inactive", value: fmtNum(inactive.length), tone: inactive.length ? "warn" : undefined },
          { label: "With open RFQs", value: fmtNum(rows.filter((r) => info.get(r.id)!.openRfqs > 0).length) },
        ]}
      />
      <Grid>
        <ChartCard title="Clients by region">
          <RankBars rows={groupSum(rows, (r) => r.region)} />
        </ChartCard>
        <ChartCard title="Clients by sector">
          <RankBars rows={groupSum(rows, (r) => r.sector)} />
        </ChartCard>
        <ChartCard title="Stage" subtitle="Where each client is in the workflow">
          <RankBars rows={groupSum(rows, (r) => info.get(r.id)!.lifecycle)} />
        </ChartCard>
        <ChartCard title="Payment stage">
          <RankBars rows={groupSum(rows, (r) => info.get(r.id)!.paymentStage)} />
        </ChartCard>
        <ChartCard title="RFQ stage">
          <RankBars rows={groupSum(rows, (r) => info.get(r.id)!.rfqStage)} />
        </ChartCard>
        <ChartCard title="Quotation stage">
          <RankBars rows={groupSum(rows, (r) => info.get(r.id)!.quotationStage)} />
        </ChartCard>
        <ChartCard title="PO stage" subtitle="Latest sales order status">
          <RankBars rows={groupSum(rows, (r) => info.get(r.id)!.poStage)} />
        </ChartCard>
        <ChartCard title="Top clients by order value">
          <RankBars rows={rows.map((r) => ({ label: r.name, value: info.get(r.id)!.soTotalPKR }))} money />
        </ChartCard>
      </Grid>
      <div className="mt-4">
        <ChartCard title="Inactive clients" subtitle={`No activity for more than ${s.settings.inactiveDays} days (change in Settings)`}>
          <SimpleTable
            head={["Client", "Region", "Last activity", "Inactive days"]}
            empty="Every client is active."
            rows={inactive
              .sort((a, b) => (info.get(b.id)!.inactiveDays ?? 0) - (info.get(a.id)!.inactiveDays ?? 0))
              .map((r) => [
                <RecordLink key={r.id} col="clients" id={r.id}>
                  {r.name}
                </RecordLink>,
                r.region || "—",
                fmtDate(info.get(r.id)!.lastActivity) || "—",
                fmtNum(info.get(r.id)!.inactiveDays ?? 0),
              ])}
          />
        </ChartCard>
      </div>
    </div>
  );
}

export function suppliersReport(rows: Rec[], s: Store) {
  const ids = new Set(rows.map((r) => r.id));
  const prices = supplierPrices(s).filter((p) => ids.has(p.supplierId));
  const byProduct = new Map<string, typeof prices>();
  prices.forEach((p) => byProduct.set(p.product, [...(byProduct.get(p.product) ?? []), p]));
  const best = [...byProduct.entries()]
    .map(([product, ps]) => {
      const sorted = [...ps].sort((a, b) => a.unitCostPKR - b.unitCostPKR);
      return { product, best: sorted[0], suppliers: new Set(ps.map((p) => p.supplierId)).size, quotes: ps.length };
    })
    .sort((a, b) => a.product.localeCompare(b.product));
  const info = new Map(rows.map((r) => [r.id, supplierInfo(r, s)]));
  return (
    <div>
      <Kpis
        items={[
          { label: "Suppliers", value: fmtNum(rows.length) },
          { label: "Purchased (PKR)", value: fmtCompact(rows.reduce((t, r) => t + info.get(r.id)!.purchasedPKR, 0)) },
          { label: "Paid to vendors", value: fmtCompact(rows.reduce((t, r) => t + info.get(r.id)!.paidPKR, 0)) },
          { label: "Payable", value: fmtCompact(rows.reduce((t, r) => t + info.get(r.id)!.payablePKR, 0)), tone: "warn" },
          { label: "Products priced", value: fmtNum(best.length) },
        ]}
      />
      <Grid>
        <ChartCard title="Suppliers by region">
          <RankBars rows={groupSum(rows, (r) => r.region)} />
        </ChartCard>
        <ChartCard title="Suppliers by country">
          <RankBars rows={groupSum(rows, (r) => r.country)} />
        </ChartCard>
        <ChartCard title="Suppliers per product">
          <RankBars rows={groupSum(rows, (r) => r.products)} />
        </ChartCard>
        <ChartCard title="Suppliers per brand">
          <RankBars rows={groupSum(rows, (r) => r.brands)} />
        </ChartCard>
        <ChartCard title="Purchases by supplier (PKR)">
          <RankBars rows={rows.map((r) => ({ label: r.name, value: info.get(r.id)!.purchasedPKR }))} money />
        </ChartCard>
        <ChartCard title="Payable by supplier (PKR)">
          <RankBars rows={rows.map((r) => ({ label: r.name, value: info.get(r.id)!.payablePKR }))} money color="var(--series-2)" />
        </ChartCard>
      </Grid>
      <div className="mt-4">
        <ChartCard title="Best price by product" subtitle="Lowest unit cost (PKR) from quotation costing and purchase orders">
          <SimpleTable
            head={["Product", "Best supplier", "Unit cost PKR", "Source", "Date", "Suppliers", "Price points"]}
            empty="No supplier prices yet — pick a supplier and unit cost on quotation lines or purchase orders."
            rows={best.map((b) => [b.product, supplierName(s, b.best.supplierId), fmtNum(b.best.unitCostPKR, 2), `${b.best.source} ${b.best.ref ?? ""}`, fmtDate(b.best.date), fmtNum(b.suppliers), fmtNum(b.quotes)])}
          />
        </ChartCard>
      </div>
    </div>
  );
}

export function marketingReport(rows: Rec[], s: Store) {
  const weights = new Map(groupSum(rows, (r) => r.channel).map((g) => [g.label, g.value]));
  const channels = topN([...weights.keys()], weights, 4);
  const split = (r: Rec) => (channels.includes(r.channel) ? r.channel : "Other");
  const clients = s.clients.map((c) => ({ c, i: clientInfo(c, s) }));
  const positive = rows.filter((r) => /interest|request|became/i.test(r.response ?? "")).length;
  return (
    <div>
      <Kpis
        items={[
          { label: "Approaches", value: fmtNum(rows.length) },
          { label: "Positive responses", value: fmtNum(positive), sub: pct(positive, rows.length), tone: "good" },
          { label: "No response", value: fmtNum(rows.filter((r) => r.response === "No response").length) },
          { label: "Active clients", value: fmtNum(clients.filter((x) => x.i.active).length), tone: "good" },
          { label: "Non-active clients", value: fmtNum(clients.filter((x) => !x.i.active).length), tone: "warn" },
        ]}
      />
      <Grid>
        <ChartCard title="Client approach by date" subtitle="Approaches per month, by channel">
          <BarsChart data={monthly(rows, { split, series: channels })} series={channels.map((c) => ({ key: c, label: c }))} stacked />
        </ChartCard>
        <ChartCard title="Client response">
          <RankBars rows={groupSum(rows, (r) => r.response)} />
        </ChartCard>
        <ChartCard title="Product-wise approach">
          <RankBars rows={groupSum(rows, (r) => r.product)} />
        </ChartCard>
        <ChartCard title="By channel">
          <RankBars rows={groupSum(rows, (r) => r.channel)} />
        </ChartCard>
      </Grid>
      <div className="mt-4">
        <ChartCard title="How long clients have been non-active" subtitle={`Inactive = no activity for more than ${s.settings.inactiveDays} days`}>
          <SimpleTable
            head={["Client", "Stage", "Last activity", "Inactive days"]}
            empty="Every client is active."
            rows={clients
              .filter((x) => !x.i.active)
              .sort((a, b) => (b.i.inactiveDays ?? 0) - (a.i.inactiveDays ?? 0))
              .map(({ c, i }) => [
                <RecordLink key={c.id} col="clients" id={c.id}>
                  {c.name}
                </RecordLink>,
                i.lifecycle,
                fmtDate(i.lastActivity) || "—",
                fmtNum(i.inactiveDays ?? 0),
              ])}
          />
        </ChartCard>
      </div>
    </div>
  );
}

export function paymentsReport(rows: Rec[], s: Store) {
  const inflow = rows.filter((r) => r.direction === "Received");
  const out = rows.filter((r) => r.direction === "Paid");
  const sum = (xs: Rec[]) => xs.reduce((t, r) => t + pkr(r), 0);
  const receivable = s.salesOrders.filter((o) => o.status !== "Cancelled").reduce((t, o) => t + soInfo(o, s).outstanding * rateOf(o), 0);
  const payable = s.purchaseOrders.filter((o) => o.status !== "Cancelled").reduce((t, o) => t + poInfo(o, s).outstanding * rateOf(o), 0);
  return (
    <div>
      <Kpis
        items={[
          { label: "Payment receipts (PKR)", value: fmtCompact(sum(inflow)), tone: "good" },
          { label: "Paid to vendors (PKR)", value: fmtCompact(sum(out)) },
          { label: "Net", value: fmtCompact(sum(inflow) - sum(out)), tone: sum(inflow) - sum(out) < 0 ? "bad" : undefined },
          { label: "Receivable now", value: fmtCompact(receivable), sub: "all open sales orders", tone: "warn" },
          { label: "Payable now", value: fmtCompact(payable), sub: "all open purchase orders", tone: "warn" },
        ]}
      />
      <Grid>
        <ChartCard title="Received vs paid by month (PKR)">
          <BarsChart
            data={monthly(rows, { split: (r) => r.direction, value: pkr, series: ["Received", "Paid"] })}
            series={[
              { key: "Received", label: "Received from clients" },
              { key: "Paid", label: "Paid to vendors" },
            ]}
            money
          />
        </ChartCard>
        <ChartCard title="By payment method (PKR)">
          <RankBars rows={groupSum(rows, (r) => r.method, pkr)} money />
        </ChartCard>
        <ChartCard title="By payment type (PKR)" subtitle="Advance / credit / LC…">
          <RankBars rows={groupSum(rows, (r) => r.paymentType, pkr)} money />
        </ChartCard>
        <ChartCard title="Receipts by client (PKR)">
          <RankBars rows={groupSum(inflow, (r) => clientName(s, r.clientId), pkr)} money />
        </ChartCard>
      </Grid>
    </div>
  );
}

export function companyReport(rows: Rec[]) {
  const withAmount = rows.filter((r) => num(r.amountValue));
  const years = [...new Set(withAmount.map((r) => (r.date ?? "").slice(0, 4)).filter(Boolean))].sort();
  const cats = ["Tax", "Legal"];
  const yearly = years.map((y) => {
    const row: Record<string, string | number> = { year: y };
    cats.forEach((c) => (row[c] = withAmount.filter((r) => r.date?.startsWith(y) && r.category === c).reduce((t, r) => t + pkr(r), 0)));
    row.Other = withAmount.filter((r) => r.date?.startsWith(y) && !cats.includes(r.category)).reduce((t, r) => t + pkr(r), 0);
    return row;
  });
  const expiring = rows.filter((r) => ["Expired", "Expiring soon"].includes(companyDocStatus(r)));
  return (
    <div>
      <Kpis
        items={[
          { label: "Records", value: fmtNum(rows.length) },
          { label: "Valid", value: fmtNum(rows.filter((r) => companyDocStatus(r) === "Valid").length), tone: "good" },
          { label: "Expiring soon", value: fmtNum(rows.filter((r) => companyDocStatus(r) === "Expiring soon").length), tone: "warn" },
          { label: "Expired", value: fmtNum(rows.filter((r) => companyDocStatus(r) === "Expired").length), tone: "bad" },
          { label: "Taxes (PKR)", value: fmtCompact(withAmount.filter((r) => r.category === "Tax").reduce((t, r) => t + pkr(r), 0)) },
          { label: "Legal expenses (PKR)", value: fmtCompact(withAmount.filter((r) => r.category === "Legal").reduce((t, r) => t + pkr(r), 0)) },
        ]}
      />
      <Grid>
        <ChartCard title="Taxes & legal expenses by year (PKR)">
          <BarsChart
            data={yearly}
            xKey="year"
            xIsMonth={false}
            series={[
              { key: "Tax", label: "Taxes" },
              { key: "Legal", label: "Legal expenses" },
              { key: "Other", label: "Other" },
            ]}
            money
          />
        </ChartCard>
        <ChartCard title="Document status">
          <RankBars rows={groupSum(rows, companyDocStatus)} />
        </ChartCard>
      </Grid>
      <div className="mt-4">
        <ChartCard title="Expired or expiring documents">
          <SimpleTable
            head={["Document", "Category", "Expiry", "Status"]}
            empty="Nothing expiring in the next 30 days."
            rows={expiring.map((r) => [
              <RecordLink key={r.id} col="companyDocs" id={r.id}>
                {r.title}
              </RecordLink>,
              r.category,
              fmtDate(r.expiryDate),
              <Badge key="s" tone={statusTone(companyDocStatus(r))}>
                {companyDocStatus(r)}
              </Badge>,
            ])}
          />
        </ChartCard>
      </div>
    </div>
  );
}

export function investorsReport(rows: Rec[]) {
  const outstanding = (r: Rec) => Math.max(0, num(r.principal) - num(r.repaid)) * rateOf(r);
  return (
    <div>
      <Kpis
        items={[
          { label: "Total received (PKR)", value: fmtCompact(rows.reduce((t, r) => t + pkr(r), 0)) },
          { label: "Repaid (PKR)", value: fmtCompact(rows.reduce((t, r) => t + num(r.repaid) * rateOf(r), 0)) },
          { label: "Outstanding (PKR)", value: fmtCompact(rows.reduce((t, r) => t + outstanding(r), 0)), tone: "warn" },
          { label: "Active", value: fmtNum(rows.filter((r) => r.status === "Active").length) },
          { label: "Due within 30 days", value: fmtNum(rows.filter((r) => r.status === "Active" && r.dueDate && r.dueDate <= daysFromToday(30)).length), tone: "warn" },
        ]}
      />
      <Grid>
        <ChartCard title="Outstanding by type (PKR)">
          <RankBars rows={groupSum(rows, (r) => r.type, outstanding)} money />
        </ChartCard>
        <ChartCard title="Outstanding by bank / investor (PKR)">
          <RankBars rows={groupSum(rows, (r) => r.bank || r.name, outstanding)} money />
        </ChartCard>
      </Grid>
    </div>
  );
}

export function expensesReport(rows: Rec[]) {
  const kinds = ["Expense", "Charity", "Zakat"];
  const years = [...new Set(rows.map((r) => (r.date ?? "").slice(0, 4)).filter(Boolean))].sort();
  return (
    <div>
      <Kpis items={kinds.map((k) => ({ label: `${k} (PKR)`, value: fmtCompact(rows.filter((r) => r.kind === k).reduce((t, r) => t + pkr(r), 0)) })).concat([{ label: "Total (PKR)", value: fmtCompact(rows.reduce((t, r) => t + pkr(r), 0)) }])} />
      <Grid>
        <ChartCard title="By month (PKR)">
          <BarsChart data={monthly(rows, { split: (r) => r.kind, value: pkr, series: kinds })} series={kinds.map((k) => ({ key: k, label: k }))} stacked money />
        </ChartCard>
        <ChartCard title="Year comparison (PKR)">
          <BarsChart
            data={years.map((y) => {
              const row: Record<string, string | number> = { year: y };
              kinds.forEach((k) => (row[k] = rows.filter((r) => r.kind === k && r.date?.startsWith(y)).reduce((t, r) => t + pkr(r), 0)));
              return row;
            })}
            xKey="year"
            xIsMonth={false}
            series={kinds.map((k) => ({ key: k, label: k }))}
            money
          />
        </ChartCard>
        <ChartCard title="Expenses by category (PKR)">
          <RankBars rows={groupSum(rows.filter((r) => r.kind === "Expense"), (r) => r.category, pkr)} money />
        </ChartCard>
        <ChartCard title="Paid to (PKR)">
          <RankBars rows={groupSum(rows, (r) => r.paidTo, pkr)} money />
        </ChartCard>
      </Grid>
    </div>
  );
}

