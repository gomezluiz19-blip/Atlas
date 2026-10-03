// The soil under a field, layer by layer, from ISRIC SoilGrids (250 m, CC BY
// 4.0): its texture (sand, silt, clay), acidity, organic carbon, how much water
// it holds for roots, how fast rain soaks in, and what it suits (pure).

export const DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"] as const;
export type Depth = (typeof DEPTHS)[number];
export const DEPTH_CM: Record<Depth, [number, number]> = { "0-5cm": [0, 5], "5-15cm": [5, 15], "15-30cm": [15, 30], "30-60cm": [30, 60], "60-100cm": [60, 100], "100-200cm": [100, 200] };

export interface Layer { depth: Depth; sand: number; silt: number; clay: number; ph: number; soc: number; /** Bulk density, g/cm³. */ bd?: number; nitrogen?: number }

/** Reads a SoilGrids "properties/query" answer into layers (values to %, pH, g/kg, g/cm³), pure. */
export function readSoilGrids(json: unknown): Layer[] {
  const props = (json as { properties?: { layers?: { name: string; unit_measure?: { d_factor?: number }; depths: { label: string; values: { mean: number | null } }[] }[] } })?.properties?.layers ?? [];
  const get = (name: string, depth: string) => {
    const p = props.find((x) => x.name === name);
    const v = p?.depths.find((d) => d.label === depth)?.values.mean;
    return v == null ? null : v / (p?.unit_measure?.d_factor ?? 1);
  };
  const out: Layer[] = [];
  for (const d of DEPTHS) {
    const clay = get("clay", d), sand = get("sand", d), silt = get("silt", d), ph = get("phh2o", d), soc = get("soc", d);
    if (clay == null || sand == null || silt == null) continue;
    // After each property's d_factor: texture in %, pH in pH units, organic carbon in g/kg, bulk density in g/cm³, nitrogen in g/kg.
    out.push({ depth: d, clay, sand, silt, ph: ph ?? 6.5, soc: soc ?? 5, bd: get("bdod", d) ?? undefined, nitrogen: get("nitrogen", d) ?? undefined });
  }
  return out;
}

/** USDA texture class from sand, silt and clay (%), pure. */
export function textureClass(sand: number, silt: number, clay: number): string {
  if (clay >= 40 && silt < 40 && sand <= 45) return "Clay";
  if (clay >= 40 && silt >= 40) return "Silty clay";
  if (clay >= 35 && sand > 45) return "Sandy clay";
  if (clay >= 27 && clay < 40 && sand <= 20) return "Silty clay loam";
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return "Clay loam";
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return "Sandy clay loam";
  if (silt >= 80 && clay < 12) return "Silt";
  if (silt >= 50 && clay < 27) return "Silt loam";
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return "Loam";
  if (silt + 1.5 * clay < 15) return "Sand";
  if (silt + 2 * clay < 30) return "Loamy sand";
  return "Sandy loam";
}

/** Water a texture holds for roots (mm per metre of soil) and how fast water soaks in (mm/h): rounded textbook values (Rawls et al., 1982). */
const WATER: Record<string, [number, number]> = {
  Sand: [50, 120], "Loamy sand": [70, 60], "Sandy loam": [110, 25], Loam: [160, 13], "Silt loam": [200, 7], Silt: [200, 6],
  "Sandy clay loam": [130, 4], "Clay loam": [150, 2.3], "Silty clay loam": [170, 1.5], "Sandy clay": [110, 1.2], "Silty clay": [150, 0.9], Clay: [130, 0.6],
};
export const waterOf = (cls: string) => WATER[cls] ?? [140, 8];

export interface SoilRead {
  top: string;
  layers: (Layer & { cls: string; from: number; to: number; awc: number; ksat: number })[];
  /** Water held for roots in the top metre, mm. */
  awc: number;
  drainage: "fast" | "good" | "slow" | "poor";
  ph: number;
  phText: string;
  carbon: number;
  carbonText: string;
  suits: string[];
}

/** What the layers add up to for a grower (pure). Organic matter raises the water held a little (about 1.5 mm/m per g/kg of carbon). */
export function readSoil(layers: Layer[]): SoilRead | null {
  if (!layers.length) return null;
  const ls = layers.map((l) => {
    const cls = textureClass(l.sand, l.silt, l.clay), [awcPerM, ksat] = waterOf(cls), [from, to] = DEPTH_CM[l.depth];
    return { ...l, cls, from, to, awc: Math.round(((awcPerM + Math.min(30, l.soc * 1.5)) * Math.max(0, Math.min(to, 100) - from)) / 100), ksat };
  });
  const awc = ls.reduce((a, l) => a + l.awc, 0);
  const slowest = Math.min(...ls.filter((l) => l.from < 100).map((l) => l.ksat));
  const drainage = slowest >= 25 ? "fast" : slowest >= 5 ? "good" : slowest >= 1.5 ? "slow" : "poor";
  const top = ls[0], ph = Math.round(((ls[0].ph + (ls[1]?.ph ?? ls[0].ph)) / 2) * 10) / 10;
  const carbon = Math.round(((ls[0].soc + (ls[1]?.soc ?? ls[0].soc)) / 2) * 10) / 10;
  const phText = ph < 5.5 ? "strongly acid: lime it for most crops" : ph < 6.2 ? "slightly acid" : ph <= 7.3 ? "about neutral: suits most crops" : ph <= 8 ? "alkaline" : "strongly alkaline";
  const carbonText = carbon >= 30 ? "rich in organic matter" : carbon >= 12 ? "healthy organic matter" : carbon >= 6 ? "modest organic matter" : "low organic matter: compost and cover crops help";
  const suits: string[] = [];
  const sandy = top.sand >= 60, clayey = top.clay >= 35;
  if (ph >= 6 && ph <= 7.5 && !sandy && drainage !== "poor") suits.push("wheat", "maize", "soybeans", "barley");
  if (ph < 6) suits.push("potatoes", "blueberries", "oats");
  if (sandy) suits.push("carrots", "asparagus", "peanuts", "vines");
  if (clayey || drainage === "poor") suits.push("rice", "pasture", "brassicas");
  if (ph > 7.3) suits.push("barley", "sugar beet", "lucerne");
  if (!suits.length) suits.push("pasture", "maize");
  return { top: top.cls, layers: ls, awc, drainage, ph, phText, carbon, carbonText, suits: [...new Set(suits)].slice(0, 6) };
}

/** Days of dry weather the root zone's water lasts at a daily evaporation (mm), from full (pure). */
export const dryDays = (awcMm: number, etMm = 5, rootCm = 100) => Math.round(((awcMm * Math.min(100, rootCm)) / 100) * 0.5 / etMm);

/** Hours for a rain of `mm` to soak down to `cm` (pure): the slowest layer on the way sets the pace; water fills the pore space it holds. */
export function soakHours(s: SoilRead, mm: number, cm: number): number | null {
  let t = 0, left = mm;
  for (const l of s.layers) {
    if (l.from >= cm) break;
    const thick = Math.min(l.to, cm) - l.from;
    const store = (thick / 100) * (waterOf(l.cls)[0] * 0.6);
    if (left <= store) return Math.round((t + (left / Math.max(0.1, l.ksat))) * 10) / 10;
    left -= store;
    t += (thick * 10) / Math.max(0.1, l.ksat) / 4;
  }
  return Math.round(t * 10) / 10;
}
