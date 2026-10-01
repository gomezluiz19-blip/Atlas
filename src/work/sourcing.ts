// What's made and grown around a place, for the people who'd buy it: a chef
// wants the farms, orchards, cheese makers and fishing boats within a day's
// drive; a designer the mills, tanneries and tailors; an architect the
// quarries, sawmills and brickworks; an artist the foundries and framers.
// One OpenStreetMap search around the place, sorted by kind and distance.
// And for food, what's in season here month by month, from the local
// climate. Pure functions; the screens are in sourcingUi.ts.
import { metres, query, toPois, type Find, type Poi } from "./scoutModel";

const m = (k: string, ...v: string[]) => ({ k, v });

export interface SourceSet { id: string; label: string; who: string; kinds: Find[]; radiusKm: number }

export const SOURCES: Record<string, SourceSet> = {
  food: { id: "food", label: "Foodshed", who: "Chefs and restaurateurs: the farms, orchards, cheese makers and boats within a day's drive, and what's in season", radiusKm: 50, kinds: [
    { id: "farm", label: "Farms and farm shops", emoji: "🚜", color: "#8bd346", match: [m("shop", "farm"), m("landuse", "farmyard"), m("place", "farm")] },
    { id: "orchard", label: "Orchards", emoji: "🍎", color: "#ff6b3d", match: [m("landuse", "orchard")] },
    { id: "vineyard", label: "Vineyards and wineries", emoji: "🍇", color: "#bf5af2", match: [m("landuse", "vineyard"), m("craft", "winery")] },
    { id: "dairy", label: "Cheese and dairy", emoji: "🧀", color: "#ffd60a", match: [m("craft", "cheese_maker", "dairy"), m("shop", "cheese", "dairy")] },
    { id: "drink", label: "Breweries and distilleries", emoji: "🍺", color: "#c08552", match: [m("craft", "brewery", "distillery", "cider")] },
    { id: "sea", label: "Fish and seafood", emoji: "🐟", color: "#64d2ff", match: [m("landuse", "aquaculture"), m("shop", "seafood"), m("industrial", "fishery")] },
    { id: "glass", label: "Greenhouses", emoji: "🌱", color: "#30d158", match: [m("landuse", "greenhouse_horticulture")] },
    { id: "honey", label: "Beekeepers", emoji: "🍯", color: "#ff9f0a", match: [m("craft", "beekeeper")] },
    { id: "market", label: "Markets", emoji: "🧺", color: "#ff375f", match: [m("amenity", "marketplace")] },
  ] },
  fashion: { id: "fashion", label: "Made nearby", who: "Designers and brands: mills, tanneries, workrooms and fabric within reach", radiusKm: 60, kinds: [
    { id: "textile", label: "Textile works and mills", emoji: "🧶", color: "#ff2d92", match: [m("industrial", "textile", "garment", "clothing"), m("product", "textile", "textiles", "clothes", "garments")] },
    { id: "leather", label: "Tanneries and leather", emoji: "👜", color: "#ac8e68", match: [m("craft", "tanner", "saddler", "leather"), m("industrial", "tannery")] },
    { id: "tailor", label: "Tailors and dressmakers", emoji: "🧵", color: "#64d2ff", match: [m("craft", "tailor", "dressmaker", "upholsterer")] },
    { id: "shoe", label: "Shoemakers", emoji: "👞", color: "#bf5af2", match: [m("craft", "shoemaker")] },
    { id: "fabric", label: "Fabric and haberdashery", emoji: "🪡", color: "#30d158", match: [m("shop", "fabric", "sewing", "haberdashery")] },
    { id: "wool", label: "Sheep and wool", emoji: "🐑", color: "#ffd60a", match: [m("produce", "wool"), m("animal", "sheep")] },
  ] },
  architecture: { id: "architecture", label: "Local materials", who: "Architects and builders: stone, timber, brick and the trades within reach", radiusKm: 60, kinds: [
    { id: "quarry", label: "Quarries", emoji: "🪨", color: "#a1a1aa", match: [m("landuse", "quarry")] },
    { id: "timber", label: "Sawmills and timber", emoji: "🪵", color: "#c08552", match: [m("craft", "sawmill"), m("industrial", "sawmill"), m("shop", "timber")] },
    { id: "brick", label: "Brick, tile and concrete", emoji: "🧱", color: "#ff6b3d", match: [m("industrial", "brickworks", "concrete_plant", "cement"), m("product", "bricks", "concrete", "cement", "tiles")] },
    { id: "mason", label: "Stonemasons", emoji: "⚒", color: "#ffd60a", match: [m("craft", "stonemason")] },
    { id: "joiner", label: "Carpenters and joiners", emoji: "🪚", color: "#30d158", match: [m("craft", "carpenter", "joiner", "builder")] },
    { id: "merchant", label: "Builders' merchants", emoji: "🏗", color: "#64d2ff", match: [m("shop", "trade", "doityourself", "hardware")] },
  ] },
  art: { id: "art", label: "Makers and suppliers", who: "Artists and galleries: foundries, studios, framers and suppliers within reach", radiusKm: 40, kinds: [
    { id: "foundry", label: "Foundries and metalwork", emoji: "🔥", color: "#ff6b3d", match: [m("industrial", "foundry"), m("craft", "blacksmith", "metal_construction", "foundry")] },
    { id: "studio", label: "Potters, glass and sculpture", emoji: "🏺", color: "#bf5af2", match: [m("craft", "potter", "glassblower", "sculptor", "jeweller")] },
    { id: "print", label: "Printmakers and printers", emoji: "🖨", color: "#64d2ff", match: [m("craft", "printmaker", "printer"), m("shop", "copyshop")] },
    { id: "frame", label: "Framers and art supplies", emoji: "🖼", color: "#ffd60a", match: [m("shop", "frame", "craft", "art")] },
    { id: "gallery", label: "Galleries", emoji: "🏛", color: "#ff2d92", match: [m("tourism", "gallery")] },
  ] },
};

