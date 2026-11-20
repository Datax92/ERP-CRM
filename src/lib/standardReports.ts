import { daysBetween, fmtMonth, lateness, monthKey, num, rateOf, today } from "./calc";
import { contactDate } from "./marketing";
import { clientInfo, documentClientId, poInfo, shipmentInfo, soInfo, type Store } from "./derive";
import { productWise } from "./report";
import { stageKind } from "./stages";
import type { CollectionName, Rec } from "./types";

/** How a report column is shown: money and numbers right-aligned and totalled. */
export type ReportKind = "text" | "money" | "num" | "pct" | "date" | "days";
export type ReportColumn = { label: string; kind: ReportKind; total?: boolean };
export type ReportRow = { cells: (string | number)[]; link?: { col: CollectionName; id: string } };
export type ReportResult = { columns: ReportColumn[]; rows: ReportRow[]; chart?: { label: string; value: number; money?: boolean }; note?: string };

/** The filters a report can be narrowed by; every value is optional. */
export type ReportFilters = { from?: string; to?: string; region?: string; sector?: string; country?: string; clientId?: string; supplierId?: string };
export type FilterKey = keyof ReportFilters;

export type StandardReport = {
  key: string;
  group: string;
  title: string;
  description: string;
  filters: FilterKey[];
  /** Which column the graph ranks by (index into columns). */
  chartBy?: number;
  run: (s: Store, f: ReportFilters) => ReportResult;
};

const pkr = (r: Rec) => num(r.amountPKR) || num(r.amount) * rateOf(r);
const inRange = (d: string | undefined, f: ReportFilters) => (!f.from || (d ?? "") >= f.from) && (!f.to || (d ?? "") <= f.to);
const clientOf = (r: Rec, s: Store) => s.byId.clients.get(documentClientId(r, s));
/** Region / sector / country / client filters, applied through a document's client. */
function clientMatch(c: Rec | undefined, f: ReportFilters) {
  if (f.clientId && c?.id !== f.clientId) return false;
  if (f.region && c?.region !== f.region) return false;
  if (f.sector && c?.sector !== f.sector) return false;
  if (f.country && c?.country !== f.country) return false;
  return true;
}
const docs = (col: CollectionName, s: Store, f: ReportFilters) => s[col].filter((r) => inRange(r.date, f) && clientMatch(clientOf(r, s), f));
const name = (r?: Rec) => r?.name ?? "—";

