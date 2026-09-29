// Who governs a country: one shape for every country (who holds executive
// power, the legislature and its seats, the courts, the governing party, the
// next election), filled in deeply for the United States (live Congress data,
// governors, justices, your own representative) and from Wikidata for the
// rest. This file is the model and the arithmetic; the data comes from us.ts
// and world.ts.

export interface Person {
  name: string;
  office: string;
  party?: string;
  /** A picture URL. */
  photo?: string;
  since?: string;
  url?: string;
  /** Its Wikidata item, for a portrait when none came with it. */
  wikidata?: string;
}

export interface Bloc { party: string; seats: number; color: string }

export interface Chamber {
  name: string;
  seats: number;
  parties: Bloc[];
  leaders: Person[];
  /** Seats to control the chamber. */
  majority?: number;
  note?: string;
}

export interface Election { date: string; what: string }

export interface Leadership {
  country: string;
  system?: string;
  /** One line: who holds power. */
  summary?: string;
  executive: Person[];
  legislature: Chamber[];
  judiciary?: { name: string; members: Person[]; note?: string };
  governing?: string;
  next: Election[];
  sources: string[];
}

// ---- Parties ---------------------------------------------------------------------------------------

const KNOWN: [RegExp, string][] = [
  [/^republican/i, "#e5484d"], [/^democrat/i, "#3b82f6"], [/independent/i, "#a78bfa"], [/libertarian/i, "#eab308"], [/green/i, "#22c55e"],
  [/labour|labor\b|social democrat|socialist/i, "#e11d48"], [/conservative|christian democrat/i, "#2563eb"], [/liberal democrat/i, "#f59e0b"],
  [/communist/i, "#b91c1c"], [/nonpartisan|non-partisan|no party/i, "#94a3b8"],
];
const PALETTE = ["#f97316", "#14b8a6", "#8b5cf6", "#ec4899", "#84cc16", "#06b6d4", "#f43f5e", "#a855f7", "#0ea5e9", "#d946ef"];

/** A party's colour: the familiar one where there's a convention, else a steady one from its name. */
export function partyColor(name: string | undefined): string {
  if (!name) return "#94a3b8";
  for (const [re, c] of KNOWN) if (re.test(name)) return c;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Seats by party, biggest first. */
export function tally(parties: (string | undefined)[]): Bloc[] {
  const n = new Map<string, number>();
  for (const p of parties) n.set(p || "Vacant", (n.get(p || "Vacant") ?? 0) + 1);
  return [...n].map(([party, seats]) => ({ party, seats, color: partyColor(party) })).sort((a, b) => b.seats - a.seats);
}

// ---- The parliament arc -------------------------------------------------------------------------------

/**
 * Seat positions for a half-circle chart (unit radius, centre at 0,0, y up),
 * ordered left to right so each party is one wedge.
 */
export function hemicycle(total: number): { x: number; y: number; r: number }[] {
  if (total <= 0) return [];
  const rows = Math.max(1, Math.min(12, Math.round(Math.sqrt(total / 4))));
  const inner = 0.38;
  const radii = Array.from({ length: rows }, (_, i) => inner + ((1 - inner) * (i + 0.5)) / rows);
  const len = radii.reduce((a, r) => a + r, 0);
  // Seats per row in proportion to its length, the rounding put right on the outer rows.
  const per = radii.map((r) => Math.floor((total * r) / len));
  let left = total - per.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; left > 0; i = (i - 1 + rows) % rows, left--) per[i]++;
  const seats: { x: number; y: number; r: number; a: number }[] = [];
  const dot = Math.min(0.9 * ((1 - inner) / rows) / 2, 0.06);
  radii.forEach((r, i) => {
    const n = per[i];
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (1 - (n === 1 ? 0.5 : k / (n - 1)));
      seats.push({ x: r * Math.cos(a), y: r * Math.sin(a), r: dot, a });
    }
  });
  // Left to right by angle, so blocs fill wedges across all rows.
  return seats.sort((p, q) => q.a - p.a || p.y - q.y).map(({ x, y, r }) => ({ x, y, r }));
}

// ---- United States ------------------------------------------------------------------------------------

