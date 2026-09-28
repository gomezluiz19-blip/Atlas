// Sorts OpenStreetMap water features into the parts of a city's water system
// (open channels, buried ones, drains, stormwater basins, supply, wastewater)
// and measures them.
import type { OsmElement } from "../data/overpass";

export type CityWaterKind = "river" | "stream" | "canal" | "drain" | "basin" | "supply" | "wastewater" | "pipe" | "control";

export const CITY_WATER: Record<CityWaterKind, { label: string; color: string; about: string }> = {
  river: { label: "Rivers", color: "#0a84ff", about: "Rivers and tidal channels" },
  stream: { label: "Streams", color: "#64d2ff", about: "Small natural channels, including ones buried in culverts" },
  canal: { label: "Canals", color: "#5e5ce6", about: "Channels dug for boats, supply or drainage" },
  drain: { label: "Drains & ditches", color: "#30b0c7", about: "Channels that carry stormwater away" },
  basin: { label: "Stormwater basins", color: "#34c759", about: "Ponds and basins that hold back floodwater" },
  supply: { label: "Water supply", color: "#007aff", about: "Water works, towers, covered reservoirs, wells and pumping stations" },
  wastewater: { label: "Wastewater", color: "#a2845e", about: "Sewage treatment plants and sewage pumping" },
  pipe: { label: "Water & sewer mains", color: "#8e8e93", about: "Mapped water, sewage and rainwater pipelines" },
  control: { label: "Dams, weirs & gates", color: "#ff9f0a", about: "Structures that hold back or control the flow" },
};

export interface CityWaterFeature {
  el: OsmElement;
  kind: CityWaterKind;
  name: string;
  /** Buried: in a culvert, tunnel or pipe. */
  underground: boolean;
  /** Length in metres (lines only). */
  length: number;
  /** [lon, lat] pairs for lines. */
  line: [number, number][] | null;
  point: [number, number] | null;
}

export function classify(t: Record<string, string>): CityWaterKind | null {
  const w = t.waterway ?? "", mm = t.man_made ?? "";
  if (w === "river" || w === "tidal_channel") return "river";
  if (w === "stream") return "stream";
  if (w === "canal") return "canal";
  if (w === "drain" || w === "ditch") return "drain";
  if (/^(dam|weir|lock_gate|sluice_gate)$/.test(w)) return "control";
  if (mm === "wastewater_plant" || (mm === "pumping_station" && /sewage|wastewater/.test(t.substance ?? t["pumping_station"] ?? ""))) return "wastewater";
  if (mm === "pipeline") return /water|sewage|rain/.test(t.substance ?? "") ? "pipe" : null;
  if (/^(water_works|water_tower|reservoir_covered|water_well|pumping_station)$/.test(mm)) return "supply";
  if (t.landuse === "basin" || /retention|detention|infiltration|stormwater/.test(t.basin ?? "")) return "basin";
  return null;
}

/**
 * Buried: in a culvert or tunnel, or mapped as underground. (Not `layer=-1`
 * alone: rivers are often tagged that way just where they pass under bridges.)
 */
export function isUnderground(t: Record<string, string>): boolean {
  return Boolean(t.tunnel && t.tunnel !== "no") || t.location === "underground" || t.man_made === "pipeline";
}

const R = 6_371_000;
export function lineLength(pts: [number, number][]): number {
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const k = Math.PI / 180;
    const a = Math.sin(((y2 - y1) * k) / 2) ** 2 + Math.cos(y1 * k) * Math.cos(y2 * k) * Math.sin(((x2 - x1) * k) / 2) ** 2;
    m += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return m;
}

export function toFeatures(els: OsmElement[]): CityWaterFeature[] {
  const out: CityWaterFeature[] = [];
  for (const el of els) {
    const t = el.tags ?? {};
    const kind = classify(t);
    if (!kind) continue;
    const geom = el.geometry?.map((g) => [g.lon, g.lat] as [number, number]) ?? null;
    const isLine = el.type === "way" && geom && geom.length > 1 && /river|stream|canal|drain|pipe/.test(kind);
    const point: [number, number] | null =
      el.lat !== undefined && el.lon !== undefined ? [el.lon, el.lat]
        : el.center ? [el.center.lon, el.center.lat]
          : geom?.length ? [geom.reduce((s, p) => s + p[0], 0) / geom.length, geom.reduce((s, p) => s + p[1], 0) / geom.length] : null;
    out.push({
      el, kind, name: t.name ?? "",
      underground: isUnderground(t),
      line: isLine ? geom : null,
      length: isLine ? lineLength(geom!) : 0,
      point,
    });
  }
  return out;
}

export interface CityWaterSummary {
  /** Metres of open and buried channel by kind. */
  open: Record<"river" | "stream" | "canal" | "drain", number>;
  buried: number;
  counts: Record<CityWaterKind, number>;
  pipeLength: number;
  /** Named rivers and canals, longest first. */
  mainChannels: string[];
}

export function summarize(fs: CityWaterFeature[]): CityWaterSummary {
  const open = { river: 0, stream: 0, canal: 0, drain: 0 };
  let buried = 0, pipeLength = 0;
  const counts = Object.fromEntries(Object.keys(CITY_WATER).map((k) => [k, 0])) as Record<CityWaterKind, number>;
  const named = new Map<string, number>();
  for (const f of fs) {
    counts[f.kind]++;
    if (f.kind === "pipe") pipeLength += f.length;
    else if (f.kind in open) {
      if (f.underground) buried += f.length;
      else open[f.kind as keyof typeof open] += f.length;
      if (f.name && (f.kind === "river" || f.kind === "canal")) named.set(f.name, (named.get(f.name) ?? 0) + f.length);
    }
  }
  const mainChannels = [...named.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  return { open, buried, counts, pipeLength, mainChannels };
}
