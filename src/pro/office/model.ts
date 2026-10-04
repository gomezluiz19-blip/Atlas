// Politics Pro: the working data of a legislative office. The member and
// their district, the office's own locations, the people it serves and works
// with (constituents, stakeholders, organisations, press, officials) with a
// log of every contact, casework, events, and the bills it's whipping, each
// with a stance for every member and stakeholder. Kept in this browser; pure
// functions here, the screens in ui.ts.
import { newId } from "../../work/store";
import { csvCell } from "../../util/csv";

export type Stance = "yes" | "lean-yes" | "undecided" | "lean-no" | "no" | "unknown";
export const STANCES: { id: Stance; label: string; color: string }[] = [
  { id: "yes", label: "Yes", color: "#1f9d55" },
  { id: "lean-yes", label: "Leaning yes", color: "#7bd88f" },
  { id: "undecided", label: "Undecided", color: "#f5c542" },
  { id: "lean-no", label: "Leaning no", color: "#f59f8b" },
  { id: "no", label: "No", color: "#d64545" },
  { id: "unknown", label: "Not asked", color: "#b8b8c0" },
];
export const stanceOf = (s?: Stance) => STANCES.find((x) => x.id === s) ?? STANCES[5];

export type ContactKind = "constituent" | "stakeholder" | "organisation" | "press" | "official";
export const CONTACT_KINDS: Record<ContactKind, { label: string; color: string }> = {
  constituent: { label: "Constituent", color: "#0a84ff" },
  stakeholder: { label: "Stakeholder", color: "#bf5af2" },
  organisation: { label: "Organisation", color: "#ff9f0a" },
  press: { label: "Press", color: "#ff375f" },
  official: { label: "Official", color: "#30d158" },
};

export interface Spot { name: string; lon: number; lat: number }
export interface LogEntry { at: string; text: string; by?: string }
export interface Contact {
  id: string; name: string; kind: ContactKind; org?: string; role?: string; email?: string; phone?: string;
  address?: string; lon?: number; lat?: number; topics: string[]; notes?: string;
  /** Stance on each bill, by bill id. */
  stance: Record<string, Stance>;
  log: LogEntry[];
}
export interface OfficeSite extends Spot { id: string; kind: "capitol" | "district" | "mobile"; address?: string; hours?: string }
export interface OfficeEvent { id: string; title: string; kind: "town hall" | "visit" | "meeting" | "press" | "fundraiser" | "other"; date: string; time?: string; place?: Spot; notes?: string; expected?: number }
export interface Case { id: string; subject: string; agency: string; contact?: string; status: "open" | "waiting" | "closed"; opened: string; updated: string; notes?: string; release?: boolean; closed?: string; outcome?: string }
export interface Bill {
  id: string; title: string; number?: string; chamber: "house" | "senate" | "local"; summary?: string;
  /** Members' stances by member key (bioguide id or name). */
  members: Record<string, Stance>;
  sponsorParty?: string;
}
export interface Office {
  id: string; name: string;
  member?: { name: string; party?: string; chamber: "house" | "senate" | "other"; state?: string; district?: number; photo?: string; key?: string };
  district?: { state: string; district: number; name: string; rings: [number, number][][] };
  sites: OfficeSite[]; contacts: Contact[]; events: OfficeEvent[]; cases: Case[]; bills: Bill[];
  /** The mailbag and form letters. */
  messages?: import("./mail").Message[]; templates?: import("./mail").Template[];
  /** What kind of office: Congress, a state legislature, or a council or other local body. */
  level?: "congress" | "state" | "local";
  created: number; demo?: boolean;
}

export const blankOffice = (name = "My office"): Office => ({ id: newId(), name, sites: [], contacts: [], events: [], cases: [], bills: [], created: Date.now() });

// ---- The whip count ----------------------------------------------------------------------------------

export interface Tally { counts: Record<Stance, number>; total: number; firm: number; likely: number; needed: number; short: number }

