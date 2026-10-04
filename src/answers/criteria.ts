// Answers across layers: what can be asked of the map, how a sentence becomes
// conditions ("south-facing", "under 800 m", "within 40 km of an airport"),
// and how well a place meets each one. Conditions are soft-edged: a place
// just outside a limit still scores a little, so near misses show on the map
// as a fainter glow instead of vanishing.

export type Group = "Ground" | "Climate" | "People" | "Getting there" | "Water" | "Hazards" | "Country";
export type Needs = "terrain" | "climate" | "places" | "infra" | "water" | "hazards" | "country";
export type Op = "lt" | "gt" | "dir";

export interface Measure {
  key: string;
  label: string;
  emoji: string;
  group: Group;
  needs: Needs;
  unit: string;
  fmt: (v: number) => string;
  /** How far past a limit the score fades to nothing. */
  soft: number;
  /** Slider range. */
  min: number;
  max: number;
  step: number;
  /** The usual way to ask (for "+ Add a condition"). */
  op: Op;
  value: number;
}

export interface Criterion { key: string; op: Op; value: number }

const km = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString()} km`;
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const compassName = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export const MEASURES: Record<string, Measure> = {
  elev: { key: "elev", label: "Height", emoji: "⛰️", group: "Ground", needs: "terrain", unit: "m", fmt: (v) => `${Math.round(v).toLocaleString()} m`, soft: 250, min: 0, max: 4000, step: 50, op: "lt", value: 800 },
  slope: { key: "slope", label: "Slope", emoji: "📈", group: "Ground", needs: "terrain", unit: "°", fmt: (v) => `${v.toFixed(v < 10 ? 1 : 0)}°`, soft: 4, min: 0, max: 30, step: 1, op: "lt", value: 8 },
  aspect: { key: "aspect", label: "Faces", emoji: "🧭", group: "Ground", needs: "terrain", unit: "°", fmt: (v) => compassName(v), soft: 60, min: 0, max: 315, step: 45, op: "dir", value: 180 },
  temp: { key: "temp", label: "Average temperature", emoji: "🌡️", group: "Climate", needs: "climate", unit: "°C", fmt: (v) => `${v.toFixed(1)} °C`, soft: 3, min: -10, max: 30, step: 1, op: "gt", value: 15 },
  winter: { key: "winter", label: "Coldest month", emoji: "❄️", group: "Climate", needs: "climate", unit: "°C", fmt: (v) => `${v.toFixed(1)} °C`, soft: 3, min: -25, max: 25, step: 1, op: "gt", value: 5 },
  frost: { key: "frost", label: "Frosty nights", emoji: "❄️", group: "Climate", needs: "climate", unit: "a year", fmt: (v) => `${Math.round(v)} a year`, soft: 15, min: 0, max: 200, step: 5, op: "lt", value: 10 },
  rain: { key: "rain", label: "Rain", emoji: "🌧️", group: "Climate", needs: "climate", unit: "mm", fmt: (v) => `${Math.round(v).toLocaleString()} mm a year`, soft: 200, min: 0, max: 3000, step: 50, op: "lt", value: 600 },
  sun: { key: "sun", label: "Sunshine", emoji: "☀️", group: "Climate", needs: "climate", unit: "h", fmt: (v) => `${Math.round(v).toLocaleString()} h a year`, soft: 350, min: 1000, max: 4000, step: 100, op: "gt", value: 2500 },
  city: { key: "city", label: "Nearest big city", emoji: "🏙️", group: "People", needs: "places", unit: "km", fmt: km, soft: 25, min: 0, max: 300, step: 5, op: "lt", value: 40 },
  crowd: { key: "crowd", label: "People within 25 km", emoji: "👥", group: "People", needs: "places", unit: "people", fmt: (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)} million` : `${Math.round(v / 1000).toLocaleString()},000`), soft: 40_000, min: 0, max: 2_000_000, step: 10_000, op: "lt", value: 50_000 },
  airport: { key: "airport", label: "Nearest airport", emoji: "✈️", group: "Getting there", needs: "infra", unit: "km", fmt: km, soft: 25, min: 0, max: 300, step: 5, op: "lt", value: 50 },
  port: { key: "port", label: "Nearest seaport", emoji: "⚓", group: "Getting there", needs: "infra", unit: "km", fmt: km, soft: 30, min: 0, max: 400, step: 10, op: "lt", value: 80 },
  rail: { key: "rail", label: "Nearest railway", emoji: "🚆", group: "Getting there", needs: "infra", unit: "km", fmt: km, soft: 8, min: 0, max: 100, step: 1, op: "lt", value: 10 },
  highway: { key: "highway", label: "Nearest main road", emoji: "🚗", group: "Getting there", needs: "infra", unit: "km", fmt: km, soft: 8, min: 0, max: 100, step: 1, op: "lt", value: 10 },
  river: { key: "river", label: "Nearest river", emoji: "〰️", group: "Water", needs: "water", unit: "km", fmt: km, soft: 6, min: 0, max: 100, step: 1, op: "lt", value: 5 },
  coast: { key: "coast", label: "To the sea", emoji: "🌊", group: "Water", needs: "terrain", unit: "km", fmt: km, soft: 15, min: 0, max: 300, step: 5, op: "lt", value: 15 },
  flood: { key: "flood", label: "Flood risk", emoji: "💧", group: "Hazards", needs: "water", unit: "", fmt: (v) => (v < 0.2 ? "low" : v < 0.5 ? "some" : "high"), soft: 0.25, min: 0, max: 1, step: 0.05, op: "lt", value: 0.2 },
  volcano: { key: "volcano", label: "Nearest volcano", emoji: "🌋", group: "Hazards", needs: "hazards", unit: "km", fmt: km, soft: 40, min: 0, max: 500, step: 10, op: "gt", value: 80 },
  faults: { key: "faults", label: "To a plate boundary", emoji: "🧩", group: "Hazards", needs: "hazards", unit: "km", fmt: km, soft: 120, min: 0, max: 1500, step: 25, op: "gt", value: 300 },
  online: { key: "online", label: "People online", emoji: "🌐", group: "Country", needs: "country", unit: "%", fmt: (v) => `${Math.round(v)}%`, soft: 10, min: 0, max: 100, step: 5, op: "gt", value: 85 },
  income: { key: "income", label: "Income per person", emoji: "💰", group: "Country", needs: "country", unit: "$", fmt: (v) => `$${Math.round(v).toLocaleString()}`, soft: 8000, min: 0, max: 100_000, step: 1000, op: "gt", value: 30_000 },
  life: { key: "life", label: "Life expectancy", emoji: "❤️", group: "Country", needs: "country", unit: "years", fmt: (v) => `${v.toFixed(1)} years`, soft: 3, min: 50, max: 86, step: 1, op: "gt", value: 78 },
};

