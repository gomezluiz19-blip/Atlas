// Packages on the way to your place. Paste a tracking number, or a whole
// shipping email, and Terreno finds the numbers, knows the carrier from the
// number's pattern and links to its tracking page. Carriers don't share
// tracking without their own API keys, so the status and date are yours to
// set (or come in from the link); arrivals show in the dock and in My plans.

export type Carrier = "UPS" | "FedEx" | "USPS" | "DHL" | "Amazon" | "Royal Mail" | "Canada Post" | "Post";
export type Status = "ordered" | "shipped" | "out" | "delivered" | "problem";
export const STATUS: Record<Status, { label: string; color: string }> = {
  ordered: { label: "Ordered", color: "#8c8f87" },
  shipped: { label: "On the way", color: "#3563d6" },
  out: { label: "Out for delivery", color: "#d19a2e" },
  delivered: { label: "Delivered", color: "#5b9467" },
  problem: { label: "Problem", color: "#c4513a" },
};

export interface Package { id: string; label: string; number: string; carrier: Carrier; status: Status; eta?: string; place?: string; added: string }

const S10 = /^[A-Z]{2}\d{9}([A-Z]{2})$/;
/** The carrier, from a tracking number's pattern (pure). Null if it doesn't look like one. */
export function carrierOf(raw: string): Carrier | null {
  const n = raw.replace(/[\s-]/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(n)) return "UPS";
  if (/^TBA\d{12}$/.test(n)) return "Amazon";
  const s10 = S10.exec(n);
  if (s10) return s10[1] === "GB" ? "Royal Mail" : s10[1] === "US" ? "USPS" : s10[1] === "CA" ? "Canada Post" : "Post";
  if (/^(94|93|92|95|42)\d{18,24}$/.test(n)) return "USPS";
  if (/^\d{12}$|^\d{15}$|^\d{20}$/.test(n)) return "FedEx";
  if (/^\d{10}$|^JJD\d{18}$|^JVGL\d{16}$/.test(n)) return "DHL";
  if (/^\d{16}$/.test(n)) return "Canada Post";
  return null;
}

/** The carrier's own tracking page for a number (pure). */
export function trackUrl(carrier: Carrier, raw: string): string {
  const n = encodeURIComponent(raw.replace(/[\s-]/g, "").toUpperCase());
  switch (carrier) {
    case "UPS": return `https://www.ups.com/track?tracknum=${n}`;
    case "FedEx": return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "USPS": return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "DHL": return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id=${n}`;
    case "Amazon": return "https://www.amazon.com/gp/your-account/order-history";
    case "Royal Mail": return `https://www.royalmail.com/track-your-item#/tracking-results/${n}`;
    case "Canada Post": return `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${n}`;
    default: return `https://parcelsapp.com/en/tracking/${n}`;
  }
}

/** Every tracking number in a pasted email or note, with its carrier (pure). */
export function findNumbers(text: string): { number: string; carrier: Carrier }[] {
  const out: { number: string; carrier: Carrier }[] = [];
  const seen = new Set<string>();
  const candidates = text.toUpperCase().match(/\b(1Z[0-9A-Z]{16}|TBA\d{12}|[A-Z]{2}\d{9}[A-Z]{2}|JJD\d{18}|\d(?:[\d ]{8,30}\d))\b/g) ?? [];
  for (const c of candidates) {
    const n = c.replace(/\s/g, "");
    const carrier = carrierOf(n);
    if (!carrier || seen.has(n)) continue;
    // Plain digit runs that look like phone numbers or order numbers are only kept if long enough to be tracking numbers.
    if (/^\d+$/.test(n) && n.length < 12 && !/waybill|awb|dhl/i.test(text)) continue;
    seen.add(n);
    out.push({ number: n, carrier });
  }
  return out;
}

/** An arrival date mentioned near the word "arriv"/"deliver" in pasted text, as YYYY-MM-DD (pure; best effort). */
export function findDate(text: string, today: string): string | undefined {
  const year = Number(today.slice(0, 4));
  const iso = /\b(20\d\d-\d\d-\d\d)\b/.exec(text);
  if (iso) return iso[1];
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const m = /(arriv|deliver|expected|estimated)[^.\n]{0,40}?\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/i.exec(text)
    ?? /(arriv|deliver|expected|estimated)[^.\n]{0,40}?\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.exec(text);
  if (!m) return undefined;
  const [mon, day] = /\d/.test(m[2]) ? [m[3], m[2]] : [m[2], m[3]];
  const mi = months.indexOf(mon.toLowerCase().slice(0, 3));
  let d = `${year}-${String(mi + 1).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
  if (d < today && Number(today.slice(5, 7)) - (mi + 1) > 6) d = `${year + 1}${d.slice(4)}`;
  return d;
}

export const KEY = "atlas.myplace.packages.v1";
export function readPackages(): Package[] { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
export function writePackages(ps: Package[]) { try { localStorage.setItem(KEY, JSON.stringify(ps)); } catch { /* private mode */ } }

/** What the dock says about packages (pure): how many are coming, and the next arrival. */
export function packageSummary(ps: Package[], today: string) {
  const coming = ps.filter((p) => p.status !== "delivered");
  const next = coming.filter((p) => p.eta).sort((a, b) => a.eta!.localeCompare(b.eta!))[0];
  const todayCount = coming.filter((p) => p.status === "out" || p.eta === today).length;
  return { coming: coming.length, today: todayCount, next, problems: coming.filter((p) => p.status === "problem").length };
}
