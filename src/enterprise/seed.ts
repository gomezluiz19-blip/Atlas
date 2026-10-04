// Repeatable made-up data for the enterprise demos: a seeded random number
// generator and plausible names. Demo data is always labelled as such.
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000; };
  return {
    next,
    int: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    near: (lon: number, lat: number, km: number): [number, number] => {
      const r = km * Math.sqrt(next()), a = next() * Math.PI * 2;
      return [lon + (r * Math.cos(a)) / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + (r * Math.sin(a)) / 110.57];
    },
  };
}
const FIRST = ["Maya", "James", "Aisha", "Daniel", "Sofia", "Marcus", "Priya", "Luis", "Grace", "Omar", "Elena", "Tyrone", "Hannah", "Kenji", "Rosa", "Andre", "Nadia", "Victor", "Chloe", "Samuel", "Imani", "Diego", "Leah", "Kwame", "Mei", "Patrick", "Fatima", "Noah", "Carmen", "Ethan", "Zara", "Malik"];
const LAST = ["Johnson", "Okafor", "Garcia", "Nguyen", "Patel", "Brooks", "Kim", "Rivera", "Thompson", "Hassan", "Silva", "Washington", "Chen", "Murphy", "Adeyemi", "Lopez", "Carter", "Singh", "Reyes", "Bennett", "Ali", "Foster", "Morales", "Hughes", "Ward", "Diaz"];
export const personName = (r: ReturnType<typeof rng>) => `${r.pick(FIRST)} ${r.pick(LAST)}`;
export const isoDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoDay(Date.parse(iso) + n * 86_400_000);
/** The last `n` weekdays up to and including `day`, oldest first. */
export function weekdays(day: string, n: number): string[] {
  const out: string[] = [];
  let d = day;
  while (out.length < n) { const wd = new Date(d).getUTCDay(); if (wd !== 0 && wd !== 6) out.unshift(d); d = addDays(d, -1); }
  return out;
}
