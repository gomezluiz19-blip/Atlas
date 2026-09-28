// "Today at your place": the morning brief. It turns the forecast and your own
// records (animals in Flock, fields in Grow, projects in Build) into a short
// list of things to know or do, most urgent first.
import type { SiteDay } from "../data/openmeteo";
import { addDays, status, type BuildProject } from "../work/buildModel";
import { dueList, speciesById, type Flock } from "../work/flockModel";

export type Urgency = "now" | "soon" | "fyi";
export interface TodayItem { icon: string; title: string; detail: string; urgency: Urgency; tool?: "flock" | "grow" | "build" }

interface FieldLite { name: string; crop: string; planted: string }

export interface TodayInputs {
  today: string;
  weather: SiteDay[] | null;
  flock: Flock | null;
  fields: FieldLite[];
  builds: BuildProject[];
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

  // Animals: births, vaccinations and rechecks.
  if (x.flock) {
    for (const d of dueList(x.flock.animals, x.today, 14).slice(0, 5)) {
      const name = d.animal.name || d.animal.tag || speciesById(d.animal.species).label;
      const soon = d.date <= addDays(x.today, 2);
      out.push({ icon: d.kind === "birth" ? speciesById(d.animal.species).emoji : "💉",
        title: `${name}: ${d.what.toLowerCase()}${d.overdue ? " (overdue)" : ""}`,
        detail: d.overdue ? `Was due ${dayName(d.date, x.today)}.` : `Due ${dayName(d.date, x.today)}${soon ? "" : ` (${d.date})`}.`,
        urgency: d.overdue || soon ? "now" : "soon", tool: "flock" });
    }
  }

  // Building projects behind schedule.
  for (const p of x.builds) {
    const s = status(p.phases, x.today);
    if (s.behindDays >= 7) out.push({ icon: "🏗️", title: `${p.name} is ${s.behindDays} days behind`, detail: `${Math.round(s.actual)}% built against ${Math.round(s.planned)}% planned. Finish now ${s.finish}.`, urgency: "soon", tool: "build" });
  }

  // Fields: a nudge for anything just planted.
  for (const f of x.fields) {
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
