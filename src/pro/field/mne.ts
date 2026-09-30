// Field Ops' monitoring side, in the shape coordination systems use: the 4W
// (who does what, where and when, with the people reached split by women, men,
// girls and boys), indicators against targets, the gap matrix (needs with no
// one working on them), supplies and how many weeks they'll last, and several
// new sites planned at once. Pure functions.
import { bestNextSite, gaps, type Community, type Programme, type Service } from "./model";

export const SECTORS = ["WASH", "Health", "Education", "Food security", "Nutrition", "Protection", "Shelter", "Livelihoods"] as const;
export type Sector = (typeof SECTORS)[number];
/** The service each sector's needs map to, where there is one. */
export const SECTOR_SERVICE: Partial<Record<Sector, Service>> = { WASH: "water", Health: "health", Education: "school", "Food security": "food" };

export interface Reached { women: number; men: number; girls: number; boys: number }
export interface Activity { id: string; org: string; sector: Sector; activity: string; community: string; start: string; end?: string; status: "planned" | "ongoing" | "done"; reached: Reached }
export interface Indicator { id: string; name: string; sector: Sector; target: number; unit: string; manual?: number }
export interface Stock { id: string; item: string; site: string; qty: number; unit: string; perWeek: number }

export const total = (r: Reached) => r.women + r.men + r.girls + r.boys;

/** People reached, by sex and age, for a sector or all (pure). */
export function reached(acts: Activity[], sector?: Sector): Reached {
  return acts.filter((a) => a.status !== "planned" && (!sector || a.sector === sector)).reduce((s, a) => ({ women: s.women + a.reached.women, men: s.men + a.reached.men, girls: s.girls + a.reached.girls, boys: s.boys + a.reached.boys }), { women: 0, men: 0, girls: 0, boys: 0 });
}

/** Each indicator's value (entered, or people reached in its sector) against its target (pure). */
export function indicatorProgress(inds: Indicator[], acts: Activity[]) {
  return inds.map((i) => { const value = i.manual ?? total(reached(acts, i.sector)); return { i, value, share: i.target ? value / i.target : 0 }; });
}

export const FOUR_W_HEAD = ["Organisation", "Sector", "Activity", "Location", "Latitude", "Longitude", "Start", "End", "Status", "Women", "Men", "Girls", "Boys", "Total reached"];

/** The 4W as rows, ready for a coordination cluster's sheet (pure). */
export function fourW(p: Programme, acts: Activity[]) {
  const c = new Map(p.communities.map((x) => [x.id, x]));
  return acts.map((a) => { const x = c.get(a.community); return [a.org, a.sector, a.activity, x?.name ?? "", x?.lat.toFixed(5) ?? "", x?.lon.toFixed(5) ?? "", a.start, a.end ?? "", a.status, a.reached.women, a.reached.men, a.reached.girls, a.reached.boys, total(a.reached)]; });
}

/**
 * The gap matrix: for each community and sector, who is working there, and
 * whether a stated need has no one (pure). Needs are the community's
 * services mapped to sectors.
 */
export function gapMatrix(p: Programme, acts: Activity[]) {
  const live = acts.filter((a) => a.status !== "done");
  const rows = p.communities.map((c) => ({
    c,
    cells: SECTORS.map((s) => {
      const orgs = [...new Set(live.filter((a) => a.community === c.id && a.sector === s).map((a) => a.org))];
      const need = SECTOR_SERVICE[s] ? c.needs.includes(SECTOR_SERVICE[s]!) : false;
      return { sector: s, orgs, need, gap: need && !orgs.length, overlap: orgs.length > 1 };
    }),
  }));
  const gapsList = rows.flatMap((r) => r.cells.filter((x) => x.gap).map((x) => ({ c: r.c, sector: x.sector })));
  return { rows, gaps: gapsList, peopleInGaps: [...new Set(gapsList.map((g) => g.c))].reduce((s, c) => s + c.people, 0), overlaps: rows.flatMap((r) => r.cells.filter((x) => x.overlap).map((x) => ({ c: r.c, sector: x.sector, orgs: x.orgs }))) };
}

/** Supplies: weeks of cover at the current rate, soonest to run out first (pure). */
export function stockCover(stock: Stock[]) {
  return stock.map((s) => ({ s, weeks: s.perWeek > 0 ? s.qty / s.perWeek : Infinity })).sort((a, b) => a.weeks - b.weeks);
}

/**
 * Several new sites for a service, chosen one after another where each
 * reaches the most people still too far (greedy maximal covering; pure).
 */
export function planSites(p: Programme, service: Service, n: number) {
  const kind = { water: "water", health: "clinic", school: "school", food: "distribution" }[service];
  let q: Programme = { ...p, sites: [...p.sites] };
  const picks: { at: Community; people: number; reaches: Community[] }[] = [];
  for (let k = 0; k < n; k++) {
    const b = bestNextSite(q, service);
    if (!b || b.people <= 0) break;
    picks.push(b);
    q = { ...q, sites: [...q.sites, { id: `plan${k}`, name: b.at.name, kind, lon: b.at.lon, lat: b.at.lat }] };
  }
  return { picks, before: gaps(p, service).missed, after: gaps(q, service).missed };
}

/** Walking time for a straight-line distance: paths wind (×1.3) at about 4 km/h (pure). */
export const walkHours = (km: number) => (km * 1.3) / 4;

/** Communities from a Kobo, ODK or spreadsheet export (name, latitude, longitude, population or households, needs; pure). */
export function communitiesFromRows(rows: Record<string, string>[], newId: () => string): Community[] {
  const col = (r: Record<string, string>, ...names: string[]) => { for (const n of names) for (const k of Object.keys(r)) if (k.replace(/[^a-z]/g, "") === n.replace(/[^a-z]/g, "") && r[k]) return r[k]; return ""; };
  return rows.flatMap((r) => {
    const name = col(r, "name", "community", "village", "settlement", "location", "site");
    const lat = Number(col(r, "latitude", "lat", "gps latitude", "_gps_latitude")), lon = Number(col(r, "longitude", "lon", "lng", "long", "gps longitude", "_gps_longitude"));
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return [];
    const people = Number(col(r, "population", "people", "individuals", "persons")) || Number(col(r, "households", "hh")) * 5 || 0;
    const text = col(r, "needs", "priority needs", "needs priority").toLowerCase();
    const needs = (["water", "health", "school", "food"] as Service[]).filter((s) => text.includes(s) || (s === "water" && /wash|borehole/.test(text)) || (s === "school" && /educ/.test(text)) || (s === "health" && /clinic|medic|nutri/.test(text)));
    return [{ id: newId(), name, lat, lon, people, needs }];
  });
}
