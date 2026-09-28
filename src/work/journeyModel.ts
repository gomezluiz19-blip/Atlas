// A journey told the way people say it: "fly to Manila, taxi to the hotel,
// stay 3 nights, train to Baguio". Each step has its own way of getting there;
// stays hold their own stops. The timeline, distances and times follow from
// the steps.
import { metres, type LonLat } from "./geo";

export type Mode = "fly" | "train" | "drive" | "taxi" | "bus" | "ferry" | "walk" | "bike";

export interface Spot { name: string; detail?: string; lon: number; lat: number }

export interface Visit { id: string; name: string; spot?: Spot; /** Day of the stay, from 0. */ day: number; time?: string; note?: string }

export interface MoveStep { id: string; kind: "move"; mode: Mode; to: Spot; /** Leave at HH:MM (otherwise as soon as the last step ends). */ at?: string; note?: string }
export interface StayStep { id: string; kind: "stay"; place: Spot; /** Nights, or hours for a short stop. */ nights?: number; hours?: number; visits: Visit[]; note?: string }
export type Step = MoveStep | StayStep;

export interface Journey {
  id: string;
  name: string;
  /** Start date (YYYY-MM-DD) and time (HH:MM). */
  start: string;
  time: string;
  origin: Spot | null;
  steps: Step[];
  created: number;
  notes?: string;
  checklist?: { text: string; done: boolean }[];
}

/** Door-to-door estimates: typical speed (km/h), route length against the straight line, and time before and after (check-in, stations, waiting). */
export const MODES: Record<Mode, { label: string; verb: string; emoji: string; color: string; kmh: number; detour: number; overheadH: number }> = {
  fly: { label: "Fly", verb: "Fly", emoji: "✈️", color: "#0a84ff", kmh: 780, detour: 1.05, overheadH: 2.5 },
  train: { label: "Train", verb: "Train", emoji: "🚆", color: "#bf5af2", kmh: 95, detour: 1.2, overheadH: 0.3 },
  drive: { label: "Drive", verb: "Drive", emoji: "🚗", color: "#30d158", kmh: 70, detour: 1.3, overheadH: 0 },
  taxi: { label: "Taxi", verb: "Taxi", emoji: "🚕", color: "#ffcc00", kmh: 35, detour: 1.35, overheadH: 0.1 },
  bus: { label: "Bus", verb: "Bus", emoji: "🚌", color: "#ff9f0a", kmh: 45, detour: 1.3, overheadH: 0.2 },
  ferry: { label: "Ferry", verb: "Ferry", emoji: "⛴️", color: "#64d2ff", kmh: 30, detour: 1.15, overheadH: 0.5 },
  walk: { label: "Walk", verb: "Walk", emoji: "🚶", color: "#8e8e93", kmh: 4.8, detour: 1.25, overheadH: 0 },
  bike: { label: "Bike", verb: "Cycle", emoji: "🚲", color: "#34c759", kmh: 15, detour: 1.25, overheadH: 0 },
};
export const MODE_IDS = Object.keys(MODES) as Mode[];

/** The obvious way to cover a distance when none was named. */
export function guessMode(km: number): Mode {
  return km > 700 ? "fly" : km > 12 ? "drive" : km > 1.5 ? "taxi" : "walk";
}

export function legEstimate(from: LonLat, to: LonLat, mode: Mode) {
  const m = MODES[mode], straight = metres(from, to), route = straight * m.detour;
  return { straight, route, hours: straight < 1 ? 0 : route / 1000 / m.kmh + m.overheadH };
}

// ---- Timeline -------------------------------------------------------------------------------

/** Minutes since 1970 on the wall clock (time zones ignored: every time is local to where you are). */
const toMin = (date: string, time = "09:00") => {
  const [h, m] = time.split(":").map(Number);
  return Date.parse(date + "T00:00:00Z") / 60_000 + (h || 0) * 60 + (m || 0);
};
export const dateOf = (min: number) => new Date(min * 60_000).toISOString().slice(0, 10);
export const timeOf = (min: number) => new Date(min * 60_000).toISOString().slice(11, 16);
/** Check-out time after a night's stay. */
const CHECKOUT = "10:00";

