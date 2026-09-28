// The one fact worth knowing first. A place's page opens with a headline,
// not a table: of everything measured there, whatever is most remarkable
// ("Stands 3,715 m above the sea", "Barely 90 mm of rain a year", "6.2
// million people live within 25 km").

const n0 = (v: number) => Math.round(v).toLocaleString();
const km = (v: number) => (v < 10 ? v.toFixed(1) : n0(v));

/** The most remarkable measured fact, as a sentence (null if nothing stands out). */
export function headline(v: Record<string, number>, kind = ""): string | null {
  const ok = (k: string) => Number.isFinite(v[k]);
  const c: [number, string][] = [];
  if (ok("elev") && v.elev >= 2000) c.push([3 + v.elev / 1000, `Stands ${n0(v.elev)} m above the sea.`]);
  if (ok("volcano") && v.volcano < 25 && kind !== "volcano") c.push([7 - v.volcano / 10, `A famous volcano is ${km(v.volcano)} km away.`]);
  if (ok("faults") && v.faults < 40) c.push([6 - v.faults / 20, `Sits ${km(v.faults)} km from the edge of a tectonic plate.`]);
  if (ok("crowd") && v.crowd >= 3_000_000) c.push([4 + v.crowd / 5_000_000, `${(v.crowd / 1e6).toFixed(1)} million people live within 25 km.`]);
  if (ok("crowd") && ok("city") && v.crowd < 5000 && v.city > 150) c.push([4.5, `Few people live within 25 km; the nearest big city is ${n0(v.city)} km away.`]);
  if (ok("winter") && v.winter <= -12) c.push([4 + -v.winter / 10, `Its coldest month averages ${v.winter.toFixed(0)} °C.`]);
  if (ok("temp") && v.temp >= 25) c.push([4 + (v.temp - 25) / 2, `Averages ${v.temp.toFixed(0)} °C across the whole year.`]);
  if (ok("rain") && v.rain >= 2500) c.push([4 + v.rain / 2000, `${n0(v.rain)} mm of rain falls here in a year.`]);
  if (ok("rain") && v.rain <= 150) c.push([5 + (150 - v.rain) / 100, v.rain < 5 ? "Almost no rain falls here." : `Barely ${n0(v.rain)} mm of rain a year.`]);
  if (ok("sun") && v.sun >= 3400) c.push([3.5 + (v.sun - 3400) / 400, `${n0(v.sun)} hours of sunshine a year.`]);
  if (ok("frost") && v.frost >= 180) c.push([4, `Frost on ${n0(v.frost)} nights a year.`]);
  if (ok("coast") && ok("elev") && v.coast < 1 && v.elev < 5) c.push([3.2, `Right on the coast, barely ${n0(v.elev)} m above the sea.`]);
  if (ok("slope") && v.slope >= 25) c.push([3 + v.slope / 20, `The ground here slopes at ${n0(v.slope)}°.`]);
  if (!c.length) return null;
  return c.sort((a, b) => b[0] - a[0])[0][1];
}

/** A curated blurb's first sentence, for the arrival card. */
export const firstSentence = (s: string) => (/^(.+?[.!?])(\s|$)/.exec(s.trim())?.[1] ?? s.trim()).slice(0, 180);
