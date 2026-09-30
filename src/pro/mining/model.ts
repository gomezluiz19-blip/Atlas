// Mining Pro: a mine run on the map, and its licence to operate. Its sites
// (pit, plant, tailings, camp, sidings, ports, smelters), the chain that moves
// ore and concentrate to market, what a year's production is worth, the towns
// and people around it (and those downhill of the tailings dam), the groups it
// answers to with their grievances, the permits that keep it open, and recent
// earthquakes nearby. Pure functions; the screens in ui.ts.
import { kmBetween, type Dated, type Move, type Party, type Site } from "../kit/ops";
import type { Commitment, Grievance } from "./social";

export interface Economics {
  /** Ore mined and processed, million tonnes a year. */
  oreMt: number;
  /** Grade: percent metal (copper, zinc…) or grams a tonne (gold, silver). */
  grade: number;
  gradeUnit: "%" | "g/t";
  /** Share of the metal the plant recovers, percent. */
  recovery: number;
  /** Share the buyer pays for, percent. */
  payable: number;
  /** Price, USD per tonne of metal (for %) or per troy ounce (for g/t). */
  price: number;
  /** All-in cost to mine and process, USD per tonne of ore. */
  costPerT: number;
}
export interface Mine {
  id: string; name: string; commodity: string; country?: string;
  sites: Site[]; moves: Move[]; parties: Party[]; issues: Grievance[]; permits: Dated[];
  commitments?: Commitment[];
  econ: Economics;
  created: number; demo?: boolean;
}

export const SITE_KINDS = {
  pit: { label: "Open pit", emoji: "⛏" }, underground: { label: "Underground", emoji: "🕳" }, plant: { label: "Processing plant", emoji: "🏭" },
  tailings: { label: "Tailings dam", emoji: "🌊" }, waste: { label: "Waste dump", emoji: "⛰" }, camp: { label: "Camp", emoji: "🏕" },
  airstrip: { label: "Airstrip", emoji: "🛬" }, siding: { label: "Rail siding", emoji: "🚆" }, port: { label: "Port", emoji: "⚓" },
  smelter: { label: "Smelter or refinery", emoji: "🔥" }, office: { label: "Office", emoji: "🏢" }, supplier: { label: "Supplier", emoji: "🚚" },
  community: { label: "Community", emoji: "🏘" }, government: { label: "Government", emoji: "🏛" },
};
export const PARTY_KINDS = {
  community: { label: "Community", emoji: "🏘" }, leader: { label: "Traditional leadership", emoji: "🪶" }, government: { label: "Government or regulator", emoji: "🏛" },
  ngo: { label: "NGO", emoji: "🌱" }, union: { label: "Union", emoji: "👷" }, buyer: { label: "Buyer", emoji: "💼" }, landholder: { label: "Landholder", emoji: "🌾" }, investor: { label: "Investor", emoji: "📈" },
};
export const PERMIT_KINDS = ["licence", "environment", "water", "explosives", "land", "export", "other"] as const;

const OZ = 31.1035;

/** A year's production and what it's worth (pure). */
export function economics(e: Economics) {
  const ore = e.oreMt * 1e6;
  if (e.gradeUnit === "g/t") {
    const containedOz = (ore * e.grade) / OZ;
    const recoveredOz = containedOz * (e.recovery / 100);
    const payableOz = recoveredOz * (e.payable / 100);
    const revenue = payableOz * e.price, cost = ore * e.costPerT;
    return { contained: containedOz, recovered: recoveredOz, unit: "oz", revenue, cost, margin: revenue - cost, perTOre: revenue / ore, breakeven: cost / Math.max(1, payableOz) };
  }
  const contained = (ore * e.grade) / 100;
  const recovered = contained * (e.recovery / 100);
  const payable = recovered * (e.payable / 100);
  const revenue = payable * e.price, cost = ore * e.costPerT;
  return { contained, recovered, unit: "t", revenue, cost, margin: revenue - cost, perTOre: revenue / ore, breakeven: cost / Math.max(1, payable) };
}

/** Towns and cities within `km` of a point, nearest first ([lon, lat, population] points; pure). */
export function townsNear(points: [number, number, number][], at: { lon: number; lat: number }, km: number) {
  const out: { lon: number; lat: number; people: number; km: number }[] = [];
  const dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos((at.lat * Math.PI) / 180)));
  for (const [lon, lat, people] of points) {
    if (Math.abs(lat - at.lat) > dLat || Math.abs(lon - at.lon) > dLon) continue;
    const d = kmBetween(at, { lon, lat });
    if (d <= km) out.push({ lon, lat, people, km: d });
  }
  return out.sort((a, b) => a.km - b.km);
}

/**
 * Downhill of a dam: the places lower than it within reach, which is where
 * a failure would go first (pure; heights in metres, same order as places).
 */
export function downhill<T extends { people: number; km: number }>(damHeight: number, places: T[], heights: number[], margin = 5) {
  const below = places.map((p, i) => ({ ...p, drop: damHeight - (heights[i] ?? damHeight) })).filter((p) => p.drop > margin);
  return { places: below, people: below.reduce((s, p) => s + p.people, 0), nearest: below.sort((a, b) => a.km - b.km)[0] };
}

/** Earthquakes within `km` of the mine, strongest first (pure). */
export function quakesNear<T extends { lon: number; lat: number; mag: number }>(quakes: T[], at: { lon: number; lat: number }, km = 300) {
  return quakes.map((q) => ({ ...q, km: kmBetween(at, q) })).filter((q) => q.km <= km).sort((a, b) => b.mag - a.mag);
}

/** The mine's main site: the pit (or underground, or the first site). */
export const mainSite = (m: Mine) => m.sites.find((s) => s.kind === "pit") ?? m.sites.find((s) => s.kind === "underground") ?? m.sites[0];

/** "USD 1.2 bn", "USD 340 m". */
/** "$597m", "$1.2bn": for tiles. */
export function usdShort(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(1)}bn` : a >= 1e6 ? `${s}$${Math.round(a / 1e6)}m` : `${s}$${Math.round(a / 1e3)}k`;
}

export function usd(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  return a >= 1e9 ? `${s}USD ${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)} bn` : a >= 1e6 ? `${s}USD ${Math.round(a / 1e6)} m` : `${s}USD ${Math.round(a).toLocaleString()}`;
}
