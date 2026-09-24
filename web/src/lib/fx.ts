/**
 * Latest rate for 1 unit of `currency` in PKR, from the free open.er-api.com feed
 * (daily reference rates, no API key). The user can always override the value.
 */
export async function fetchRateToPKR(currency: string): Promise<number> {
  if (currency === "PKR") return 1;
  const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(currency)}`);
  if (!res.ok) throw new Error(`Rate service returned ${res.status}`);
  const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
  const rate = data.rates?.PKR;
  if (data.result !== "success" || !rate) throw new Error("PKR rate not available");
  return Math.round(rate * 100) / 100;
}
