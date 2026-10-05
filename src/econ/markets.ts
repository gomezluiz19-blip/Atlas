// Raw materials as markets: where each is produced, where it's processed (the
// choke point that often matters more than the mine), ten years of prices,
// what it's used for, and who lists it as critical.
//
// Sources, rounded and approximate:
//   - mine production: USGS Mineral Commodity Summaries 2024 (via content/minerals.ts);
//     oil and LNG: Energy Institute Statistical Review 2024; crops: FAO and USDA, 2023;
//   - processing shares: IEA Global Critical Minerals Outlook 2024; steel from worldsteel 2023;
//     cocoa grinding from ICCO; soybean imports from USDA;
//   - prices: World Bank Commodity Price Data ("Pink Sheet"), annual averages, CC BY 4.0;
//     lithium, cobalt and rare earths, which the Pink Sheet doesn't carry, are rounded
//     yearly averages of widely quoted spot prices (China lithium carbonate, cobalt
//     metal, NdPr oxide) and are indicative only;
//   - critical lists: US Geological Survey 2022 list; EU Critical Raw Materials Act 2024.
// Good enough to see the shape of a market; not for trading.
import { COMMODITIES, type Commodity } from "../content/minerals";
import { codeOf } from "./places";

export const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

export interface Market {
  id: string;
  name: string;
  tag: string;
  color: string;
  kind: "metal" | "energy" | "crop";
  /** What it's for, in a line. */
  uses: string;
  /** Countries producing it (ISO2, share of world %). */
  producers: [string, number][];
  /** The middle step and where it happens: refined, smelted, ground, imported. */
  stage?: { verb: string; where: [string, number][] };
  /** Yearly average price, oldest first (YEARS), in `unit`. */
  prices?: number[];
  unit?: string;
  /** On the US and EU critical lists. */
  critical?: { us?: boolean; eu?: boolean };
  /** Sea lanes most of it passes through. */
  lanes?: string[];
}

/** Extra market facts for the minerals already described in content/minerals.ts. */
const MINERAL_MARKETS: Record<string, Partial<Market>> = {
  copper: { unit: "$/t", prices: [5510, 4868, 6170, 6530, 6010, 6174, 9317, 8822, 8478, 9147], stage: { verb: "Refined in", where: [["CN", 45], ["CL", 8], ["CD", 7], ["JP", 6], ["RU", 4]] }, critical: { us: true, eu: true }, lanes: ["Panama Canal", "Strait of Malacca"] },
  lithium: { unit: "$/t", prices: [6000, 12000, 14500, 12500, 8500, 6000, 14000, 70000, 33000, 12000], stage: { verb: "Refined in", where: [["CN", 65], ["CL", 25], ["AR", 5]] }, critical: { us: true, eu: true }, lanes: ["Strait of Malacca"] },
  cobalt: { unit: "$/t", prices: [28000, 26000, 55000, 72000, 32000, 31000, 51000, 63000, 33000, 26000], stage: { verb: "Refined in", where: [["CN", 76], ["FI", 8], ["CA", 3], ["BE", 2]] }, critical: { us: true, eu: true }, lanes: ["Cape of Good Hope", "Strait of Malacca"] },
  nickel: { unit: "$/t", prices: [11863, 9595, 10410, 13114, 13914, 13787, 18465, 25834, 21521, 16814], stage: { verb: "Refined in", where: [["ID", 43], ["CN", 27], ["JP", 4], ["RU", 4]] }, critical: { us: true, eu: true }, lanes: ["Strait of Malacca"] },
  "rare-earths": { unit: "$/kg NdPr", prices: [55, 45, 55, 50, 45, 55, 110, 130, 80, 55], stage: { verb: "Separated in", where: [["CN", 90], ["MY", 4], ["EE", 1]] }, critical: { us: true, eu: true }, lanes: ["Strait of Malacca"] },
  graphite: { stage: { verb: "Made into battery anode in", where: [["CN", 95]] }, critical: { us: true, eu: true } },
  iron: { unit: "$/t", prices: [56, 58, 71, 69, 94, 109, 162, 121, 120, 109], stage: { verb: "Made into steel in", where: [["CN", 54], ["IN", 8], ["JP", 5], ["US", 4], ["RU", 4]] }, lanes: ["Strait of Malacca", "Cape of Good Hope"] },
  aluminium: { unit: "$/t", prices: [1665, 1604, 1968, 2108, 1794, 1704, 2473, 2705, 2256, 2419], stage: { verb: "Smelted in", where: [["CN", 59], ["IN", 6], ["RU", 5], ["CA", 4], ["AE", 4]] }, critical: { us: true, eu: true } },
  gold: { unit: "$/oz", prices: [1160, 1249, 1257, 1269, 1392, 1770, 1799, 1801, 1943, 2388] },
  silver: { unit: "$/oz", prices: [15.7, 17.1, 17.0, 15.7, 16.2, 20.5, 25.2, 21.8, 23.4, 28.3] },
  platinum: { unit: "$/oz", prices: [1053, 989, 950, 880, 863, 883, 1091, 962, 966, 955], critical: { us: true, eu: true } },
  uranium: { unit: "$/lb", prices: [36.6, 26.4, 22.2, 24.6, 25.7, 29.6, 34.7, 49.8, 62.5, 85], stage: { verb: "Enriched in", where: [["RU", 40], ["CN", 15], ["FR", 12], ["DE", 11], ["NL", 11]] } },
  coal: { unit: "$/t", prices: [58.9, 65.9, 88.4, 107, 77.9, 60.8, 138.1, 344.9, 172.8, 136.1], lanes: ["Strait of Malacca"] },
  tin: { unit: "$/t", prices: [16067, 17934, 20061, 20145, 18661, 17125, 32384, 31335, 25938, 30066], critical: { us: true } },
  zinc: { unit: "$/t", prices: [1932, 2090, 2891, 2922, 2550, 2266, 3003, 3479, 2653, 2779], critical: { us: true } },
  manganese: { critical: { us: true, eu: true } },
  tungsten: { stage: { verb: "Processed in", where: [["CN", 80]] }, critical: { us: true, eu: true } },
  potash: { unit: "$/t", prices: [307, 245, 216, 216, 255, 241, 539, 863, 384, 300], critical: { us: true } },
  phosphate: { unit: "$/t", prices: [117, 112, 90, 88, 88, 76, 123, 266, 322, 152], critical: { eu: true } },
};

