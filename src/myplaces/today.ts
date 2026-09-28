// "Today at your place": the morning brief. It turns the forecast and your own
// records (animals in Flock, fields in Grow, projects in Build) into a short
// list of things to know or do, most urgent first.
import type { SiteDay } from "../data/openmeteo";
import { addDays, status, type BuildProject } from "../work/buildModel";
import { dueList, speciesById, type Flock } from "../work/flockModel";

export type Urgency = "now" | "soon" | "fyi";
export interface TodayItem { icon: string; title: string; detail: string; urgency: Urgency; tool?: "flock" | "grow" | "build" }

export interface FieldLite { id?: string; name: string; crop: string; planted: string; pts?: [number, number][] }

/** A field's season from the Grow model, when it could be worked out. */
export interface FieldSeason { name: string; stage: string; harvest?: [string, string]; irrigate7: number; m2: number; frost: boolean }

export interface TodayInputs {
  today: string;
  weather: SiteDay[] | null;
  flock: Flock | null;
  fields: FieldLite[];
  builds: BuildProject[];
  /** Growth stage, harvest window and water need per field (optional). */
  seasons?: FieldSeason[];
}

const dayName = (iso: string, today: string) => {
  if (iso === today) return "today";
  if (iso < today) {
    const n = Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000);
    return n === 1 ? "yesterday" : `${n} days ago`;
  }
  if (iso === addDays(today, 1)) return "tomorrow";
  return new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "long" });
};

