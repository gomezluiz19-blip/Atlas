// What a site is like to work at, filled in for every account without anyone
// typing it: altitude and what it does to engines and people, the climate's
// extremes and wet months, how far the grid and the nearest port and airport
// are, a battery-electric readiness screen, and whether the commodity and
// country bring conflict-minerals due diligence. Pure functions, plus one
// gatherer that fetches what they need.
import { climateDays } from "../../data/openmeteo";
import { elevation } from "../../data/elevation";
import { airports as loadAirports, ports as loadPorts, powerPlants, type PowerPlant } from "../../data/infra";
import { kmBetween } from "../kit/ops";
import type { Account, Airport } from "./network";

/** Air density relative to sea level (standard atmosphere, scale height 8.4 km; pure). */
export const airDensity = (altM: number) => Math.exp(-Math.max(0, altM) / 8434);

/**
 * A diesel engine's power loss at altitude, percent: a common rule of thumb
 * for turbocharged mining engines is none up to about 2,000 m, then about 1%
 * per 100 m (the OEM's derating curve is the real answer; pure).
 */
export const derate = (altM: number) => Math.min(40, Math.max(0, (altM - 2000) / 100));

export interface Climate { hottest: number; coldest: number; recordHigh: number; recordLow: number; annualRain: number; wetMonths: number[]; months: { tmax: number; tmin: number; rain: number }[] }

/** Ten years of days to a climate summary: monthly means, extremes, and months over 100 mm of rain (pure). */
export function summarise(daysIn: { date: string; tmin: number | null; tmax: number | null; rain: number | null }[]): Climate | null {
  if (!daysIn.length) return null;
  const years = new Set(daysIn.map((d) => d.date.slice(0, 4))).size || 1;
  const months = Array.from({ length: 12 }, (_, m) => {
    const xs = daysIn.filter((d) => Number(d.date.slice(5, 7)) === m + 1);
    const mean = (v: (number | null)[]) => { const ok = v.filter((x): x is number => x !== null); return ok.length ? ok.reduce((s, x) => s + x, 0) / ok.length : NaN; };
    return { tmax: mean(xs.map((d) => d.tmax)), tmin: mean(xs.map((d) => d.tmin)), rain: xs.reduce((s, d) => s + (d.rain ?? 0), 0) / years };
  });
  const tmaxs = daysIn.map((d) => d.tmax).filter((x): x is number => x !== null), tmins = daysIn.map((d) => d.tmin).filter((x): x is number => x !== null);
  return {
    months,
    hottest: Math.max(...months.map((m) => m.tmax)), coldest: Math.min(...months.map((m) => m.tmin)),
    recordHigh: Math.max(...tmaxs), recordLow: Math.min(...tmins),
    annualRain: months.reduce((s, m) => s + m.rain, 0),
    wetMonths: months.map((m, i) => (m.rain > 100 ? i : -1)).filter((i) => i >= 0),
  };
}

/**
 * The US Dodd-Frank Act section 1502 "covered countries": the DRC and its
 * neighbours, where tin, tantalum, tungsten and gold (3TG) need due diligence
 * on their source. The EU's list of conflict-affected and high-risk areas is
 * wider and changes; this is the fixed legal floor.
 */
export const COVERED_COUNTRIES = ["DR Congo", "Democratic Republic of the Congo", "Angola", "Burundi", "Central African Republic", "Republic of the Congo", "Rwanda", "South Sudan", "Tanzania", "Uganda", "Zambia"];
export const THREE_TG = ["tin", "tantalum", "tungsten", "gold"];
export const conflictMinerals = (country?: string, commodity?: string) =>
  !!country && !!commodity && COVERED_COUNTRIES.some((c) => c.toLowerCase() === country.toLowerCase()) && THREE_TG.includes(commodity.toLowerCase());

