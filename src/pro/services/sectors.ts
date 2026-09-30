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
    market: { how: "world", label: "Every mine: Atlas's major mines and Wikidata's operating mines", load: () => worldMines().then((ms) => ms.map((m) => ({ id: m.id, name: m.name, lon: m.lon, lat: m.lat, country: m.country, tags: [...m.commodities, ...(m.method ? [m.method] : [])], detail: m.operator }))) },
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
