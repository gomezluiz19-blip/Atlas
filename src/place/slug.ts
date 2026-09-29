// Every place gets a permanent address: "nile", "mount-everest",
// "trinidad-flores-uruguay". Pure, so the app and the build (which writes a
// page per place for search engines) agree on every one.

export interface PlaceEntry {
  name: string;
  lon: number;
  lat: number;
  /** A place kind ("peak", "city", "water"…) or a feature kind ("river", "volcano"…). */
  kind: string;
  rank: number;
  /** Where it is or what it is ("Colonia, Uruguay", "island"). */
  detail?: string;
  source: "feature" | "world" | "detail";
  /** Index into its source list. */
  i: number;
}

/** "São Tomé & Príncipe" → "sao-tome-and-principe". */
export function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

const R = Math.PI / 180;
const km = (a: PlaceEntry, b: PlaceEntry) => {
  const x = Math.sin(((b.lat - a.lat) * R) / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(((b.lon - a.lon) * R) / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(x)));
};

const ORDER = { feature: 0, world: 1, detail: 2 } as const;

/**
 * Addresses for a set of places. Curated features come first, then bigger
 * places: they get the plain name; a later namesake gets its area added
 * ("trinidad-flores-uruguay"). The same place listed twice (a curated peak and
 * its map label) keeps one address.
 */
export function assignSlugs(entries: PlaceEntry[]): Map<string, PlaceEntry> {
  const sorted = [...entries].sort((a, b) => ORDER[a.source] - ORDER[b.source] || b.rank - a.rank || a.name.localeCompare(b.name) || a.lon - b.lon || a.lat - b.lat);
  const out = new Map<string, PlaceEntry>();
  const byName = new Map<string, PlaceEntry[]>();
  for (const e of sorted) {
    const base = slugify(e.name);
    if (!base) continue;
    const same = byName.get(base) ?? [];
    if (same.some((o) => km(o, e) < 30)) continue;
    same.push(e);
    byName.set(base, same);
    let slug = base;
    if (out.has(slug)) slug = `${base}-${slugify(e.detail || e.kind)}`;
    for (let n = 2; out.has(slug); n++) slug = `${base}-${slugify(e.detail || e.kind)}-${n}`;
    out.set(slug, e);
  }
  return out;
}

/** An address for any spot on Earth: "@35.36060,138.72740". */
export const spotSlug = (lon: number, lat: number) => `@${lat.toFixed(5)},${lon.toFixed(5)}`;

/** A Wikidata place: "eiffel-tower~q243". */
export const wikidataSlug = (name: string, qid: string) => `${slugify(name) || "place"}~${qid.toLowerCase()}`;

export type ParsedSlug = { kind: "named"; slug: string } | { kind: "spot"; lon: number; lat: number } | { kind: "wikidata"; qid: string };

export function parseSlug(s: string): ParsedSlug | null {
  const t = decodeURIComponent(s).trim();
  const spot = /^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(t);
  if (spot) {
    const lat = Number(spot[1]), lon = Number(spot[2]);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { kind: "spot", lon, lat } : null;
  }
  const wd = /~(q\d+)$/i.exec(t);
  if (wd) return { kind: "wikidata", qid: wd[1].toUpperCase() };
  return /^[a-z0-9-]+$/.test(t) ? { kind: "named", slug: t } : null;
}
