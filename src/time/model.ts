// Time as a dimension of everything. One scale runs from the ancient world to
// 2100, and each moment says what the globe can show for it: the borders of
// the time (before 2000), the satellite view of a day that year (2000 on),
// today, or projections (the future). Also the sums behind a place's own
// history: how much warmer it has become, and who governed it.

export type MomentKind = "borders" | "imagery" | "now" | "future";
export interface Moment { year: number; kind: MomentKind; label: string }

export const FUTURE = [2030, 2050, 2070, 2100];

/** "500 BC", "AD 800", "1914". */
export const yearName = (y: number) => (y < 0 ? `${(-y).toLocaleString()} BC` : y < 1000 ? `AD ${y}` : String(y));

/** Every stop on the time bar, oldest first. */
export function moments(thisYear: number, bordersYears: number[]): Moment[] {
  const out: Moment[] = bordersYears.filter((y) => y >= -3000 && y < 2000).map((y) => ({ year: y, kind: "borders" as const, label: yearName(y) }));
  for (let y = 2000; y < thisYear; y++) out.push({ year: y, kind: "imagery", label: String(y) });
  out.push({ year: thisYear, kind: "now", label: "Today" });
  for (const y of FUTURE) if (y > thisYear) out.push({ year: y, kind: "future", label: String(y) });
  return out;
}

/** The stop nearest a year. */
export function momentIndex(list: Moment[], year: number): number {
  let best = 0;
  list.forEach((m, i) => { if (Math.abs(m.year - year) < Math.abs(list[best].year - year)) best = i; });
  return best;
}

/** A clear-skied day to show from space: high summer for the hemisphere in view. */
export const dayFor = (year: number, lat: number) => (lat >= 0 ? `${year}-07-15` : `${year}-01-15`);

/** Yearly means from daily values (only years with most days measured). */
export function yearlyMeans(time: string[], values: (number | null)[]): { year: number; mean: number }[] {
  const acc = new Map<number, [number, number]>();
  time.forEach((t, i) => {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) return;
    const y = Number(t.slice(0, 4));
    const a = acc.get(y) ?? [0, 0];
    a[0] += v; a[1]++;
    acc.set(y, a);
  });
  return [...acc].filter(([, [, n]]) => n >= 330).map(([year, [sum, n]]) => ({ year, mean: sum / n })).sort((a, b) => a.year - b.year);
}

/** The mean over a span of years (NaN if none measured). */
export function spanMean(list: { year: number; mean: number }[], from: number, to: number): number {
  const xs = list.filter((x) => x.year >= from && x.year <= to).map((x) => x.mean);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/**
 * How much warmer a climate model makes a place by the 2050s than it was in
 * 1991–2010. Only the change is used (models run warm or cold in places; the
 * change is what they agree on best), added to what was measured.
 */
export function projectedChange(model: { year: number; mean: number }[]): number {
  return spanMean(model, 2041, 2060) - spanMean(model, 1991, 2010);
}

interface Shape { name: string; rings: [number, number][][]; bbox: [number, number, number, number]; area: number }

function inRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The state whose borders hold a point: the smallest, if several do. */
export function polityShapeAt<T extends Shape>(polities: T[], lon: number, lat: number): T | null {
  let best: T | null = null;
  for (const p of polities) {
    const [w, s, e, n] = p.bbox;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    if (p.rings.some((r) => inRing(lon, lat, r)) && (!best || p.area < best.area)) best = p;
  }
  return best;
}

/** Who governed a point (null: no state recorded there). */
export const polityAt = (polities: Shape[], lon: number, lat: number): string | null => polityShapeAt(polities, lon, lat)?.name ?? null;

/** Runs of the same ruler merged: 1800 Ottoman, 1880 Ottoman, 1914 Ottoman → one line from 1800. */
export function rulerTimeline(list: { year: number; name: string | null }[]): { from: number; to: number; name: string | null }[] {
  const out: { from: number; to: number; name: string | null }[] = [];
  for (const x of list) {
    const last = out[out.length - 1];
    if (last && last.name === x.name) last.to = x.year;
    else out.push({ from: x.year, to: x.year, name: x.name });
  }
  return out;
}