/** Energy and crops, which the minerals data doesn't cover. */
const OTHER_MARKETS: Market[] = [
  { id: "oil", name: "Crude oil", tag: "Oil", color: "#3a3a3c", kind: "energy", uses: "Transport fuels, plastics and chemicals; still a third of the world's energy.",
    producers: [["US", 16], ["SA", 11], ["RU", 11], ["CA", 6], ["IQ", 5], ["CN", 5]], stage: { verb: "Imported most by", where: [["CN", 23], ["EU", 20], ["IN", 11], ["US", 10], ["JP", 6]] },
    unit: "$/bbl", prices: [52.4, 44, 54.4, 71.1, 64, 42.3, 70.4, 99.8, 82.5, 80.7], lanes: ["Strait of Hormuz", "Strait of Malacca", "Suez Canal"] },
  { id: "lng", name: "Natural gas (LNG)", tag: "LNG", color: "#4c9ac9", kind: "energy", uses: "Power, heating and industry, shipped as liquid where pipelines don't reach.",
    producers: [["US", 21], ["AU", 20], ["QA", 19], ["RU", 8], ["MY", 7]], stage: { verb: "Imported most by", where: [["CN", 17], ["JP", 16], ["EU", 30], ["KR", 11], ["IN", 5]] },
    unit: "$/MMBtu (Europe)", prices: [6.8, 4.6, 5.7, 7.7, 4.8, 3.2, 16.1, 40.3, 13.1, 10.9], lanes: ["Strait of Hormuz", "Suez Canal", "Panama Canal"] },
  { id: "wheat", name: "Wheat", tag: "Wh", color: "#c9a256", kind: "crop", uses: "Bread, pasta and noodles: a fifth of the calories people eat.",
    producers: [["CN", 17], ["IN", 14], ["RU", 11], ["US", 6], ["CA", 4], ["AU", 3]], stage: { verb: "Imported most by", where: [["EG", 6], ["ID", 5], ["TR", 5], ["CN", 5]] },
    unit: "$/t", prices: [204, 167, 174, 210, 202, 232, 315, 430, 340, 255], lanes: ["Bosporus", "Suez Canal"] },
  { id: "soybeans", name: "Soybeans", tag: "Soy", color: "#c8b560", kind: "crop", uses: "Animal feed (most of it), cooking oil and tofu.",
    producers: [["BR", 40], ["US", 28], ["AR", 7], ["CN", 5], ["IN", 3]], stage: { verb: "Imported most by", where: [["CN", 60], ["EU", 9], ["MX", 4]] },
    unit: "$/t", prices: [390, 406, 393, 394, 369, 407, 583, 675, 598, 462], lanes: ["Panama Canal", "Cape of Good Hope"] },
  { id: "coffee", name: "Coffee", tag: "Cof", color: "#8b5a2b", kind: "crop", uses: "About two billion cups a day.",
    producers: [["BR", 37], ["VN", 17], ["CO", 7], ["ID", 6], ["ET", 5]], stage: { verb: "Bought most by", where: [["EU", 32], ["US", 24], ["JP", 5]] },
    unit: "$/kg (arabica)", prices: [3.53, 3.61, 3.32, 2.93, 2.88, 3.32, 4.5, 5.67, 4.38, 5.9] },
  { id: "cocoa", name: "Cocoa", tag: "Coc", color: "#5d3a1a", kind: "crop", uses: "Chocolate; grown by about five million smallholder farmers.",
    producers: [["CI", 38], ["GH", 13], ["EC", 7], ["CM", 6], ["NG", 6], ["ID", 4]], stage: { verb: "Ground in", where: [["NL", 13], ["CI", 12], ["DE", 9], ["MY", 7], ["US", 8]] },
    unit: "$/kg", prices: [3.14, 2.89, 2.03, 2.29, 2.34, 2.37, 2.43, 2.39, 3.28, 7.3] },
  { id: "palm-oil", name: "Palm oil", tag: "Palm", color: "#d19a2e", kind: "crop", uses: "In half of supermarket packaged goods, and biodiesel.",
    producers: [["ID", 59], ["MY", 24], ["TH", 4]], stage: { verb: "Imported most by", where: [["IN", 22], ["CN", 9], ["EU", 9]] },
    unit: "$/t", prices: [622, 700, 715, 639, 601, 752, 1131, 1276, 886, 963], lanes: ["Strait of Malacca"] },
];

const fromMineral = (c: Commodity): Market => ({
  id: c.id, name: c.name, tag: c.tag, color: c.color, kind: c.group === "energy" ? "energy" : "metal", uses: c.uses,
  producers: c.producers.map(([n, s]) => [codeOf(n) ?? n, s] as [string, number]).filter(([code]) => code.length === 2),
  ...MINERAL_MARKETS[c.id],
});

export const MARKETS: Market[] = [...COMMODITIES.filter((c) => c.group !== "gems").map(fromMineral), ...OTHER_MARKETS];
export const market = (id: string) => MARKETS.find((m) => m.id === id);
