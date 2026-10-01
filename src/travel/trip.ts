// Going somewhere: the airports at each end, the ways there door to door
// (flying, train, driving, bus) with time and carbon, the time change and when
// you land in local time, the weather on the days you're there, where to stay
// for what you came to see, and links to book each part. Atlas doesn't sell
// tickets: the links open the booking sites already searched for this trip.
// Pure functions; the screen is travelUi.ts.
import type { Airport } from "../data/infra";
import { metres } from "../work/geo";

export interface Pt { name: string; lon: number; lat: number }

export const km = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => metres([a.lon, a.lat], [b.lon, b.lat]) / 1000;

/** The airports worth flying from near a point: big ones a little further away beat small ones next door (pure). */
export function pickAirports(list: Airport[], p: { lon: number; lat: number }, n = 3, maxKm = 220): (Airport & { km: number })[] {
  return list
    .filter((a) => /^(major|mid)/.test(a.type) && a.iata)
    .map((a) => ({ ...a, km: km(p, a) }))
    .filter((a) => a.km <= maxKm)
    .sort((a, b) => a.km + a.rank * 12 - (b.km + b.rank * 12))
    .slice(0, n);
}

export type Way = "fly" | "train" | "drive" | "bus";

export const WAYS: Record<Way, { label: string; emoji: string; color: string; kmh: number; detour: number; overheadH: number; co2PerKm: number }> = {
  // Typical door-to-door: check-in and security, getting to and from the station, and the route against the straight line.
  fly: { label: "Fly", emoji: "✈️", color: "#0a84ff", kmh: 800, detour: 1.06, overheadH: 3, co2PerKm: 0.15 },
  train: { label: "Train", emoji: "🚆", color: "#bf5af2", kmh: 110, detour: 1.25, overheadH: 0.8, co2PerKm: 0.035 },
  drive: { label: "Drive", emoji: "🚗", color: "#30d158", kmh: 80, detour: 1.3, overheadH: 0, co2PerKm: 0.17 },
  bus: { label: "Bus", emoji: "🚌", color: "#ff9f0a", kmh: 65, detour: 1.3, overheadH: 0.5, co2PerKm: 0.03 },
};

export interface WayEstimate { way: Way; hours: number; km: number; co2Kg: number; note?: string }

/** Each sensible way there, fastest first (pure). Carbon is per traveller; a car's is shared by `people`. */
export function waysThere(a: { lon: number; lat: number }, b: { lon: number; lat: number }, people = 1, overSea = false): WayEstimate[] {
  const d = km(a, b), out: WayEstimate[] = [];
  const est = (w: Way, legKm = d * WAYS[w].detour): WayEstimate => {
    const flightCo2 = d < 1500 ? 0.15 : 0.11;
    const co2 = legKm * (w === "fly" ? flightCo2 : WAYS[w].co2PerKm) / (w === "drive" ? Math.max(1, Math.min(5, people)) : 1);
    return { way: w, hours: legKm / WAYS[w].kmh + WAYS[w].overheadH, km: legKm, co2Kg: co2 };
  };
  if (d > 300) out.push(est("fly"));
  if (!overSea && d < 1500) out.push(est("train"), est("bus"));
  if (!overSea && d < 2500) out.push({ ...est("drive"), note: d > 900 ? "A long drive: plan a night on the way" : undefined });
  return out.sort((x, y) => x.hours - y.hours);
}

/** Flight time gate to gate (pure): cruise plus the climb, descent and taxiing. */
export const flightHours = (d: number) => d / 820 + 0.5;

/** "+5 h", "−3 h 30", "same time" (pure). */
export function shiftText(fromOffsetS: number, toOffsetS: number): string {
  const m = Math.round((toOffsetS - fromOffsetS) / 60);
  if (!m) return "same time";
  const sign = m > 0 ? "+" : "−", a = Math.abs(m), hh = Math.floor(a / 60), mm = a % 60;
  return `${sign}${hh} h${mm ? ` ${String(mm).padStart(2, "0")}` : ""}`;
}

