// Local taxis, side by side with rideshare: the firms and ranks near you, a fair estimate of the metered fare,
// and a way to reach them (call, WhatsApp, their booking page) that carries a Terreno reference, so a firm can
// see the rides Terreno brought. Terreno is the front door, never the operator: the firm dispatches with its own
// drivers, licence and insurance. Ranking is by what helps the rider (covers the pickup, has what they need,
// nearest); being a paying partner never moves a firm up. Pure, so it's tested (tests/taxi.test.ts).

export type Need = "wheelchair" | "large" | "airport";

export interface TaxiFirm {
  id: string;
  name: string;
  /** Where it serves: a centre and a radius. */
  lon: number; lat: number; radiusKm: number;
  phone?: string;
  whatsapp?: string;
  /** Their own booking page or app link. */
  booking?: string;
  needs?: Need[];
  /** Fixed fares they publish ("Airport · $45"). */
  fixed?: { label: string; price: string }[];
  licence?: string;
  /** Licence checked against the city's register. */
  verified?: boolean;
  /** Signed the pledge that Terreno's fee is never passed on to drivers. */
  driversKeepFare?: boolean;
  /** A taxi rank (a place to walk up to) rather than a company. */
  rank?: boolean;
  source: "osm" | "listing";
}

// ---- The fare ---------------------------------------------------------------------------------------------

export interface Tariff { currency: string; flag: number; perKm: number; perMin: number; min?: number }

/** Typical metered rates (flag fall, per km, per minute of the trip), rounded from public city tariffs. */
const TARIFFS: Record<string, Tariff> = {
  US: { currency: "USD", flag: 3.5, perKm: 1.75, perMin: 0.5 },
  CA: { currency: "CAD", flag: 4.25, perKm: 1.9, perMin: 0.55 },
  GB: { currency: "GBP", flag: 3.8, perKm: 1.6, perMin: 0.4 },
  IE: { currency: "EUR", flag: 4.4, perKm: 1.3, perMin: 0.4 },
  FR: { currency: "EUR", flag: 4.2, perKm: 1.3, perMin: 0.6, min: 7.3 },
  DE: { currency: "EUR", flag: 4.5, perKm: 2.2, perMin: 0.5 },
  ES: { currency: "EUR", flag: 2.6, perKm: 1.3, perMin: 0.4 },
  IT: { currency: "EUR", flag: 3.5, perKm: 1.3, perMin: 0.5 },
  NL: { currency: "EUR", flag: 4.4, perKm: 3.2, perMin: 0.5 },
  PT: { currency: "EUR", flag: 3.3, perKm: 0.9, perMin: 0.3 },
  CH: { currency: "CHF", flag: 6.8, perKm: 3.8, perMin: 0.7 },
  AU: { currency: "AUD", flag: 4.2, perKm: 2.3, perMin: 0.9 },
  NZ: { currency: "NZD", flag: 3.5, perKm: 3, perMin: 0.7 },
  MX: { currency: "MXN", flag: 13, perKm: 9, perMin: 2 },
  BR: { currency: "BRL", flag: 5.5, perKm: 3, perMin: 0.6 },
  AR: { currency: "ARS", flag: 1500, perKm: 900, perMin: 150 },
  CO: { currency: "COP", flag: 5000, perKm: 1700, perMin: 300 },
  IN: { currency: "INR", flag: 40, perKm: 20, perMin: 2 },
  JP: { currency: "JPY", flag: 500, perKm: 330, perMin: 80 },
  ZA: { currency: "ZAR", flag: 15, perKm: 12, perMin: 2 },
  AE: { currency: "AED", flag: 12, perKm: 2, perMin: 0.5, min: 12 },
};

/** The tariff for a country (ISO two letters); unknown places get none, and no number is invented. */
export const tariffFor = (cc?: string | null): Tariff | null => (cc ? TARIFFS[cc.toUpperCase()] ?? null : null);

/** A metered fare, as a range: the tariff applied to the trip, ±15% for traffic and the route the driver takes. */
export function fareEstimate(km: number, minutes: number, t: Tariff): { low: number; high: number; currency: string } {
  const raw = Math.max(t.min ?? 0, t.flag + km * t.perKm + minutes * t.perMin);
  const round = (v: number) => (raw > 200 ? Math.round(v / 10) * 10 : Math.round(v));
  return { low: round(raw * 0.85), high: round(raw * 1.15), currency: t.currency };
}

