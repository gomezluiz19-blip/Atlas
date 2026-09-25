// Standard-style lithology patterns (after the FGDC geologic map symbols),
// drawn on top of a unit's colour in sections and columns.
import type { Lithology } from "../data/macrostrat";

export type PatternKind =
  | "sandstone" | "conglomerate" | "shale" | "siltstone" | "limestone" | "dolomite"
  | "evaporite" | "coal" | "intrusive" | "volcanic" | "metamorphic" | "unconsolidated" | "none";

const RULES: [RegExp, PatternKind][] = [
  [/conglomerate|breccia/, "conglomerate"],
  [/sandstone|arenite|arkose|quartz sand/, "sandstone"],
  [/siltstone|silt/, "siltstone"],
  [/shale|mudstone|claystone|mud|clay|argillite/, "shale"],
  [/dolomite|dolostone/, "dolomite"],
  [/limestone|carbonate|chalk|marl/, "limestone"],
  [/gypsum|anhydrite|salt|halite|evaporite/, "evaporite"],
  [/coal|lignite/, "coal"],
  [/basalt|andesite|rhyolite|tuff|volcanic|dacite|lava|pyroclastic/, "volcanic"],
  [/granite|granodiorite|diorite|gabbro|plutonic|intrusive|pegmatite|syenite|tonalite/, "intrusive"],
  [/schist|gneiss|quartzite|slate|phyllite|marble|metamorphic|amphibolite|migmatite/, "metamorphic"],
  [/gravel|alluvium|sand|unconsolidated|till|colluvium|loess/, "unconsolidated"],
];

export function patternFor(lith: Lithology[] | string | undefined): PatternKind {
  const text = (typeof lith === "string" ? lith : (lith ?? []).slice().sort((a, b) => (b.prop ?? 0) - (a.prop ?? 0)).map((l) => `${l.name} ${l.type ?? ""} ${l.class ?? ""}`).join(" ")).toLowerCase();
  for (const [re, kind] of RULES) if (re.test(text)) return kind;
  return "none";
}

const cache = new Map<string, CanvasPattern | null>();

/** A repeating pattern of dark marks for a lithology (null for "none"). */
export function lithPattern(ctx: CanvasRenderingContext2D, kind: PatternKind, scale = 1): CanvasPattern | null {
  const key = `${kind}@${scale}`;
  if (cache.has(key)) return cache.get(key)!;
  if (kind === "none") return null;
  const size = Math.round(16 * scale);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.strokeStyle = g.fillStyle = "rgba(20, 16, 10, 0.42)";
  g.lineWidth = Math.max(1, scale);
  const s = size / 16;
  const dot = (x: number, y: number, r = 0.9) => { g.beginPath(); g.arc(x * s, y * s, r * s, 0, Math.PI * 2); g.fill(); };
  const line = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1 * s, y1 * s); g.lineTo(x2 * s, y2 * s); g.stroke(); };
  switch (kind) {
    case "sandstone": dot(3, 3); dot(11, 5); dot(6, 10); dot(14, 13); dot(2, 14); break;
    case "conglomerate": g.beginPath(); g.arc(5 * s, 5 * s, 2.6 * s, 0, 7); g.stroke(); g.beginPath(); g.arc(12 * s, 12 * s, 2 * s, 0, 7); g.stroke(); dot(12, 3); dot(3, 12); break;
    case "siltstone": line(1, 4, 7, 4); dot(11, 4, 0.8); line(9, 12, 15, 12); dot(4, 12, 0.8); break;
    case "shale": line(0, 4, 6, 4); line(10, 4, 16, 4); line(3, 12, 13, 12); break;
    case "limestone": line(0, 0.5, 16, 0.5); line(0, 8.5, 16, 8.5); line(4, 0, 4, 8); line(12, 8, 12, 16); break;
    case "dolomite": line(0, 0.5, 16, 0.5); line(0, 8.5, 16, 8.5); line(2, 8, 6, 0); line(10, 16, 14, 8); break;
    case "evaporite": line(2, 2, 7, 7); line(7, 2, 2, 7); line(10, 10, 15, 15); line(15, 10, 10, 15); break;
    case "coal": g.fillStyle = "rgba(10, 8, 6, 0.75)"; g.fillRect(0, 0, size, size); break;
    case "intrusive": line(4, 1, 4, 7); line(1, 4, 7, 4); line(12, 9, 12, 15); line(9, 12, 15, 12); break;
    case "volcanic": line(2, 3, 4, 7); line(4, 7, 6, 3); line(10, 11, 12, 15); line(12, 15, 14, 11); break;
    case "metamorphic":
      g.beginPath();
      for (const y of [4, 12]) { g.moveTo(0, y * s); for (let x = 0; x <= 16; x += 2) g.lineTo(x * s, (y + (x % 4 ? 1.5 : -1.5)) * s); }
      g.stroke();
      break;
    case "unconsolidated": dot(3, 4, 0.7); dot(9, 2, 0.7); g.beginPath(); g.arc(12 * s, 10 * s, 1.6 * s, 0, 7); g.stroke(); dot(5, 13, 0.7); break;
  }
  const p = ctx.createPattern(c, "repeat");
  cache.set(key, p);
  return p;
}

export const PATTERN_LABEL: Record<PatternKind, string> = {
  sandstone: "Sandstone", conglomerate: "Conglomerate", siltstone: "Siltstone", shale: "Shale / mudstone",
  limestone: "Limestone", dolomite: "Dolomite", evaporite: "Evaporite", coal: "Coal", intrusive: "Intrusive igneous",
  volcanic: "Volcanic", metamorphic: "Metamorphic", unconsolidated: "Unconsolidated sediment", none: "Other",
};

const urlCache = new Map<PatternKind, string>();

/** The pattern as a CSS background image (for HTML swatches). */
export function patternCss(kind: PatternKind): string {
  if (kind === "none") return "none";
  let url = urlCache.get(kind);
  if (!url) {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const g = c.getContext("2d")!;
    const p = lithPattern(g, kind);
    if (p) { g.fillStyle = p; g.fillRect(0, 0, 16, 16); }
    url = c.toDataURL();
    urlCache.set(kind, url);
  }
  return `url(${url})`;
}
