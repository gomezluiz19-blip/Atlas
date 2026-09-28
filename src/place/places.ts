// The places Atlas knows by name (its curated features, ~3,900 world labels
// and ~7,800 towns, lakes and parks), each at a permanent address, plus any
// Wikidata place ("eiffel-tower~q243") and any spot on Earth ("@lat,lon").
import type { Place } from "../app";
import type { PlaceKind } from "../analysis/placeKinds";
import type { LabelData } from "../explore/feeds";
import { FEATURES, type FeatureKind } from "../content/features";
import { notableById, type Notable } from "../data/wikidata";
import { detailLabels, worldLabels, type WorldLabel } from "../data/worldData";
import { assignSlugs, parseSlug, slugify, spotSlug, wikidataSlug, type PlaceEntry } from "./slug";

export const FEATURE_KIND: Record<FeatureKind, PlaceKind> = {
  river: "water", lake: "water", deep: "water", waterfall: "waterfall", peak: "peak", volcano: "volcano",
  crater: "nature", forest: "nature", canyon: "nature", desert: "desert", metro: "transport",
};

interface Index { bySlug: Map<string, PlaceEntry>; slugOf: Map<PlaceEntry, string>; byName: Map<string, PlaceEntry[]>; world: WorldLabel[]; detail: WorldLabel[] }
let index: Promise<Index> | null = null;

/** Every named place and its address (loaded once). */
export function placeIndex(): Promise<Index> {
  index ??= (async () => {
    const [world, detail] = await Promise.all([worldLabels(), detailLabels().catch(() => [] as WorldLabel[])]);
    const entries: PlaceEntry[] = [
      ...FEATURES.map((f, i): PlaceEntry => ({ name: f.name, lon: f.lon, lat: f.lat, kind: f.kind, rank: 1000, source: "feature", i })),
      ...world.map((w, i): PlaceEntry => ({ name: w.name, lon: w.lon, lat: w.lat, kind: w.kind, rank: w.rank, detail: w.detail, source: "world", i })),
      ...detail.map((w, i): PlaceEntry => ({ name: w.name, lon: w.lon, lat: w.lat, kind: w.kind, rank: w.rank, detail: w.detail, source: "detail", i })),
    ];
    const bySlug = assignSlugs(entries);
    const slugOf = new Map<PlaceEntry, string>();
    const byName = new Map<string, PlaceEntry[]>();
    for (const [s, e] of bySlug) {
      slugOf.set(e, s);
      const k = slugify(e.name);
      byName.set(k, [...(byName.get(k) ?? []), e]);
    }
    return { bySlug, slugOf, byName, world, detail };
  })();
  index.catch(() => (index = null));
  return index;
}

/** What Atlas needs to open a place: where it is, what to call it, and the feature behind it. */
export interface Resolved {
  slug: string;
  name: string;
  context: string;
  lon: number;
  lat: number;
  /** Metres to frame it from. */
  radius: number;
  kind: PlaceKind;
  feature?: LabelData;
}

const RADIUS: Partial<Record<PlaceKind, number>> = {
  sea: 1_500_000, continent: 3_000_000, range: 400_000, desert: 500_000, region: 400_000, island: 40_000,
  city: 15_000, capital: 22_000, district: 3000, peak: 9000, volcano: 9000, water: 30_000, glacier: 15_000, park: 12_000,
};

function fromEntry(ix: Index, slug: string, e: PlaceEntry): Resolved {
  if (e.source === "feature") {
    const f = FEATURES[e.i], kind = FEATURE_KIND[f.kind];
    const world: WorldLabel = { name: f.name, lon: f.lon, lat: f.lat, kind, minZoom: 3, rank: 1000, detail: f.kind };
    const radius = f.kind === "river" ? 900_000 : f.kind === "desert" || f.kind === "forest" ? 700_000 : f.kind === "lake" || f.kind === "deep" ? 120_000 : f.kind === "metro" ? 25_000 : RADIUS[kind] ?? 10_000;
    return { slug, name: f.name, context: f.facts.map(([k, v]) => `${k}: ${v}`)[0] ?? f.kind, lon: f.lon, lat: f.lat, radius, kind, feature: { source: f.kind === "river" ? "river" : "world", world } };
  }
  const w = (e.source === "world" ? ix.world : ix.detail)[e.i];
  return { slug, name: w.name, context: w.detail && w.detail !== w.kind ? w.detail : "", lon: w.lon, lat: w.lat, radius: RADIUS[w.kind] ?? 6000, kind: w.kind, feature: { source: "world", world: w } };
}

