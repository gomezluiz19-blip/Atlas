// City Ops, for the people who run a city (pure). Agencies with their budgets
// and people; every facility they run (firehouses, precincts, schools,
// hospitals, libraries, garages, plants) with its condition, staffing and
// repairs; capital projects with budget, schedule and progress; live
// incidents; 311 requests; and open bids. From those: the morning brief,
// what each agency should look at, projects running late or over, where a
// service is thin on the ground (coverage gaps), 311 as a heat map over time.

import type { FieldMap, Row } from "../../data/opendata";

export interface Agency { id: string; name: string; short: string; color: string; emoji: string; budget: number; headcount: number; vacancies: number; overtime: number; head: string }
export type FacilityKind = "firehouse" | "precinct" | "school" | "hospital" | "library" | "garage" | "park" | "shelter" | "plant" | "yard" | "office" | "other";
export interface Facility {
  id: string; agency: string; name: string; kind: FacilityKind; lon: number; lat: number; borough: string;
  floors: number; w: number; d: number; bearing: number;
  /** 1 (poor) to 5 (good). */
  condition: number; built: number;
  staff: number; authorized: number;
  workOrders: number; status: "open" | "partial" | "closed";
  note?: string;
  /** Who runs it (a captain, a principal, a branch manager). */
  lead?: string;
  source: "demo" | "live" | "import";
}
export interface Project {
  id: string; agency: string; name: string; lon: number; lat: number; borough: string;
  budget: number; spent: number; start: string; finish: string; progress: number;
  floors: number; w: number; d: number; kind: "building" | "park" | "street" | "water" | "bridge";
}
export interface Incident { id: string; kind: "fire" | "water main" | "power" | "collision" | "flooding" | "building" | "police" | "weather"; lon: number; lat: number; time: string; severity: 1 | 2 | 3; agencies: string[]; text: string; status: "active" | "contained" | "closed" }
export interface Request311 { id: string; type: string; agency: string; lon: number; lat: number; created: string; status: "open" | "closed"; borough?: string }
export interface Bid { id: string; agency: string; title: string; value: number; due: string; status: "open" | "evaluating" | "awarded"; project?: string; bidders: number }
export interface City { id: string; name: string; lon: number; lat: number; agencies: Agency[]; facilities: Facility[]; projects: Project[]; incidents: Incident[]; requests: Request311[]; bids: Bid[]; demo?: boolean }

const DAY = 86_400_000;
export const isoDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export const CONDITION_COLOR = ["#ff453a", "#ff453a", "#ff9f0a", "#ffd60a", "#8fd14f", "#30d158"];
export const CONDITION_LABEL = ["", "Poor", "Fair", "Adequate", "Good", "Excellent"];

/** A capital project's state on a day: planned and actual progress, schedule slip in weeks, and the cost at completion at the current burn (pure). */
export function projectStatus(p: Project, day: string) {
  const total = Math.max(30, daysBetween(p.start, p.finish));
  const planned = Math.max(0, Math.min(1, daysBetween(p.start, day) / total));
  const slipWeeks = Math.round(((p.progress - planned) * total) / 7);
  const eac = p.progress > 0.05 ? Math.round(p.spent / p.progress) : p.budget;
  const overrun = Math.max(0, eac - p.budget);
  const level: "red" | "amber" | "green" = slipWeeks <= -8 || overrun > p.budget * 0.1 ? "red" : slipWeeks <= -3 || overrun > p.budget * 0.03 ? "amber" : "green";
  return { planned, slipWeeks, eac, overrun, level };
}

/** An agency's numbers (pure). */
export function agencyStats(c: City, agencyId: string) {
  const a = c.agencies.find((x) => x.id === agencyId)!;
  const fs = c.facilities.filter((f) => f.agency === agencyId);
  const staff = fs.reduce((s, f) => s + f.staff, 0), auth = fs.reduce((s, f) => s + f.authorized, 0);
  const poor = fs.filter((f) => f.condition <= 2);
  const req = c.requests.filter((r) => r.agency === a.short);
  return {
    a, facilities: fs, poor, closed: fs.filter((f) => f.status !== "open"), workOrders: fs.reduce((s, f) => s + f.workOrders, 0),
    staffing: auth ? Math.round((staff / auth) * 100) : 100, avgCondition: fs.length ? Math.round((fs.reduce((s, f) => s + f.condition, 0) / fs.length) * 10) / 10 : 0,
    requests: req.length, openRequests: req.filter((r) => r.status === "open").length,
    projects: c.projects.filter((p) => p.agency === agencyId),
  };
}

