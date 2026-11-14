import { daysBetween, lateness, num, rateOf, today } from "./calc";
import { CLIENT_LIFECYCLE, stageKind } from "./stages";
import type { CollectionName, Rec, Settings } from "./types";

export type Store = Record<CollectionName, Rec[]> & {
  byId: Record<CollectionName, Map<string, Rec>>;
  settings: Settings;
};

const latest = (recs: Rec[]) =>
  [...recs].sort((a, b) => String(b.date ?? b.createdAt).localeCompare(String(a.date ?? a.createdAt)))[0];

/** Payment value expressed in the target document's currency. */
export function paymentIn(p: Rec, target: Rec): number {
  if ((p.currency || "PKR") === (target.currency || "PKR")) return num(p.amount);
  const pkr = num(p.amount) * rateOf(p);
  const r = rateOf(target);
  return r ? pkr / r : 0;
}

export function paymentStatus(total: number, paid: number): "Unpaid" | "Partially paid" | "Paid" | "—" {
  if (total <= 0) return "—";
  if (paid <= 0.005) return "Unpaid";
  if (paid + 0.005 < total) return "Partially paid";
  return "Paid";
}

/** Resolve payments entered against a proforma even when the order/party fields were omitted. */
export function paymentLinks(p: Rec, s: Store) {
  const pi = p.proformaId ? s.byId.proformaInvoices.get(p.proformaId) : undefined;
  const purchaseOrderId = p.purchaseOrderId || pi?.purchaseOrderId;
  const po = purchaseOrderId ? s.byId.purchaseOrders.get(purchaseOrderId) : undefined;
  const salesOrderId = p.salesOrderId || pi?.salesOrderId || po?.salesOrderId;
  const so = salesOrderId ? s.byId.salesOrders.get(salesOrderId) : undefined;
  return { salesOrderId, purchaseOrderId, clientId: p.clientId || pi?.clientId || so?.clientId, supplierId: p.supplierId || pi?.supplierId || po?.supplierId };
}

/** Client comparisons include purchase orders and supplier proformas through their sales order. */
export function documentClientId(r: Rec, s: Store): string {
  const po = r.purchaseOrderId ? s.byId.purchaseOrders.get(r.purchaseOrderId) : undefined;
  return r.clientId || s.byId.salesOrders.get(r.salesOrderId || po?.salesOrderId)?.clientId || '';
}

// ---------- Sales order ----------
export function soInfo(so: Rec, s: Store) {
  const pos = s.purchaseOrders.filter((p) => p.salesOrderId === so.id && p.status !== "Cancelled");
  const deliveries = s.deliveries.filter((d) => d.salesOrderId === so.id);
  const delivered = deliveries.filter((d) => d.status === "Delivered");
  const itemKey = (i: Rec) => JSON.stringify([i.product || i.description, i.brand || '', i.unit || '']);
  const ordered = new Map<string, number>();
  const fulfilled = new Map<string, number>();
  for (const i of so.items ?? []) ordered.set(itemKey(i), (ordered.get(itemKey(i)) ?? 0) + num(i.qty));
  for (const d of delivered) for (const i of d.items ?? []) fulfilled.set(itemKey(i), (fulfilled.get(itemKey(i)) ?? 0) + num(i.qty));
  const fullyDelivered = so.status === 'Delivered' || so.status === 'Closed' || (delivered.length > 0 && (ordered.size === 0 || [...ordered].every(([key, qty]) => (fulfilled.get(key) ?? 0) >= qty)));
  const deliveredDate = fullyDelivered ? delivered.map((d) => d.deliveredDate).filter(Boolean).sort().pop() as string | undefined : undefined;
  const received = s.payments
    .filter((p) => p.direction === "Received" && paymentLinks(p, s).salesOrderId === so.id)
    .reduce((t, p) => t + paymentIn(p, so), 0);
  const actualCostPKR = pos.reduce((t, p) => t + num(p.amountPKR), 0);
  const costPKR = pos.length ? actualCostPKR : num(so.totalCostPKR);
  const revenuePKR = num(so.amountPKR);
  return {
    pos,
    poIssued: pos.length > 0,
    suppliers: [...new Set(pos.map((p) => s.byId.suppliers.get(p.supplierId)?.name).filter(Boolean))] as string[],
    deliveries,
    delivered: fullyDelivered,
    deliveredDate,
    shipmentOriginDate: so.shipmentOriginDate || pos.map((p) => p.shipmentOriginDate).filter(Boolean).sort()[0],
    late: lateness(so.expectedDeliveryDate, deliveredDate),
    received,
    outstanding: Math.max(0, num(so.amount) - received),
    payment: paymentStatus(num(so.amount), received),
    costPKR,
    costIsActual: pos.length > 0,
    profitPKR: revenuePKR - costPKR,
  };
}