const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

/** How well a value meets a condition, 0 to 1 (NaN: unknown here, counted as half). */
export function satisfy(c: Criterion, v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  const m = MEASURES[c.key];
  if (c.op === "dir") {
    const d = Math.abs((((v - c.value) % 360) + 540) % 360 - 180);
    return 1 - smooth((d - 45) / m.soft);
  }
  if (c.op === "lt") return 1 - smooth((v - c.value) / m.soft);
  return 1 - smooth((c.value - v) / m.soft);
}

/** A place's overall match: every condition counts (one badly missed sinks it). */
export function combine(scores: number[]): number {
  if (!scores.length) return 0;
  return scores.reduce((a, b) => a * b, 1) ** (1 / Math.max(1, scores.length * 0.6));
}

/** The condition in words: "Height under 800 m", "Faces south". */
export function describe(c: Criterion): string {
  const m = MEASURES[c.key];
  if (c.op === "dir") return `Faces ${compassName(c.value)}`;
  if (c.key === "flood") return c.op === "lt" ? "Low flood risk" : "Flood-prone";
  return `${m.label} ${c.op === "lt" ? "under" : "over"} ${m.fmt(c.value)}`;
}

// ---- A sentence to conditions ----------------------------------------------------------------

const N = "(\\d[\\d,]*(?:\\.\\d+)?)";
const num = (s: string) => parseFloat(s.replace(/,/g, ""));
const toM = (v: number, unit: string) => (/^f/i.test(unit) ? v * 0.3048 : v);
const toKm = (v: number, unit: string) => (/^mi/i.test(unit) ? v * 1.609 : v);

interface Rule { re: RegExp; make: (m: RegExpMatchArray) => Criterion | null }