const short = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** What matters at a place today, most urgent first. */
export function todayItems(x: TodayInputs): TodayItem[] {
  const out: TodayItem[] = [];
  const hasCrops = x.fields.length > 0, hasAnimals = !!x.flock?.animals.length, hasSite = x.builds.length > 0;
  const w = x.weather?.filter((d) => d.date >= x.today).slice(0, 4) ?? [];

  // Weather that changes what you do.
  const frost = w.find((d) => d.tmin <= 1);
  if (frost) out.push({ icon: "❄️", title: `Frost ${dayName(frost.date, x.today)}: down to ${Math.round(frost.tmin)} °C`,
    detail: hasCrops ? "Cover seedlings and tender crops; check water troughs and pipes." : hasAnimals ? "Check troughs and pipes aren't frozen; give animals shelter and extra feed." : hasSite ? "No concrete pours unless protected." : "Protect pipes, plants and anything that can freeze.",
    urgency: frost.date <= addDays(x.today, 1) ? "now" : "soon", tool: hasCrops ? "grow" : undefined });
  const heat = w.find((d) => d.tmax >= 32);
  if (heat) out.push({ icon: "🌡️", title: `Heat ${dayName(heat.date, x.today)}: up to ${Math.round(heat.tmax)} °C`,
    detail: hasAnimals ? "Shade and plenty of water; move animals and handle them in the cool of the morning." : hasCrops ? "Crops will use more water: irrigate early or late." : "Work early, drink water, check on anyone vulnerable.",
    urgency: heat.date <= addDays(x.today, 1) ? "now" : "soon", tool: hasAnimals ? "flock" : undefined });
  const storm = w.find((d) => d.rain >= 20);
  const wet = storm ?? w.find((d) => d.rain >= 8);
  if (wet) out.push({ icon: storm ? "⛈️" : "🌧️", title: `${storm ? "Heavy rain" : "Rain"} ${dayName(wet.date, x.today)}: about ${Math.round(wet.rain)} mm`,
    detail: storm ? "Clear drains and culverts; move animals and machinery off low ground." : hasCrops ? "Hold off spraying and irrigating before it." : hasSite ? "Plan indoor work; no pours or roofing." : "A day for indoor jobs.",
    urgency: storm && storm.date <= addDays(x.today, 1) ? "now" : "soon" });
  const gale = w.find((d) => d.gustMax >= 60);
  if (gale) out.push({ icon: "💨", title: `Strong wind ${dayName(gale.date, x.today)}: gusts to ${Math.round(gale.gustMax)} km/h`,
    detail: hasSite ? "Cranes stand down; secure loose materials." : "Tie down covers, gates and anything loose.", urgency: gale.date <= addDays(x.today, 1) ? "now" : "soon", tool: hasSite ? "build" : undefined });
  const dry = w.length >= 4 && w.every((d) => d.rain < 1) && w.some((d) => d.tmax >= 22);
  if (dry && (hasCrops || hasAnimals)) out.push({ icon: "☀️", title: "Dry days ahead", detail: hasCrops ? "No real rain for four days: check soil moisture and plan irrigation." : "Check water supply for the animals.", urgency: "fyi", tool: hasCrops ? "grow" : "flock" });
  if (w.length && !frost && !heat && !wet && !gale) {
    const d = w[0];
    out.push({ icon: "🌤️", title: `A good day for outside work: ${Math.round(d.tmin)}–${Math.round(d.tmax)} °C`, detail: d.rain > 0 ? `Light rain (${d.rain.toFixed(1)} mm).` : "Dry, with light wind.", urgency: "fyi" });
  }

  // Animals: births, vaccinations and rechecks. Three or more births of one kind become one line.
  if (x.flock) {
    const due = dueList(x.flock.animals, x.today, 14);
    const births = new Map<string, typeof due>();
    for (const d of due) if (d.kind === "birth") { const k = d.animal.species; if (!births.has(k)) births.set(k, []); births.get(k)!.push(d); }
    const grouped = new Set<string>();
    for (const [sp, list] of births) {
      if (list.length < 3) continue;
      grouped.add(sp);
      const first = list[0], late = list.filter((d) => d.overdue).length, info = speciesById(sp);
      out.push({ icon: info.emoji, title: `${list.length} ${info.label.toLowerCase()} due to give birth in the next two weeks`, detail: late ? `${late} overdue; keep a close eye on them.` : `The first is due ${dayName(first.date, x.today)}.`, urgency: late || first.date <= addDays(x.today, 2) ? "now" : "soon", tool: "flock" });
    }
    for (const d of due.filter((d) => !(d.kind === "birth" && grouped.has(d.animal.species))).slice(0, 5)) {
      const name = d.animal.name || d.animal.tag || speciesById(d.animal.species).label;
      const soon = d.date <= addDays(x.today, 2);
      out.push({ icon: d.kind === "birth" ? speciesById(d.animal.species).emoji : "💉",
        title: `${name}: ${d.what.toLowerCase()}${d.overdue ? " (overdue)" : ""}`,
        detail: d.overdue ? `Was due ${dayName(d.date, x.today)}.` : `Due ${dayName(d.date, x.today)}${soon ? "" : ` (${short(d.date)})`}.`,
        urgency: d.overdue || soon ? "now" : "soon", tool: "flock" });
    }
  }

  // Building projects behind schedule.
  for (const p of x.builds) {
    const s = status(p.phases, x.today);
    if (s.behindDays >= 7) out.push({ icon: "🏗️", title: `${p.name} is ${s.behindDays} days behind`, detail: `${Math.round(s.actual)}% built against ${Math.round(s.planned)}% planned. Finish now ${s.finish}.`, urgency: "soon", tool: "build" });
  }

  // Fields: harvest windows and water, from the season model.
  const seasonal = new Set<string>();
  for (const fs of x.seasons ?? []) {
    seasonal.add(fs.name);
    if (fs.harvest) {
      const [a, b] = fs.harvest;
      const opensIn = Math.round((Date.parse(a) - Date.parse(x.today)) / 86_400_000);
      if (opensIn <= 0) out.push({ icon: "🌾", title: `${fs.name}: ready to harvest`, detail: b > x.today ? `The window runs to about ${short(b)}.` : "Harvest when conditions allow.", urgency: "now", tool: "grow" });
      else if (opensIn <= 14) out.push({ icon: "🌾", title: `${fs.name}: harvest in about ${opensIn} days`, detail: `${fs.stage}; window ${short(a)} to ${short(b)} at this week's warmth.`, urgency: "soon", tool: "grow" });
    }
    if (fs.irrigate7 >= 10) {
      const l = fs.irrigate7 * fs.m2;
      out.push({ icon: "💧", title: `${fs.name}: irrigate about ${Math.round(fs.irrigate7)} mm this week`, detail: `The crop will use more than the rain forecast${fs.m2 ? ` (about ${l >= 1e6 ? `${(l / 1e6).toFixed(1)} million` : Math.round(l).toLocaleString()} litres for the field)` : ""}.`, urgency: fs.irrigate7 >= 25 ? "soon" : "fyi", tool: "grow" });
    }
    if (!fs.harvest || Date.parse(fs.harvest[0]) - Date.parse(x.today) > 14 * 86_400_000)
      if (fs.irrigate7 < 10) out.push({ icon: "🌱", title: `${fs.name}: ${fs.stage.toLowerCase()}`, detail: fs.frost ? "Frost is forecast this week." : "On track; nothing needed today.", urgency: fs.frost ? "soon" : "fyi", tool: "grow" });
  }

  // Fields without a season yet: a nudge for anything just planted.
  for (const f of x.fields) {
    if (seasonal.has(f.name)) continue;
    const age = Math.round((Date.parse(x.today) - Date.parse(f.planted)) / 86_400_000);
    if (age >= 0 && age <= 14) out.push({ icon: "🌱", title: `${f.name}: ${age === 0 ? "planted today" : `${age} days since planting`}`, detail: "Watch for emergence and keep the seedbed moist.", urgency: "fyi", tool: "grow" });
  }

  const rank: Record<Urgency, number> = { now: 0, soon: 1, fyi: 2 };
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}

/** Reads the records Flock, Grow and Build keep in this browser. */
export function localRecords(): { flock: Flock | null; fields: FieldLite[]; builds: BuildProject[] } {
  const read = <T>(key: string, fallback: T): T => {
    try { return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback; } catch { return fallback; }
  };
  const flock = read<Flock | null>("atlas.work.flock.v1", null);
  return {
    flock: flock && Array.isArray(flock.animals) ? flock : null,
    fields: read<FieldLite[]>("atlas.work.fields.v1", []).filter((f) => f && f.planted),
    builds: read<BuildProject[]>("atlas.work.build.v1", []).filter((p) => p && Array.isArray(p.phases)),
  };
}
