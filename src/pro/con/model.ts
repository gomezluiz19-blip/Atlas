// Construction, for every side of it (pure). A region's sites, each with its
// stage (from site prep to closeout), the trades each stage needs and when,
// how far up the building is, its union status and the signatory status of
// the contractors on it, visits and safety notes. From those: when each trade
// is needed where (bricklayers when the facade goes up), how many bricks and
// mason-days a facade takes, which sites to visit today and in what order,
// what materials the region will need month by month, and the pipeline.

export const STAGES = ["site prep", "excavation", "foundation", "structure", "envelope", "interiors", "finishes", "closeout"] as const;
export type Stage = (typeof STAGES)[number];
/** Share of a typical schedule each stage takes (sums to 1). */
export const STAGE_SHARE: Record<Stage, number> = { "site prep": 0.05, excavation: 0.08, foundation: 0.12, structure: 0.27, envelope: 0.18, interiors: 0.18, finishes: 0.08, closeout: 0.04 };
/** The trades working in each stage (union crafts' names). */
export const STAGE_TRADES: Record<Stage, string[]> = {
  "site prep": ["Operating engineers", "Laborers"],
  excavation: ["Operating engineers", "Laborers"],
  foundation: ["Concrete / cement masons", "Carpenters (formwork)", "Ironworkers (rebar)", "Laborers"],
  structure: ["Ironworkers", "Concrete / cement masons", "Carpenters (formwork)", "Operating engineers (cranes)", "Bricklayers (block cores)"],
  envelope: ["Bricklayers", "Glaziers", "Roofers", "Sheet metal workers"],
  interiors: ["Electricians", "Plumbers & pipefitters", "Sheet metal workers (HVAC)", "Carpenters (drywall)", "Sprinkler fitters", "Bricklayers (block walls)"],
  finishes: ["Painters", "Tile, marble & terrazzo", "Floor layers", "Elevator constructors"],
  closeout: ["Laborers"],
};
export const STAGE_COLOR: Record<Stage, string> = { "site prep": "#a2845e", excavation: "#8b6b47", foundation: "#8e8e93", structure: "#c7c7cc", envelope: "#c0533a", interiors: "#64d2ff", finishes: "#30d158", closeout: "#5e5ce6" };

export type Kind = "residential" | "mixed-use" | "commercial" | "institutional" | "industrial" | "civil";
/** Share of a facade typically in masonry (brick, block, stone) for each kind of building: a rough planning figure. */
export const MASONRY_SHARE: Record<Kind, number> = { residential: 0.55, "mixed-use": 0.45, commercial: 0.2, institutional: 0.6, industrial: 0.35, civil: 0.1 };
export type UnionStatus = "union" | "open shop" | "mixed" | "unknown";
export type Signatory = "yes" | "no" | "unknown";
export interface TradeOnSite { trade: string; contractor: string; signatory: Signatory; workers?: number }
export interface Visit { date: string; by: string; workers?: number; members?: number; notes: string }
export interface SafetyNote { date: string; kind: "OSHA inspection" | "incident" | "stop-work order" | "complaint"; text: string }
export interface Site {
  id: string; name: string; address: string; lon: number; lat: number; kind: Kind;
  owner: string; gc: string; value: number; stories: number;
  footprint: { w: number; d: number; bearing: number };
  start: string; finish: string;
  /** Actual progress 0–1, if reported (otherwise assumed on plan). */
  progress?: number;
  public?: boolean;
  union: UnionStatus;
  masonry?: "brick" | "block" | "stone" | "none";
  trades: TradeOnSite[]; visits: Visit[]; safety: SafetyNote[];
  /** The contractor's own sites (Contractor view). */
  mine?: boolean;
  source: "demo" | "NYC DOB" | "import" | "manual";
  permit?: string;
}

