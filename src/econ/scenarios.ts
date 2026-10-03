// What-ifs: shocks to raw-material prices, to countries' output or demand, and
// to the sea lanes between them. One set of scenarios used everywhere: the
// What if lab, a portfolio, the commodity desk. Severity scales every shock
// (1 = the scenario as described; 0.5 milder; 1.5 worse).
//
// The sizes are judgement, anchored on what happened in comparable episodes
// (2022's energy shock, 2021–22 container rates, the 2010 rare-earth embargo,
// 2024's cocoa squeeze). They're there to compare exposures, not to forecast.

export interface Shock {
  /** Price change by raw material, %. */
  prices: Record<string, number>;
  /** Output lost in a country, % (plants, fabs, mines and suppliers there). */
  supply?: Record<string, number>;
  /** Change in what a country buys, %. */
  demand?: Record<string, number>;
  /** Sea lanes closed or avoided. */
  lanes?: string[];
}
export interface Scenario {
  id: string;
  name: string;
  emoji: string;
  about: string;
  shock: Shock;
  /** Where to look on the globe. */
  focus: { lon: number; lat: number; height: number };
}

export const LANES: Record<string, [number, number]> = {
  "Strait of Hormuz": [56.3, 26.6], "Strait of Malacca": [100.3, 3.2], "Suez Canal": [32.35, 30.6], "Bab el-Mandeb": [43.4, 12.6],
  "Panama Canal": [-79.7, 9.1], "Taiwan Strait": [119.8, 24.3], "Cape of Good Hope": [18.5, -34.4], Bosporus: [29.05, 41.1],
};

