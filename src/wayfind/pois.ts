// What the wayfinder can tell you about: Terreno's own landmarks (every intro, with its first line), the
// notable natural features (peaks, rivers, volcanoes, craters…), the whole World Heritage List once it has
// loaded, and, close to the ground, whatever Wikipedia has written about the streets around you.
import { FEATURES } from "../content/features";
import { getJson } from "../data/http";
import { INTROS, loadWorldHeritage, worldHeritagePlaces, type IntroPlace } from "../intros/places";
import { km, type LL, type Poi } from "./model";

const fromIntro = (p: IntroPlace): Poi => ({
  id: `i:${p.id}`, name: p.name, kind: p.tags?.includes("heritage") ? "heritage" : p.tags?.[0] ?? "landmark", lon: p.lon, lat: p.lat, where: p.where,
  line: p.lines[0] ?? "", weight: p.id.startsWith("whc-") ? 2 : 3,
});
const BIG = new Set(["peak", "volcano", "crater", "canyon", "waterfall", "deep", "lake"]);

let base: Poi[] | null = null;
/** The landmarks and features bundled with the app (pure data; built once). */
export function basePois(): Poi[] {
  if (base) return base;
  const out = INTROS.map(fromIntro);
  for (const f of FEATURES) {
    // A feature the intros already tell (within 2 km, same name) isn't told twice.
    if (out.some((p) => p.name === f.name && km(p, f) < 2)) continue;
    out.push({ id: `f:${f.kind}:${f.name}`, name: f.name, kind: f.kind, lon: f.lon, lat: f.lat, weight: BIG.has(f.kind) ? 3 : 2,
      line: f.blurb || f.facts.map(([k, v]) => `${k}: ${v}`).join(" · ") });
  }
  return (base = out);
}

let all: Poi[] | null = null;
/** The bundled set plus every World Heritage Site (loads the List the first time). */
export async function allPois(): Promise<Poi[]> {
  if (all) return all;
  await loadWorldHeritage().catch(() => {});
  const seen = new Set(basePois().map((p) => p.id));
  return (all = [...basePois(), ...worldHeritagePlaces().map(fromIntro).filter((p) => !seen.has(p.id))]);
}

/** Articles about the streets around you that aren't worth a "you're passing" (pure). */
export const DULL = /\b(street|road|avenue|boulevard|lane|highway|motorway|freeway|interchange|junction|bus stop|bus station|school|college campus|electoral|ward|district of|neighbou?rhood|census|human settlement|hamlet|unincorporated|apartment|office building|company|business|shopping centre|car park|parking|cemetery in|church building in|disambiguation)\b/i;

interface GeoPage { pageid: number; title: string; description?: string; coordinates?: { lat: number; lon: number }[]; thumbnail?: { source: string } }
/** Wikipedia's geotagged articles in a search response, as things worth passing (pure). */
export function parseGeo(r: { query?: { pages?: Record<string, GeoPage> | GeoPage[] } }): Poi[] {
  const pages = r.query?.pages ? (Array.isArray(r.query.pages) ? r.query.pages : Object.values(r.query.pages)) : [];
  const out: Poi[] = [];
  for (const p of pages) {
    const c = p.coordinates?.[0];
    if (!c || !p.description || DULL.test(p.description) || DULL.test(p.title)) continue;
    const line = p.description.charAt(0).toUpperCase() + p.description.slice(1);
    out.push({ id: `w:${p.pageid}`, name: p.title, kind: "wiki", lon: c.lon, lat: c.lat, line, weight: p.thumbnail ? 1.4 : 1 });
  }
  return out;
}

const cells = new Map<string, Promise<Poi[]>>();
/** What Wikipedia knows within `radiusM` (max 10 km), cached by roughly 3 km cells so a walk doesn't re-ask. */
export function nearbyWiki(at: LL, radiusM = 4000): Promise<Poi[]> {
  const key = `${Math.round(at.lat * 36)}:${Math.round(at.lon * 36)}:${radiusM}`;
  let hit = cells.get(key);
  if (!hit) {
    const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&generator=geosearch" +
      `&ggscoord=${at.lat.toFixed(5)}%7C${at.lon.toFixed(5)}&ggsradius=${Math.min(10_000, Math.round(radiusM))}&ggslimit=50` +
      "&prop=coordinates%7Cdescription%7Cpageimages&piprop=thumbnail&pithumbsize=96";
    hit = getJson<{ query?: { pages?: GeoPage[] } }>("Wikipedia", url, undefined, 12_000).then(parseGeo).catch(() => []);
    cells.set(key, hit);
    if (cells.size > 60) cells.delete(cells.keys().next().value!);
  }
  return hit;
}
