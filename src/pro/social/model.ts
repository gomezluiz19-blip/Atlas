// Social work on the map: the same Earth for the person looking for help and for the social worker giving it.
//   Anyone: what do you need, and how would you like help (in person, at home, online)? Then the support
//     around a place (food, a place to stay, mental health, family, older adults, benefits and jobs) with the
//     schools, libraries, parks and public programmes that go with it, nearest first, and the lines to call.
//   Social workers: how do you work (at a clinic or office, home and community visits, telehealth, or a mix),
//     where from, over what area, with whom? That sets up the worksite: a caseload on the map (initials only,
//     kept on this device), a visit day planned and timed with a check-in for safety, a referral directory, and
//     the gaps (clients far from what they need).
// Pure: no DOM, no network.
import { estimateMinutes } from "../../travel/reach";

export interface Spot { lon: number; lat: number }
export interface Named extends Spot { name: string }

// ---- What people need, and the places on the map that meet it ---------------------------------------

export type NeedId = "food" | "shelter" | "mental" | "health" | "family" | "older" | "benefits" | "school" | "library" | "community" | "parks";

export interface Need {
  id: NeedId;
  label: string;
  /** What someone looking for help would tap. */
  ask: string;
  color: string;
  /** OpenStreetMap selectors ("key=value", "key=v1|v2", or "key=value+key2=value2" for both). */
  osm: string[];
}

/** In the order they're asked about: the urgent first. */
export const NEEDS: Need[] = [
  { id: "food", label: "Food", ask: "Food", color: "#d19a2e", osm: ["amenity=food_bank", "amenity=social_facility+social_facility=food_bank|soup_kitchen", "amenity=soup_kitchen"] },
  { id: "shelter", label: "Housing and shelter", ask: "A place to stay", color: "#c4513a", osm: ["amenity=social_facility+social_facility=shelter|housing|group_home|transitional_housing", "amenity=shelter+shelter_type=homeless"] },
  { id: "mental", label: "Mental health", ask: "Someone to talk to", color: "#8b5fa8", osm: ["healthcare=psychotherapist|counselling|psychiatrist|psychologist", "amenity=social_facility+social_facility=outreach"] },
  { id: "health", label: "Health care", ask: "A doctor or clinic", color: "#b8496a", osm: ["amenity=clinic|doctors|hospital", "healthcare=clinic|centre|community_health_worker"] },
  { id: "family", label: "Children and family", ask: "Help with children", color: "#4c9ac9", osm: ["amenity=childcare|kindergarten", "amenity=social_facility+social_facility:for=child|juvenile|family"] },
  { id: "older", label: "Older adults", ask: "Help for an older person", color: "#5b9467", osm: ["amenity=social_facility+social_facility=nursing_home|assisted_living|day_care", "amenity=social_facility+social_facility:for=senior", "amenity=community_centre+community_centre:for=senior"] },
  { id: "benefits", label: "Benefits and jobs", ask: "Benefits or work", color: "#3563d6", osm: ["office=employment_agency", "office=government+government=social_services|social_security|employment_agency|social_welfare", "amenity=social_facility+social_facility=ambulatory_care"] },
  { id: "school", label: "Schools", ask: "School", color: "#2a78d6", osm: ["amenity=school"] },
  { id: "library", label: "Libraries", ask: "A library", color: "#8c8f87", osm: ["amenity=library"] },
  { id: "community", label: "Community centres", ask: "Community and activities", color: "#e1b843", osm: ["amenity=community_centre|social_centre"] },
  { id: "parks", label: "Parks and play", ask: "Parks and play", color: "#8faa5a", osm: ["leisure=park|playground"] },
];
export const needOf = (id: NeedId) => NEEDS.find((n) => n.id === id)!;

/** One selector's clauses as [key, values] pairs (pure). */
const clauses = (sel: string) => sel.split("+").map((c) => { const [k, v] = c.split("="); return [k, v.split("|")] as [string, string[]]; });

/** Which need a mapped place meets, the most specific first (pure). Null if none. */
export function classify(tags: Record<string, string>): NeedId | null {
  // Specific social facilities before the broad health and community kinds.
  const order: NeedId[] = ["food", "shelter", "older", "family", "mental", "benefits", "health", "school", "library", "community", "parks"];
  for (const id of order) {
    for (const sel of needOf(id).osm) if (clauses(sel).every(([k, vs]) => tags[k] !== undefined && vs.includes(tags[k]))) return id;
  }
  return null;
}