const DAY = 86_400_000;
export const isoDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoDay(Date.parse(iso) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Each stage's dates (pure). */
export function stageDates(s: Site): { stage: Stage; start: string; end: string }[] {
  const total = Math.max(30, daysBetween(s.start, s.finish));
  let acc = 0;
  return STAGES.map((stage) => { const a = acc; acc += STAGE_SHARE[stage] * total; return { stage, start: addDays(s.start, Math.round(a)), end: addDays(s.start, Math.round(acc)) }; });
}
/** Where the site is on a day: the stage, how far through it, and overall (pure). Uses reported progress when there is one. */
export function stageAt(s: Site, day: string): { stage: Stage; within: number; overall: number; planned: number; status: "not started" | "under way" | "done" } {
  const total = Math.max(30, daysBetween(s.start, s.finish));
  const planned = Math.max(0, Math.min(1, daysBetween(s.start, day) / total));
  const overall = s.progress ?? planned;
  if (overall <= 0) return { stage: "site prep", within: 0, overall: 0, planned, status: "not started" };
  if (overall >= 1) return { stage: "closeout", within: 1, overall: 1, planned, status: "done" };
  let acc = 0;
  for (const st of STAGES) { const share = STAGE_SHARE[st]; if (overall <= acc + share) return { stage: st, within: (overall - acc) / share, overall, planned, status: "under way" }; acc += share; }
  return { stage: "closeout", within: 1, overall, planned, status: "under way" };
}

/** How much of each stage is done (pure): 1 for stages behind, the fraction for the current one. */
const doneOf = (s: Site, day: string, st: Stage) => { const a = stageAt(s, day), i = STAGES.indexOf(st), j = STAGES.indexOf(a.stage); return a.status === "done" ? 1 : i < j ? 1 : i > j ? 0 : a.within; };
/** Floors built, clad and fitted out (pure), for drawing the building going up. */
export function floorsUp(s: Site, day: string): { built: number; clad: number; fitted: number } {
  return { built: Math.round(s.stories * doneOf(s, day, "structure")), clad: Math.round(s.stories * doneOf(s, day, "envelope")), fitted: Math.round(s.stories * doneOf(s, day, "interiors")) };
}

/** When each trade works on the site (pure). */
export function tradeWindows(s: Site): { trade: string; start: string; end: string; stage: Stage }[] {
  const out: { trade: string; start: string; end: string; stage: Stage }[] = [];
  for (const d of stageDates(s)) for (const t of STAGE_TRADES[d.stage]) {
    if (t.startsWith("Bricklayers") && (s.masonry === "none" || (MASONRY_SHARE[s.kind] < 0.15 && t === "Bricklayers"))) continue;
    out.push({ trade: t, start: d.start, end: d.end, stage: d.stage });
  }
  return out;
}
/** A craft's windows on a site, e.g. "Bricklayers" matches block cores, facade and block walls (pure). */
export const windowsFor = (s: Site, craft: string) => tradeWindows(s).filter((w) => w.trade.toLowerCase().startsWith(craft.toLowerCase()));

/** A facade in masonry: area, bricks (about 60 modular bricks a square metre), and mason-days at 500 bricks a day (pure). */
export function masonryEstimate(s: Site): { area: number; bricks: number; masonDays: number; crewWeeks: number } {
  const perimeter = 2 * (s.footprint.w + s.footprint.d), height = s.stories * 3.3;
  const share = s.masonry === "none" ? 0 : s.masonry === "brick" || s.masonry === "stone" ? Math.max(0.5, MASONRY_SHARE[s.kind]) : MASONRY_SHARE[s.kind];
  const area = Math.round(perimeter * height * share);
  const bricks = Math.round(area * 60), masonDays = Math.round(bricks / 500);
  return { area, bricks, masonDays, crewWeeks: Math.round((masonDays / (8 * 5)) * 10) / 10 };
}

/** Peak workers on site: as reported, or from the value (about 3.5 at peak per $1M of work), pure. */
export const peakWorkers = (s: Site) => s.trades.reduce((a, t) => a + (t.workers ?? 0), 0) || Math.round((s.value / 1_000_000) * 3.5);

export interface Flag { level: "now" | "soon" | "fyi"; text: string }
/** What an organizer or business agent should know about a site (pure). */
export function unionFlags(s: Site, day: string, craft = "Bricklayers"): Flag[] {
  const f: Flag[] = [];
  const win = windowsFor(s, craft), next = win.find((w) => w.end >= day);
  if (next) {
    const until = daysBetween(day, next.start);
    if (until <= 0) f.push({ level: "now", text: `${craft} needed now (${next.stage}, to ${next.end})` });
    else if (until <= 90) f.push({ level: "soon", text: `${craft} needed in ${until} days (${next.stage}, from ${next.start})` });
  }
  const unk = s.trades.filter((t) => t.signatory !== "yes" && t.trade.toLowerCase().startsWith(craft.toLowerCase()));
  if (s.union !== "union" && (next || unk.length)) f.push({ level: next && daysBetween(day, next.start) <= 90 ? "now" : "fyi", text: s.union === "unknown" ? "Union status unknown: worth a visit" : `${s.union === "open shop" ? "Open shop" : "Mixed"}: ${unk.length ? unk.map((t) => `${t.contractor} (${t.signatory === "no" ? "non-signatory" : "signatory unknown"})`).join(", ") : "masonry contractor not yet known"}` });
  if (s.public) f.push({ level: "fyi", text: "Public money: prevailing wage (Davis-Bacon or the local equivalent) applies" });
  const last = s.visits.map((v) => v.date).sort().pop();
  if (!last || daysBetween(last, day) > 30) f.push({ level: "fyi", text: last ? `Last visited ${daysBetween(last, day)} days ago` : "Never visited" });
  const recent = s.safety.filter((x) => daysBetween(x.date, day) <= 60);
  if (recent.length) f.push({ level: recent.some((x) => x.kind === "stop-work order" || x.kind === "incident") ? "now" : "soon", text: `${recent.length} safety note${recent.length > 1 ? "s" : ""} in 60 days: ${recent[0].kind}` });
  return f.sort((a, b) => ["now", "soon", "fyi"].indexOf(a.level) - ["now", "soon", "fyi"].indexOf(b.level));
}

/** A day's visits in a sensible order: nearest next, from a starting point (pure). Distances in km, drive at ~28 km/h in town. */
export function routePlan(sites: Site[], from: { lon: number; lat: number }): { order: Site[]; km: number; minutes: number } {
  const left = [...sites], order: Site[] = [];
  let at = from, km = 0;
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((s, i) => { const d = kmBetween(at, s); if (d < bd) { bd = d; bi = i; } });
    km += bd * 1.3; // streets aren't straight
    at = left[bi]; order.push(left.splice(bi, 1)[0]);
  }
  return { order, km: Math.round(km * 10) / 10, minutes: Math.round((km / 28) * 60 + order.length * 25) };
}
export const kmBetween = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.hypot((a.lon - b.lon) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), (a.lat - b.lat) * 110.57);
/** Google Maps directions through the sites in order (opens on phones too). */
export const directionsUrl = (from: { lon: number; lat: number }, order: Site[]) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${order[order.length - 1].lat},${order[order.length - 1].lon}&waypoints=${order.slice(0, -1).map((s) => `${s.lat},${s.lon}`).join("|")}&travelmode=driving`;

export const MATERIALS = { concrete: { label: "Concrete", unit: "m³" }, rebar: { label: "Rebar", unit: "t" }, brick: { label: "Brick & block", unit: "thousand bricks" }, drywall: { label: "Drywall", unit: "m²" }, glass: { label: "Glazing", unit: "m²" } } as const;
export type Material = keyof typeof MATERIALS;
/** Materials the region's sites will need, month by month, and by site (pure). Rules of thumb per square metre of floor. */
export function demand(sites: Site[], from: string, months = 6): { months: string[]; totals: Record<Material, number[]>; bySite: { s: Site; m: Material; qty: number; when: string }[] } {
  const ms = Array.from({ length: months }, (_, i) => { const d = new Date(from); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 7); });
  const totals = Object.fromEntries((Object.keys(MATERIALS) as Material[]).map((k) => [k, ms.map(() => 0)])) as Record<Material, number[]>;
  const bySite: { s: Site; m: Material; qty: number; when: string }[] = [];
  for (const s of sites) {
    const floor = s.footprint.w * s.footprint.d * s.stories, facade = 2 * (s.footprint.w + s.footprint.d) * s.stories * 3.3;
    const need: [Material, number, Stage[]][] = [
      ["concrete", floor * 0.32, ["foundation", "structure"]], ["rebar", floor * 0.032, ["foundation", "structure"]],
      ["brick", masonryEstimate(s).bricks / 1000, ["envelope"]], ["glass", facade * (1 - MASONRY_SHARE[s.kind]) * 0.7, ["envelope"]], ["drywall", floor * 2.6, ["interiors"]],
    ];
    const dates = stageDates(s);
    for (const [m, qty, stages] of need) {
      const spans = dates.filter((d) => stages.includes(d.stage));
      const a = spans[0].start, b = spans[spans.length - 1].end, len = Math.max(1, daysBetween(a, b));
      let used = 0;
      ms.forEach((mo, i) => {
        const ma = `${mo}-01`, mb = addDays(ms[i + 1] ? `${ms[i + 1]}-01` : addDays(ma, 31), 0);
        const overlap = Math.max(0, daysBetween(a > ma ? a : ma, b < mb ? b : mb));
        const q = (qty * overlap) / len;
        totals[m][i] += q; used += q;
      });
      if (used > 0.5) bySite.push({ s, m, qty: Math.round(used), when: a > from ? a : from });
    }
  }
  for (const k of Object.keys(totals) as Material[]) totals[k] = totals[k].map(Math.round);
  return { months: ms, totals, bySite: bySite.sort((x, y) => x.when.localeCompare(y.when)) };
}

/** The pipeline: sites by stage and value, and what starts soon (pure). */
export function pipeline(sites: Site[], day: string) {
  const by = new Map<Stage | "not started" | "done", { n: number; value: number }>();
  for (const s of sites) { const a = stageAt(s, day), k = a.status === "under way" ? a.stage : a.status; const e = by.get(k) ?? { n: 0, value: 0 }; e.n++; e.value += s.value; by.set(k, e); }
  return { by, startingSoon: sites.filter((s) => s.start > day && daysBetween(day, s.start) <= 120).sort((a, b) => a.start.localeCompare(b.start)), value: sites.reduce((a, s) => a + s.value, 0) };
}

/** Schedule variance for a contractor's site: ahead or behind plan, in weeks (pure). */
export function variance(s: Site, day: string): number {
  const a = stageAt(s, day), total = Math.max(30, daysBetween(s.start, s.finish));
  return Math.round(((a.overall - a.planned) * total) / 7);
}

/** NYC DOB permit rows (Socrata "DOB Permit Issuance") into sites (pure). New buildings and major alterations only. */
export function fromDobPermits(rows: Record<string, string>[], day: string): Site[] {
  const out: Site[] = [];
  for (const r of rows) {
    const lat = Number(r.gis_latitude), lon = Number(r.gis_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat) continue;
    const issued = (r.issuance_date ?? r.filing_date ?? day).slice(0, 10).replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, "$3-$1-$2");
    const nb = r.job_type === "NB";
    const id = `dob-${r.job__ ?? r.permit_si_no ?? `${lat},${lon}`}`;
    if (out.some((s) => s.id === id)) continue;
    out.push({
      id, name: `${r.house__ ?? ""} ${r.street_name ?? ""}`.trim() || "NYC permit", address: `${r.house__ ?? ""} ${r.street_name ?? ""}, ${r.borough ?? ""}`.trim(), lon, lat,
      kind: /residential|R-\d/i.test(r.residential ?? "") || r.residential === "YES" ? "residential" : "mixed-use",
      owner: r.owner_s_business_name || "Owner on file", gc: r.permittee_s_business_name || "Permittee on file", value: nb ? 25_000_000 : 6_000_000, stories: nb ? 8 : 4,
      footprint: { w: nb ? 34 : 22, d: nb ? 26 : 18, bearing: 29 }, start: issued, finish: addDays(issued, nb ? 760 : 300),
      union: "unknown", trades: [], visits: [], safety: [], source: "NYC DOB", permit: `${r.job_type ?? ""} ${r.permit_type ?? ""} · job ${r.job__ ?? "?"}`.trim(),
    });
  }
  return out;
}

/** Sites from a CSV with at least name, lat and lon (pure). */
export function sitesFromCsv(text: string, today: string): Site[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (l: string) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, "\"").trim()).slice(0, -1);
  const head = split(lines[0]).map((x) => x.toLowerCase());
  const col = (...names: string[]) => head.findIndex((x) => names.some((n) => x === n || x.startsWith(n)));
  const c = { name: col("name", "site", "project"), lat: col("lat"), lon: col("lon", "lng", "long"), address: col("address"), stories: col("stories", "floors"), start: col("start"), finish: col("finish", "end", "completion"), value: col("value", "cost"), kind: col("kind", "type"), gc: col("gc", "contractor", "general contractor"), owner: col("owner", "developer"), union: col("union") };
  if (c.lat < 0 || c.lon < 0) return [];
  const kinds: Kind[] = ["residential", "mixed-use", "commercial", "institutional", "industrial", "civil"];
  return lines.slice(1).flatMap((l, i): Site[] => {
    const v = split(l), get = (k: number) => (k >= 0 ? v[k] ?? "" : "");
    const lat = Number(get(c.lat)), lon = Number(get(c.lon));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) return [];
    const stories = Math.max(1, Number(get(c.stories)) || 4), start = /^\d{4}-\d\d-\d\d/.test(get(c.start)) ? get(c.start).slice(0, 10) : today;
    const kind = kinds.find((k) => get(c.kind).toLowerCase().startsWith(k.slice(0, 5))) ?? "mixed-use";
    const un = get(c.union).toLowerCase();
    return [{ id: `csv-${i}-${lat.toFixed(5)},${lon.toFixed(5)}`, name: get(c.name) || `Site ${i + 1}`, address: get(c.address), lat, lon, kind, owner: get(c.owner), gc: get(c.gc),
      value: Number(get(c.value).replace(/[$,]/g, "")) || stories * 8_000_000, stories, footprint: { w: 40, d: 28, bearing: 0 }, start,
      finish: /^\d{4}-\d\d-\d\d/.test(get(c.finish)) ? get(c.finish).slice(0, 10) : addDays(start, 360 + stories * 45),
      union: un.startsWith("union") || un === "yes" ? "union" : un.startsWith("open") || un === "no" ? "open shop" : un.startsWith("mix") ? "mixed" : "unknown", trades: [], visits: [], safety: [], source: "import" }];
  });
}
