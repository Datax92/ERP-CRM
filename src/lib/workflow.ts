import { emptyItem, num, today } from "./calc";
import { patchRecord, saveRecord } from "./db";
import { piInfo, poInfo, soInfo, type Store } from "./derive";
import { MODULES } from "./modules";
import type { CollectionName, LineItem, Rec } from "./types";

async function create(col: CollectionName, data: Rec) {
  const m = MODULES[col];
  return saveRecord(col, { ...data, ...(m.compute?.(data) ?? {}) }, { itemsMode: m.itemsMode?.(data), amountField: m.amountField, serialPrefix: m.prefix });
}

const copyItems = (items: LineItem[] | undefined, keepPrices: boolean): LineItem[] =>
  (items ?? []).map((i) => ({
    ...emptyItem(),
    ...i,
    unitCost: keepPrices ? num(i.unitCost) : 0,
    unitPrice: keepPrices ? num(i.unitPrice) : 0,
  }));

const carry = (r: Rec) => ({ attachments: r.attachments ?? [], notes: r.notes ?? "" });

/** A step in the chain: what the user sees and what it produces. */
export type Conversion = { label: string; target: CollectionName; run: () => Promise<Rec>; disabled?: string };

export function conversionsFor(col: CollectionName, r: Rec, s: Store): Conversion[] {
  const out: Conversion[] = [];
  switch (col) {
    case "rfqs": {
      const existing = s.quotations.find((q) => q.rfqId === r.id);
      out.push({
        label: "Convert to quotation",
        target: "quotations",
        disabled: existing ? `Already quoted as ${existing.serial}` : undefined,
        run: async () => {
          const q = await create("quotations", {
            id: "",
            ...MODULES.quotations.defaults(s),
            clientId: r.clientId,
            rfqId: r.id,
            region: r.region ?? "",
            sector: r.sector ?? "",
            items: copyItems(r.items, false),
            ...carry(r),
          });
          await patchRecord("rfqs", r.id, { status: "Converted" });
          return q;
        },
      });
      const existingCostSheet = s.costSheets?.find((cs) => cs.rfqId === r.id);
      out.push({
        label: "Prepare cost sheet",
        target: "costSheets",
        disabled: existingCostSheet ? `Cost sheet exists as ${existingCostSheet.serial}` : undefined,
        run: async () => {
          const cs = await create("costSheets", {
            id: "",
            ...MODULES.costSheets.defaults(s),
            title: `Costing · ${r.serial || "RFQ"}${r.title ? ` · ${r.title}` : ""}`,
            clientId: r.clientId,
            rfqId: r.id,
            currency: "PKR",
            exchangeRate: 1,
            items: copyItems(r.items, false),
            ...carry(r),
          });
          return cs;
        },
      });
      break;
    }
    case "costSheets": {
      const existingQuote = s.quotations.find((q) => q.costSheetId === r.id || (r.rfqId && q.rfqId === r.rfqId));
      out.push({
        label: "Create quotation from cost sheet",
        target: "quotations",
        disabled: existingQuote ? `Already quoted as ${existingQuote.serial}` : undefined,
        run: async () => {
          const q = await create("quotations", {
            id: "",
            ...MODULES.quotations.defaults(s),
            title: r.title,
            clientId: r.clientId,
            rfqId: r.rfqId,
            costSheetId: r.id,
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            items: copyItems(r.items, true),
            ...carry(r),
          });
          await patchRecord("costSheets", r.id, { status: "Costed", quotationId: q.id });
          return q;
        },
      });
      out.push({
        label: "Convert to sales order",
        target: "salesOrders",
        run: async () => {
          const so = await create("salesOrders", {
            id: "",
            ...MODULES.salesOrders.defaults(s),
            clientId: r.clientId,
            costSheetId: r.id,
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            items: copyItems(r.items, true),
            ...carry(r),
          });
          await patchRecord("costSheets", r.id, { status: "Converted", salesOrderId: so.id });
          return so;
        },
      });
      break;
    }
    case "quotations": {
      const existing = s.salesOrders.find((o) => o.quotationId === r.id);
      out.push({
        label: "Convert to sales order",
        target: "salesOrders",
        disabled: existing ? `Already converted to ${existing.serial}` : undefined,
        run: async () => {
          const so = await create("salesOrders", {
            id: "",
            ...MODULES.salesOrders.defaults(s),
            clientId: r.clientId,
            quotationId: r.id,
            region: r.region ?? "",
            sector: r.sector ?? "",
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            paymentTerms: r.paymentTerms ?? "",
            incoterm: r.incoterm ?? "",
            items: copyItems(r.items, true),
            ...carry(r),
          });
          await patchRecord("quotations", r.id, { status: "Won" });
          return so;
        },
      });
      out.push({
        label: "Generate / View cost sheet",
        target: "costSheets",
        run: async () => {
          const existingCs = s.costSheets?.find((cs) => cs.quotationId === r.id || cs.id === r.costSheetId);
          if (existingCs) return existingCs;
          const cs = await create("costSheets", {
            id: "",
            ...MODULES.costSheets.defaults(s),
            title: `Costing · ${r.serial}`,
            clientId: r.clientId,
            quotationId: r.id,
            rfqId: r.rfqId,
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            items: copyItems(r.items, true),
            ...carry(r),
          });
          await patchRecord("quotations", r.id, { costSheetId: cs.id });
          return cs;
        },
      });
      break;
    }
    case "salesOrders": {
      const info = soInfo(r, s);
      // One PO per supplier named on the SO lines; lines without a supplier go on a blank PO.
      const bySupplier = new Map<string, LineItem[]>();
      for (const it of (r.items ?? []) as LineItem[]) {
        const k = it.supplierId || "";
        bySupplier.set(k, [...(bySupplier.get(k) ?? []), it]);
      }
      const already = new Set(info.pos.map((p) => p.supplierId));
      for (const [supplierId, items] of bySupplier) {
        const name = s.byId.suppliers.get(supplierId)?.name;
        out.push({
          label: name ? `Issue PO to ${name}` : "Issue purchase order",
          target: "purchaseOrders",
          disabled: supplierId && already.has(supplierId) ? `PO already issued to ${name}` : undefined,
          run: async () => {
            const sup = s.byId.suppliers.get(supplierId);
            const po = await create("purchaseOrders", {
              id: "",
              ...MODULES.purchaseOrders.defaults(s),
              supplierId,
              salesOrderId: r.id,
              currency: r.currency,
              exchangeRate: r.exchangeRate,
              paymentTerms: sup?.paymentTerms ?? "",
              incoterm: r.incoterm ?? "",
              items: copyItems(items, true),
            });
            if (r.status === "Open") await patchRecord("salesOrders", r.id, { status: "PO Issued" });
            return po;
          },
        });
      }
      out.push({
        label: "Create proforma invoice to client",
        target: "proformaInvoices",
        run: () =>
          create("proformaInvoices", {
            id: "",
            ...MODULES.proformaInvoices.defaults(s),
            type: "To Client",
            clientId: r.clientId,
            salesOrderId: r.id,
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            paymentTerms: r.paymentTerms ?? "",
            items: copyItems(r.items, true),
          }),
      });
      out.push({
        label: "Create delivery",
        target: "deliveries",
        run: () =>
          create("deliveries", {
            id: "",
            ...MODULES.deliveries.defaults(s),
            salesOrderId: r.id,
            clientId: r.clientId,
            purchaseOrderId: info.pos[0]?.id ?? "",
            incoterm: r.incoterm ?? "",
            shipmentOriginDate: info.shipmentOriginDate ?? "",
            expectedDeliveryDate: r.expectedDeliveryDate ?? "",
            items: copyItems(r.items, false),
          }),
      });
      out.push({
        label: "Record payment received",
        target: "payments",
        disabled: info.outstanding <= 0 ? "Fully paid" : undefined,
        run: () =>
          create("payments", {
            id: "",
            ...MODULES.payments.defaults(s),
            direction: "Received",
            clientId: r.clientId,
            salesOrderId: r.id,
            amount: info.outstanding,
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            paymentType: r.paymentTerms ?? "",
          }),
      });
      break;
    }
    case "purchaseOrders": {
      const info = poInfo(r, s);
      out.push({
        label: "Record supplier proforma",
        target: "proformaInvoices",
        run: () =>
          create("proformaInvoices", {
            id: "",
            ...MODULES.proformaInvoices.defaults(s),
            type: "From Supplier",
            supplierId: r.supplierId,
            purchaseOrderId: r.id,
            salesOrderId: r.salesOrderId ?? "",
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            paymentTerms: r.paymentTerms ?? "",
            items: copyItems(r.items, true),
          }),
      });
      out.push({
        label: "Record payment to vendor",
        target: "payments",
        disabled: info.outstanding <= 0 ? "Fully paid" : undefined,
        run: () =>
          create("payments", {
            id: "",
            ...MODULES.payments.defaults(s),
            direction: "Paid",
            supplierId: r.supplierId,
            purchaseOrderId: r.id,
            amount: info.outstanding,
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            paymentType: r.paymentTerms ?? "",
          }),
      });
      break;
    }
    case "proformaInvoices": {
      const info = piInfo(r, s);
      const toClient = r.type !== "From Supplier";
      out.push({
        label: toClient ? "Record payment received" : "Record payment to vendor",
        target: "payments",
        disabled: info.pending <= 0 ? "Fully paid" : undefined,
        run: () =>
          create("payments", {
            id: "",
            ...MODULES.payments.defaults(s),
            direction: toClient ? "Received" : "Paid",
            clientId: toClient ? r.clientId : "",
            supplierId: toClient ? "" : r.supplierId,
            salesOrderId: toClient ? (r.salesOrderId ?? "") : "",
            purchaseOrderId: toClient ? "" : (r.purchaseOrderId ?? ""),
            proformaId: r.id,
            amount: info.pending,
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            paymentType: r.paymentTerms ?? "",
            date: today(),
          }),
      });
      break;
    }
    case "clients":
      out.push({
        label: "New RFQ for this client",
        target: "rfqs",
        run: () => create("rfqs", { id: "", ...MODULES.rfqs.defaults(s), clientId: r.id, region: r.region ?? "", sector: r.sector ?? "" }),
      });
      break;
  }
  return out;
}