export const sourceSet = (id: string) => SOURCES[id];

/** The Overpass query for a set around a point (pure). */
export const sourcesQuery = (set: SourceSet, lon: number, lat: number) => query(set.kinds, { lon, lat, m: set.radiusKm * 1000 }, 3000);

export interface Source extends Poi { km: number; bearing: number }

/** Places to sources with distance (km) and bearing from the site, nearest first, within the radius (pure). */
export function toSources(els: Parameters<typeof toPois>[0], set: SourceSet, site: { lon: number; lat: number }): Source[] {
  return toPois(els, set.kinds).map((p) => ({ ...p, km: metres(site, p) / 1000, bearing: bearingDeg(site, p) }))
    .filter((p) => p.km <= set.radiusKm).sort((a, b) => a.km - b.km);
}

export function bearingDeg(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return (Math.atan2((b.lon - a.lon) * k, b.lat - a.lat) * 180 / Math.PI + 360) % 360;
}

/** Counts by kind and by distance band (pure). */
export function bands(src: Source[], edges = [10, 25, 50]): { kind: string; within: number[] }[] {
  const kinds = [...new Set(src.map((s) => s.kind))];
  return kinds.map((kind) => ({ kind, within: edges.map((e) => src.filter((s) => s.kind === kind && s.km <= e).length) }));
}

/** The direction most of it lies in, as a compass word (pure). */
export function mainDirection(src: Source[]): string | null {
  if (src.length < 5) return null;
  let x = 0, y = 0;
  for (const s of src) { x += Math.sin((s.bearing * Math.PI) / 180) / Math.max(1, s.km); y += Math.cos((s.bearing * Math.PI) / 180) / Math.max(1, s.km); }
  if (Math.hypot(x, y) < 0.15 * src.reduce((t, s) => t + 1 / Math.max(1, s.km), 0)) return null;
  const words = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return words[Math.round((((Math.atan2(x, y) * 180) / Math.PI + 360) % 360) / 45) % 8];
}

// ---- What's in season, from the local climate --------------------------------------------------------

/** A produce and when it's in season, from monthly mean temperatures (12 values, °C). */
export interface Produce { id: string; label: string; emoji: string; when: (T: number[], m: number) => boolean }

const warmest = (T: number[]) => T.indexOf(Math.max(...T));
const coldest = (T: number[]) => T.indexOf(Math.min(...T));
/** Months after the coldest, in order, wrapping (for "spring": warming up). */
const warming = (T: number[], m: number) => { const c = coldest(T), w = warmest(T); const span = (w - c + 12) % 12, at = (m - c + 12) % 12; return at > 0 && at <= span; };

export const PRODUCE: Produce[] = [
  { id: "greens", label: "Salad leaves and greens", emoji: "🥬", when: (T, m) => T[m] >= 7 && T[m] <= 21 },
  { id: "asparagus", label: "Asparagus", emoji: "🌱", when: (T, m) => warming(T, m) && T[m] >= 10 && T[m] <= 16 },
  { id: "strawberries", label: "Strawberries", emoji: "🍓", when: (T, m) => (warming(T, m) && T[m] >= 14 && T[m] <= 22) || (T[coldest(T)] >= 14 && T[m] <= 22) },
  { id: "tomatoes", label: "Tomatoes, peppers, courgettes", emoji: "🍅", when: (T, m) => T[m] >= 18 && T[m] <= 30 },
  { id: "corn", label: "Sweetcorn", emoji: "🌽", when: (T, m) => (T[m] >= 19 && !warming(T, m)) || (T[m] >= 21 && m === warmest(T)) },
  { id: "stonefruit", label: "Cherries, peaches, plums", emoji: "🍑", when: (T, m) => warming(T, m) && T[m] >= 16 && T[m] <= 24 && T[coldest(T)] < 10 },
  { id: "apples", label: "Apples and pears", emoji: "🍎", when: (T, m) => !warming(T, m) && T[m] >= 7 && T[m] <= 18 && T[coldest(T)] < 8 },
  { id: "squash", label: "Squash and pumpkins", emoji: "🎃", when: (T, m) => !warming(T, m) && T[m] >= 8 && T[m] <= 19 && m !== warmest(T) },
  { id: "roots", label: "Root vegetables and brassicas", emoji: "🥕", when: (T, m) => T[m] <= 13 },
  { id: "citrus", label: "Citrus", emoji: "🍊", when: (T, m) => T[coldest(T)] >= 9 && T[m] <= 20 },
  { id: "mango", label: "Mangoes", emoji: "🥭", when: (T, m) => T[coldest(T)] >= 17 && T[m] >= 26 },
  { id: "game", label: "Game and wild mushrooms", emoji: "🍄", when: (T, m) => !warming(T, m) && T[m] >= 4 && T[m] <= 14 && T[coldest(T)] < 8 },
];

/** What's in season in a month, from the local climate (pure; a rough guide). */
export const inSeason = (T: number[], month: number) => PRODUCE.filter((p) => p.when(T, month));
