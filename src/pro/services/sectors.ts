// Field Network's sectors. The same engine (sites, installed equipment,
// technicians, travel, jobs, parts, coverage, pipeline) serves any company
// that sells to and services many sites; each sector brings its own
// equipment and service intervals, the site condition that matters most to
// it, where its prospects come from, and a demo at real places.
//   Mining equipment and services · Farm machinery dealers · Wind, solar and
//   power plant O&M · Medical equipment · Telecom towers · Construction and
//   crane rental · Sports facilities and equipment
import { getJson } from "../../data/http";
import { overpass } from "../../data/overpass";
import { powerPlants } from "../../data/infra";
import { addDays, kmBetween, today } from "../kit/ops";
import { newId } from "../../work/store";
import { MONTHS, type Conditions } from "./conditions";
import { worldMines } from "./market";
import type { Account, Asset, Company, Depot, Opportunity, Tech, Vertical } from "./network";

export interface Prospect { id: string; name: string; lon: number; lat: number; country?: string; tags: string[]; detail?: string }
export interface EquipType { every: number; perDay: number; life: number; power?: Asset["power"] }
export interface Insight { label: string; value: string; lines: string[]; good: boolean }

export interface SectorDef {
  id: Vertical; label: string; who: string; emoji: string;
  site: string; sites: string; machine: string; machines: string;
  /** What the "kind" of a site is called (commodity, crop, fuel…). */
  kind: string;
  types: Record<string, EquipType>;
  /** What the company focuses on, as tags prospects are matched against. */
  focus: string[]; methods: string[];
  insight: (x: Conditions, a: Account, c: Company) => Insight;
  market: { how: "world"; label: string; load: (c: Company) => Promise<Prospect[]> } | { how: "view"; label: string; query: (bbox: string) => string; read: (tags: Record<string, string>) => { name: string; tags: string[] } | null };
  demo: () => Company;
}

const months = (ms: number[]) => (ms.length ? ms.map((m) => MONTHS[m]).join(", ") : "none");
/** Consecutive months (wrapping the year) as "Oct–Mar" (pure). */
export function span(ms: number[]): string {
  if (!ms.length) return "none";
  if (ms.length === 12) return "all year";
  const set = new Set(ms);
  const start = ms.find((m) => !set.has((m + 11) % 12)) ?? ms[0];
  let end = start;
  while (set.has((end + 1) % 12) && (end + 1) % 12 !== start) end = (end + 1) % 12;
  return start === end ? MONTHS[start] : `${MONTHS[start]}–${MONTHS[end]}`;
}

// ---- Insights: the one thing each sector reads from a site's conditions ---------------------------

/** Farming: the growing season, when planting starts (with the rains in the tropics), and when to service before the rush (pure). */
export function farmSeason(x: Conditions): Insight {
  const cl = x.climate;
  if (!cl) return { label: "Season", value: "—", lines: [], good: true };
  const grow = cl.months.map((m, i) => (m.tmin >= 5 && m.tmax >= 15 ? i : -1)).filter((i) => i >= 0);
  const rainy = grow.filter((i) => cl.months[i].rain >= 80);
  const tropical = grow.length >= 11;
  const plant = tropical && rainy.length ? rainy.find((i) => !rainy.includes((i + 11) % 12)) ?? rainy[0] : grow.find((i) => !grow.includes((i + 11) % 12)) ?? grow[0];
  if (plant === undefined) return { label: "Season", value: "none", lines: ["No frost-free growing months in the record."], good: false };
  const service = (plant + 11) % 12;
  return {
    label: "Service by", value: MONTHS[service], good: true,
    lines: [
      tropical ? `Warm all year; planting follows the rains, which start around ${MONTHS[plant]} (${span(rainy)}).` : `Growing season ${span(grow)}; planting from about ${MONTHS[plant]}.`,
      `Service tractors, planters and sprayers in ${MONTHS[service]}, before the rush; harvesters before harvest, about four months after planting (${MONTHS[(plant + 4) % 12]}).`,
    ],
  };
}

/** Power plants: the months with a good weather window for maintenance (dry, not too hot or cold; pure). */
export function workWindow(x: Conditions): Insight {
  const cl = x.climate;
  if (!cl) return { label: "Work window", value: "—", lines: [], good: true };
  const ok = cl.months.map((m, i) => (m.rain < 60 && m.tmax < 35 && m.tmin > -10 ? i : -1)).filter((i) => i >= 0);
  return {
    label: "Good months", value: String(ok.length), good: ok.length >= 4,
    lines: [
      ok.length ? `Best months for planned maintenance (dry, workable temperatures): ${months(ok)}.` : "No month is reliably dry and mild: plan around short windows.",
      cl.hottest > 40 ? `Monthly highs near ${Math.round(cl.hottest)} °C: inverters and electronics derate in the heat.` : "",
      cl.coldest < -15 ? `Lows near ${Math.round(cl.coldest)} °C: blade icing and cold-weather kits.` : "",
    ].filter(Boolean),
  };
}

/** Hospitals: power reliability (distance to the grid), and heat for scanner rooms and cold chains (pure). */
export function clinicPower(x: Conditions): Insight {
  const weak = !x.grid || x.grid.km > 40;
  return {
    label: "Power", value: weak ? "backup" : "grid", good: !weak,
    lines: [
      weak ? `The nearest large power station is ${x.grid ? `${Math.round(x.grid.km)} km` : "far"} away: expect outages; MRI, CT and cold chains need UPS and generator backup.` : `A large power station ${Math.round(x.grid!.km)} km away: grid supply likely stable.`,
      x.climate && x.climate.hottest > 32 ? `Monthly highs near ${Math.round(x.climate.hottest)} °C: scanner rooms and cold stores need cooling with headroom.` : "",
      x.climate?.wetMonths.length ? `Wet ${months(x.climate.wetMonths)}: engineer visits and deliveries slow down.` : "",
    ].filter(Boolean),
  };
}

/** Towers: on or off grid, and how often generators need fuel (pure). */
export function towerFuel(x: Conditions, a: Account, c: Company): Insight {
  const off = !x.grid || x.grid.km > 30;
  const gens = c.assets.filter((m) => m.account === a.id && /generator/i.test(m.type));
  const perDay = gens.length ? gens.reduce((s, g) => s + g.perDay, 0) / gens.length : off ? 16 : 3;
  const litres = perDay * 3; // a 20 kVA set burns about 3 litres an hour at typical load
  const days = Math.max(1, Math.round(1000 / Math.max(1, litres)));
  return {
    label: "Fuel run", value: `${days} d`, good: days > 10,
    lines: [
      off ? "Off grid (no large power station within 30 km): the generator carries the site." : "Grid nearby: the generator is backup.",
      `At about ${Math.round(perDay)} generator hours a day, a 1,000-litre tank lasts about ${days} days.`,
      x.climate?.wetMonths.length ? `Wet ${months(x.climate.wetMonths)}: stock fuel ahead; roads slow down.` : "",
    ].filter(Boolean),
  };
}

/** Building sites: weeks lost to rain, heat and cold in a year (pure). */
export function lostWeeks(x: Conditions): Insight {
  const cl = x.climate;
  if (!cl) return { label: "Weeks lost", value: "—", lines: [], good: true };
  const wet = cl.months.reduce((s, m) => s + (m.rain > 100 ? Math.min(3, m.rain / 100) : 0), 0);
  const hot = cl.months.filter((m) => m.tmax > 38).length, cold = cl.months.filter((m) => m.tmin < -5).length;
  const weeks = Math.round(wet + hot * 1 + cold * 1.5);
  return {
    label: "Weeks lost", value: `~${weeks}`, good: weeks < 6,
    lines: [
      cl.wetMonths.length ? `Rain: wet ${months(cl.wetMonths)}; cranes stand in high wind and lightning.` : "Dry year-round.",
      hot ? `${hot} ${hot === 1 ? "month" : "months"} over 38 °C: midday work stops.` : "",
      cold ? `${cold} ${cold === 1 ? "month" : "months"} below −5 °C at night: concrete needs winter measures.` : "",
      `Allow about ${weeks} weeks a year of weather downtime when renting cranes and plant.`,
    ].filter(Boolean),
  };
}

