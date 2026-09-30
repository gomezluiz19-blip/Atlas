// Notable places in a map view, from Wikidata. A place's importance is taken
// as the number of Wikipedia language editions that have an article on it.
import { classifyTypes, type PlaceKind } from "../analysis/placeKinds";
import { getJson } from "./http";

export interface Notable {
  id: string;
  name: string;
  description?: string;
  lon: number;
  lat: number;
  kind: PlaceKind;
  types: string[];
  /** Wikipedia language editions with an article on it. */
  sitelinks: number;
  image?: string;
  article?: string;
  heritage: boolean;
}

interface Binding { value: string }
interface Row {
  item: Binding; itemLabel?: Binding; itemDescription?: Binding; coord: Binding; sl: Binding;
  typeLabel?: Binding; image?: Binding; article?: Binding; heritage?: Binding;
}

/** Minimum Wikipedia editions for a place to be worth labelling at this view size. */
export function sitelinkThreshold(spanDeg: number): number {
  if (spanDeg < 0.06) return 2;
  if (spanDeg < 0.15) return 5;
  if (spanDeg < 0.4) return 10;
  if (spanDeg < 1) return 18;
  if (spanDeg < 2.5) return 30;
  return 45;
}

/**
 * The bar for the next try when a view came back thin: places in much of Africa, South Asia and
 * Latin America are written about in fewer languages, so one bar for the whole world leaves them
 * empty. Halve it (not below 3) until the view has enough to show.
 */
export function lowerBar(min: number, got: number, limit: number): number | null {
  if (got >= Math.min(40, limit / 4) || min <= 3) return null;
  return Math.max(3, Math.floor(min / 2));
}

export async function notablePlaces(west: number, south: number, east: number, north: number, limit = 200): Promise<Notable[]> {
  const span = Math.max(east - west, north - south);
  let min: number | null = sitelinkThreshold(span), out: Notable[] = [];
  for (let tries = 0; min !== null && tries < 3; tries++) {
    out = await notableAbove(west, south, east, north, limit, min);
    min = lowerBar(min, out.length, limit);
  }
  return out;
}

async function notableAbove(west: number, south: number, east: number, north: number, limit: number, min: number): Promise<Notable[]> {
  const f = (v: number) => v.toFixed(4);
  const query = `SELECT ?item ?itemLabel ?itemDescription ?coord ?sl ?typeLabel ?image ?article ?heritage WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord.
    bd:serviceParam wikibase:cornerSouthWest "Point(${f(west)} ${f(south)})"^^geo:wktLiteral;
                    wikibase:cornerNorthEast "Point(${f(east)} ${f(north)})"^^geo:wktLiteral.
  }
  ?item wikibase:sitelinks ?sl. FILTER(?sl >= ${min})
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 }
  OPTIONAL { ?item wdt:P31 ?type. }
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }
  BIND(EXISTS { ?item wdt:P1435 wd:Q9259 } AS ?heritage)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY DESC(?sl)
LIMIT ${limit * 3}`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const body = await getJson<{ results: { bindings: Row[] } }>("Wikidata", url, { headers: { Accept: "application/sparql-results+json" } }, 30_000);
  return groupRows(body.results.bindings).slice(0, limit);
}

/** One Wikidata place by its item id ("Q243"), or null if it has no coordinates. */
export async function notableById(qid: string): Promise<Notable | null> {
  if (!/^Q\d+$/.test(qid)) return null;
  const query = `SELECT ?item ?itemLabel ?itemDescription ?coord ?sl ?typeLabel ?image ?article ?heritage WHERE {
  VALUES ?item { wd:${qid} }
  ?item wdt:P625 ?coord; wikibase:sitelinks ?sl.
  OPTIONAL { ?item wdt:P31 ?type. }
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }
  BIND(EXISTS { ?item wdt:P1435 wd:Q9259 } AS ?heritage)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
} LIMIT 40`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const body = await getJson<{ results: { bindings: Row[] } }>("Wikidata", url, { headers: { Accept: "application/sparql-results+json" } }, 20_000);
  return groupRows(body.results.bindings)[0] ?? null;
}

export function groupRows(rows: Row[]): Notable[] {
  const byId = new Map<string, Notable>();
  for (const r of rows) {
    const id = r.item.value.split("/").pop()!;
    let n = byId.get(id);
    if (!n) {
      const m = r.coord.value.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
      if (!m) continue;
      const name = r.itemLabel?.value ?? id;
      if (/^Q\d+$/.test(name)) continue; // no English label
      n = {
        id, name, description: r.itemDescription?.value, lon: Number(m[1]), lat: Number(m[2]),
        kind: "other", types: [], sitelinks: Number(r.sl.value),
        image: r.image?.value, article: r.article?.value, heritage: r.heritage?.value === "true",
      };
      byId.set(id, n);
    }
    const t = r.typeLabel?.value;
    if (t && !/^Q\d+$/.test(t) && !n.types.includes(t)) n.types.push(t);
  }
  const out = [...byId.values()];
  for (const n of out) n.kind = classifyTypes(n.types);
  return out.sort((a, b) => b.sitelinks - a.sitelinks);
}

/** A Commons image as a thumbnail URL. */
export function commonsThumb(fileUrl: string, width = 480): string {
  const name = decodeURIComponent(fileUrl.split("/").pop() ?? "");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}
