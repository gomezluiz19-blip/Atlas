// What's happening in the world, from sources that are free and open:
//   - Wikipedia's "In the news": the few biggest stories, chosen by editors,
//     each linked to the articles (and so the places) it's about; plus what
//     the world is reading today and what happened on this day.
//   - GDELT: the latest headlines from the big wire services, and the news
//     that mentions a particular place.
//   - NASA EONET: natural events still going on (wildfires, storms,
//     volcanoes, floods, ice), each with where it is.
import { cached } from "../data/diskCache";
import { getJson } from "../data/http";

export interface Linked {
  title: string;
  about?: string;
  image?: string;
  url?: string;
  lon?: number;
  lat?: number;
}

export interface Story {
  text: string;
  links: Linked[];
  /** Where it's happening, when one of its articles has a place. */
  lon?: number;
  lat?: number;
  image?: string;
}

export interface Reading extends Linked { views: number; rank: number }
export interface OnThisDay { year: number; text: string; link?: Linked }
export interface Headline { title: string; url: string; source: string; time: number; country?: string; image?: string }
export type EventKind = "wildfires" | "severeStorms" | "volcanoes" | "floods" | "seaLakeIce" | "earthquakes" | "landslides" | "drought" | "dustHaze" | "tempExtremes" | "snow" | "other";
export interface NaturalEvent { id: string; title: string; kind: EventKind; lon: number; lat: number; time: number; size?: string; url?: string }

// ---- Wikipedia -------------------------------------------------------------

/** Plain text from Wikipedia's story HTML. */
export function plain(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

interface WikiPage {
  title?: string;
  titles?: { normalized?: string };
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  coordinates?: { lat: number; lon: number };
  content_urls?: { desktop?: { page?: string } };
  views?: number;
  rank?: number;
}
interface Featured {
  news?: { story: string; links?: WikiPage[] }[];
  mostread?: { articles?: WikiPage[] };
  onthisday?: { text: string; year: number; pages?: WikiPage[] }[];
}

const linked = (p: WikiPage): Linked => ({
  title: p.titles?.normalized ?? p.title?.replace(/_/g, " ") ?? "",
  about: p.description,
  image: p.thumbnail?.source,
  url: p.content_urls?.desktop?.page,
  lon: p.coordinates?.lon,
  lat: p.coordinates?.lat,
});

/** The stories, what's being read and this day in history, from one day's feed (pure). */
export function readFeatured(f: Featured): { stories: Story[]; reading: Reading[]; onThisDay: OnThisDay[] } {
  const stories = (f.news ?? []).map((n) => {
    const links = (n.links ?? []).map(linked).filter((l) => l.title);
    // The place: a linked article with coordinates (the event's own, else the country or city it names).
    const at = links.find((l) => l.lat !== undefined);
    return { text: plain(n.story), links, lon: at?.lon, lat: at?.lat, image: links.find((l) => l.image)?.image };
  }).filter((s) => s.text);
  const skip = /^(Main Page|Special:|Wikipedia:|Portal:|File:|Deaths in )/;
  const reading = (f.mostread?.articles ?? []).filter((a) => !skip.test((a.title ?? "").replace(/_/g, " "))).slice(0, 10)
    .map((a, i) => ({ ...linked(a), views: a.views ?? 0, rank: i + 1 }));
  const onThisDay = (f.onthisday ?? []).slice(0, 5).map((e) => ({ year: e.year, text: plain(e.text), link: e.pages?.[0] ? linked(e.pages[0]) : undefined }));
  return { stories, reading, onThisDay };
}

const ymd = (d: Date) => `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;

/** Today's feed (yesterday's when today's has no stories yet). */
export function worldStories(now = new Date()): Promise<ReturnType<typeof readFeatured>> {
  return cached(`news:wp:${ymd(now)}:${now.getUTCHours() >> 2}`, 3 * 3_600_000, async () => {
    const get = (d: Date) => getJson<Featured>("Wikipedia", `https://en.wikipedia.org/api/rest_v1/feed/featured/${ymd(d)}`, undefined, 25_000, true);
    const today = readFeatured(await get(now));
    if (today.stories.length) return today;
    const before = readFeatured(await get(new Date(now.getTime() - 86_400_000)).catch(() => ({})));
    return { stories: before.stories, reading: today.reading.length ? today.reading : before.reading, onThisDay: today.onThisDay };
  });
}

// ---- GDELT -------------------------------------------------------------------

interface GdeltArticle { url: string; title: string; seendate: string; domain: string; sourcecountry?: string; socialimage?: string; language?: string }

/** "20260929T134500Z" → ms. */
export function gdeltTime(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}

/** Headlines, newest first, one per story (near-identical titles from syndication dropped). */
export function readHeadlines(articles: GdeltArticle[]): Headline[] {
  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const a of articles) {
    const title = a.title?.replace(/\s+/g, " ").trim();
    if (!title || !a.url) continue;
    const key = title.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").slice(0, 8).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url: a.url, source: a.domain.replace(/^www\./, ""), time: gdeltTime(a.seendate), country: a.sourcecountry, image: a.socialimage || undefined });
  }
  return out.sort((a, b) => (b.time || 0) - (a.time || 0));
}