/** Sports: the playing season, and what it means for grass and artificial turf (pure). */
export function playSeason(x: Conditions): Insight {
  const cl = x.climate;
  if (!cl) return { label: "Season", value: "—", lines: [], good: true };
  const play = cl.months.map((m, i) => (m.tmax >= 10 && m.tmax <= 32 && m.rain < 150 ? i : -1)).filter((i) => i >= 0);
  const grow = cl.months.filter((m) => m.tmin >= 6).length;
  return {
    label: "Playing months", value: String(play.length), good: play.length >= 8,
    lines: [
      `Good playing months: ${span(play)}.`,
      grow < 7 ? `Grass grows only about ${grow} months a year here: artificial turf keeps pitches open.` : cl.annualRain > 1500 ? `${Math.round(cl.annualRain)} mm of rain a year: artificial turf drains and stays playable.` : "Natural grass grows most of the year.",
      `Service pitches and floodlights before ${MONTHS[play[0] ?? 0]}.`,
    ],
  };
}

/** Museums and galleries: how hard the building works to hold 20 °C and steady humidity, and when to move art (pure). */
export function artClimate(x: Conditions): Insight {
  const cl = x.climate;
  if (!cl) return { label: "Climate load", value: "—", lines: [], good: true };
  const swing = Math.round(cl.hottest - cl.coldest);
  const humid = cl.months.map((m, i) => (m.rain > 120 && m.tmax > 24 ? i : -1)).filter((i) => i >= 0);
  const calm = cl.months.map((m, i) => (m.rain < 80 && m.tmax < 28 && m.tmin > 0 ? i : -1)).filter((i) => i >= 0);
  return {
    label: "Seasonal swing", value: `${swing} °C`, good: swing < 20 && humid.length < 3,
    lines: [
      `Monthly means swing ${swing} °C between summer and winter: ${swing >= 20 ? "display cases and air handling work hard; check seals and humidity controllers before each season turns." : "a gentle climate for collections."}`,
      humid.length ? `Hot and wet ${months(humid)}: humidity spikes; service dehumidifiers and case conditioning before then.` : "",
      calm.length ? `Calmest months to crate and move works: ${months(calm)}.` : "No month is calm: move works in climate-controlled trucks only.",
    ].filter(Boolean),
  };
}

/** Garment and textile factories: heat on the floor and how reliable power is (pure). */
export function factoryFloor(x: Conditions): Insight {
  const cl = x.climate;
  const hot = cl ? cl.months.map((m, i) => (m.tmax >= 32 ? i : -1)).filter((i) => i >= 0) : [];
  const weak = !x.grid || x.grid.km > 40;
  return {
    label: "Hot months", value: String(hot.length), good: hot.length < 4 && !weak,
    lines: [
      hot.length ? `Over 32 °C in ${months(hot)}: motors and servo drives run hot and operators slow; clean filters and check cooling first.` : "No month above 32 °C on average.",
      weak ? "Power is weak here (no large station near): stabilisers and backup generators protect machine electronics." : "Grid supply is close: fit surge protection on servo-motor lines.",
      cl?.wetMonths.length ? `Monsoon ${months(cl.wetMonths)}: damp rusts needle bars and hooks; keep spare kits dry and stocked.` : "",
    ].filter(Boolean),
  };
}

/** Arcades, cinemas and venues: power quality and the busy season to service around (pure). */
export function venueSeason(x: Conditions): Insight {
  const cl = x.climate;
  const weak = !x.grid || x.grid.km > 40;
  const hot = cl ? cl.months.map((m, i) => (m.tmax >= 30 ? i : -1)).filter((i) => i >= 0) : [];
  return {
    label: "Power", value: weak ? "backup" : "grid", good: !weak,
    lines: [
      weak ? "Weak grid nearby: brownouts corrupt cabinet storage and kill power supplies; UPS on every bank." : "Grid supply close by.",
      hot.length ? `Hot ${months(hot)}: crowds come in for air conditioning and cabinets run hot; clean fans and service before.` : "",
      "Busy weeks: school holidays and the year-end; do upgrades and swaps before them, not during.",
    ].filter(Boolean),
  };
}

/** Buildings: the cooling and heating seasons, and when to service each before it starts (pure). */
export function buildingSeasons(x: Conditions): Insight {
  const cl = x.climate;
  if (!cl) return { label: "Seasons", value: "—", lines: [], good: true };
  const cool = cl.months.map((m, i) => (m.tmax >= 27 ? i : -1)).filter((i) => i >= 0);
  const heat = cl.months.map((m, i) => (m.tmin <= 5 ? i : -1)).filter((i) => i >= 0);
  const before = (ms: number[]) => MONTHS[((ms.find((m) => !ms.includes((m + 11) % 12)) ?? ms[0]) + 11) % 12];
  return {
    label: "Cooling months", value: String(cool.length), good: cool.length < 7,
    lines: [
      cool.length ? `Cooling season ${span(cool)}: service chillers and rooftop units in ${before(cool)}.` : "Little need for cooling.",
      heat.length ? `Heating season ${span(heat)}: boilers and heat pumps checked in ${before(heat)}.` : "Little need for heating.",
      cl.wetMonths.length ? `Wet ${months(cl.wetMonths)}: roofs, gutters and drains before then; leaks follow.` : "",
    ].filter(Boolean),
  };
}

/** Surveys and façade inspections: the dry, calm months for drones and scanners (pure). */
export function surveyWindow(x: Conditions): Insight {
  const cl = x.climate;
  if (!cl) return { label: "Survey months", value: "—", lines: [], good: true };
  const ok = cl.months.map((m, i) => (m.rain < 70 && m.tmax < 38 && m.tmax > 2 ? i : -1)).filter((i) => i >= 0);
  return {
    label: "Survey months", value: String(ok.length), good: ok.length >= 6,
    lines: [
      ok.length ? `Dry, workable months for drones, scanners and rope access: ${months(ok)}.` : "No reliably dry month: book short windows and plan for re-flights.",
      cl.hottest > 40 ? `Highs near ${Math.round(cl.hottest)} °C: scanners and drone batteries overheat after midday; fly at dawn.` : "",
      x.alt > 2500 ? `At ${Math.round(x.alt)} m, thin air shortens drone flight times by about ${Math.round((1 - x.density) * 100)}%.` : "",
    ].filter(Boolean),
  };
}

/** Kitchens, shops and data rooms: how hard the cooling works in the hottest month, and when to service before it (pure). */
export function coolingLoad(x: Conditions, what: string): Insight {
  const cl = x.climate;
  if (!cl) return { label: "Peak heat", value: "—", lines: [], good: true };
  const hot = cl.months.map((m, i) => (m.tmax >= 30 ? i : -1)).filter((i) => i >= 0);
  const free = cl.months.filter((m) => m.tmax < 18).length;
  const first = hot.find((m) => !hot.includes((m + 11) % 12)) ?? hot[0];
  return {
    label: "Peak heat", value: `${Math.round(cl.hottest)} °C`, good: cl.hottest < 32,
    lines: [
      hot.length ? `Over 30 °C in ${months(hot)}: ${what} run hardest and fail most; service condensers and check refrigerant in ${MONTHS[((first ?? 0) + 11) % 12]}.` : `Highs stay under 30 °C: ${what} have an easy year.`,
      free ? `${free} months cool enough (under 18 °C) for free cooling with outside air.` : "",
      !x.grid || x.grid.km > 40 ? "Weak grid: power cuts spoil stock and crash systems; backup power is part of the service." : "",
    ].filter(Boolean),
  };
}

