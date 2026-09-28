import { describe, it, expect, vi, beforeEach } from "vitest";
import { convertCurrency, fetchExchangeRates, fetchRateToPKR, MAJOR_CURRENCIES } from "@/lib/fx";

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

    it("handles cross-currency conversion when base is different", () => {
      const fakeRates = {
        base: "USD",
        rates: {
          USD: 1,
          EUR: 0.8,
          GBP: 0.75,
        },
      };

      // 1000 EUR in GBP via USD rates: 1000 * (0.75 / 0.8) = 937.5
      const res = convertCurrency({
        amount: 1000,
        from: "EUR",
        to: "GBP",
        ratesData: fakeRates,
      });
      expect(res.converted).toBeCloseTo(937.5, 1);
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

      const rate = await fetchRateToPKR("USD");
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
