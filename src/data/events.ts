// What's on near a place. Live listings come from whichever event services
// are connected (a key each; see docs/events.md): Ticketmaster and SeatGeek
// search by location; Eventbrite lists one organisation's own events (its
// public search closed in 2020). Without any, Wikidata still knows the
// festivals and annual events held nearby.
import { config } from "../config";
import { getJson } from "./http";

export type EventKind = "music" | "sports" | "arts" | "family" | "food" | "talks" | "festival" | "other";

export interface EventItem {
  id: string;
  name: string;
  /** Local date (YYYY-MM-DD) and time (HH:MM, if known). */
  date: string;
  time?: string;
  venue?: string;
  lon?: number;
  lat?: number;
  url?: string;
  image?: string;
  kind: EventKind;
  price?: string;
  source: "Ticketmaster" | "SeatGeek" | "Eventbrite";
}

export interface Festival { name: string; about?: string; when?: string; url?: string; lon: number; lat: number }

export const EVENT_SOURCES = () => [
  config.ticketmasterKey ? "Ticketmaster" : "",
  config.seatgeekClientId ? "SeatGeek" : "",
  config.eventbriteToken && config.eventbriteOrg ? "Eventbrite" : "",
].filter(Boolean);

export function kindOf(text: string): EventKind {
  const t = text.toLowerCase();
  // Theatre first: "Musical" and "Arts & Theatre" aren't concerts.
  if (/theat|musical|ballet|opera|dance|comedy|\barts?\b|film|cinema|exhibit|gallery/.test(t)) return "arts";
  if (/music|concert|band|\bdj\b|jazz|rock|\bpop\b|hip.?hop|classical/.test(t)) return "music";
  if (/sport|football|soccer|basketball|baseball|hockey|tennis|golf|race|marathon|match|nba|nfl|mlb|nhl|mls/.test(t)) return "sports";
  if (/family|kids|children|circus|disney|magic/.test(t)) return "family";
  if (/food|drink|wine|beer|market|tasting|dinner/.test(t)) return "food";
  if (/talk|conference|lecture|seminar|workshop|class|meetup|networking/.test(t)) return "talks";
  if (/festival|fair|carnival|parade/.test(t)) return "festival";
  return "other";
}

const money = (min?: number, max?: number, cur = "USD") => {
  if (min === undefined) return undefined;
  const f = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  return max && max > min ? `${f(min)}–${f(max)}` : f(min);
};

interface TmEvent {
  id: string; name: string; url?: string;
  dates?: { start?: { localDate?: string; localTime?: string } };
  images?: { url: string; width?: number }[];
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  _embedded?: { venues?: { name?: string; location?: { latitude?: string; longitude?: string } }[] };
}

async function ticketmaster(lon: number, lat: number, km: number): Promise<EventItem[]> {
  const start = new Date().toISOString().slice(0, 19) + "Z";
  const body = await getJson<{ _embedded?: { events?: TmEvent[] } }>("Ticketmaster",
    `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${encodeURIComponent(config.ticketmasterKey)}&latlong=${lat.toFixed(4)},${lon.toFixed(4)}&radius=${Math.round(km)}&unit=km&size=60&sort=date,asc&startDateTime=${start}`);
  return (body._embedded?.events ?? []).flatMap((e): EventItem[] => {
    const d = e.dates?.start?.localDate;
    if (!d) return [];
    const v = e._embedded?.venues?.[0], c = e.classifications?.[0], p = e.priceRanges?.[0];
    const img = [...(e.images ?? [])].sort((a, b) => Math.abs((a.width ?? 0) - 640) - Math.abs((b.width ?? 0) - 640))[0]?.url;
    return [{
      id: `tm:${e.id}`, name: e.name, date: d, time: e.dates?.start?.localTime?.slice(0, 5), venue: v?.name,
      lon: v?.location?.longitude ? Number(v.location.longitude) : undefined, lat: v?.location?.latitude ? Number(v.location.latitude) : undefined,
      url: e.url, image: img, kind: kindOf(`${c?.segment?.name ?? ""} ${c?.genre?.name ?? ""} ${e.name}`), price: money(p?.min, p?.max, p?.currency), source: "Ticketmaster",
    }];
  });
}

interface SgEvent { id: number; title: string; url?: string; datetime_local?: string; type?: string; venue?: { name?: string; location?: { lat?: number; lon?: number } }; performers?: { image?: string }[]; stats?: { lowest_price?: number; highest_price?: number } }

async function seatgeek(lon: number, lat: number, km: number): Promise<EventItem[]> {
  const body = await getJson<{ events?: SgEvent[] }>("SeatGeek",
    `https://api.seatgeek.com/2/events?client_id=${encodeURIComponent(config.seatgeekClientId)}&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&range=${Math.round(km)}km&per_page=60&sort=datetime_local.asc`);
  return (body.events ?? []).flatMap((e): EventItem[] => {
    if (!e.datetime_local) return [];
    return [{
      id: `sg:${e.id}`, name: e.title, date: e.datetime_local.slice(0, 10), time: e.datetime_local.slice(11, 16), venue: e.venue?.name,
      lon: e.venue?.location?.lon, lat: e.venue?.location?.lat, url: e.url, image: e.performers?.[0]?.image,
      kind: kindOf(`${e.type ?? ""} ${e.title}`), price: money(e.stats?.lowest_price, e.stats?.highest_price), source: "SeatGeek",
    }];
  });
}