/** Mining: battery-electric readiness (already scored with the site's conditions). */
const minesInsight = (x: Conditions): Insight => ({ label: "Electric-ready", value: String(x.electric.score), good: x.electric.score >= 60, lines: [`Battery-electric: ${x.electric.reasons.join("; ")}.`] });

// ---- Demos -----------------------------------------------------------------------------------------

type SiteRow = [name: string, site: string, lon: number, lat: number, country: string, kind: string, sla?: number];
type BaseRow = [name: string, lon: number, lat: number, kind: Depot["kind"]];

/** A demo company from a few rows: equipment spread over the sites by a fixed pattern (pure). */
export function makeDemo(v: Vertical, name: string, types: Record<string, EquipType>, sites: SiteRow[], bases: BaseRow[], people: [string, string][], mix: [string, number][], deals: [string, number, Opportunity["stage"], number][]): Company {
  const t0 = today();
  const accounts: Account[] = sites.map(([n, site, lon, lat, country, kind, sla]) => ({ id: newId(), name: n, site, lon, lat, country, commodity: kind, stage: "production", slaHours: sla, contacts: [{ name: "Site manager (demo)", role: "Operations" }] }));
  const assets: Asset[] = [];
  let k = 0;
  accounts.forEach((a, ai) => {
    for (const [type, per] of mix) {
      const n = Math.max(1, Math.round(per * (0.6 + ((ai * 7) % 5) / 5)));
      for (let i = 0; i < n; i++, k++) {
        const t = types[type];
        const ageYears = 0.6 + ((k * 7) % 11) * 0.6;
        const hours = Math.round(t.perDay * 365 * ageYears * 0.85);
        const since = Math.round(t.every * (((k * 13) % 10) / 9) * 1.1);
        assets.push({ id: newId(), account: a.id, type, model: `${type.split(" ").map((w) => w[0]).join("").toUpperCase()}-${100 + ((k * 37) % 900)}`, serial: `S${String(10_000 + k * 173).slice(-5)}`,
          installed: addDays(t0, -Math.round(ageYears * 365)), hours, asOf: addDays(t0, -2), perDay: t.perDay, serviceEvery: t.every, lastService: Math.max(0, hours - since), lifeHours: t.life,
          warrantyUntil: ageYears < 2 ? addDays(t0, 15 + ((k * 11) % 80)) : undefined, status: k % 19 === 4 ? "down" : k % 13 === 6 ? "standby" : "running", power: t.power });
      }
    }
  });
  const depots: Depot[] = bases.map(([n, lon, lat, kind]) => ({ id: newId(), name: n, lon, lat, kind, stock: kind === "factory" ? undefined : Object.keys(types).slice(0, 2).map((ty, i) => ({ part: `${ty} service kit`, qty: 3 + ((i * 5 + n.length) % 9), perMonth: 1.5 + i })) }));
  const techs: Tech[] = people.map(([n, base], i) => { const b = bases.find((x) => x[0].includes(base)) ?? bases[0]; return { id: newId(), name: `${n} (demo)`, base, lon: b[1], lat: b[2], skills: Object.keys(types).filter((_, j) => (i + j) % 3 !== 2), available: i % 4 !== 3 }; });
  const down = assets.filter((a) => a.status === "down");
  const jobs = down.map((a, i) => ({ id: newId(), account: a.account, asset: a.id, kind: "breakdown" as const, priority: 1 as const, opened: addDays(t0, -(i % 3)), status: "open" as const, part: `${a.type} service kit` }));
  const opps: Opportunity[] = deals.map(([product, value, stage, ai]) => ({ id: newId(), product, value, stage, close: addDays(t0, stage === "won" ? -15 : 30 + ai * 20), account: accounts[ai % accounts.length].id }));
  return { id: newId(), name, vertical: v, demo: true, created: Date.now(), slaHours: 24, offer: { types: Object.keys(types), methods: [], commodities: [] }, accounts, assets, techs, depots, jobs, opps };
}

// ---- The sectors -----------------------------------------------------------------------------------

const viewPlaces = (sel: string) => (bbox: string) => `[out:json][timeout:40];(${sel.split(";").filter(Boolean).map((s) => `${s}(${bbox});`).join("")});out center tags 1500;`;

let hospitals: Promise<Prospect[]> | null = null;

