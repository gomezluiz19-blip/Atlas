// A rock section that works anywhere on Earth. Where Macrostrat has a
// stratigraphic column, layers are stacked and fitted to the bedrock map
// (see analysis/geosection). Elsewhere the section is built from the rocks
// mapped at the surface, each extended to a typical depth for its kind above
// the crystalline basement. Under the sea: water, sediment, oceanic crust.
// Every section says how it was made.
import { buildStack, fitStructure, layerIndexAt, type SurfaceObservation } from "../analysis/geosection";
import { zoomForSpacing } from "../analysis/profile";
import { elevation } from "../data/elevation";
import { mapLimit } from "../data/http";
import { fetchColumn, fetchMapUnit, formatAge, lithologySummary, type MapUnit } from "../data/macrostrat";
import { haversine } from "../data/mercator";
import { lithPattern, patternFor, type PatternKind } from "../ui/lithology";

export interface GeoLayer { key: string; name: string; age: string; color: string; pattern: PatternKind; about: string }

export interface Section {
  points: [number, number][];
  distance: Float64Array;
  elevation: Float32Array;
  /** Lowest elevation drawn, metres. */
  bottom: number;
  layers: GeoLayer[];
  /** Index into layers at (x metres along, elevation metres); -1 is air. */
  at(x: number, z: number): number;
  method: "column" | "surface" | "ocean" | "generic";
  note: string;
}

const WATER: GeoLayer = { key: "water", name: "Sea water", age: "", color: "#2b6cb0", pattern: "none", about: "The ocean above the seafloor" };
const SEDIMENT: GeoLayer = { key: "sed", name: "Seafloor sediment", age: "", color: "#b9a98a", pattern: patternFor("mud"), about: "Mud and the shells of tiny plankton, settling for millions of years" };
const OCEAN_CRUST: GeoLayer = { key: "ocrust", name: "Oceanic crust (basalt)", age: "", color: "#4a4f57", pattern: patternFor("basalt"), about: "Dark volcanic rock made at mid-ocean ridges, about 7 km thick" };
const BASEMENT: GeoLayer = { key: "basement", name: "Crystalline basement (inferred)", age: "", color: "#8d8a86", pattern: patternFor("granite"), about: "Ancient granite and gneiss that underlie the continents" };
const REGOLITH: GeoLayer = { key: "regolith", name: "Soil and loose sediment", age: "", color: "#c8b48a", pattern: patternFor("sand"), about: "No bedrock map here: the surface layer, drawn schematically" };

/** How deep a surface unit is drawn, from its rock type (metres). */
function typicalDepth(lith: string): number {
  const t = lith.toLowerCase();
  if (/alluv|glacial|till|sand|gravel|unconsolidated|colluv|eolian|loess/.test(t)) return 80;
  if (/granit|gneiss|schist|plutonic|intrusive|metamorph|quartzite|diorite|gabbro/.test(t)) return Infinity;
  if (/basalt|volcanic|andesite|rhyolite|tuff|lava/.test(t)) return 900;
  return 1600; // sedimentary rock
}

const mapLayer = (u: MapUnit): GeoLayer => ({
  key: `m${u.map_id}`, name: u.name || u.strat_name || "Mapped bedrock", age: u.best_int_name ?? (u.b_age ? formatAge(u.b_age) : ""),
  color: u.color || "#a89f91", pattern: patternFor(u.lith), about: u.lith ?? u.descrip ?? "",
});

export interface SectionOptions { samples?: number; surfaceSamples?: number }

