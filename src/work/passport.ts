// A learner's passport: a stamp for every country explored on the globe, and
// badges for games and streaks. Kept in this browser.
export interface Passport { /** Collecting stamps (switched on the first time Learn is opened). */ active?: boolean; stamps: Record<string, string>; badges: Record<string, string>; streak: { last: string; days: number }; flights: number }

const KEY = "atlas.learn.passport.v1";
export function loadPassport(): Passport {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && v.stamps) return { streak: { last: "", days: 0 }, flights: 0, badges: {}, ...v };
  } catch { /* new */ }
  return { stamps: {}, badges: {}, streak: { last: "", days: 0 }, flights: 0 };
}
export function savePassport(p: Passport) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* fine */ }
}

export const BADGES: { id: string; label: string; emoji: string; about: string }[] = [
  { id: "stamp1", label: "First stamp", emoji: "🛂", about: "Explore a place in any country" },
  { id: "stamp5", label: "Explorer", emoji: "🧭", about: "Stamps from 5 countries" },
  { id: "stamp15", label: "Globetrotter", emoji: "🌍", about: "Stamps from 15 countries" },
  { id: "stamp40", label: "World citizen", emoji: "🏅", about: "Stamps from 40 countries" },
  { id: "pilot", label: "Pilot", emoji: "✈️", about: "Finish a Flight School flight" },
  { id: "ace", label: "Ace", emoji: "🛩️", about: "Finish 5 flights" },
  { id: "flags", label: "Flag expert", emoji: "🚩", about: "Score 7 or more in Flag Match" },
  { id: "where", label: "Sharp eye", emoji: "🎯", about: "3,500+ in Where in the world?" },
  { id: "time", label: "Time traveller", emoji: "⏳", about: "3,000+ in Time traveller" },
  { id: "streak3", label: "On a roll", emoji: "🔥", about: "Daily challenge 3 days running" },
  { id: "streak7", label: "Unstoppable", emoji: "💫", about: "Daily challenge 7 days running" },
];

const today = () => new Date().toISOString().slice(0, 10);

/** Adds a badge; returns true if it's new. */
export function award(p: Passport, id: string): boolean {
  if (p.badges[id]) return false;
  p.badges[id] = today();
  return true;
}

/** A stamp for a country; returns the new badges it earned. */
export function stamp(p: Passport, country: string): string[] {
  const out: string[] = [];
  if (!country || p.stamps[country]) return out;
  p.stamps[country] = today();
  const n = Object.keys(p.stamps).length;
  for (const [id, need] of [["stamp1", 1], ["stamp5", 5], ["stamp15", 15], ["stamp40", 40]] as const) if (n >= need && award(p, id)) out.push(id);
  return out;
}

/** Records a daily challenge played today; returns badges earned. */
export function dailyPlayed(p: Passport, day = today()): string[] {
  if (p.streak.last === day) return [];
  const yesterday = new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10);
  p.streak = { last: day, days: p.streak.last === yesterday ? p.streak.days + 1 : 1 };
  const out: string[] = [];
  if (p.streak.days >= 3 && award(p, "streak3")) out.push("streak3");
  if (p.streak.days >= 7 && award(p, "streak7")) out.push("streak7");
  return out;
}

/** The place of the day: the same for everyone on a date. */
export function dailyIndex(n: number, day = today()): number {
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}
