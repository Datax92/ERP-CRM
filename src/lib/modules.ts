import { computeCostSheet, emptyItem, fmtDate, fmtMoney, fmtNum, fmtPct, num, today } from "./calc";
import { clientInfo, deliveryInfo, piInfo, poInfo, soInfo, supplierInfo, type Store } from "./derive";
import { STAGES } from "./stages";
import type { CollectionName, ItemsMode, ListKey, Rec } from "./types";

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "ref"
  | "items"
  | "currency";

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  list?: ListKey;
  options?: string[];
  ref?: CollectionName;
  required?: boolean;
  wide?: boolean;
  help?: string;
  showIf?: (data: Rec) => boolean;
  /** Values copied into the form when this field changes (e.g. client → region, sector). */
  autofill?: (value: any, data: Rec, s: Store) => Partial<Rec>;
};

/** Cell text for tables; `tone` drives the status badge colour; `subtext` shows converted currency equivalent. */
export type Cell = { text: string; subtext?: string; tone?: "good" | "warn" | "bad" | "info" | "muted"; sort?: string | number };

export type Column = { key: string; label: string; align?: "right"; cell: (r: Rec, s: Store) => Cell };

export type FilterDef = { key: string; label: string; options: (s: Store) => string[]; get: (r: Rec, s: Store) => string | string[] };

export type ModuleConfig = {
  col: CollectionName;
  title: string;
  singular: string;
  href: string;
  prefix?: string;
  itemsMode?: (data: Rec) => ItemsMode | undefined;
  amountField?: string;
  fields: FieldDef[];
  columns: Column[];
  filters: FilterDef[];
  searchKeys: string[];
  defaults: (s: Store) => Partial<Rec>;
  /** Derived fields written on save. */
  compute?: (data: Rec) => Partial<Rec>;
};

// ---------- helpers ----------
const t = (text: unknown): Cell => ({ text: text == null || text === "" ? "—" : String(text) });
const money = (v: unknown, cur = "PKR", pkrVal?: unknown): Cell => {
  const primary = fmtMoney(v, cur);
  const pkrNum = num(pkrVal);
  if (cur && cur !== "PKR" && pkrNum > 0) {
    return {
      text: primary,
      subtext: `≈ PKR ${fmtNum(pkrNum)}`,
      sort: num(v),
    };
  }
  return { text: primary, sort: num(v) };
};
const date = (v?: string): Cell => ({ text: fmtDate(v) || "—", sort: v ?? "" });

export function statusTone(status: string): Cell["tone"] {
  const s = status.toLowerCase();
  if (s === "registered") return "good";
  if (s === "unregistered") return "muted";
  if (s === "in process") return "warn";
  if (/(won|converted|delivered|received|paid$|^paid|closed|approved|valid|active|confirmed|repaid)/.test(s) && !/partially/.test(s)) return "good";
  if (/(lost|cancel|regret|returned|rejected|expired|unpaid|overdue|late)/.test(s)) return "bad";
  if (/(partial|follow|negotiat|pending|due|expiring|costing|transit|shipped)/.test(s)) return "warn";
  if (s === "—" || s === "draft" || s === "lead") return "muted";
  return "info";
}
const badge = (v?: string): Cell => ({ text: v || "—", tone: statusTone(v || "—") });

const clientName = (r: Rec, s: Store) => s.byId.clients.get(r.clientId)?.name ?? "";
const supplierName = (r: Rec, s: Store) => s.byId.suppliers.get(r.supplierId)?.name ?? "";

export function labelOf(col: CollectionName, r: Rec | undefined, s: Store): string {
  if (!r) return "";
  switch (col) {
    case "clients":
    case "suppliers":
      return r.name ?? "(unnamed)";
    case "rfqs":
    case "quotations":
    case "salesOrders":
    case "deliveries":
      return [r.serial, clientName(r, s)].filter(Boolean).join(" · ");
    case "purchaseOrders":
      return [r.serial, supplierName(r, s)].filter(Boolean).join(" · ");
    case "proformaInvoices":
      return [r.serial, r.type === "From Supplier" ? supplierName(r, s) : clientName(r, s)].filter(Boolean).join(" · ");
    case "investors":
      return r.name ?? "";
    case "schedule":
      return [r.date, r.title].filter(Boolean).join(" · ") || r.serial || "Task";
    case "costSheets":
      return [r.serial, r.title || clientName(r, s)].filter(Boolean).join(" · ") || r.serial || "Cost Sheet";
    default:
      return r.serial ?? r.title ?? r.description ?? r.id;
  }
}

const fromClient = (id: string, _d: Rec, s: Store) => {
  const c = s.byId.clients.get(id);
  return c ? { region: c.region ?? "", sector: c.sector ?? "" } : {};
};

const statusField = (col: CollectionName): FieldDef => ({ name: "status", label: "Status", type: "select", options: STAGES[col]!.options, required: true });
const followUpFields: FieldDef[] = [
  { name: "followUpStatus", label: "Follow-up status", type: "select", list: "followUpStatuses" },
  { name: "nextFollowUpDate", label: "Next follow-up", type: "date" },
  { name: "feedback", label: "Feedback", type: "textarea", wide: true },
];
const notes: FieldDef = { name: "notes", label: "Notes / description", type: "textarea", wide: true };

const regionFilter: FilterDef = { key: "region", label: "Region", options: (s) => s.settings.regions, get: (r) => r.region ?? "" };
const sectorFilter: FilterDef = { key: "sector", label: "Sector", options: (s) => s.settings.sectors, get: (r) => r.sector ?? "" };
const statusFilter = (col: CollectionName): FilterDef => ({ key: "status", label: "Status", options: () => STAGES[col]!.options, get: (r) => r.status ?? "" });
const clientFilter: FilterDef = {
  key: "clientId",
  label: "Client",
  options: (s) => [...new Set(s.clients.map((c) => String(c.name)))].sort(),
  get: (r, s) => clientName(r, s),
};
const productFilter: FilterDef = {
  key: "product",
  label: "Product",
  options: (s) => s.settings.products,
  get: (r) => (r.items ?? []).map((i: Rec) => i.product).filter(Boolean),
};
const cur = () => ({ currency: "PKR", exchangeRate: 1, date: today() });

