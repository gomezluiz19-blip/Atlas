// Every other country, simply: one Wikidata query for who holds power (head
// of state and of government, their parties and offices, the legislature and
// its seats, the highest court, the form of government), and one for the
// next national elections everywhere. Wikidata is edited by volunteers, so
// it can lag an election or a reshuffle by days; the page says so.
import { cached } from "../data/diskCache";
import { getJson } from "../data/http";
import { commonsThumb } from "../data/wikidata";
import { partyColor, type Election, type Leadership, type Person } from "./model";

type B = Record<string, { value: string } | undefined>;
const sparql = (q: string) => getJson<{ results: { bindings: B[] } }>("Wikidata",
  `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json" } }, 30_000);
const v = (b: B, k: string) => b[k]?.value;
const short = (party?: string) => party?.replace(/ \(.*\)$/, "");

/** Who governs a country, by ISO 3166 alpha-3 code. */
export function leadershipOf(iso3: string, name: string): Promise<Leadership> {
  return cached(`politics:${iso3}`, 12 * 3_600_000, async () => {
    const [who, body] = await Promise.all([
      sparql(`SELECT ?role ?person ?personLabel ?officeLabel ?partyLabel ?image ?start WHERE {
  ?c wdt:P298 "${iso3}".
  VALUES (?prop ?role ?officeProp) { (p:P35 "state" wdt:P1906) (p:P6 "government" wdt:P1313) }
  ?c ?prop ?st. ?st ?ps ?person. FILTER(STRSTARTS(STR(?ps), "http://www.wikidata.org/prop/statement/"))
  FILTER NOT EXISTS { ?st pq:P582 ?end. } OPTIONAL { ?st pq:P580 ?start. }
  OPTIONAL { ?c ?officeProp ?office. }
  OPTIONAL { ?person p:P102 ?pst. ?pst ps:P102 ?party. FILTER NOT EXISTS { ?pst pq:P582 ?pend. } }
  OPTIONAL { ?person wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`),
      sparql(`SELECT ?kind ?item ?itemLabel ?seats WHERE {
  ?c wdt:P298 "${iso3}".
  { ?c wdt:P122 ?item. BIND("system" AS ?kind) }
  UNION { ?c wdt:P194 ?item. BIND("legislature" AS ?kind) OPTIONAL { ?item wdt:P1342 ?seats. } }
  UNION { ?c wdt:P194 ?l. ?l wdt:P527 ?item. BIND("chamber" AS ?kind) OPTIONAL { ?item wdt:P1342 ?seats. } }
  UNION { ?c wdt:P209 ?item. BIND("court" AS ?kind) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`),
    ]);
    // People: head of state first; the same person in both roles once.
    const people = new Map<string, Person & { roles: Set<string> }>();
    for (const b of who.results.bindings) {
      const id = v(b, "person"), label = v(b, "personLabel");
      if (!id || !label || /^Q\d+$/.test(label)) continue;
      const office = v(b, "officeLabel") ?? (v(b, "role") === "state" ? "Head of state" : "Head of government");
      const p = people.get(id) ?? { name: label, office: "", roles: new Set<string>(), party: short(v(b, "partyLabel")), photo: v(b, "image") ? commonsThumb(v(b, "image")!, 240) : undefined, since: v(b, "start")?.slice(0, 10), url: id.replace("http://", "https://") };
      p.roles.add(office.charAt(0).toUpperCase() + office.slice(1));
      if (!p.party && v(b, "partyLabel")) p.party = short(v(b, "partyLabel"));
      people.set(id, p);
    }
    const executive = [...people.values()].map(({ roles, ...p }) => ({ ...p, office: [...roles].join(" and ") }));
    const rows = body.results.bindings;
    const pick = (kind: string) => rows.filter((b) => v(b, "kind") === kind && v(b, "itemLabel") && !/^Q\d+$/.test(v(b, "itemLabel")!));
    const chambers = pick("chamber"), houses = chambers.length ? chambers : pick("legislature");
    const seen = new Set<string>();
    const legislature = houses.filter((b) => (seen.has(v(b, "itemLabel")!) ? false : (seen.add(v(b, "itemLabel")!), true))).map((b) => {
      const seats = Number(v(b, "seats") ?? 0);
      return { name: v(b, "itemLabel")!, seats, parties: [], leaders: [], majority: seats ? Math.floor(seats / 2) + 1 : undefined };
    });
    const court = pick("court")[0];
    const system = pick("system").map((b) => v(b, "itemLabel")!).join(", ");
    const head = executive.find((p) => /government|prime|premier|chancellor/i.test(p.office)) ?? executive[0];
    return {
      country: name, system: system || undefined, executive, legislature,
      judiciary: court ? { name: v(court, "itemLabel")!, members: [] } : undefined,
      governing: head?.party,
      summary: head ? `${head.name}${head.party ? ` (${head.party})` : ""} leads the government.` : undefined,
      next: [], sources: ["Wikidata (edited by volunteers; it can lag a recent election or reshuffle by a few days)"],
    } satisfies Leadership;
  });
}

/** The next national elections everywhere in the coming few years, by ISO3 (soonest first per country). */
export function nextElections(): Promise<Record<string, Election[]>> {
  return cached("politics:next", 24 * 3_600_000, async () => {
    const r = await sparql(`SELECT ?iso ?e ?eLabel ?date WHERE {
  ?e wdt:P1001 ?c; wdt:P585 ?date; wdt:P31/wdt:P279* wd:Q40231.
  ?c wdt:P298 ?iso.
  FILTER(?date > NOW() && ?date < NOW() + "P1460D"^^xsd:duration)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY ?date LIMIT 2000`);
    const out: Record<string, Election[]> = {};
    for (const b of r.results.bindings) {
      const iso = v(b, "iso"), label = v(b, "eLabel"), date = v(b, "date")?.slice(0, 10);
      if (!iso || !label || !date || /^Q\d+$/.test(label)) continue;
      const list = (out[iso] ??= []);
      if (list.length < 3 && !list.some((x) => x.what === label)) list.push({ date, what: label });
    }
    return out;
  });
}

export { partyColor };