/** Records that point at this one, for the "linked records" panel. */
export function linkedRecords(col: CollectionName, r: Rec, s: Store): { col: CollectionName; rec: Rec }[] {
  const out: { col: CollectionName; rec: Rec }[] = [];
  const add = (c: CollectionName, pred: (x: Rec) => boolean) => s[c].filter(pred).forEach((rec) => out.push({ col: c, rec }));
  const up = (c: CollectionName, id?: string) => {
    const rec = id ? s.byId[c].get(id) : undefined;
    if (rec) out.push({ col: c, rec });
  };
  switch (col) {
    case "clients":
      add("rfqs", (x) => x.clientId === r.id);
      add("costSheets", (x) => x.clientId === r.id);
      add("quotations", (x) => x.clientId === r.id);
      add("salesOrders", (x) => x.clientId === r.id);
      add("proformaInvoices", (x) => x.clientId === r.id);
      add("deliveries", (x) => x.clientId === r.id);
      add("payments", (x) => x.clientId === r.id);
      add("marketing", (x) => x.clientId === r.id);
      break;
    case "suppliers":
      add("costSheets", (x) => x.supplierId === r.id);
      add("purchaseOrders", (x) => x.supplierId === r.id);
      add("proformaInvoices", (x) => x.supplierId === r.id);
      add("payments", (x) => x.supplierId === r.id);
      break;
    case "rfqs":
      add("costSheets", (x) => x.rfqId === r.id);
      add("quotations", (x) => x.rfqId === r.id);
      break;
    case "costSheets":
      up("rfqs", r.rfqId);
      up("quotations", r.quotationId);
      up("salesOrders", r.salesOrderId);
      add("quotations", (x) => x.costSheetId === r.id);
      add("salesOrders", (x) => x.costSheetId === r.id);
      break;
    case "quotations":
      up("rfqs", r.rfqId);
      up("costSheets", r.costSheetId);
      add("costSheets", (x) => x.quotationId === r.id);
      add("salesOrders", (x) => x.quotationId === r.id);
      break;
    case "salesOrders":
      up("quotations", r.quotationId);
      up("costSheets", r.costSheetId);
      add("costSheets", (x) => x.salesOrderId === r.id);
      add("purchaseOrders", (x) => x.salesOrderId === r.id);
      add("proformaInvoices", (x) => x.salesOrderId === r.id);
      add("deliveries", (x) => x.salesOrderId === r.id);
      add("payments", (x) => x.salesOrderId === r.id);
      break;
    case "purchaseOrders":
      up("salesOrders", r.salesOrderId);
      add("proformaInvoices", (x) => x.purchaseOrderId === r.id);
      add("deliveries", (x) => x.purchaseOrderId === r.id);
      add("payments", (x) => x.purchaseOrderId === r.id);
      break;
    case "proformaInvoices":
      up("salesOrders", r.salesOrderId);
      up("purchaseOrders", r.purchaseOrderId);
      add("payments", (x) => x.proformaId === r.id);
      break;
    case "deliveries":
      up("salesOrders", r.salesOrderId);
      up("purchaseOrders", r.purchaseOrderId);
      break;
    case "payments":
      up("salesOrders", r.salesOrderId);
      up("purchaseOrders", r.purchaseOrderId);
      up("proformaInvoices", r.proformaId);
      break;
  }
  return out;
}

