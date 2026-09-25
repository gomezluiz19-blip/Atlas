// Geology from Macrostrat (https://macrostrat.org), CC-BY 4.0:
// stratigraphic columns (what rock lies below a point, layer by layer) and
// bedrock geologic maps (what rock is at the surface).
import { getJson } from "./http";

const API = "https://macrostrat.org/api/v2";
export const GEOLOGIC_MAP_TILES = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";

export interface Lithology {
  name: string;
  type?: string;
  class?: string;
  prop?: number;
}

/** One unit (layer) of a stratigraphic column. */
export interface StratUnit {
  unit_id: number;
  col_id: number;
  unit_name: string;
  strat_name_long?: string;
  Fm?: string;
  Gp?: string;
  /** Age of the top and bottom of the unit, millions of years ago. */
  t_age: number;
  b_age: number;
  t_int_name?: string;
  b_int_name?: string;
  max_thick: number;
  min_thick: number;
  lith: Lithology[];
  environ?: { name: string; class?: string; type?: string }[];
  econ?: { name: string; type?: string; class?: string }[];
  color: string;
}

/** A polygon of a bedrock geologic map. */
export interface MapUnit {
  map_id: number;
  name: string;
  strat_name?: string;
  lith?: string;
  descrip?: string;
  age?: string;
  best_int_name?: string;
  t_age?: number;
  b_age?: number;
  color: string;
  macro_units?: number[];
}

interface Envelope<T> {
  success?: { data: T[] };
  error?: { message: string };
}

export type MapScale = "large" | "medium" | "small" | "tiny";
const SCALES: MapScale[] = ["large", "medium", "small", "tiny"];

const round = (v: number) => v.toFixed(4);

/** The stratigraphic column at a point, youngest (top) unit first. Empty if Macrostrat has no column here. */
export async function fetchColumn(lon: number, lat: number): Promise<StratUnit[]> {
  const url = `${API}/units?lat=${round(lat)}&lng=${round(lon)}&response=long`;
  const body = await getJson<Envelope<StratUnit>>("Macrostrat", url);
  const units = body.success?.data ?? [];
  return units
    .map((u) => ({ ...u, lith: u.lith ?? [], color: normaliseColor(u.color) }))
    .sort((a, b) => a.t_age - b.t_age || a.b_age - b.b_age);
}

/** Bedrock at a point from the most detailed map available (or one fixed scale). */
export async function fetchMapUnit(lon: number, lat: number, scale?: MapScale): Promise<{ unit: MapUnit | null; scale: MapScale | null }> {
  for (const s of scale ? [scale] : SCALES) {
    const url = `${API}/geologic_units/map?lat=${round(lat)}&lng=${round(lon)}&scale=${s}`;
    const body = await getJson<Envelope<MapUnit>>("Macrostrat", url);
    const unit = body.success?.data?.[0];
    if (unit) return { unit: { ...unit, color: normaliseColor(unit.color) }, scale: s };
  }
  return { unit: null, scale: null };
}

function normaliseColor(c: string | undefined): string {
  if (!c) return "#b9b2a4";
  return c.startsWith("#") ? c : `#${c}`;
}

/** Representative thickness of a unit in metres (Macrostrat reports a min/max range). */
export function unitThickness(u: StratUnit): number {
  const max = Number(u.max_thick) || 0, min = Number(u.min_thick) || 0;
  if (max > 0 && min > 0) return (max + min) / 2;
  return max || min || 0;
}

export function lithologySummary(u: { lith: Lithology[] }): string {
  return u.lith
    .slice()
    .sort((a, b) => (b.prop ?? 0) - (a.prop ?? 0))
    .map((l) => l.name)
    .slice(0, 3)
    .join(", ");
}

export function formatAge(ma: number): string {
  if (ma >= 1000) return `${(ma / 1000).toFixed(2)} billion years`;
  if (ma >= 1) return `${Math.round(ma)} million years`;
  if (ma >= 0.001) return `${Math.round(ma * 1000).toLocaleString()} years`;
  return "present";
}