// ---------- modules ----------
export const MODULES: Record<CollectionName, ModuleConfig> = {
  clients: {
    col: "clients",
    title: "Clients",
    singular: "Client",
    href: "/clients",
    searchKeys: ["name", "contactPerson", "email", "phone", "mobile", "details"],
    defaults: () => ({ registration: "Unregistered", country: "Pakistan" }),
    fields: [
      { name: "name", label: "Client / company name", type: "text", required: true },
      { name: "contactPerson", label: "Contact person", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Telephone", type: "tel" },
      { name: "mobile", label: "Mobile / WhatsApp", type: "tel" },
      { name: "region", label: "Region", type: "select", list: "regions" },
      { name: "country", label: "Country", type: "select", list: "countries" },
      { name: "sector", label: "Sector", type: "select", list: "sectors" },
      { name: "registration", label: "Registration status", type: "select", options: ["Registered", "Unregistered", "In process"] },
      { name: "registrationNo", label: "Registration / vendor no.", type: "text", showIf: (d) => d.registration !== "Unregistered" },
      { name: "registrationDate", label: "Registration date", type: "date", showIf: (d) => d.registration === "Registered" },
      { name: "address", label: "Address", type: "textarea", wide: true },
      { name: "details", label: "Client details", type: "textarea", wide: true },
    ],
    columns: [
      { key: "name", label: "Client", cell: (r) => t(r.name) },
      { key: "region", label: "Region", cell: (r) => t(r.region) },
      { key: "sector", label: "Sector", cell: (r) => t(r.sector) },
      { key: "registration", label: "Registration", cell: (r) => badge(r.registration) },
      { key: "lifecycle", label: "Stage", cell: (r, s) => badge(clientInfo(r, s).lifecycle) },
      { key: "rfqStage", label: "RFQ stage", cell: (r, s) => badge(clientInfo(r, s).rfqStage) },
      { key: "quotationStage", label: "Quotation stage", cell: (r, s) => badge(clientInfo(r, s).quotationStage) },
      { key: "poStage", label: "PO stage", cell: (r, s) => badge(clientInfo(r, s).poStage) },
      { key: "paymentStage", label: "Payment", cell: (r, s) => badge(clientInfo(r, s).paymentStage) },
      {
        key: "activity",
        label: "Last activity",
        cell: (r, s) => {
          const i = clientInfo(r, s);
          return { text: i.lastActivity ? `${fmtDate(i.lastActivity)} (${i.inactiveDays}d)` : "—", tone: i.active ? undefined : "warn", sort: i.inactiveDays ?? 99999 };
        },
      },
    ],
    filters: [
      regionFilter,
      sectorFilter,
      { key: "registration", label: "Registration", options: () => ["Registered", "Unregistered", "In process"], get: (r) => r.registration ?? "" },
      { key: "lifecycle", label: "Stage", options: () => ["Lead", "Inquiry received", "Offer given", "Order received", "Delivered"], get: (r, s) => clientInfo(r, s).lifecycle },
      { key: "active", label: "Activity", options: () => ["Active", "Inactive"], get: (r, s) => (clientInfo(r, s).active ? "Active" : "Inactive") },
      { key: "paymentStage", label: "Payment", options: () => ["Unpaid", "Partially paid", "Paid", "—"], get: (r, s) => clientInfo(r, s).paymentStage },
    ],
  },

  suppliers: {
    col: "suppliers",
    title: "Suppliers",
    singular: "Supplier",
    href: "/suppliers",
    searchKeys: ["name", "contactPerson", "email", "details"],
    defaults: () => ({ brands: [], products: [] }),
    fields: [
      { name: "name", label: "Supplier name", type: "text", required: true },
      { name: "contactPerson", label: "Contact person", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Telephone", type: "tel" },
      { name: "mobile", label: "Mobile / WhatsApp", type: "tel" },
      { name: "region", label: "Region", type: "select", list: "regions" },
      { name: "country", label: "Country", type: "select", list: "countries" },
      { name: "paymentTerms", label: "Usual payment terms", type: "select", list: "paymentTerms" },
      { name: "brands", label: "Brands", type: "multiselect", list: "brands", wide: true },
      { name: "products", label: "Products", type: "multiselect", list: "products", wide: true },
      { name: "address", label: "Address", type: "textarea", wide: true },
      { name: "details", label: "Supplier details", type: "textarea", wide: true },
    ],
    columns: [
      { key: "name", label: "Supplier", cell: (r) => t(r.name) },
      { key: "region", label: "Region", cell: (r) => t(r.region) },
      { key: "country", label: "Country", cell: (r) => t(r.country) },
      { key: "brands", label: "Brands", cell: (r) => t((r.brands ?? []).join(", ")) },
      { key: "products", label: "Products", cell: (r) => t((r.products ?? []).join(", ")) },
      { key: "purchased", label: "Purchased", align: "right", cell: (r, s) => money(supplierInfo(r, s).purchasedPKR) },
      { key: "payable", label: "Payable", align: "right", cell: (r, s) => money(supplierInfo(r, s).payablePKR) },
    ],
    filters: [
      regionFilter,
      { key: "country", label: "Country", options: (s) => s.settings.countries, get: (r) => r.country ?? "" },
      { key: "product", label: "Product", options: (s) => s.settings.products, get: (r) => r.products ?? [] },
      { key: "brand", label: "Brand", options: (s) => s.settings.brands, get: (r) => r.brands ?? [] },
    ],
  },

  marketing: {
    col: "marketing",
    title: "Marketing",
    singular: "Marketing activity",
    href: "/marketing",
    searchKeys: ["prospectName", "subject", "notes", "product"],
    defaults: () => ({ date: today(), channel: "Email", response: "No response" }),
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "channel", label: "Channel", type: "select", list: "marketingChannels", required: true },
      { name: "clientId", label: "Client", type: "ref", ref: "clients", help: "Leave empty for a prospect who is not a client yet." },
      { name: "prospectName", label: "Prospect name", type: "text", showIf: (d) => !d.clientId },
      { name: "product", label: "Product advertised", type: "select", list: "products" },
      { name: "subject", label: "Subject / campaign", type: "text" },
      { name: "response", label: "Client response", type: "select", list: "marketingResponses" },
      { name: "nextFollowUpDate", label: "Next follow-up", type: "date" },
      notes,
    ],
    columns: [
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "channel", label: "Channel", cell: (r) => t(r.channel) },
      { key: "who", label: "Client / prospect", cell: (r, s) => t(clientName(r, s) || r.prospectName) },
      { key: "product", label: "Product", cell: (r) => t(r.product) },
      { key: "subject", label: "Subject", cell: (r) => t(r.subject) },
      { key: "response", label: "Response", cell: (r) => badge(r.response) },
    ],
    filters: [
      { key: "channel", label: "Channel", options: (s) => s.settings.marketingChannels, get: (r) => r.channel ?? "" },
      { key: "response", label: "Response", options: (s) => s.settings.marketingResponses, get: (r) => r.response ?? "" },
      { key: "product", label: "Product", options: (s) => s.settings.products, get: (r) => r.product ?? "" },
    ],
  },

  rfqs: {
    col: "rfqs",
    title: "RFQs",
    singular: "RFQ",
    href: "/rfqs",
    prefix: "RFQ",
    itemsMode: () => "basic",
    searchKeys: ["serial", "clientRef", "notes"],
    defaults: () => ({ date: today(), status: "Open", items: [] }),
    fields: [
      { name: "date", label: "Inquiry date", type: "date", required: true },
      { name: "clientId", label: "Client", type: "ref", ref: "clients", required: true, autofill: fromClient },
      { name: "clientRef", label: "Client's inquiry / tender no.", type: "text" },
      { name: "dueDate", label: "Submission due date", type: "date" },
      { name: "region", label: "Region", type: "select", list: "regions" },
      { name: "sector", label: "Sector", type: "select", list: "sectors" },
      statusField("rfqs"),
      { name: "items", label: "Items requested", type: "items", wide: true },
      notes,
    ],
    columns: [
      { key: "serial", label: "RFQ no.", cell: (r) => t(r.serial) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "client", label: "Client", cell: (r, s) => t(clientName(r, s)) },
      { key: "items", label: "Items", cell: (r) => t((r.items ?? []).map((i: Rec) => i.product || i.description).filter(Boolean).join(", ")) },
      { key: "qty", label: "Qty", align: "right", cell: (r) => ({ text: String((r.items ?? []).reduce((a: number, i: Rec) => a + num(i.qty), 0)), sort: 0 }) },
      { key: "region", label: "Region", cell: (r) => t(r.region) },
      { key: "dueDate", label: "Due", cell: (r) => date(r.dueDate) },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
    ],
    filters: [statusFilter("rfqs"), clientFilter, regionFilter, sectorFilter, productFilter],
  },

  quotations: {
    col: "quotations",
    title: "Quotations",
    singular: "Quotation",
    href: "/quotations",
    prefix: "QT",
    itemsMode: () => "sale",
    searchKeys: ["serial", "notes", "feedback"],
    defaults: () => ({ ...cur(), status: "Draft", items: [] }),
    fields: [
      { name: "date", label: "Quotation date", type: "date", required: true },
      { name: "clientId", label: "Client", type: "ref", ref: "clients", required: true, autofill: fromClient },
      { name: "rfqId", label: "From RFQ", type: "ref", ref: "rfqs" },
      { name: "validUntil", label: "Valid until", type: "date" },
      { name: "region", label: "Region", type: "select", list: "regions" },
      { name: "sector", label: "Sector", type: "select", list: "sectors" },
      { name: "currency", label: "Currency", type: "currency" },
      { name: "paymentTerms", label: "Payment terms", type: "select", list: "paymentTerms" },
      { name: "incoterm", label: "Incoterm", type: "select", list: "incoterms" },
      statusField("quotations"),
      { name: "items", label: "Items, costing & offered price", type: "items", wide: true },
      ...followUpFields,
      notes,
    ],
    columns: [
      { key: "serial", label: "Quote no.", cell: (r) => t(r.serial) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "client", label: "Client", cell: (r, s) => t(clientName(r, s)) },
      { key: "total", label: "Total price", align: "right", cell: (r) => money(r.amount, r.currency, r.amountPKR) },
      { key: "margin", label: "Gross Margin", align: "right", cell: (r) => money(r.margin, r.currency) },
      {
        key: "netMarginPct",
        label: "Net Margin %",
        align: "right",
        cell: (r) => {
          const val = r.netMarginPct !== undefined ? r.netMarginPct : r.marginPct;
          const isHealthy = num(val) >= 15;
          const isWarning = num(val) <= 0;
          return {
            text: fmtPct(val),
            sort: num(val),
            tone: isHealthy ? "good" : isWarning ? "bad" : "muted",
          };
        },
      },
      { key: "followUp", label: "Follow-up", cell: (r) => badge(r.followUpStatus) },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
    ],
    filters: [statusFilter("quotations"), clientFilter, regionFilter, sectorFilter, productFilter, { key: "followUpStatus", label: "Follow-up", options: (s) => s.settings.followUpStatuses, get: (r) => r.followUpStatus ?? "" }],
  },

  salesOrders: {
    col: "salesOrders",
    title: "Sales Orders",
    singular: "Sales order",
    href: "/sales-orders",
    prefix: "SO",
    itemsMode: () => "sale",
    searchKeys: ["serial", "clientPoNo", "notes"],
    defaults: () => ({ ...cur(), status: "Open", items: [] }),
    fields: [
      { name: "date", label: "Order date", type: "date", required: true },
      { name: "clientId", label: "Client", type: "ref", ref: "clients", required: true, autofill: fromClient },
      { name: "quotationId", label: "From quotation", type: "ref", ref: "quotations" },
      { name: "clientPoNo", label: "Client's PO number", type: "text" },
      { name: "clientPoDate", label: "Client's PO date", type: "date" },
      { name: "region", label: "Region", type: "select", list: "regions" },
      { name: "sector", label: "Sector", type: "select", list: "sectors" },
      { name: "currency", label: "Currency", type: "currency" },
      { name: "paymentTerms", label: "Client payment terms", type: "select", list: "paymentTerms" },
      { name: "incoterm", label: "Incoterm", type: "select", list: "incoterms" },
      { name: "shipmentOriginDate", label: "Shipment date (origin)", type: "date" },
      { name: "expectedDeliveryDate", label: "Shipment date (delivery) — promised", type: "date" },
      statusField("salesOrders"),
      { name: "items", label: "Items", type: "items", wide: true },
      ...followUpFields,
      notes,
    ],
    columns: [
      { key: "serial", label: "SO no.", cell: (r) => t(r.serial) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "client", label: "Client", cell: (r, s) => t(clientName(r, s)) },
      { key: "total", label: "Total", align: "right", cell: (r) => money(r.amount, r.currency, r.amountPKR) },
      { key: "marginPct", label: "Margin %", align: "right", cell: (r) => ({ text: fmtPct(r.marginPct), sort: num(r.marginPct) }) },
      { key: "po", label: "PO to supplier", cell: (r, s) => { const i = soInfo(r, s); return i.poIssued ? { text: i.suppliers.join(", ") || "Issued", tone: "good" } : { text: "Not issued", tone: "muted" }; } },
      { key: "payment", label: "Payment", cell: (r, s) => badge(soInfo(r, s).payment) },
      { key: "late", label: "Late", align: "right", cell: (r, s) => { const l = soInfo(r, s).late; return l && l.days ? { text: `${l.days}d${l.overdue ? " overdue" : ""}`, tone: "bad", sort: l.days } : { text: "—", sort: 0 }; } },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
    ],
    filters: [statusFilter("salesOrders"), clientFilter, regionFilter, sectorFilter, productFilter, { key: "payment", label: "Payment", options: () => ["Unpaid", "Partially paid", "Paid"], get: (r, s) => soInfo(r, s).payment }],
  },

  purchaseOrders: {
    col: "purchaseOrders",
    title: "Purchase Orders",
    singular: "Purchase order",
    href: "/purchase-orders",
    prefix: "PO",
    itemsMode: () => "cost",
    searchKeys: ["serial", "supplierRef", "notes"],
    defaults: () => ({ ...cur(), status: "Draft", items: [], orderConfirmed: false }),
    fields: [
      { name: "date", label: "PO date", type: "date", required: true },
      { name: "supplierId", label: "Supplier", type: "ref", ref: "suppliers", required: true, autofill: (id, _d, s) => ({ paymentTerms: s.byId.suppliers.get(id)?.paymentTerms ?? "" }) },
      { name: "salesOrderId", label: "For sales order", type: "ref", ref: "salesOrders" },
      { name: "supplierRef", label: "Supplier's reference / PI no.", type: "text" },
      { name: "currency", label: "Currency", type: "currency" },
      { name: "paymentTerms", label: "Supplier payment terms", type: "select", list: "paymentTerms" },
      { name: "incoterm", label: "Incoterm", type: "select", list: "incoterms" },
      { name: "orderConfirmed", label: "Order confirmed by supplier", type: "checkbox" },
      { name: "confirmationDate", label: "Confirmation date", type: "date", showIf: (d) => !!d.orderConfirmed },
      { name: "deliveryPeriodDays", label: "Delivery period (days)", type: "number" },
      { name: "shipmentOriginDate", label: "Shipment date (origin)", type: "date" },
      { name: "expectedArrivalDate", label: "Expected arrival", type: "date" },
      { name: "actualArrivalDate", label: "Actual arrival", type: "date" },
      statusField("purchaseOrders"),
      { name: "items", label: "Items & cost", type: "items", wide: true },
      ...followUpFields,
      notes,
    ],
    columns: [
      { key: "serial", label: "PO no.", cell: (r) => t(r.serial) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "supplier", label: "Supplier", cell: (r, s) => t(supplierName(r, s)) },
      { key: "so", label: "Sales order", cell: (r, s) => t(s.byId.salesOrders.get(r.salesOrderId)?.serial) },
      { key: "total", label: "Total cost", align: "right", cell: (r) => money(r.amount, r.currency, r.amountPKR) },
      { key: "terms", label: "Terms", cell: (r) => t(r.paymentTerms) },
      { key: "vendorPayment", label: "Vendor payment", cell: (r, s) => badge(poInfo(r, s).payment) },
      { key: "late", label: "Late", align: "right", cell: (r, s) => { const l = poInfo(r, s).late; return l && l.days ? { text: `${l.days}d${l.overdue ? " overdue" : ""}`, tone: "bad", sort: l.days } : { text: "—", sort: 0 }; } },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
    ],
    filters: [
      statusFilter("purchaseOrders"),
      { key: "supplierId", label: "Supplier", options: (s) => [...new Set(s.suppliers.map((x) => String(x.name)))].sort(), get: (r, s) => supplierName(r, s) },
      productFilter,
      { key: "vendorPayment", label: "Vendor payment", options: () => ["Unpaid", "Partially paid", "Paid"], get: (r, s) => poInfo(r, s).payment },
    ],
  },

  proformaInvoices: {
    col: "proformaInvoices",
    title: "Proforma Invoices",
    singular: "Proforma invoice",
    href: "/proforma-invoices",
    prefix: "PI",
    itemsMode: (d) => (d.type === "From Supplier" ? "cost" : "sale"),
    searchKeys: ["serial", "supplierRef", "notes"],
    defaults: () => ({ ...cur(), type: "To Client", status: "Draft", items: [] }),
    fields: [
      { name: "type", label: "Proforma type", type: "select", options: ["To Client", "From Supplier"], required: true, help: "To Client: issued by you. From Supplier: received from a supplier for payment." },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "clientId", label: "Client", type: "ref", ref: "clients", showIf: (d) => d.type !== "From Supplier" },
      { name: "salesOrderId", label: "Sales order", type: "ref", ref: "salesOrders" },
      { name: "supplierId", label: "Supplier", type: "ref", ref: "suppliers", showIf: (d) => d.type === "From Supplier" },
      { name: "purchaseOrderId", label: "Purchase order", type: "ref", ref: "purchaseOrders", showIf: (d) => d.type === "From Supplier" },
      { name: "supplierRef", label: "Supplier's PI number", type: "text", showIf: (d) => d.type === "From Supplier" },
      { name: "currency", label: "Currency", type: "currency" },
      { name: "paymentTerms", label: "Payment terms", type: "select", list: "paymentTerms" },
      { name: "dueDate", label: "Payment due date", type: "date" },
      { name: "orderConfirmed", label: "Order confirmation received", type: "checkbox" },
      statusField("proformaInvoices"),
      { name: "items", label: "Items", type: "items", wide: true },
      ...followUpFields,
      notes,
    ],
    columns: [
      { key: "serial", label: "PI no.", cell: (r) => t(r.serial) },
      { key: "type", label: "Type", cell: (r) => t(r.type) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "party", label: "Client / supplier", cell: (r, s) => t(r.type === "From Supplier" ? supplierName(r, s) : clientName(r, s)) },
      { key: "total", label: "Amount", align: "right", cell: (r) => money(r.amount, r.currency) },
      { key: "pending", label: "Pending", align: "right", cell: (r, s) => money(piInfo(r, s).pending, r.currency) },
      { key: "status", label: "Status", cell: (r, s) => badge(piInfo(r, s).status) },
    ],
    filters: [
      { key: "type", label: "Type", options: () => ["To Client", "From Supplier"], get: (r) => r.type ?? "" },
      { key: "status", label: "Status", options: () => ["Draft", "Sent", "Partially paid", "Paid", "Cancelled"], get: (r, s) => piInfo(r, s).status },
      clientFilter,
    ],
  },

  payments: {
    col: "payments",
    title: "Payments",
    singular: "Payment",
    href: "/payments",
    prefix: "PAY",
    amountField: "amount",
    searchKeys: ["serial", "reference", "notes"],
    defaults: () => ({ ...cur(), direction: "Received" }),
    fields: [
      { name: "direction", label: "Direction", type: "select", options: ["Received", "Paid"], required: true, help: "Received = payment receipt from a client. Paid = payment to a vendor/supplier." },
      { name: "date", label: "Payment date", type: "date", required: true },
      { name: "clientId", label: "Client", type: "ref", ref: "clients", showIf: (d) => d.direction === "Received" },
      { name: "salesOrderId", label: "Sales order", type: "ref", ref: "salesOrders", showIf: (d) => d.direction === "Received", autofill: (id, _d, s) => ({ clientId: s.byId.salesOrders.get(id)?.clientId }) },
      { name: "supplierId", label: "Supplier", type: "ref", ref: "suppliers", showIf: (d) => d.direction === "Paid" },
      { name: "purchaseOrderId", label: "Purchase order", type: "ref", ref: "purchaseOrders", showIf: (d) => d.direction === "Paid", autofill: (id, _d, s) => ({ supplierId: s.byId.purchaseOrders.get(id)?.supplierId }) },
      { name: "proformaId", label: "Proforma invoice", type: "ref", ref: "proformaInvoices" },
      { name: "amount", label: "Amount", type: "number", required: true },
      { name: "currency", label: "Currency", type: "currency" },
      { name: "paymentType", label: "Payment type", type: "select", list: "paymentTerms" },
      { name: "method", label: "Payment method", type: "select", list: "paymentMethods" },
      { name: "reference", label: "Cheque / transaction / LC no.", type: "text" },
      notes,
    ],
    columns: [
      { key: "serial", label: "No.", cell: (r) => t(r.serial) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "direction", label: "Direction", cell: (r) => ({ text: r.direction === "Paid" ? "Paid to vendor" : "Received", tone: r.direction === "Paid" ? "warn" : "good" }) },
      { key: "party", label: "Client / supplier", cell: (r, s) => t(r.direction === "Paid" ? supplierName(r, s) : clientName(r, s)) },
      { key: "doc", label: "Against", cell: (r, s) => t([s.byId.salesOrders.get(r.salesOrderId)?.serial, s.byId.purchaseOrders.get(r.purchaseOrderId)?.serial, s.byId.proformaInvoices.get(r.proformaId)?.serial].filter(Boolean).join(", ")) },
      { key: "amount", label: "Amount", align: "right", cell: (r) => money(r.amount, r.currency) },
      { key: "pkr", label: "PKR", align: "right", cell: (r) => money(r.amountPKR) },
      { key: "method", label: "Method", cell: (r) => t(r.method) },
    ],
    filters: [
      { key: "direction", label: "Direction", options: () => ["Received", "Paid"], get: (r) => r.direction ?? "" },
      { key: "method", label: "Method", options: (s) => s.settings.paymentMethods, get: (r) => r.method ?? "" },
      { key: "paymentType", label: "Type", options: (s) => s.settings.paymentTerms, get: (r) => r.paymentType ?? "" },
    ],
  },

  deliveries: {
    col: "deliveries",
    title: "Deliveries",
    singular: "Delivery",
    href: "/deliveries",
    prefix: "DN",
    itemsMode: () => "basic",
    searchKeys: ["serial", "deliveryNoteNo", "receivedBy", "notes"],
    defaults: () => ({ date: today(), status: "Pending", items: [] }),
    fields: [
      { name: "date", label: "Dispatch date", type: "date", required: true },
      { name: "salesOrderId", label: "Sales order", type: "ref", ref: "salesOrders", required: true, autofill: (id, _d, s) => { const so = s.byId.salesOrders.get(id); return so ? { clientId: so.clientId, incoterm: so.incoterm ?? "", expectedDeliveryDate: so.expectedDeliveryDate ?? "", shipmentOriginDate: so.shipmentOriginDate ?? "" } : {}; } },
      { name: "clientId", label: "Client", type: "ref", ref: "clients" },
      { name: "purchaseOrderId", label: "Purchase order (supplier)", type: "ref", ref: "purchaseOrders" },
      { name: "incoterm", label: "Incoterm", type: "select", list: "incoterms" },
      { name: "shipmentOriginDate", label: "Shipment date (origin)", type: "date" },
      { name: "expectedDeliveryDate", label: "Expected delivery", type: "date" },
      { name: "deliveredDate", label: "Delivered on", type: "date" },
      { name: "orderConfirmed", label: "Order confirmation / receipt signed", type: "checkbox" },
      { name: "deliveryNoteNo", label: "Delivery note / AWB / BL no.", type: "text" },
      { name: "receivedBy", label: "Received by", type: "text" },
      statusField("deliveries"),
      { name: "items", label: "Items delivered", type: "items", wide: true },
      { name: "feedback", label: "Feedback", type: "textarea", wide: true },
      notes,
    ],
    columns: [
      { key: "serial", label: "Delivery no.", cell: (r) => t(r.serial) },
      { key: "date", label: "Dispatched", cell: (r) => date(r.date) },
      { key: "client", label: "Client", cell: (r, s) => t(clientName(r, s)) },
      { key: "so", label: "Sales order", cell: (r, s) => t(s.byId.salesOrders.get(r.salesOrderId)?.serial) },
      { key: "incoterm", label: "Incoterm", cell: (r) => t(r.incoterm) },
      { key: "delivered", label: "Delivered", cell: (r) => date(r.deliveredDate) },
      { key: "late", label: "Late", align: "right", cell: (r, s) => { const l = deliveryInfo(r, s).late; return l && l.days ? { text: `${l.days}d${l.overdue ? " overdue" : ""}`, tone: "bad", sort: l.days } : { text: "—", sort: 0 }; } },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
    ],
    filters: [statusFilter("deliveries"), clientFilter, { key: "incoterm", label: "Incoterm", options: (s) => s.settings.incoterms, get: (r) => r.incoterm ?? "" }],
  },

  companyDocs: {
    col: "companyDocs",
    title: "Company",
    singular: "Company record",
    href: "/company",
    amountField: "amountValue",
    searchKeys: ["title", "referenceNo", "notes"],
    defaults: () => ({ category: "Prequalification", docStatus: "Valid", currency: "PKR", exchangeRate: 1 }),
    fields: [
      { name: "category", label: "Category", type: "select", list: "companyDocCategories", required: true },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "referenceNo", label: "Reference no.", type: "text" },
      { name: "date", label: "Date / issue date", type: "date" },
      { name: "expiryDate", label: "Expiry date", type: "date" },
      { name: "docStatus", label: "Document status", type: "select", options: ["Valid", "Pending", "Submitted", "Expired", "Not applicable"] },
      { name: "amountValue", label: "Amount paid (taxes, legal expenses)", type: "number", help: "Counted in Profit/Loss and cash flow — don't also enter it under Expenses." },
      { name: "currency", label: "Currency", type: "currency" },
      notes,
    ],
    columns: [
      { key: "category", label: "Category", cell: (r) => t(r.category) },
      { key: "title", label: "Title", cell: (r) => t(r.title) },
      { key: "ref", label: "Ref no.", cell: (r) => t(r.referenceNo) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "expiry", label: "Expiry", cell: (r) => date(r.expiryDate) },
      { key: "amount", label: "Amount", align: "right", cell: (r) => (num(r.amountValue) ? money(r.amountValue, r.currency) : t("")) },
      { key: "docStatus", label: "Status", cell: (r) => badge(companyDocStatus(r)) },
    ],
    filters: [
      { key: "category", label: "Category", options: (s) => s.settings.companyDocCategories, get: (r) => r.category ?? "" },
      { key: "docStatus", label: "Status", options: () => ["Valid", "Expiring soon", "Expired", "Pending", "Submitted", "Not applicable"], get: (r) => companyDocStatus(r) },
    ],
  },

  investors: {
    col: "investors",
    title: "Investors",
    singular: "Investor / finance record",
    href: "/investors",
    amountField: "principal",
    searchKeys: ["name", "bank", "notes"],
    defaults: () => ({ type: "Loan", date: today(), currency: "PKR", exchangeRate: 1, status: "Active" }),
    fields: [
      { name: "type", label: "Type", type: "select", list: "financeTypes", required: true },
      { name: "name", label: "Investor / lender name", type: "text", required: true },
      { name: "bank", label: "Bank", type: "text" },
      { name: "date", label: "Date received", type: "date", required: true },
      { name: "principal", label: "Amount", type: "number", required: true },
      { name: "currency", label: "Currency", type: "currency" },
      { name: "profitRate", label: "Profit / markup rate (%)", type: "number" },
      { name: "dueDate", label: "Maturity / due date", type: "date" },
      { name: "repaid", label: "Amount repaid so far", type: "number" },
      { name: "status", label: "Status", type: "select", options: ["Active", "Repaid", "Closed"] },
      notes,
    ],
    columns: [
      { key: "type", label: "Type", cell: (r) => t(r.type) },
      { key: "name", label: "Name", cell: (r) => t(r.name) },
      { key: "bank", label: "Bank", cell: (r) => t(r.bank) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "amount", label: "Amount", align: "right", cell: (r) => money(r.principal, r.currency) },
      { key: "outstanding", label: "Outstanding", align: "right", cell: (r) => money(num(r.principal) - num(r.repaid), r.currency) },
      { key: "due", label: "Due", cell: (r) => date(r.dueDate) },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
    ],
    filters: [
      { key: "type", label: "Type", options: (s) => s.settings.financeTypes, get: (r) => r.type ?? "" },
      { key: "status", label: "Status", options: () => ["Active", "Repaid", "Closed"], get: (r) => r.status ?? "" },
    ],
  },

  expenses: {
    col: "expenses",
    title: "Expenses / Charity / Zakat",
    singular: "Expense",
    href: "/expenses",
    prefix: "EXP",
    amountField: "amountValue",
    compute: (d) => ({ amountValue: num(d.qty || 1) * num(d.unitCost) }),
    searchKeys: ["serial", "description", "paidTo", "notes"],
    defaults: () => ({ date: today(), kind: "Expense", qty: 1, currency: "PKR", exchangeRate: 1 }),
    fields: [
      { name: "kind", label: "Type", type: "select", options: ["Expense", "Charity", "Zakat"], required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "category", label: "Category", type: "select", list: "expenseCategories", showIf: (d) => d.kind === "Expense" },
      { name: "description", label: "Description", type: "text", required: true, wide: true },
      { name: "qty", label: "Qty", type: "number" },
      { name: "unitCost", label: "Unit cost", type: "number" },
      { name: "currency", label: "Currency", type: "currency" },
      { name: "paidTo", label: "Paid to", type: "text" },
      { name: "method", label: "Payment method", type: "select", list: "paymentMethods" },
      notes,
    ],
    columns: [
      { key: "serial", label: "No.", cell: (r) => t(r.serial) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "kind", label: "Type", cell: (r) => t(r.kind) },
      { key: "category", label: "Category", cell: (r) => t(r.category) },
      { key: "description", label: "Description", cell: (r) => t(r.description) },
      { key: "amount", label: "Amount", align: "right", cell: (r) => money(r.amountValue, r.currency) },
      { key: "pkr", label: "PKR", align: "right", cell: (r) => money(r.amountPKR) },
    ],
    filters: [
      { key: "kind", label: "Type", options: () => ["Expense", "Charity", "Zakat"], get: (r) => r.kind ?? "" },
      { key: "category", label: "Category", options: (s) => s.settings.expenseCategories, get: (r) => r.category ?? "" },
    ],
  },

  financeEntries: {
    col: "financeEntries",
    title: "Account / Finance",
    singular: "Account entry",
    href: "/finance",
    prefix: "ACC",
    amountField: "amountValue",
    compute: (d) => ({ amountValue: num(d.qty || 1) * num(d.unitCost) }),
    searchKeys: ["serial", "description", "notes"],
    defaults: () => ({ date: today(), direction: "Out", qty: 1, currency: "PKR", exchangeRate: 1 }),
    fields: [
      { name: "direction", label: "Direction", type: "select", options: ["In", "Out"], required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "category", label: "Category", type: "select", list: "financeCategories" },
      { name: "description", label: "Description", type: "text", required: true, wide: true },
      { name: "qty", label: "Qty", type: "number" },
      { name: "unitCost", label: "Unit amount", type: "number" },
      { name: "currency", label: "Currency", type: "currency" },
      { name: "method", label: "Payment method", type: "select", list: "paymentMethods" },
      notes,
    ],
    columns: [
      { key: "serial", label: "No.", cell: (r) => t(r.serial) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "direction", label: "In / Out", cell: (r) => ({ text: r.direction, tone: r.direction === "In" ? "good" : "warn" }) },
      { key: "category", label: "Category", cell: (r) => t(r.category) },
      { key: "description", label: "Description", cell: (r) => t(r.description) },
      { key: "pkr", label: "PKR", align: "right", cell: (r) => money(r.amountPKR) },
    ],
    filters: [
      { key: "direction", label: "Direction", options: () => ["In", "Out"], get: (r) => r.direction ?? "" },
      { key: "category", label: "Category", options: (s) => s.settings.financeCategories, get: (r) => r.category ?? "" },
    ],
  },

  schedule: {
    col: "schedule",
    title: "Tasks & Schedule Planner",
    singular: "Task",
    href: "/schedule",
    prefix: "TSK",
    searchKeys: ["title", "project", "serial", "notes", "diaryNotes", "category", "assignedTo", "priority", "horizon"],
    defaults: () => ({
      horizon: "Daily",
      project: "A&SONS WORK",
      date: today(),
      targetMonth: today().slice(0, 7),
      targetYear: today().slice(0, 4),
      time: "09:00",
      category: "Client Follow-up",
      priority: "Medium",
      status: "Pending",
      title: "",
      isMilestone: false,
      isGroup: false,
      assignedTo: "",
      notes: "",
      diaryNotes: "",
    }),
    fields: [
      { name: "title", label: "Subject / Task title", type: "text", required: true, wide: true },
      { name: "horizon", label: "Time Horizon / Scope", type: "select", options: ["Daily", "Monthly", "Yearly / Long-term"], required: true },
      { name: "project", label: "Project", type: "text" },
      { name: "isMilestone", label: "Is Milestone (⭐ Major Long-Term Goal)", type: "checkbox" },
      { name: "isGroup", label: "Is Group / Bucket Task", type: "checkbox" },
      { name: "date", label: "Date / Due Date", type: "date", required: true },
      { name: "targetMonth", label: "Target Month (YYYY-MM)", type: "text", showIf: (d) => d.horizon === "Monthly" },
      { name: "targetYear", label: "Target Year (YYYY)", type: "text", showIf: (d) => d.horizon === "Yearly / Long-term" },
      { name: "time", label: "Time / Scheduled Time", type: "text" },
      { name: "category", label: "Category", type: "select", list: "taskCategories", required: true },
      { name: "priority", label: "Priority", type: "select", list: "taskPriorities", required: true },
      statusField("schedule"),
      { name: "assignedTo", label: "Assigned to / Person responsible", type: "text" },
      { name: "clientId", label: "Linked client", type: "ref", ref: "clients" },
      { name: "supplierId", label: "Linked supplier", type: "ref", ref: "suppliers" },
      { name: "salesOrderId", label: "Linked sales order", type: "ref", ref: "salesOrders" },
      { name: "purchaseOrderId", label: "Linked purchase order", type: "ref", ref: "purchaseOrders" },
      { name: "notes", label: "Task details & outcome", type: "textarea", wide: true },
      { name: "diaryNotes", label: "Daily diary & notes for the day", type: "textarea", wide: true },
    ],
    columns: [
      { key: "serial", label: "ID", cell: (r) => t(r.serial) },
      { key: "title", label: "Subject", cell: (r) => t(r.title) },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
      { key: "project", label: "Project", cell: (r) => t(r.project || "A&SONS WORK") },
      {
        key: "horizon",
        label: "Horizon",
        cell: (r) => {
          const h = r.horizon || (r.targetYear ? "Yearly / Long-term" : r.targetMonth ? "Monthly" : "Daily");
          const tone = h === "Yearly / Long-term" ? "info" : h === "Monthly" ? "warn" : "muted";
          return { text: h, tone };
        },
      },
      {
        key: "priority",
        label: "Priority",
        cell: (r) => {
          const p = (r.priority ?? "").toLowerCase();
          const tone = p === "urgent" ? "bad" : p === "high" ? "warn" : p === "medium" ? "info" : "muted";
          return { text: r.priority || "Medium", tone };
        },
      },
      {
        key: "isMilestone",
        label: "Is Milestone",
        cell: (r) => ({
          text: r.isMilestone ? "⭐ Milestone" : "—",
          tone: r.isMilestone ? "good" : "muted",
        }),
      },
      { key: "isGroup", label: "Is Group", cell: (r) => ({ text: r.isGroup ? "Yes" : "—" }) },
      {
        key: "date",
        label: "Target / Date",
        cell: (r) => {
          if (r.horizon === "Monthly" && r.targetMonth) return { text: r.targetMonth };
          if (r.horizon === "Yearly / Long-term" && r.targetYear) return { text: String(r.targetYear) };
          return date(r.date);
        },
      },
      { key: "time", label: "Time", cell: (r) => t(r.time) },
      { key: "category", label: "Category", cell: (r) => t(r.category) },
      {
        key: "party",
        label: "Client / Supplier",
        cell: (r, s) => t(clientName(r, s) || supplierName(r, s)),
      },
      { key: "assignedTo", label: "Assigned to", cell: (r) => t(r.assignedTo) },
    ],
    filters: [
      statusFilter("schedule"),
      {
        key: "horizon",
        label: "Horizon",
        options: () => ["Daily", "Monthly", "Yearly / Long-term"],
        get: (r) => r.horizon || (r.targetYear ? "Yearly / Long-term" : r.targetMonth ? "Monthly" : "Daily"),
      },
      {
        key: "project",
        label: "Project",
        options: (s) => [...new Set([ ...(s.settings.taskProjects ?? []), ...((s.schedule ?? []).map((x) => x.project).filter(Boolean)) ])].sort(),
        get: (r) => r.project ?? "",
      },
      {
        key: "isMilestone",
        label: "Milestone",
        options: () => ["Milestones Only", "Standard"],
        get: (r) => (r.isMilestone ? "Milestones Only" : "Standard"),
      },
      {
        key: "priority",
        label: "Priority",
        options: (s) => s.settings.taskPriorities,
        get: (r) => r.priority ?? "",
      },
      {
        key: "category",
        label: "Category",
        options: (s) => s.settings.taskCategories,
        get: (r) => r.category ?? "",
      },
      clientFilter,
    ],
  },

  costSheets: {
    col: "costSheets",
    title: "Cost Sheets (Deal Costing)",
    singular: "Cost Sheet",
    href: "/cost-sheets",
    prefix: "CST",
    itemsMode: () => "sale",
    amountField: "totalSale",
    compute: (d) => ({ isCostSheet: true, ...computeCostSheet(d) }),
    searchKeys: ["serial", "title", "notes", "project"],
    defaults: () => ({
      date: today(),
      currency: "PKR",
      exchangeRate: 1,
      purchaseCurrency: "PKR",
      purchaseExchangeRate: 1,
      title: "",
      project: "A&SONS WORK",
      status: "Draft",
      taxMode: "wht",
      whtSaleRate: 4,
      whtImportRate: 0,
      gstOutputRate: 18,
      gstInputRate: 18,
      incomeTaxRate: 29,
      commissionType: "percent_sale",
      commissionRate: 0,
      items: [emptyItem()],
      extraCosts: [],
      commissions: [],
      notes: "",
    }),
    fields: [
      { name: "title", label: "Deal title / Description", type: "text", required: true, wide: true },
      { name: "date", label: "Date", type: "date", required: true },
      statusField("costSheets"),
      { name: "clientId", label: "Client", type: "ref", ref: "clients" },
      { name: "supplierId", label: "Primary Supplier", type: "ref", ref: "suppliers" },
      { name: "rfqId", label: "Linked RFQ", type: "ref", ref: "rfqs" },
      { name: "quotationId", label: "Linked Quotation", type: "ref", ref: "quotations" },
      { name: "salesOrderId", label: "Linked Sales Order", type: "ref", ref: "salesOrders" },
      { name: "project", label: "Project", type: "text" },
      { name: "currency", label: "Sale Currency & Rate", type: "currency" },
      { name: "purchaseCurrency", label: "Purchase Currency", type: "select", list: "currencies" },
      { name: "purchaseExchangeRate", label: "Purchase Rate to PKR", type: "number" },
      { name: "items", label: "Line Items (Sale & Purchase)", type: "items", wide: true },
      { name: "freightAmount", label: "Ocean / Air Freight (PKR)", type: "number" },
      { name: "customsDutyAmount", label: "Customs & Tariffs (PKR)", type: "number" },
      { name: "clearingAmount", label: "C&F Agent Fee (PKR)", type: "number" },
      { name: "portDemurrageAmount", label: "Port Demurrage / Charges (PKR)", type: "number" },
      { name: "insuranceAmount", label: "Marine Insurance (PKR)", type: "number" },
      { name: "bankChargesAmount", label: "Bank LC / TT Fees (PKR)", type: "number" },
      { name: "cartageAmount", label: "Local Cartage & Delivery (PKR)", type: "number" },
      { name: "inspectionAmount", label: "Inspection / Lab (PKR)", type: "number" },
      { name: "otherExpensesAmount", label: "Other Direct Expenses (PKR)", type: "number" },
      { name: "commissionRecipient", label: "Commission Agent / Broker", type: "text" },
      { name: "commissionType", label: "Commission Type", type: "select", options: ["percent_sale", "percent_purchase", "per_unit", "fixed"] },
      { name: "commissionRate", label: "Commission Rate (% or PKR)", type: "number" },
      { name: "taxMode", label: "Tax Regime", type: "select", options: ["wht", "corporate", "both", "none"] },
      { name: "whtSaleRate", label: "WHT Withheld by Client %", type: "number" },
      { name: "whtImportRate", label: "WHT at Import %", type: "number" },
      { name: "gstOutputRate", label: "Sales Tax / GST Output %", type: "number" },
      { name: "gstInputRate", label: "Sales Tax / GST Input %", type: "number" },
      { name: "incomeTaxRate", label: "Corporate Tax Rate on Profit %", type: "number" },
      notes,
    ],
    columns: [
      { key: "serial", label: "No.", cell: (r) => t(r.serial) },
      { key: "title", label: "Deal Title", cell: (r) => t(r.title) },
      { key: "party", label: "Client / Supplier", cell: (r, s) => t(clientName(r, s) || supplierName(r, s)) },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
      { key: "sale", label: "Sale Value", align: "right", cell: (r) => money(r.totalSale || r.amount, r.currency, r.totalSalePKR || r.amountPKR) },
      { key: "cost", label: "Purchase Cost", align: "right", cell: (r) => money(r.totalPurchaseCost, r.purchaseCurrency || r.currency, r.totalPurchaseCostPKR) },
      { key: "expenses", label: "Extra Costs", align: "right", cell: (r) => money(r.totalExtraCostsPKR, "PKR") },
      { key: "commission", label: "Commission", align: "right", cell: (r) => money(r.totalCommissionPKR, "PKR") },
      { key: "tax", label: "Tax to Pay", align: "right", cell: (r) => money(r.totalTaxPayablePKR, "PKR") },
      {
        key: "grossMargin",
        label: "Gross %",
        align: "right",
        cell: (r) => {
          const gm = num(r.grossMarginPct);
          const tone = gm >= 20 ? "good" : gm >= 10 ? "info" : gm > 0 ? "warn" : "bad";
          return { text: fmtPct(gm), tone };
        },
      },
      {
        key: "netProfit",
        label: "Net Profit",
        align: "right",
        cell: (r) => {
          const np = num(r.netProfitPKR ?? r.marginPKR);
          const tone = np > 0 ? "good" : np === 0 ? "muted" : "bad";
          return { text: fmtMoney(np, "PKR"), tone };
        },
      },
      {
        key: "netMargin",
        label: "Net %",
        align: "right",
        cell: (r) => {
          const nm = num(r.netMarginPct);
          const tone = nm >= 12 ? "good" : nm >= 5 ? "info" : nm > 0 ? "warn" : "bad";
          return { text: fmtPct(nm), tone };
        },
      },
    ],
    filters: [
      statusFilter("costSheets"),
      clientFilter,
      {
        key: "project",
        label: "Project",
        options: (s) => [...new Set([ ...(s.settings.taskProjects ?? []), ...((s.costSheets ?? []).map((x) => x.project).filter(Boolean)) ])].sort(),
        get: (r) => r.project ?? "",
      },
      {
        key: "currency",
        label: "Currency",
        options: (s) => s.settings.currencies,
        get: (r) => r.currency ?? "PKR",
      },
    ],
  },
};

export function companyDocStatus(r: Rec): string {
  if (r.expiryDate) {
    const days = (Date.parse(r.expiryDate) - Date.now()) / 86400000;
    if (days < 0) return "Expired";
    if (days <= 30) return "Expiring soon";
  }
  return r.docStatus || "Valid";
}
