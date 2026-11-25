import { computeCostSheet, daysBetween, emptyItem, fmtDate, fmtMoney, fmtNum, fmtPct, itemTotals, num, rateOf, today } from "./calc";
import { computeCalcSheet } from "./calcSheet";
import { bestSupplierPrices, priceLabel, documentClientId, clientInfo, dealLinks, deliveryInfo, paymentInfo, piInfo, poInfo, salesRefOf, shipmentInfo, shipmentOrder, soInfo, supplierInfo, vendorPaymentOf, type Store } from "./derive";
import { contactDate, contactDetails, latestMarketingContact, marketingChannelName, marketingStatus, MARKETING_STATUSES } from "./marketing";
import { STAGES, stageKind } from "./stages";
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
  /** Starts a new titled section on the Details tab. */
  section?: string;
  /** Values copied into the form when this field changes (e.g. client → region, sector). */
  autofill?: (value: string, data: Rec, s: Store) => Partial<Rec>;
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
  if (/(unsuccess|without success|unpaid|inactive)/.test(s)) return "bad";
  if (s === "registered") return "good";
  if (s === "unregistered") return "muted";
  if (s === "in process") return "warn";
  if (/(won|converted|delivered|received|paid$|^paid|closed|approved|valid|active|confirmed|repaid)/.test(s) && !/partially/.test(s)) return "good";
  if (/(lost|cancel|regret|returned|rejected|expired|unpaid|overdue|late)/.test(s)) return "bad";
  if (/(partial|follow|negotiat|pending|due|expiring|costing|transit|shipped)/.test(s)) return "warn";
  if (s === "—" || s === "draft" || s === "lead" || s === "planned" || s === "recorded") return "muted";
  return "info";
}
const badge = (v?: string): Cell => ({ text: v || "—", tone: statusTone(v || "—") });

const clientName = (r: Rec, s: Store) => s.byId.clients.get(documentClientId(r, s))?.name ?? "";
const supplierName = (r: Rec, s: Store) => s.byId.suppliers.get(r.supplierId)?.name ?? "";