/** An Overpass query for the places meeting some needs within a radius (pure). */
export function needsQuery(c: Spot, radiusM: number, ids: NeedId[] = NEEDS.map((n) => n.id)): string {
  const around = `(around:${Math.round(radiusM)},${c.lat.toFixed(5)},${c.lon.toFixed(5)})`;
  const parts = ids.flatMap((id) => needOf(id).osm).map((sel) => `nwr${clauses(sel).map(([k, vs]) => vs.length === 1 ? `["${k}"="${vs[0]}"]` : `["${k}"~"^(${vs.join("|")})$"]`).join("")}${around};`);
  return `[out:json][timeout:25];(${[...new Set(parts)].join("")});out center tags 600;`;
}

export interface Resource extends Named { id: string; need: NeedId; address?: string; phone?: string; website?: string; hours?: string }

/** Mapped places as resources (pure): named ones, each with the need it meets. */
export function toResources(els: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]): Resource[] {
  const out: Resource[] = [];
  for (const e of els) {
    const t = e.tags ?? {}, need = classify(t), lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (!need || lat === undefined || lon === undefined) continue;
    const name = t.name ?? (need === "parks" ? (t.leisure === "playground" ? "Playground" : "Park") : "");
    if (!name) continue;
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    out.push({ id: `${e.type[0]}${e.id}`, name, need, lon, lat, address: [street, t["addr:city"]].filter(Boolean).join(", ") || undefined,
      phone: t.phone ?? t["contact:phone"], website: t.website ?? t["contact:website"], hours: t.opening_hours });
  }
  return out;
}

/** Straight-line km (pure). */
export const kmApart = (a: Spot, b: Spot) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
};

/** Resources nearest first, the asked-for needs ahead of the rest (pure). */
export function nearestFirst(rs: Resource[], from: Spot, asked: NeedId[] = []): (Resource & { km: number })[] {
  return rs.map((r) => ({ ...r, km: kmApart(from, r) }))
    .sort((a, b) => (asked.length ? Number(!asked.includes(a.need)) - Number(!asked.includes(b.need)) : 0) || a.km - b.km);
}

// ---- Someone looking for help ------------------------------------------------------------------------

export type HelpWay = "in-person" | "at-home" | "online";
export const HELP_WAYS: { id: HelpWay; label: string; hint: string }[] = [
  { id: "in-person", label: "In person", hint: "Places to go, nearest first" },
  { id: "at-home", label: "At home", hint: "Services that come to you, and who to call" },
  { id: "online", label: "Online or by phone", hint: "Lines and sites you can reach from anywhere" },
];

export interface Line { label: string; how: string; href: string; urgent?: boolean }

/** Whether a point is in the United States (mainland, Alaska, Hawaii, Puerto Rico), roughly (pure). */
export const inUS = (p: Spot) =>
  (p.lat > 24.4 && p.lat < 49.5 && p.lon > -125 && p.lon < -66.8) || (p.lat > 51 && p.lat < 71.5 && p.lon > -170 && p.lon < -129.9)
  || (p.lat > 18.8 && p.lat < 22.4 && p.lon > -160.5 && p.lon < -154.7) || (p.lat > 17.8 && p.lat < 18.6 && p.lon > -67.4 && p.lon < -65.2);
const inCanada = (p: Spot) => !inUS(p) && p.lat > 41.6 && p.lat < 83 && p.lon > -141 && p.lon < -52.6;
const inUK = (p: Spot) => p.lat > 49.8 && p.lat < 60.9 && p.lon > -8.7 && p.lon < 1.8;

/** The lines to call, where the person is (pure): danger first, then local help, then finders. */
export function helpLines(p: Spot): Line[] {
  if (inUS(p)) return [
    { label: "In danger now", how: "Call 911", href: "tel:911", urgent: true },
    { label: "988 Suicide & Crisis Lifeline", how: "Call or text 988, any time", href: "tel:988", urgent: true },
    { label: "211: local help with food, housing and bills", how: "Call 211 or visit 211.org", href: "https://www.211.org" },
    { label: "findhelp.org", how: "Free and reduced-cost programmes by ZIP code", href: "https://www.findhelp.org" },
    { label: "USA.gov benefits", how: "Government benefits you may qualify for", href: "https://www.usa.gov/benefits" },
  ];
  if (inCanada(p)) return [
    { label: "In danger now", how: "Call 911", href: "tel:911", urgent: true },
    { label: "9-8-8 Suicide Crisis Helpline", how: "Call or text 988, any time", href: "tel:988", urgent: true },
    { label: "211: community and social services", how: "Call 211 or visit 211.ca", href: "https://211.ca" },
  ];
  if (inUK(p)) return [
    { label: "In danger now", how: "Call 999", href: "tel:999", urgent: true },
    { label: "Samaritans", how: "Call 116 123, any time, free", href: "tel:116123", urgent: true },
    { label: "NHS 111", how: "Urgent health advice: call 111", href: "tel:111" },
    { label: "Citizens Advice", how: "Benefits, housing, debt and work", href: "https://www.citizensadvice.org.uk" },
  ];
  return [
    { label: "In danger now", how: "Call your local emergency number (112 works across Europe and on most mobiles)", href: "tel:112", urgent: true },
    { label: "Find a helpline", how: "Free, confidential crisis lines in your country", href: "https://findahelpline.com" },
  ];
}