/** Where a bill stands: firm and likely yes, against the votes needed (pure). */
export function tally(stances: Stance[], needed: number): Tally {
  const counts = Object.fromEntries(STANCES.map((s) => [s.id, 0])) as Record<Stance, number>;
  for (const s of stances) counts[s]++;
  const firm = counts.yes, likely = counts.yes + counts["lean-yes"];
  return { counts, total: stances.length, firm, likely, needed, short: Math.max(0, needed - likely) };
}

/** Votes needed to pass: a simple majority of the chamber (pure). */
export const votesNeeded = (chamber: Bill["chamber"], seats: number) => (chamber === "senate" ? 51 : Math.floor(seats / 2) + 1);

/** A starting guess from party lines: the sponsor's party leaning yes, the rest leaning no (only where not yet set). */
export function partyLines(bill: Bill, members: { key: string; party?: string }[]) {
  for (const m of members) if (!bill.members[m.key] || bill.members[m.key] === "unknown") bill.members[m.key] = !m.party || !bill.sponsorParty ? "undecided" : m.party === bill.sponsorParty ? "lean-yes" : "lean-no";
}

// ---- Casework ----------------------------------------------------------------------------------------

export const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
/** Open cases, oldest first, with how long each has waited (pure). */
export function caseQueue(cases: Case[], today: string): (Case & { days: number; stale: boolean })[] {
  return cases.filter((c) => c.status !== "closed").map((c) => ({ ...c, days: daysBetween(c.opened, today), stale: daysBetween(c.updated, today) > 14 })).sort((a, b) => b.days - a.days);
}

// ---- Bringing a contact list in -----------------------------------------------------------------------

/** Parses CSV (quoted fields, commas or semicolons) into rows keyed by header (pure). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines: string[][] = [];
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((c) => c.trim())) lines.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) lines.push(row);
  const [head, ...rest] = lines;
  if (!head) return [];
  const keys = head.map((k) => k.trim().toLowerCase());
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const pickCol = (row: Record<string, string>, ...names: string[]) => { for (const n of names) for (const k of Object.keys(row)) if (k === n || k.replace(/[^a-z]/g, "") === n.replace(/[^a-z]/g, "")) if (row[k]) return row[k]; return ""; };

/** Rows from any CRM export become contacts (common column names understood; pure). */
export function contactsFromRows(rows: Record<string, string>[]): Contact[] {
  return rows.map((r) => {
    const first = pickCol(r, "first name", "firstname", "first"), last = pickCol(r, "last name", "lastname", "last", "surname");
    const name = pickCol(r, "name", "full name", "contact", "contact name") || `${first} ${last}`.trim();
    const street = pickCol(r, "address", "street", "address 1", "mailing address", "street address");
    const city = pickCol(r, "city", "town"), state = pickCol(r, "state", "region"), zip = pickCol(r, "zip", "zip code", "postcode", "postal code");
    const kindText = pickCol(r, "type", "kind", "category", "contact type").toLowerCase();
    const kind: ContactKind = /press|media|reporter|journalist/.test(kindText) ? "press" : /org|company|association|union|business/.test(kindText) ? "organisation" : /stake|advoca|lobby/.test(kindText) ? "stakeholder" : /official|elected|mayor|council|agency/.test(kindText) ? "official" : "constituent";
    return {
      id: newId(), name, kind, org: pickCol(r, "organization", "organisation", "company", "org", "employer") || undefined, role: pickCol(r, "title", "role", "position") || undefined,
      email: pickCol(r, "email", "e-mail", "email address") || undefined, phone: pickCol(r, "phone", "telephone", "mobile", "phone number") || undefined,
      address: [street, city, state, zip].filter(Boolean).join(", ") || undefined,
      topics: pickCol(r, "topics", "issues", "tags", "interests").split(/[;|,]/).map((t) => t.trim()).filter(Boolean),
      notes: pickCol(r, "notes", "note", "comments") || undefined, stance: {}, log: [],
    };
  }).filter((c) => c.name);
}

