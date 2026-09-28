// People: where they live (7,300 towns and cities with their populations,
// from Natural Earth, bundled) and how they live, country by country (World
// Bank indicators), with US neighbourhoods from the Census Bureau's American
// Community Survey.
import ISO3 from "../content/iso3.json";
import { cached } from "./diskCache";
import { getJson } from "./http";

/** [lon, lat, population], largest first. */
export type PopPoint = [number, number, number];
let pop: Promise<PopPoint[]> | null = null;
export function populationPoints(): Promise<PopPoint[]> {
  pop ??= fetch(`${import.meta.env.BASE_URL}data/population.json`).then((r) => r.json() as Promise<PopPoint[]>);
  return pop;
}

const km = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(x));
};

/** Towns and cities around a point: how many people live within a few distances, and the nearest big city. */
export function peopleNear(points: PopPoint[], lon: number, lat: number) {
  const rings = [25, 100, 250].map((r) => ({ km: r, people: 0, places: 0 }));
  let big: { pop: number; km: number; lon: number; lat: number } | null = null;
  for (const [x, y, p] of points) {
    if (Math.abs(y - lat) > 3 || Math.abs(x - lon) > 3 / Math.max(0.2, Math.cos((lat * Math.PI) / 180))) continue;
    const d = km([lon, lat], [x, y]);
    for (const r of rings) if (d <= r.km) { r.people += p; r.places++; }
    if (p >= 500_000 && d <= 300 && (!big || d < big.km)) big = { pop: p, km: d, lon: x, lat: y };
  }
  return { rings, big };
}

/** ISO 3166 numeric (the map's country shapes) to ISO 3166 alpha-3 (the World Bank's). */
export const iso3 = (numeric: string) => (ISO3 as Record<string, string>)[numeric.padStart(3, "0")] ?? null;

export interface View {
  id: string;
  emoji: string;
  label: string;
  /** What the colours show. */
  about: string;
  unit: (v: number) => string;
  /** World Bank indicator code, or a bundled table. */
  code?: string;
  table?: Record<string, number>;
  /** Colours from low to high. */
  ramp: string[];
  /** Fixed ends for the scale (otherwise the data's own range). */
  range?: [number, number];
  source: string;
  group: "People" | "Homes" | "Health" | "Connected" | "Money";
}

