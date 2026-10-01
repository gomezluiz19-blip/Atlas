// Every site on the World Heritage List as an intro. Where Atlas already
// has an intro for the place (the same spot, or a nearby one sharing a
// distinctive word of its name), the listing joins it: its UNESCO name
// becomes another name to find it by, and the year it was inscribed is
// added. The rest get a plainer intro from the listing itself, played over
// the real ground and the buildings standing there (pure, apart from
// joining onto the intros it's given).
import type { IntroPlace } from "./places";
import { WHC, type WhcRow } from "./whcList";

const SHORT: Record<string, string> = {
  "United States of America": "United States", "United Kingdom of Great Britain and Northern Ireland": "United Kingdom",
  "Iran (Islamic Republic of)": "Iran", "Bolivia (Plurinational State of)": "Bolivia", "Venezuela (Bolivarian Republic of)": "Venezuela",
  "United Republic of Tanzania": "Tanzania", "Lao People's Democratic Republic": "Laos", "Republic of Korea": "South Korea",
  "Democratic People's Republic of Korea": "North Korea", "Republic of Moldova": "Moldova", "Netherlands (Kingdom of the)": "Netherlands",
  "Micronesia (Federated States of)": "Micronesia", "Jerusalem (Site proposed by Jordan)": "Jerusalem", "Russian Federation": "Russia",
  "Syrian Arab Republic": "Syria", "Viet Nam": "Vietnam", "Holy See": "Holy See (Vatican City)", "Democratic Republic of the Congo": "DR Congo",
};
export const countriesOf = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).map((x) => SHORT[x] ?? x);
const where = (cs: string[]) => (cs.length <= 3 ? cs.join(", ") : `${cs.slice(0, 2).join(", ")} and ${cs.length - 2} more countries`);

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// Words too common in heritage names to say two names are the same place.
const COMMON = new Set("pont historic historical centre center city cities town towns national park parks monument monuments ancient group cultural culture landscape landscapes archaeological archaeology site sites church churches cathedral cathedrals palace palaces temple temples area areas river rivers mount mountain mountains lake lakes island islands valley valleys great royal fort forts fortress fortifications castle castles reserve reserves sanctuary sanctuaries wildlife nature natural region heritage world property works complex ensemble early medieval roman buildings building garden gardens house houses including with their from other route routes system protected forest forests coast coastal bridge tower world's".split(" "));
const words = (s: string) => norm(s).split(" ").filter((w) => w.length >= 4 && !COMMON.has(w));
const sharesWord = (a: string[], b: string[]) => a.some((x) => b.some((y) => x === y || (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x)))));
const km = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
  Math.hypot((a.lon - b.lon) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), (a.lat - b.lat) * 110.54);

/** Intros that belong to a listing whose name or point doesn't give it away (intro id → UNESCO ids). */
export const CLAIMS: Record<string, number[]> = {
  karnak: [87], "luxor-temple": [87], "valley-of-the-kings": [87], "mohenjo-daro": [138], kakadu: [147], "cradle-mountain": [181], bamiyan: [208],
  "amber-fort": [247], "park-guell": [320], "sagrada-familia": [320], "pueblo-bonito": [353], "hadrians-wall": [430], sukhothai: [574],
  "prague-castle": [616], "charles-bridge": [616], hue: [678], "great-blue-hole": [764], pingyao: [812], chambord: [933], "hoi-an": [948],
  geirangerfjord: [1195], "tre-cime": [1237], socotra: [1263], meroe: [1336], "cape-coast-castle": [34], nyiragongo: [63], colosseum: [91],
  everest: [120], boudhanath: [121], "perito-moreno": [145], "great-barrier-reef": [154], "havana-capitolio": [204], "half-dome": [308],
  "iguazu-falls": [355], "blue-mosque": [356], "grand-bazaar": [356], zocalo: [412], "great-wall": [438], "terracotta-army": [441], hermitage: [540],
  "milford-sound": [551], registan: [603], zhangjiajie: [640], "angel-falls": [701], "easter-island-moai": [715], "table-mountain": [1007],
  "christ-the-redeemer": [1100], sugarloaf: [1100], "mount-fuji": [1418], sossusvlei: [1430], louvre: [600], "eiffel-tower": [600], "notre-dame": [600], "hagia-sophia": [356],
};
/** Listings that must not join an intro just for being near it or sharing a word (they're separate places). */
const APART = new Set([804, 976, 1005, 1338, 1351, 1352, 1397, 1426, 1480, 1492, 1605, 1714]);

const KIND = { c: "Cultural", n: "Natural", m: "Cultural and natural" } as const;

/** The intro for a listing that has none of its own (pure). */
export function listingIntro([id, name, cs, cat, year, lon, lat]: WhcRow): IntroPlace {
  const countries = countriesOf(cs);
  return {
    id: `whc-${id}`, whc: id, name, where: where(countries), lon, lat,
    size: cat === "c" ? 1200 : cat === "m" ? 6000 : 15000,
    tags: ["heritage"],
    lines: [
      `On UNESCO's World Heritage List since ${year}, for its ${cat === "c" ? "cultural" : cat === "n" ? "natural" : "cultural and natural"} value.`,
      cat === "c" ? "Shown as the ground it stands on and the buildings around it today." : "Shown as the land itself, its relief raised so its shape reads.",
    ],
    facts: [["World Heritage since", String(year)], ["Listed as", KIND[cat]], countries.length > 1 ? ["Countries", String(countries.length)] : ["Country", countries[0] ?? ""]],
  };
}

/** The intro a listing belongs with, if Atlas already has one (pure). */
export function joinFor(row: WhcRow, intros: IntroPlace[]): IntroPlace | null {
  const [, name, , , , lon, lat] = row;
  const w = words(name);
  let best: IntroPlace | null = null, bd = Number.POSITIVE_INFINITY;
  for (const p of intros) {
    const d = km(p, { lon, lat });
    if (d > 60 || d >= bd) continue;
    if (d < 0.4 || sharesWord(w, [p.name, ...(p.also ?? [])].flatMap(words))) { best = p; bd = d; }
  }
  return best;
}

/**
 * The whole List as intros: joins each listing onto the intro it belongs
 * with (adding its UNESCO name and year), and returns intros for the rest.
 */
export function worldHeritage(intros: IntroPlace[], rows: WhcRow[] = WHC): IntroPlace[] {
  const out: IntroPlace[] = [];
  const claimed = new Map<number, IntroPlace[]>();
  for (const p of intros) for (const id of CLAIMS[p.id] ?? []) claimed.set(id, [...(claimed.get(id) ?? []), p]);
  const claimedIds = new Set([...claimed.values()].flat().map((p) => p.id));
  for (const row of rows) {
    const near = APART.has(row[0]) ? null : joinFor(row, intros.filter((p) => !claimedIds.has(p.id)));
    const ps = claimed.get(row[0]) ?? (near ? [near] : []);
    if (!ps.length) { out.push(listingIntro(row)); continue; }
    for (const p of ps) join(p, row);
  }
  return out;
}

/** A listing joins an intro: its UNESCO name becomes another name for it, and the year it was inscribed a fact. */
function join(p: IntroPlace, [id, name, , , year]: WhcRow) {
  if (norm(name) !== norm(p.name) && !p.also?.some((a) => norm(a) === norm(name))) p.also = [...(p.also ?? []), name];
  if (!p.facts.some(([k]) => k.startsWith("World Heritage"))) p.facts = [...p.facts, ["World Heritage since", String(year)]];
  if (!p.tags?.includes("heritage")) p.tags = [...(p.tags ?? []), "heritage"];
  p.whc ??= id;
}