/** Contacts as CSV, for taking back out (pure). */
export function contactsCsv(cs: Contact[], bills: Bill[]): string {
  const esc = (v = "") => csvCell(v);
  const head = ["name", "type", "organization", "title", "email", "phone", "address", "topics", "notes", "last contact", ...bills.map((b) => `stance: ${b.number ?? b.title}`)];
  return [head.join(","), ...cs.map((c) => [c.name, CONTACT_KINDS[c.kind].label, c.org, c.role, c.email, c.phone, c.address, c.topics.join("; "), c.notes, c.log[c.log.length - 1]?.at.slice(0, 10), ...bills.map((b) => stanceOf(c.stance[b.id]).label)].map((v) => esc(v)).join(","))].join("\n");
}

/** Which topics come up most among the people the office hears from (pure). */
export function topTopics(cs: Contact[], n = 6): { topic: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of cs) for (const t of c.topics) m.set(t.toLowerCase(), (m.get(t.toLowerCase()) ?? 0) + 1);
  return [...m].map(([topic, count]) => ({ topic: topic.replace(/\b\w/g, (x) => x.toUpperCase()), count })).sort((a, b) => b.count - a.count).slice(0, n);
}

// ---- Where members sit on the map ---------------------------------------------------------------------

/** Rough centres of the states (for placing members when their district outline isn't loaded). */
export const STATE_CENTRE: Record<string, [number, number]> = {
  AL: [-86.8, 32.8], AK: [-152.3, 64.2], AZ: [-111.7, 34.3], AR: [-92.4, 34.9], CA: [-119.4, 37.2], CO: [-105.5, 39.0], CT: [-72.7, 41.6], DE: [-75.5, 39.0],
  DC: [-77.03, 38.9], FL: [-81.7, 28.1], GA: [-83.4, 32.7], HI: [-157.5, 20.8], ID: [-114.6, 44.4], IL: [-89.2, 40.0], IN: [-86.3, 39.9], IA: [-93.5, 42.1],
  KS: [-98.4, 38.5], KY: [-85.3, 37.5], LA: [-92.0, 31.0], ME: [-69.2, 45.4], MD: [-76.8, 39.0], MA: [-71.8, 42.3], MI: [-84.7, 43.6], MN: [-94.3, 46.3],
  MS: [-89.7, 32.7], MO: [-92.5, 38.4], MT: [-109.6, 47.0], NE: [-99.8, 41.5], NV: [-116.6, 39.3], NH: [-71.6, 43.7], NJ: [-74.7, 40.1], NM: [-106.1, 34.4],
  NY: [-75.5, 42.9], NC: [-79.4, 35.6], ND: [-100.5, 47.5], OH: [-82.8, 40.3], OK: [-97.5, 35.6], OR: [-120.6, 43.9], PA: [-77.8, 40.9], RI: [-71.5, 41.7],
  SC: [-80.9, 33.9], SD: [-100.2, 44.4], TN: [-86.4, 35.9], TX: [-99.3, 31.5], UT: [-111.7, 39.3], VT: [-72.7, 44.1], VA: [-78.8, 37.5], WA: [-120.4, 47.4],
  WV: [-80.6, 38.6], WI: [-89.8, 44.6], WY: [-107.6, 43.0], PR: [-66.5, 18.2], GU: [144.8, 13.4], VI: [-64.8, 18.3], AS: [-170.7, -14.3], MP: [145.7, 15.2],
};

/** Members of a state spread in a small spiral around its centre, so each is its own dot (pure). */
export function spreadAround(centre: [number, number], i: number, n: number): [number, number] {
  if (n <= 1) return centre;
  const a = i * 2.39996, r = 0.18 * Math.sqrt(i + 0.5) * Math.min(1.6, 0.5 + n / 30);
  return [centre[0] + (r * Math.cos(a)) / Math.cos((centre[1] * Math.PI) / 180), centre[1] + r * Math.sin(a)];
}