/** What a facility's manager or the agency should look at (pure). */
export function facilityFlags(f: Facility): string[] {
  const out: string[] = [];
  if (f.status === "closed") out.push(`Closed${f.note ? `: ${f.note}` : ""}`);
  else if (f.status === "partial") out.push(`Partly open${f.note ? `: ${f.note}` : ""}`);
  if (f.condition <= 2) out.push(`Condition ${CONDITION_LABEL[f.condition].toLowerCase()} (built ${f.built})`);
  if (f.authorized && f.staff / f.authorized < 0.85) out.push(`Staffed at ${Math.round((f.staff / f.authorized) * 100)}% (${f.authorized - f.staff} short)`);
  if (f.workOrders >= 12) out.push(`${f.workOrders} open work orders`);
  return out;
}

/** The morning brief: the handful of things the head of government should know today (pure). */
export function morningBrief(c: City, day: string): { level: "now" | "soon" | "fyi"; text: string; go?: { kind: "incident" | "project" | "agency" | "311"; id?: string } }[] {
  const out: ReturnType<typeof morningBrief> = [];
  for (const i of c.incidents.filter((x) => x.status === "active").sort((a, b) => b.severity - a.severity))
    out.push({ level: i.severity >= 3 ? "now" : "soon", text: `${i.text} (${i.agencies.join(", ")})`, go: { kind: "incident", id: i.id } });
  const open = c.requests.filter((r) => r.status === "open");
  if (c.requests.length) {
    const top = topTypes(c.requests, 3);
    out.push({ level: "fyi", text: `${c.requests.length.toLocaleString()} 311 requests in the last day, ${open.length.toLocaleString()} still open. Most: ${top.map(([t, n]) => `${t} (${n})`).join(", ")}`, go: { kind: "311" } });
  }
  const late = c.projects.map((p) => ({ p, s: projectStatus(p, day) })).filter((x) => x.s.level === "red");
  for (const { p, s } of late.slice(0, 3)) out.push({ level: "soon", text: `${p.name}: ${s.slipWeeks < 0 ? `${-s.slipWeeks} weeks late` : "on time"}${s.overrun ? `, heading ${money(s.overrun)} over` : ""}`, go: { kind: "project", id: p.id } });
  const closed = c.facilities.filter((f) => f.status !== "open");
  if (closed.length) out.push({ level: "soon", text: `${closed.length} facilit${closed.length === 1 ? "y" : "ies"} not fully open: ${closed.slice(0, 3).map((f) => f.name).join(", ")}${closed.length > 3 ? "…" : ""}` });
  for (const a of c.agencies) { const v = a.headcount ? a.vacancies / a.headcount : 0; if (v > 0.08) out.push({ level: "fyi", text: `${a.short}: ${Math.round(v * 100)}% of positions vacant (${a.vacancies.toLocaleString()})`, go: { kind: "agency", id: a.id } }); }
  const bids = c.bids.filter((b) => b.status === "open" && daysBetween(day, b.due) <= 7 && daysBetween(day, b.due) >= 0);
  if (bids.length) out.push({ level: "fyi", text: `${bids.length} bid${bids.length > 1 ? "s" : ""} close this week, worth ${money(bids.reduce((s, b) => s + b.value, 0))}` });
  return out.sort((a, b) => ["now", "soon", "fyi"].indexOf(a.level) - ["now", "soon", "fyi"].indexOf(b.level));
}

export const money = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e8 ? `$${Math.round(n / 1e6)}M` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;

