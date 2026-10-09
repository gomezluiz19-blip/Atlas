// Today's exchange rates (open.er-api.com: free, no key, updated daily).
import { cached } from "../data/diskCache";
import { getJson } from "../data/http";

/** How many of each currency one US dollar buys today, and when that was set. */
export function usdRates(): Promise<{ rates: Record<string, number>; updated: string }> {
  return cached("topics:fx", 6 * 3_600_000, async () => {
    const b = await getJson<{ result: string; rates: Record<string, number>; time_last_update_utc?: string }>("Exchange rates", "https://open.er-api.com/v6/latest/USD");
    if (b.result !== "success" || !b.rates) throw new Error("Exchange rates are unavailable just now");
    return { rates: b.rates, updated: b.time_last_update_utc ? new Date(b.time_last_update_utc).toISOString().slice(0, 10) : "" };
  });
}

/** "58.9" / "0.92" / "1,480": enough digits to be useful at any size. */
export function rateText(v: number): string {
  if (v === 0) return "0";
  if (v >= 100) return Math.round(v).toLocaleString();
  if (v >= 1) return v.toFixed(2).replace(/\.?0+$/, "");
  return v.toPrecision(2);
}

/** Converts between currencies through their per-dollar rates (pure). */
export function convert(amount: number, from: string, to: string, perUsd: Record<string, number>): number | null {
  const a = perUsd[from], b = perUsd[to];
  if (!a || !b || !Number.isFinite(amount)) return null;
  return (amount / a) * b;
}

export const MAJORS = ["USD", "EUR", "GBP", "JPY", "CNY", "INR", "CAD", "AUD", "CHF", "MXN", "BRL", "KRW", "ZAR", "SGD", "HKD", "SEK", "NGN", "TRY"];

/** The visitor's own currency, from their browser's region (pure given the locale). */
export function homeCurrency(locale = navigator.language): string {
  const region = (locale.split("-")[1] ?? "").toUpperCase();
  const BY_REGION: Record<string, string> = { US: "USD", GB: "GBP", JP: "JPY", CN: "CNY", IN: "INR", CA: "CAD", AU: "AUD", CH: "CHF", MX: "MXN", BR: "BRL", KR: "KRW", ZA: "ZAR", SG: "SGD", HK: "HKD", SE: "SEK", NG: "NGN", TR: "TRY" };
  const EURO = ["DE", "FR", "ES", "IT", "NL", "BE", "AT", "IE", "PT", "FI", "GR", "LU", "SK", "SI", "EE", "LV", "LT", "CY", "MT", "HR"];
  return BY_REGION[region] ?? (EURO.includes(region) ? "EUR" : "USD");
}
