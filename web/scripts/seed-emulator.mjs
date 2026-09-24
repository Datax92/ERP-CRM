// Fills the LOCAL Firestore emulator (never the cloud) with ~14 months of demo data so the
// reports and graphs have something to show.  Usage: npm run emulators, then npm run seed
const BASE = "http://127.0.0.1:8080/v1/projects/demo-erp/databases/(default)/documents";
const HEADERS = { "Content-Type": "application/json", Authorization: "Bearer owner" }; // emulator-only admin bypass

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => Math.floor(a + rnd() * (b - a + 1));
const id = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
const day = (offset) => new Date(Date.now() + offset * 864e5).toLocaleDateString("en-CA");
const addDays = (date, n) => new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10);
const notFuture = (date) => (date > day(0) ? day(0) : date);

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}

async function put(col, docId, data) {
  const res = await fetch(`${BASE}/${col}/${docId}`, { method: "PATCH", headers: HEADERS, body: JSON.stringify({ fields: toValue(data).mapValue.fields }) });
  if (!res.ok) throw new Error(`${col}/${docId}: ${res.status} ${await res.text()}`);
}

const serials = {};
const serial = (prefix, date) => {
  const y = date.slice(0, 4);
  serials[prefix + y] = (serials[prefix + y] ?? 0) + 1;
  return `${prefix}-${y}-${String(serials[prefix + y]).padStart(4, "0")}`;
};

function totals(doc, mode) {
  const rate = doc.currency === "PKR" ? 1 : doc.exchangeRate;
  let cost = 0, price = 0;
  for (const i of doc.items) { cost += i.qty * i.unitCost; price += i.qty * i.unitPrice; }
  const margin = price - cost;
  const amount = mode === "sale" ? price : cost;
  return { ...doc, totalCost: cost, totalPrice: price, margin, marginPct: price ? (margin / price) * 100 : 0, amount, amountPKR: amount * rate, ...(mode === "sale" ? { totalCostPKR: cost * rate, marginPKR: margin * rate } : {}) };
}

const now = new Date().toISOString();
const stamp = (d) => ({ createdAt: `${d}T09:00:00.000Z`, updatedAt: now, attachments: [] });

const CATALOG = [
  { product: "Water Pump", brand: "Grundfos", cost: 240000 },
  { product: "Control Valve", brand: "Emerson", cost: 85000 },
  { product: "Flow Meter", brand: "Siemens", cost: 160000 },
  { product: "Pressure Transmitter", brand: "Yokogawa", cost: 65000 },
  { product: "Circuit Breaker", brand: "ABB", cost: 45000 },
  { product: "Diesel Generator", brand: "Cummins", cost: 2400000 },
  { product: "PLC Module", brand: "Siemens", cost: 210000 },
];