const RULES: Rule[] = [
  // Height.
  { re: new RegExp(`\\b(?:under|below|less than|lower than|at most|max(?:imum)?)\\s+${N}\\s*(m|metres|meters|ft|feet)\\b(?!\\s*(?:of|from|to))`, "i"), make: (m) => ({ key: "elev", op: "lt", value: toM(num(m[1]), m[2]) }) },
  { re: new RegExp(`\\b(?:above|over|higher than|at least)\\s+${N}\\s*(m|metres|meters|ft|feet)\\b(?!\\s*(?:of|from|to))`, "i"), make: (m) => ({ key: "elev", op: "gt", value: toM(num(m[1]), m[2]) }) },
  { re: /\b(lowlands?|low[- ]lying|sea level)\b/i, make: () => ({ key: "elev", op: "lt", value: 200 }) },
  { re: /\b(mountains?|highlands?|high altitude|up high|alpine)\b/i, make: () => ({ key: "elev", op: "gt", value: 1200 }) },
  // Slope and aspect.
  { re: /\b(flat|level ground|level land)\b/i, make: () => ({ key: "slope", op: "lt", value: 3 }) },
  { re: /\b(gentle|gently sloping|rolling)\b/i, make: () => ({ key: "slope", op: "lt", value: 8 }) },
  { re: /\b(steep|hilly|slopes?)\b(?![- ]facing)/i, make: (m) => (/slope/i.test(m[1]) ? null : { key: "slope", op: "gt", value: /hilly/i.test(m[1]) ? 6 : 15 }) },
  { re: /\b(north|south|east|west|north[- ]?east|north[- ]?west|south[- ]?east|south[- ]?west)[- ]facing\b/i, make: (m) => ({ key: "aspect", op: "dir", value: COMPASS.indexOf(m[1].toLowerCase().replace(/[- ]/g, "").replace(/^(north|south)(east|west)$/, "$1-$2")) * 45 }) },
  // Climate.
  { re: new RegExp(`\\b(?:average|mean) temperature (?:over|above|of at least)\\s+${N}`, "i"), make: (m) => ({ key: "temp", op: "gt", value: num(m[1]) }) },
  { re: new RegExp(`\\b(?:average|mean) temperature (?:under|below)\\s+${N}`, "i"), make: (m) => ({ key: "temp", op: "lt", value: num(m[1]) }) },
  { re: /\bhot\b/i, make: () => ({ key: "temp", op: "gt", value: 22 }) },
  { re: /\bmild\b(?! winters?)/i, make: () => ({ key: "winter", op: "gt", value: 4 }) },
  { re: /\bwarm\b/i, make: () => ({ key: "temp", op: "gt", value: 16 }) },
  { re: /\b(cool|cold)\b(?! winters?)/i, make: () => ({ key: "temp", op: "lt", value: 10 }) },
  { re: /\bmild winters?\b|\bwarm winters?\b/i, make: () => ({ key: "winter", op: "gt", value: 6 }) },
  { re: /\b(cold|snowy) winters?\b/i, make: () => ({ key: "winter", op: "lt", value: 0 }) },
  { re: /\b(frost[- ]free|no frosts?|few frosts?)\b/i, make: () => ({ key: "frost", op: "lt", value: 5 }) },
  { re: new RegExp(`\\brain(?:fall)? (?:under|below|less than)\\s+${N}`, "i"), make: (m) => ({ key: "rain", op: "lt", value: num(m[1]) }) },
  { re: new RegExp(`\\brain(?:fall)? (?:over|above|more than)\\s+${N}`, "i"), make: (m) => ({ key: "rain", op: "gt", value: num(m[1]) }) },
  { re: /\b(dry|arid)\b/i, make: () => ({ key: "rain", op: "lt", value: 500 }) },
  { re: /\b(wet|rainy|lush)\b/i, make: () => ({ key: "rain", op: "gt", value: 1200 }) },
  { re: /\b(sunny|sunshine|sun-drenched)\b/i, make: () => ({ key: "sun", op: "gt", value: 2600 }) },
  // People.
  { re: new RegExp(`\\bwithin\\s+${N}\\s*(km|kilometres|kilometers|miles?|mi)\\s+(?:of|from)\\s+(?:a|an|the)?\\s*(?:big |large |major )?city`, "i"), make: (m) => ({ key: "city", op: "lt", value: toKm(num(m[1]), m[2]) }) },
  { re: /\b(near|close to) (?:a |the )?(?:big |large |major )?city\b|\bcommut\w*/i, make: () => ({ key: "city", op: "lt", value: 40 }) },
  { re: /\b(far from (?:big )?cities|remote|quiet|rural|countryside|off[- ]grid|isolated|peaceful)\b/i, make: () => ({ key: "crowd", op: "lt", value: 40_000 }) },
  { re: /\b(busy|lively|urban|in a city|crowded)\b/i, make: () => ({ key: "crowd", op: "gt", value: 500_000 }) },
  // Getting there.
  { re: new RegExp(`\\bwithin\\s+${N}\\s*(km|kilometres|kilometers|miles?|mi)\\s+(?:of|from)\\s+(?:an?|the)?\\s*airport`, "i"), make: (m) => ({ key: "airport", op: "lt", value: toKm(num(m[1]), m[2]) }) },
  { re: /\b(near|close to|by) (?:an?|the) airport\b|\bairport nearby\b/i, make: () => ({ key: "airport", op: "lt", value: 50 }) },
  { re: /\b(near|close to|by) (?:an?|the) (?:sea)?port\b|\bshipping access\b/i, make: () => ({ key: "port", op: "lt", value: 60 }) },
  { re: /\b(near|close to|by) (?:an?|the) (?:railway|rail|train|station)\b|\bby train\b/i, make: () => ({ key: "rail", op: "lt", value: 8 }) },
  { re: /\b(near|close to|by) (?:an?|the) (?:highway|motorway|main road|freeway)\b|\bgood roads?\b/i, make: () => ({ key: "highway", op: "lt", value: 8 }) },
  // Water.
  { re: /\b(near|close to|by|on) (?:an?|the) river\b|\briverside\b|\briver ?front\b/i, make: () => ({ key: "river", op: "lt", value: 4 }) },
  { re: /\b(by the sea|near the sea|near the coast|coastal|seaside|on the coast|beach|ocean view)\b/i, make: () => ({ key: "coast", op: "lt", value: 10 }) },
  { re: /\b(inland|far from the (?:sea|coast))\b/i, make: () => ({ key: "coast", op: "gt", value: 60 }) },
  // Hazards.
  { re: /\b(no|low|without|not)\s*(?:a |any )?flood(?:ing)?(?: risk)?\b|\bflood[- ]safe\b|\bnot flood[- ]prone\b|\bsafe from floods?\b/i, make: () => ({ key: "flood", op: "lt", value: 0.2 }) },
  { re: /\b(far from|away from|no|without) volcano(?:es|s)?\b/i, make: () => ({ key: "volcano", op: "gt", value: 80 }) },
  { re: /\b(near|close to) (?:a )?volcano\b/i, make: () => ({ key: "volcano", op: "lt", value: 40 }) },
  { re: /\b(low|no|little) (?:earthquake|seismic|quake) risk\b|\bno earthquakes\b|\b(far from|away from) (?:faults?|fault lines|plate boundaries)\b|\bstable ground\b/i, make: () => ({ key: "faults", op: "gt", value: 300 }) },
  // Country.
  { re: /\b(fast|good|reliable) (?:internet|connection|broadband)\b|\bwell connected\b/i, make: () => ({ key: "online", op: "gt", value: 85 }) },
  { re: /\b(rich|wealthy|high[- ]income|prosperous)\b/i, make: () => ({ key: "income", op: "gt", value: 35_000 }) },
  { re: /\b(cheap|affordable|low[- ]cost|inexpensive|lower[- ]income)\b/i, make: () => ({ key: "income", op: "lt", value: 20_000 }) },
  { re: /\b(healthy|long[- ]lived|long life)\b/i, make: () => ({ key: "life", op: "gt", value: 79 }) },
];