/** Local arrival time from local departure (HH:MM), hours under way, and the offsets (pure). */
export function arrival(depart: string, hours: number, fromOffsetS: number, toOffsetS: number): { time: string; dayShift: number } {
  const [hh, mm] = depart.split(":").map(Number);
  const min = hh * 60 + mm + Math.round(hours * 60) + Math.round((toOffsetS - fromOffsetS) / 60);
  const dayShift = Math.floor(min / 1440);
  const t = ((min % 1440) + 1440) % 1440;
  return { time: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, dayShift };
}

/** How the body takes it: east is harder than west (pure). */
export function jetLag(fromOffsetS: number, toOffsetS: number): string {
  const h = (toOffsetS - fromOffsetS) / 3600, a = Math.abs(h);
  if (a < 2) return "No jet lag to speak of.";
  const days = Math.round(a / (h > 0 ? 1 : 1.5));
  return h > 0
    ? `Flying east ${Math.round(a)} hours: about ${days} days to adjust. Get morning light there, and go to bed early the first night.`
    : `Flying west ${Math.round(a)} hours: about ${days} days to adjust. Stay up until evening there, and get outside in the afternoon.`;
}

// ---- Dates -------------------------------------------------------------------------------------

export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const nightsBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
export const datesBetween = (a: string, b: string) => Array.from({ length: nightsBetween(a, b) + 1 }, (_, i) => addDays(a, i));

/** Whether the forecast reaches these dates (it reaches about 15 days), else last year's weather on them stands in (pure). */
export const forecastReaches = (end: string, today = new Date().toISOString().slice(0, 10)) => nightsBetween(today, end) <= 15 && end >= today;

/** A day's weather as an emoji, from the WMO weather code (pure). */
export function wxEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 67 || (code >= 80 && code <= 82)) return "🌧️";
  if (code <= 77 || code === 85 || code === 86) return "❄️";
  return "⛈️";
}

/** A line on the weather for the stay (pure). */
export function weatherLine(days: { max: number; min: number; rain: number }[], forecast: boolean): string {
  if (!days.length) return "";
  const hi = Math.round(days.reduce((t, d) => t + d.max, 0) / days.length), lo = Math.round(days.reduce((t, d) => t + d.min, 0) / days.length);
  const wet = days.filter((d) => d.rain >= 1).length;
  const pack = hi >= 27 ? "light clothes and sun cream" : hi >= 18 ? "layers for cool evenings" : hi >= 8 ? "a warm jacket" : "a proper coat, hat and gloves";
  return `${forecast ? "Forecast" : "Last year on these dates"}: highs around ${hi}°, lows ${lo}°, ${wet ? `rain on ${wet} of ${days.length} days` : "dry"}. Pack ${pack}${wet ? " and an umbrella" : ""}.`;
}

// ---- Where to stay: near what you came for -----------------------------------------------------------

export interface Sight extends Pt { kind: string }
export interface Stay extends Pt { kind: string; stars?: number; near: number; nearestMin: number; score: number }

/** Minutes on foot over a straight distance (pure). */
export const walkMin = (m: number) => (m / 1000) * 1.25 / 4.8 * 60;

/** Each stay scored by the sights within a 15-minute walk, and the nearest one (pure). */
export function rankStays(stays: (Pt & { kind: string; stars?: number })[], sights: Pt[]): Stay[] {
  return stays.map((s) => {
    const mins = sights.map((x) => walkMin(metres([s.lon, s.lat], [x.lon, x.lat])));
    const near = mins.filter((m) => m <= 15).length, nearestMin = mins.length ? Math.min(...mins) : Infinity;
    return { ...s, near, nearestMin, score: near * 10 - Math.min(30, nearestMin) + (s.stars ?? 0) };
  }).sort((a, b) => b.score - a.score);
}

/** The sweet spot: where the sights cluster (the point nearest the most of them), pure. */
export function sweetSpot(sights: Pt[]): (Pt & { n: number }) | null {
  if (!sights.length) return null;
  let best = sights[0], n = 0;
  for (const s of sights) {
    const c = sights.filter((x) => metres([s.lon, s.lat], [x.lon, x.lat]) <= 1000).length;
    if (c > n) { n = c; best = s; }
  }
  return { ...best, n };
}

