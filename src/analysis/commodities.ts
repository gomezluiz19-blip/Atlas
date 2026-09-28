// Classifies OpenStreetMap mines and quarries by what they produce.

export type CommodityGroup = "precious" | "metals" | "energy" | "construction" | "industrial" | "gems" | "unknown";

export const GROUPS: { id: CommodityGroup; label: string; color: string }[] = [
  { id: "precious", label: "Precious metals", color: "#ffd166" },
  { id: "metals", label: "Base & battery metals", color: "#ef8354" },
  { id: "energy", label: "Energy (coal, uranium)", color: "#8d99ae" },
  { id: "construction", label: "Construction materials", color: "#c2b280" },
  { id: "industrial", label: "Industrial minerals", color: "#9ad1d4" },
  { id: "gems", label: "Gemstones", color: "#d291bc" },
  { id: "unknown", label: "Not specified", color: "#b0b7c3" },
];

const RULES: [RegExp, CommodityGroup][] = [
  [/gold|silver|platinum|palladium|rhodium/, "precious"],
  [/coal|lignite|anthracite|uranium|oil.?shale|peat|bitumen/, "energy"],
  [/diamond|gem|opal|turquoise|emerald|ruby|sapphire|jade|garnet|amethyst|topaz/, "gems"],
  [/copper|iron|lead|zinc|nickel|lithium|tungsten|molybdenum|alumin|bauxite|tin\b|manganese|cobalt|chrom|vanadium|titanium|rare.?earth|antimony|mercury|tantal|niobium|beryl/, "metals"],
  [/salt|potash|phosphate|talc|kaolin|borax|borate|diatom|sulph|sulfur|fluor|barite|baryte|feldspar|mica|zeolite|bentonite|magnesite|trona|soda|silica|quartz|perlite|pumice|graphite/, "industrial"],
  [/gravel|sand|aggregate|stone|limestone|granite|clay|gypsum|marble|slate|sandstone|basalt|cement|chalk|dolomite|rock|dimension|crushed|shale|brick|loam|marl/, "construction"],
];

export function commodityOf(tags: Record<string, string>): { text: string | null; group: CommodityGroup } {
  const raw = tags["resource"] ?? tags["mineral"] ?? tags["mine:resource"] ?? tags["product"] ?? tags["quarry:resource"] ?? tags["commodity"] ?? null;
  const text = raw ? raw.replace(/_/g, " ").replace(/;/g, ", ") : null;
  const hay = `${raw ?? ""} ${tags["name"] ?? ""}`.toLowerCase();
  for (const [re, group] of RULES) if (re.test(hay)) return { text, group };
  // A plain quarry with nothing specified almost always produces building stone or aggregate.
  if (tags["landuse"] === "quarry") return { text, group: "construction" };
  return { text, group: "unknown" };
}

export function isHistoric(tags: Record<string, string>): boolean {
  return Boolean(
    tags["historic"] ||
      Object.keys(tags).some((k) => /^(disused|abandoned|was|removed|razed):/.test(k)) ||
      /^(abandoned|disused|closed|historic)$/i.test(tags["status"] ?? tags["operational_status"] ?? ""),
  );
}

export function mineKind(tags: Record<string, string>): string {
  if (tags["landuse"] === "quarry") return "Quarry / open pit";
  if (tags["man_made"] === "mineshaft" || tags["historic"] === "mine_shaft") return "Mine shaft";
  if (tags["man_made"] === "adit" || tags["historic"] === "mine_adit") return "Mine entrance (adit)";
  return "Mine";
}