// ---- A social worker's worksite ----------------------------------------------------------------------

export type WorkMode = "site" | "visits" | "tele" | "mix";
export const WORK_MODES: { id: WorkMode; label: string; hint: string }[] = [
  { id: "site", label: "At a clinic or office", hint: "People come to you" },
  { id: "visits", label: "Home and community visits", hint: "You go to them" },
  { id: "tele", label: "Telehealth", hint: "By video and phone" },
  { id: "mix", label: "A mix", hint: "Some visits, some at the office, some online" },
];

export type Focus = "child-family" | "school" | "medical" | "mental-health" | "older-adults" | "housing" | "justice" | "community";
export const FOCI: { id: Focus; label: string; needs: NeedId[] }[] = [
  { id: "child-family", label: "Children and families", needs: ["family", "school", "food", "parks", "health"] },
  { id: "school", label: "Schools", needs: ["school", "family", "library", "mental", "food"] },
  { id: "medical", label: "Hospital and medical", needs: ["health", "older", "benefits", "shelter"] },
  { id: "mental-health", label: "Mental health and substance use", needs: ["mental", "health", "shelter", "community"] },
  { id: "older-adults", label: "Older adults", needs: ["older", "health", "community", "food"] },
  { id: "housing", label: "Housing and homelessness", needs: ["shelter", "food", "benefits", "health"] },
  { id: "justice", label: "Justice and re-entry", needs: ["benefits", "shelter", "mental", "community"] },
  { id: "community", label: "Community practice", needs: ["community", "library", "parks", "benefits", "food"] },
];

/** The needs a practice works with most, its foci's in order without repeats (pure). */
export const needsFor = (focus: Focus[]): NeedId[] => [...new Set((focus.length ? focus : (["community"] as Focus[])).flatMap((f) => FOCI.find((x) => x.id === f)!.needs))];

/** Whether a way of working means visiting people (pure). */
export const visits = (m: WorkMode) => m === "visits" || m === "mix";

export type Priority = "routine" | "soon" | "urgent";
export type Contact = "home" | "office" | "tele";
export interface Client extends Spot {
  id: string;
  /** Initials or a code, never a full name: this list stays on the device. */
  label: string;
  /** The area, for the check-in ("Northside"), never the address. */
  area: string;
  contact: Contact;
  priority: Priority;
  needs: NeedId[];
  /** Next contact, YYYY-MM-DD. */
  next?: string;
  /** Minutes a visit takes. */
  minutes: number;
}

export interface Practice {
  id: string;
  name: string;
  mode: WorkMode;
  focus: Focus[];
  base?: Named;
  /** How far the work reaches from the base, km. */
  areaKm: number;
  clients: Client[];
  /** Places saved to refer people to. */
  referrals: Resource[];
  created: number;
}

/** A new practice from the setup answers (pure). */
export function newPractice(a: { name: string; mode: WorkMode; focus: Focus[]; base?: Named; areaKm?: number }, id = `sw${Date.now().toString(36)}`, now = Date.now()): Practice {
  return { id, name: a.name.trim() || "My practice", mode: a.mode, focus: a.focus, base: a.base, areaKm: a.areaKm ?? (visits(a.mode) ? 15 : 5), clients: [], referrals: [], created: now };
}