export interface MoveRow { step: MoveStep; from: Spot | null; start: number; end: number; km: number; hours: number }
export interface StayRow { step: StayStep; start: number; end: number; /** Date of each day of the stay. */ days: string[] }
export type Row = MoveRow | StayRow;

export interface Timeline { rows: Row[]; start: number; end: number; km: number; byMode: Partial<Record<Mode, { n: number; km: number }>>; nights: number }

export function timeline(j: Journey): Timeline {
  let t = toMin(j.start, j.time);
  const start = t;
  let here: Spot | null = j.origin;
  const rows: Row[] = [];
  const byMode: Timeline["byMode"] = {};
  let km = 0, nights = 0;
  for (const s of j.steps) {
    if (s.kind === "move") {
      let leave = t;
      if (s.at) { const at = toMin(dateOf(t), s.at); leave = at >= t ? at : at + 1440; }
      const e = here ? legEstimate([here.lon, here.lat], [s.to.lon, s.to.lat], s.mode) : { route: 0, hours: 0 };
      const end = leave + Math.round(e.hours * 60);
      rows.push({ step: s, from: here, start: leave, end, km: e.route / 1000, hours: e.hours });
      const b = (byMode[s.mode] ??= { n: 0, km: 0 });
      b.n++; b.km += e.route / 1000; km += e.route / 1000;
      t = end; here = s.to;
    } else {
      const arrive = t;
      let end: number;
      const days: string[] = [];
      if (s.nights) {
        end = toMin(dateOf(arrive + s.nights * 1440), CHECKOUT);
        for (let d = 0; d <= s.nights; d++) days.push(dateOf(arrive + d * 1440));
        nights += s.nights;
      } else {
        end = arrive + Math.round((s.hours ?? 1) * 60);
        days.push(dateOf(arrive));
      }
      rows.push({ step: s, start: arrive, end, days });
      t = end; here = s.place;
    }
  }
  return { rows, start, end: t, km, byMode, nights };
}

/** Where you are after a number of steps (the origin before any). */
export function whereAfter(j: Journey, n: number): Spot | null {
  let here = j.origin;
  for (const s of j.steps.slice(0, n)) here = s.kind === "move" ? s.to : s.place;
  return here;
}

// ---- Plain words ------------------------------------------------------------------------------

/** One step as typed, before its place has been looked up. */
export type Draft =
  | { kind: "origin"; query: string; date?: string }
  | { kind: "move"; mode: Mode | null; query: string; home?: boolean; at?: string }
  | { kind: "stay"; query?: string; nights?: number; hours?: number }
  | { kind: "visit"; query: string; day?: number; hours?: number };

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, "a couple of": 2, "a few": 3, couple: 2, few: 3, half: 0.5 };
const num = (s: string) => (NUM[s.toLowerCase()] ?? parseFloat(s));
const NUMW = "(\\d+(?:\\.\\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|a couple of|a few|couple|few|half)";

const MODE_WORDS: [RegExp, Mode][] = [
  [/^(?:fly|flight|flying|plane|air)$/i, "fly"],
  [/^(?:train|rail|railway|metro|subway|tube|tram)$/i, "train"],
  [/^(?:drive|driving|car|rental car|hire car|road trip)$/i, "drive"],
  [/^(?:taxi|cab|uber|grab|lyft|ride|transfer|shuttle)$/i, "taxi"],
  [/^(?:bus|coach|jeepney)$/i, "bus"],
  [/^(?:ferry|boat|ship|cruise|sail)$/i, "ferry"],
  [/^(?:walk|walking|on foot|hike)$/i, "walk"],
  [/^(?:bike|cycle|cycling|bicycle)$/i, "bike"],
];
const MODE_ALT = "fly|flight|flying|plane|air|train|rail|railway|metro|subway|tube|tram|drive|driving|car|rental car|hire car|road trip|taxi|cab|uber|grab|lyft|ride|transfer|shuttle|bus|coach|jeepney|ferry|boat|ship|cruise|sail|walk|walking|on foot|hike|bike|cycle|cycling|bicycle";
export const modeOf = (w: string): Mode | null => MODE_WORDS.find(([re]) => re.test(w.trim()))?.[1] ?? null;

