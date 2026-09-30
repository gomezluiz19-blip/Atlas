// The named side of the topics, from Wikidata: companies, central banks and
// stock exchanges; stadiums, teams and athletes; fashion houses and
// designers; dishes; musicians and artists. Fame is the number of Wikipedia
// language editions writing about something, so the best known come first.
import { cached } from "../data/diskCache";
import { getJson } from "../data/http";

type B = Record<string, { value: string } | undefined>;
const DAY = 86_400_000;
const sparql = (q: string) => getJson<{ results: { bindings: B[] } }>("Wikidata",
  `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json" } }, 30_000)
  .then((b) => b.results.bindings);
const v = (b: B, k: string) => b[k]?.value;
const qid = (b: B, k: string) => v(b, k)?.split("/").pop() ?? "";
const point = (wkt?: string): [number, number] | undefined => {
  const m = wkt && /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(wkt);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
};
const around = (lon: number, lat: number, km: number, subject = "?at") =>
  `SERVICE wikibase:around { ${subject} wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${lon.toFixed(4)} ${lat.toFixed(4)})"^^geo:wktLiteral; wikibase:radius "${km}". }`;
const LABELS = `SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }`;
const ARTICLE = (s: string) => `OPTIONAL { ?article schema:about ${s}; schema:isPartOf <https://en.wikipedia.org/>. }`;

/** Something named, with what's worth showing about it. */
export interface Named {
  id: string;
  name: string;
  about?: string;
  /** Extra detail: an industry, a sport, a capacity. */
  detail?: string;
  image?: string;
  article?: string;
  lon?: number;
  lat?: number;
  fame: number;
}

/** Groups rows by item (OPTIONALs multiply them), keeping the first of each detail. */
function named(rows: B[], key: string, detail?: (b: B) => string | undefined): Named[] {
  const by = new Map<string, Named & { details: Set<string> }>();
  for (const b of rows) {
    const id = qid(b, key);
    const name = v(b, `${key}Label`);
    if (!id || !name || /^Q\d+$/.test(name)) continue;
    let n = by.get(id);
    if (!n) {
      const pt = point(v(b, "coord"));
      n = { id, name, about: v(b, `${key}Description`), image: v(b, "image"), article: v(b, "article"), lon: pt?.[0], lat: pt?.[1], fame: Number(v(b, "sl") ?? 0), details: new Set() };
      by.set(id, n);
    }
    const d = detail?.(b);
    if (d && n.details.size < 2) n.details.add(d);
  }
  return [...by.values()].sort((a, b) => b.fame - a.fame).map(({ details, ...n }) => ({ ...n, detail: [...details].join(", ") || undefined }));
}

const COMPANY = "wd:Q4830453 wd:Q891723 wd:Q783794 wd:Q6881511 wd:Q22687 wd:Q167037 wd:Q219577 wd:Q1589009";

/** A country's best-known companies (by ISO 3166 alpha-3). */
export function companiesOf(iso3: string): Promise<Named[]> {
  return cached(`topics:co:${iso3}`, 7 * DAY, async () => named(await sparql(`SELECT ?co ?coLabel ?coDescription ?sl ?industryLabel ?article WHERE {
  { SELECT ?co ?sl WHERE {
    ?c wdt:P298 "${iso3}". ?co wdt:P17 ?c; wdt:P31 ?t. VALUES ?t { ${COMPANY} }
    FILTER NOT EXISTS { ?co wdt:P576 ?gone. }
    ?co wikibase:sitelinks ?sl.
  } ORDER BY DESC(?sl) LIMIT 24 }
  OPTIONAL { ?co wdt:P452 ?industry. }
  ${ARTICLE("?co")}
  ${LABELS}
}`), "co", (b) => v(b, "industryLabel")).slice(0, 15));
}

/** Companies with their head office near a place. */
export function companiesNear(lon: number, lat: number, km = 25): Promise<Named[]> {
  return cached(`topics:con:${lon.toFixed(2)},${lat.toFixed(2)}`, 7 * DAY, async () => named(await sparql(`SELECT ?co ?coLabel ?coDescription ?sl ?industryLabel ?article ?coord WHERE {
  { SELECT ?co ?sl ?coord WHERE {
    ${around(lon, lat, km)}
    ?co wdt:P159 ?at; wdt:P31 ?t. VALUES ?t { ${COMPANY} }
    FILTER NOT EXISTS { ?co wdt:P576 ?gone. }
    ?co wikibase:sitelinks ?sl.
  } ORDER BY DESC(?sl) LIMIT 30 }
  OPTIONAL { ?co wdt:P452 ?industry. }
  ${ARTICLE("?co")}
  ${LABELS}
}`), "co", (b) => v(b, "industryLabel")).slice(0, 12));
}

/** A country's central bank and stock exchanges. */
export function moneyBodies(iso3: string): Promise<{ bank?: Named; exchanges: Named[] }> {
  return cached(`topics:mb:${iso3}`, 30 * DAY, async () => {
    const rows = await sparql(`SELECT ?kind ?x ?xLabel ?xDescription ?sl ?article WHERE {
  ?c wdt:P298 "${iso3}".
  { ?x wdt:P31 wd:Q66344. { ?x wdt:P1001 ?c. } UNION { ?x wdt:P17 ?c. } BIND("bank" AS ?kind) }
  UNION { ?x wdt:P31 wd:Q11691; wdt:P17 ?c. BIND("exchange" AS ?kind) }
  FILTER NOT EXISTS { ?x wdt:P576 ?gone. }
  ?x wikibase:sitelinks ?sl.
  ${ARTICLE("?x")}
  ${LABELS}
}`);
    return { bank: named(rows.filter((b) => v(b, "kind") === "bank"), "x")[0], exchanges: named(rows.filter((b) => v(b, "kind") === "exchange"), "x").slice(0, 3) };
  });
}

/** Stadiums and arenas near a place, biggest crowds first, with the teams that play there. */
export function venuesNear(lon: number, lat: number, km = 40): Promise<(Named & { capacity?: number; teams: string[] })[]> {
  return cached(`topics:ven:${lon.toFixed(2)},${lat.toFixed(2)}`, 7 * DAY, async () => {
    const rows = await sparql(`SELECT ?at ?atLabel ?atDescription ?coord ?sl ?cap ?teamLabel ?sportLabel ?image ?article WHERE {
  ${around(lon, lat, km)}
  ?at wdt:P31 ?t. VALUES ?t { wd:Q483110 wd:Q641226 wd:Q1076486 wd:Q1154710 }
  FILTER NOT EXISTS { ?at wdt:P576 ?gone. }
  ?at wikibase:sitelinks ?sl.
  OPTIONAL { ?at wdt:P1083 ?cap. }
  OPTIONAL { ?at wdt:P18 ?image. }
  OPTIONAL { ?team wdt:P115 ?at. FILTER NOT EXISTS { ?team wdt:P576 ?teamGone. } OPTIONAL { ?team wdt:P641 ?sport. } }
  ${ARTICLE("?at")}
  ${LABELS}
} LIMIT 400`);
    const teams = new Map<string, Set<string>>(), caps = new Map<string, number>();
    for (const b of rows) {
      const id = qid(b, "at"), t = v(b, "teamLabel"), c = Number(v(b, "cap"));
      if (t && !/^Q\d+$/.test(t)) (teams.get(id) ?? teams.set(id, new Set()).get(id)!).add(t);
      if (c > (caps.get(id) ?? 0)) caps.set(id, c);
    }
    return named(rows, "at", (b) => v(b, "sportLabel"))
      .map((n) => ({ ...n, capacity: caps.get(n.id), teams: [...(teams.get(n.id) ?? [])].slice(0, 4) }))
      .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0) || b.fame - a.fame)
      .slice(0, 12);
  });
}

