import { num, rateOf } from "./calc";
import { soInfo, type Store } from "./derive";
import type { CollectionName, Rec } from "./types";

export type Flow = { date: string; dir: "in" | "out"; kind: string; party: string; pkr: number; col: CollectionName; id: string };

const pkr = (r: Rec) => num(r.amountPKR);

/** Every money movement already recorded somewhere else in the system — nothing is re-typed. */
export function cashFlows(s: Store): Flow[] {
  const out: Flow[] = [];
  for (const p of s.payments) {
    const recv = p.direction === "Received";
    out.push({
      date: p.date,
      dir: recv ? "in" : "out",
      kind: recv ? "Client receipts" : "Vendor payments",
      party: (recv ? s.byId.clients.get(p.clientId)?.name : s.byId.suppliers.get(p.supplierId)?.name) ?? "",
      pkr: pkr(p),
      col: "payments",
      id: p.id,
    });
  }
  for (const e of s.expenses) out.push({ date: e.date, dir: "out", kind: e.kind === "Expense" ? "Expenses" : e.kind, party: e.paidTo ?? "", pkr: pkr(e), col: "expenses", id: e.id });
  for (const f of s.financeEntries) out.push({ date: f.date, dir: f.direction === "In" ? "in" : "out", kind: f.category || (f.direction === "In" ? "Other income" : "Other payments"), party: "", pkr: pkr(f), col: "financeEntries", id: f.id });
  for (const i of s.investors) out.push({ date: i.date, dir: "in", kind: `${i.type || "Finance"} received`, party: i.name ?? "", pkr: pkr(i), col: "investors", id: i.id });
  for (const d of s.companyDocs)
    if (num(d.amountValue) && d.date) out.push({ date: d.date, dir: "out", kind: d.category === "Tax" ? "Taxes" : d.category === "Legal" ? "Legal expenses" : `Company (${d.category})`, party: "", pkr: pkr(d), col: "companyDocs", id: d.id });
  return out.filter((f) => f.date);
}

export type PLBasis = "orders" | "cash";

export type PLLine = { date: string; revenue: number; cost: number; opex: number; otherIncome: number; charity: number; zakat: number };

/**
 * Profit & loss lines.
 * - orders basis: revenue = sales orders booked; cost = linked PO cost (or quoted cost until POs exist).
 * - cash basis: revenue = payments received; cost = payments to vendors.
 * Operating costs: Expenses module, bank charges, and taxes/legal from the Company module.
 */
export function plLines(s: Store, basis: PLBasis): PLLine[] {
  const z = { revenue: 0, cost: 0, opex: 0, otherIncome: 0, charity: 0, zakat: 0 };
  const lines: PLLine[] = [];
  if (basis === "orders") {
    for (const so of s.salesOrders) {
      if (so.status === "Cancelled") continue;
      lines.push({ ...z, date: so.date, revenue: pkr(so), cost: soInfo(so, s).costPKR });
    }
  } else {
    for (const p of s.payments) lines.push({ ...z, date: p.date, [p.direction === "Received" ? "revenue" : "cost"]: pkr(p) });
  }
  for (const e of s.expenses) {
    const key = e.kind === "Charity" ? "charity" : e.kind === "Zakat" ? "zakat" : "opex";
    lines.push({ ...z, date: e.date, [key]: pkr(e) });
  }
  for (const f of s.financeEntries) {
    if (f.category === "Bank Charges" && f.direction === "Out") lines.push({ ...z, date: f.date, opex: pkr(f) });
    if (f.category === "Other Income" && f.direction === "In") lines.push({ ...z, date: f.date, otherIncome: pkr(f) });
  }
  for (const d of s.companyDocs) if (num(d.amountValue) && d.date) lines.push({ ...z, date: d.date, opex: pkr(d) });
  return lines.filter((l) => l.date);
}

export function sumPL(lines: PLLine[]) {
  const t = lines.reduce(
    (a, l) => ({
      revenue: a.revenue + l.revenue,
      cost: a.cost + l.cost,
      opex: a.opex + l.opex,
      otherIncome: a.otherIncome + l.otherIncome,
      charity: a.charity + l.charity,
      zakat: a.zakat + l.zakat,
    }),
    { revenue: 0, cost: 0, opex: 0, otherIncome: 0, charity: 0, zakat: 0 },
  );
  const gross = t.revenue - t.cost;
  const net = gross - t.opex + t.otherIncome;
  return { ...t, gross, net, afterGiving: net - t.charity - t.zakat, grossPct: t.revenue ? (gross / t.revenue) * 100 : 0 };
}

export const outstandingReceivables = (s: Store) =>
  s.salesOrders.filter((o) => o.status !== "Cancelled").reduce((t, o) => t + soInfo(o, s).outstanding * rateOf(o), 0);
