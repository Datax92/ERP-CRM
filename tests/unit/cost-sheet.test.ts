import { describe, expect, it } from "vitest";
import { computeCostSheet, withTotals } from "../../src/lib/calc";
import { conversionsFor } from "../../src/lib/workflow";
import type { Rec } from "../../src/lib/types";

describe("Cost Sheet Calculation Engine (Deal Costing)", () => {
  it("computes sale, purchase, and gross margin on basic line items", () => {
    const sheet: Partial<Rec> = {
      currency: "PKR",
      exchangeRate: 1,
      items: [
        {
          product: "Item A",
          brand: "Brand X",
          qty: 100,
          unit: "Pcs",
          unitCost: 1500, // total cost = 150,000
          unitPrice: 2000, // total sale = 200,000
        },
        {
          product: "Item B",
          brand: "Brand Y",
          qty: 50,
          unit: "Pcs",
          unitCost: 3000, // total cost = 150,000
          unitPrice: 4000, // total sale = 200,000
        },
      ],
    };

    const res = computeCostSheet(sheet);

    expect(res.totalQty).toBe(150);
    expect(res.totalSale).toBe(400000);
    expect(res.totalSalePKR).toBe(400000);
    expect(res.totalPurchaseCost).toBe(300000);
    expect(res.totalPurchaseCostPKR).toBe(300000);
    expect(res.grossProfitPKR).toBe(100000);
    expect(res.grossMarginPct).toBe(25); // (100k / 400k) * 100
  });

  it("handles multi-currency deal costing (e.g. Sale in USD, Purchase in EUR)", () => {
    const sheet: Partial<Rec> = {
      currency: "USD",
      exchangeRate: 280, // 1 USD = 280 PKR
      purchaseCurrency: "EUR",
      purchaseExchangeRate: 300, // 1 EUR = 300 PKR
      items: [
        {
          product: "Turbine Blade",
          qty: 10,
          unit: "Set",
          unitCost: 1000, // 10 * 1,000 EUR = 10,000 EUR
          unitPrice: 1500, // 10 * 1,500 USD = 15,000 USD
        },
      ],
    };

    const res = computeCostSheet(sheet);

    expect(res.totalSale).toBe(15000); // USD
    expect(res.totalSalePKR).toBe(15000 * 280); // 4,200,000 PKR
    expect(res.totalPurchaseCost).toBe(10000); // EUR
    expect(res.totalPurchaseCostPKR).toBe(10000 * 300); // 3,000,000 PKR
    expect(res.grossProfitPKR).toBe(1200000); // 4.2M - 3.0M
    expect(res.grossMarginPct).toBeCloseTo((1200000 / 4200000) * 100, 2); // ~28.57%
  });

  it("calculates landed extra costs (freight, customs, C&F, demurrage, insurance, cartage)", () => {
    const sheet: Partial<Rec> = {
      currency: "PKR",
      exchangeRate: 1,
      items: [{ qty: 100, unitCost: 1000, unitPrice: 2000 }], // Sale: 200k, Purchase: 100k
      extraCosts: [
        { category: "Sea Freight", amount: 500, currency: "USD", exchangeRate: 280 }, // 140,000 PKR
        { category: "Customs Duty", amount: 20000, currency: "PKR" }, // 20,000 PKR
        { category: "Clearing & Forwarding (C&F)", amount: 15000, currency: "PKR" }, // 15,000 PKR
        { category: "Port Demurrage", amount: 5000, currency: "PKR" }, // 5,000 PKR
        { category: "Transit Insurance", amount: 4000, currency: "PKR" }, // 4,000 PKR
      ],
      cartageAmount: 6000, // Shortcut field: 6,000 PKR
    };

    const res = computeCostSheet(sheet);

    // 140,000 + 20,000 + 15,000 + 5,000 + 4,000 + 6,000 = 190,000 PKR
    expect(res.totalExtraCostsPKR).toBe(190000);
  });

  it("calculates multiple commission types (% of sale, % of purchase, per unit, flat)", () => {
    const sheet: Partial<Rec> = {
      currency: "PKR",
      exchangeRate: 1,
      items: [{ qty: 200, unitCost: 500, unitPrice: 1000 }], // Sale: 200k, Cost: 100k
      commissions: [
        { agentName: "Agent A", role: "Sales Broker", type: "percent_sale", rate: 2 }, // 2% of 200k = 4,000
        { agentName: "Agent B", role: "Procurement Agent", type: "percent_purchase", rate: 3 }, // 3% of 100k = 3,000
        { agentName: "Agent C", role: "Handling Broker", type: "per_unit", rate: 5 }, // 200 qty * 5 = 1,000
        { agentName: "Agent D", role: "Consultant", type: "flat", rate: 2000 }, // flat 2,000
      ],
    };

    const res = computeCostSheet(sheet);

    // 4000 + 3000 + 1000 + 2000 = 10,000 PKR
    expect(res.totalCommissionPKR).toBe(10000);
    // Gross: 100k, Extra: 0, Comm: 10k -> Operating: 90k
    expect(res.operatingProfitPKR).toBe(90000);
    expect(res.operatingMarginPct).toBe(45); // (90k / 200k) * 100
  });

  it("calculates exact taxes to pay: WHT on sale, WHT on import, Net GST, and Corporate Income Tax", () => {
    const sheet: Partial<Rec> = {
      currency: "PKR",
      exchangeRate: 1,
      items: [{ qty: 100, unitCost: 1000, unitPrice: 2000 }], // Sale: 200k, Cost: 100k
      // Taxes
      whtSaleRate: 5, // 5% WHT on sale = 10,000 PKR
      whtImportRate: 6, // 6% WHT on import cost (100k) = 6,000 PKR
      gstOutputRate: 18, // 18% Output GST on sale (200k) = 36,000 PKR
      gstInputRate: 18, // 18% Input GST on cost (100k) = 18,000 PKR
      // Net GST payable = 36k - 18k = 18,000 PKR
      incomeTaxRate: 29, // 29% corporate income tax on operating profit
    };

    const resWht = computeCostSheet({ ...sheet, taxMode: "wht" });

    expect(resWht.whtSaleAmountPKR).toBe(10000);
    expect(resWht.whtImportAmountPKR).toBe(6000);
    expect(resWht.gstOutputAmountPKR).toBe(36000);
    expect(resWht.gstInputAmountPKR).toBe(18000);
    expect(resWht.netGstPayablePKR).toBe(18000);
    expect(resWht.incomeTaxAmountPKR).toBeCloseTo(29000, 2);

    // In WHT mode: Total Tax Payable = WHT Sale (10k) + WHT Import (6k) + Net GST (18k) = 34,000 PKR
    expect(resWht.totalTaxPayablePKR).toBe(34000);
    // Net profit = 100k operating profit - 10k WHT = 90,000 PKR
    expect(resWht.netProfitPKR).toBe(90000);
    expect(resWht.netMarginPct).toBe(45);

    // In Corporate Income Tax mode
    const resCorp = computeCostSheet({ ...sheet, taxMode: "corporate" });
    // Total Tax Payable = Corporate Tax (29k) + Net GST (18k) = 47,000 PKR
    expect(resCorp.totalTaxPayablePKR).toBeCloseTo(47000, 2);
    // Net Profit = 100k operating profit - 29k corporate tax = 71,000 PKR
    expect(resCorp.netProfitPKR).toBeCloseTo(71000, 2);
    expect(resCorp.netMarginPct).toBeCloseTo(35.5, 2);
  });

  it("calculates landed cost per unit and break-even selling price", () => {
    const sheet: Partial<Rec> = {
      currency: "PKR",
      exchangeRate: 1,
      items: [{ qty: 100, unitCost: 1000, unitPrice: 2000 }], // 100 units @ 1000 = 100,000
      extraCosts: [{ category: "Freight", amount: 20000, currency: "PKR" }], // 20k
      commissionRate: 5,
      commissionType: "percent_sale", // 5% of 200k = 10k
      whtSaleRate: 5, // 5% client withholding tax
    };

    const res = computeCostSheet(sheet);

    // Landed procurement & operational cost = Purchase (100k) + Extra (20k) + Comm (10k) = 130,000 PKR
    expect(res.totalLandedCostPKR).toBe(130000);
    // Landed cost per unit = 130,000 / 100 = 1,300 PKR
    expect(res.landedCostPerUnit).toBe(1300);
    // Break-even selling price (accounting for 5% client WHT deduction): 1,300 / 0.95 = 1,368.42 PKR
    expect(res.breakEvenPricePKR).toBeCloseTo(1368.42, 2);
    expect(res.breakEvenPriceDealCurrency).toBeCloseTo(1368.42, 2);
  });

  it("persists computed cost sheet fields through withTotals", () => {
    const raw: Rec = {
      id: "cs-101",
      currency: "PKR",
      isCostSheet: true,
      items: [{ qty: 50, unitCost: 2000, unitPrice: 3000 }], // Sale: 150k, Cost: 100k
      extraCosts: [{ category: "Clearing", amount: 10000, currency: "PKR" }],
    };

    const saved = withTotals(raw, "sale");

    expect(saved.totalSale).toBe(150000);
    expect(saved.totalPurchaseCost).toBe(100000);
    expect(saved.totalExtraCostsPKR).toBe(10000);
    expect(saved.grossProfitPKR).toBe(50000);
    expect(saved.operatingProfitPKR).toBe(40000);
    expect(saved.amount).toBe(150000);
    expect(saved.amountPKR).toBe(150000);
  });

  it("supports conversion workflow from RFQ to Cost Sheet and Cost Sheet to Quotation", () => {
    const rfq: Rec = {
      id: "rfq-1",
      serial: "RFQ-0001",
      title: "Centrifugal Pumps Tender",
      clientId: "client-1",
      items: [{ product: "Pump 50HP", qty: 4, unitCost: 0, unitPrice: 0 }],
    };

    const emptyStore: any = {
      rfqs: [rfq],
      costSheets: [],
      quotations: [],
    };

    const rfqActions = conversionsFor("rfqs", rfq, emptyStore);
    const prepareCostSheet = rfqActions.find((a) => a.target === "costSheets");
    expect(prepareCostSheet).toBeDefined();
    expect(prepareCostSheet?.label).toBe("Prepare cost sheet");
    expect(prepareCostSheet?.disabled).toBeUndefined();

    // Cost Sheet conversion to Quotation
    const cs: Rec = {
      id: "cs-1",
      serial: "CS-0001",
      title: "Costing for Pumps",
      rfqId: "rfq-1",
      clientId: "client-1",
      items: [{ product: "Pump 50HP", qty: 4, unitCost: 40000, unitPrice: 65000 }],
    };

    const csActions = conversionsFor("costSheets", cs, emptyStore);
    const createQuote = csActions.find((a) => a.target === "quotations");
    expect(createQuote).toBeDefined();
    expect(createQuote?.label).toBe("Create quotation from cost sheet");
    expect(createQuote?.disabled).toBeUndefined();
  });
});