/** A country's best-known sportspeople (those who compete for it). */
export function athletesOf(iso3: string): Promise<Named[]> {
  return cached(`topics:ath:${iso3}`, 7 * DAY, async () => named(await sparql(`SELECT ?p ?pLabel ?pDescription ?sl ?sportLabel ?image ?article WHERE {
  { SELECT ?p ?sl WHERE { ?c wdt:P298 "${iso3}". ?p wdt:P1532 ?c; wikibase:sitelinks ?sl. } ORDER BY DESC(?sl) LIMIT 16 }
  OPTIONAL { ?p wdt:P641 ?sport. }
  OPTIONAL { ?p wdt:P18 ?image. }
  ${ARTICLE("?p")}
  ${LABELS}
}`), "p", (b) => v(b, "sportLabel")).slice(0, 12));
}

/** Fashion houses and clothing labels from a country, and its best-known designers. */
export function fashionOf(iso3: string): Promise<{ labels: Named[]; designers: Named[] }> {
  return cached(`topics:fa:${iso3}`, 7 * DAY, async () => {
    const [labels, designers] = await Promise.all([
      sparql(`SELECT ?x ?xLabel ?xDescription ?sl ?article WHERE {
  { SELECT DISTINCT ?x ?sl WHERE {
    ?c wdt:P298 "${iso3}".
    { ?x wdt:P31 wd:Q1618899. } UNION { ?x wdt:P452 ?ind. VALUES ?ind { wd:Q12684 wd:Q11460 } }
    { ?x wdt:P17 ?c. } UNION { ?x wdt:P495 ?c. }
    FILTER NOT EXISTS { ?x wdt:P576 ?gone. }
    ?x wikibase:sitelinks ?sl.
  } ORDER BY DESC(?sl) LIMIT 14 }
  ${ARTICLE("?x")}
  ${LABELS}
}`),
      sparql(`SELECT ?x ?xLabel ?xDescription ?sl ?image ?article WHERE {
  { SELECT ?x ?sl WHERE { ?c wdt:P298 "${iso3}". ?x wdt:P106 wd:Q3501317; wdt:P27 ?c; wikibase:sitelinks ?sl. } ORDER BY DESC(?sl) LIMIT 10 }
  OPTIONAL { ?x wdt:P18 ?image. }
  ${ARTICLE("?x")}
  ${LABELS}
}`),
    ]);
    return { labels: named(labels, "x").slice(0, 12), designers: named(designers, "x").slice(0, 8) };
  });
}

