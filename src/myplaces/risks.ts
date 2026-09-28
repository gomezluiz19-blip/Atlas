// Weather-driven disease and pest risk for the daily brief.
//   Potato and tomato late blight: the Hutton criteria (as used by the UK's
//   BlightWatch): two consecutive days, each with a minimum temperature of at
//   least 10 °C and at least six hours with relative humidity of 90% or more.
//   Sheep blowfly strike: warm, humid weather (daily mean 15 °C or more with
//   humid hours) when flies are active.

export interface Hour { time: string; t: number; rh: number }

function byDay(hours: Hour[]): { date: string; tmin: number; tmean: number; humidHours: number }[] {
  const days = new Map<string, Hour[]>();
  for (const h of hours) { const d = h.time.slice(0, 10); if (!days.has(d)) days.set(d, []); days.get(d)!.push(h); }
  return [...days].filter(([, hs]) => hs.length >= 20).map(([date, hs]) => ({
    date, tmin: Math.min(...hs.map((h) => h.t)), tmean: hs.reduce((a, h) => a + h.t, 0) / hs.length, humidHours: hs.filter((h) => h.rh >= 90).length,
  }));
}

/** Dates that complete a Hutton period (the second of two qualifying days). */
export function huttonPeriods(hours: Hour[]): string[] {
  const d = byDay(hours);
  const ok = d.map((x) => x.tmin >= 10 && x.humidHours >= 6);
  return d.filter((_, i) => i > 0 && ok[i] && ok[i - 1]).map((x) => x.date);
}

/** Dates with blowfly-strike weather: warm and humid. */
export function flystrikeDays(hours: Hour[]): string[] {
  return byDay(hours).filter((x) => x.tmean >= 15 && x.humidHours >= 4).map((x) => x.date);
}