/** "JD", "J.D.", "Client 12": what may be stored as a client's label (pure). Full names are cut to initials. */
export function safeLabel(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const words = t.split(" ");
  // Two or more words that look like a name: keep the initials only.
  if (words.length >= 2 && words.every((w) => /^[A-Za-zÀ-ÿ'’-]+$/.test(w)) && words.some((w) => w.length > 2)) return words.map((w) => w[0].toUpperCase()).join("");
  return t.slice(0, 12);
}

const STREET = /\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|boulevard|blvd|place|pl|court|ct|terrace|close|crescent|highway|hwy|route)\b\.?$/i;
const BROAD = /^(united states|usa|canada|united kingdom|uk|england|scotland|wales|new york|california|texas|florida|ontario|quebec|[A-Z]{2})$/i;
/** The area to show for an address: its neighbourhood or town, never the street or a number (pure). */
export function areaOf(name: string, detail = ""): string {
  const parts = [name, ...detail.split(",")].map((x) => x.trim()).filter(Boolean);
  return parts.find((x) => !/\d/.test(x) && !STREET.test(x) && !BROAD.test(x)) ?? parts.find((x) => !/\d/.test(x) && !STREET.test(x)) ?? "In the area";
}

// ---- A visit day -------------------------------------------------------------------------------------

export interface Stop { client: Client; arrive: string; leave: string; driveMin: number }
export interface DayPlan { stops: Stop[]; back: string; driveMin: number; visitMin: number; km: number }

const clock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
const minutesOf = (hhmm: string) => { const [hh, mm] = hhmm.split(":").map(Number); return (hh || 0) * 60 + (mm || 0); };

/**
 * A day of home visits from the base, urgent first and then nearest next, timed by typical driving (pure).
 * Each stop's arrival and departure, and when you'll be back.
 */
export function planDay(base: Spot, clients: Client[], start = "09:00"): DayPlan {
  const left = [...clients];
  const stops: Stop[] = [];
  let at: Spot = base, t = minutesOf(start), drive = 0, km = 0, visit = 0;
  const rank: Record<Priority, number> = { urgent: 0, soon: 1, routine: 2 };
  while (left.length) {
    const top = Math.min(...left.map((c) => rank[c.priority]));
    const pool = left.filter((c) => rank[c.priority] === top);
    const next = pool.reduce((a, b) => (kmApart(at, a) <= kmApart(at, b) ? a : b));
    const d = Math.max(2, estimateMinutes(at, next, "drive"));
    km += kmApart(at, next); drive += d; t += d;
    const arrive = t;
    t += next.minutes; visit += next.minutes;
    stops.push({ client: next, arrive: clock(arrive), leave: clock(t), driveMin: Math.round(d) });
    left.splice(left.indexOf(next), 1);
    at = next;
  }
  const home = stops.length ? Math.max(2, estimateMinutes(at, base, "drive")) : 0;
  km += stops.length ? kmApart(at, base) : 0;
  return { stops, back: clock(t + home), driveMin: Math.round(drive + home), visitMin: visit, km: Math.round(km * 10) / 10 };
}

/** The message for whoever checks you're safe: areas and times, never names or addresses (pure). */
export function checkInText(plan: DayPlan, who: string, date: string): string {
  const lines = plan.stops.map((s, i) => `${i + 1}. ${s.arrive}–${s.leave} · ${s.client.label} · ${s.client.area || "in the area"}`);
  return [`Visits on ${date}${who ? ` (${who})` : ""}:`, ...lines, `Back by ${plan.back}. If you haven't heard from me by then, call me.`].join("\n");
}

// ---- Referrals and gaps --------------------------------------------------------------------------------

/** For each of a client's needs, the nearest resource (from the referral list first, then any) (pure). */
export function referralsFor(c: Client, saved: Resource[], all: Resource[]): { need: NeedId; r: Resource & { km: number } | null }[] {
  return c.needs.map((need) => {
    const pick = (rs: Resource[]) => nearestFirst(rs.filter((r) => r.need === need), c)[0] ?? null;
    return { need, r: pick(saved) ?? pick(all) };
  });
}

/** A referral sheet to print or send, with no client details beyond their label (pure). */
export function referralSheet(c: Client, refs: ReturnType<typeof referralsFor>, by = ""): string {
  const out = [`Referrals for ${c.label}${by ? ` · from ${by}` : ""}`, ""];
  for (const { need, r } of refs) {
    out.push(`${needOf(need).label}: ${r ? r.name : "nothing mapped nearby yet; ask your worker"}`);
    if (r) {
      if (r.address) out.push(`  ${r.address}`);
      out.push(`  ${r.km < 1 ? `${Math.round(r.km * 1000)} m` : `${r.km.toFixed(1)} km`} away${r.hours ? ` · ${r.hours}` : ""}${r.phone ? ` · ${r.phone}` : ""}`);
      if (r.website) out.push(`  ${r.website}`);
    }
  }
  return out.join("\n");
}

/** How many clients are far (over `km`) from the nearest place for each need they have (pure). */
export function gaps(clients: Client[], rs: Resource[], km = 3): { need: NeedId; far: number; of: number }[] {
  const out: { need: NeedId; far: number; of: number }[] = [];
  for (const n of NEEDS) {
    const who = clients.filter((c) => c.needs.includes(n.id));
    if (!who.length) continue;
    const places = rs.filter((r) => r.need === n.id);
    const far = who.filter((c) => !places.some((r) => kmApart(c, r) <= km)).length;
    out.push({ need: n.id, far, of: who.length });
  }
  return out.sort((a, b) => b.far / b.of - a.far / a.of);
}

/** Clients due by a date, soonest and most urgent first (pure). */
export function due(clients: Client[], by: string): Client[] {
  const rank: Record<Priority, number> = { urgent: 0, soon: 1, routine: 2 };
  return clients.filter((c) => c.next && c.next <= by).sort((a, b) => (a.next! < b.next! ? -1 : a.next! > b.next! ? 1 : rank[a.priority] - rank[b.priority]));
}