/** Dishes and foods that come from a country. */
export function dishesOf(iso3: string): Promise<Named[]> {
  return cached(`topics:dish:${iso3}`, 30 * DAY, async () => named(await sparql(`SELECT ?x ?xLabel ?xDescription ?sl ?image ?article WHERE {
  { SELECT DISTINCT ?x ?sl WHERE {
    ?c wdt:P298 "${iso3}". ?x wdt:P495 ?c; wdt:P31 ?t. VALUES ?t { wd:Q746549 wd:Q2095 }
    ?x wikibase:sitelinks ?sl.
  } ORDER BY DESC(?sl) LIMIT 16 }
  OPTIONAL { ?x wdt:P18 ?image. }
  ${ARTICLE("?x")}
  ${LABELS}
}`), "x").slice(0, 12));
}

const MUSIC = "wd:Q639669 wd:Q177220 wd:Q36834 wd:Q488205 wd:Q2252262 wd:Q753110 wd:Q855091";
const ART = "wd:Q1028181 wd:Q1281618 wd:Q33231 wd:Q483501 wd:Q3391743";

/** Musicians and artists born near a place, and bands formed there. */
export function artistsNear(lon: number, lat: number, km = 30): Promise<{ music: Named[]; art: Named[] }> {
  return cached(`topics:art:${lon.toFixed(2)},${lat.toFixed(2)}`, 7 * DAY, async () => {
    const rows = await sparql(`SELECT ?x ?xLabel ?xDescription ?sl ?kind ?image ?article WHERE {
  { SELECT DISTINCT ?x ?sl ?kind WHERE {
    ${around(lon, lat, km)}
    { ?x wdt:P19 ?at; wdt:P106 ?o. VALUES ?o { ${MUSIC} } BIND("music" AS ?kind) }
    UNION { ?x wdt:P740 ?at; wdt:P31 wd:Q215380. BIND("music" AS ?kind) }
    UNION { ?x wdt:P19 ?at; wdt:P106 ?o. VALUES ?o { ${ART} } BIND("art" AS ?kind) }
    ?x wikibase:sitelinks ?sl.
  } ORDER BY DESC(?sl) LIMIT 40 }
  OPTIONAL { ?x wdt:P18 ?image. }
  ${ARTICLE("?x")}
  ${LABELS}
}`);
    const music = named(rows.filter((b) => v(b, "kind") === "music"), "x").slice(0, 10);
    const art = named(rows.filter((b) => v(b, "kind") === "art"), "x").filter((n) => !music.some((m) => m.id === n.id)).slice(0, 8);
    return { music, art };
  });
}

/** A country's World Heritage Sites, best known first. */
export function heritageOf(iso3: string): Promise<Named[]> {
  return cached(`topics:whs:${iso3}`, 30 * DAY, async () => named(await sparql(`SELECT ?x ?xLabel ?xDescription ?sl ?coord ?image ?article WHERE {
  { SELECT ?x ?sl WHERE { ?c wdt:P298 "${iso3}". ?x wdt:P1435 wd:Q9259; wdt:P17 ?c; wikibase:sitelinks ?sl. } ORDER BY DESC(?sl) LIMIT 14 }
  OPTIONAL { ?x wdt:P625 ?coord. }
  OPTIONAL { ?x wdt:P18 ?image. }
  ${ARTICLE("?x")}
  ${LABELS}
}`), "x").slice(0, 12));
}

/** A country's best-known universities. */
export function universitiesOf(iso3: string): Promise<Named[]> {
  return cached(`topics:uni:${iso3}`, 30 * DAY, async () => named(await sparql(`SELECT ?x ?xLabel ?xDescription ?sl ?coord ?image ?article WHERE {
  { SELECT DISTINCT ?x ?sl WHERE {
    ?c wdt:P298 "${iso3}". ?x wdt:P31 ?t; wdt:P17 ?c. VALUES ?t { wd:Q3918 wd:Q902104 wd:Q15936437 }
    FILTER NOT EXISTS { ?x wdt:P576 ?gone. }
    ?x wikibase:sitelinks ?sl.
  } ORDER BY DESC(?sl) LIMIT 14 }
  OPTIONAL { ?x wdt:P625 ?coord. }
  OPTIONAL { ?x wdt:P154 ?image. }
  ${ARTICLE("?x")}
  ${LABELS}
}`), "x").slice(0, 12));
}