interface EbEvent { id: string; name?: { text?: string }; url?: string; start?: { local?: string }; logo?: { url?: string }; is_free?: boolean; venue?: { name?: string; latitude?: string; longitude?: string } }

async function eventbrite(): Promise<EventItem[]> {
  const body = await getJson<{ events?: EbEvent[] }>("Eventbrite",
    `https://www.eventbriteapi.com/v3/organizations/${encodeURIComponent(config.eventbriteOrg)}/events/?status=live&order_by=start_asc&expand=venue`,
    { headers: { Authorization: `Bearer ${config.eventbriteToken}` } });
  return (body.events ?? []).flatMap((e): EventItem[] => {
    const s = e.start?.local;
    if (!s) return [];
    return [{
      id: `eb:${e.id}`, name: e.name?.text ?? "Event", date: s.slice(0, 10), time: s.slice(11, 16), venue: e.venue?.name,
      lon: e.venue?.longitude ? Number(e.venue.longitude) : undefined, lat: e.venue?.latitude ? Number(e.venue.latitude) : undefined,
      url: e.url, image: e.logo?.url, kind: kindOf(e.name?.text ?? ""), price: e.is_free ? "Free" : undefined, source: "Eventbrite",
    }];
  });
}

/** Upcoming events from every connected service, soonest first, without duplicates. */
export async function eventsNear(lon: number, lat: number, km = 25): Promise<{ items: EventItem[]; failed: string[] }> {
  const jobs: [string, Promise<EventItem[]>][] = [];
  if (config.ticketmasterKey) jobs.push(["Ticketmaster", ticketmaster(lon, lat, km)]);
  if (config.seatgeekClientId) jobs.push(["SeatGeek", seatgeek(lon, lat, km)]);
  if (config.eventbriteToken && config.eventbriteOrg) jobs.push(["Eventbrite", eventbrite()]);
  const got = await Promise.allSettled(jobs.map(([, p]) => p));
  const failed = jobs.filter((_, i) => got[i].status === "rejected").map(([n]) => n);
  const all = got.flatMap((g) => (g.status === "fulfilled" ? g.value : []));
  return { items: dedupe(all), failed };
}

/** The same event listed by two services counts once. */
export function dedupe(items: EventItem[]): EventItem[] {
  const seen = new Set<string>();
  const key = (e: EventItem) => `${e.date}|${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24)}`;
  return items.filter((e) => (seen.has(key(e)) ? false : (seen.add(key(e)), true))).sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`));
}

export type When = "today" | "weekend" | "week" | "month";
/** Whether an event falls in a period, counted from `today` (YYYY-MM-DD). */
export function inPeriod(date: string, when: When, today: string): boolean {
  const day = (iso: string) => Math.round(Date.parse(iso + "T12:00:00Z") / 86_400_000);
  const d = day(date) - day(today);
  if (d < 0) return false;
  if (when === "today") return d === 0;
  if (when === "week") return d < 7;
  if (when === "month") return d < 31;
  // This weekend: the coming Friday evening to Sunday (or the rest of it, if it's already the weekend).
  const dow = new Date(today + "T12:00:00Z").getUTCDay();
  const toFri = (5 - dow + 7) % 7, start = dow === 6 || dow === 0 ? 0 : toFri, end = dow === 0 ? 0 : (7 - dow) % 7;
  return d >= start && d <= end;
}

/** Festivals and annual events held near a place (Wikidata), no key needed. */
export async function festivalsNear(lon: number, lat: number, km = 30): Promise<Festival[]> {
  const q = `SELECT ?e ?eLabel ?eDescription ?coord ?site ?monthLabel WHERE {
  SERVICE wikibase:around { ?e wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${lon.toFixed(4)} ${lat.toFixed(4)})"^^geo:wktLiteral; wikibase:radius "${km}". }
  ?e wdt:P31/wdt:P279* ?type. VALUES ?type { wd:Q132241 wd:Q15275719 wd:Q288514 wd:Q7725310 wd:Q4618 wd:Q40244 wd:Q1656682 }
  OPTIONAL { ?e wdt:P856 ?site. } OPTIONAL { ?e wdt:P2922 ?month. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
} LIMIT 40`;
  const body = await getJson<{ results: { bindings: Record<string, { value: string }>[] } }>("Wikidata",
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json" } }, 20_000);
  const seen = new Set<string>();
  return body.results.bindings.flatMap((b): Festival[] => {
    const name = b.eLabel?.value;
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value ?? "");
    if (!name || !m || /^Q\d+$/.test(name) || seen.has(name)) return [];
    seen.add(name);
    return [{ name, about: b.eDescription?.value, when: b.monthLabel?.value, url: b.site?.value, lon: Number(m[1]), lat: Number(m[2]) }];
  });
}