export function staysQuery(lon: number, lat: number, m = 3000): string {
  const a = `(around:${m},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:25];(nwr["tourism"~"^(hotel|guest_house|hostel|apartment|motel)$"]["name"]${a};nwr["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|aquarium|theme_park)$"]["name"]${a};nwr["historic"~"^(castle|monument|memorial|ruins)$"]["name"]${a};);out center 600;`;
}

/** The query's answer split into stays and sights (pure). */
export function splitStays(els: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]): { stays: (Pt & { kind: string; stars?: number })[]; sights: Sight[] } {
  const stays: (Pt & { kind: string; stars?: number })[] = [], sights: Sight[] = [];
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, t = e.tags ?? {};
    if (lat === undefined || lon === undefined || !t.name) continue;
    if (/^(hotel|guest_house|hostel|apartment|motel)$/.test(t.tourism ?? "")) stays.push({ name: t.name, lon, lat, kind: t.tourism, stars: Number(t.stars) || undefined });
    else sights.push({ name: t.name, lon, lat, kind: t.tourism ?? t.historic ?? "sight" });
  }
  return { stays, sights };
}

// ---- Where to book ---------------------------------------------------------------------------------

const yymmdd = (d: string) => d.slice(2).replace(/-/g, "");
const q = encodeURIComponent;

export interface BookLink { label: string; url: string; what: "flights" | "trains" | "stays" | "cars" | "route" }

/** Links that open each booking site already searched for this trip (pure). */
export function bookingLinks(t: { from: Pt; to: Pt; fromIata?: string; toIata?: string; depart: string; back: string; people: number; ways: Way[] }): BookLink[] {
  const out: BookLink[] = [];
  const city = t.to.name;
  if (t.ways.includes("fly") && t.fromIata && t.toIata) {
    out.push({ what: "flights", label: "Google Flights", url: `https://www.google.com/travel/flights?q=${q(`Flights from ${t.fromIata} to ${t.toIata} on ${t.depart} returning ${t.back} for ${t.people} adults`)}` });
    out.push({ what: "flights", label: "Skyscanner", url: `https://www.skyscanner.net/transport/flights/${t.fromIata.toLowerCase()}/${t.toIata.toLowerCase()}/${yymmdd(t.depart)}/${yymmdd(t.back)}/?adultsv2=${t.people}` });
    out.push({ what: "flights", label: "Kayak", url: `https://www.kayak.com/flights/${t.fromIata}-${t.toIata}/${t.depart}/${t.back}/${t.people}adults` });
  }
  if (t.ways.includes("train") || t.ways.includes("bus"))
    out.push({ what: "trains", label: "Trains and buses (Rome2Rio)", url: `https://www.rome2rio.com/map/${q(t.from.name)}/${q(city)}` });
  out.push({ what: "stays", label: "Booking.com", url: `https://www.booking.com/searchresults.html?ss=${q(city)}&checkin=${t.depart}&checkout=${t.back}&group_adults=${t.people}&no_rooms=1` });
  out.push({ what: "stays", label: "Airbnb", url: `https://www.airbnb.com/s/${q(city)}/homes?checkin=${t.depart}&checkout=${t.back}&adults=${t.people}` });
  out.push({ what: "stays", label: "Google Hotels", url: `https://www.google.com/travel/hotels/${q(city)}?q=${q(`hotels in ${city}`)}&dates=${t.depart},${t.back}` });
  if (t.ways.includes("drive"))
    out.push({ what: "route", label: "Driving directions", url: `https://www.google.com/maps/dir/?api=1&origin=${t.from.lat},${t.from.lon}&destination=${t.to.lat},${t.to.lon}&travelmode=driving` });
  if (t.ways.includes("fly") && t.toIata)
    out.push({ what: "cars", label: "Hire a car there", url: `https://www.kayak.com/cars/${t.toIata}/${t.depart}/${t.back}` });
  return out;
}

/** A hotel searched by name on Booking.com for these dates (pure). */
export const stayLink = (s: Pt, city: string, depart: string, back: string, people: number) =>
  `https://www.booking.com/searchresults.html?ss=${q(`${s.name}, ${city}`)}&checkin=${depart}&checkout=${back}&group_adults=${people}&no_rooms=1`;
