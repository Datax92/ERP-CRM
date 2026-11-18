import { describe, expect, it } from "vitest";
import { computeCalcSheet, parseCharge } from "../../src/lib/calcSheet";

describe("Calculation sheet (quotation / purchase order)", () => {
  it("parses fixed and percent charges", () => {
    expect(parseCharge("1,500")).toEqual({ pct: false, value: 1500 });
    expect(parseCharge(" 2 %")).toEqual({ pct: true, value: 2 });
    expect(parseCharge("")).toBeNull();
    expect(parseCharge("abc")).toBeNull();
  });

  it("cascades customs duty, sales tax and income tax on the CIF value", () => {
    const r = computeCalcSheet(
      { rows: { freight: "1000", insurance: "1%", customsDuty: "10%", salesTax: "18%", incomeTax: "5%", clearing: "500" } },
      { exWorks: 10000, saleValue: 20000 },
    );
    expect(r.amounts.insurance).toBe(100); // 1% of ex-works
    expect(r.amounts.customsDuty).toBeCloseTo(1110); // 10% of CIF 11,100
    expect(r.amounts.salesTax).toBeCloseTo(2197.8); // 18% of 12,210
    expect(r.amounts.incomeTax).toBeCloseTo(720.39); // 5% of 14,407.8
    expect(r.totalExpenses).toBeCloseTo(1000 + 100 + 1110 + 2197.8 + 720.39 + 500);
    expect(r.landedCost).toBeCloseTo(10000 + r.totalExpenses);
    expect(r.netMargin).toBeCloseTo(20000 - r.landedCost);
  });

  it("uses overrides when given, defaults otherwise", () => {
    expect(computeCalcSheet({ exWorks: 5000, saleValue: null }, { exWorks: 1, saleValue: 8000 })).toMatchObject({ exWorks: 5000, saleValue: 8000, netMargin: 3000 });
    expect(computeCalcSheet(undefined, { exWorks: 0, saleValue: 0 }).netMarginPct).toBe(0);
  });
});