// ---------- Trade route: the whole deal a document belongs to ----------
export type RouteStop = { col: CollectionName; label: string; recs: Rec[] };
export const ROUTE_COLS: CollectionName[] = ["rfqs", "quotations", "salesOrders", "purchaseOrders", "proformaInvoices", "deliveries"];
const ROUTE_LABELS: Record<string, string> = {
  rfqs: "RFQ",
  quotations: "Quotation",
  salesOrders: "Sales order",
  purchaseOrders: "Purchase order",
  proformaInvoices: "Proforma",
  deliveries: "Delivery",
};

/** Walks the links from any document to its RFQ, quotation, sales order, POs, proformas and deliveries. */
export function dealRoute(col: CollectionName, r: Rec, s: Store): RouteStop[] | null {
  if (!ROUTE_COLS.includes(col)) return null;
  const get = (c: CollectionName, id?: string) => (id ? s.byId[c].get(id) : undefined);
  let rfq = col === "rfqs" ? r : undefined;
  let quote = col === "quotations" ? r : undefined;
  let so = col === "salesOrders" ? r : undefined;
  if (col === "purchaseOrders" || col === "proformaInvoices" || col === "deliveries") {
    so = get("salesOrders", r.salesOrderId) ?? (r.purchaseOrderId ? get("salesOrders", get("purchaseOrders", r.purchaseOrderId)?.salesOrderId) : undefined);
  }
  if (rfq && !quote) quote = s.quotations.find((q) => q.rfqId === rfq!.id);
  if (quote && !so) so = s.salesOrders.find((o) => o.quotationId === quote!.id);
  if (so && !quote) quote = get("quotations", so.quotationId);
  if (quote && !rfq) rfq = get("rfqs", quote.rfqId);

  const pos = so ? s.purchaseOrders.filter((p) => p.salesOrderId === so!.id) : col === "purchaseOrders" ? [r] : [];
  const poIds = new Set(pos.map((p) => p.id));
  const pis = so || pos.length ? s.proformaInvoices.filter((p) => (so && p.salesOrderId === so.id) || poIds.has(p.purchaseOrderId)) : col === "proformaInvoices" ? [r] : [];
  const dns = so ? s.deliveries.filter((d) => d.salesOrderId === so!.id) : col === "deliveries" ? [r] : [];
  const recs: Record<string, Rec[]> = {
    rfqs: rfq ? [rfq] : [],
    quotations: quote ? [quote] : [],
    salesOrders: so ? [so] : [],
    purchaseOrders: pos,
    proformaInvoices: pis,
    deliveries: dns,
  };
  return ROUTE_COLS.map((c) => ({ col: c, label: ROUTE_LABELS[c], recs: recs[c] }));
}
