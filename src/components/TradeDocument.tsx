"use client";

import { fmtDate, fmtMoney, fmtNum, itemTotals, num } from "@/lib/calc";
import { documentClientId, type Store } from "@/lib/derive";
import type { CollectionName, Rec } from "@/lib/types";

/** The documents the ERP can print, with what each one is called on paper. */
export const PRINTABLE: Partial<Record<CollectionName, string>> = {
  quotations: "Quotation",
  salesOrders: "Sales Order",
  purchaseOrders: "Purchase Order",
  proformaInvoices: "Proforma Invoice",
  deliveries: "Delivery Note",
};

type Party = { heading: string; name: string; lines: string[] };

function partyOf(col: CollectionName, r: Rec, s: Store): Party {
  const supplierSide = col === "purchaseOrders" || (col === "proformaInvoices" && r.type === "From Supplier");
  const p = supplierSide ? s.byId.suppliers.get(r.supplierId) : s.byId.clients.get(documentClientId(r, s));
  return {
    heading: supplierSide ? "Supplier" : col === "deliveries" ? "Deliver to" : "Customer",
    name: p?.name ?? "—",
    lines: [p?.contactPerson && `Attn: ${p.contactPerson}${p.jobTitle ? `, ${p.jobTitle}` : ""}`, p?.address, p?.plant && `Site: ${p.plant}`, [p?.phone || p?.mobile, p?.email].filter(Boolean).join(" · "), p?.country].filter(Boolean) as string[],
  };
}

function metaOf(col: CollectionName, r: Rec, s: Store): [string, string][] {
  const so = r.salesOrderId ? s.byId.salesOrders.get(r.salesOrderId) : col === "salesOrders" ? r : undefined;
  const rfq = r.rfqId ? s.byId.rfqs.get(r.rfqId) : undefined;
  const rows: [string, string | undefined][] = [
    [`${PRINTABLE[col]} no.`, r.serial],
    ["Date", fmtDate(r.date)],
    ["Your reference", col === "quotations" ? rfq?.clientRef || rfq?.serial : col === "salesOrders" ? r.clientPoNo : col === "deliveries" ? so?.clientPoNo : undefined],
    ["Your PO date", col === "salesOrders" ? fmtDate(r.clientPoDate) : undefined],
    ["Sales order", col !== "salesOrders" ? so?.serial : undefined],
    ["Supplier's PI no.", col === "proformaInvoices" ? r.supplierRef : undefined],
    ["Valid until", col === "quotations" ? fmtDate(r.validUntil) : undefined],
    ["Incoterm", r.incoterm],
    ["Payment terms", r.paymentTerms],
    ["Payment due", col === "proformaInvoices" ? fmtDate(r.dueDate) : undefined],
    ["Delivery date", fmtDate(col === "purchaseOrders" ? r.expectedArrivalDate : r.expectedDeliveryDate) || undefined],
    ["Origin", r.origin],
    ["Delivery note / AWB / BL", col === "deliveries" ? r.deliveryNoteNo : undefined],
    ["Dispatched", col === "deliveries" ? fmtDate(r.date) : undefined],
    ["Currency", col !== "deliveries" ? r.currency || "PKR" : undefined],
  ];
  return rows.filter(([k, v]) => v && !(k === "Date" && col === "deliveries")) as [string, string][];
}

export function TradeDocument({ col, r, s, title }: { col: CollectionName; r: Rec; s: Store; title: string }) {
  const party = partyOf(col, r, s);
  const items: Rec[] = r.items ?? [];
  const priced = col !== "deliveries";
  const costSide = col === "purchaseOrders" || (col === "proformaInvoices" && r.type === "From Supplier");
  const unit = (i: Rec) => num(costSide ? i.unitCost : i.unitPrice);
  const totals = itemTotals(items as never);
  const total = num(r.amount) || (costSide ? totals.totalCost : totals.totalPrice);
  const cur = r.currency || "PKR";
  const terms = (s.settings.documentTerms || "").trim();
  const notes = String(r.notes || "").trim();
  const company = s.settings.companyName && s.settings.companyName !== "My Company" ? s.settings.companyName : "A & Sons Tradeway";
  return (
    <article className="trade-doc">
      <header className="trade-doc-head">
        <div>
          <h1>{company}</h1>
          {s.settings.companyDetails.split("\n").filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
        </div>
        <div className="trade-doc-title">
          <h2>{title}</h2>
          <p>{r.serial}</p>
        </div>
      </header>

      <section className="trade-doc-parties">
        <div>
          <h3>{party.heading}</h3>
          <b>{party.name}</b>
          {party.lines.map((l, i) => <p key={i}>{l}</p>)}
        </div>
        <dl>
          {metaOf(col, r, s).map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </section>

      <table className="trade-doc-items">
        <thead>
          <tr>
            <th>Sr.</th>
            <th>Description</th>
            <th>Brand / make</th>
            <th className="r">Qty</th>
            <th>Unit</th>
            {priced && <th className="r">Unit price</th>}
            {priced && <th className="r">Amount</th>}
            {!priced && <th>Remarks</th>}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={priced ? 7 : 6} className="muted">No line items.</td></tr>
          ) : items.map((i, n) => (
            <tr key={n}>
              <td>{n + 1}</td>
              <td>{[i.description, i.product && i.product !== i.description ? i.product : ""].filter(Boolean).join(" — ")}</td>
              <td>{i.brand || ""}</td>
              <td className="r">{fmtNum(i.qty, 2)}</td>
              <td>{i.unit || ""}</td>
              {priced && <td className="r">{fmtNum(unit(i), 2)}</td>}
              {priced && <td className="r">{fmtNum(num(i.qty) * unit(i), 2)}</td>}
              {!priced && <td />}
            </tr>
          ))}
        </tbody>
        {priced && (
          <tfoot>
            <tr>
              <td colSpan={5} />
              <th className="r">Total</th>
              <th className="r">{fmtMoney(total, cur)}</th>
            </tr>
          </tfoot>
        )}
      </table>

      {notes && <section className="trade-doc-notes"><h3>Notes</h3><p>{notes}</p></section>}
      {terms && col !== "deliveries" && <section className="trade-doc-notes"><h3>Terms & conditions</h3><p>{terms}</p></section>}

      <footer className="trade-doc-sign">
        <div><span />{col === "deliveries" ? "Delivered by" : "Prepared by"}</div>
        <div><span />{col === "deliveries" ? "Received by (name, signature & stamp)" : col === "purchaseOrders" ? "Authorised signatory" : "For " + company}</div>
      </footer>
    </article>
  );
}