export const STANDARD_REPORTS: StandardReport[] = [
  {
    key: "customerAnalysis",
    group: "Customers",
    title: "Customer analysis",
    description: "For each customer: how many RFQs, quotations and sales orders, and the total business.",
    filters: ["from", "to", "region", "sector", "country", "clientId"],
    chartBy: 8,
    run: (s, f) => {
      const rows = s.clients
        .filter((c) => clientMatch(c, f))
        .map((c) => {
          const rfqs = s.rfqs.filter((r) => r.clientId === c.id && inRange(r.date, f));
          const quotes = s.quotations.filter((r) => r.clientId === c.id && inRange(r.date, f));
          const sos = s.salesOrders.filter((r) => r.clientId === c.id && r.status !== "Cancelled" && inRange(r.date, f));
          const business = sos.reduce((t, o) => t + pkr(o), 0);
          const received = sos.reduce((t, o) => t + soInfo(o, s).received * rateOf(o), 0);
          const won = quotes.filter((q) => stageKind("quotations", q.status) === "won").length;
          const i = clientInfo(c, s);
          return {
            cells: [c.name, c.region || "—", c.sector || "—", rfqs.length, quotes.length, quotes.reduce((t, q) => t + pkr(q), 0), sos.length, quotes.length ? (won / quotes.length) * 100 : "", business, received, Math.max(0, business - received), i.lastActivity ?? ""],
            link: { col: "clients" as const, id: c.id },
          };
        })
        .filter((r) => (r.cells[3] as number) + (r.cells[4] as number) + (r.cells[6] as number) > 0 || !(f.from || f.to))
        .sort((a, b) => (b.cells[8] as number) - (a.cells[8] as number));
      return {
        columns: [
          { label: "Customer", kind: "text" },
          { label: "Region", kind: "text" },
          { label: "Sector", kind: "text" },
          { label: "RFQs", kind: "num", total: true },
          { label: "Quotations", kind: "num", total: true },
          { label: "Quoted value (PKR)", kind: "money", total: true },
          { label: "Sales orders", kind: "num", total: true },
          { label: "Quotation win %", kind: "pct" },
          { label: "Business total (PKR)", kind: "money", total: true },
          { label: "Received (PKR)", kind: "money", total: true },
          { label: "Outstanding (PKR)", kind: "money", total: true },
          { label: "Last activity", kind: "date" },
        ],
        rows,
      };
    },
  },
  {
    key: "regionSector",
    group: "Customers",
    title: "Business by region & sector",
    description: "RFQs, quotations, sales orders and business total for each region and sector.",
    filters: ["from", "to", "region", "sector", "country"],
    chartBy: 6,
    run: (s, f) => {
      const m = new Map<string, { region: string; sector: string; clients: Set<string>; rfqs: number; quotes: number; sos: number; value: number }>();
      const add = (r: Rec, k: "rfqs" | "quotes" | "sos") => {
        const c = clientOf(r, s);
        const key = `${c?.region || "Not set"}|${c?.sector || "Not set"}`;
        const x = m.get(key) ?? { region: c?.region || "Not set", sector: c?.sector || "Not set", clients: new Set<string>(), rfqs: 0, quotes: 0, sos: 0, value: 0 };
        if (c) x.clients.add(c.id);
        x[k]++;
        if (k === "sos") x.value += pkr(r);
        m.set(key, x);
      };
      docs("rfqs", s, f).forEach((r) => add(r, "rfqs"));
      docs("quotations", s, f).forEach((r) => add(r, "quotes"));
      docs("salesOrders", s, f).filter((r) => r.status !== "Cancelled").forEach((r) => add(r, "sos"));
      return {
        columns: [
          { label: "Region", kind: "text" },
          { label: "Sector", kind: "text" },
          { label: "Customers", kind: "num", total: true },
          { label: "RFQs", kind: "num", total: true },
          { label: "Quotations", kind: "num", total: true },
          { label: "Sales orders", kind: "num", total: true },
          { label: "Business total (PKR)", kind: "money", total: true },
        ],
        rows: [...m.values()].sort((a, b) => b.value - a.value).map((x) => ({ cells: [x.region, x.sector, x.clients.size, x.rfqs, x.quotes, x.sos, x.value] })),
      };
    },
  },
  {
    key: "monthlySales",
    group: "Sales",
    title: "Sales by month",
    description: "Each month's RFQs, quotations, sales orders, sales value and margin.",
    filters: ["from", "to", "region", "sector", "country", "clientId"],
    chartBy: 4,
    run: (s, f) => {
      const m = new Map<string, number[]>();
      const bump = (d: string | undefined, i: number, v = 1) => {
        const k = monthKey(d);
        if (!k) return;
        const x = m.get(k) ?? [0, 0, 0, 0, 0];
        x[i] += v;
        m.set(k, x);
      };
      docs("rfqs", s, f).forEach((r) => bump(r.date, 0));
      docs("quotations", s, f).forEach((r) => bump(r.date, 1));
      docs("salesOrders", s, f).filter((r) => r.status !== "Cancelled").forEach((r) => {
        bump(r.date, 2);
        bump(r.date, 3, pkr(r));
        bump(r.date, 4, num(r.marginPKR));
      });
      return {
        columns: [
          { label: "Month", kind: "text" },
          { label: "RFQs", kind: "num", total: true },
          { label: "Quotations", kind: "num", total: true },
          { label: "Sales orders", kind: "num", total: true },
          { label: "Sales (PKR)", kind: "money", total: true },
          { label: "Margin (PKR)", kind: "money", total: true },
          { label: "Margin %", kind: "pct" },
        ],
        rows: [...m.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([k, x]) => ({ cells: [fmtMonth(k), ...x, x[3] ? (x[4] / x[3]) * 100 : 0] })),
      };
    },
  },
  {
    key: "productSales",
    group: "Sales",
    title: "Product-wise sales",
    description: "Quantity, sales value and margin of each product on sales orders.",
    filters: ["from", "to", "region", "sector", "country", "clientId"],
    chartBy: 3,
    run: (s, f) => ({
      columns: [
        { label: "Product", kind: "text" },
        { label: "Lines", kind: "num", total: true },
        { label: "Qty", kind: "num", total: true },
        { label: "Sales (PKR)", kind: "money", total: true },
        { label: "Cost (PKR)", kind: "money", total: true },
        { label: "Margin (PKR)", kind: "money", total: true },
        { label: "Margin %", kind: "pct" },
      ],
      rows: productWise(docs("salesOrders", s, f).filter((r) => r.status !== "Cancelled"))
        .sort((a, b) => b.value - a.value)
        .map((p) => ({ cells: [p.product, p.lines, p.qty, p.value, p.cost, p.value - p.cost, p.value ? ((p.value - p.cost) / p.value) * 100 : 0] })),
    }),
  },
  {
    key: "openPipeline",
    group: "Sales",
    title: "Open RFQs & quotations",
    description: "Every inquiry and offer still open, oldest first, with its value and due date.",
    filters: ["from", "to", "region", "sector", "country", "clientId"],
    run: (s, f) => ({
      columns: [
        { label: "Document", kind: "text" },
        { label: "Type", kind: "text" },
        { label: "Customer", kind: "text" },
        { label: "Date", kind: "date" },
        { label: "Due / valid until", kind: "date" },
        { label: "Status", kind: "text" },
        { label: "Value (PKR)", kind: "money", total: true },
        { label: "Age (days)", kind: "days" },
      ],
      rows: [
        ...docs("rfqs", s, f).filter((r) => stageKind("rfqs", r.status) === "open").map((r) => ({ col: "rfqs" as const, r, type: "RFQ", due: r.dueDate })),
        ...docs("quotations", s, f).filter((r) => stageKind("quotations", r.status) === "open").map((r) => ({ col: "quotations" as const, r, type: "Quotation", due: r.validUntil })),
      ]
        .sort((a, b) => String(a.r.date).localeCompare(String(b.r.date)))
        .map(({ col, r, type, due }) => ({ cells: [r.clientRef || r.serial, type, name(clientOf(r, s)), r.date ?? "", due ?? "", r.status ?? "", col === "quotations" ? pkr(r) : 0, daysBetween(r.date, today()) ?? 0], link: { col, id: r.id } })),
    }),
  },
  {
    key: "receivables",
    group: "Payments",
    title: "Receivables (customer payments due)",
    description: "Sales orders with money still to collect: total, received, remaining and days since delivery.",
    filters: ["from", "to", "region", "sector", "country", "clientId"],
    chartBy: 5,
    run: (s, f) => ({
      columns: [
        { label: "Sales order", kind: "text" },
        { label: "Customer", kind: "text" },
        { label: "Date", kind: "date" },
        { label: "Total payment (PKR)", kind: "money", total: true },
        { label: "Received (PKR)", kind: "money", total: true },
        { label: "Remaining (PKR)", kind: "money", total: true },
        { label: "Status", kind: "text" },
        { label: "Days since delivery", kind: "days" },
      ],
      rows: docs("salesOrders", s, f)
        .filter((o) => o.status !== "Cancelled")
        .map((o) => ({ o, i: soInfo(o, s) }))
        .filter(({ i }) => i.outstanding > 0.005)
        .sort((a, b) => b.i.outstanding * rateOf(b.o) - a.i.outstanding * rateOf(a.o))
        .map(({ o, i }) => ({ cells: [o.serial, name(clientOf(o, s)), o.date ?? "", pkr(o), i.received * rateOf(o), i.outstanding * rateOf(o), i.payment, i.deliveredDate ? (daysBetween(i.deliveredDate, today()) ?? 0) : ""], link: { col: "salesOrders" as const, id: o.id } })),
    }),
  },
  {
    key: "payables",
    group: "Payments",
    title: "Payables (supplier payments due)",
    description: "Purchase orders with money still to pay the supplier.",
    filters: ["from", "to", "supplierId"],
    chartBy: 5,
    run: (s, f) => ({
      columns: [
        { label: "Purchase order", kind: "text" },
        { label: "Supplier", kind: "text" },
        { label: "Date", kind: "date" },
        { label: "Total payment (PKR)", kind: "money", total: true },
        { label: "Paid (PKR)", kind: "money", total: true },
        { label: "Remaining (PKR)", kind: "money", total: true },
        { label: "Status", kind: "text" },
      ],
      rows: s.purchaseOrders
        .filter((o) => o.status !== "Cancelled" && inRange(o.date, f) && (!f.supplierId || o.supplierId === f.supplierId))
        .map((o) => ({ o, i: poInfo(o, s) }))
        .filter(({ i }) => i.outstanding > 0.005)
        .sort((a, b) => b.i.outstanding * rateOf(b.o) - a.i.outstanding * rateOf(a.o))
        .map(({ o, i }) => ({ cells: [o.serial, name(s.byId.suppliers.get(o.supplierId)), o.date ?? "", pkr(o), i.paid * rateOf(o), i.outstanding * rateOf(o), i.payment], link: { col: "purchaseOrders" as const, id: o.id } })),
    }),
  },
  {
    key: "supplierAnalysis",
    group: "Suppliers",
    title: "Supplier analysis",
    description: "For each supplier: purchase orders, total purchased, paid and payable.",
    filters: ["from", "to", "supplierId"],
    chartBy: 3,
    run: (s, f) => ({
      columns: [
        { label: "Supplier", kind: "text" },
        { label: "Vendor nature", kind: "text" },
        { label: "Purchase orders", kind: "num", total: true },
        { label: "Purchased (PKR)", kind: "money", total: true },
        { label: "Paid (PKR)", kind: "money", total: true },
        { label: "Payable (PKR)", kind: "money", total: true },
      ],
      rows: s.suppliers
        .filter((x) => !f.supplierId || x.id === f.supplierId)
        .map((x) => {
          const pos = s.purchaseOrders.filter((o) => o.supplierId === x.id && o.status !== "Cancelled" && inRange(o.date, f));
          const bought = pos.reduce((t, o) => t + pkr(o), 0);
          const paid = pos.reduce((t, o) => t + poInfo(o, s).paid * rateOf(o), 0);
          return { cells: [x.name, x.nature || "—", pos.length, bought, paid, Math.max(0, bought - paid)], link: { col: "suppliers" as const, id: x.id } };
        })
        .filter((r) => (r.cells[2] as number) > 0 || !(f.from || f.to))
        .sort((a, b) => (b.cells[3] as number) - (a.cells[3] as number)),
    }),
  },
  {
    key: "lateDeliveries",
    group: "Operations",
    title: "Late deliveries",
    description: "Sales orders delivered after, or still open past, the promised delivery date.",
    filters: ["from", "to", "region", "sector", "country", "clientId"],
    run: (s, f) => ({
      columns: [
        { label: "Sales order", kind: "text" },
        { label: "Customer", kind: "text" },
        { label: "Promised", kind: "date" },
        { label: "Delivered", kind: "date" },
        { label: "Late (days)", kind: "days" },
        { label: "Status", kind: "text" },
      ],
      rows: docs("salesOrders", s, f)
        .filter((o) => o.status !== "Cancelled")
        .map((o) => ({ o, i: soInfo(o, s), l: lateness(o.expectedDeliveryDate, soInfo(o, s).deliveredDate) }))
        .filter((x) => x.l && x.l.days > 0)
        .sort((a, b) => b.l!.days - a.l!.days)
        .map(({ o, i, l }) => ({ cells: [o.serial, name(clientOf(o, s)), o.expectedDeliveryDate ?? "", i.deliveredDate ?? "", l!.days, l!.overdue ? "Not delivered yet" : "Delivered late"], link: { col: "salesOrders" as const, id: o.id } })),
    }),
  },
  {
    key: "shipments",
    group: "Operations",
    title: "Shipment tracking",
    description: "Every shipment: route, ETA, status, days late and documents still missing.",
    filters: ["from", "to", "region", "sector", "country", "clientId"],
    run: (s, f) => ({
      columns: [
        { label: "Shipment", kind: "text" },
        { label: "Customer", kind: "text" },
        { label: "Mode", kind: "text" },
        { label: "BL / AWB", kind: "text" },
        { label: "ETA", kind: "date" },
        { label: "Status", kind: "text" },
        { label: "Late (days)", kind: "days" },
        { label: "Missing documents", kind: "text" },
      ],
      rows: docs("shipments", s, f).map((r) => {
        const i = shipmentInfo(r, s);
        return { cells: [r.serial, name(clientOf(r, s)), r.mode ?? "", r.trackingNo ?? "", r.eta ?? "", r.status ?? "", i.late?.days ?? 0, i.missing.join(", ")], link: { col: "shipments" as const, id: r.id } };
      }),
    }),
  },
  {
    key: "marketingByRegion",
    group: "Marketing",
    title: "Marketing activity by region & sector",
    description: "When each region and sector was last marketed to, how, and how many activities.",
    filters: ["from", "to", "region", "sector", "country"],
    chartBy: 3,
    run: (s, f) => {
      const m = new Map<string, { region: string; sector: string; n: number; clients: Set<string>; last: string; channel: string; subject: string }>();
      s.marketing.forEach((a) => {
        const c = s.byId.clients.get(a.clientId);
        const d = contactDate(a) || a.date;
        if (!inRange(d, f) || !clientMatch(c, { ...f, clientId: undefined })) return;
        const key = `${c?.region || "Not set"}|${c?.sector || "Not set"}`;
        const x = m.get(key) ?? { region: c?.region || "Not set", sector: c?.sector || "Not set", n: 0, clients: new Set<string>(), last: "", channel: "", subject: "" };
        x.n++;
        if (c) x.clients.add(c.id);
        if (d && d > x.last) Object.assign(x, { last: d, channel: a.channel ?? "", subject: a.subject ?? "" });
        m.set(key, x);
      });
      return {
        columns: [
          { label: "Region", kind: "text" },
          { label: "Sector", kind: "text" },
          { label: "Customers reached", kind: "num", total: true },
          { label: "Activities", kind: "num", total: true },
          { label: "Last activity", kind: "date" },
          { label: "Last channel", kind: "text" },
          { label: "Last subject / campaign", kind: "text" },
          { label: "Days since", kind: "days" },
        ],
        rows: [...m.values()].sort((a, b) => b.last.localeCompare(a.last)).map((x) => ({ cells: [x.region, x.sector, x.clients.size, x.n, x.last, x.channel, x.subject, x.last ? (daysBetween(x.last, today()) ?? 0) : ""] })),
      };
    },
  },
  {
    key: "expenses",
    group: "Finance",
    title: "Expenses by category",
    description: "Expenses, charity and zakat in the period, by category.",
    filters: ["from", "to"],
    chartBy: 2,
    run: (s, f) => {
      const m = new Map<string, { kind: string; n: number; total: number }>();
      s.expenses.filter((e) => inRange(e.date, f)).forEach((e) => {
        const k = `${e.kind || "Expense"}|${e.category || "—"}`;
        const x = m.get(k) ?? { kind: e.kind || "Expense", n: 0, total: 0 };
        x.n++;
        x.total += num(e.amountPKR) || num(e.amountValue) * rateOf(e);
        m.set(k, x);
      });
      return {
        columns: [
          { label: "Type / category", kind: "text" },
          { label: "Entries", kind: "num", total: true },
          { label: "Total (PKR)", kind: "money", total: true },
        ],
        rows: [...m.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, x]) => ({ cells: [k.split("|").filter((p) => p !== "—").join(" · "), x.n, x.total] })),
      };
    },
  },
];

export const reportByKey = (key: string) => STANDARD_REPORTS.find((r) => r.key === key);
