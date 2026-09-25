// Classifies OpenStreetMap infrastructure into categories and measures it.
import type { OsmElement } from "../data/overpass";
import { haversine } from "../data/mercator";

export type InfraCategory = "roads" | "rail" | "power" | "pipelines" | "water" | "transport" | "telecom";

export const CATEGORIES: { id: InfraCategory; label: string; color: string; about: string }[] = [
  { id: "roads", label: "Major roads", color: "#f4d35e", about: "Motorways, trunk, primary and secondary roads" },
  { id: "rail", label: "Railways", color: "#e07a5f", about: "Rail, light rail and subway lines" },
  { id: "power", label: "Power", color: "#ff5d8f", about: "Transmission lines, power plants and substations" },
  { id: "pipelines", label: "Pipelines", color: "#b388eb", about: "Oil, gas, water and other pipelines" },
  { id: "water", label: "Water", color: "#4cc9f0", about: "Dams, canals, water and wastewater works, water towers" },
  { id: "transport", label: "Hubs", color: "#80ed99", about: "Airports, railway stations, ferry terminals and ports" },
  { id: "telecom", label: "Telecom", color: "#adb5bd", about: "Communication masts and towers" },
];

export function categoryOf(tags: Record<string, string>): InfraCategory | null {
  if (/^(motorway|trunk|primary|secondary)$/.test(tags.highway ?? "")) return "roads";
  if (/^(rail|light_rail|subway|narrow_gauge)$/.test(tags.railway ?? "")) return "rail";
  if (tags.power && /^(line|minor_line|cable|plant|substation)$/.test(tags.power)) return "power";
  if (tags.man_made === "pipeline") return "pipelines";
  if (tags.waterway === "dam" || tags.waterway === "canal" || /^(water_works|wastewater_plant|water_tower|reservoir_covered|pumping_station)$/.test(tags.man_made ?? "")) return "water";
  if (tags.aeroway === "aerodrome" || tags.railway === "station" || tags.amenity === "ferry_terminal" || tags.landuse === "port" || tags.industrial === "port") return "transport";
  if (/^(mast|communications_tower)$/.test(tags.man_made ?? "") || tags["tower:type"] === "communication") return "telecom";
  return null;
}

/** True for linear features (drawn as lines and measured by length). */
export function isLinear(e: OsmElement): boolean {
  const t = e.tags ?? {};
  if (e.type !== "way" || !e.geometry || e.geometry.length < 2) return false;
  return Boolean(t.highway || (t.railway && t.railway !== "station") || /^(line|minor_line|cable)$/.test(t.power ?? "") || t.man_made === "pipeline" || t.waterway === "canal");
}

/**
 * Length of a way in metres. With `within`, only segments whose midpoint lies
 * inside that circle count, so features crossing the survey edge aren't overcounted.
 */
export function lengthMeters(e: OsmElement, within?: { lon: number; lat: number; radius: number }): number {
  const g = e.geometry ?? [];
  let d = 0;
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1], b = g[i];
    if (within && haversine(within.lon, within.lat, (a.lon + b.lon) / 2, (a.lat + b.lat) / 2) > within.radius) continue;
    d += haversine(a.lon, a.lat, b.lon, b.lat);
  }
  return d;
}

/** Power plant energy source, normalised ("solar", "gas", "hydro", …). */
export function plantSource(tags: Record<string, string>): string {
  return (tags["plant:source"] ?? tags["generator:source"] ?? "unknown").split(";")[0].replace(/_/g, " ");
}

/** Electrical output in megawatts from "plant:output:electricity" ("250 MW", "1.2 GW", "800"). */
export function plantMegawatts(tags: Record<string, string>): number | null {
  const raw = tags["plant:output:electricity"];
  if (!raw) return null;
  const m = raw.trim().match(/^([\d.,]+)\s*(kW|MW|GW|W)?/i);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  if (!Number.isFinite(v)) return null;
  const unit = (m[2] ?? "MW").toUpperCase();
  return unit === "GW" ? v * 1000 : unit === "KW" ? v / 1000 : unit === "W" ? v / 1e6 : v;
}