export const SECTORS: Record<Vertical, SectorDef> = {
  mining: {
    id: "mining", label: "Mining equipment and services", who: "a company selling to and servicing mines", emoji: "⛏",
    site: "mine", sites: "mines", machine: "machine", machines: "machines", kind: "Commodity",
    types: { "Haul truck": { every: 500, perDay: 19, life: 90_000 }, "Drill rig": { every: 250, perDay: 16, life: 60_000 }, "Underground loader": { every: 250, perDay: 17, life: 40_000 }, Crusher: { every: 1000, perDay: 20, life: 150_000 }, Automation: { every: 2000, perDay: 24, life: 60_000 } },
    focus: ["copper", "gold", "iron", "lithium", "zinc", "nickel"], methods: ["open pit", "underground"],
    insight: minesInsight,
    market: { how: "world", label: "Every mine: Terreno's major mines and Wikidata's operating mines", load: () => worldMines().then((ms) => ms.map((m) => ({ id: m.id, name: m.name, lon: m.lon, lat: m.lat, country: m.country, tags: [...m.commodities, ...(m.method ? [m.method] : [])], detail: m.operator }))) },
    demo: () => { throw new Error("mining demo lives in demo.ts"); },
  },
  agriculture: {
    id: "agriculture", label: "Farm machinery and irrigation", who: "a dealer or maker of tractors, harvesters and irrigation", emoji: "🌾",
    site: "farm", sites: "farms", machine: "machine", machines: "machines", kind: "Crop",
    types: { Tractor: { every: 500, perDay: 5, life: 12_000 }, "Combine harvester": { every: 250, perDay: 6, life: 8_000 }, Planter: { every: 300, perDay: 3, life: 6_000 }, "Centre-pivot irrigation": { every: 2000, perDay: 12, life: 60_000, power: "electric" } },
    focus: ["soy", "maize", "cotton"], methods: [],
    insight: (x) => farmSeason(x),
    market: { how: "view", label: "Farmyards on OpenStreetMap in the map view", query: viewPlaces('nwr["landuse"="farmyard"]'), read: (t) => ({ name: t.name ?? "Farm", tags: [t.crop, t.produce].filter(Boolean) as string[] }) },
    demo: () => makeDemo("agriculture", "Cerrado Farm Machinery (demo)", SECTORS.agriculture.types, [
      ["Soy and maize farm (demo)", "Sorriso", -55.72, -12.55, "Brazil", "soy"], ["Soy farm (demo)", "Lucas do Rio Verde", -55.9, -13.05, "Brazil", "soy"], ["Cotton farm (demo)", "Sinop", -55.5, -11.86, "Brazil", "cotton"],
      ["Soy and cotton farm (demo)", "Rondonópolis", -54.64, -16.47, "Brazil", "cotton"], ["Maize farm (demo)", "Rio Verde", -50.93, -17.8, "Brazil", "maize"], ["Soy farm (demo)", "Luís Eduardo Magalhães", -45.79, -12.1, "Brazil", "soy", 48],
    ], [["Dealership, Cuiabá", -56.1, -15.6, "service centre"], ["Dealership, Rio Verde", -50.93, -17.8, "service centre"], ["Factory, Curitiba", -49.27, -25.43, "factory"]],
      [["Ana P.", "Cuiabá"], ["Bruno S.", "Cuiabá"], ["Carla M.", "Rio Verde"], ["Diego F.", "Rio Verde"]],
      [["Tractor", 4], ["Combine harvester", 2], ["Planter", 2], ["Centre-pivot irrigation", 1]],
      [["Harvester fleet upgrade (3)", 2_400_000, "proposal", 0], ["Irrigation expansion (6 pivots)", 900_000, "qualified", 4], ["Precision planting retrofit", 350_000, "negotiation", 2], ["Tractors (5)", 1_600_000, "won", 1]]),
  },
  energy: {
    id: "energy", label: "Wind, solar and power plant O&M", who: "a company maintaining turbines, inverters and plant", emoji: "🌬",
    site: "plant", sites: "power plants", machine: "unit", machines: "units", kind: "Fuel",
    types: { "Wind turbine": { every: 4380, perDay: 22, life: 175_000, power: "electric" }, Inverter: { every: 8760, perDay: 12, life: 87_600, power: "electric" }, Transformer: { every: 8760, perDay: 24, life: 350_000, power: "electric" }, "Gas turbine": { every: 8000, perDay: 20, life: 200_000 } },
    focus: ["wind", "solar"], methods: [],
    insight: (x) => workWindow(x),
    market: { how: "world", label: "Power stations worldwide (Global Power Plant Database)", load: () => powerPlants().then((ps) => ps.map((p, i) => ({ id: `pp${i}`, name: p.name, lon: p.lon, lat: p.lat, country: p.country, tags: [p.fuel.toLowerCase(), p.mw >= 100 ? "large" : "small"], detail: `${Math.round(p.mw)} MW ${p.fuel.toLowerCase()}` }))) },
    demo: () => makeDemo("energy", "Harmattan Renewables O&M (demo)", SECTORS.energy.types, [
      ["Wind farm (demo)", "Lake Turkana, Kenya", 36.82, 2.52, "Kenya", "wind", 48], ["Solar complex (demo)", "Noor Ouarzazate, Morocco", -6.86, 31.03, "Morocco", "solar"],
      ["Wind farm (demo)", "Tarfaya, Morocco", -12.93, 27.94, "Morocco", "wind"], ["Wind farm (demo)", "Jeffreys Bay, South Africa", 24.9, -34.05, "South Africa", "wind"],
      ["Solar park (demo)", "De Aar, South Africa", 24.01, -30.65, "South Africa", "solar"], ["Solar park (demo)", "Benban, Egypt", 32.75, 24.45, "Egypt", "solar"],
    ], [["Service centre, Nairobi", 36.82, -1.29, "service centre"], ["Service centre, Casablanca", -7.59, 33.57, "service centre"], ["Service centre, Cape Town", 18.42, -33.92, "service centre"], ["Parts depot, Cairo", 31.24, 30.04, "parts depot"]],
      [["Wanjiru K.", "Nairobi"], ["Youssef B.", "Casablanca"], ["Sipho D.", "Cape Town"], ["Mariam H.", "Cairo"], ["Otieno M.", "Nairobi"]],
      [["Wind turbine", 6], ["Inverter", 3], ["Transformer", 1]],
      [["Full-service contract, 10 years", 18_000_000, "negotiation", 0], ["Blade repair campaign", 1_200_000, "proposal", 3], ["Inverter retrofit", 2_600_000, "qualified", 1], ["Annual inspection", 400_000, "won", 4]]),
  },
  medical: {
    id: "medical", label: "Medical equipment", who: "a maker or servicer of scanners, ventilators and cold chains", emoji: "🏥",
    site: "hospital", sites: "hospitals", machine: "device", machines: "devices", kind: "Facility",
    types: { "MRI scanner": { every: 1000, perDay: 12, life: 50_000, power: "electric" }, "CT scanner": { every: 1000, perDay: 12, life: 40_000, power: "electric" }, "X-ray unit": { every: 2000, perDay: 8, life: 40_000, power: "electric" }, Ventilator: { every: 5000, perDay: 10, life: 50_000, power: "electric" }, "Vaccine fridge": { every: 4380, perDay: 24, life: 87_600, power: "electric" } },
    focus: ["Kenya", "Uganda", "Tanzania"], methods: [],
    insight: (x) => clinicPower(x),
    market: { how: "world", label: "Hospitals on Wikidata", load: () => (hospitals ??= getJson<{ results: { bindings: Record<string, { value: string }>[] } }>("Wikidata", `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent('SELECT ?h ?hLabel ?coord ?countryLabel WHERE { ?h wdt:P31 wd:Q16917; wdt:P625 ?coord. OPTIONAL { ?h wdt:P17 ?country } SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } LIMIT 20000')}`, { headers: { Accept: "application/sparql-results+json" } }, 60_000)
      .then((b) => b.results.bindings.flatMap((r) => { const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coord?.value ?? ""); return m && r.hLabel && !/^Q\d+$/.test(r.hLabel.value) ? [{ id: r.h.value.split("/").pop()!, name: r.hLabel.value, lon: Number(m[1]), lat: Number(m[2]), country: r.countryLabel?.value, tags: [r.countryLabel?.value ?? ""] }] : []; }))
      .catch((e) => { hospitals = null; throw e; })) },
    demo: () => makeDemo("medical", "Equator Medical Systems (demo)", SECTORS.medical.types, [
      ["Referral hospital (demo)", "Nairobi", 36.81, -1.3, "Kenya", "referral", 12], ["County hospital (demo)", "Kisumu", 34.77, -0.09, "Kenya", "county"], ["Teaching hospital (demo)", "Eldoret", 35.27, 0.52, "Kenya", "teaching"],
      ["County hospital (demo)", "Garissa", 39.65, -0.45, "Kenya", "county", 48], ["Coast hospital (demo)", "Mombasa", 39.67, -4.05, "Kenya", "county"], ["National hospital (demo)", "Kampala", 32.58, 0.35, "Uganda", "referral"],
      ["Regional hospital (demo)", "Arusha", 36.68, -3.37, "Tanzania", "regional"], ["Referral hospital (demo)", "Dar es Salaam", 39.28, -6.8, "Tanzania", "referral"],
    ], [["Service centre, Nairobi", 36.82, -1.29, "service centre"], ["Parts depot, Dar es Salaam", 39.28, -6.82, "parts depot"], ["Office, Kampala", 32.58, 0.35, "office"]],
      [["Achieng O.", "Nairobi"], ["Baraka M.", "Nairobi"], ["Neema J.", "Dar es Salaam"], ["Okello P.", "Kampala"]],
      [["X-ray unit", 2], ["Ventilator", 3], ["Vaccine fridge", 3], ["CT scanner", 1]],
      [["MRI and CT for a new wing", 3_800_000, "proposal", 0], ["Ventilator fleet refresh", 900_000, "qualified", 3], ["Cold-chain service contract", 250_000, "negotiation", 6], ["X-ray (2)", 300_000, "won", 1]]),
  },
  telecom: {
    id: "telecom", label: "Telecom towers", who: "a tower company or a servicer of generators, batteries and radios", emoji: "📡",
    site: "tower site", sites: "tower sites", machine: "unit", machines: "units", kind: "Site type",
    types: { Generator: { every: 250, perDay: 14, life: 40_000 }, "Battery bank": { every: 2000, perDay: 24, life: 43_800, power: "battery-electric" }, Rectifier: { every: 8760, perDay: 24, life: 87_600, power: "electric" }, "Radio unit": { every: 8760, perDay: 24, life: 87_600, power: "electric" } },
    focus: [], methods: [],
    insight: (x, a, c) => towerFuel(x, a, c),
    market: { how: "view", label: "Communication towers and masts on OpenStreetMap in the map view", query: viewPlaces('nwr["tower:type"="communication"];nwr["man_made"="mast"]'), read: (t) => ({ name: t.name ?? (t.operator ? `${t.operator} tower` : "Tower"), tags: [t.operator ?? ""].filter(Boolean) }) },
    demo: () => makeDemo("telecom", "Savanna Tower Services (demo)", SECTORS.telecom.types, [
      ["Cluster, Lagos (demo)", "Lagos", 3.38, 6.52, "Nigeria", "urban", 6], ["Cluster, Ibadan (demo)", "Ibadan", 3.95, 7.38, "Nigeria", "urban", 8], ["Cluster, Abuja (demo)", "Abuja", 7.49, 9.06, "Nigeria", "urban", 8],
      ["Cluster, Kano (demo)", "Kano", 8.52, 12.0, "Nigeria", "rural", 12], ["Cluster, Enugu (demo)", "Enugu", 7.5, 6.44, "Nigeria", "rural", 12], ["Cluster, Maiduguri (demo)", "Maiduguri", 13.16, 11.85, "Nigeria", "rural", 24],
      ["Cluster, Sokoto (demo)", "Sokoto", 5.24, 13.06, "Nigeria", "rural", 24], ["Cluster, Port Harcourt (demo)", "Port Harcourt", 7.03, 4.82, "Nigeria", "urban", 8],
    ], [["Hub, Lagos", 3.38, 6.52, "service centre"], ["Hub, Abuja", 7.49, 9.06, "service centre"], ["Hub, Kano", 8.52, 12.0, "service centre"]],
      [["Chinedu A.", "Lagos"], ["Funke O.", "Lagos"], ["Ibrahim S.", "Abuja"], ["Musa D.", "Kano"], ["Ngozi E.", "Abuja"]],
      [["Generator", 4], ["Battery bank", 3], ["Rectifier", 2], ["Radio unit", 3]],
      [["Solar-hybrid conversion (40 sites)", 3_200_000, "proposal", 5], ["Battery swap programme", 1_100_000, "qualified", 3], ["Managed services renewal", 6_500_000, "negotiation", 0]]),
  },
  construction: {
    id: "construction", label: "Construction and crane rental", who: "a crane and plant rental or servicing company", emoji: "🏗",
    site: "job site", sites: "job sites", machine: "machine", machines: "machines", kind: "Project",
    types: { "Tower crane": { every: 500, perDay: 10, life: 60_000, power: "electric" }, "Mobile crane": { every: 500, perDay: 8, life: 40_000 }, Excavator: { every: 500, perDay: 8, life: 30_000 }, "Concrete pump": { every: 250, perDay: 6, life: 20_000 } },
    focus: [], methods: [],
    insight: (x) => lostWeeks(x),
    market: { how: "view", label: "Construction sites on OpenStreetMap in the map view", query: viewPlaces('nwr["landuse"="construction"];nwr["building"="construction"]'), read: (t) => ({ name: t.name ?? (t.construction ? `${t.construction} (under construction)` : "Construction site"), tags: [t.construction ?? ""].filter(Boolean) }) },
    demo: () => makeDemo("construction", "Lone Star Lift & Plant (demo)", SECTORS.construction.types, [
      ["Hospital tower (demo)", "Houston", -95.37, 29.76, "United States", "healthcare"], ["Office tower (demo)", "Dallas", -96.8, 32.78, "United States", "commercial"], ["Apartments (demo)", "Austin", -97.74, 30.27, "United States", "residential"],
      ["Stadium works (demo)", "San Antonio", -98.49, 29.42, "United States", "leisure"], ["Logistics park (demo)", "Fort Worth", -97.33, 32.75, "United States", "industrial"], ["Refinery expansion (demo)", "Corpus Christi", -97.4, 27.8, "United States", "industrial", 12],
    ], [["Yard, Houston", -95.37, 29.76, "service centre"], ["Yard, Dallas", -96.8, 32.78, "service centre"]],
      [["Luis G.", "Houston"], ["Jake M.", "Houston"], ["Tanya R.", "Dallas"], ["Omar K.", "Dallas"]],
      [["Tower crane", 1], ["Mobile crane", 1], ["Excavator", 2], ["Concrete pump", 1]],
      [["Two tower cranes, 18 months", 1_400_000, "proposal", 1], ["Excavator fleet hire", 600_000, "qualified", 4], ["Crane service contract", 250_000, "won", 0]]),
  },
  sports: {
    id: "sports", label: "Sports facilities and equipment", who: "a maker or installer of turf, floodlights and equipment", emoji: "🏟",
    site: "venue", sites: "venues", machine: "installation", machines: "installations", kind: "Sport",
    types: { "Artificial turf pitch": { every: 200, perDay: 6, life: 20_000 }, Floodlights: { every: 2000, perDay: 4, life: 50_000, power: "electric" }, Scoreboard: { every: 4000, perDay: 6, life: 60_000, power: "electric" }, "Gym equipment": { every: 1000, perDay: 8, life: 30_000 } },
    focus: ["soccer", "artificial_turf"], methods: [],
    insight: (x) => playSeason(x),
    market: { how: "view", label: "Pitches on OpenStreetMap in the map view (with their surface)", query: viewPlaces('nwr["leisure"="pitch"]'), read: (t) => ({ name: t.name ?? `${t.sport ?? "Sports"} pitch`, tags: [t.sport ?? "", t.surface ?? ""].filter(Boolean) }) },
    demo: () => makeDemo("sports", "Pitchline Sports Surfaces (demo)", SECTORS.sports.types, [
      ["Club academy (demo)", "Monterrey", -100.32, 25.69, "Mexico", "soccer"], ["University fields (demo)", "Guadalajara", -103.35, 20.67, "Mexico", "soccer"], ["Municipal complex (demo)", "Puebla", -98.2, 19.04, "Mexico", "soccer"],
      ["Club training ground (demo)", "León", -101.68, 21.12, "Mexico", "soccer"], ["School league fields (demo)", "Querétaro", -100.39, 20.59, "Mexico", "soccer"], ["Stadium (demo)", "Toluca", -99.66, 19.29, "Mexico", "soccer"],
    ], [["Service centre, Mexico City", -99.13, 19.43, "service centre"], ["Warehouse, Monterrey", -100.32, 25.69, "parts depot"]],
      [["Paola R.", "Mexico City"], ["Andrés V.", "Mexico City"], ["Luis T.", "Monterrey"]],
      [["Artificial turf pitch", 2], ["Floodlights", 2], ["Scoreboard", 1], ["Gym equipment", 2]],
      [["Two new turf pitches", 700_000, "proposal", 2], ["LED floodlight upgrade", 250_000, "negotiation", 0], ["Stadium scoreboard", 400_000, "qualified", 5], ["Turf replacement", 350_000, "won", 3]]),
  },
  art: {
    id: "art", label: "Art handling and installation", who: "a fine-art shipper, installer or display-case maker", emoji: "🖼",
    site: "museum", sites: "museums", machine: "installation", machines: "installations", kind: "Collection",
    types: { "Display case": { every: 2000, perDay: 10, life: 80_000, power: "electric" }, "Climate unit": { every: 1000, perDay: 24, life: 60_000, power: "electric" }, "Lighting track": { every: 3000, perDay: 10, life: 50_000, power: "electric" }, "Hanging system": { every: 4000, perDay: 10, life: 100_000 } },
    focus: ["museum", "gallery"], methods: [],
    insight: (x) => artClimate(x),
    market: { how: "view", label: "Museums, galleries and art shops on OpenStreetMap in the map view", query: viewPlaces('nwr["tourism"="museum"];nwr["tourism"="gallery"];nwr["shop"="art"]'), read: (t) => ({ name: t.name ?? "Gallery", tags: [t.tourism ?? t.shop ?? "", t.museum ?? ""].filter(Boolean) }) },
    demo: () => makeDemo("art", "Meridian Fine Art Services (demo)", SECTORS.art.types, [
      ["City museum (demo)", "Paris", 2.35, 48.86, "France", "museum"], ["Contemporary gallery (demo)", "London", -0.12, 51.51, "United Kingdom", "gallery"], ["Art fair halls (demo)", "Basel", 7.6, 47.56, "Switzerland", "fair"],
      ["Biennale pavilions (demo)", "Venice", 12.34, 45.44, "Italy", "gallery"], ["Kunsthalle (demo)", "Berlin", 13.4, 52.52, "Germany", "museum"], ["Fine arts museum (demo)", "Madrid", -3.69, 40.41, "Spain", "museum", 12],
    ], [["Workshop, Paris", 2.35, 48.86, "service centre"], ["Store, London", -0.12, 51.51, "parts depot"]],
      [["Camille D.", "Paris"], ["Hugo M.", "Paris"], ["Priya S.", "London"], ["Tom W.", "London"]],
      [["Display case", 4], ["Climate unit", 2], ["Lighting track", 2], ["Hanging system", 1]],
      [["Rehang, modern wing", 420_000, "proposal", 0], ["Case conditioning upgrade", 260_000, "qualified", 4], ["Fair season install", 180_000, "won", 2]]),
  },
  fashion: {
    id: "fashion", label: "Textile and sewing machinery", who: "a dealer or servicer of sewing, knitting and cutting machines", emoji: "🧵",
    site: "factory", sites: "factories", machine: "machine", machines: "machines", kind: "Product",
    types: { "Lockstitch machine": { every: 500, perDay: 10, life: 30_000, power: "electric" }, "Overlock machine": { every: 500, perDay: 10, life: 30_000, power: "electric" }, "Embroidery machine": { every: 1000, perDay: 16, life: 40_000, power: "electric" }, "Auto cutter": { every: 1000, perDay: 16, life: 50_000, power: "electric" }, "Steam boiler": { every: 2000, perDay: 16, life: 80_000 } },
    focus: ["textile", "clothes"], methods: [],
    insight: (x) => factoryFloor(x),
    market: { how: "view", label: "Garment workshops, tailors and textile works on OpenStreetMap in the map view", query: viewPlaces('nwr["craft"~"tailor|dressmaker|sewing"];nwr["industrial"~"textile|garment|clothing"];nwr["product"~"textile|clothes|garment"]'), read: (t) => ({ name: t.name ?? (t.craft ? `${t.craft}` : "Garment works"), tags: [t.craft ?? "", t.industrial ?? "", t.product ?? ""].filter(Boolean) }) },
    demo: () => makeDemo("fashion", "Delta Stitch Machinery (demo)", SECTORS.fashion.types, [
      ["Knitwear factory (demo)", "Gazipur", 90.41, 23.99, "Bangladesh", "knitwear"], ["Denim plant (demo)", "Narayanganj", 90.5, 23.62, "Bangladesh", "denim"], ["Export garments (demo)", "Savar", 90.26, 23.86, "Bangladesh", "woven"],
      ["Sweater unit (demo)", "Chattogram", 91.82, 22.34, "Bangladesh", "knitwear"], ["Shirt factory (demo)", "Ashulia", 90.33, 23.9, "Bangladesh", "woven"], ["Sportswear (demo)", "Dhaka", 90.41, 23.81, "Bangladesh", "activewear", 8],
    ], [["Service centre, Dhaka", 90.41, 23.81, "service centre"], ["Parts store, Chattogram", 91.82, 22.34, "parts depot"]],
      [["Rafiq H.", "Dhaka"], ["Nasrin A.", "Dhaka"], ["Sohel K.", "Dhaka"], ["Mitu R.", "Chattogram"]],
      [["Lockstitch machine", 12], ["Overlock machine", 6], ["Embroidery machine", 2], ["Auto cutter", 1], ["Steam boiler", 1]],
      [["300 direct-drive machines", 540_000, "negotiation", 0], ["Auto-cutter line", 380_000, "proposal", 2], ["Annual service contract", 120_000, "won", 4]]),
  },
  gaming: {
    id: "gaming", label: "Arcade and venue technology", who: "an operator or servicer of arcade machines, VR and venue screens", emoji: "🕹",
    site: "venue", sites: "venues", machine: "machine", machines: "machines", kind: "Venue",
    types: { "Arcade cabinet": { every: 1000, perDay: 12, life: 40_000, power: "electric" }, "Crane game": { every: 500, perDay: 12, life: 30_000, power: "electric" }, "VR pod": { every: 500, perDay: 10, life: 15_000, power: "electric" }, "LED wall": { every: 2000, perDay: 12, life: 60_000, power: "electric" } },
    focus: ["amusement arcade", "cinema"], methods: [],
    insight: (x) => venueSeason(x),
    market: { how: "view", label: "Arcades, cinemas, bowling and casinos on OpenStreetMap in the map view", query: viewPlaces('nwr["leisure"="amusement_arcade"];nwr["amenity"="cinema"];nwr["leisure"="bowling_alley"];nwr["amenity"="casino"];nwr["leisure"="escape_game"]'), read: (t) => ({ name: t.name ?? "Venue", tags: [t.leisure ?? t.amenity ?? ""].map((v) => v.replace(/_/g, " ")).filter(Boolean) }) },
    demo: () => makeDemo("gaming", "Neon Line Venue Systems (demo)", SECTORS.gaming.types, [
      ["Game centre (demo)", "Akihabara, Tokyo", 139.77, 35.7, "Japan", "arcade"], ["Arcade floor (demo)", "Namba, Osaka", 135.5, 34.66, "Japan", "arcade"], ["VR park (demo)", "Shinjuku, Tokyo", 139.7, 35.69, "Japan", "vr"],
      ["PC bang (demo)", "Hongdae, Seoul", 126.92, 37.56, "South Korea", "esports"], ["Family entertainment (demo)", "Ximending, Taipei", 121.51, 25.04, "Taiwan", "arcade"], ["Cinema complex (demo)", "Nagoya", 136.91, 35.17, "Japan", "cinema"],
    ], [["Service centre, Tokyo", 139.77, 35.68, "service centre"], ["Parts depot, Osaka", 135.5, 34.69, "parts depot"]],
      [["Kenji T.", "Tokyo"], ["Aya M.", "Tokyo"], ["Ryo S.", "Osaka"], ["Min-ji P.", "Tokyo"]],
      [["Arcade cabinet", 8], ["Crane game", 6], ["VR pod", 2], ["LED wall", 1]],
      [["Rhythm-game refresh, 40 cabinets", 300_000, "proposal", 0], ["VR arena fit-out", 650_000, "qualified", 2], ["Prize-machine service plan", 90_000, "won", 4]]),
  },
  realestate: {
    id: "realestate", label: "Property maintenance", who: "a facilities or building-services company looking after many buildings", emoji: "🏢",
    site: "building", sites: "buildings", machine: "system", machines: "systems", kind: "Use",
    types: { Chiller: { every: 1000, perDay: 14, life: 80_000, power: "electric" }, Elevator: { every: 720, perDay: 18, life: 150_000, power: "electric" }, "Rooftop unit": { every: 1000, perDay: 12, life: 60_000, power: "electric" }, "Fire panel": { every: 4380, perDay: 24, life: 120_000, power: "electric" }, Generator: { every: 250, perDay: 0.5, life: 30_000 } },
    focus: ["office", "apartments", "commercial"], methods: [],
    insight: (x) => buildingSeasons(x),
    market: { how: "view", label: "Office, apartment and commercial buildings on OpenStreetMap in the map view", query: viewPlaces('way["building"~"^(office|apartments|commercial|hotel|retail)$"]["name"]'), read: (t) => ({ name: t.name ?? "Building", tags: [t.building ?? ""].filter(Boolean) }) },
    demo: () => makeDemo("realestate", "Harbourline Property Services (demo)", SECTORS.realestate.types, [
      ["Brickell office tower (demo)", "Miami", -80.19, 25.76, "United States", "office"], ["Las Olas apartments (demo)", "Fort Lauderdale", -80.14, 26.12, "United States", "apartments"], ["Downtown hotel (demo)", "Orlando", -81.38, 28.54, "United States", "hotel"],
      ["Water Street offices (demo)", "Tampa", -82.46, 27.95, "United States", "office"], ["Riverside mall (demo)", "Jacksonville", -81.66, 30.33, "United States", "retail"], ["Midtown residences (demo)", "Atlanta", -84.39, 33.78, "United States", "apartments", 6],
    ], [["Service centre, Miami", -80.19, 25.77, "service centre"], ["Depot, Orlando", -81.38, 28.54, "parts depot"]],
      [["Carlos R.", "Miami"], ["Denise W.", "Miami"], ["Andre J.", "Orlando"], ["Kim L.", "Orlando"]],
      [["Chiller", 1], ["Elevator", 3], ["Rooftop unit", 3], ["Fire panel", 1], ["Generator", 1]],
      [["Portfolio maintenance, 12 buildings", 2_400_000, "negotiation", 0], ["Elevator modernisation", 900_000, "proposal", 2], ["Hurricane-season generator plan", 150_000, "won", 4]]),
  },
  architecture: {
    id: "architecture", label: "Surveys and inspection", who: "a surveying, scanning or façade-inspection company", emoji: "📐",
    site: "site", sites: "sites", machine: "instrument", machines: "instruments", kind: "Work",
    types: { "Laser scanner": { every: 500, perDay: 4, life: 10_000, power: "electric" }, "Survey drone": { every: 100, perDay: 2, life: 2_000, power: "electric" }, "Total station": { every: 1000, perDay: 4, life: 15_000, power: "electric" }, "Façade access unit": { every: 500, perDay: 3, life: 30_000, power: "electric" } },
    focus: ["construction", "heritage"], methods: [],
    insight: (x) => surveyWindow(x),
    market: { how: "view", label: "Construction sites and listed buildings on OpenStreetMap in the map view", query: viewPlaces('nwr["building"="construction"];nwr["landuse"="construction"];nwr["heritage"]["building"]'), read: (t) => ({ name: t.name ?? (t.heritage ? "Listed building" : "Construction site"), tags: [t.heritage ? "heritage" : "construction"] }) },
    demo: () => makeDemo("architecture", "Datum Survey & Inspection (demo)", SECTORS.architecture.types, [
      ["Marina towers (demo)", "Dubai", 55.14, 25.08, "United Arab Emirates", "façade"], ["Museum district (demo)", "Abu Dhabi", 54.4, 24.53, "United Arab Emirates", "as-built"], ["Lusail boulevard (demo)", "Doha", 51.52, 25.42, "Qatar", "setting-out"],
      ["King's Road project (demo)", "Riyadh", 46.68, 24.71, "Saudi Arabia", "setting-out"], ["Old souq restoration (demo)", "Muscat", 58.59, 23.61, "Oman", "heritage"], ["Bay tower (demo)", "Manama", 50.58, 26.24, "Bahrain", "façade", 12],
    ], [["Office, Dubai", 55.27, 25.2, "service centre"], ["Office, Riyadh", 46.68, 24.71, "service centre"]],
      [["Arjun N.", "Dubai"], ["Layla H.", "Dubai"], ["Faisal A.", "Riyadh"], ["Marco P.", "Dubai"]],
      [["Laser scanner", 1], ["Survey drone", 2], ["Total station", 1], ["Façade access unit", 1]],
      [["Scan-to-BIM, 6 towers", 480_000, "proposal", 0], ["Annual façade inspections", 220_000, "won", 5], ["Heritage survey", 90_000, "qualified", 4]]),
  },
  food: {
    id: "food", label: "Commercial kitchens and refrigeration", who: "a company that installs and services restaurant kitchens and cold rooms", emoji: "🍳",
    site: "restaurant", sites: "restaurants", machine: "appliance", machines: "appliances", kind: "Cuisine",
    types: { "Walk-in cooler": { every: 2000, perDay: 24, life: 90_000, power: "electric" }, "Combi oven": { every: 1000, perDay: 10, life: 30_000, power: "electric" }, "Ice machine": { every: 1000, perDay: 24, life: 40_000, power: "electric" }, Fryer: { every: 500, perDay: 10, life: 20_000 }, Dishwasher: { every: 1000, perDay: 10, life: 25_000, power: "electric" } },
    focus: ["restaurant", "fast food", "cafe"], methods: [],
    insight: (x) => coolingLoad(x, "walk-ins and ice machines"),
    market: { how: "view", label: "Restaurants, cafés and fast food on OpenStreetMap in the map view", query: viewPlaces('nwr["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]'), read: (t) => ({ name: t.name ?? "Restaurant", tags: [t.amenity?.replace(/_/g, " ") ?? "", t.cuisine ?? ""].filter(Boolean) }) },
    demo: () => makeDemo("food", "Coldline Kitchen Service (demo)", SECTORS.food.types, [
      ["West Loop steakhouse (demo)", "Chicago", -87.65, 41.88, "United States", "steak"], ["Third Ward food hall (demo)", "Milwaukee", -87.91, 43.03, "United States", "food hall"], ["Corktown diner (demo)", "Detroit", -83.07, 42.33, "United States", "american"],
      ["Mass Ave bistro (demo)", "Indianapolis", -86.15, 39.78, "United States", "french"], ["North Loop taqueria (demo)", "Minneapolis", -93.28, 44.99, "United States", "mexican"], ["The Hill trattoria (demo)", "St. Louis", -90.28, 38.62, "United States", "italian", 4],
    ], [["Service centre, Chicago", -87.65, 41.88, "service centre"], ["Parts depot, Indianapolis", -86.15, 39.77, "parts depot"]],
      [["Rosa M.", "Chicago"], ["Dwayne T.", "Chicago"], ["Hector V.", "Chicago"], ["Beth K.", "Indianapolis"]],
      [["Walk-in cooler", 1], ["Combi oven", 2], ["Ice machine", 1], ["Fryer", 2], ["Dishwasher", 1]],
      [["Food-hall kitchen fit-out", 650_000, "proposal", 1], ["Refrigeration maintenance, 20 sites", 180_000, "negotiation", 0], ["Combi oven swap", 75_000, "won", 3]]),
  },
  retail: {
    id: "retail", label: "Store fixtures, checkouts and refrigeration", who: "a company that fits out and services shops and supermarkets", emoji: "🛒",
    site: "store", sites: "stores", machine: "unit", machines: "units", kind: "Format",
    types: { "Refrigerated case": { every: 2000, perDay: 24, life: 90_000, power: "electric" }, "Self-checkout": { every: 2000, perDay: 14, life: 40_000, power: "electric" }, "POS terminal": { every: 4000, perDay: 14, life: 35_000, power: "electric" }, "Shelf labels": { every: 4000, perDay: 24, life: 60_000, power: "electric" } },
    focus: ["supermarket", "convenience"], methods: [],
    insight: (x) => coolingLoad(x, "refrigerated cases"),
    market: { how: "view", label: "Supermarkets, convenience and department stores on OpenStreetMap in the map view", query: viewPlaces('nwr["shop"~"^(supermarket|convenience|department_store|mall|hardware|electronics)$"]'), read: (t) => ({ name: t.name ?? t.brand ?? "Store", tags: [t.shop?.replace(/_/g, " ") ?? "", t.brand ?? ""].filter(Boolean) }) },
    demo: () => makeDemo("retail", "Gôndola Retail Systems (demo)", SECTORS.retail.types, [
      ["Supermarket, Pinheiros (demo)", "São Paulo", -46.69, -23.56, "Brazil", "supermarket"], ["Hypermarket, Barra (demo)", "Rio de Janeiro", -43.36, -23.0, "Brazil", "hypermarket"], ["Supermarket, Savassi (demo)", "Belo Horizonte", -43.94, -19.94, "Brazil", "supermarket"],
      ["Convenience, Batel (demo)", "Curitiba", -49.29, -25.44, "Brazil", "convenience"], ["Supermarket, Moinhos (demo)", "Porto Alegre", -51.2, -30.03, "Brazil", "supermarket"], ["Department store, Asa Sul (demo)", "Brasília", -47.89, -15.81, "Brazil", "department store", 8],
    ], [["Service centre, São Paulo", -46.63, -23.55, "service centre"], ["Depot, Rio de Janeiro", -43.2, -22.91, "parts depot"]],
      [["Thiago A.", "São Paulo"], ["Mariana C.", "São Paulo"], ["Rafael L.", "Rio de Janeiro"], ["Juliana P.", "São Paulo"]],
      [["Refrigerated case", 6], ["Self-checkout", 3], ["POS terminal", 4], ["Shelf labels", 1]],
      [["Self-checkout rollout, 30 stores", 1_200_000, "negotiation", 0], ["Natural-refrigerant cases", 800_000, "proposal", 1], ["POS service contract", 140_000, "won", 3]]),
  },
  tech: {
    id: "tech", label: "Field IT and data centres", who: "a company that installs and services networks, servers and data-centre plant", emoji: "🖥",
    site: "site", sites: "sites", machine: "system", machines: "systems", kind: "Type",
    types: { UPS: { every: 4380, perDay: 24, life: 90_000, power: "electric" }, "Cooling unit": { every: 2000, perDay: 24, life: 90_000, power: "electric" }, Generator: { every: 250, perDay: 0.3, life: 30_000 }, "Network rack": { every: 8760, perDay: 24, life: 60_000, power: "electric" }, "Fire suppression": { every: 4380, perDay: 24, life: 120_000 } },
    focus: ["data center", "it"], methods: [],
    insight: (x) => coolingLoad(x, "cooling units"),
    market: { how: "view", label: "Data centres, telecom exchanges and IT offices on OpenStreetMap in the map view", query: viewPlaces('nwr["telecom"~"data_center|exchange"];nwr["building"="data_center"];nwr["office"~"^(it|telecommunication)$"]'), read: (t) => ({ name: t.name ?? t.operator ?? "Data centre", tags: [(t.telecom ?? t.building ?? t.office ?? "").replace(/_/g, " ")].filter(Boolean) }) },
    demo: () => makeDemo("tech", "Northgrid Field IT (demo)", SECTORS.tech.types, [
      ["Colocation hall (demo)", "Dublin", -6.37, 53.33, "Ireland", "colocation"], ["Edge site (demo)", "Amsterdam", 4.82, 52.35, "Netherlands", "edge"], ["Exchange campus (demo)", "Frankfurt", 8.73, 50.11, "Germany", "colocation"],
      ["Docklands data centre (demo)", "London", 0.0, 51.51, "United Kingdom", "colocation"], ["Enterprise DC (demo)", "Paris", 2.36, 48.92, "France", "enterprise"], ["Cloud region (demo)", "Stockholm", 17.95, 59.4, "Sweden", "hyperscale", 4],
    ], [["Service hub, Amsterdam", 4.9, 52.37, "service centre"], ["Spares, Frankfurt", 8.68, 50.11, "parts depot"]],
      [["Sean O.", "Amsterdam"], ["Femke V.", "Amsterdam"], ["Lukas B.", "Frankfurt"], ["Aoife K.", "Amsterdam"]],
      [["UPS", 2], ["Cooling unit", 3], ["Generator", 1], ["Network rack", 4], ["Fire suppression", 1]],
      [["Liquid-cooling retrofit", 1_600_000, "proposal", 2], ["Edge rollout, 40 sites", 900_000, "qualified", 1], ["Remote-hands contract", 300_000, "won", 0]]),
  },
};