// ---------- Purchase order ----------
export function poInfo(po: Rec, s: Store) {
  const paid = s.payments
    .filter((p) => p.direction === "Paid" && paymentLinks(p, s).purchaseOrderId === po.id)
    .reduce((t, p) => t + paymentIn(p, po), 0);
  const so = po.salesOrderId ? s.byId.salesOrders.get(po.salesOrderId) : undefined;
  // Sales value of what this PO buys: the selling rates carried onto its lines from the sales
  // order, or else the SO value in proportion to this PO's share of the SO's cost.
  const costPKR = num(po.amountPKR);
  let salePKR = (po.items ?? []).reduce((t: number, i: Rec) => t + num(i.qty) * num(i.unitPrice), 0) * rateOf(po);
  if (!salePKR && so && num(so.totalCostPKR)) salePKR = (num(so.amountPKR) * costPKR) / num(so.totalCostPKR);
  return {
    so,
    salePKR,
    marginPKR: salePKR ? salePKR - costPKR : 0,
    paid,
    outstanding: Math.max(0, num(po.amount) - paid),
    payment: paymentStatus(num(po.amount), paid),
    late: lateness(po.expectedArrivalDate, po.actualArrivalDate),
    delivered: po.status === "Received" || po.status === "Closed" || Boolean(po.actualArrivalDate),
  };
}

// ---------- Proforma invoice ----------
export function piInfo(pi: Rec, s: Store) {
  const supplierSide = pi.type === "From Supplier";
  const dir = supplierSide ? "Paid" : "Received";
  const orderKey = supplierSide ? "purchaseOrderId" : "salesOrderId";
  const orderId = pi[orderKey];
  // Payments recorded against the order itself (not a specific proforma) count toward the
  // proforma when it is the order's only live proforma of this type.
  const soleProforma =
    !!orderId && s.proformaInvoices.filter((x) => x[orderKey] === orderId && x.status !== "Cancelled" && (x.type === "From Supplier") === supplierSide).length === 1;
  const own = s.payments.filter((p) => p.direction === dir && (p.proformaId === pi.id || (soleProforma && !p.proformaId && p[orderKey] === orderId)));
  const paid = own.reduce((t, p) => t + paymentIn(p, pi), 0);
  const payment = paymentStatus(num(pi.amount), paid);
  const status = pi.status === "Cancelled" ? "Cancelled" : payment === "Paid" ? "Paid" : payment === "Partially paid" ? "Partially paid" : pi.status;
  const so = pi.salesOrderId ? s.byId.salesOrders.get(pi.salesOrderId) : undefined;
  const po = pi.purchaseOrderId ? s.byId.purchaseOrders.get(pi.purchaseOrderId) : undefined;
  const methods = own.map((p) => p.method).filter(Boolean) as string[];
  const delivered = pi.type === "From Supplier" ? (po ? poInfo(po, s).delivered : false) : so ? soInfo(so, s).delivered : false;
  return { paid, pending: Math.max(0, num(pi.amount) - paid), payment, status, delivered, methods };
}

