import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateEntriesTotal,
  convertCurrency,
  fetchExchangeRates,
  fetchRateToPKR,
  getLiveRate,
  getRecordAmount,
  MAJOR_CURRENCIES,
} from "@/lib/fx";

describe("Currency conversion utilities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("MAJOR_CURRENCIES", () => {
    it("contains standard trading currencies", () => {
      expect(MAJOR_CURRENCIES).toContain("PKR");
      expect(MAJOR_CURRENCIES).toContain("USD");
      expect(MAJOR_CURRENCIES).toContain("EUR");
      expect(MAJOR_CURRENCIES).toContain("AED");
      expect(MAJOR_CURRENCIES).toContain("CNY");
      expect(MAJOR_CURRENCIES).toContain("SAR");
      expect(MAJOR_CURRENCIES).toContain("GBP");
    });
  });

  describe("getLiveRate", () => {
    const fakeRates = {
      base: "USD",
      rates: {
        USD: 1,
        PKR: 280,
        EUR: 0.9,
        AED: 3.67,
        SAR: 3.75,
      },
    };

    it("returns 1 for same currency", () => {
      expect(getLiveRate({ from: "USD", to: "USD", ratesData: fakeRates })).toBe(1);
      expect(getLiveRate({ from: "PKR", to: "PKR", ratesData: fakeRates })).toBe(1);
    });

    it("calculates live cross-rate from USD to foreign currency", () => {
      expect(getLiveRate({ from: "USD", to: "PKR", ratesData: fakeRates })).toBe(280);
      expect(getLiveRate({ from: "USD", to: "EUR", ratesData: fakeRates })).toBe(0.9);
    });

    it("calculates live cross-rate from foreign currency to PKR", () => {
      // 1 EUR = 280 / 0.9 = 311.11 PKR
      const rate = getLiveRate({ from: "EUR", to: "PKR", ratesData: fakeRates });
      expect(rate).toBeCloseTo(311.11, 1);
    });

    it("calculates live cross-rate from PKR to USD", () => {
      const rate = getLiveRate({ from: "PKR", to: "USD", ratesData: fakeRates });
      expect(rate).toBeCloseTo(1 / 280, 5);
    });
  });

  describe("convertCurrency", () => {
    it("returns same amount and rate 1 when from and to currencies match", () => {
      const res = convertCurrency({ amount: 1500, from: "USD", to: "USD" });
      expect(res.converted).toBe(1500);
      expect(res.rate).toBe(1);
    });

    it("converts foreign currency to PKR using document exchange rate", () => {
      const res = convertCurrency({
        amount: 2500,
        from: "USD",
        to: "PKR",
        docRateToPKR: 280,
      });
      expect(res.converted).toBe(700000);
      expect(res.rate).toBe(280);
    });

    it("converts PKR to foreign currency using document exchange rate", () => {
      const res = convertCurrency({
        amount: 700000,
        from: "PKR",
        to: "USD",
        docRateToPKR: 280,
      });
      expect(res.converted).toBe(2500);
      expect(res.rate).toBeCloseTo(1 / 280, 5);
    });

    it("converts between currencies using ratesData", () => {
      const fakeRates = {
        base: "USD",
        rates: {
          USD: 1,
          AED: 3.6725,
          EUR: 0.9,
          PKR: 280,
        },
      };

      const res = convertCurrency({
        amount: 1000,
        from: "USD",
        to: "AED",
        ratesData: fakeRates,
      });
      expect(res.converted).toBe(3672.5);
      expect(res.rate).toBe(3.6725);
    });

    it("prefers realtime rates when preferRealtime is true, ignoring uncalibrated 1 rate", () => {
      const fakeRates = {
        base: "USD",
        rates: {
          USD: 1,
          PKR: 280,
        },
      };

      // Previous record had exchangeRate defaulted to 1
      const res = convertCurrency({
        amount: 1000,
        from: "USD",
        to: "PKR",
        docRateToPKR: 1,
        ratesData: fakeRates,
        preferRealtime: true,
      });

      // Should use 280, NOT 1
      expect(res.converted).toBe(280000);
      expect(res.rate).toBe(280);
    });
  });

  describe("calculateEntriesTotal", () => {
    const fakeRates = {
      base: "USD",
      rates: {
        USD: 1,
        PKR: 280,
        EUR: 0.8,
        AED: 3.5,
      },
    };

    it("calculates total price of quotations in target currency PKR across mixed currencies", () => {
      const rows: any[] = [
        { id: "q1", amount: 1000, currency: "USD", exchangeRate: 275 }, // $1,000 USD
        { id: "q2", amount: 500000, currency: "PKR", exchangeRate: 1 }, // 500,000 PKR
        { id: "q3", amount: 500, currency: "EUR", exchangeRate: 300 }, // €500 EUR (at 280/0.8 = 350 PKR/EUR = 175,000 PKR)
      ];

      // In realtime mode:
      // $1000 USD * 280 = 280,000 PKR
      // 500,000 PKR = 500,000 PKR
      // 500 EUR * 350 = 175,000 PKR
      // Total = 955,000 PKR
      const result = calculateEntriesTotal({
        rows,
        col: "quotations",
        targetCurrency: "PKR",
        ratesData: fakeRates,
        rateMode: "realtime",
      });

      expect(result.count).toBe(3);
      expect(result.total).toBe(955000);
      expect(result.totalPKR).toBe(955000);
      expect(result.currencies["USD"].count).toBe(1);
      expect(result.currencies["USD"].totalAmount).toBe(1000);
      expect(result.currencies["PKR"].count).toBe(1);
      expect(result.currencies["PKR"].totalAmount).toBe(500000);
      expect(result.currencies["EUR"].count).toBe(1);
      expect(result.currencies["EUR"].totalAmount).toBe(500);
    });

    it("switches target currency to USD and converts all entries in real-time", () => {
      const rows: any[] = [
        { id: "q1", amount: 1000, currency: "USD" },
        { id: "q2", amount: 280000, currency: "PKR" }, // 280,000 PKR / 280 = 1,000 USD
      ];

      const result = calculateEntriesTotal({
        rows,
        col: "quotations",
        targetCurrency: "USD",
        ratesData: fakeRates,
        rateMode: "realtime",
      });

      expect(result.total).toBe(2000); // $2,000 USD
      expect(result.targetCurrency).toBe("USD");
      expect(result.totalPKR).toBe(560000); // 560,000 PKR
    });

    it("calculates cost, margin and margin % for sales orders", () => {
      const rows: any[] = [
        { id: "so1", amount: 1000, totalCost: 800, margin: 200, currency: "USD" }, // 20% margin
        { id: "so2", amount: 1000, totalCost: 700, margin: 300, currency: "USD" }, // 30% margin
      ];

      const result = calculateEntriesTotal({
        rows,
        col: "salesOrders",
        targetCurrency: "USD",
        ratesData: fakeRates,
        rateMode: "realtime",
      });

      expect(result.total).toBe(2000);
      expect(result.totalCost).toBe(1500);
      expect(result.totalMargin).toBe(500);
      expect(result.marginPct).toBe(25); // 500 / 2000 * 100 = 25%
    });

    it("calculates received vs paid and net cash for payments", () => {
      const rows: any[] = [
        { id: "p1", amount: 1000, direction: "Received", currency: "USD" },
        { id: "p2", amount: 400, direction: "Paid", currency: "USD" },
      ];

      const result = calculateEntriesTotal({
        rows,
        col: "payments",
        targetCurrency: "USD",
        ratesData: fakeRates,
        rateMode: "realtime",
      });

      expect(result.totalReceived).toBe(1000);
      expect(result.totalPaid).toBe(400);
      expect(result.netPayment).toBe(600);
    });

    it("respects saved document rate when rateMode is set to 'saved'", () => {
      const rows: any[] = [
        // Entry saved at 270 PKR/USD in the past, while current live rate is 280
        { id: "q1", amount: 1000, currency: "USD", exchangeRate: 270 },
      ];

      const savedResult = calculateEntriesTotal({
        rows,
        col: "quotations",
        targetCurrency: "PKR",
        ratesData: fakeRates,
        rateMode: "saved",
      });

      expect(savedResult.total).toBe(270000); // 1000 * 270

      const liveResult = calculateEntriesTotal({
        rows,
        col: "quotations",
        targetCurrency: "PKR",
        ratesData: fakeRates,
        rateMode: "realtime",
      });

      expect(liveResult.total).toBe(280000); // 1000 * 280
    });
  });

  describe("fetchRateToPKR", () => {
    it("returns 1 for PKR without network call", async () => {
      const rate = await fetchRateToPKR("PKR");
      expect(rate).toBe(1);
    });

    it("fetches and parses rate from API", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: "success",
          base_code: "USD",
          rates: { PKR: 278.45 },
        }),
      });

      const rate = await fetchRateToPKR("USD", true);
      expect(rate).toBe(278.45);
    });
  });

  describe("fetchExchangeRates", () => {
    it("caches results to prevent duplicate network calls", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: "success",
          base_code: "CAD",
          rates: { USD: 0.72, PKR: 200 },
        }),
      });
      global.fetch = mockFetch;

      const data1 = await fetchExchangeRates("CAD");
      const data2 = await fetchExchangeRates("CAD");

      expect(data1.rates.USD).toBe(0.72);
      expect(data2.rates.USD).toBe(0.72);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