/** States (and DC) by postal code: FIPS code and name. */
export const US_STATES: Record<string, [string, string]> = {
  AL: ["01", "Alabama"], AK: ["02", "Alaska"], AZ: ["04", "Arizona"], AR: ["05", "Arkansas"], CA: ["06", "California"], CO: ["08", "Colorado"], CT: ["09", "Connecticut"],
  DE: ["10", "Delaware"], DC: ["11", "District of Columbia"], FL: ["12", "Florida"], GA: ["13", "Georgia"], HI: ["15", "Hawaii"], ID: ["16", "Idaho"], IL: ["17", "Illinois"],
  IN: ["18", "Indiana"], IA: ["19", "Iowa"], KS: ["20", "Kansas"], KY: ["21", "Kentucky"], LA: ["22", "Louisiana"], ME: ["23", "Maine"], MD: ["24", "Maryland"],
  MA: ["25", "Massachusetts"], MI: ["26", "Michigan"], MN: ["27", "Minnesota"], MS: ["28", "Mississippi"], MO: ["29", "Missouri"], MT: ["30", "Montana"], NE: ["31", "Nebraska"],
  NV: ["32", "Nevada"], NH: ["33", "New Hampshire"], NJ: ["34", "New Jersey"], NM: ["35", "New Mexico"], NY: ["36", "New York"], NC: ["37", "North Carolina"],
  ND: ["38", "North Dakota"], OH: ["39", "Ohio"], OK: ["40", "Oklahoma"], OR: ["41", "Oregon"], PA: ["42", "Pennsylvania"], RI: ["44", "Rhode Island"],
  SC: ["45", "South Carolina"], SD: ["46", "South Dakota"], TN: ["47", "Tennessee"], TX: ["48", "Texas"], UT: ["49", "Utah"], VT: ["50", "Vermont"], VA: ["51", "Virginia"],
  WA: ["53", "Washington"], WV: ["54", "West Virginia"], WI: ["55", "Wisconsin"], WY: ["56", "Wyoming"],
};
export const postalOfFips = (fips: string) => Object.entries(US_STATES).find(([, [f]]) => f === fips.padStart(2, "0"))?.[0] ?? null;
/** Seats in the House held by delegates who don't vote (DC and the territories). */
export const NON_VOTING = new Set(["DC", "AS", "GU", "MP", "PR", "VI"]);

/** Election Day: the Tuesday after the first Monday in November. */
export function electionDay(year: number): string {
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstMonday = 1 + ((8 - nov1) % 7);
  return `${year}-11-${String(firstMonday + 1).padStart(2, "0")}`;
}

/** The next federal general election, and what's on the ballot. */
export function nextUsElection(today: string): Election {
  let y = Number(today.slice(0, 4));
  if (y % 2) y++;
  if (electionDay(y) < today) y += 2;
  const presidential = y % 4 === 0;
  return {
    date: electionDay(y),
    what: presidential
      ? "President, all 435 House seats, a third of the Senate, and 11 governors"
      : "All 435 House seats, a third of the Senate (plus any special elections), and 36 governors",
  };
}

/** "in 36 days", "tomorrow", "today". */
export function countdown(date: string, today: string): string {
  const d = Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86_400_000);
  if (d < 0) return `${-d} days ago`;
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 60) return `in ${d} days`;
  const m = Math.round(d / 30.4);
  return m < 24 ? `in ${m} months` : `in ${Math.round(d / 365)} years`;
}

/** Who controls the chamber: the biggest bloc if it has a majority (independents counted with their caucus). */
export function control(blocs: Bloc[], majority: number, caucus: Record<string, string> = {}): string | null {
  const n = new Map<string, number>();
  for (const b of blocs) { const k = caucus[b.party] ?? b.party; n.set(k, (n.get(k) ?? 0) + b.seats); }
  const top = [...n].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= majority ? top[0] : null;
}

/** "Republicans hold the White House, the Senate and the House." */
export function usSummary(president: string | undefined, senate: string | null, house: string | null): string {
  const plural = (p: string) => (/^democrat/i.test(p) ? "Democrats" : /^republican/i.test(p) ? "Republicans" : `${p}s`);
  const held: Record<string, string[]> = {};
  const add = (p: string | null | undefined, what: string) => { if (p) (held[plural(p)] ??= []).push(what); };
  add(president, "the White House");
  add(senate, "the Senate");
  add(house, "the House");
  const parts = Object.entries(held).map(([p, w]) => `${p} hold ${w.length > 1 ? `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}` : w[0]}`);
  return parts.length ? `${parts.join("; ")}.` : "";
}