export function labelOf(col: CollectionName, r: Rec | undefined, s: Store): string {
  if (!r) return "";
  switch (col) {
    case "clients":
    case "suppliers":
      return r.name ?? "(unnamed)";
    case "marketing":
      return [clientName(r, s) || r.prospectName, r.subject || marketingChannelName(r.channel)].filter(Boolean).join(" · ");
    case "rfqs":
    case "quotations":
    case "salesOrders":
    case "deliveries":
      return [r.serial, clientName(r, s)].filter(Boolean).join(" · ");
    case "shipments":
      return [r.serial, r.trackingNo, clientName(r, s) || supplierName(r, s)].filter(Boolean).join(" · ");
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

const regionFilter: FilterDef = { key: "region", label: "Region", options: (s) => [...new Set([...s.settings.regions, ...s.clients.map(r => r.region), ...s.suppliers.map(r => r.region)].filter(Boolean))].sort(), get: (r) => r.region ?? "" };
const countryFilter: FilterDef = { key: "country", label: "Country", options: (s) => [...new Set([...s.settings.countries, ...s.clients.map(r => r.country), ...s.suppliers.map(r => r.country)].filter(Boolean))].sort(), get: (r) => r.country ?? "" };
const sectorFilter: FilterDef = { key: "sector", label: "Sector", options: (s) => [...new Set([...s.settings.sectors, ...s.clients.map(r => r.sector), ...s.suppliers.map(r => r.sector)].filter(Boolean))].sort(), get: (r) => r.sector ?? "" };
/** A filter listing only the values actually used in this module, so client and supplier lists stay separate. */
const ownValuesFilter = (col: "clients" | "suppliers", key: string, label: string, field = key): FilterDef => ({ key, label, options: (s) => uniq(s[col].map((r) => r[field])).sort((a, b) => a.localeCompare(b)), get: (r) => r[field] ?? "" });
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

// ---------- columns from the client's module sheets ----------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const hasValue = (v: unknown) => v !== undefined && v !== null && v !== "";
const uniq = (xs: unknown[]) => [...new Set(xs.filter(hasValue).map(String))];
const created = (r: Rec): Cell => date(typeof r.createdAt === "string" ? r.createdAt.slice(0, 10) : "");
const itemsText = (r: Rec): Cell => t(uniq((r.items ?? []).map((i: Rec) => i.description || i.product)).join(", "));
const qtyOf = (r: Rec) => (r.items ?? []).reduce((a: number, i: Rec) => a + num(i.qty), 0);
const qtyCell = (r: Rec): Cell => ({ text: fmtNum(qtyOf(r)), sort: qtyOf(r) });
const makersOf = (items?: Rec[]) => uniq((items ?? []).map((i) => i.brand)).join(", ");
const vendorsOf = (items: Rec[] | undefined, s: Store) => uniq((items ?? []).map((i) => s.byId.suppliers.get(i.supplierId)?.name)).join(", ");
const pctCell = (v: unknown): Cell => (hasValue(v) ? { text: fmtPct(v), sort: num(v) } : t(""));
const budgetOC = (r: Rec) => (num(r.amount) * num(r.budgetMarginPct)) / 100;
/** The customer's RFQ number, with the ERP's own number underneath. */
const rfqNo = (r: Rec): Cell => (r.clientRef ? { text: r.clientRef, subtext: r.serial } : t(r.serial));
const lateCell = (l: { days: number; overdue: boolean } | null): Cell =>
  l && l.days ? { text: `${l.days}d${l.overdue ? " overdue" : ""}`, tone: "bad", sort: l.days } : { text: "—", sort: 0 };
/** Open while the status is an open stage; anything else (won, lost, cancelled) is closed. */
const isOpen = (col: CollectionName, r: Rec) => !r.status || stageKind(col, r.status) === "open";
const openClosed = (col: CollectionName, r: Rec): Cell => {
  const open = isOpen(col, r);
  return { text: open ? "Open" : "Closed", subtext: r.status && r.status !== "Open" ? r.status : undefined, tone: open ? "info" : stageKind(col, r.status) === "lost" ? "bad" : "good" };
};
const openClosedFilter = (col: CollectionName): FilterDef => ({ key: "openClosed", label: "Open / closed", options: () => ["Open", "Closed"], get: (r) => (isOpen(col, r) ? "Open" : "Closed") });
const territoryFilter: FilterDef = { key: "territory", label: "Territory", options: (s) => uniq([...s.settings.territories, ...s.rfqs.map((r) => r.territory), ...s.quotations.map((r) => r.territory), ...s.salesOrders.map((r) => r.territory)]).sort(), get: (r) => r.territory ?? "" };
/** The calculation sheet's figures, when one has been filled in. */
function calcOf(r: Rec) {
  const c = r.calcSheet;
  if (!c || !(Object.values(c.rows ?? {}).some(hasValue) || hasValue(c.exWorks) || hasValue(c.saleValue))) return null;
  return computeCalcSheet(c, { exWorks: itemTotals(r.items).totalCost, saleValue: num(r.amount) });
}
/** The module a task was created from, or the planner itself. */
const raisedFrom = (r: Rec) => (r.linkCol ? MODULES[r.linkCol as CollectionName]?.title ?? "" : "Planner");
/** Days a delivered order has waited for the client's payment; "Paid" once settled. */
function paymentAgeing(r: Rec, s: Store): Cell {
  const i = soInfo(r, s);
  if (i.payment === "Paid") return { text: "Paid", tone: "good", sort: -1 };
  const days = i.deliveredDate ? daysBetween(i.deliveredDate, today()) : null;
  if (days == null) return { text: "—", sort: -2 };
  return { text: `${Math.max(0, days)} d`, sort: days, tone: days > 30 ? "bad" : undefined };
}

// ---------- modules ----------
export const MODULES: Record<CollectionName, ModuleConfig> = {
  clients: {
    col: "clients",
    title: "Clients",
    singular: "Client",
    href: "/clients",
    searchKeys: ["name", "contactPerson", "email", "emailCc1", "emailCc2", "phone", "mobile", "details", "jobTitle", "remarks", "address", "country", "headOffice", "plant", "department", "whatsapp"],
    defaults: () => ({ registration: "Unregistered", country: "Pakistan" }),
    fields: [
      { name: "name", label: "Client / company name", type: "text", required: true },
      { name: "jobTitle", label: "Job title", type: "text" },
      { name: "headOffice", label: "Head office", type: "text" },
      { name: "plant", label: "Plant / site", type: "text" },
      { name: "department", label: "Department", type: "select", list: "departments" },
      { name: "whatsapp", label: "WhatsApp", type: "tel" },
      { name: "contactPerson", label: "Contact person", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "emailCc1", label: "Email CC 1", type: "email", help: "Copied on emails to this contact." },
      { name: "emailCc2", label: "Email CC 2", type: "email" },
      { name: "phone", label: "Telephone", type: "tel" },
      { name: "mobile", label: "Cell / mobile", type: "tel" },
      { name: "region", label: "Region", type: "select", list: "regions" },
      { name: "country", label: "Country", type: "select", list: "countries" },
      { name: "sector", label: "Sector", type: "select", list: "sectors" },
      { name: "registration", label: "Registration status", type: "select", options: ["Registered", "Unregistered", "In process"] },
      { name: "registrationNo", label: "Registration / vendor no.", type: "text", showIf: (d) => d.registration !== "Unregistered" },
      { name: "registrationDate", label: "Registration date", type: "date", showIf: (d) => d.registration === "Registered" },
      { name: "address", label: "Address", type: "textarea", wide: true },
      { name: "remarks", label: "Remarks", type: "textarea", wide: true },
      { name: "details", label: "Client details", type: "textarea", wide: true },
    ],
    columns: [
      { key: "region", label: "Region", cell: (r) => t(r.region) },
      { key: "country", label: "Country", cell: (r) => t(r.country) },
      { key: "sector", label: "Sector", cell: (r) => t(r.sector) },
      { key: "name", label: "Company", cell: (r) => t(r.name) },
      { key: "address", label: "Address", cell: (r) => t(r.address) },
      { key: "headOffice", label: "Head office", cell: (r) => t(r.headOffice) },
      { key: "plant", label: "Plant / site", cell: (r) => t(r.plant) },
      { key: "department", label: "Department", cell: (r) => t(r.department) },
      { key: "contactPerson", label: "Person", cell: (r) => t(r.contactPerson) },
      { key: "jobTitle", label: "Job title", cell: (r) => t(r.jobTitle) },
      { key: "email", label: "Email", cell: (r) => t(r.email) },
      { key: "emailCc1", label: "Email CC 1", cell: (r) => t(r.emailCc1) },
      { key: "emailCc2", label: "Email CC 2", cell: (r) => t(r.emailCc2) },
      { key: "mobile", label: "Cell / mobile", cell: (r) => t(r.mobile) },
      { key: "whatsapp", label: "WhatsApp", cell: (r) => t(r.whatsapp) },
      { key: "phone", label: "Telephone", cell: (r) => t(r.phone) },
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
      { key: "remarks", label: "Remarks", cell: (r) => t(r.remarks || r.details) },
    ],
    filters: [
      ownValuesFilter("clients", "company", "Company", "name"),
      ownValuesFilter("clients", "headOffice", "Head office (H.O)"),
      ownValuesFilter("clients", "plant", "Plant / site"),
      { key: "department", label: "Department", options: (s) => uniq([...s.settings.departments, ...s.clients.map((c) => c.department)]).sort((a, b) => a.localeCompare(b)), get: (r) => r.department ?? "" },
      ownValuesFilter("clients", "region", "Client region"),
      ownValuesFilter("clients", "country", "Client country"),
      ownValuesFilter("clients", "sector", "Client sector"),
      { key: "registration", label: "Registration", options: () => ["Registered", "Unregistered", "In process"], get: (r) => r.registration ?? "" },
      { key: "lifecycle", label: "Stage", options: () => ["Lead", "Inquiry received", "Offer given", "Order received", "Delivered"], get: (r, s) => clientInfo(r, s).lifecycle },
      ...(['rfqStage', 'quotationStage', 'poStage'] as const).map((key) => ({ key, label: key === 'rfqStage' ? 'RFQ stage' : key === 'quotationStage' ? 'Quotation stage' : 'PO stage', options: (s: Store) => [...new Set(s.clients.map((c) => clientInfo(c, s)[key]))].sort(), get: (r: Rec, s: Store) => clientInfo(r, s)[key] })),
      { key: "active", label: "Activity", options: () => ["Active", "Inactive"], get: (r, s) => (clientInfo(r, s).active ? "Active" : "Inactive") },
      { key: "paymentStage", label: "Payment", options: () => ["Unpaid", "Partially paid", "Paid", "—"], get: (r, s) => clientInfo(r, s).paymentStage },
    ],
  },

  suppliers: {
    col: "suppliers",
    title: "Suppliers",
    singular: "Supplier",
    href: "/suppliers",
    searchKeys: ["name", "contactPerson", "email", "emailCc1", "emailCc2", "phone", "mobile", "details", "jobTitle", "remarks", "address", "country", "whatsapp"],
    defaults: () => ({ brands: [], products: [] }),
    fields: [
      { name: "name", label: "Supplier name", type: "text", required: true },
      { name: "nature", label: "Vendor nature", type: "select", list: "vendorNatures", help: "Manufacturer, distributor, trader, agent…" },
      { name: "jobTitle", label: "Job title", type: "text" },
      { name: "whatsapp", label: "WhatsApp", type: "tel" },
      { name: "contactPerson", label: "Contact person", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "emailCc1", label: "Email CC 1", type: "email", help: "Copied on emails to this contact." },
      { name: "emailCc2", label: "Email CC 2", type: "email" },
      { name: "phone", label: "Telephone", type: "tel" },
      { name: "mobile", label: "Cell / mobile", type: "tel" },
      { name: "region", label: "Region", type: "select", list: "regions" },
      { name: "country", label: "Country", type: "select", list: "countries" },
      { name: "paymentTerms", label: "Usual payment terms", type: "select", list: "paymentTerms" },
      { name: "brands", label: "Brands", type: "multiselect", list: "brands", wide: true },
      { name: "products", label: "Products", type: "multiselect", list: "products", wide: true },
      { name: "address", label: "Address", type: "textarea", wide: true },
      { name: "remarks", label: "Remarks", type: "textarea", wide: true },
      { name: "details", label: "Supplier details", type: "textarea", wide: true },
    ],
    columns: [
      { key: "region", label: "Region", cell: (r) => t(r.region) },
      { key: "country", label: "Country", cell: (r) => t(r.country) },
      { key: "name", label: "Company", cell: (r) => t(r.name) },
      { key: "address", label: "Address", cell: (r) => t(r.address) },
      { key: "contactPerson", label: "Person", cell: (r) => t(r.contactPerson) },
      { key: "jobTitle", label: "Job title", cell: (r) => t(r.jobTitle) },
      { key: "email", label: "Email", cell: (r) => t(r.email) },
      { key: "emailCc1", label: "Email CC 1", cell: (r) => t(r.emailCc1) },
      { key: "emailCc2", label: "Email CC 2", cell: (r) => t(r.emailCc2) },
      { key: "mobile", label: "Cell / mobile", cell: (r) => t(r.mobile) },
      { key: "whatsapp", label: "WhatsApp", cell: (r) => t(r.whatsapp) },
      { key: "phone", label: "Telephone", cell: (r) => t(r.phone) },
      { key: "nature", label: "Vendor nature", cell: (r) => t(r.nature) },
      { key: "brands", label: "Brands", cell: (r) => t((r.brands ?? []).join(", ")) },
      { key: "products", label: "Products", cell: (r) => t((r.products ?? []).join(", ")) },
      { key: "purchased", label: "Purchased", align: "right", cell: (r, s) => money(supplierInfo(r, s).purchasedPKR) },
      { key: "payable", label: "Payable", align: "right", cell: (r, s) => money(supplierInfo(r, s).payablePKR) },
      { key: "remarks", label: "Remarks", cell: (r) => t(r.remarks || r.details) },
    ],
    filters: [
      ownValuesFilter("suppliers", "region", "Supplier region"),
      ownValuesFilter("suppliers", "country", "Supplier country"),
      { key: "product", label: "Product", options: (s) => s.settings.products, get: (r) => r.products ?? [] },
      { key: "brand", label: "Brand", options: (s) => s.settings.brands, get: (r) => r.brands ?? [] },
      { key: "bestPrice", label: "Best price for product / brand", options: (s) => [...new Set(bestSupplierPrices(s).map(priceLabel))].sort(), get: (r, s) => bestSupplierPrices(s).filter((p) => p.supplierId === r.id).map(priceLabel) },
    ],
  },

  marketing: {
    col: "marketing",
    title: "Marketing",
    singular: "Marketing activity",
    href: "/marketing",
    searchKeys: ["prospectName", "subject", "notes", "product", "status", "lastContactDetails", "response", "campaignGroup"],
    defaults: () => ({ date: today(), channel: "Email", status: "Planned", response: "No response" }),
    fields: [
      { name: "date", label: "Activity date", type: "date", required: true },
      { name: "channel", label: "Channel", type: "select", list: "marketingChannels", required: true },
      { name: "clientId", label: "Client", type: "ref", ref: "clients", required: true, help: "Select the client from your client list." },
      { name: "prospectName", label: "Legacy prospect name", type: "text", showIf: (d) => !d.clientId && !!d.prospectName },
      { name: "status", label: "Activity status", type: "select", options: MARKETING_STATUSES, required: true },
      { name: "lastContactDate", label: "Last contact date", type: "date" },
      { name: "lastContactDetails", label: "Last contact details", type: "textarea", wide: true, help: "What was emailed, discussed on WhatsApp or said on the call?" },
      { name: "product", label: "Product advertised", type: "select", list: "products" },
      { name: "subject", label: "Subject / campaign", type: "text" },
      { name: "response", label: "Client response", type: "select", list: "marketingResponses" },
      { name: "nextFollowUpDate", label: "Next follow-up", type: "date" },
      notes,
    ],
    columns: [
      { key: "who", label: "Client", cell: (r, s) => t(clientName(r, s) || r.prospectName) },
      { key: "date", label: "Activity date", cell: (r) => date(r.date) },
      { key: "region", label: "Region", cell: (r, s) => t(s.byId.clients.get(r.clientId)?.region) },
      { key: "sector", label: "Sector", cell: (r, s) => t(s.byId.clients.get(r.clientId)?.sector) },
      { key: "clientEmail", label: "Email", cell: (r, s) => t(s.byId.clients.get(r.clientId)?.email) },
      { key: "clientWhatsapp", label: "WhatsApp", cell: (r, s) => { const c = s.byId.clients.get(r.clientId); return t(c?.whatsapp || c?.mobile); } },
      { key: "campaignGroup", label: "Campaign group", cell: (r) => t(r.campaignGroup) },
      { key: "status", label: "Status", cell: (r) => badge(marketingStatus(r)) },
      { key: "lastContactDate", label: "Last contact", cell: (r,s) => { const last = latestMarketingContact(r,s.marketing); return date(last ? contactDate(last) : ''); } },
      { key: "lastContactDetails", label: "Last contact details", cell: (r,s) => { const last = latestMarketingContact(r,s.marketing); return t(last ? [marketingChannelName(last.channel), contactDetails(last)].filter(Boolean).join(' · ') : ''); } },
      { key: "nextFollowUpDate", label: "Next follow-up", cell: (r) => ({ ...date(r.nextFollowUpDate), tone: marketingStatus(r) !== 'Closed' && r.nextFollowUpDate && r.nextFollowUpDate <= today() ? (r.nextFollowUpDate < today() ? 'bad' : 'warn') : undefined }) },
      { key: "response", label: "Response", cell: (r) => badge(r.response) },
      { key: "channel", label: "Channel", cell: (r) => t(marketingChannelName(r.channel)) },
      { key: "product", label: "Product", cell: (r) => t(r.product) },
      { key: "subject", label: "Subject", cell: (r) => t(r.subject) },
      { key: "activity", label: "Client activity", cell: (r, s) => { const c = s.byId.clients.get(r.clientId); return c ? badge(clientInfo(c, s).active ? 'Active' : 'Inactive') : t('Prospect'); } },
      { key: "inactiveDays", label: "Inactive days", align: "right", cell: (r, s) => { const c = s.byId.clients.get(r.clientId); const days = c ? clientInfo(c, s).inactiveDays : null; return { text: days == null ? '—' : String(days), sort: days ?? -1 }; } },
    ],
    filters: [
      clientFilter,
      { key: "region", label: "Region", options: (s) => uniq(s.clients.map((c) => c.region)).sort(), get: (r, s) => s.byId.clients.get(r.clientId)?.region ?? "" },
      { key: "sector", label: "Sector", options: (s) => uniq(s.clients.map((c) => c.sector)).sort(), get: (r, s) => s.byId.clients.get(r.clientId)?.sector ?? "" },
      { key: "campaignGroup", label: "Campaign group", options: (s) => uniq(s.marketing.map((m) => m.campaignGroup)).sort(), get: (r) => r.campaignGroup ?? "" },
      { key: "status", label: "Activity status", options: () => MARKETING_STATUSES, get: marketingStatus },
      { key: "activity", label: "Client activity", options: () => ['Active', 'Inactive', 'Prospect'], get: (r, s) => { const c = s.byId.clients.get(r.clientId); return c ? (clientInfo(c, s).active ? 'Active' : 'Inactive') : 'Prospect'; } },
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
    searchKeys: ["serial", "clientRef", "salesRef", "territory", "notes"],
    defaults: () => ({ date: today(), status: "Open", items: [] }),
    fields: [
      { name: "date", label: "RFQ date", type: "date", required: true, section: "Inquiry" },
      { name: "clientId", label: "Customer", type: "ref", ref: "clients", required: true, autofill: fromClient },
      { name: "clientRef", label: "Customer's RFQ / tender no.", type: "text" },
      { name: "dueDate", label: "Closing date (submission due)", type: "date" },
      statusField("rfqs"),
      { name: "region", label: "Region", type: "select", list: "regions", section: "Sales tracking" },
      { name: "territory", label: "Territory", type: "select", list: "territories" },
      { name: "sector", label: "Sector", type: "select", list: "sectors" },
      { name: "salesRef", label: "Sale dept. ref.", type: "text", help: "Your sales department's reference. It follows the deal to the offer, sales order and PO." },
      { name: "totalWeight", label: "Total weight", type: "text", help: "e.g. 1,250 kg" },
      { name: "items", label: "Items requested", type: "items", wide: true },
      { ...notes, label: "Remarks", section: "Remarks" },
    ],
    // Arranged as in the client's "RFQ Module" sheet.
    columns: [
      { key: "created", label: "Creation date", cell: created },
      { key: "region", label: "Region", cell: (r) => t(r.region) },
      { key: "territory", label: "Territory", cell: (r) => t(r.territory) },
      { key: "sector", label: "Sector", cell: (r) => t(r.sector) },
      { key: "client", label: "Customer", cell: (r, s) => t(clientName(r, s)) },
      { key: "rfqNo", label: "RFQ no.", cell: (r) => rfqNo(r) },
      { key: "date", label: "RFQ date", cell: (r) => date(r.date) },
      { key: "description", label: "Description", cell: itemsText },
      { key: "totalWeight", label: "Total weight", cell: (r) => t(r.totalWeight) },
      { key: "qty", label: "Qty", align: "right", cell: qtyCell },
      { key: "salesRef", label: "Sale dept. ref.", cell: (r) => t(r.salesRef) },
      { key: "openClosed", label: "Status (open / close)", cell: (r) => openClosed("rfqs", r) },
      { key: "dueDate", label: "Closing date", cell: (r) => date(r.dueDate) },
      { key: "remarks", label: "Remarks", cell: (r) => t(r.notes) },
    ],
    filters: [openClosedFilter("rfqs"), statusFilter("rfqs"), clientFilter, regionFilter, territoryFilter, sectorFilter, productFilter],
  },

  quotations: {
    col: "quotations",
    title: "Quotations",
    singular: "Quotation",
    href: "/quotations",
    prefix: "QT",
    itemsMode: () => "sale",
    searchKeys: ["serial", "salesRef", "territory", "origin", "statusRemarks", "notes", "feedback"],
    defaults: () => ({ ...cur(), status: "Draft", items: [] }),
    fields: [
      { name: "date", label: "Offer date", type: "date", required: true, section: "Offer" },
      { name: "clientId", label: "Customer", type: "ref", ref: "clients", required: true, autofill: fromClient },
      { name: "rfqId", label: "From RFQ", type: "ref", ref: "rfqs" },
      { name: "validUntil", label: "Valid until", type: "date" },
      statusField("quotations"),
      { name: "statusRemarks", label: "Status remarks", type: "text" },
      { name: "region", label: "Region", type: "select", list: "regions", section: "Sales tracking" },
      { name: "territory", label: "Territory", type: "select", list: "territories" },
      { name: "sector", label: "Sector", type: "select", list: "sectors" },
      { name: "salesRef", label: "Sales ref.", type: "text", help: "Carried over from the RFQ; it follows the deal to the sales order and PO." },
      { name: "currency", label: "Currency", type: "currency", section: "Terms & margin" },
      { name: "paymentTerms", label: "Payment terms", type: "select", list: "paymentTerms" },
      { name: "incoterm", label: "Incoterm", type: "select", list: "incoterms" },
      { name: "origin", label: "Origin", type: "select", list: "countries", help: "Country the goods are made in." },
      { name: "budgetMarginPct", label: "Budget margin (%)", type: "number", help: "The margin budgeted for this offer. Shown as an amount in the offer currency (OC) and in PKR at the exchange rate (SER)." },
      { name: "items", label: "Items, costing & offered price", type: "items", wide: true },
      { ...followUpFields[0], section: "Follow-up" },
      ...followUpFields.slice(1),
      notes,
    ],
    // Arranged as in the client's "Offer Module" sheet; the last three are the ERP's own.
    columns: [
      { key: "created", label: "Creation date", cell: created },
      { key: "region", label: "Region", cell: (r) => t(r.region) },
      { key: "territory", label: "Territory", cell: (r) => t(r.territory) },
      { key: "sector", label: "Sector", cell: (r) => t(r.sector) },
      { key: "client", label: "Customer", cell: (r, s) => t(clientName(r, s)) },
      { key: "salesRef", label: "Sales ref.", cell: (r, s) => t(salesRefOf("quotations", r, s)) },
      { key: "rfqRef", label: "RFQ ref. no.", cell: (r, s) => { const q = s.byId.rfqs.get(r.rfqId); return q ? rfqNo(q) : t(""); } },
      { key: "rfqDate", label: "RFQ date", cell: (r, s) => date(s.byId.rfqs.get(r.rfqId)?.date) },
      { key: "serial", label: "Offer no.", cell: (r) => t(r.serial) },
      { key: "date", label: "Offer date", cell: (r) => date(r.date) },
      { key: "incoterm", label: "Incoterm", cell: (r) => t(r.incoterm) },
      { key: "paymentTerms", label: "Payment term", cell: (r) => t(r.paymentTerms) },
      { key: "fob", label: "Total FOB value", align: "right", cell: (r) => { const c = calcOf(r); return c ? money(c.fobValue, r.currency) : t(""); } },
      { key: "cfr", label: "Total CFR value", align: "right", cell: (r) => { const c = calcOf(r); return c ? money(c.cfrValue, r.currency) : t(""); } },
      { key: "budgetMargin", label: "Budget margin", align: "right", cell: (r) => pctCell(r.budgetMarginPct) },
      { key: "budgetMarginOC", label: "Budget margin (OC)", align: "right", cell: (r) => (hasValue(r.budgetMarginPct) ? money(budgetOC(r), r.currency) : t("")) },
      { key: "budgetMarginSER", label: "Budget margin (SER)", align: "right", cell: (r) => (hasValue(r.budgetMarginPct) ? money(budgetOC(r) * rateOf(r)) : t("")) },
      { key: "currency", label: "Currency", cell: (r) => t(r.currency) },
      { key: "margin", label: "Margin", align: "right", cell: (r) => { const c = calcOf(r); const v = c ? c.netMargin : num(r.margin); const p = c ? c.netMarginPct : num(r.netMarginPct ?? r.marginPct); return { ...money(v, r.currency), subtext: fmtPct(p) }; } },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
      { key: "vendor", label: "Vendor", cell: (r, s) => t(vendorsOf(r.items, s)) },
      { key: "company", label: "Company", cell: (r) => t(makersOf(r.items)) },
      { key: "origin", label: "Origin", cell: (r) => t(r.origin) },
      { key: "statusRemarks", label: "Status remarks", cell: (r) => t(r.statusRemarks) },
      { key: "total", label: "Total price", align: "right", cell: (r) => money(r.amount, r.currency, r.amountPKR) },
      {
        key: "netMarginPct",
        label: "Net margin %",
        align: "right",
        cell: (r) => {
          const val = r.netMarginPct !== undefined ? r.netMarginPct : r.marginPct;
          return { text: fmtPct(val), sort: num(val), tone: num(val) >= 15 ? "good" : num(val) <= 0 ? "bad" : "muted" };
        },
      },
      { key: "followUp", label: "Follow-up", cell: (r) => badge(r.followUpStatus) },
    ],
    filters: [statusFilter("quotations"), clientFilter, regionFilter, territoryFilter, sectorFilter, productFilter, { key: "followUpStatus", label: "Follow-up", options: (s) => s.settings.followUpStatuses, get: (r) => r.followUpStatus ?? "" }],
  },

  salesOrders: {
    col: "salesOrders",
    title: "Sales Orders",
    singular: "Sales order",
    href: "/sales-orders",
    prefix: "SO",
    itemsMode: () => "sale",
    searchKeys: ["serial", "clientPoNo", "salesRef", "territory", "department", "notes"],
    defaults: () => ({ ...cur(), status: "Open", items: [] }),
    // Target year / month default to the order date; a closed order records when it closed.
    compute: (d) => ({
      ...(!d.targetYear && d.date ? { targetYear: Number(String(d.date).slice(0, 4)) } : {}),
      ...(!d.targetMonth && d.date ? { targetMonth: MONTHS[Number(String(d.date).slice(5, 7)) - 1] ?? "" } : {}),
      ...(d.status && stageKind("salesOrders", d.status) !== "open" && !d.closingDate ? { closingDate: today() } : {}),
    }),
    fields: [
      { name: "date", label: "Sale order date", type: "date", required: true, section: "Order" },
      { name: "clientId", label: "Customer", type: "ref", ref: "clients", required: true, autofill: fromClient },
      { name: "department", label: "Department", type: "select", list: "departments", help: "The customer's department placing the order." },
      { name: "quotationId", label: "From quotation (offer)", type: "ref", ref: "quotations" },
      { name: "clientPoNo", label: "Client's PO number", type: "text" },
      { name: "clientPoDate", label: "Client's PO date", type: "date" },
      statusField("salesOrders"),
      { name: "closingDate", label: "Closing date", type: "date", help: "Filled in when the order is delivered, closed or cancelled." },
      { name: "region", label: "Region", type: "select", list: "regions", section: "Sales tracking" },
      { name: "territory", label: "Territory", type: "select", list: "territories" },
      { name: "sector", label: "Sector", type: "select", list: "sectors" },
      { name: "salesRef", label: "Sale dept. ref.", type: "text" },
      { name: "targetYear", label: "Target year", type: "number", help: "Sales target this order counts toward. Defaults to the order date." },
      { name: "targetMonth", label: "Target month", type: "select", options: MONTHS },
      { name: "budgetMarginPct", label: "Budget margin (%)", type: "number" },
      { name: "currency", label: "S/O currency", type: "currency", section: "Terms & delivery" },
      { name: "paymentTerms", label: "Client payment terms", type: "select", list: "paymentTerms" },
      { name: "incoterm", label: "Incoterm", type: "select", list: "incoterms" },
      { name: "shipmentOriginDate", label: "Shipment date (origin)", type: "date" },
      { name: "expectedDeliveryDate", label: "Delivery date (promised)", type: "date" },
      { name: "lcShipmentDate", label: "LC shipment date", type: "date" },
      { name: "warranty", label: "Warranty", type: "text", help: "e.g. 12 months from delivery" },
      { name: "totalWeight", label: "Total weight", type: "text" },
      { name: "items", label: "Items", type: "items", wide: true },
      { ...followUpFields[0], section: "Follow-up" },
      ...followUpFields.slice(1),
      { ...notes, label: "Remarks" },
    ],
    // Arranged as in the client's sheet (the block of S/O fields); the last three are the ERP's own.
    columns: [
      { key: "created", label: "Creation date", cell: created },
      { key: "region", label: "Region", cell: (r) => t(r.region) },
      { key: "territory", label: "Territory", cell: (r) => t(r.territory) },
      { key: "sector", label: "Sector", cell: (r) => t(r.sector) },
      { key: "client", label: "Customer", cell: (r, s) => t(clientName(r, s)) },
      { key: "rfqNo", label: "RFQ no.", cell: (r, s) => { const q = dealLinks("salesOrders", r, s).rfq; return q ? rfqNo(q) : t(""); } },
      { key: "rfqDate", label: "RFQ date", cell: (r, s) => date(dealLinks("salesOrders", r, s).rfq?.date) },
      { key: "description", label: "Description", cell: itemsText },
      { key: "totalWeight", label: "Total weight", cell: (r, s) => t(r.totalWeight || dealLinks("salesOrders", r, s).rfq?.totalWeight) },
      { key: "qty", label: "Qty", align: "right", cell: qtyCell },
      { key: "salesRef", label: "Sale dept. ref.", cell: (r, s) => t(salesRefOf("salesOrders", r, s)) },
      { key: "openClosed", label: "Status (open / close)", cell: (r) => openClosed("salesOrders", r) },
      { key: "closingDate", label: "Closing date", cell: (r) => date(r.closingDate) },
      { key: "remarks", label: "Remarks", cell: (r) => t(r.notes) },
      { key: "department", label: "Department", cell: (r) => t(r.department) },
      { key: "total", label: "S/O amount", align: "right", cell: (r) => money(r.amount, r.currency, r.amountPKR) },
      { key: "expectedDeliveryDate", label: "Delivery date", cell: (r) => date(r.expectedDeliveryDate) },
      { key: "paymentAgeing", label: "Payment due ageing", align: "right", cell: (r, s) => paymentAgeing(r, s) },
      { key: "serial", label: "S/O ref. no.", cell: (r) => ({ text: r.serial || "—", subtext: r.clientPoNo ? `Client PO ${r.clientPoNo}` : undefined }) },
      { key: "budgetMargin", label: "Budget margin", align: "right", cell: (r) => pctCell(r.budgetMarginPct) },
      { key: "paymentTerms", label: "Payment term", cell: (r) => t(r.paymentTerms) },
      { key: "incoterm", label: "Incoterm", cell: (r) => t(r.incoterm) },
      { key: "currency", label: "S/O currency", cell: (r) => t(r.currency) },
      { key: "deliveryFinal", label: "S/O delivery final", cell: (r, s) => date(soInfo(r, s).deliveredDate) },
      { key: "lcShipmentDate", label: "LC shipment date", cell: (r) => date(r.lcShipmentDate) },
      { key: "offerRef", label: "Offer ref. no.", cell: (r, s) => t(s.byId.quotations.get(r.quotationId)?.serial) },
      { key: "date", label: "Sale order date", cell: (r) => date(r.date) },
      { key: "targetYear", label: "Target year", cell: (r) => t(r.targetYear || String(r.date ?? "").slice(0, 4)) },
      { key: "targetMonth", label: "Target month", cell: (r) => t(r.targetMonth || (r.date ? MONTHS[Number(String(r.date).slice(5, 7)) - 1] : "")) },
      { key: "late", label: "S/O delivery ageing", align: "right", cell: (r, s) => lateCell(soInfo(r, s).late) },
      { key: "maker", label: "Maker", cell: (r) => t(makersOf(r.items)) },
      { key: "vendor", label: "Vendor", cell: (r, s) => { const i = soInfo(r, s); return t(i.suppliers.join(", ") || vendorsOf(r.items, s)); } },
      { key: "vendorPayment", label: "Vendor payment status", cell: (r, s) => badge(vendorPaymentOf(r, s)) },
      { key: "marginPct", label: "Margin %", align: "right", cell: (r) => ({ text: fmtPct(r.marginPct), sort: num(r.marginPct) }) },
      { key: "payment", label: "Client payment", cell: (r, s) => badge(soInfo(r, s).payment) },
      { key: "warranty", label: "Warranty", cell: (r) => t(r.warranty) },
    ],
    filters: [openClosedFilter("salesOrders"), statusFilter("salesOrders"), clientFilter, regionFilter, territoryFilter, sectorFilter, productFilter, { key: "payment", label: "Client payment", options: () => ["Unpaid", "Partially paid", "Paid"], get: (r, s) => soInfo(r, s).payment }, { key: "vendorPayment", label: "Vendor payment", options: () => ["No PO", "Unpaid", "Partially paid", "Paid"], get: (r, s) => vendorPaymentOf(r, s) }],
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
      { name: "date", label: "P/O date", type: "date", required: true, section: "Purchase order" },
      { name: "supplierId", label: "Vendor (supplier)", type: "ref", ref: "suppliers", required: true, autofill: (id, _d, s) => ({ paymentTerms: s.byId.suppliers.get(id)?.paymentTerms ?? "" }) },
      { name: "salesOrderId", label: "For sales order", type: "ref", ref: "salesOrders" },
      { name: "supplierRef", label: "Supplier's reference / PI no.", type: "text" },
      statusField("purchaseOrders"),
      { name: "currency", label: "Currency", type: "currency", section: "Terms" },
      { name: "paymentTerms", label: "P/O payment terms", type: "select", list: "paymentTerms" },
      { name: "incoterm", label: "Incoterm", type: "select", list: "incoterms" },
      { name: "orderConfirmed", label: "Order confirmed by supplier", type: "checkbox", section: "Delivery" },
      { name: "confirmationDate", label: "Confirmation date", type: "date", showIf: (d) => !!d.orderConfirmed },
      { name: "deliveryPeriodDays", label: "Delivery period (days)", type: "number" },
      { name: "shipmentOriginDate", label: "Shipment date (origin)", type: "date" },
      { name: "expectedArrivalDate", label: "P/O delivery date (expected arrival)", type: "date" },
      { name: "actualArrivalDate", label: "Actual arrival", type: "date" },
      { name: "items", label: "Items & cost", type: "items", wide: true },
      { ...followUpFields[0], section: "Follow-up" },
      ...followUpFields.slice(1),
      notes,
    ],
    // Arranged as in the client's "P/O To Supplier Module" sheet; the last three are the ERP's own.
    columns: [
      { key: "created", label: "Creation date", cell: created },
      { key: "vendorName", label: "Vendor name", cell: (r, s) => t(s.byId.suppliers.get(r.supplierId)?.contactPerson) },
      { key: "description", label: "Description", cell: itemsText },
      { key: "supplier", label: "Vendor company", cell: (r, s) => t(supplierName(r, s)) },
      { key: "so", label: "SO ref. no.", cell: (r, s) => t(s.byId.salesOrders.get(r.salesOrderId)?.serial) },
      { key: "salesRef", label: "Sales ref. no.", cell: (r, s) => t(salesRefOf("purchaseOrders", r, s)) },
      { key: "paidAdvance", label: "Paid advance (OC)", align: "right", cell: (r, s) => money(poInfo(r, s).paid, r.currency) },
      { key: "terms", label: "P/O payment term", cell: (r) => t(r.paymentTerms) },
      { key: "vendorPayment", label: "Vendor payment status", cell: (r, s) => badge(poInfo(r, s).payment) },
      { key: "soMaker", label: "S/O maker", cell: (r, s) => t(makersOf(s.byId.salesOrders.get(r.salesOrderId)?.items) || makersOf(r.items)) },
      { key: "soWarranty", label: "S/O warranty", cell: (r, s) => t(s.byId.salesOrders.get(r.salesOrderId)?.warranty) },
      { key: "soLate", label: "S/O delivery date ageing", align: "right", cell: (r, s) => { const so = s.byId.salesOrders.get(r.salesOrderId); return so ? lateCell(soInfo(so, s).late) : t(""); } },
      { key: "shipmentOriginDate", label: "Shipment date", cell: (r) => date(r.shipmentOriginDate) },
      { key: "serial", label: "P/O no.", cell: (r) => t(r.serial) },
      { key: "date", label: "P/O date", cell: (r) => date(r.date) },
      { key: "expectedArrivalDate", label: "P/O delivery date", cell: (r) => date(r.expectedArrivalDate) },
      { key: "soDelivery", label: "S/O delivery date", cell: (r, s) => date(s.byId.salesOrders.get(r.salesOrderId)?.expectedDeliveryDate) },
      { key: "vendorNature", label: "Vendor nature", cell: (r, s) => t(s.byId.suppliers.get(r.supplierId)?.nature) },
      { key: "soDate", label: "S/O date", cell: (r, s) => date(s.byId.salesOrders.get(r.salesOrderId)?.date) },
      { key: "total", label: "Total cost", align: "right", cell: (r) => money(r.amount, r.currency, r.amountPKR) },
      { key: "late", label: "P/O late", align: "right", cell: (r, s) => lateCell(poInfo(r, s).late) },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
    ],
    filters: [
      statusFilter("purchaseOrders"),
      clientFilter,
      { key: "supplierId", label: "Vendor", options: (s) => [...new Set(s.suppliers.map((x) => String(x.name)))].sort(), get: (r, s) => supplierName(r, s) },
      { key: "vendorNature", label: "Vendor nature", options: (s) => s.settings.vendorNatures, get: (r, s) => s.byId.suppliers.get(r.supplierId)?.nature ?? "" },
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
    searchKeys: ["serial", "reference", "notes", "bankName", "accountNumber", "accountTitle", "beneficiaryBank", "beneficiaryAccount"],
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
      { name: "bankName", label: "Our bank", type: "select", list: "banks", section: "Bank account & fees", help: "Your bank the money went through." },
      { name: "accountTitle", label: "Our account title", type: "text" },
      { name: "accountNumber", label: "Our account number / IBAN", type: "text" },
      { name: "bankFees", label: "Bank fees / charges", type: "number", help: "In the payment currency. Counted as a bank expense, not as payment to the supplier." },
      { name: "beneficiaryBank", label: "Supplier's bank", type: "text", showIf: (d) => d.direction === "Paid" },
      { name: "beneficiaryAccount", label: "Supplier's account / IBAN", type: "text", showIf: (d) => d.direction === "Paid" },
      { ...notes, section: "Notes" },
    ],
    columns: [
      { key: "serial", label: "No.", cell: (r) => t(r.serial) },
      { key: "date", label: "Date", cell: (r) => date(r.date) },
      { key: "direction", label: "Direction", cell: (r) => ({ text: r.direction === "Paid" ? "Paid to vendor" : "Received", tone: r.direction === "Paid" ? "warn" : "good" }) },
      { key: "party", label: "Client / supplier", cell: (r, s) => t(r.direction === "Paid" ? supplierName(r, s) : clientName(r, s)) },
      { key: "doc", label: "Against", cell: (r, s) => t([s.byId.salesOrders.get(r.salesOrderId)?.serial, s.byId.purchaseOrders.get(r.purchaseOrderId)?.serial, s.byId.proformaInvoices.get(r.proformaId)?.serial].filter(Boolean).join(", ")) },
      { key: "debit", label: "Debit (received)", align: "right", cell: (r) => r.direction === "Paid" ? { text: "—", sort: 0 } : money(r.amount, r.currency) },
      { key: "credit", label: "Credit (paid)", align: "right", cell: (r) => r.direction === "Paid" ? money(r.amount, r.currency) : { text: "—", sort: 0 } },
      { key: "bankFees", label: "Bank fees", align: "right", cell: (r) => num(r.bankFees) ? money(r.bankFees, r.currency) : { text: "—", sort: 0 } },
      { key: "pkr", label: "PKR", align: "right", cell: (r) => money(r.amountPKR) },
      { key: "kind", label: "Full / partial", cell: (r, s) => { const k = paymentInfo(r, s).kind; return { text: k, tone: k === "Full payment" ? "good" : k === "Partial payment" ? "warn" : undefined }; } },
      { key: "total", label: "Total payment", align: "right", cell: (r, s) => { const i = paymentInfo(r, s); return i.doc ? money(i.total, i.currency) : t(""); } },
      { key: "paidToDate", label: "Paid to date", align: "right", cell: (r, s) => { const i = paymentInfo(r, s); return i.doc ? money(i.paid, i.currency) : t(""); } },
      { key: "remaining", label: "Remaining payment", align: "right", cell: (r, s) => { const i = paymentInfo(r, s); return i.doc ? { ...money(i.remaining, i.currency), tone: i.remaining > 0.005 ? "bad" : "good" } : t(""); } },
      { key: "paymentStatus", label: "Payment status", cell: (r, s) => badge(paymentInfo(r, s).status) },
      { key: "method", label: "Method", cell: (r) => t(r.method) },
      { key: "bankName", label: "Bank name", cell: (r) => t(r.bankName) },
      { key: "accountNumber", label: "Account number", cell: (r) => ({ text: r.accountNumber || "—", subtext: r.accountTitle || undefined }) },
      { key: "beneficiary", label: "Supplier account", cell: (r) => ({ text: r.beneficiaryAccount || "—", subtext: r.beneficiaryBank || undefined }) },
      { key: "reference", label: "Cheque / ref. no.", cell: (r) => t(r.reference) },
    ],
    filters: [
      { key: "direction", label: "Direction", options: () => ["Received", "Paid"], get: (r) => r.direction ?? "" },
      { key: "method", label: "Method", options: (s) => s.settings.paymentMethods, get: (r) => r.method ?? "" },
      { key: "paymentType", label: "Type", options: (s) => s.settings.paymentTerms, get: (r) => r.paymentType ?? "" },
      { key: "kind", label: "Full / partial", options: () => ["Full payment", "Partial payment", "—"], get: (r, s) => paymentInfo(r, s).kind },
      { key: "paymentStatus", label: "Payment status", options: () => ["Paid", "Partially paid", "Unpaid", "—"], get: (r, s) => paymentInfo(r, s).status },
      { key: "bankName", label: "Bank", options: (s) => uniq([...s.settings.banks, ...s.payments.map((p) => p.bankName)]).sort(), get: (r) => r.bankName ?? "" },
    ],
  },

  deliveries: {
    col: "deliveries",
    title: "Deliveries",
    singular: "Delivery",
    href: "/deliveries",
    prefix: "DN",
    itemsMode: () => "sale",
    searchKeys: ["serial", "deliveryNoteNo", "receivedBy", "notes"],
    defaults: () => ({ ...cur(), status: "Pending", items: [], costingVersion: 1 }),
    fields: [
      { name: "date", label: "Dispatch date", type: "date", required: true },
      { name: "salesOrderId", label: "Sales order", type: "ref", ref: "salesOrders", required: true, autofill: (id, _d, s) => { const so = s.byId.salesOrders.get(id); return so ? { clientId: so.clientId, currency: so.currency || "PKR", exchangeRate: so.exchangeRate ?? 1, items: (so.items ?? []).map((item: Rec) => ({ ...item })), incoterm: so.incoterm ?? "", expectedDeliveryDate: so.expectedDeliveryDate ?? "", shipmentOriginDate: so.shipmentOriginDate ?? "" } : {}; } },
      { name: "clientId", label: "Client", type: "ref", ref: "clients" },
      { name: "purchaseOrderId", label: "Purchase order (supplier)", type: "ref", ref: "purchaseOrders" },
      { name: "incoterm", label: "Incoterm", type: "select", list: "incoterms" },
      { name: "shipmentOriginDate", label: "Shipment date (origin)", type: "date" },
      { name: "expectedDeliveryDate", label: "Expected delivery", type: "date" },
      { name: "deliveredDate", label: "Delivered on", type: "date" },
      { name: "orderConfirmed", label: "Order confirmation / receipt signed", type: "checkbox" },
      { name: "deliveryNoteNo", label: "Delivery note / AWB / BL no.", type: "text" },
      { name: "receivedBy", label: "Received by", type: "text" },
      { name: "currency", label: "Currency", type: "currency" },
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
      { key: "qty", label: "Qty", align: "right", cell: (r) => ({ text: fmtNum((r.items ?? []).reduce((n: number, i: Rec) => n + num(i.qty), 0)), sort: (r.items ?? []).reduce((n: number, i: Rec) => n + num(i.qty), 0) }) },
      { key: "total", label: "Total price", align: "right", cell: (r, s) => { const i = deliveryInfo(r, s); return money(i.value, i.currency, i.valuePKR); } },
      { key: "cost", label: "Costing", align: "right", cell: (r, s) => money(deliveryInfo(r, s).costPKR) },
      { key: "margin", label: "Margin", align: "right", cell: (r, s) => money(deliveryInfo(r, s).marginPKR) },
      { key: "incoterm", label: "Incoterm", cell: (r) => t(r.incoterm) },
      { key: "delivered", label: "Delivered", cell: (r) => date(r.deliveredDate) },
      { key: "late", label: "Late", align: "right", cell: (r, s) => { const l = deliveryInfo(r, s).late; return l && l.days ? { text: `${l.days}d${l.overdue ? " overdue" : ""}`, tone: "bad", sort: l.days } : { text: "—", sort: 0 }; } },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
    ],
    filters: [statusFilter("deliveries"), clientFilter, { key: "incoterm", label: "Incoterm", options: (s) => s.settings.incoterms, get: (r) => r.incoterm ?? "" }],
  },

  shipments: {
    col: "shipments",
    title: "Payment Invoices/Shipping Docs",
    singular: "Shipment",
    href: "/shipments",
    prefix: "SHP",
    searchKeys: ["serial", "trackingNo", "containerNo", "carrier", "forwarder", "vessel", "originPort", "destinationPort", "lastLocation", "gdNo", "notes"],
    defaults: () => ({ date: today(), mode: "Sea", status: "Booked", docsReady: [], docsSent: [] }),
    fields: [
      { name: "date", label: "Booking date", type: "date", required: true, section: "Shipment" },
      { name: "mode", label: "Mode", type: "select", options: ["Sea", "Air", "Road", "Rail", "Courier"], required: true },
      statusField("shipments"),
      { name: "salesOrderId", label: "Sales order", type: "ref", ref: "salesOrders", autofill: (id, _d, s) => { const so = s.byId.salesOrders.get(id); return so ? { clientId: so.clientId, incoterm: so.incoterm ?? "" } : {}; } },
      { name: "purchaseOrderId", label: "Purchase order", type: "ref", ref: "purchaseOrders", autofill: (id, _d, s) => { const po = s.byId.purchaseOrders.get(id); return po ? { supplierId: po.supplierId, salesOrderId: po.salesOrderId ?? "" } : {}; } },
      { name: "clientId", label: "Client (consignee)", type: "ref", ref: "clients" },
      { name: "supplierId", label: "Supplier (shipper)", type: "ref", ref: "suppliers" },
      { name: "incoterm", label: "Incoterm", type: "select", list: "incoterms" },
      { name: "carrier", label: "Shipping line / airline / courier", type: "text" },
      { name: "forwarder", label: "Freight forwarder / clearing agent", type: "text" },
      { name: "trackingNo", label: "BL / AWB / tracking no.", type: "text" },
      { name: "containerNo", label: "Container no(s).", type: "text" },
      { name: "vessel", label: "Vessel / flight / truck no.", type: "text" },
      { name: "packages", label: "Packages", type: "text", help: "e.g. 3 crates, 1 x 20ft" },
      { name: "grossWeight", label: "Gross weight (kg)", type: "number" },
      { name: "originPort", label: "Port / place of loading", type: "text", section: "Route & tracking" },
      { name: "destinationPort", label: "Port / place of discharge", type: "text" },
      { name: "etd", label: "ETD (expected departure)", type: "date" },
      { name: "atd", label: "Departed on", type: "date" },
      { name: "eta", label: "ETA (expected arrival)", type: "date" },
      { name: "ata", label: "Arrived on", type: "date" },
      { name: "deliveredDate", label: "Delivered to client on", type: "date" },
      { name: "lastLocation", label: "Last known location", type: "text" },
      { name: "lastUpdate", label: "Last tracking update", type: "date" },
      { name: "trackingUrl", label: "Tracking link", type: "text", wide: true, help: "The carrier's tracking page for this shipment." },
      { name: "docsReady", label: "Documents ready / received", type: "multiselect", list: "shipmentDocuments", wide: true, section: "Documentation" },
      { name: "docsSent", label: "Documents sent to client / bank", type: "multiselect", list: "shipmentDocuments", wide: true },
      { name: "gdNo", label: "Goods declaration (GD) no.", type: "text" },
      { name: "insurancePolicy", label: "Insurance policy / cert. no.", type: "text" },
      { name: "lcNo", label: "LC no.", type: "text" },
      { ...notes, section: "Notes" },
    ],
    columns: [
      { key: "serial", label: "Shipment no.", cell: (r) => t(r.serial) },
      { key: "date", label: "Booking date", cell: (r) => date(r.date) },
      { key: "mode", label: "Mode", cell: (r) => t(r.mode) },
      { key: "client", label: "Client", cell: (r, s) => t(clientName(r, s)) },
      { key: "so", label: "S/O ref.", cell: (r, s) => t(shipmentOrder(r, s)?.serial) },
      { key: "invoices", label: "Linked client invoices", cell: (r, s) => {
        const order = shipmentOrder(r, s);
        return t(order && s.proformaInvoices.filter(pi => pi.salesOrderId === order.id && pi.type !== "From Supplier" && pi.status !== "Cancelled").map(pi => pi.serial).join(", "));
      } },
      { key: "orderPayment", label: "Client order payment", cell: (r, s) => {
        const order = shipmentOrder(r, s);
        if (!order || order.status === "Cancelled" || r.status === "Cancelled") return t("");
        const info = soInfo(order, s);
        return { text: info.payment, subtext: `${fmtMoney(info.received, order.currency)} received · ${fmtMoney(info.outstanding, order.currency)} due` };
      } },
      { key: "po", label: "P/O ref.", cell: (r, s) => t(s.byId.purchaseOrders.get(r.purchaseOrderId)?.serial) },
      { key: "supplier", label: "Supplier", cell: (r, s) => t(supplierName(r, s)) },
      { key: "carrier", label: "Carrier", cell: (r) => ({ text: r.carrier || "—", subtext: r.forwarder || undefined }) },
      { key: "trackingNo", label: "BL / AWB no.", cell: (r) => ({ text: r.trackingNo || "—", subtext: r.containerNo || undefined }) },
      { key: "route", label: "Route", cell: (r) => t([r.originPort, r.destinationPort].filter(Boolean).join(" → ")) },
      { key: "etd", label: "ETD", cell: (r) => date(r.atd || r.etd) },
      { key: "eta", label: "ETA", cell: (r) => date(r.eta) },
      { key: "ata", label: "Arrived", cell: (r) => date(r.ata) },
      { key: "late", label: "Late", align: "right", cell: (r, s) => lateCell(shipmentInfo(r, s).late) },
      { key: "status", label: "Status", cell: (r) => badge(r.status) },
      { key: "lastLocation", label: "Last location", cell: (r) => ({ text: r.lastLocation || "—", subtext: r.lastUpdate ? fmtDate(r.lastUpdate) : undefined }) },
      { key: "docs", label: "Documents", cell: (r, s) => { const i = shipmentInfo(r, s); return { text: `${i.required.length - i.missing.length} / ${i.required.length} ready`, tone: i.missing.length ? "warn" : "good", sort: i.missing.length }; } },
      { key: "missing", label: "Missing documents", cell: (r, s) => t(shipmentInfo(r, s).missing.join(", ")) },
    ],
    filters: [
      statusFilter("shipments"),
      openClosedFilter("shipments"),
      { key: "mode", label: "Mode", options: () => ["Sea", "Air", "Road", "Rail", "Courier"], get: (r) => r.mode ?? "" },
      clientFilter,
      { key: "docs", label: "Documents", options: () => ["Complete", "Missing documents"], get: (r, s) => (shipmentInfo(r, s).missing.length ? "Missing documents" : "Complete") },
    ],
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
    compute: (d) => ({ amountValue: num(d.qty ?? 1) * num(d.unitCost) }),
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
      { key: "qty", label: "Qty", align: "right", cell: (r) => ({ text: fmtNum(r.qty ?? 1), sort: num(r.qty ?? 1) }) },
      { key: "unitCost", label: "Unit cost", align: "right", cell: (r) => money(r.unitCost, r.currency) },
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
    compute: (d) => ({ amountValue: num(d.qty ?? 1) * num(d.unitCost) }),
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
      { key: "qty", label: "Qty", align: "right", cell: (r) => ({ text: fmtNum(r.qty ?? 1), sort: num(r.qty ?? 1) }) },
      { key: "unitCost", label: "Unit cost", align: "right", cell: (r) => money(r.unitCost, r.currency) },
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
      project: "",
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
      { key: "project", label: "Project", cell: (r) => t(r.project || "") },
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
      { key: "linked", label: "Linked record", cell: (r) => t(r.linkLabel) },
    ],
    filters: [
      statusFilter("schedule"),
      { key: "linkCol", label: "Raised from", options: (s) => uniq(s.schedule.map(raisedFrom)).sort(), get: raisedFrom },
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
      project: "",
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

// Every module lists its attached documents by name: "1. Client PO, 2. Supplier proforma invoice".
for (const m of Object.values(MODULES)) {
  if (m.columns.some((c) => c.key === "attachments")) continue;
  // Remarks stays the last column where it already is.
  const at = m.columns.at(-1)?.key === "remarks" ? m.columns.length - 1 : m.columns.length;
  m.columns.splice(at, 0, {
    key: "attachments",
    label: "Attachments",
    cell: (r) => {
      const list: Rec[] = r.attachments ?? [];
      return list.length ? { text: list.map((a, i) => `${i + 1}. ${a.label || a.name}`).join(", "), sort: list.length } : { text: "—", sort: 0 };
    },
  });
}

export function companyDocStatus(r: Rec): string {
  if (r.expiryDate) {
    const days = (Date.parse(r.expiryDate) - Date.now()) / 86400000;
    if (days < 0) return "Expired";
    if (days <= 30) return "Expiring soon";
  }
  return r.docStatus || "Valid";
}