// ---------- Delivery ----------
export function deliveryInfo(d: Rec, s: Store) {
  const so = d.salesOrderId ? s.byId.salesOrders.get(d.salesOrderId) : undefined;
  const active = d.status !== 'Cancelled' && d.status !== 'Returned';
  // Legacy delivery lines stored zero prices. Resolve them from the linked order;
  // newly costed records preserve an explicit zero (for example, a free replacement).
  const priced = (d.items ?? []).map((item: Rec) => {
    const source = (so?.items ?? []).find((x: Rec) => (x.product || x.description) === (item.product || item.description) && (x.brand || '') === (item.brand || '') && (x.unit || '') === (item.unit || ''));
    return {
      ...item,
      unitPrice: d.costingVersion === 1 ? num(item.unitPrice) : num(item.unitPrice) || num(source?.unitPrice),
      unitCost: d.costingVersion === 1 ? num(item.unitCost) : num(item.unitCost) || num(source?.unitCost),
    };
  });
  const currency = d.currency || so?.currency || 'PKR';
  const exchangeRate = d.currency ? rateOf(d) : so ? rateOf(so) : rateOf(d);
  const value = active ? priced.reduce((t: number, i: Rec) => t + num(i.qty) * num(i.unitPrice), 0) : 0;
  const purchaseCurrency = d.purchaseCurrency || so?.purchaseCurrency;
  const costRate = purchaseCurrency ? rateOf({ currency: purchaseCurrency, exchangeRate: d.purchaseExchangeRate ?? so?.purchaseExchangeRate ?? exchangeRate }) : exchangeRate;
  const cost = active ? priced.reduce((t: number, i: Rec) => t + num(i.qty) * num(i.unitCost), 0) : 0;
  const share = so && num(so.amountPKR) > 0 ? value * exchangeRate / num(so.amountPKR) : 0;
  const soI = so ? soInfo(so, s) : undefined;
  const pos = soI?.pos ?? (d.purchaseOrderId ? s.purchaseOrders.filter((po) => po.id === d.purchaseOrderId && po.status !== 'Cancelled') : []);
  const vendorPaidPKR = pos.reduce((t, p) => t + poInfo(p, s).paid * rateOf(p), 0);
  const payments = s.payments.filter((p) => {
    const links = paymentLinks(p, s);
    return (p.direction === 'Received' && so && links.salesOrderId === so.id) || (p.direction === 'Paid' && pos.some((po) => po.id === links.purchaseOrderId));
  });
  // Apportion vendor payments by the share of order costs represented by this delivery.
  const purchased = so ? (so.items ?? []).reduce((t: number, i: Rec) => t + num(i.qty) * num(i.unitCost), 0) * costRate : pos.reduce((t, po) => t + num(po.amountPKR), 0);
  const vendorShare = purchased ? cost * costRate / purchased : 0;
  return {
    so, items: priced, currency, exchangeRate,
    value, cost, margin: exchangeRate ? value - cost * costRate / exchangeRate : 0,
    valuePKR: value * exchangeRate,
    costPKR: cost * costRate,
    marginPKR: value * exchangeRate - cost * costRate,
    receivedPKR: so ? soI!.received * rateOf(so) * share : 0,
    payment: soI?.payment ?? "—",
    vendorPaidPKR: vendorPaidPKR * vendorShare,
    methods: [...new Set(payments.map((p) => p.method).filter(Boolean))] as string[],
    late: lateness(d.expectedDeliveryDate, d.status === "Delivered" ? d.deliveredDate : undefined),
    periodDays: daysBetween(d.shipmentOriginDate || d.date, d.deliveredDate),
  };
}

