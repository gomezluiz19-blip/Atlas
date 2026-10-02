// Fetching for Finance and Banking: Wikidata (company shape and figures),
// OpenStreetMap (branches) and, when a key is set, a live quote.
import { config } from "../config";
import { cached } from "../data/diskCache";
import { getJson } from "../data/http";
import { overpass } from "../data/overpass";
import { branchesQuery, brandQuery, factsQuery, figuresQuery, readFacts, readFigures, readTies, tiesQuery, toBranches, type Branch, type Facts, type Figures, type Tied } from "./model";

type B = Record<string, { value: string } | undefined>;
const DAY = 86_400_000;
const sparql = (q: string) => getJson<{ results: { bindings: B[] } }>("Wikidata",
  `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json" } }, 40_000).then((b) => b.results.bindings);

export interface Hit { id: string; name: string; about?: string }

/** Companies (or anything) by name, from Wikidata's own search. */
export async function searchCompanies(q: string): Promise<Hit[]> {
  const r = await getJson<{ search?: { id: string; label?: string; description?: string }[] }>("Wikidata",
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&uselang=en&type=item&limit=10&format=json&origin=*`);
  return (r.search ?? []).map((x) => ({ id: x.id, name: x.label ?? x.id, about: x.description }));
}

export const companyFacts = (id: string): Promise<Facts | null> => cached(`fin:facts:${id}`, 3 * DAY, async () => readFacts(await sparql(factsQuery(id))));
export const companyFigures = (id: string): Promise<Figures> => cached(`fin:fig:${id}`, 3 * DAY, async () => readFigures(await sparql(figuresQuery(id))));
export const companyTies = (id: string): Promise<Tied[]> => cached(`fin:ties:${id}`, 3 * DAY, async () => readTies(await sparql(tiesQuery(id)), id));

export const branchesNear = (lon: number, lat: number, m: number): Promise<Branch[]> => overpass(branchesQuery(lon, lat, m)).then(toBranches);
export const brandNear = (qid: string, lon: number, lat: number, m: number): Promise<Branch[]> => overpass(brandQuery(qid, lon, lat, m)).then(toBranches);

export interface Quote { price: number; change: number; changePct: number; high: number; low: number; open: number; prevClose: number; at: number }

/** A live quote, when a key is set (US tickers on the free plan). */
export async function quote(ticker: string): Promise<Quote | null> {
  if (!config.finnhubKey) return null;
  const r = await getJson<{ c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number }>("Finnhub",
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${config.finnhubKey}`, undefined, 10_000, true);
  return r && r.c ? { price: r.c, change: r.d, changePct: r.dp, high: r.h, low: r.l, open: r.o, prevClose: r.pc, at: r.t * 1000 } : null;
}