const clean = (q: string) => q.replace(/^(?:the|a|an)\s+/i, "").replace(/[.!]+$/, "").trim();
const isHome = (q: string) => /^(?:home|back home|back|the start|where (?:i|we) started|(?:the )?school|base)$/i.test(q.trim());
const clock = (s?: string) => {
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return undefined;
  let h = +m[1];
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return h < 24 ? `${String(h).padStart(2, "0")}:${m[2] ?? "00"}` : undefined;
};

/** A date typed as "12 Oct", "Oct 12", "2026-10-12" or "12/10" (day first unless that's impossible). */
export function parseDate(s: string, today = new Date().toISOString().slice(0, 10)): string | undefined {
  const t = s.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  let d: number | undefined, mo: number | undefined;
  let m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*$/) ?? null;
  if (m) { d = +m[1]; mo = months.indexOf(m[2]); }
  m = t.match(/^([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (m) { d = +m[2]; mo = months.indexOf(m[1]); }
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) { const a = +m[1], b = +m[2]; if (b > 12) { mo = a - 1; d = b; } else { d = a; mo = b - 1; } }
  if (d === undefined || mo === undefined || mo < 0 || d < 1 || d > 31) return undefined;
  let y = +today.slice(0, 4);
  const iso = (yy: number) => `${yy}-${String(mo! + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (iso(y) < today) y++;
  return iso(y);
}

/** Splits a line into steps: "fly to Manila, taxi to the Peninsula then stay 3 nights". */
export function parseSteps(text: string): Draft[] {
  const starts = `(?:${MODE_ALT}|stay|spend|sleep|visit|see|stop|explore|tour|lunch|dinner|breakfast|back|return|head|go|then|and then|from|start|leave|\\d+|${NUMW})`;
  const parts = text.split(new RegExp(`\\s*(?:\\bthen\\b|;|\\n|,\\s*(?=${starts}\\b)|\\band\\s+(?=(?:${MODE_ALT}|stay|visit|see|explore)\\b))\\s*`, "i")).map((p) => p?.trim()).filter(Boolean) as string[];
  const out: Draft[] = [];
  for (const raw of parts) {
    const p = raw.replace(/^(?:and\s+|then\s+|next,?\s+|after that,?\s+)/i, "").trim();
    let m: RegExpMatchArray | null;
    // Where it starts: "from Washington DC on 12 Oct", "start in London", "leave Boston".
    if ((m = p.match(/^(?:start(?:ing)?|leav(?:e|ing)|depart(?:ing)?|begin(?:ning)?)?\s*(?:from|in|at)?\s*(.+?)(?:\s+on\s+(.+))?$/i)) && /^(?:start|leav|depart|begin|from)/i.test(p)) {
      out.push({ kind: "origin", query: clean(m[1].replace(/^(?:from|in|at)\s+/i, "")), date: m[2] ? parseDate(m[2]) : undefined });
      continue;
    }
    // Stays: "stay 3 nights", "3 nights at the Peninsula", "spend two days in Baguio", "stay at X for 2 nights".
    if ((m = p.match(new RegExp(`^(?:stay|spend|sleep|overnight)?\\s*(?:for\\s+)?${NUMW}\\s*(nights?|days?|hours?|hrs?|h)\\b(?:\\s+(?:at|in)\\s+(.+))?$`, "i"))) && (/^(stay|spend|sleep|overnight)/i.test(p) || /nights?|days?/i.test(m[2]))) {
      const n = num(m[1]), unit = m[2].toLowerCase();
      out.push({ kind: "stay", query: m[3] ? clean(m[3]) : undefined, ...(unit.startsWith("h") ? { hours: n } : { nights: Math.max(1, Math.round(n)) }) });
      continue;
    }
    if ((m = p.match(new RegExp(`^(?:stay|sleep|check in)\\s+(?:at|in)\\s+(.+?)(?:\\s+for\\s+${NUMW}\\s*(nights?|days?|hours?|hrs?|h))?$`, "i")))) {
      const n = m[2] ? num(m[2]) : 1, unit = (m[3] ?? "night").toLowerCase();
      out.push({ kind: "stay", query: clean(m[1]), ...(unit.startsWith("h") ? { hours: n } : { nights: Math.max(1, Math.round(n)) }) });
      continue;
    }
    // Visits: "visit Intramuros", "see the rice terraces on day 2", "lunch at X".
    if ((m = p.match(new RegExp(`^(?:visit|see|go see|stop at|stop by|explore|tour|lunch at|dinner at|breakfast at|coffee at)\\s+(.+?)(?:\\s+on\\s+day\\s+(\\d+))?(?:\\s+for\\s+${NUMW}\\s*(hours?|hrs?|h))?$`, "i")))) {
      out.push({ kind: "visit", query: clean(m[1]), day: m[2] ? Math.max(0, +m[2] - 1) : undefined, hours: m[3] ? num(m[3]) : undefined });
      continue;
    }
    // Moves: "fly to Manila", "take the train to Baguio at 8am", "to Baguio by bus", "back home", "go to Cebu".
    if ((m = p.match(new RegExp(`^(?:take\\s+(?:a|an|the)\\s+)?(${MODE_ALT})\\s+(?:back\\s+)?(?:to|into|over to|up to|down to)\\s+(.+?)(?:\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?))?$`, "i")))) {
      const q = clean(m[2]);
      out.push({ kind: "move", mode: modeOf(m[1]), query: q, home: isHome(q), at: clock(m[3]) });
      continue;
    }
    if ((m = p.match(new RegExp(`^(?:go|head|travel|get|then)?\\s*(?:back\\s+)?to\\s+(.+?)\\s+by\\s+(${MODE_ALT})$`, "i")))) {
      const q = clean(m[1]);
      out.push({ kind: "move", mode: modeOf(m[2]), query: q, home: isHome(q) });
      continue;
    }
    if ((m = p.match(new RegExp(`^(?:(${MODE_ALT})\\s+)?(?:back home|home|return(?: home)?|head home|go home)$`, "i")))) {
      out.push({ kind: "move", mode: m[1] ? modeOf(m[1]) : null, query: "home", home: true });
      continue;
    }
    if ((m = p.match(/^(?:go|head|travel|get|move|on)\s+(?:over\s+|up\s+|down\s+)?to\s+(.+)$/i))) {
      const q = clean(m[1]);
      out.push({ kind: "move", mode: null, query: q, home: isHome(q) });
      continue;
    }
  }
  return out;
}

/** A name from where the trip goes: "Manila and Baguio", "Tokyo, Kyoto and Osaka". */
export function autoName(j: Journey): string | null {
  const names: string[] = [];
  for (const s of j.steps) {
    if (s.kind !== "move" || ["taxi", "walk", "bike"].includes(s.mode)) continue;
    if (j.origin && s.to.lon === j.origin.lon && s.to.lat === j.origin.lat) continue;
    const n = s.to.name.replace(/^the\s+/i, "");
    if (!names.includes(n)) names.push(n);
  }
  if (!names.length) return null;
  const top = names.slice(0, 3);
  return top.length === 1 ? top[0] : `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
}

/** A short description of what a line would plan: "✈️ Manila → 🚕 Peninsula → 🛏️ 3 nights". */
export function describeDrafts(drafts: Draft[]): string {
  return drafts.map((d) => d.kind === "origin" ? `from ${d.query}` : d.kind === "move" ? `${d.mode ? MODES[d.mode].emoji : "→"} ${d.home ? "home" : d.query}` : d.kind === "stay" ? `${d.nights ? `🛏️ ${`${d.nights} night${d.nights === 1 ? "" : "s"}`}` : `📍 ${d.hours} h`}${d.query ? ` at ${d.query}` : ""}` : `📍 ${d.query}`).join(" → ");
}