/** Tags in common, ignoring case and underscores (pure). */
const norm = (s: string) => s.toLowerCase().replace(/_/g, " ").trim();
export const overlaps = (a: string[], b: string[]) => a.filter((x) => b.some((y) => norm(y) === norm(x) || norm(y).includes(norm(x))));

/** How well any prospect fits a company (0–100; pure): its focus, the ways it works, and whether a base can reach it in time. */
export function fitProspect(c: Company, p: Prospect, hoursToReach: number) {
  let score = 30;
  const why: string[] = [];
  const focus = overlaps(c.offer.commodities, [...p.tags, p.country ?? ""]);
  if (focus.length) { score += 30; why.push(focus.join(" and ")); }
  else if (!c.offer.commodities.length || !p.tags.length) score += 10;
  const m = overlaps(c.offer.methods, p.tags);
  if (m.length) { score += 20; why.push(m.join(", ")); }
  else if (!c.offer.methods.length) score += 10;
  if (hoursToReach <= c.slaHours) { score += 20; why.push(`reachable in ${Math.round(hoursToReach)} h`); }
  else if (hoursToReach <= c.slaHours * 2) { score += 5; why.push(`${Math.round(hoursToReach)} h from the nearest base`); }
  else { score -= 10; why.push(`${Math.round(hoursToReach)} h away: needs a new base`); }
  return { score: Math.max(0, Math.min(100, score)), why };
}

/** Prospects on OpenStreetMap inside a box, for sectors that find customers in the map view. */
export async function prospectsInView(def: SectorDef, bbox: { w: number; s: number; e: number; n: number }): Promise<Prospect[]> {
  if (def.market.how !== "view") return [];
  const q = def.market.query(`${bbox.s.toFixed(4)},${bbox.w.toFixed(4)},${bbox.n.toFixed(4)},${bbox.e.toFixed(4)}`);
  const els = await overpass(q);
  const read = def.market.read;
  return els.flatMap((e) => {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    const r = e.tags ? read(e.tags) : null;
    return lat !== undefined && lon !== undefined && r ? [{ id: `${e.type}${e.id}`, name: r.name, lon, lat, tags: r.tags }] : [];
  });
}

export const nearKm = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => kmBetween(a, b);

/** A sector's demo with the sector's focus filled in. */
export function sectorDemo(v: Vertical, mining: () => Company): Company {
  const def = SECTORS[v];
  const c = v === "mining" ? mining() : def.demo();
  if (v !== "mining") c.offer = { types: Object.keys(def.types), methods: def.methods, commodities: def.focus };
  return c;
}
