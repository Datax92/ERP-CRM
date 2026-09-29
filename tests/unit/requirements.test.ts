/**
 * Requirement tests: one block per Excel module (Book1 ERP.xlsx, columns 1–14) plus the
 * conversation's workflow rules. Runs the app's real workflow, derived-status and report code
 * against an in-memory database, walking one order through the whole chain.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

vi.mock("@/lib/db", () => import("./memory-db"));
vi.mock("@/components/RecordDrawer", () => ({ RecordLink: ({ children }: { children: unknown }) => children }));

import { mem, saveRecord, store } from "./memory-db";
import { MODULES, companyDocStatus } from "@/lib/modules";
import { conversionsFor, linkedRecords } from "@/lib/workflow";
import { clientInfo, deliveryInfo, piInfo, poInfo, soInfo, supplierInfo, supplierPrices } from "@/lib/derive";
import { cashFlows, plLines, sumPL } from "@/lib/finance";
import { stageKind } from "@/lib/stages";
import { applyFilters } from "@/components/ModulePage";
import * as R from "@/components/reports";
import type { CollectionName, Rec } from "@/lib/types";

// ---------- helpers mirroring what the record form does on "Save" ----------
async function save(col: CollectionName, data: Partial<Rec>): Promise<Rec> {
  const m = MODULES[col];
  const base = data.id ? mem.data[col].get(data.id) ?? {} : { ...m.defaults(store()), attachments: [] };
  const merged = { ...base, ...data } as Rec;
  const missing = m.fields.filter((f) => f.required && (!f.showIf || f.showIf(merged)) && (merged[f.name] === undefined || merged[f.name] === ""));
  if (missing.length) throw new Error(`${col} missing required: ${missing.map((f) => f.name).join(", ")}`);
  return saveRecord(col, { ...merged, ...(m.compute?.(merged) ?? {}) }, { itemsMode: m.itemsMode?.(merged), amountField: m.amountField, serialPrefix: m.prefix });
}
const get = (col: CollectionName, id: string) => mem.data[col].get(id)!;
async function step(col: CollectionName, id: string, label: string): Promise<Rec> {
  const c = conversionsFor(col, get(col, id), store()).find((x) => x.label.startsWith(label));
  if (!c) throw new Error(`No "${label}" action on ${col}`);
  if (c.disabled) throw new Error(`"${label}" disabled: ${c.disabled}`);
  return c.run();
}
const filterRows = (col: CollectionName, sel: Record<string, string>, extra: Partial<{ q: string; from: string; to: string }> = {}) =>
  applyFilters(MODULES[col], store()[col], { q: "", from: "", to: "", ...extra, sel }, store());
const reportText = (col: CollectionName, fn: (rows: Rec[], s: ReturnType<typeof store>) => unknown) =>
  renderToStaticMarkup(fn(store()[col], store()) as ReactElement).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const ids: Record<string, string> = {};
const USD = { currency: "USD", exchangeRate: 280 };
const attachment = { name: "inquiry.pdf", url: "https://example.test/inquiry.pdf", path: "attachments/rfqs/x/inquiry.pdf", size: 1000, uploadedAt: "2026-01-05" };

beforeAll(async () => {
  mem.reset();
  ids.supA = (await save("suppliers", { name: "Grundfos ME", region: "Middle East", country: "United Arab Emirates", brands: ["Grundfos"], products: ["Water Pump"], paymentTerms: "LC (Letter of Credit)" })).id;
  ids.supB = (await save("suppliers", { name: "Emerson Asia", region: "East Asia", country: "China", brands: ["Emerson"], products: ["Control Valve", "Water Pump"], paymentTerms: "Advance" })).id;
  ids.client = (await save("clients", { name: "Karachi Water Board", email: "buyer@kwb.test", phone: "021-111", mobile: "0300-1", region: "Sindh", country: "Pakistan", sector: "Water & Sanitation", registration: "Registered", registrationNo: "V-77" })).id;
  ids.idle = (await save("clients", { name: "Quetta Mining", region: "Balochistan", sector: "Other", registration: "Unregistered", createdAt: "2025-01-01T00:00:00.000Z" })).id;
});

// =====================================================================================
describe("Excel 2 · CLIENTS DATA", () => {
  it("stores region, country, sectors, client details, contact info, registration", () => {
    const c = get("clients", ids.client);
    expect(c).toMatchObject({ region: "Sindh", country: "Pakistan", sector: "Water & Sanitation", email: "buyer@kwb.test", registration: "Registered" });
  });
  it("new client starts as Lead with no stages", () => {
    const i = clientInfo(get("clients", ids.client), store());
    expect(i.lifecycle).toBe("Lead");
    expect([i.rfqStage, i.quotationStage, i.poStage, i.paymentStage]).toEqual(["—", "—", "—", "—"]);
  });
  it("CLIENT FILTER BY REGION / BY SECTORS / REGISTERED / UN-REGISTERED", () => {
    expect(filterRows("clients", { region: "Sindh" }).map((r) => r.name)).toEqual(["Karachi Water Board"]);
    expect(filterRows("clients", { sector: "Other" }).map((r) => r.name)).toEqual(["Quetta Mining"]);
    expect(filterRows("clients", { registration: "Registered" }).map((r) => r.name)).toEqual(["Karachi Water Board"]);
    expect(filterRows("clients", { registration: "Unregistered" }).map((r) => r.name)).toEqual(["Quetta Mining"]);
  });
});

describe("Excel 5 · RFQ  (conversation: inquiry holds customer, product, qty, attachment)", () => {
  it("client → RFQ carries client, region and sector; client stage becomes 'Inquiry received'", async () => {
    const rfq = await step("clients", ids.client, "New RFQ");
    ids.rfq = rfq.id;
    expect(rfq).toMatchObject({ serial: expect.stringMatching(/^RFQ-\d{4}-0001$/), clientId: ids.client, region: "Sindh", sector: "Water & Sanitation", status: "Open" });
    await save("rfqs", {
      id: rfq.id,
      date: "2026-01-05",
      clientRef: "KWB/T/12",
      attachments: [attachment],
      items: [
        { description: "Pump 50 m3/h", product: "Water Pump", brand: "Grundfos", supplierId: "", qty: 4, unit: "Nos", unitCost: 0, unitPrice: 0 },
        { description: "Valve DN100", product: "Control Valve", brand: "Emerson", supplierId: "", qty: 2, unit: "Nos", unitCost: 0, unitPrice: 0 },
      ],
    });
    const i = clientInfo(get("clients", ids.client), store());
    expect(i.lifecycle).toBe("Inquiry received");
    expect(i.rfqStage).toBe("Open");
  });
  it("OPEN RFQ / FILTER RFQ BY REGION / BY SECTOR / by product", () => {
    expect(stageKind("rfqs", get("rfqs", ids.rfq).status)).toBe("open");
    expect(filterRows("rfqs", { region: "Sindh" })).toHaveLength(1);
    expect(filterRows("rfqs", { region: "Punjab" })).toHaveLength(0);
    expect(filterRows("rfqs", { sector: "Water & Sanitation" })).toHaveLength(1);
    expect(filterRows("rfqs", { product: "Control Valve" })).toHaveLength(1);
  });
  it("COMPARISON BY DATE: date range filter", () => {
    expect(filterRows("rfqs", {}, { from: "2026-01-01", to: "2026-01-31" })).toHaveLength(1);
    expect(filterRows("rfqs", {}, { from: "2026-02-01" })).toHaveLength(0);
  });
});

describe("Excel 6 · QUOTATION", () => {
  it("RFQ → quotation keeps items, client, region, sector and attachments; RFQ becomes Converted (CONVERTED IN PROPOSAL)", async () => {
    const q = await step("rfqs", ids.rfq, "Convert to quotation");
    ids.quote = q.id;
    expect(q).toMatchObject({ rfqId: ids.rfq, clientId: ids.client, region: "Sindh", sector: "Water & Sanitation", status: "Draft" });
    expect(q.items.map((i: Rec) => [i.product, i.qty])).toEqual([["Water Pump", 4], ["Control Valve", 2]]);
    expect(q.attachments[0].name).toBe("inquiry.pdf");
    expect(get("rfqs", ids.rfq).status).toBe("Converted");
    expect(stageKind("rfqs", "Converted")).toBe("won");
    expect(conversionsFor("rfqs", get("rfqs", ids.rfq), store())[0].disabled).toMatch(/Already quoted/);
  });
  it("COSTING, offered rate → TOTAL PRICE, MARGIN, MARGIN %, TOTAL IN FOREIGN/PKR", async () => {
    const q = get("quotations", ids.quote);
    const saved = await save("quotations", {
      id: ids.quote,
      date: "2026-01-10",
      ...USD,
      status: "Sent",
      followUpStatus: "Awaiting response",
      feedback: "Client asked for 5% discount",
      items: [
        { ...q.items[0], supplierId: ids.supA, unitCost: 800, unitPrice: 1000 },
        { ...q.items[1], supplierId: ids.supB, unitCost: 300, unitPrice: 390 },
      ],
    });
    expect(saved.totalCost).toBe(3800);
    expect(saved.totalPrice).toBe(4780);
    expect(saved.margin).toBe(980);
    expect(saved.marginPct).toBeCloseTo(20.502, 2);
    expect(saved.amountPKR).toBe(4780 * 280);
    expect(saved.marginPKR).toBe(980 * 280);
    expect(clientInfo(get("clients", ids.client), store())).toMatchObject({ lifecycle: "Offer given", quotationStage: "Sent" });
  });
  it("STATUS: FOLLOW UP and FEEDBACK are filterable", () => {
    expect(filterRows("quotations", { followUpStatus: "Awaiting response" })).toHaveLength(1);
  });
});

describe("Excel 7 · SALE ORDER  (conversation: quotation converts to SO and carries data)", () => {
  it("quotation → SO copies items, prices, currency, client; quotation becomes Won (CONVERTED SO)", async () => {
    const so = await step("quotations", ids.quote, "Convert to sales order");
    ids.so = so.id;
    expect(so).toMatchObject({ quotationId: ids.quote, clientId: ids.client, currency: "USD", exchangeRate: 280, amount: 4780, margin: 980 });
    expect(get("quotations", ids.quote).status).toBe("Won");
    expect(stageKind("quotations", "Won")).toBe("won");
    await save("salesOrders", { id: so.id, date: "2026-01-15", clientPoNo: "KWB-PO-9", incoterm: "CIF", paymentTerms: "Partial Advance", shipmentOriginDate: "2026-02-10", expectedDeliveryDate: "2026-03-10" });
    expect(clientInfo(get("clients", ids.client), store())).toMatchObject({ lifecycle: "Order received", poStage: "Open" });
  });
  it("offers one PO per supplier named on the lines (PO ISSUED SUPPLIER)", () => {
    const labels = conversionsFor("salesOrders", get("salesOrders", ids.so), store()).map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["Issue PO to Grundfos ME", "Issue PO to Emerson Asia", "Create proforma invoice to client", "Create delivery", "Record payment received"]));
  });
});

describe("Excel 8 · PURCHASE ORDER  (conversation: supplier order linked to supplier)", () => {
  it("SO → POs per supplier with supplier terms; SO moves to 'PO Issued'", async () => {
    const poA = await step("salesOrders", ids.so, "Issue PO to Grundfos ME");
    const poB = await step("salesOrders", ids.so, "Issue PO to Emerson Asia");
    ids.poA = poA.id;
    ids.poB = poB.id;
    expect(poA).toMatchObject({ supplierId: ids.supA, salesOrderId: ids.so, paymentTerms: "LC (Letter of Credit)", amount: 3200 });
    expect(poB).toMatchObject({ supplierId: ids.supB, paymentTerms: "Advance", amount: 600 });
    expect(get("salesOrders", ids.so).status).toBe("PO Issued");
    const info = soInfo(get("salesOrders", ids.so), store());
    expect(info.poIssued).toBe(true);
    expect(info.suppliers.sort()).toEqual(["Emerson Asia", "Grundfos ME"]);
    expect(info.costPKR).toBe(3800 * 280);
    expect(info.costIsActual).toBe(true);
    expect(conversionsFor("salesOrders", get("salesOrders", ids.so), store()).find((c) => c.label === "Issue PO to Grundfos ME")?.disabled).toMatch(/already issued/);
  });
  it("PO MARGIN / MARGIN % from the SO selling rates", () => {
    const i = poInfo(get("purchaseOrders", ids.poA), store());
    expect(i.salePKR).toBe(4000 * 280);
    expect(i.marginPKR).toBe(800 * 280);
  });
  it("order confirmation, DELIVERY PERIOD, SHIPMENT DATE (ORIGIN), LATE DELIVERY (DAYS)", async () => {
    await save("purchaseOrders", { id: ids.poA, date: "2026-01-16", status: "Received", orderConfirmed: true, confirmationDate: "2026-01-18", deliveryPeriodDays: 35, shipmentOriginDate: "2026-02-10", expectedArrivalDate: "2026-02-20", actualArrivalDate: "2026-02-25" });
    await save("purchaseOrders", { id: ids.poB, date: "2026-01-16", status: "Confirmed", orderConfirmed: true, deliveryPeriodDays: 20 });
    const i = poInfo(get("purchaseOrders", ids.poA), store());
    expect(i.late).toEqual({ days: 5, overdue: false });
    expect(i.delivered).toBe(true);
  });
  it("PAYMENT TO VENDOR: full LC payment marks PO paid; supplier payable drops", async () => {
    const pay = await step("purchaseOrders", ids.poA, "Record payment to vendor");
    expect(pay).toMatchObject({ direction: "Paid", supplierId: ids.supA, purchaseOrderId: ids.poA, amount: 3200, currency: "USD" });
    await save("payments", { id: pay.id, date: "2026-01-20", method: "LC", paymentType: "LC (Letter of Credit)" });
    expect(poInfo(get("purchaseOrders", ids.poA), store())).toMatchObject({ payment: "Paid", outstanding: 0 });
    expect(supplierInfo(get("suppliers", ids.supA), store()).payablePKR).toBe(0);
    expect(supplierInfo(get("suppliers", ids.supB), store()).payablePKR).toBe(600 * 280);
  });
});

describe("Excel 9 · PROFORMA INVOICE  (conversation: sent to client, pending, what remains)", () => {
  it("SO → client PI carries items and totals", async () => {
    const pi = await step("salesOrders", ids.so, "Create proforma invoice to client");
    ids.pi = pi.id;
    expect(pi).toMatchObject({ type: "To Client", clientId: ids.client, salesOrderId: ids.so, amount: 4780, currency: "USD" });
    await save("proformaInvoices", { id: pi.id, date: "2026-01-17", status: "Sent", orderConfirmed: true, dueDate: "2026-02-01" });
  });
  it("PAYMENT RECEIPT partial → pending amount, 'Partially paid' on PI, SO and client", async () => {
    const pay = await step("proformaInvoices", ids.pi, "Record payment received");
    expect(pay).toMatchObject({ direction: "Received", proformaId: ids.pi, salesOrderId: ids.so, clientId: ids.client, amount: 4780 });
    await save("payments", { id: pay.id, amount: 2000, date: "2026-01-25", method: "Bank Transfer", paymentType: "Partial Advance" });
    expect(piInfo(get("proformaInvoices", ids.pi), store())).toMatchObject({ paid: 2000, pending: 2780, status: "Partially paid", methods: ["Bank Transfer"] });
    expect(soInfo(get("salesOrders", ids.so), store())).toMatchObject({ received: 2000, outstanding: 2780, payment: "Partially paid" });
    expect(clientInfo(get("clients", ids.client), store()).paymentStage).toBe("Partially paid");
  });
  it("a PKR payment against a USD proforma is converted at the document rate", async () => {
    const pay = await step("proformaInvoices", ids.pi, "Record payment received");
    await save("payments", { id: pay.id, amount: 2780 * 280, currency: "PKR", exchangeRate: 1, date: "2026-03-01", method: "Cheque" });
    expect(piInfo(get("proformaInvoices", ids.pi), store())).toMatchObject({ status: "Paid", pending: 0 });
    expect(clientInfo(get("clients", ids.client), store()).paymentStage).toBe("Paid");
  });
  it("a payment recorded on the order (not the proforma) still settles the order's only proforma", () => {
    // The LC payment on PO-A was recorded against the PO; a supplier PI raised now for PO-A is already paid.
    const po = get("purchaseOrders", ids.poA);
    const fake = { id: "tmp-pi", type: "From Supplier", purchaseOrderId: po.id, amount: 3200, currency: "USD", exchangeRate: 280, status: "Sent" };
    const s = store();
    s.proformaInvoices.push(fake);
    expect(piInfo(fake, s)).toMatchObject({ paid: 3200, status: "Paid", methods: ["LC"] });
  });
  it("PI ISSUED SUPPLIER: supplier proforma from PO, paid to vendor (advance)", async () => {
    const spi = await step("purchaseOrders", ids.poB, "Record supplier proforma");
    ids.spi = spi.id;
    expect(spi).toMatchObject({ type: "From Supplier", supplierId: ids.supB, purchaseOrderId: ids.poB, amount: 600 });
    const pay = await step("proformaInvoices", spi.id, "Record payment to vendor");
    expect(pay).toMatchObject({ direction: "Paid", supplierId: ids.supB, purchaseOrderId: ids.poB, proformaId: spi.id, amount: 600 });
    await save("payments", { id: pay.id, date: "2026-01-19", method: "Bank Transfer" });
    expect(piInfo(get("proformaInvoices", spi.id), store()).status).toBe("Paid");
    expect(poInfo(get("purchaseOrders", ids.poB), store()).payment).toBe("Paid");
  });
});

describe("Excel 11 · DELIVERY MODULE", () => {
  it("SO → delivery carries Incoterm, shipment dates, client and PO", async () => {
    const d = await step("salesOrders", ids.so, "Create delivery");
    ids.dn = d.id;
    expect(d).toMatchObject({ salesOrderId: ids.so, clientId: ids.client, incoterm: "CIF", shipmentOriginDate: "2026-02-10", expectedDeliveryDate: "2026-03-10", purchaseOrderId: ids.poA });
    expect(d.items).toHaveLength(2);
  });
  it("DELIVERED, LATE DELIVERY (DAYS), DELIVERY PERIOD, ORDER CONFIRMATION", async () => {
    await save("deliveries", { id: ids.dn, date: "2026-03-05", status: "Delivered", deliveredDate: "2026-03-20", orderConfirmed: true, feedback: "Received in good condition" });
    const i = deliveryInfo(get("deliveries", ids.dn), store());
    expect(i.late).toEqual({ days: 10, overdue: false });
    expect(i.periodDays).toBe(38);
    const so = soInfo(get("salesOrders", ids.so), store());
    expect(so.delivered).toBe(true);
    expect(so.deliveredDate).toBe("2026-03-20");
    expect(so.late).toEqual({ days: 10, overdue: false });
    expect(clientInfo(get("clients", ids.client), store()).lifecycle).toBe("Delivered");
  });
  it("TOTAL PRICE, MARGIN, PAYMENT RECEIPT, PAYMENT TO VENDOR, PAYMENT METHOD via the linked order", () => {
    const i = deliveryInfo(get("deliveries", ids.dn), store());
    expect(i.valuePKR).toBe(4780 * 280);
    expect(i.marginPKR).toBe(980 * 280);
    expect(i.receivedPKR).toBe(4780 * 280);
    expect(i.vendorPaidPKR).toBe(3800 * 280);
    expect(new Set(i.methods)).toEqual(new Set(["Bank Transfer", "Cheque", "LC"]));
    expect(piInfo(get("proformaInvoices", ids.pi), store()).delivered).toBe(true);
  });
  it("every document links back and forward (interconnection)", () => {
    const soLinks = linkedRecords("salesOrders", get("salesOrders", ids.so), store()).map((l) => l.col);
    expect(soLinks).toEqual(expect.arrayContaining(["quotations", "purchaseOrders", "proformaInvoices", "deliveries", "payments"]));
    expect(linkedRecords("quotations", get("quotations", ids.quote), store()).map((l) => l.col)).toEqual(expect.arrayContaining(["rfqs", "salesOrders"]));
    expect(linkedRecords("purchaseOrders", get("purchaseOrders", ids.poB), store()).map((l) => l.col)).toEqual(expect.arrayContaining(["salesOrders", "proformaInvoices", "payments"]));
    const clientLinks = new Set(linkedRecords("clients", get("clients", ids.client), store()).map((l) => l.col));
    expect([...clientLinks].sort()).toEqual(["deliveries", "payments", "proformaInvoices", "quotations", "rfqs", "salesOrders"]);
  });
});

describe("Excel 3 · SUPPLIERS DATA", () => {
  it("SUPPLIER FILTER BY REGION / BY PRODUCT / BY BRAND", () => {
    expect(filterRows("suppliers", { region: "East Asia" }).map((r) => r.name)).toEqual(["Emerson Asia"]);
    expect(filterRows("suppliers", { product: "Water Pump" })).toHaveLength(2);
    expect(filterRows("suppliers", { brand: "Grundfos" }).map((r) => r.name)).toEqual(["Grundfos ME"]);
  });
  it("FILTER BY BEST PRICE uses real costing lines", async () => {
    // A second quotation where Emerson offers the pump cheaper
    await save("quotations", { date: "2026-02-01", clientId: ids.idle, status: "Sent", items: [{ description: "Pump", product: "Water Pump", brand: "Grundfos", supplierId: ids.supB, qty: 1, unit: "Nos", unitCost: 200000, unitPrice: 250000 }] });
    const pumps = supplierPrices(store()).filter((p) => p.product === "Water Pump").sort((a, b) => a.unitCostPKR - b.unitCostPKR);
    expect(pumps[0]).toMatchObject({ supplierId: ids.supB, unitCostPKR: 200000 });
    expect(pumps.some((p) => p.supplierId === ids.supA && p.unitCostPKR === 800 * 280)).toBe(true);
  });
});

describe("Excel 4 · MARKETING", () => {
  it("BY EMAILS / BY WHATSAPP / ADVERTISEMENT BY PRODUCT, CLIENT RESPONSE", async () => {
    await save("marketing", { date: "2026-02-02", channel: "WhatsApp", clientId: ids.client, product: "Water Pump", response: "Interested" });
    await save("marketing", { date: "2026-02-03", channel: "Advertisement", prospectName: "Hub Power", product: "Control Valve", response: "No response" });
    await save("marketing", { date: "2026-02-04", channel: "Email", clientId: ids.idle, product: "Water Pump", response: "Requested quotation" });
    expect(filterRows("marketing", { channel: "WhatsApp" })).toHaveLength(1);
    expect(filterRows("marketing", { product: "Water Pump" })).toHaveLength(2);
    expect(filterRows("marketing", { response: "No response" })).toHaveLength(1);
  });
  it("ACTIVE / NON ACTIVE client and HOW MUCH TIME NON ACTIVE", async () => {
    await save("clients", { name: "Dormant Co", region: "Punjab", createdAt: "2024-01-01T00:00:00.000Z" });
    const dormant = [...mem.data.clients.values()].find((c) => c.name === "Dormant Co")!;
    const i = clientInfo(dormant, store());
    expect(i.active).toBe(false);
    expect(i.inactiveDays).toBeGreaterThan(600);
    expect(filterRows("clients", { active: "Inactive" }).map((c) => c.name)).toContain("Dormant Co");
  });
});

describe("Excel 1 · COMPANY", () => {
  it("PREQUALIFICATION DOCS / TAXES / LEGAL EXPENSES; DOCS STATUS from expiry", async () => {
    const soon = new Date(Date.now() + 10 * 864e5).toLocaleDateString("en-CA");
    await save("companyDocs", { category: "Prequalification", title: "OGDCL enlistment", date: "2025-06-01", expiryDate: soon });
    await save("companyDocs", { category: "Certificate", title: "ISO 9001", date: "2023-01-01", expiryDate: "2025-12-31" });
    await save("companyDocs", { category: "Tax", title: "Income tax 2025", date: "2026-02-15", amountValue: 30000 });
    const docs = [...mem.data.companyDocs.values()];
    expect(docs.map(companyDocStatus).sort()).toEqual(["Expired", "Expiring soon", "Valid"]);
    expect(docs.find((d) => d.category === "Tax")!.amountPKR).toBe(30000);
  });
});

describe("Excel 10, 12, 13, 14 · INVESTORS, ACCOUNT/FINANCE, EXPENSES/CHARITY/ZAKAT, PROFIT/LOSS", () => {
  it("records investor loan, expenses (qty × costing), charity, zakat, account entry", async () => {
    await save("investors", { type: "Loan", name: "Director loan", bank: "Meezan", date: "2026-01-02", principal: 500000, repaid: 100000 });
    await save("expenses", { kind: "Expense", category: "Rent", description: "Office rent", date: "2026-02-01", qty: 2, unitCost: 25000 });
    await save("expenses", { kind: "Charity", description: "Donation", date: "2026-02-10", qty: 1, unitCost: 10000 });
    await save("expenses", { kind: "Zakat", description: "Zakat", date: "2026-02-11", qty: 1, unitCost: 20000 });
    const acc = await save("financeEntries", { direction: "Out", category: "Bank Charges", description: "LC charges", date: "2026-01-21", qty: 1, unitCost: 1000 });
    expect(acc).toMatchObject({ amountValue: 1000, amountPKR: 1000, serial: expect.stringMatching(/^ACC-/) });
    expect([...mem.data.expenses.values()].find((e) => e.description === "Office rent")!.amountPKR).toBe(50000);
  });
  it("PROFIT/LOSS (orders basis) = SO revenue − PO cost − expenses, taxes, bank charges", () => {
    const s = store();
    // exclude the second (unconverted) quotation — P/L uses sales orders only
    const t = sumPL(plLines(s, "orders"));
    expect(t.revenue).toBe(4780 * 280);
    expect(t.cost).toBe(3800 * 280);
    expect(t.gross).toBe(980 * 280);
    expect(t.opex).toBe(50000 + 30000 + 1000);
    expect(t.net).toBe(980 * 280 - 81000);
    expect(t.charity).toBe(10000);
    expect(t.zakat).toBe(20000);
    expect(t.afterGiving).toBe(980 * 280 - 81000 - 30000);
  });
  it("PROFIT/LOSS (cash basis) = payments received − payments to vendors", () => {
    const t = sumPL(plLines(store(), "cash"));
    expect(t.revenue).toBe(4780 * 280);
    expect(t.cost).toBe(3800 * 280);
  });
  it("ACCOUNT/FINANCE cash flow pulls every money movement from the other modules", () => {
    const f = cashFlows(store());
    const sum = (dir: string) => f.filter((x) => x.dir === dir).reduce((a, x) => a + x.pkr, 0);
    expect(sum("in")).toBe(4780 * 280 + 500000);
    expect(sum("out")).toBe(3800 * 280 + 50000 + 10000 + 20000 + 1000 + 30000);
    expect(new Set(f.map((x) => x.col))).toEqual(new Set(["payments", "expenses", "financeEntries", "investors", "companyDocs"]));
  });
});

// =====================================================================================
// Every REPORTING/DASHBOARD row of the Excel must appear in that module's report.
const EXCEL_REPORTS: [string, CollectionName, (rows: Rec[], s: ReturnType<typeof store>) => unknown, string[]][] = [
  ["COMPANY", "companyDocs", R.companyReport, ["Document status", "Taxes & legal expenses by year", "Expired or expiring documents"]],
  ["CLIENTS DATA", "clients", R.clientsReport, ["Clients by region", "Clients by sector", "Registered", "Unregistered", "RFQ stage", "Quotation stage", "PO stage", "Payment stage"]],
  ["SUPPLIERS DATA", "suppliers", R.suppliersReport, ["Suppliers by region", "Suppliers per product", "Suppliers per brand", "Best price by product"]],
  ["MARKETING", "marketing", R.marketingReport, ["Client approach by date", "Client response", "Product-wise approach", "Active clients", "Non-active clients", "How long clients have been non-active"]],
  ["RFQ", "rfqs", R.pipelineReport("rfqs"), ["Comparison by date", "Comparison by client", "Total RFQs", "Open", "Closed – unsuccessful", "Converted to proposal", "By region", "By sector"]],
  ["QUOTATION", "quotations", R.pipelineReport("quotations"), ["Comparison by date", "Comparison by client", "Total documents", "Open", "Closed – success", "Closed – unsuccessful", "Total price (PKR)", "Margin", "Follow-up status", "Recent feedback", "Converted to SO", "Total in foreign currency / PKR", "Product-wise"]],
  ["SALE ORDER", "salesOrders", R.pipelineReport("salesOrders"), ["Comparison by date", "Comparison by client", "Total documents", "Open", "Closed – success", "Total price (PKR)", "Margin", "Follow-up status", "Recent feedback", "Delivered", "Total in foreign currency / PKR", "PO issued to supplier", "Shipment (origin)", "Shipment (delivery)", "Incoterms", "Late deliveries"]],
  ["PURCHASE ORDER", "purchaseOrders", R.pipelineReport("purchaseOrders"), ["Comparison by date", "Comparison by client", "Total documents", "Open", "Closed – success", "Total cost (PKR)", "Margin", "Follow-up status", "Recent feedback", "Delivered", "Total in foreign currency / PKR", "Payment to vendors", "Delivery period", "Shipment (origin)", "Late deliveries from suppliers"]],
  ["PROFORMA INVOICE", "proformaInvoices", R.pipelineReport("proformaInvoices"), ["Comparison by date", "Comparison by client", "Total documents", "Open", "Closed – success", "Total price (PKR)", "Follow-up status", "Recent feedback", "Delivered", "Total in foreign currency / PKR", "PI issued by suppliers", "paid to vendors", "Order confirmation", "Payment receipt", "Payment method"]],
  ["DELIVERY MODULE", "deliveries", R.pipelineReport("deliveries"), ["Comparison by date", "Comparison by client", "Total documents", "Open", "Closed – success", "Total price (PKR)", "Margin", "Recent feedback", "Payment to vendor", "Order confirmation", "Payment receipt", "Payment method", "Late deliveries"]],
  ["EXPANSES/CHARITY/ZAKAT", "expenses", R.expensesReport, ["By month (PKR)", "Year comparison (PKR)", "Charity", "Zakat"]],
  ["INVESTORS", "investors", R.investorsReport, ["Total received (PKR)", "Outstanding"]],
];

describe("Excel REPORTING/DASHBOARD rows are all present in each module's report", () => {
  for (const [name, col, fn, labels] of EXCEL_REPORTS) {
    it(name, () => {
      const text = reportText(col, fn);
      const missing = labels.filter((l) => !text.includes(l));
      expect(missing, `missing in ${name} report`).toEqual([]);
    });
  }
  it("quotation report numbers match the records", () => {
    const text = reportText("quotations", R.pipelineReport("quotations"));
    expect(text).toMatch(/Total documents 2 /);
    expect(text).toMatch(/Converted to SO 1 /);
  });
});