export interface Conditions {
  alt: number; density: number; derate: number;
  climate: Climate | null;
  grid: { plant: PowerPlant; km: number } | null;
  port: { name: string; km: number } | null;
  airport: { name: string; iata: string; km: number; type: string } | null;
  electric: { score: number; reasons: string[] };
  conflict: boolean;
}

/**
 * A screen for battery-electric fleets (0–100; pure): grid power close by
 * helps, altitude favours electric drives (they don't lose power in thin
 * air), long diesel supply lines make electric cheaper to run, deep cold and
 * no grid count against.
 */
export function electricReadiness(alt: number, grid: { plant: PowerPlant; km: number } | null, portKm: number | null, climate: Climate | null) {
  let score = 50;
  const reasons: string[] = [];
  if (grid) {
    if (grid.km < 50) { score += 25; reasons.push(`a ${Math.round(grid.plant.mw)} MW power station ${Math.round(grid.km)} km away`); }
    else if (grid.km < 150) { score += 10; reasons.push(`grid power within ${Math.round(grid.km)} km`); }
    else if (grid.km > 300) { score -= 20; reasons.push(`the nearest large power station is ${Math.round(grid.km)} km away`); }
  } else { score -= 20; reasons.push("no large power station found nearby"); }
  if (alt > 3000) { score += 15; reasons.push(`at ${Math.round(alt)} m diesels lose about ${Math.round(derate(alt))}% of their power; electric drives don't`); }
  else if (alt > 2000) { score += 5; reasons.push("some diesel derating at this altitude"); }
  if (portKm !== null && portKm > 800) { score += 10; reasons.push(`diesel comes ${Math.round(portKm)} km from the nearest port`); }
  if (climate && climate.coldest < -20) { score -= 10; reasons.push(`winter lows near ${Math.round(climate.coldest)} °C shorten battery range`); }
  if (climate && climate.hottest > 40) { score -= 5; reasons.push(`summer highs near ${Math.round(climate.hottest)} °C need battery cooling`); }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/** The nearest of a list to a point, within reason (pure). */
export function nearest<T extends { lon: number; lat: number }>(list: T[], p: { lon: number; lat: number }, filter: (t: T) => boolean = () => true) {
  let best: T | null = null, km = Infinity;
  for (const t of list) { if (!filter(t)) continue; const d = kmBetween(t, p); if (d < km) { km = d; best = t; } }
  return best ? { t: best, km } : null;
}

// ---- Gathering (network) ---------------------------------------------------------------------------

const cache = new Map<string, Promise<Conditions>>();

/** Everything about a site's conditions, fetched once per session. */
export function conditionsFor(a: Account): Promise<Conditions> {
  const key = `${a.lon.toFixed(3)},${a.lat.toFixed(3)}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const [h, days, plants, ports, airports] = await Promise.all([
        elevation.sample([[a.lon, a.lat]], 12).then((v) => v[0] ?? 0).catch(() => 0),
        climateDays(a.lon, a.lat, 10).catch(() => []),
        powerPlants().catch(() => [] as PowerPlant[]),
        loadPorts().catch(() => []),
        loadAirports().catch(() => [] as Airport[]),
      ]);
      const alt = Math.max(0, h), climate = summarise(days);
      const g = nearest(plants, a, (x) => x.mw >= 100), port = nearest(ports, a), air = nearest(airports, a);
      return {
        alt, density: airDensity(alt), derate: derate(alt), climate,
        grid: g ? { plant: g.t, km: g.km } : null,
        port: port ? { name: port.t.name, km: port.km } : null,
        airport: air ? { name: air.t.name, iata: air.t.iata, km: air.km, type: air.t.type } : null,
        electric: electricReadiness(alt, g ? { plant: g.t, km: g.km } : null, port?.km ?? null, climate),
        conflict: conflictMinerals(a.country, a.commodity),
      };
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Is it the wet season at a site this month (from its climate; pure)? */
export const wetNow = (c: Conditions | undefined, month = new Date().getMonth()) => !!c?.climate?.wetMonths.includes(month);

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