/** The most common request types (pure). */
export function topTypes(rs: Request311[], n = 5): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rs) m.set(r.type, (m.get(r.type) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Requests binned into square cells about `km` across, for a heat map (pure). Optionally only those created between two times. */
export function heatCells(rs: Request311[], km = 0.6, from?: number, to?: number): { lon: number; lat: number; n: number; size: [number, number] }[] {
  if (!rs.length) return [];
  const lat0 = rs[0].lat, dLat = km / 110.57, dLon = km / (111.32 * Math.cos((lat0 * Math.PI) / 180));
  const m = new Map<string, number>();
  for (const r of rs) {
    const t = Date.parse(r.created);
    if (from !== undefined && t < from) continue;
    if (to !== undefined && t >= to) continue;
    const k = `${Math.floor(r.lon / dLon)},${Math.floor(r.lat / dLat)}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([k, n]) => { const [x, y] = k.split(",").map(Number); return { lon: (x + 0.5) * dLon, lat: (y + 0.5) * dLat, n, size: [dLon, dLat] as [number, number] }; });
}

/** Where a service is thin: grid cells near the city's other facilities (a stand-in for "on land, where people are") farther than `maxKm` from the nearest facility of a kind (pure). */
export function coverageGaps(c: City, kind: FacilityKind, maxKm: number, stepKm = 0.8): { lon: number; lat: number; km: number }[] {
  const own = c.facilities.filter((f) => f.kind === kind), all = c.facilities;
  if (!own.length) return [];
  const lats = all.map((f) => f.lat), lons = all.map((f) => f.lon);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2, kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.57;
  const dist = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * ky);
  const out: { lon: number; lat: number; km: number }[] = [];
  for (let lat = Math.min(...lats); lat <= Math.max(...lats); lat += stepKm / ky)
    for (let lon = Math.min(...lons); lon <= Math.max(...lons); lon += stepKm / kx) {
      const p = { lon, lat };
      if (!all.some((f) => dist(f, p) < 1.6)) continue;
      const near = Math.min(...own.map((f) => dist(f, p)));
      if (near > maxKm) out.push({ lon, lat, km: Math.round(near * 10) / 10 });
    }
  return out;
}

/** The standard each kind of facility is judged by for coverage, km (rough planning distances). */
export const COVERAGE_KM: Partial<Record<FacilityKind, number>> = { firehouse: 2.4, precinct: 3.5, library: 2.5, hospital: 6, school: 2, park: 1.2 };

/** City-wide numbers (pure). */
export function cityKpis(c: City, day: string) {
  return {
    budget: c.agencies.reduce((s, a) => s + a.budget, 0), headcount: c.agencies.reduce((s, a) => s + a.headcount, 0), vacancies: c.agencies.reduce((s, a) => s + a.vacancies, 0),
    facilities: c.facilities.length, poor: c.facilities.filter((f) => f.condition <= 2).length,
    incidents: c.incidents.filter((i) => i.status === "active").length,
    requests: c.requests.length, openRequests: c.requests.filter((r) => r.status === "open").length,
    capital: c.projects.reduce((s, p) => s + p.budget, 0), late: c.projects.filter((p) => projectStatus(p, day).level === "red").length,
  };
}

/** NYC 311 rows (Socrata erm2-nwe9) into requests (pure). */
export function from311(rows: Record<string, string>[]): Request311[] {
  const out: Request311[] = [];
  for (const r of rows) {
    const lat = Number(r.latitude), lon = Number(r.longitude);
    if (!lat || !lon || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({ id: r.unique_key ?? `${lat},${lon},${r.created_date}`, type: r.complaint_type ?? "Other", agency: r.agency ?? "", lon, lat, created: r.created_date ?? "", status: /closed/i.test(r.status ?? "") ? "closed" : "open", borough: r.borough });
  }
  return out;
}

/** NYC Facilities Database rows (Socrata ji82-xba5) into facilities for an agency (pure). Sizes and condition are unknown, so set to typical values. */
export function fromFacDb(rows: Record<string, string>[], agencyId: string): Facility[] {
  const kindOf = (t: string): FacilityKind => /fire/i.test(t) ? "firehouse" : /police|precinct/i.test(t) ? "precinct" : /school|elementary|high|middle/i.test(t) ? "school" : /hospital|health/i.test(t) ? "hospital" : /librar/i.test(t) ? "library" : /garage|sanitation/i.test(t) ? "garage" : /park|playground|recreation/i.test(t) ? "park" : /shelter|homeless/i.test(t) ? "shelter" : /treatment|plant/i.test(t) ? "plant" : "other";
  return rows.flatMap((r, i): Facility[] => {
    const lat = Number(r.latitude), lon = Number(r.longitude);
    if (!lat || !lon) return [];
    const kind = kindOf(`${r.factype ?? ""} ${r.facsubgrp ?? ""}`);
    return [{ id: `live-${agencyId}-${r.uid ?? i}`, agency: agencyId, name: r.facname ?? "Facility", kind, lon, lat, borough: r.boro ?? "", floors: kind === "hospital" ? 8 : kind === "school" ? 4 : 3, w: 30, d: 22, bearing: 29,
      condition: 3, built: 0, staff: 0, authorized: 0, workOrders: 0, status: "open", source: "live" }];
  });
}

/** Facilities from a CSV with name, lat, lon and any of: agency, kind, borough, floors, staff, condition (pure). Unknown agencies are matched by short name or name. */
export function facilitiesFromCsv(text: string, agencies: Agency[]): Facility[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (l: string) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, "\"").trim()).slice(0, -1);
  const head = split(lines[0]).map((x) => x.toLowerCase());
  const col = (...n: string[]) => head.findIndex((x) => n.some((k) => x === k || x.startsWith(k)));
  const c = { name: col("name", "facility"), lat: col("lat"), lon: col("lon", "lng", "long"), agency: col("agency", "department"), kind: col("kind", "type"), boro: col("borough", "district", "ward"), floors: col("floors", "stories"), staff: col("staff", "headcount"), cond: col("condition") };
  if (c.lat < 0 || c.lon < 0) return [];
  const kinds: FacilityKind[] = ["firehouse", "precinct", "school", "hospital", "library", "garage", "park", "shelter", "plant", "yard", "office"];
  return lines.slice(1).flatMap((l, i): Facility[] => {
    const v = split(l), get = (k: number) => (k >= 0 ? v[k] ?? "" : "");
    const lat = Number(get(c.lat)), lon = Number(get(c.lon));
    if (!lat || !lon || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const ag = get(c.agency).toLowerCase();
    const agency = agencies.find((a) => a.id === ag || a.short.toLowerCase() === ag || a.name.toLowerCase() === ag)?.id ?? agencies[0]?.id ?? "city";
    const kt = get(c.kind).toLowerCase(), kind = kinds.find((k) => kt.startsWith(k.slice(0, 4))) ?? (/fire/.test(kt) ? "firehouse" : /police/.test(kt) ? "precinct" : "other");
    const staff = Number(get(c.staff)) || 0;
    return [{ id: `csv-${i}-${lat.toFixed(5)}`, agency, name: get(c.name) || `Facility ${i + 1}`, kind, lon, lat, borough: get(c.boro), floors: Math.max(1, Number(get(c.floors)) || 2), w: 30, d: 22, bearing: 0,
      condition: Math.max(1, Math.min(5, Number(get(c.cond)) || 3)), built: 0, staff, authorized: staff, workOrders: 0, status: "open", source: "import" }];
  });
}

/** Facilities from any open-data table (pure): each row a facility of one agency, its kind read from its type column. */
export function facilitiesFromRows(rows: Row[], map: FieldMap, agencyId: string): Facility[] {
  const kindOf = (t: string): FacilityKind => /fire/i.test(t) ? "firehouse" : /police|precinct/i.test(t) ? "precinct" : /school/i.test(t) ? "school" : /hospital|health|clinic/i.test(t) ? "hospital" : /librar/i.test(t) ? "library" : /garage|sanitation|depot/i.test(t) ? "garage" : /park|playground|recreation|pool/i.test(t) ? "park" : /shelter/i.test(t) ? "shelter" : /treatment|plant|pump/i.test(t) ? "plant" : /yard/i.test(t) ? "yard" : /office|admin|hall/i.test(t) ? "office" : "other";
  return rows.map((r, i) => {
    const p = (k?: string) => (k ? r.props[k] ?? "" : "");
    const kind = kindOf(`${p(map.type)} ${p(map.name)}`);
    return { id: `od-${agencyId}-${i}-${r.lat.toFixed(5)}`, agency: agencyId, name: (p(map.name) || p(map.address) || `Facility ${i + 1}`).slice(0, 80), kind, lon: r.lon, lat: r.lat, borough: "",
      floors: kind === "hospital" ? 8 : kind === "school" ? 3 : kind === "office" ? 6 : 2, w: 30, d: 22, bearing: 0, condition: 3, built: 0, staff: 0, authorized: 0, workOrders: 0,
      status: /closed|inactive/i.test(p(map.status)) ? "closed" : "open", source: "import" } satisfies Facility;
  });
}