const gdelt = (query: string, max: number, timespan: string) =>
  getJson<{ articles?: GdeltArticle[] }>("GDELT",
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${max}&format=json&sort=hybridrel&timespan=${timespan}`, undefined, 20_000, true)
    .then((b) => readHeadlines(b.articles ?? []));

const WIRES = ["reuters.com", "apnews.com", "bbc.co.uk", "aljazeera.com", "france24.com", "dw.com"];
// Regional services, so the world's news isn't only what the big Western wires pick.
const REGIONAL = ["africanews.com", "allafrica.com", "nation.africa", "thehindu.com", "dawn.com", "scmp.com", "straitstimes.com", "arabnews.com", "mercopress.com", "channelnewsasia.com"];

/** Keeps a list from being one outlet's: at most `per` stories from any one source, in order. */
export function balanced<T extends { source: string }>(list: T[], n: number, per = 2): T[] {
  const count = new Map<string, number>(), out: T[] = [];
  for (const h of list) {
    const c = count.get(h.source) ?? 0;
    if (c >= per) continue;
    count.set(h.source, c + 1);
    out.push(h);
    if (out.length >= n) break;
  }
  return out;
}

/** The latest from international and regional news services (last 12 hours). */
export function wireHeadlines(): Promise<Headline[]> {
  return cached("news:wires", 15 * 60_000, () => gdelt(`(${[...WIRES, ...REGIONAL].map((d) => `domainis:${d}`).join(" OR ")}) sourcelang:english`, 75, "12h").then((l) => balanced(l, 12)));
}

/**
 * News mentioning a place in the past week (by name, with its country to keep it on topic). Where
 * English-language coverage is thin (much of Latin America and francophone Africa), the local press
 * in any language fills in.
 */
export function newsAbout(name: string, country?: string): Promise<Headline[]> {
  const q = `"${name.replace(/"/g, "")}"${country && country !== name ? ` "${country.replace(/"/g, "")}"` : ""}`;
  return cached(`news:about:${q}`, 30 * 60_000, async () => {
    const en = (await gdelt(`${q} sourcelang:english`, 15, "7d")).slice(0, 6);
    if (en.length >= 3) return en;
    const any = await gdelt(q, 15, "7d").catch(() => [] as Headline[]);
    const seen = new Set(en.map((h) => h.url));
    return [...en, ...any.filter((h) => !seen.has(h.url))].slice(0, 6);
  });
}

// ---- NASA EONET -------------------------------------------------------------

interface EonetEvent { id: string; title: string; link?: string; categories: { id: string }[]; sources?: { url: string }[]; geometry: { date: string; type: string; coordinates: number[] | number[][][]; magnitudeValue?: number | null; magnitudeUnit?: string | null }[] }
const KINDS = new Set<EventKind>(["wildfires", "severeStorms", "volcanoes", "floods", "seaLakeIce", "earthquakes", "landslides", "drought", "dustHaze", "tempExtremes", "snow"]);

/** The latest position of each event still going on (pure). */
export function readEonet(events: EonetEvent[]): NaturalEvent[] {
  const out: NaturalEvent[] = [];
  for (const e of events) {
    const g = e.geometry[e.geometry.length - 1];
    if (!g) continue;
    let lon: number, lat: number;
    if (g.type === "Point") [lon, lat] = g.coordinates as number[];
    else {
      const ring = (g.coordinates as number[][][])[0] ?? [];
      if (!ring.length) continue;
      lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    }
    const kind = (KINDS.has(e.categories[0]?.id as EventKind) ? e.categories[0].id : "other") as EventKind;
    const size = g.magnitudeValue ? `${Math.round(g.magnitudeValue).toLocaleString()} ${g.magnitudeUnit === "acres" ? "acres" : g.magnitudeUnit === "kts" ? "knots" : g.magnitudeUnit ?? ""}`.trim() : undefined;
    out.push({ id: e.id, title: e.title, kind, lon, lat, time: Date.parse(g.date), size, url: e.sources?.[0]?.url });
  }
  return out.sort((a, b) => b.time - a.time);
}

/** Natural events still open, from the past three weeks. */
export function naturalEvents(): Promise<NaturalEvent[]> {
  return cached("news:eonet", 30 * 60_000, async () =>
    readEonet((await getJson<{ events: EonetEvent[] }>("NASA EONET", "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=21", undefined, 25_000, true)).events ?? []));
}

export const EVENT_LOOK: Record<EventKind, { emoji: string; label: string; color: string }> = {
  wildfires: { emoji: "🔥", label: "Wildfires", color: "#ff6b35" },
  severeStorms: { emoji: "🌀", label: "Storms", color: "#4c9ac9" },
  volcanoes: { emoji: "🌋", label: "Volcanoes", color: "#c4513a" },
  floods: { emoji: "🌊", label: "Floods", color: "#3563d6" },
  seaLakeIce: { emoji: "🧊", label: "Sea and lake ice", color: "#a0e7ff" },
  earthquakes: { emoji: "〰️", label: "Earthquakes", color: "#d19a2e" },
  landslides: { emoji: "⛰️", label: "Landslides", color: "#9a7552" },
  drought: { emoji: "☀️", label: "Drought", color: "#c9a256" },
  dustHaze: { emoji: "🌫️", label: "Dust and haze", color: "#c7a17a" },
  tempExtremes: { emoji: "🌡️", label: "Heat and cold", color: "#c4513a" },
  snow: { emoji: "❄️", label: "Snow", color: "#e5e5ea" },
  other: { emoji: "•", label: "Other", color: "#8c8f87" },
};

/** "3 min ago", "5 h ago", "2 days ago". */
export function ago(ms: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (!Number.isFinite(m)) return "";
  if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const d = Math.round(hrs / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
