// The United States in depth, from live sources:
//   Congress and the White House: the @unitedstates congress-legislators data
//     (public domain, updated as members change), with official portraits.
//   Governors and Supreme Court justices: Wikidata.
//   Your House district: the Census Bureau's TIGERweb, from a point.
import { cached } from "../data/diskCache";
import { getJson } from "../data/http";
import { commonsThumb } from "../data/wikidata";
import { NON_VOTING, type Person } from "./model";

const GH = "https://raw.githubusercontent.com/unitedstates";
const photo = (bioguide?: string) => (bioguide ? `${GH}/images/gh-pages/congress/225x275/${bioguide}.jpg` : undefined);

interface Term { type: "sen" | "rep" | "prez" | "viceprez"; start: string; end: string; state?: string; district?: number; party?: string; caucus?: string; url?: string; leadership_roles?: { title: string; chamber?: string; start?: string; end?: string }[] }
interface Raw { id: { bioguide?: string; wikidata?: string }; name: { first: string; last: string; official_full?: string }; terms: Term[]; leadership_roles?: { title: string; chamber?: string; start: string; end?: string }[] }

export interface Member extends Person {
  chamber: "sen" | "rep";
  state: string;
  district?: number;
  /** Who they vote with, for independents. */
  caucus?: string;
  roles: string[];
  wikidata?: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const nameOf = (r: Raw) => r.name.official_full ?? `${r.name.first} ${r.name.last}`;

/** Every current member of Congress (voting members and delegates). */
export function congress(): Promise<Member[]> {
  return cached("us:congress", 12 * 3_600_000, async () => {
    const raw = await getJson<Raw[]>("Congress data", `${GH}/congress-legislators/gh-pages/legislators-current.json`);
    const now = today();
    return raw.map((r): Member => {
      const t = r.terms[r.terms.length - 1];
      const roles = (r.leadership_roles ?? []).filter((l) => !l.end || l.end >= now).map((l) => l.title);
      return {
        name: nameOf(r), office: t.type === "sen" ? `U.S. Senator, ${t.state}` : NON_VOTING.has(t.state ?? "") ? `Delegate, ${t.state}` : `U.S. Representative, ${t.state}-${t.district === 0 ? "AL" : t.district}`,
        party: t.party, caucus: t.caucus, photo: photo(r.id.bioguide), since: r.terms.find((x) => x.type === t.type)?.start, url: t.url,
        chamber: t.type === "sen" ? "sen" : "rep", state: t.state ?? "", district: t.district, roles, wikidata: r.id.wikidata,
      };
    });
  });
}

/** The President and Vice President in office today. */
export function whiteHouse(): Promise<Person[]> {
  return cached("us:executive", 12 * 3_600_000, async () => {
    const raw = await getJson<Raw[]>("Congress data", `${GH}/congress-legislators/gh-pages/executive.json`);
    const now = today();
    return raw.flatMap((r) => r.terms.filter((t) => t.start <= now && t.end > now).map((t): Person => ({
      name: nameOf(r), office: t.type === "prez" ? "President" : "Vice President", party: t.party, since: t.start,
      // Portraits for those who never sat in Congress come from Wikidata (filled in by the caller).
      photo: photo(r.id.bioguide), url: r.id.wikidata ? `https://www.wikidata.org/wiki/${r.id.wikidata}` : undefined, wikidata: r.id.wikidata,
    }))).sort((a) => (a.office === "President" ? -1 : 1));
  });
}

const sparql = <T,>(q: string) => getJson<{ results: { bindings: T[] } }>("Wikidata",
  `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json" } }, 25_000);
type B = Record<string, { value: string } | undefined>;

/** Each state's governor today, by postal code ("CA"). */
export function governors(): Promise<Record<string, Person>> {
  return cached("us:governors", 24 * 3_600_000, async () => {
    const r = await sparql<B>(`SELECT ?iso ?gov ?govLabel ?partyLabel ?image ?start WHERE {
  ?state wdt:P31 wd:Q35657; wdt:P300 ?iso; p:P6 ?st.
  ?st ps:P6 ?gov. FILTER NOT EXISTS { ?st pq:P582 ?end. } OPTIONAL { ?st pq:P580 ?start. }
  OPTIONAL { ?gov p:P102 ?ps. ?ps ps:P102 ?party. FILTER NOT EXISTS { ?ps pq:P582 ?pend. } }
  OPTIONAL { ?gov wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`);
    const out: Record<string, Person> = {};
    for (const b of r.results.bindings) {
      const code = b.iso?.value.replace(/^US-/, "");
      if (!code || !b.govLabel || out[code]?.party) continue;
      out[code] = { name: b.govLabel.value, office: "Governor", party: b.partyLabel?.value.replace(/ Party$/, "").replace(/^Democratic$/, "Democrat"), since: b.start?.value.slice(0, 10), photo: b.image ? commonsThumb(b.image.value, 240) : undefined };
    }
    return out;
  });
}

/** The Supreme Court today: the Chief Justice first, then by seniority. */
export function supremeCourt(): Promise<Person[]> {
  return cached("us:scotus", 24 * 3_600_000, async () => {
    const r = await sparql<B>(`SELECT ?j ?jLabel ?posLabel ?start ?image WHERE {
  VALUES ?posName { "Chief Justice of the United States"@en "Associate Justice of the Supreme Court of the United States"@en }
  ?pos rdfs:label ?posName.
  ?j p:P39 ?st. ?st ps:P39 ?pos. FILTER NOT EXISTS { ?st pq:P582 ?end. } OPTIONAL { ?st pq:P580 ?start. }
  FILTER NOT EXISTS { ?j wdt:P570 ?died. }
  OPTIONAL { ?j wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`);
    const seen = new Set<string>();
    return r.results.bindings.flatMap((b): (Person & { chief: boolean })[] => {
      if (!b.jLabel || seen.has(b.jLabel.value)) return [];
      seen.add(b.jLabel.value);
      const chief = /Chief/.test(b.posLabel?.value ?? "");
      return [{ name: b.jLabel.value, office: chief ? "Chief Justice" : "Associate Justice", since: b.start?.value.slice(0, 10), photo: b.image ? commonsThumb(b.image.value, 240) : undefined, chief }];
    }).sort((a, b) => Number(b.chief) - Number(a.chief) || (a.since ?? "").localeCompare(b.since ?? ""));
  });
}

/** Portraits from Wikidata for people with an item. */
export async function portraits(qids: string[]): Promise<Record<string, string>> {
  if (!qids.length) return {};
  const r = await sparql<B>(`SELECT ?p ?image WHERE { VALUES ?p { ${qids.map((q) => `wd:${q}`).join(" ")} } ?p wdt:P18 ?image. }`);
  return Object.fromEntries(r.results.bindings.flatMap((b) => (b.p && b.image ? [[b.p.value.split("/").pop()!, commonsThumb(b.image.value, 240)]] : [])));
}

// ---- Your district --------------------------------------------------------------------------------

const TIGER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer";
let cdLayer: Promise<number> | null = null;

/** The newest congressional districts layer (its number changes with each Congress). */
function districtLayer(): Promise<number> {
  cdLayer ??= getJson<{ layers: { id: number; name: string }[] }>("Census TIGERweb", `${TIGER}?f=json`).then((m) => {
    const cds = m.layers.filter((l) => /Congressional Districts/i.test(l.name) && !/label/i.test(l.name)).sort((a, b) => Number(/\d+/.exec(b.name)?.[0] ?? 0) - Number(/\d+/.exec(a.name)?.[0] ?? 0));
    if (!cds.length) throw new Error("no district layer");
    return cds[0].id;
  });
  cdLayer.catch(() => (cdLayer = null));
  return cdLayer;
}

export interface District { state: string; district: number; name: string; rings: [number, number][][] }

/** The House district at a point (0 for an at-large state), with its outline. */
export async function districtAt(lon: number, lat: number): Promise<District | null> {
  const id = await districtLayer();
  const fc = await getJson<{ features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } | null }[] }>("Census TIGERweb",
    `${TIGER}/${id}/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=geojson`);
  const f = fc.features[0];
  if (!f) return null;
  const p = f.properties;
  const cdKey = Object.keys(p).find((k) => /^CD\d{3}$/i.test(k));
  const num = Number(cdKey ? p[cdKey] : p.BASENAME);
  const g = f.geometry;
  const polys = g?.type === "Polygon" ? [g.coordinates as [number, number][][]] : g?.type === "MultiPolygon" ? (g.coordinates as [number, number][][][]) : [];
  return { state: p.STATE, district: Number.isFinite(num) && num < 98 ? num : 0, name: p.NAME ?? p.BASENAME ?? "", rings: polys.map((poly) => poly[0]) };
}

/** A House district's outline by state (postal code) and number (0 = at large). */
export async function districtByNumber(state: string, num: number): Promise<District | null> {
  const fips = (await import("./model")).US_STATES[state]?.[0];
  if (!fips) return null;
  const id = await districtLayer();
  const fc = await getJson<{ features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } | null }[] }>("Census TIGERweb",
    `${TIGER}/${id}/query?where=${encodeURIComponent(`STATE='${fips}'`)}&outFields=*&returnGeometry=true&outSR=4326&maxAllowableOffset=0.002&f=geojson`);
  const numOf = (p: Record<string, string>) => { const k = Object.keys(p).find((x) => /^CD\d{3}$/i.test(x)); const n = Number(k ? p[k] : p.BASENAME); return Number.isFinite(n) && n < 98 ? n : 0; };
  const f = fc.features.length === 1 ? fc.features[0] : fc.features.find((x) => numOf(x.properties) === num);
  if (!f) return null;
  const g = f.geometry;
  const polys = g?.type === "Polygon" ? [g.coordinates as [number, number][][]] : g?.type === "MultiPolygon" ? (g.coordinates as [number, number][][][]) : [];
  return { state: f.properties.STATE, district: numOf(f.properties), name: f.properties.NAME ?? f.properties.BASENAME ?? "", rings: polys.map((p) => p[0]) };
}
