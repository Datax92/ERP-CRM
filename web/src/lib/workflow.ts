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
      add("quotations", (x) => x.clientId === r.id);
      add("salesOrders", (x) => x.clientId === r.id);
      add("proformaInvoices", (x) => x.clientId === r.id);
      add("deliveries", (x) => x.clientId === r.id);
      add("payments", (x) => x.clientId === r.id);
      add("marketing", (x) => x.clientId === r.id);
      break;
    case "suppliers":
      add("purchaseOrders", (x) => x.supplierId === r.id);
      add("proformaInvoices", (x) => x.supplierId === r.id);
      add("payments", (x) => x.supplierId === r.id);
      break;
    case "rfqs":
      add("quotations", (x) => x.rfqId === r.id);
      break;
    case "quotations":
      up("rfqs", r.rfqId);
      add("salesOrders", (x) => x.quotationId === r.id);
      break;
    case "salesOrders":
      up("quotations", r.quotationId);
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