export const SCENARIOS: Scenario[] = [
  { id: "cn-minerals", name: "China tightens critical-mineral exports", emoji: "🧲", focus: { lon: 112, lat: 33, height: 9_000_000 },
    about: "Licences for rare earths and graphite stall, as in 2025 but longer: magnets and anodes run short outside China.",
    shock: { prices: { "rare-earths": 80, graphite: 50, tungsten: 40, cobalt: 15, lithium: 10 }, supply: {} } },
  { id: "taiwan", name: "Taiwan Strait blockade", emoji: "🚢", focus: { lon: 121, lat: 24, height: 5_000_000 },
    about: "Shipping to and from Taiwan stops for months: most advanced chips stop shipping, and Asian trade reroutes.",
    shock: { prices: { lng: 30, oil: 15, copper: -8 }, supply: { TW: 80 }, demand: { TW: -50, CN: -12 }, lanes: ["Taiwan Strait"] } },
  { id: "hormuz", name: "Strait of Hormuz closed", emoji: "🛢️", focus: { lon: 56, lat: 26, height: 5_000_000 },
    about: "A fifth of the world's oil and of its LNG can't leave the Gulf for weeks.",
    shock: { prices: { oil: 60, lng: 90, coal: 25, potash: 10, aluminium: 10 }, supply: { SA: 50, QA: 70, KW: 70, IQ: 70, AE: 40 }, demand: { SA: -20, AE: -20, QA: -20 }, lanes: ["Strait of Hormuz"] } },
  { id: "red-sea", name: "Red Sea and Suez avoided", emoji: "⚓", focus: { lon: 40, lat: 18, height: 7_000_000 },
    about: "Ships go round the Cape of Good Hope: 10–14 more days Asia–Europe and container rates three times higher, as in 2024.",
    shock: { prices: { oil: 8, lng: 15, coffee: 5, cocoa: 3 }, demand: { EG: -15 }, lanes: ["Suez Canal", "Bab el-Mandeb"] } },
  { id: "drc-cobalt", name: "DR Congo stops cobalt exports", emoji: "🔋", focus: { lon: 25, lat: -8, height: 6_000_000 },
    about: "Congo keeps three-quarters of the world's cobalt at home for a year.",
    shock: { prices: { cobalt: 90, copper: 5 }, supply: { CD: 60 } } },
  { id: "id-nickel", name: "Indonesia curbs nickel", emoji: "⚙️", focus: { lon: 122, lat: -3, height: 6_000_000 },
    about: "Quotas on nickel ore and refined output, to keep the price up.",
    shock: { prices: { nickel: 45, cobalt: 10 }, supply: { ID: 25 } } },
  { id: "andes-copper", name: "Andes copper squeeze", emoji: "⛏️", focus: { lon: -70, lat: -20, height: 6_000_000 },
    about: "Strikes, water limits and permits cut Chile's and Peru's output by a fifth.",
    shock: { prices: { copper: 30, gold: 2, silver: 5 }, supply: { CL: 20, PE: 20 } } },
  { id: "cocoa", name: "West African cocoa fails again", emoji: "🍫", focus: { lon: -4, lat: 7, height: 4_000_000 },
    about: "Swollen-shoot disease and dry weather cut Côte d'Ivoire's and Ghana's crop by a third.",
    shock: { prices: { cocoa: 70, coffee: 5, "palm-oil": 5 }, supply: { CI: 30, GH: 35 } } },
  { id: "brazil-drought", name: "Drought in Brazil", emoji: "🌵", focus: { lon: -50, lat: -15, height: 7_000_000 },
    about: "A dry year cuts coffee, soy and hydro power; low rivers slow barges.",
    shock: { prices: { coffee: 45, soybeans: 18, "palm-oil": 6, iron: 5 }, supply: { BR: 15 } } },
  { id: "eu-carbon", name: "EU carbon at €150 and CBAM bites", emoji: "🏭", focus: { lon: 10, lat: 50, height: 6_000_000 },
    about: "Carbon costs double; importers pay the border tax on steel, aluminium and fertiliser in full.",
    shock: { prices: { coal: -10, lng: 10, iron: -5, aluminium: 8 }, supply: { EU: 5 }, demand: { CN: -2, IN: -2, RU: -3, TR: -2 } } },
  { id: "tariffs", name: "US–China tariffs at 60%", emoji: "🧾", focus: { lon: -160, lat: 35, height: 14_000_000 },
    about: "Trade between the two biggest economies shrinks by a third; each side retaliates.",
    shock: { prices: { soybeans: -15, copper: -6, oil: -5 }, supply: { CN: 10 }, demand: { CN: -18, US: -6 } } },
  { id: "recession", name: "Global recession", emoji: "📉", focus: { lon: 0, lat: 25, height: 18_000_000 },
    about: "Growth stalls everywhere for a year, as in 2009: factories slow, investors buy gold.",
    shock: { prices: { copper: -25, iron: -25, aluminium: -20, nickel: -25, oil: -30, lng: -30, coal: -25, lithium: -20, gold: 12, silver: -5 }, demand: { US: -6, EU: -6, CN: -6, JP: -5, IN: -3 } } },
];
export const scenario = (id: string) => SCENARIOS.find((s) => s.id === id);

/** A scenario's shock at a severity (pure). */
export function scaled(sh: Shock, severity: number): Shock {
  const k = Math.max(0, severity);
  const map = (r?: Record<string, number>) => (r ? Object.fromEntries(Object.entries(r).map(([key, v]) => [key, v * k])) : undefined);
  return { prices: map(sh.prices)!, supply: map(sh.supply), demand: map(sh.demand), lanes: k > 0 ? sh.lanes : [] };
}

/** Several scenarios at once (prices compound, losses add up to 100%). */
export function combine(shocks: Shock[]): Shock {
  const out: Shock = { prices: {}, supply: {}, demand: {}, lanes: [] };
  for (const s of shocks) {
    for (const [k, v] of Object.entries(s.prices)) out.prices[k] = ((1 + (out.prices[k] ?? 0) / 100) * (1 + v / 100) - 1) * 100;
    for (const [k, v] of Object.entries(s.supply ?? {})) out.supply![k] = Math.min(100, (out.supply![k] ?? 0) + v);
    for (const [k, v] of Object.entries(s.demand ?? {})) out.demand![k] = Math.max(-100, (out.demand![k] ?? 0) + v);
    for (const l of s.lanes ?? []) if (!out.lanes!.includes(l)) out.lanes!.push(l);
  }
  return out;
}