/** The place at an address, or null if there's none. */
export async function resolvePlace(slug: string): Promise<Resolved | null> {
  const p = parseSlug(slug);
  if (!p) return null;
  if (p.kind === "spot") return { slug: spotSlug(p.lon, p.lat), name: "", context: "", lon: p.lon, lat: p.lat, radius: 1500, kind: "other" };
  if (p.kind === "wikidata") {
    const n = await notableById(p.qid).catch(() => null);
    if (!n) return null;
    return { slug: wikidataSlug(n.name, n.id), name: n.name, context: n.description ?? "", lon: n.lon, lat: n.lat, radius: n.kind === "city" || n.kind === "capital" ? 15_000 : n.kind === "district" ? 3000 : 1200, kind: n.kind, feature: { source: "notable", notable: n } };
  }
  const ix = await placeIndex();
  const e = ix.bySlug.get(p.slug);
  return e ? fromEntry(ix, p.slug, e) : null;
}

const R = Math.PI / 180;
const km = (lon1: number, lat1: number, lon2: number, lat2: number) => {
  const x = Math.sin(((lat2 - lat1) * R) / 2) ** 2 + Math.cos(lat1 * R) * Math.cos(lat2 * R) * Math.sin(((lon2 - lon1) * R) / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(x)));
};

/** A known place by name near a point (within `maxKm`), with its address. */
export async function findNamed(name: string, lon: number, lat: number, maxKm = 30): Promise<Resolved | null> {
  const ix = await placeIndex();
  const e = (ix.byName.get(slugify(name)) ?? []).map((x) => ({ x, d: km(lon, lat, x.lon, x.lat) })).filter((c) => c.d <= maxKm).sort((a, b) => a.d - b.d)[0]?.x;
  return e ? fromEntry(ix, ix.slugOf.get(e)!, e) : null;
}

/** The address of a chosen place: its name if Atlas knows it, its Wikidata item, or its coordinates. */
export async function slugOfPlace(p: Place): Promise<string> {
  const f = p.feature as (LabelData & { notable?: Notable }) | undefined;
  const title = p.name?.title;
  // Rivers are marked in the middle of their course; a named river can be far from where it was tapped.
  const reach = f?.source === "river" ? 1500 : f?.world?.kind === "sea" || f?.world?.kind === "range" || f?.world?.kind === "desert" ? 800 : 30;
  const name = f?.world?.name ?? f?.notable?.name ?? title;
  if (name && (f || title)) {
    const known = await findNamed(name, f?.world?.lon ?? p.lon, f?.world?.lat ?? p.lat, reach).catch(() => null);
    if (known) return known.slug;
  }
  if (f?.notable && /^Q\d+$/.test(f.notable.id)) return wikidataSlug(f.notable.name, f.notable.id);
  return spotSlug(p.lon, p.lat);
}

/** The places with addresses nearest a point (for "nearby" links on a page). */
export async function nearestNamed(lon: number, lat: number, n = 6, exclude?: string): Promise<Resolved[]> {
  const ix = await placeIndex();
  const out: { s: string; e: PlaceEntry; d: number }[] = [];
  for (const [s, e] of ix.bySlug) {
    if (s === exclude || Math.abs(e.lat - lat) > 3) continue;
    const d = km(lon, lat, e.lon, e.lat);
    if (d < 250) out.push({ s, e, d });
  }
  return out.sort((a, b) => a.d - b.d).slice(0, n).map((o) => fromEntry(ix, o.s, o.e));
}