/** Builds a section along a line of points. */
export async function buildSection(points: [number, number][], opts: SectionOptions = {}): Promise<Section> {
  const n = points.length, S = opts.surfaceSamples ?? 24;
  const distance = new Float64Array(n);
  for (let i = 1; i < n; i++) distance[i] = distance[i - 1] + haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  const L = distance[n - 1], mid = points[n >> 1];
  const heights = await elevation.sample(points, zoomForSpacing(L / (n - 1), mid[1]));
  let zmin = Infinity, zmax = -Infinity;
  for (const v of heights) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); }
  const ground = (x: number) => heights[Math.min(n - 1, Math.max(0, Math.round((x / L) * (n - 1))))];
  const base = { points, distance, elevation: heights };

  // Under the sea.
  if (zmax < 0) {
    const bottom = zmin - Math.max(2500, (0 - zmin) * 0.6);
    const layers = [WATER, SEDIMENT, OCEAN_CRUST];
    return {
      ...base, bottom, layers, method: "ocean",
      note: "Schematic: the seafloor from elevation data; sediment and crust at typical oceanic thicknesses.",
      at: (x, z) => {
        const g = ground(x);
        if (z > g) return z <= 0 ? 0 : -1;
        const d = g - z;
        return d < 500 ? 1 : 2;
      },
    };
  }

  const bottom = zmin - Math.max(600, (zmax - zmin) * 0.7);
  // Bedrock mapped along the line.
  const { scale } = await fetchMapUnit(mid[0], mid[1]).catch(() => ({ unit: null, scale: null }));
  const idx = Array.from({ length: S }, (_, k) => Math.round((k / (S - 1)) * (n - 1)));
  const mapped = scale ? await mapLimit(idx, 6, async (i) => (await fetchMapUnit(points[i][0], points[i][1], scale).catch(() => ({ unit: null }))).unit) : idx.map(() => null);

  // 1. A stratigraphic column, fitted to the map.
  const units = await fetchColumn(mid[0], mid[1]).catch(() => []);
  if (units.length) {
    const stack = buildStack(units);
    const obs: SurfaceObservation[] = [];
    idx.forEach((i, k) => { const u = mapped[k]; if (u) obs.push({ x: distance[i], z: heights[i], unitIds: u.macro_units ?? [] }); });
    const fit = fitStructure(stack, obs, L, zmax);
    const layers: GeoLayer[] = [...stack.map((l) => ({
      key: `u${l.unit.unit_id}`, name: l.unit.strat_name_long ?? l.unit.unit_name, age: `${formatAge(l.unit.b_age)} – ${formatAge(l.unit.t_age)}`,
      color: l.unit.color || "#a89f91", pattern: patternFor(l.unit.lith), about: lithologySummary(l.unit),
    })), BASEMENT];
    const water = heights.some((v) => v < 0);
    if (water) layers.push(WATER);
    return {
      ...base, bottom, layers, method: "column",
      note: fit.method === "fit" ? `Layers from Macrostrat's column, fitted to ${fit.used} mapped outcrops.` : "Layers from Macrostrat's column; their position is approximate here.",
      at: (x, z) => {
        const g = ground(x);
        if (z > g) return water && z <= 0 ? layers.length - 1 : -1;
        return Math.min(stack.length, layerIndexAt(stack, fit.structure, x, z));
      },
    };
  }

  // 2. The surface geology, extended down.
  const segs: { x0: number; x1: number; layer: number; depth: number }[] = [];
  const layers: GeoLayer[] = [];
  idx.forEach((i, k) => {
    const u = mapped[k];
    if (!u) return;
    let li = layers.findIndex((l) => l.key === `m${u.map_id}`);
    if (li < 0) { layers.push(mapLayer(u)); li = layers.length - 1; }
    const x0 = k === 0 ? 0 : (distance[idx[k - 1]] + distance[i]) / 2, x1 = k === S - 1 ? L : (distance[i] + distance[idx[k + 1]]) / 2;
    const last = segs[segs.length - 1];
    if (last && last.layer === li) last.x1 = x1;
    else segs.push({ x0, x1, layer: li, depth: typicalDepth(`${u.lith ?? ""} ${u.name}`) });
  });
  if (segs.length) {
    layers.push(BASEMENT);
    const b = layers.length - 1;
    return {
      ...base, bottom, layers, method: "surface",
      note: "Rocks from the bedrock map at the surface, each drawn to a typical depth for its kind: the deeper structure is inferred, not measured.",
      at: (x, z) => {
        const g = ground(x);
        if (z > g) return -1;
        const s = segs.find((q) => x >= q.x0 && x <= q.x1) ?? segs[segs.length - 1];
        return g - z < s.depth ? s.layer : b;
      },
    };
  }

  // 3. Nothing mapped: soil over basement.
  return {
    ...base, bottom, layers: [REGOLITH, BASEMENT], method: "generic",
    note: "No bedrock map covers this line, so only a schematic soil layer over basement is drawn.",
    at: (x, z) => { const g = ground(x); return z > g ? -1 : g - z < 30 ? 0 : 1; },
  };
}

const rgb = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/**
 * Paints a section: `bottom` in the last row up to the highest ground in the first.
 * With `skyTop`, rows above the ground are transparent (for 2D figures); otherwise
 * each column runs from its own ground (for 3D walls).
 */
export function paintSection(sec: Section, W: number, H: number, mode: "wall" | "figure" = "wall", highlight: number | null = null): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const n = sec.distance.length, L = sec.distance[n - 1];
  let top = -Infinity;
  for (const v of sec.elevation) top = Math.max(top, v);
  if (mode === "figure") top += (top - sec.bottom) * 0.08;
  const img = g.createImageData(W, H);
  const cols = sec.layers.map((l) => rgb(l.color));
  const masks = sec.layers.map(() => new Uint8ClampedArray(W * H));
  for (let px = 0; px < W; px++) {
    const x = (px / (W - 1)) * L;
    const k = Math.min(n - 1, Math.round((x / L) * (n - 1)));
    const colTop = mode === "wall" ? Math.max(sec.elevation[k], 0) : top;
    for (let py = 0; py < H; py++) {
      const z = colTop - (py / (H - 1)) * (colTop - sec.bottom);
      const i = sec.at(x, z);
      const o = (py * W + px) * 4;
      if (i < 0) { img.data[o + 3] = mode === "wall" ? 255 : 0; if (mode === "wall") { img.data[o] = 200; img.data[o + 1] = 190; img.data[o + 2] = 170; } continue; }
      const dim = highlight !== null && i !== highlight ? 0.35 : 1;
      const cc = cols[i];
      img.data[o] = cc[0] * dim + 20 * (1 - dim);
      img.data[o + 1] = cc[1] * dim + 24 * (1 - dim);
      img.data[o + 2] = cc[2] * dim + 32 * (1 - dim);
      img.data[o + 3] = 255;
      masks[i][py * W + px] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Rock patterns, each clipped to its layer.
  sec.layers.forEach((l, i) => {
    const pat = lithPattern(g, l.pattern, 1.4);
    if (!pat) return;
    const m = document.createElement("canvas");
    m.width = W; m.height = H;
    const mg = m.getContext("2d")!;
    const md = mg.createImageData(W, H);
    let any = false;
    for (let p = 0; p < W * H; p++) if (masks[i][p]) { md.data[p * 4 + 3] = 255; any = true; }
    if (!any) return;
    mg.putImageData(md, 0, 0);
    mg.globalCompositeOperation = "source-in";
    mg.fillStyle = pat;
    mg.fillRect(0, 0, W, H);
    g.globalAlpha = highlight !== null && i !== highlight ? 0.3 : 0.9;
    g.drawImage(m, 0, 0);
    g.globalAlpha = 1;
  });
  return c;
}