// ---------- Client ----------
export function clientInfo(c: Rec, s: Store) {
  const rfqs = s.rfqs.filter((r) => r.clientId === c.id);
  const quotes = s.quotations.filter((r) => r.clientId === c.id);
  const sos = s.salesOrders.filter((r) => r.clientId === c.id);
  const payments = s.payments.filter((p) => p.direction === "Received" && paymentLinks(p, s).clientId === c.id);
  const marketing = s.marketing.filter((m) => m.clientId === c.id);
  const deliveries = s.deliveries.filter((d) => d.clientId === c.id);

  const liveSos = sos.filter((o) => o.status !== "Cancelled");
  const anyDelivered = liveSos.some((o) => soInfo(o, s).delivered) || deliveries.some((d) => !d.salesOrderId && d.status === 'Delivered');
  const lifecycle: (typeof CLIENT_LIFECYCLE)[number] = anyDelivered
    ? "Delivered"
    : liveSos.length
      ? "Order received"
      : quotes.length
        ? "Offer given"
        : rfqs.length
          ? "Inquiry received"
          : "Lead";

  const soTotalPKR = liveSos.reduce((t, o) => t + num(o.amountPKR), 0);
  const receivedPKR = payments.reduce((t, p) => t + num(p.amount) * rateOf(p), 0);

  const dates = [c.createdAt?.slice(0, 10), ...[...rfqs, ...quotes, ...sos, ...payments, ...marketing, ...deliveries].map((r) => r.date)]
    .filter(Boolean)
    .sort() as string[];
  const lastActivity = dates.pop();
  const inactiveDays = lastActivity ? (daysBetween(lastActivity, today()) ?? 0) : null;

  return {
    rfqs,
    quotes,
    sos,
    lifecycle,
    rfqStage: latest(rfqs)?.status ?? "—",
    quotationStage: latest(quotes)?.status ?? "—",
    poStage: latest(sos)?.status ?? "—",
    paymentStage: paymentStatus(soTotalPKR, receivedPKR),
    openRfqs: rfqs.filter((r) => stageKind("rfqs", r.status) === "open").length,
    soTotalPKR,
    receivedPKR,
    lastActivity,
    inactiveDays,
    active: inactiveDays !== null && inactiveDays <= s.settings.inactiveDays,
  };
}

// ---------- Supplier ----------
export function supplierInfo(sup: Rec, s: Store) {
  const pos = s.purchaseOrders.filter((p) => p.supplierId === sup.id && p.status !== "Cancelled");
  const purchasedPKR = pos.reduce((t, p) => t + num(p.amountPKR), 0);
  const paidPKR = s.payments
    .filter((p) => p.direction === "Paid" && paymentLinks(p, s).supplierId === sup.id)
    .reduce((t, p) => t + num(p.amount) * rateOf(p), 0);
  return { pos, purchasedPKR, paidPKR, payablePKR: Math.max(0, purchasedPKR - paidPKR) };
}

/**
 * Best supplier prices per product, taken from real costing lines on quotations and
 * purchase orders (unit cost converted to PKR).
 */
export function supplierPrices(s: Store) {
  const rows: { product: string; brand: string; supplierId: string; unitCostPKR: number; date: string; source: string; ref: string }[] = [];
  const push = (doc: Rec, source: string, supplierFallback?: string) => {
    if (stageKind(source === "Purchase order" ? "purchaseOrders" : "quotations", doc.status) === "lost") return;
    for (const it of doc.items ?? []) {
      const supplierId = it.supplierId || supplierFallback;
      const product = it.product || it.description;
      if (!supplierId || !product || num(it.unitCost) <= 0) continue;
      const costRate = source === "Quotation" && doc.purchaseCurrency ? rateOf({ currency: doc.purchaseCurrency, exchangeRate: doc.purchaseExchangeRate ?? doc.exchangeRate }) : rateOf(doc);
      if (costRate <= 0) continue;
      rows.push({
        product,
        brand: it.brand ?? "",
        supplierId,
        unitCostPKR: num(it.unitCost) * costRate,
        date: doc.date,
        source,
        ref: doc.serial,
      });
    }
  };
  s.quotations.forEach((q) => push(q, "Quotation"));
  s.purchaseOrders.forEach((p) => push(p, "Purchase order", p.supplierId));
  return rows;
}

/** Latest price per supplier/product/brand; all tied lowest suppliers qualify. */
export function bestSupplierPrices(s: Store) {
  const latest = new Map<string, ReturnType<typeof supplierPrices>[number]>();
  for (const price of supplierPrices(s)) {
    const key = JSON.stringify([price.supplierId, price.product, price.brand]);
    const old = latest.get(key);
    if (!old || String(price.date) > String(old.date) || (price.date === old.date && price.unitCostPKR < old.unitCostPKR)) latest.set(key, price);
  }
  const current = [...latest.values()];
  return current.filter((p) => !current.some((other) => other.product === p.product && other.brand === p.brand && other.unitCostPKR < p.unitCostPKR));
}
export const priceLabel = (p: { product: string; brand: string }) => [p.product, p.brand].filter(Boolean).join(' · ');
