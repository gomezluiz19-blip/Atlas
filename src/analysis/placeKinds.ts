// Sorts notable places into a few kinds, from their Wikidata "instance of" labels.

export type PlaceKind =
  | "water" | "waterfall" | "glacier" | "nature" | "peak" | "volcano" | "island" | "beach" | "park" | "zoo"
  | "landmark" | "bridge" | "dam" | "lighthouse" | "castle" | "monument" | "sports" | "culture" | "worship"
  | "transport" | "education" | "city" | "capital" | "district" | "sea" | "range" | "desert" | "region" | "continent" | "other";

const RULES: [RegExp, PlaceKind][] = [
  [/\b(waterfall|cascade|falls)\b/, "waterfall"],
  [/\b(volcano|stratovolcano|shield volcano|caldera|cinder cone|volcanic)\b/, "volcano"],
  [/\b(glacier|ice cap|ice field|icefield)\b/, "glacier"],
  [/\b(dam|barrage|weir)\b/, "dam"],
  [/\b(lighthouse)\b/, "lighthouse"],
  [/\b(zoo|aquarium|safari park|wildlife park)\b/, "zoo"],
  [/\b(bridge|viaduct|aqueduct)\b/, "bridge"],
  [/\b(castle|fortress|fort|citadel|palace|château|chateau)\b/, "castle"],
  [/\b(monument|memorial|statue|obelisk|sculpture|triumphal arch)\b/, "monument"],
  [/\b(island|islet|atoll|archipelago)\b/, "island"],
  [/\b(beach)\b/, "beach"],
  [/\b(river|lake|bay|strait|canal|reservoir|waterfall|fjord|lagoon|estuary|creek|spring|harbou?r|sound|inlet|pond)\b/, "water"],
  [/\b(stadium|arena|sports venue|football|soccer|cricket|baseball|racecourse|race track|circuit|ballpark|velodrome|golf|tennis|olympic)\b/, "sports"],
  [/\b(mountain|volcano|peak|summit|hill|massif)\b/, "peak"],
  [/\b(national park|nature reserve|protected area|urban park|park|garden|botanical|zoo|arboretum|wildlife)\b/, "park"],
  [/\b(glacier|canyon|gorge|forest|island|desert|cave|beach|cliff|valley|geyser|reef|dune|crater|plateau|cape|peninsula)\b/, "nature"],
  [/\b(museum|gallery|theat(re|er)|opera|concert hall|library|cultural|art centre|cinema|music venue)\b/, "culture"],
  [/\b(church|cathedral|basilica|mosque|temple|synagogue|abbey|monastery|shrine|chapel)\b/, "worship"],
  [/\b(airport|railway station|train station|metro station|port|terminal|bus station|heliport)\b/, "transport"],
  [/\b(university|college|school|institute|academy)\b/, "education"],
  [/\b(skyscraper|tower|building|monument|memorial|statue|bridge|square|plaza|palace|castle|fort|landmark|clock|lighthouse|arch|obelisk|street|avenue|market|hotel|stadium)\b/, "landmark"],
  [/\b(neighbo(u)?rhood|borough|district|quarter|suburb|ward)\b/, "district"],
  [/\b(capital)\b/, "capital"],
  [/\b(city|town|metropolis|big city|municipality|village)\b/, "city"],
];

export function classifyTypes(typeLabels: string[]): PlaceKind {
  const text = typeLabels.join(" | ").toLowerCase();
  for (const [re, kind] of RULES) if (re.test(text)) return kind;
  return "other";
}

export const KIND_INFO: Record<PlaceKind, { label: string; color: string }> = {
  water: { label: "Water", color: "#0a84ff" },
  waterfall: { label: "Waterfalls", color: "#0a84ff" },
  glacier: { label: "Glaciers", color: "#5ac8fa" },
  volcano: { label: "Volcanoes", color: "#ff453a" },
  island: { label: "Islands", color: "#30b0c7" },
  beach: { label: "Beaches", color: "#e5a33b" },
  zoo: { label: "Zoos and aquariums", color: "#34c759" },
  bridge: { label: "Bridges", color: "#8e8e93" },
  dam: { label: "Dams", color: "#5e5ce6" },
  lighthouse: { label: "Lighthouses", color: "#ff9f0a" },
  castle: { label: "Castles and palaces", color: "#ac8e68" },
  monument: { label: "Monuments", color: "#ff375f" },
  sea: { label: "Seas and oceans", color: "#64d2ff" },
  nature: { label: "Nature", color: "#30b050" },
  peak: { label: "Mountains", color: "#a2845e" },
  range: { label: "Mountain ranges", color: "#a2845e" },
  desert: { label: "Deserts", color: "#d4a24c" },
  park: { label: "Parks", color: "#34c759" },
  landmark: { label: "Landmarks", color: "#ff375f" },
  sports: { label: "Sport", color: "#ff9f0a" },
  culture: { label: "Culture", color: "#bf5af2" },
  worship: { label: "Places of worship", color: "#ac8e68" },
  transport: { label: "Transport", color: "#5e5ce6" },
  education: { label: "Universities", color: "#0071a4" },
  capital: { label: "Capitals", color: "#1d1d1f" },
  city: { label: "Cities and towns", color: "#1d1d1f" },
  district: { label: "Neighbourhoods", color: "#6e6e73" },
  region: { label: "Regions", color: "#6e6e73" },
  continent: { label: "Continents", color: "#6e6e73" },
  other: { label: "Places", color: "#8e8e93" },
};

/** Broad categories for filtering what's in view. */
export const CATEGORIES: { id: string; label: string; kinds: PlaceKind[] }[] = [
  { id: "landmarks", label: "Landmarks", kinds: ["landmark", "bridge", "monument", "castle", "lighthouse", "dam", "other"] },
  { id: "nature", label: "Nature", kinds: ["nature", "peak", "volcano", "glacier", "island", "beach", "park", "zoo", "waterfall"] },
  { id: "water", label: "Water", kinds: ["water", "waterfall", "dam", "sea"] },
  { id: "sport", label: "Sport", kinds: ["sports"] },
  { id: "culture", label: "Culture", kinds: ["culture", "worship", "education", "castle"] },
  { id: "transport", label: "Transport", kinds: ["transport", "bridge"] },
];