async function main() {
  const clients = [
    ["Karachi Water & Sewerage Corp", "Sindh", "Water & Sanitation", "Registered"],
    ["Lucky Textile Mills", "Sindh", "Textile", "Registered"],
    ["OGDCL Field Office", "Islamabad Capital Territory", "Oil & Gas", "Registered"],
    ["Punjab Health Dept.", "Punjab", "Healthcare", "In process"],
    ["Fauji Cement", "Punjab", "Construction", "Registered"],
    ["Engro Fertilizers", "Sindh", "Manufacturing", "Unregistered"],
    ["Peshawar Power Co.", "Khyber Pakhtunkhwa", "Power & Energy", "Unregistered"],
    ["Quetta Mining Ltd", "Balochistan", "Other", "Unregistered"],
  ].map(([name, region, sector, registration], i) => ({ id: id(), name, region, sector, registration, country: "Pakistan", email: `buyer${i}@example.test`, ...stamp(day(-430)) }));

  const suppliers = [
    ["Grundfos Middle East", "Middle East", "United Arab Emirates", ["Grundfos"], ["Water Pump"], "LC (Letter of Credit)"],
    ["Emerson Process Asia", "East Asia", "China", ["Emerson"], ["Control Valve", "Pressure Transmitter"], "Advance"],
    ["Siemens Pakistan", "Sindh", "Pakistan", ["Siemens"], ["Flow Meter", "PLC Module"], "Credit"],
    ["ABB Distribution", "Europe", "Germany", ["ABB"], ["Circuit Breaker"], "Advance"],
    ["Cummins Gulf", "Middle East", "Saudi Arabia", ["Cummins"], ["Diesel Generator"], "LC (Letter of Credit)"],
    ["Yokogawa Trading", "East Asia", "Japan", ["Yokogawa", "Emerson"], ["Pressure Transmitter", "Control Valve"], "Credit"],
  ].map(([name, region, country, brands, products, paymentTerms]) => ({ id: id(), name, region, country, brands, products, paymentTerms, ...stamp(day(-430)) }));
  const supplierFor = (product) => suppliers.filter((s) => s.products.includes(product));

  for (const c of clients) await put("clients", c.id, c);
  for (const s of suppliers) await put("suppliers", s.id, s);

  const counts = { rfqs: 0, quotations: 0, salesOrders: 0, purchaseOrders: 0, proformaInvoices: 0, payments: 0, deliveries: 0 };
  for (let n = 0; n < 34; n++) {
    const client = pick(clients.slice(0, 6 + (n % 3)));
    const rfqDate = day(-int(5, 410));
    const lines = Array.from({ length: int(1, 3) }, () => {
      const p = pick(CATALOG);
      return { description: `${p.brand} ${p.product}`, product: p.product, brand: p.brand, supplierId: "", qty: int(1, 8), unit: "Nos", unitCost: 0, unitPrice: 0, _cost: p.cost };
    });
    const r = rnd();
    const rfq = { id: id(), serial: serial("RFQ", rfqDate), date: rfqDate, clientId: client.id, region: client.region, sector: client.sector, dueDate: addDays(rfqDate, 7), status: r < 0.12 ? "Open" : r < 0.2 ? "Regretted" : "Converted", items: lines.map(({ _cost, ...l }) => l), ...stamp(rfqDate) };
    await put("rfqs", rfq.id, rfq); counts.rfqs++;
    if (rfq.status !== "Converted") continue;

    const usd = rnd() < 0.3;
    const rate = usd ? 278 + int(-4, 6) : 1;
    const qDate = notFuture(addDays(rfqDate, int(2, 8)));
    const qItems = lines.map(({ _cost, ...l }) => {
      const sup = pick(supplierFor(l.product));
      const unitCost = Math.round((_cost * (0.9 + rnd() * 0.25)) / rate);
      return { ...l, supplierId: sup.id, unitCost, unitPrice: Math.round(unitCost * (1.08 + rnd() * 0.22)) };
    });
    const qs = rnd();
    const quote = totals({ id: id(), serial: serial("QT", qDate), date: qDate, clientId: client.id, rfqId: rfq.id, region: client.region, sector: client.sector, currency: usd ? "USD" : "PKR", exchangeRate: rate, paymentTerms: pick(["Advance", "Credit", "Partial Advance"]), incoterm: usd ? pick(["CIF", "FOB", "DAP"]) : "DDP", status: qs < 0.55 ? "Won" : qs < 0.72 ? "Lost" : pick(["Sent", "Follow-up", "Negotiation"]), followUpStatus: pick(["Awaiting response", "Followed up", "Negotiating", "Follow-up due"]), nextFollowUpDate: qs > 0.72 ? day(-int(0, 6)) : "", feedback: qs < 0.72 && rnd() < 0.5 ? pick(["Price accepted after discount", "Competitor was cheaper", "Delivery time too long", "Happy with brand and warranty"]) : "", items: qItems, ...stamp(qDate) }, "sale");
    await put("quotations", quote.id, quote); counts.quotations++;
    if (quote.status !== "Won") continue;

    const soDate = notFuture(addDays(qDate, int(3, 12)));
    const soAge = Math.round((Date.now() - Date.parse(soDate)) / 864e5);
    const promise = int(30, 75);
    const done = soAge > promise + 10;
    const so = totals({ id: id(), serial: serial("SO", soDate), date: soDate, clientId: client.id, quotationId: quote.id, clientPoNo: `PO/${int(1000, 9999)}`, region: client.region, sector: client.sector, currency: quote.currency, exchangeRate: rate, paymentTerms: quote.paymentTerms, incoterm: quote.incoterm, shipmentOriginDate: day(-soAge + int(10, 25)), expectedDeliveryDate: day(-soAge + promise), status: done ? pick(["Delivered", "Closed"]) : pick(["PO Issued", "In Transit"]), followUpStatus: "Followed up", items: qItems, ...stamp(soDate) }, "sale");
    await put("salesOrders", so.id, so); counts.salesOrders++;

    const bySup = new Map();
    qItems.forEach((i) => bySup.set(i.supplierId, [...(bySup.get(i.supplierId) ?? []), i]));
    let firstPo = "";
    for (const [supplierId, items] of bySup) {
      const sup = suppliers.find((s) => s.id === supplierId);
      const poDate = day(-soAge + int(1, 4));
      const arrivedLate = rnd() < 0.3;
      const expected = day(-soAge + promise - 7);
      const po = totals({ id: id(), serial: serial("PO", poDate), date: poDate, supplierId, salesOrderId: so.id, currency: so.currency, exchangeRate: rate, paymentTerms: sup.paymentTerms, incoterm: so.incoterm, orderConfirmed: true, confirmationDate: day(-soAge + 5), deliveryPeriodDays: promise - 10, shipmentOriginDate: so.shipmentOriginDate, expectedArrivalDate: expected, actualArrivalDate: done ? day(-soAge + promise - 7 + (arrivedLate ? int(3, 15) : -int(0, 3))) : "", status: done ? "Received" : "Confirmed", items: items.map((i) => ({ ...i, unitPrice: 0 })), ...stamp(poDate) }, "cost");
      await put("purchaseOrders", po.id, po); counts.purchaseOrders++;
      firstPo ||= po.id;
      const paidShare = done ? 1 : sup.paymentTerms === "Advance" ? 1 : rnd() < 0.5 ? 0.3 : 0;
      if (paidShare) {
        const pd = day(-soAge + int(2, 20));
        const pay = { id: id(), serial: serial("PAY", pd), date: pd, direction: "Paid", supplierId, purchaseOrderId: po.id, amount: Math.round(po.amount * paidShare), currency: po.currency, exchangeRate: rate, amountPKR: Math.round(po.amount * paidShare) * rate, paymentType: sup.paymentTerms, method: sup.paymentTerms.startsWith("LC") ? "LC" : "Bank Transfer", reference: `TT${int(10000, 99999)}`, ...stamp(pd) };
        await put("payments", pay.id, pay); counts.payments++;
      }
    }

    const piDate = day(-soAge + 2);
    const pi = totals({ id: id(), serial: serial("PI", piDate), date: piDate, type: "To Client", clientId: client.id, salesOrderId: so.id, currency: so.currency, exchangeRate: rate, paymentTerms: so.paymentTerms, dueDate: day(-soAge + 30), orderConfirmed: true, status: "Sent", items: qItems, ...stamp(piDate) }, "sale");
    await put("proformaInvoices", pi.id, pi); counts.proformaInvoices++;

    const receivedShare = done ? (rnd() < 0.8 ? 1 : 0.6) : so.paymentTerms === "Advance" ? 1 : so.paymentTerms === "Partial Advance" ? 0.4 : 0;
    if (receivedShare) {
      const rd = day(-soAge + (done ? int(promise, promise + 20) : int(3, 10)));
      if (rd <= day(0)) {
        const pay = { id: id(), serial: serial("PAY", rd), date: rd, direction: "Received", clientId: client.id, salesOrderId: so.id, proformaId: pi.id, amount: Math.round(so.amount * receivedShare), currency: so.currency, exchangeRate: rate, amountPKR: Math.round(so.amount * receivedShare) * rate, paymentType: so.paymentTerms, method: pick(["Bank Transfer", "Cheque", "Online"]), reference: `CHQ${int(1000, 9999)}`, ...stamp(rd) };
        await put("payments", pay.id, pay); counts.payments++;
      }
    }

    const dd = day(-soAge + int(15, 30));
    const late = rnd() < 0.35;
    const dn = { id: id(), serial: serial("DN", dd), date: dd, salesOrderId: so.id, clientId: client.id, purchaseOrderId: firstPo, incoterm: so.incoterm, shipmentOriginDate: so.shipmentOriginDate, expectedDeliveryDate: so.expectedDeliveryDate, deliveredDate: done ? day(-soAge + promise + (late ? int(2, 18) : -int(0, 5))) : "", orderConfirmed: done, status: done ? "Delivered" : "In Transit", deliveryNoteNo: `DN${int(100, 999)}`, feedback: done && rnd() < 0.4 ? pick(["Received in good condition", "Late but accepted", "Packaging damaged"]) : "", items: qItems.map((i) => ({ ...i, unitCost: 0, unitPrice: 0 })), ...stamp(dd) };
    await put("deliveries", dn.id, dn); counts.deliveries++;
  }

  // Marketing, expenses, company, investors, account entries
  for (let n = 0; n < 40; n++) {
    const d = day(-int(0, 420));
    const c = rnd() < 0.7 ? pick(clients) : null;
    await put("marketing", id(), { date: d, channel: pick(["Email", "Email", "WhatsApp", "WhatsApp", "Advertisement", "Phone Call", "Visit"]), clientId: c?.id ?? "", prospectName: c ? "" : pick(["Hub Power", "Sapphire Textiles", "KE Distribution"]), product: pick(CATALOG).product, subject: pick(["Product catalogue", "New brand launch", "Year-end offer", "Follow-up"]), response: pick(["No response", "No response", "Interested", "Requested quotation", "Not interested"]), ...stamp(d) });
  }
  for (let m = 0; m < 14; m++) {
    for (const [cat, amt] of [["Salaries", 450000], ["Rent", 120000], ["Utilities", int(25000, 60000)], ["Freight & Customs", int(40000, 200000)]]) {
      const d = day(-m * 30 - int(0, 5));
      const qty = 1;
      await put("expenses", id(), { serial: serial("EXP", d), date: d, kind: "Expense", category: cat, description: `${cat} ${d.slice(0, 7)}`, qty, unitCost: amt, amountValue: amt, amount: amt, amountPKR: amt, currency: "PKR", exchangeRate: 1, method: "Bank Transfer", ...stamp(d) });
    }
    if (m % 3 === 0) {
      const d = day(-m * 30 - 10);
      await put("expenses", id(), { serial: serial("EXP", d), date: d, kind: "Charity", description: "Donation", qty: 1, unitCost: 50000, amountValue: 50000, amount: 50000, amountPKR: 50000, currency: "PKR", exchangeRate: 1, paidTo: "Edhi Foundation", ...stamp(d) });
    }
  }
  const zd = day(-200);
  await put("expenses", id(), { serial: serial("EXP", zd), date: zd, kind: "Zakat", description: "Annual zakat", qty: 1, unitCost: 350000, amountValue: 350000, amount: 350000, amountPKR: 350000, currency: "PKR", exchangeRate: 1, ...stamp(zd) });

  const docs = [
    ["Prequalification", "OGDCL vendor prequalification", day(-300), day(20), 0],
    ["Prequalification", "KWSC enlistment", day(-200), day(160), 0],
    ["Tax", "Income tax return 2025", day(-360), "", 380000],
    ["Tax", "Sales tax Q2", day(-90), "", 145000],
    ["Legal", "Contract review fee", day(-120), "", 60000],
    ["Registration", "SECP registration", day(-900), "", 0],
    ["Certificate", "ISO 9001 certificate", day(-700), day(-5), 0],
  ];
  for (const [category, title, date, expiryDate, amountValue] of docs)
    await put("companyDocs", id(), { category, title, date, expiryDate, docStatus: "Valid", amountValue, amount: amountValue, amountPKR: amountValue, currency: "PKR", exchangeRate: 1, ...stamp(date) });

  for (const [type, name, bank, principal, repaid, date, due] of [["Bank Finance", "Running finance", "Meezan Bank", 5000000, 2000000, day(-380), day(-15 + 365)], ["Investor", "Partner capital", "", 3000000, 0, day(-420), ""], ["Loan", "Director loan", "", 1200000, 1200000, day(-250), day(-20)]])
    await put("investors", id(), { type, name, bank, principal, repaid, date, dueDate: due, status: repaid >= principal ? "Repaid" : "Active", currency: "PKR", exchangeRate: 1, amount: principal, amountPKR: principal, ...stamp(date) });

  for (let m = 0; m < 12; m++) {
    const d = day(-m * 30 - 2);
    await put("financeEntries", id(), { serial: serial("ACC", d), date: d, direction: "Out", category: "Bank Charges", description: "Bank charges", qty: 1, ...((v) => ({ unitCost: v, amountValue: v, amount: v, amountPKR: v }))(int(2000, 9000)), currency: "PKR", exchangeRate: 1, ...stamp(d) });
  }
  await put("meta", "settings", { products: CATALOG.map((c) => c.product), brands: [...new Set(CATALOG.map((c) => c.brand))], companyName: "Demo Trading Co." });
  // Keep the app's serial counters ahead of the seeded numbers.
  const COL = { RFQ: "rfqs", QT: "quotations", SO: "salesOrders", PO: "purchaseOrders", PI: "proformaInvoices", PAY: "payments", DN: "deliveries", EXP: "expenses", ACC: "financeEntries" };
  for (const [key, next] of Object.entries(serials)) {
    const [, prefix, year] = key.match(/^([A-Z]+)(\d{4})$/);
    await put("counters", `${COL[prefix]}-${year}`, { next: Math.max(next, 1) + 1 });
  }
  console.log("Seeded:", counts);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