/** A fare range written the way people say it: "about $18–24". */
export function fareText(f: { low: number; high: number; currency: string }, locale = "en"): string {
  // A browser can report a locale Intl refuses ("en-US@posix"); English is the fallback, never an error.
  let nf: Intl.NumberFormat;
  try { nf = new Intl.NumberFormat(locale, { style: "currency", currency: f.currency, maximumFractionDigits: 0 }); }
  catch { nf = new Intl.NumberFormat("en", { style: "currency", currency: f.currency, maximumFractionDigits: 0 }); }
  const fmt = (v: number) => nf.format(v);
  return f.low === f.high ? `about ${fmt(f.low)}` : `about ${fmt(f.low)}–${fmt(f.high).replace(/^[^\d]+/, "")}`;
}

/** A road trip from a straight line: about 1.3× as long, at an average city speed (pure). */
export function tripFromLine(lineKm: number): { km: number; minutes: number } {
  const km = lineKm * 1.3;
  const kmh = km < 5 ? 20 : km < 20 ? 28 : 45;
  return { km, minutes: (km / kmh) * 60 };
}

// ---- Who to call --------------------------------------------------------------------------------------------

const kmBetween = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/**
 * The firms that can take this rider, best first: those that serve the pickup, then those with what the rider
 * needs, then the nearest. A firm with no way to reach it (no phone, WhatsApp or booking link) is left out,
 * except a rank, which you walk up to. Being a partner never changes the order.
 */
export function rankFirms(firms: TaxiFirm[], pickup: { lon: number; lat: number }, needs: Need[] = []): (TaxiFirm & { km: number })[] {
  return firms
    .filter((f) => f.rank || f.phone || f.whatsapp || f.booking)
    .map((f) => ({ ...f, km: kmBetween(f, pickup) }))
    .filter((f) => (f.rank ? f.km < 3 : f.km < Math.max(f.radiusKm, 1)))
    .sort((a, b) => {
      const meets = (f: TaxiFirm) => needs.filter((n) => f.needs?.includes(n)).length;
      return meets(b) - meets(a) || Number(!!b.verified) - Number(!!a.verified) || a.km - b.km;
    });
}

/** A firm from OpenStreetMap: a rank (amenity=taxi) or a company (office=taxi). */
export function firmFromOsm(el: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }): TaxiFirm | null {
  const t = el.tags ?? {}, at = el.lat !== undefined ? { lat: el.lat, lon: el.lon! } : el.center;
  if (!at) return null;
  const rank = t.amenity === "taxi";
  if (!rank && t.office !== "taxi" && t.shop !== "taxi") return null;
  const phone = t.phone ?? t["contact:phone"];
  const web = t.website ?? t["contact:website"];
  return {
    id: `osm:${el.type}/${el.id}`, name: t.name ?? (rank ? "Taxi rank" : "Taxi company"), lon: at.lon, lat: at.lat, radiusKm: rank ? 0.5 : 25,
    phone: phone?.split(";")[0].trim(), whatsapp: t["contact:whatsapp"], booking: web?.startsWith("http") ? web : undefined,
    needs: t.wheelchair === "yes" ? ["wheelchair"] : undefined, rank, source: "osm",
  };
}

// ---- Reaching them, with a reference ------------------------------------------------------------------------

/** A booking reference, easy to read out on the phone: TRN-7K4P-2M9Q (no 0/O, 1/I). */
export function bookingRef(random: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  const A = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const part = () => Array.from({ length: 4 }, () => A[random(A.length)]).join("");
  return `TRN-${part()}-${part()}`;
}

const digits = (phone: string) => phone.replace(/[^\d+]/g, "");
export const callHref = (phone: string) => `tel:${digits(phone)}`;
/** WhatsApp with the request written for them: where to, and the reference. */
export const whatsappHref = (number: string, to: string, ref: string) =>
  `https://wa.me/${digits(number).replace(/^\+/, "")}?text=${encodeURIComponent(`Hello, I'd like a taxi to ${to}. Terreno reference ${ref}.`)}`;
/** Their booking page with the reference attached, so it shows in their records. */
export function bookingHref(url: string, ref: string): string {
  try { const u = new URL(url); u.searchParams.set("ref", ref); u.searchParams.set("utm_source", "terreno"); return u.toString(); } catch { return url; }
}
