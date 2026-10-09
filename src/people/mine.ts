// My people: family and the others you keep close, each pinned where they live. Kept on this device only;
// nothing here tracks anyone. Pure apart from the small store at the bottom.

export type Circle = "family" | "others";

export interface Person {
  id: string;
  name: string;
  circle: Circle;
  /** "Mom", "Partner", "Best friend"… */
  relation?: string;
  /** Where they live (or are based), and what to call it. */
  lon: number;
  lat: number;
  where: string;
  /** Their place's time zone, once known (IANA, e.g. "Europe/Lisbon"). */
  tz?: string;
  added: number;
}

export const RELATIONS: Record<Circle, string[]> = {
  family: ["Partner", "Mom", "Dad", "Parent", "Child", "Sister", "Brother", "Grandparent", "Grandchild", "Aunt or uncle", "Cousin"],
  others: ["Friend", "Best friend", "Neighbour", "Colleague", "Mentor", "Roommate"],
};

/** Up to two initials ("Ana María" → "AM", "mom" → "M") (pure). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const FAMILY_HUES = ["#d1495b", "#e07a3f", "#c98a12", "#b85c8f", "#a2543a"];
const OTHER_HUES = ["#3563d6", "#2a9d8f", "#6a5acd", "#2f8f5b", "#4f86c6"];

/** A steady colour for a person: warm for family, cool for others (pure). */
export function colorOf(p: Pick<Person, "id" | "circle">): string {
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = p.circle === "family" ? FAMILY_HUES : OTHER_HUES;
  return hues[h % hues.length];
}

/** Great-circle distance in km (pure). */
export function kmBetween(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** "Here", "3.2 km", "240 km", "5,800 km" (pure). */
export function farText(km: number): string {
  if (km < 0.2) return "Here";
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

/** Their local time, and how it sits against yours ("14:05", "+5 h", "same time") (pure). */
export function timeThere(tz: string, now: Date): { clock: string; diff: string; hour: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const there = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    const here = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    const h = Math.round((there - here) / 900_000) / 4;
    const clock = `${String(get("hour")).padStart(2, "0")}:${String(get("minute")).padStart(2, "0")}`;
    const diff = h === 0 ? "same time" : `${h > 0 ? "+" : "−"}${Math.abs(h)} h`;
    return { clock, diff, hour: get("hour") };
  } catch { return null; }
}

/** What their part of the day is ("asleep", "morning"…), so you know whether to call (pure). */
export function partOfDay(hour: number): { word: string; awake: boolean } {
  if (hour < 6) return { word: "Night, likely asleep", awake: false };
  if (hour < 9) return { word: "Early morning", awake: true };
  if (hour < 12) return { word: "Morning", awake: true };
  if (hour < 17) return { word: "Afternoon", awake: true };
  if (hour < 21) return { word: "Evening", awake: true };
  if (hour < 23) return { word: "Late evening", awake: true };
  return { word: "Night, likely asleep", awake: false };
}

/** Family first, then others; each nearest first from a point, if there is one (pure). */
export function grouped(people: Person[], from?: { lon: number; lat: number } | null): Record<Circle, Person[]> {
  const sort = (xs: Person[]) => (from ? [...xs].sort((a, b) => kmBetween(from, a) - kmBetween(from, b)) : [...xs].sort((a, b) => a.added - b.added));
  return { family: sort(people.filter((p) => p.circle === "family")), others: sort(people.filter((p) => p.circle === "others")) };
}

/** A new person, with a fresh id (pure apart from the id). */
export function newPerson(p: Omit<Person, "id" | "added">, now = Date.now()): Person {
  const name = p.name.trim().slice(0, 60) || "Someone";
  return { ...p, name, relation: p.relation?.trim().slice(0, 40) || undefined, where: p.where.trim().slice(0, 120), id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, added: now };
}

// ---- The store (this device only) ----------------------------------------------------------------

export const PEOPLE_KEY = "atlas.people.v1";
const listeners = new Set<() => void>();

export function loadPeople(): Person[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PEOPLE_KEY) ?? "[]") as Person[];
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.name === "string" && Number.isFinite(p.lon) && Number.isFinite(p.lat)) : [];
  } catch { return []; }
}

export function savePeople(people: Person[]): void {
  try { localStorage.setItem(PEOPLE_KEY, JSON.stringify(people)); } catch { /* storage full or blocked: keep what's on screen */ }
  listeners.forEach((fn) => fn());
}

export const addPerson = (p: Person) => savePeople([...loadPeople(), p]);
export const updatePerson = (id: string, change: Partial<Person>) => savePeople(loadPeople().map((p) => (p.id === id ? { ...p, ...change } : p)));
export const removePerson = (id: string) => savePeople(loadPeople().filter((p) => p.id !== id));

/** Calls back whenever the list changes; returns the way to stop. */
export function onPeople(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