const pct = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`;
const per = (unit: string) => (v: number) => `${v.toFixed(v < 10 ? 1 : 0)} ${unit}`;
const WB = "World Bank World Development Indicators";

// Homes owned by the people living in them, % of households or people (latest national surveys;
// EU from Eurostat EU-SILC 2023). Surveys differ in how they count, so read these as approximate.
const OWNERSHIP: Record<string, number> = {
  ROU: 95, SVK: 94, HRV: 91, HUN: 91, LTU: 89, POL: 87, BGR: 86, NOR: 80, MLT: 80, EST: 81, LVA: 83, SVN: 75, CZE: 76, PRT: 77, ESP: 76, ITA: 75,
  GRC: 73, BEL: 72, LUX: 69, NLD: 70, IRL: 69, FIN: 69, CYP: 69, FRA: 63, SWE: 65, DNK: 60, AUT: 51, DEU: 47, CHE: 42, GBR: 65, ISL: 74,
  USA: 65, CAN: 67, AUS: 66, NZL: 65, JPN: 61, KOR: 57, SGP: 89, CHN: 90, IND: 87, MEX: 80, CHL: 64, COL: 45, ZAF: 69, TUR: 57, ISR: 67, RUS: 89,
};

export const VIEWS: View[] = [
  { id: "density", emoji: "👥", label: "Crowdedness", group: "People", about: "People per km² of land", code: "EN.POP.DNST", unit: per("per km²"), ramp: ["#fff5eb", "#fdd0a2", "#fd8d3c", "#d94801", "#7f2704"], range: [1, 1000], source: WB },
  { id: "growth", emoji: "📈", label: "Growing", group: "People", about: "Population growth per year", code: "SP.POP.GROW", unit: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}% a year`, ramp: ["#2166ac", "#92c5de", "#f7f7f7", "#f4a582", "#b2182b"], range: [-1.5, 3.5], source: WB },
  { id: "urban", emoji: "🏙️", label: "City dwellers", group: "People", about: "Share of people living in towns and cities", code: "SP.URB.TOTL.IN.ZS", unit: pct, ramp: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"], range: [10, 100], source: WB },
  { id: "young", emoji: "🧒", label: "Children", group: "People", about: "Share of people under 15", code: "SP.POP.0014.TO.ZS", unit: pct, ramp: ["#fff7f3", "#fcc5c0", "#f768a1", "#ae017e", "#49006a"], range: [12, 50], source: WB },
  { id: "old", emoji: "🧓", label: "Over 65", group: "People", about: "Share of people aged 65 and over", code: "SP.POP.65UP.TO.ZS", unit: pct, ramp: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"], range: [2, 30], source: WB },
  { id: "births", emoji: "👶", label: "Births", group: "People", about: "Children per woman", code: "SP.DYN.TFRT.IN", unit: per("children per woman"), ramp: ["#f7f4f9", "#d4b9da", "#df65b0", "#ce1256", "#67001f"], range: [1, 6], source: WB },
  { id: "own", emoji: "🏠", label: "Homeowners", group: "Homes", about: "Homes owned by the people living in them", table: OWNERSHIP, unit: pct, ramp: ["#f7fcfd", "#ccece6", "#66c2a4", "#238b45", "#00441b"], range: [40, 95], source: "Eurostat EU-SILC 2023 and national surveys (approximate)" },
  { id: "rent", emoji: "🔑", label: "Renters", group: "Homes", about: "Homes rented (or otherwise not owned) by the people living in them", table: Object.fromEntries(Object.entries(OWNERSHIP).map(([k, v]) => [k, 100 - v])), unit: pct, ramp: ["#fcfbfd", "#dadaeb", "#9e9ac8", "#6a51a3", "#3f007d"], range: [5, 60], source: "Eurostat EU-SILC 2023 and national surveys (approximate)" },
  { id: "life", emoji: "❤️", label: "Life expectancy", group: "Health", about: "Years a newborn can expect to live", code: "SP.DYN.LE00.IN", unit: per("years"), ramp: ["#a50026", "#f46d43", "#fee08b", "#a6d96a", "#1a9850"], range: [52, 85], source: WB },
  { id: "child", emoji: "🍼", label: "Child deaths", group: "Health", about: "Children who die before age 5, per 1,000 born", code: "SH.DYN.MORT", unit: per("per 1,000"), ramp: ["#1a9850", "#a6d96a", "#fee08b", "#f46d43", "#a50026"], range: [2, 110], source: WB },
  { id: "doctors", emoji: "🩺", label: "Doctors", group: "Health", about: "Doctors per 1,000 people", code: "SH.MED.PHYS.ZS", unit: per("per 1,000"), ramp: ["#fff7ec", "#fdd49e", "#fc8d59", "#d7301f", "#7f0000"], range: [0, 5], source: WB },
  { id: "water", emoji: "🚰", label: "Safe water", group: "Health", about: "People with safely managed drinking water", code: "SH.H2O.SMDW.ZS", unit: pct, ramp: ["#a50026", "#f46d43", "#fee090", "#74add1", "#313695"], range: [10, 100], source: WB },
  { id: "mobile", emoji: "📱", label: "Mobile phones", group: "Connected", about: "Mobile subscriptions per 100 people", code: "IT.CEL.SETS.P2", unit: per("per 100"), ramp: ["#f7fcf0", "#ccebc5", "#7bccc4", "#2b8cbe", "#084081"], range: [40, 160], source: WB },
  { id: "online", emoji: "🌐", label: "Online", group: "Connected", about: "People using the internet", code: "IT.NET.USER.ZS", unit: pct, ramp: ["#fff7fb", "#d0d1e6", "#74a9cf", "#0570b0", "#023858"], range: [5, 100], source: WB },
  { id: "power", emoji: "💡", label: "Electricity", group: "Connected", about: "People with electricity at home", code: "EG.ELC.ACCS.ZS", unit: pct, ramp: ["#000004", "#51127c", "#b73779", "#fc8961", "#fcfdbf"], range: [10, 100], source: WB },
  { id: "income", emoji: "💰", label: "Income", group: "Money", about: "Income per person (GDP per person, adjusted for prices)", code: "NY.GDP.PCAP.PP.CD", unit: (v) => `$${Math.round(v).toLocaleString()}`, ramp: ["#fff7bc", "#fec44f", "#ec7014", "#993404", "#4a1e04"], range: [1000, 80000], source: WB },
];

/** A view's latest value for every country (ISO3 → value), cached for a week. */
export async function viewValues(v: View): Promise<Record<string, { value: number; year?: number }>> {
  if (v.table) return Object.fromEntries(Object.entries(v.table).map(([k, value]) => [k, { value }]));
  return cached(`wb:all:${v.code}`, 7 * 86_400_000, async () => {
    const body = await getJson<[unknown, { countryiso3code: string; date: string; value: number | null }[] | null]>(
      "World Bank", `https://api.worldbank.org/v2/country/all/indicator/${v.code}?format=json&mrnev=1&per_page=400`);
    const out: Record<string, { value: number; year?: number }> = {};
    for (const r of (Array.isArray(body) ? body[1] : null) ?? []) if (r.value !== null && r.countryiso3code) out[r.countryiso3code] = { value: r.value, year: Number(r.date) };
    return out;
  });
}

/** Colour for a value on a view's ramp (log scale for density and income). */
export function colorFor(v: View, value: number, lo: number, hi: number): string {
  const logish = v.id === "density" || v.id === "income";
  const t0 = logish ? (Math.log(Math.max(value, 0.1)) - Math.log(Math.max(lo, 0.1))) / (Math.log(hi) - Math.log(Math.max(lo, 0.1))) : (value - lo) / (hi - lo);
  const t = Math.max(0, Math.min(1, t0)) * (v.ramp.length - 1);
  const i = Math.min(v.ramp.length - 2, Math.floor(t)), f = t - i;
  const hex = (s: string) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16));
  const a = hex(v.ramp[i]), b = hex(v.ramp[i + 1]);
  return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f)).join(",")})`;
}

// ---- US neighbourhoods (American Community Survey) ----------------------------------------------

export interface Tract {
  name: string;
  people: number;
  households: number;
  owners: number;
  renters: number;
  medianRent: number | null;
  medianValue: number | null;
  medianIncome: number | null;
  medianAge: number | null;
  noInternet: number | null;
}

/** The census tract at a US point (FCC's area lookup, then the ACS 5-year estimates). */
export async function usTract(lon: number, lat: number): Promise<Tract | null> {
  const area = await getJson<{ Block?: { FIPS?: string } }>("FCC Area API", `https://geo.fcc.gov/api/census/block/find?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}&format=json`);
  const fips = area.Block?.FIPS;
  if (!fips || fips.length < 11) return null;
  const st = fips.slice(0, 2), co = fips.slice(2, 5), tr = fips.slice(5, 11);
  const vars = ["B01003_001E", "B25003_001E", "B25003_002E", "B25003_003E", "B25064_001E", "B25077_001E", "B19013_001E", "B01002_001E", "B28002_013E"];
  const rows = await cached(`acs:${fips.slice(0, 11)}`, 30 * 86_400_000, () =>
    getJson<string[][]>("US Census", `https://api.census.gov/data/2022/acs/acs5?get=NAME,${vars.join(",")}&for=tract:${tr}&in=state:${st}%20county:${co}`));
  const [head, row] = rows;
  if (!row) return null;
  const get = (k: string) => { const v = Number(row[head.indexOf(k)]); return Number.isFinite(v) && v >= 0 ? v : null; };
  const households = get("B25003_001E") ?? 0;
  return {
    name: row[0], people: get("B01003_001E") ?? 0, households,
    owners: households ? (get("B25003_002E") ?? 0) / households : 0,
    renters: households ? (get("B25003_003E") ?? 0) / households : 0,
    medianRent: get("B25064_001E"), medianValue: get("B25077_001E"), medianIncome: get("B19013_001E"), medianAge: get("B01002_001E"),
    noInternet: households && get("B28002_013E") !== null ? get("B28002_013E")! / households : null,
  };
}
