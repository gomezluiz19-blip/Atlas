// The market: the world's mines as prospects. Atlas's own list of major mines
// (with method and commodities) joined with every operating mine Wikidata has
// coordinates for, then scored for how well each fits what the company sells
// and how easily it can be serviced from the company's bases. Pure scoring;
// one loader.
import { getJson } from "../../data/http";
import { COMMODITIES, MINES } from "../../content/minerals";
import { kmBetween } from "../kit/ops";
import type { Company } from "./network";

export interface Mine { id: string; name: string; lon: number; lat: number; country?: string; commodities: string[]; method?: string; operator?: string; source: "atlas" | "wikidata" }

/** Commodity ids from free text ("copper ore", "Gold", "coal mine"; pure). */
export function commoditiesIn(text: string): string[] {
  const t = text.toLowerCase();
  return COMMODITIES.filter((c) => t.includes(c.name.toLowerCase()) || t.includes(c.id)).map((c) => c.id);
}

/** Wikidata rows to mines, one per item, commodities gathered (pure). */
export function readMines(rows: Record<string, { value: string }>[]): Mine[] {
  const out = new Map<string, Mine>();
  for (const r of rows) {
    const id = r.m?.value.split("/").pop(), m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coord?.value ?? "");
    if (!id || !m || /^Q\d+$/.test(r.mLabel?.value ?? "")) continue;
    const x = out.get(id) ?? { id, name: r.mLabel.value, lon: Number(m[1]), lat: Number(m[2]), country: r.countryLabel?.value, commodities: [], operator: r.opLabel?.value, source: "wikidata" as const };
    for (const c of commoditiesIn(`${r.prodLabel?.value ?? ""} ${r.typeLabel?.value ?? ""} ${x.name}`)) if (!x.commodities.includes(c)) x.commodities.push(c);
    if (!x.method && /open.?pit|open.?cast|quarry/i.test(`${r.typeLabel?.value ?? ""}`)) x.method = "open pit";
    if (!x.method && /underground|shaft/i.test(`${r.typeLabel?.value ?? ""}`)) x.method = "underground";
    out.set(id, x);
  }
  return [...out.values()];
}

const bundled = (): Mine[] => MINES.map((m, i) => ({ id: `atlas${i}`, name: m.name, lon: m.lon, lat: m.lat, country: m.country, commodities: m.goods, method: m.kind, source: "atlas" }));

let world: Promise<Mine[]> | null = null;

/** Atlas's major mines plus Wikidata's operating mines (no duplicates within 5 km of a bundled one). */
export function worldMines(): Promise<Mine[]> {
  world ??= (async () => {
    const q = `SELECT ?m ?mLabel ?coord ?countryLabel ?opLabel ?prodLabel ?typeLabel WHERE {
  ?m wdt:P31 ?type. ?type wdt:P279* wd:Q820477.
  ?m wdt:P625 ?coord.
  FILTER NOT EXISTS { ?m wdt:P576 ?closed }
  OPTIONAL { ?m wdt:P17 ?country } OPTIONAL { ?m wdt:P137 ?op } OPTIONAL { ?m wdt:P1056 ?prod }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
} LIMIT 12000`;
    const own = bundled();
    const rows = await getJson<{ results: { bindings: Record<string, { value: string }>[] } }>("Wikidata", `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json" } }, 60_000)
      .then((b) => b.results.bindings).catch(() => []);
    const wd = readMines(rows).filter((w) => !own.some((o) => kmBetween(o, w) < 5));
    return [...own, ...wd];
  })();
  world.catch(() => (world = null));
  return world;
}

/**
 * How well a mine fits the company (0–100; pure): what it digs (the company's
 * commodities), how (open pit or underground, against what the company's
 * machines are for), and how quickly it can be serviced from the nearest base.
 */
export function fit(c: Company, m: Mine, hoursToReach: number) {
  let score = 30;
  const why: string[] = [];
  const com = m.commodities.filter((x) => c.offer.commodities.includes(x));
  if (com.length) { score += 30; why.push(`mines ${com.join(" and ")}`); }
  else if (!m.commodities.length) score += 5;
  const method = (m.method ?? "").toLowerCase();
  if (method && c.offer.methods.some((x) => method.includes(x))) { score += 20; why.push(method); }
  else if (!method) score += 5;
  if (hoursToReach <= c.slaHours) { score += 20; why.push(`reachable in ${Math.round(hoursToReach)} h`); }
  else if (hoursToReach <= c.slaHours * 2) { score += 5; why.push(`${Math.round(hoursToReach)} h from the nearest base`); }
  else { score -= 10; why.push(`${Math.round(hoursToReach)} h away: needs a new base`); }
  return { score: Math.max(0, Math.min(100, score)), why };
}

/** Straight-line hours from the nearest base, a quick screen before real travel is worked out (pure). */
export function quickHours(c: Company, p: { lon: number; lat: number }) {
  const bases = [...c.techs, ...c.depots];
  const km = Math.min(...bases.map((b) => kmBetween(b, p)), Infinity);
  return km < 300 ? (km * 1.35) / 65 : 3 + km / 650 + 3;
}