/** Things people ask for that Terreno can't measure yet, said plainly. */
const NOT_YET: [RegExp, string][] = [
  [/[€$£]\s?\d|\bprices?\b|\bunder \d+k\b|\bcost of land\b|\bhouse prices?\b|\brent\b/i, "Property and land prices aren't in Terreno yet; “cheap” is read as a lower-income country, a rough proxy."],
  [/\bschools?\b/i, "Schools need street-level data; look at a town's Built › Overview for now."],
  [/\bhospitals?\b|\bdoctors? nearby\b/i, "Distance to hospitals isn't in these answers yet."],
  [/\bcrime\b|\bsafe neighbou?rhood\b/i, "Crime figures aren't in Terreno."],
  [/\bjobs?\b|\bwork\b/i, "Jobs aren't in Terreno yet."],
];

export interface Parsed { criteria: Criterion[]; notYet: string[] }

/** Reads a request: each condition once (the first way it was said wins). */
export function parseQuery(text: string): Parsed {
  const out: Criterion[] = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    const c = r.make(m);
    if (c && !out.some((x) => x.key === c.key)) out.push(c);
  }
  return { criteria: out, notYet: NOT_YET.filter(([re]) => re.test(text)).map(([, msg]) => msg) };
}

/** A question worth answering on the map: asks for places and names at least one condition. */
export const looksLikeSearch = (text: string) => /\b(find|where|places?|land|somewhere|areas?|spots?|regions?|towns?|sites?|locations?)\b/i.test(text) && parseQuery(text).criteria.length >= 2;
