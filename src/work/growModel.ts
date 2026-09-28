// Crops and fields: growing degree days (GDD), growth stages, crop water use
// (FAO-56: reference evapotranspiration × crop coefficient Kc), rain and
// irrigation, frost and heat. Targets are typical values; real varieties differ
// (an early maize can need 1,100 GDD, a late one 1,700).

export interface Crop {
  id: string;
  label: string;
  /** Base temperature (°C) below which it doesn't develop; null for perennials tracked by calendar. */
  base: number | null;
  /** Typical GDD from planting to maturity (low–high). */
  gdd?: [number, number];
  /** Upper temperature cap for GDD (°C). */
  cap?: number;
  /** FAO-56 crop coefficients: initial, mid-season, end of season. */
  kc: [number, number, number];
  /** Typical days from planting to harvest (for the calendar when no GDD target). */
  days: number;
  /** Stage names from planting to harvest (the last is "ready"). */
  stages: string[];
  perennial?: boolean;
  note?: string;
  /** For grouping the crop list. */
  group?: CropGroup;
  /** Field colour on the map. */
  color?: string;
}

export type CropGroup = "Grains" | "Pulses and oilseeds" | "Vegetables" | "Fruit" | "Fibre, sugar and roots" | "Grass and hay" | "Tree crops";
export const CROP_GROUPS: CropGroup[] = ["Grains", "Pulses and oilseeds", "Vegetables", "Fruit", "Fibre, sugar and roots", "Grass and hay", "Tree crops"];


export const CROPS: Crop[] = [
  { id: "maize", group: "Grains", label: "Maize (corn)", base: 10, cap: 30, gdd: [1400, 1600], kc: [0.3, 1.2, 0.6], days: 125, stages: ["Emerging", "Growing leaves", "Tasselling and silking", "Filling the kernels", "Drying down", "Ready to harvest"] },
  { id: "rice", group: "Grains", label: "Rice", base: 10, cap: 30, gdd: [1700, 2000], kc: [1.05, 1.2, 0.9], days: 130, stages: ["Seedling", "Tillering", "Heading and flowering", "Filling the grain", "Ripening", "Ready to harvest"] },
  { id: "wheat", group: "Grains", label: "Wheat (spring)", base: 0, cap: 30, gdd: [1500, 2000], kc: [0.3, 1.15, 0.3], days: 120, stages: ["Emerging", "Tillering", "Heading and flowering", "Filling the grain", "Ripening", "Ready to harvest"] },
  { id: "beans", group: "Pulses and oilseeds", label: "Beans", base: 10, cap: 30, gdd: [1000, 1200], kc: [0.4, 1.15, 0.35], days: 95, stages: ["Emerging", "Growing leaves", "Flowering", "Filling the pods", "Drying down", "Ready to harvest"] },
  { id: "soybean", group: "Pulses and oilseeds", label: "Soybeans", base: 10, cap: 30, gdd: [1300, 1500], kc: [0.4, 1.15, 0.5], days: 120, stages: ["Emerging", "Growing leaves", "Flowering", "Filling the pods", "Maturing", "Ready to harvest"] },
  { id: "tomato", group: "Vegetables", label: "Tomatoes", base: 10, cap: 30, gdd: [1200, 1400], kc: [0.6, 1.15, 0.8], days: 110, stages: ["Establishing", "Growing", "Flowering", "Fruit setting", "Ripening", "Picking"] },
  { id: "potato", group: "Vegetables", label: "Potatoes", base: 7, cap: 30, gdd: [1300, 1600], kc: [0.5, 1.15, 0.75], days: 115, stages: ["Sprouting", "Growing leaves", "Tubers forming", "Tubers bulking", "Maturing", "Ready to lift"] },
  { id: "coffee", group: "Tree crops", label: "Coffee", base: null, kc: [0.9, 0.95, 0.95], days: 270, perennial: true, stages: ["Flowering", "Pinhead fruit", "Cherries growing", "Cherries ripening", "Harvest"], note: "About 8–9 months from flowering to ripe cherries (arabica)." },
  { id: "cacao", group: "Tree crops", label: "Cacao", base: null, kc: [1.0, 1.05, 1.05], days: 165, perennial: true, stages: ["Flowering", "Young pods", "Pods growing", "Pods ripening", "Harvest"], note: "About 5–6 months from pollination to ripe pods." },
  { id: "banana", group: "Tree crops", label: "Bananas and plantains", base: null, kc: [0.5, 1.1, 1.0], days: 300, perennial: true, stages: ["Planting", "Growing", "Flowering (shooting)", "Bunch filling", "Harvest"], note: "About 9–12 months from planting to the first bunch, then ratoons follow." },

  // Grains
  { id: "wheat-winter", label: "Wheat (winter)", group: "Grains", color: "#d9b25a", base: 0, cap: 30, gdd: [2000, 2500], kc: [0.4, 1.15, 0.3], days: 280, stages: ["Emerging", "Tillering and overwintering", "Stem extension", "Heading and flowering", "Filling the grain", "Ready to harvest"], note: "Sown in autumn; development pauses in the cold and picks up in spring." },
  { id: "barley", label: "Barley (spring)", group: "Grains", color: "#e8c872", base: 0, cap: 30, gdd: [1300, 1700], kc: [0.3, 1.15, 0.25], days: 110, stages: ["Emerging", "Tillering", "Heading", "Filling the grain", "Ripening", "Ready to harvest"] },
  { id: "oats", label: "Oats", group: "Grains", color: "#efd9a0", base: 0, cap: 30, gdd: [1300, 1600], kc: [0.3, 1.15, 0.25], days: 110, stages: ["Emerging", "Tillering", "Heading", "Filling the grain", "Ripening", "Ready to harvest"] },
  { id: "sorghum", label: "Sorghum", group: "Grains", color: "#c9743c", base: 10, cap: 32, gdd: [1400, 1800], kc: [0.3, 1.0, 0.55], days: 120, stages: ["Emerging", "Growing leaves", "Booting and flowering", "Filling the grain", "Maturing", "Ready to harvest"] },
  { id: "millet", label: "Millet", group: "Grains", color: "#d6a24e", base: 10, cap: 32, gdd: [1100, 1400], kc: [0.3, 1.0, 0.3], days: 95, stages: ["Emerging", "Tillering", "Heading", "Filling the grain", "Ripening", "Ready to harvest"] },
  // Pulses and oilseeds
  { id: "peas", label: "Peas", group: "Pulses and oilseeds", color: "#7fc97f", base: 4, cap: 30, gdd: [1100, 1350], kc: [0.5, 1.15, 1.1], days: 85, stages: ["Emerging", "Growing vines", "Flowering", "Filling the pods", "Pods ready", "Picking"] },
  { id: "lentils", label: "Lentils", group: "Pulses and oilseeds", color: "#b5a15a", base: 4, cap: 30, gdd: [1300, 1600], kc: [0.4, 1.1, 0.3], days: 110, stages: ["Emerging", "Branching", "Flowering", "Filling the pods", "Drying down", "Ready to harvest"] },
  { id: "chickpeas", label: "Chickpeas", group: "Pulses and oilseeds", color: "#d8c17a", base: 5, cap: 30, gdd: [1400, 1700], kc: [0.4, 1.0, 0.35], days: 115, stages: ["Emerging", "Branching", "Flowering", "Filling the pods", "Drying down", "Ready to harvest"] },
  { id: "peanut", label: "Peanuts (groundnuts)", group: "Pulses and oilseeds", color: "#c49a6c", base: 10, cap: 32, gdd: [1600, 1900], kc: [0.4, 1.15, 0.6], days: 135, stages: ["Emerging", "Growing leaves", "Flowering and pegging", "Pods filling", "Maturing", "Ready to lift"] },
  { id: "sunflower", label: "Sunflowers", group: "Pulses and oilseeds", color: "#ffcc00", base: 7, cap: 32, gdd: [1400, 1700], kc: [0.35, 1.0, 0.35], days: 125, stages: ["Emerging", "Growing leaves", "Budding and flowering", "Filling the seed", "Drying down", "Ready to harvest"] },
  { id: "canola", label: "Canola (oilseed rape, spring)", group: "Pulses and oilseeds", color: "#f4e04d", base: 5, cap: 30, gdd: [1100, 1400], kc: [0.35, 1.0, 0.35], days: 100, stages: ["Emerging", "Rosette", "Bolting and flowering", "Pods filling", "Ripening", "Ready to swath"] },
  // Vegetables
  { id: "lettuce", label: "Lettuce", group: "Vegetables", color: "#9be564", base: 4, cap: 27, gdd: [800, 1000], kc: [0.7, 1.0, 0.95], days: 65, stages: ["Establishing", "Leaves growing", "Heading", "Ready to cut", "Picking"] },
  { id: "carrot", label: "Carrots", group: "Vegetables", color: "#ff8c1a", base: 4, cap: 30, gdd: [1000, 1300], kc: [0.7, 1.05, 0.95], days: 100, stages: ["Emerging", "Leaves growing", "Roots thickening", "Roots bulking", "Ready to lift"] },
  { id: "onion", label: "Onions", group: "Vegetables", color: "#d9a066", base: 6, cap: 30, gdd: [1400, 1800], kc: [0.7, 1.05, 0.75], days: 140, stages: ["Emerging", "Leaves growing", "Bulbing", "Bulbs swelling", "Tops falling", "Ready to lift"] },
  { id: "cabbage", label: "Cabbage and brassicas", group: "Vegetables", color: "#7db46c", base: 4, cap: 27, gdd: [1000, 1300], kc: [0.7, 1.05, 0.95], days: 100, stages: ["Establishing", "Leaves growing", "Heading", "Heads firming", "Ready to cut"] },
  { id: "pepper", label: "Peppers and chillies", group: "Vegetables", color: "#e8403a", base: 10, cap: 32, gdd: [1000, 1300], kc: [0.6, 1.05, 0.9], days: 110, stages: ["Establishing", "Growing", "Flowering", "Fruit setting", "Ripening", "Picking"] },
  { id: "cucumber", label: "Cucumbers", group: "Vegetables", color: "#4caf50", base: 10, cap: 32, gdd: [700, 900], kc: [0.6, 1.0, 0.75], days: 70, stages: ["Establishing", "Vines growing", "Flowering", "Fruit setting", "Picking"] },
  { id: "squash", label: "Squash and pumpkins", group: "Vegetables", color: "#f4a236", base: 10, cap: 32, gdd: [900, 1300], kc: [0.5, 1.0, 0.8], days: 100, stages: ["Establishing", "Vines growing", "Flowering", "Fruit swelling", "Curing", "Ready to harvest"] },
  { id: "garlic", label: "Garlic (autumn planted)", group: "Vegetables", color: "#efe6d2", base: null, kc: [0.7, 1.0, 0.7], days: 240, stages: ["Rooting", "Overwintering", "Leaves growing", "Bulbing", "Ready to lift"], note: "Planted in autumn; lift when a third of the leaves have browned." },
  { id: "sweetcorn", label: "Sweetcorn", group: "Vegetables", color: "#ffe066", base: 10, cap: 30, gdd: [1100, 1350], kc: [0.3, 1.15, 1.05], days: 85, stages: ["Emerging", "Growing leaves", "Tasselling and silking", "Cobs filling", "Milky stage", "Picking"] },
  // Fruit
  { id: "strawberry", label: "Strawberries", group: "Fruit", color: "#ff3b5c", base: null, kc: [0.4, 0.85, 0.75], days: 45, perennial: true, stages: ["Flowering", "Fruit setting", "Fruit swelling", "Ripening", "Picking"], note: "About 4–6 weeks from flower to ripe berry." },
  { id: "watermelon", label: "Melons and watermelons", group: "Fruit", color: "#ff6f69", base: 10, cap: 34, gdd: [1200, 1500], kc: [0.4, 1.0, 0.75], days: 90, stages: ["Establishing", "Vines growing", "Flowering", "Fruit swelling", "Ripening", "Ready to pick"] },
  { id: "grape", label: "Grapes (from budburst)", group: "Fruit", color: "#8e44ad", base: 10, cap: 30, gdd: [1100, 1700], kc: [0.3, 0.7, 0.45], days: 180, stages: ["Budburst", "Shoots growing", "Flowering and fruit set", "Berries growing (veraison)", "Ripening", "Harvest"], note: "Heat from budburst: under ~1,390 GDD suits early varieties; over ~1,670 suits late, warm-climate ones." },
  { id: "apple", label: "Apples (from blossom)", group: "Fruit", color: "#e74c3c", base: null, kc: [0.5, 0.95, 0.7], days: 150, perennial: true, stages: ["Blossom", "Fruit set", "Fruit growing", "Colouring", "Harvest"], note: "About 100–180 days from full bloom to harvest, depending on the variety." },
  { id: "citrus", label: "Citrus (from flowering)", group: "Fruit", color: "#ffa500", base: null, kc: [0.7, 0.65, 0.7], days: 270, perennial: true, stages: ["Flowering", "Fruit set", "Fruit growing", "Colour break", "Harvest"], note: "Oranges take 7–12 months from flower to ripe fruit." },
  { id: "olive", label: "Olives (from flowering)", group: "Fruit", color: "#6b8e23", base: null, kc: [0.65, 0.7, 0.7], days: 180, perennial: true, stages: ["Flowering", "Fruit set", "Pit hardening", "Fruit colouring", "Harvest"] },
  // Fibre, sugar and roots
  { id: "cotton", label: "Cotton", group: "Fibre, sugar and roots", color: "#f5f5f5", base: 15.6, cap: 32, gdd: [1200, 1500], kc: [0.35, 1.15, 0.7], days: 170, stages: ["Emerging", "Squaring", "Flowering", "Bolls filling", "Bolls opening", "Ready to pick"] },
  { id: "sugarcane", label: "Sugarcane", group: "Fibre, sugar and roots", color: "#9acd32", base: null, kc: [0.4, 1.25, 0.75], days: 365, perennial: true, stages: ["Germinating", "Tillering", "Grand growth", "Ripening", "Harvest"] },
  { id: "sweetpotato", label: "Sweet potatoes", group: "Fibre, sugar and roots", color: "#c0603a", base: 10, cap: 32, gdd: [1500, 1900], kc: [0.5, 1.15, 0.65], days: 130, stages: ["Establishing", "Vines growing", "Roots forming", "Roots bulking", "Maturing", "Ready to lift"] },
  { id: "cassava", label: "Cassava", group: "Fibre, sugar and roots", color: "#b08d57", base: null, kc: [0.3, 0.8, 0.3], days: 300, stages: ["Establishing", "Canopy growing", "Roots bulking", "Maturing", "Ready to lift"], note: "Harvested from 8 to 18 months; roots can stay in the ground until needed." },
  // Grass and hay
  { id: "hay", label: "Grass for hay or silage (per cut)", group: "Grass and hay", color: "#56b870", base: 5, cap: 28, gdd: [500, 750], kc: [0.9, 1.0, 0.95], days: 45, stages: ["Regrowing", "Leafy", "Stems lengthening", "Heading", "Ready to cut"], note: "Count from the last cut or the start of spring growth. Cut for silage at heading; later for bulk hay." },
  { id: "alfalfa", label: "Alfalfa (lucerne, per cut)", group: "Grass and hay", color: "#6fbf73", base: 5, cap: 30, gdd: [400, 600], kc: [0.4, 0.95, 0.9], days: 35, stages: ["Regrowing", "Vegetative", "Budding", "Early flower", "Ready to cut"], note: "Cut at early bloom (about one flower in ten) for the best balance of yield and quality." },
];

export const cropById = (id: string) => CROPS.find((c) => c.id === id) ?? CROPS[0];

export interface Day { date: string; tmax: number | null; tmin: number | null; rain: number | null; et0: number | null }

/** Growing degree days for one day (averaging method, capped, floor at the base). */
export function gddDay(tmax: number, tmin: number, base: number, cap = 30): number {
  const hi = Math.min(tmax, cap), lo = Math.max(Math.min(tmin, cap), base);
  return Math.max(0, (Math.max(hi, base) + lo) / 2 - base);
}

/** Where the crop is in its season, 0 (planted) to 1 (mature). */
export function progress(crop: Crop, gdd: number, daysSince: number): number {
  return crop.gdd ? gdd / ((crop.gdd[0] + crop.gdd[1]) / 2) : daysSince / crop.days;
}

/** The growth stage for a season fraction. */
export function stageAt(crop: Crop, f: number): { index: number; name: string } {
  const n = crop.stages.length - 1;
  // The stages split the season: short early stage, long middle.
  const edges = n === 5 ? [0.1, 0.4, 0.6, 0.85, 1] : [0.15, 0.4, 0.75, 1];
  const index = f >= 1 ? n : Math.max(0, edges.findIndex((e) => f < e));
  return { index, name: crop.stages[index] };
}

/** FAO-56 crop coefficient through the season (initial, development, mid, late ≈ 15/30/35/20%). */
export function kcAt(crop: Crop, f: number): number {
  const [ini, mid, end] = crop.kc;
  if (crop.perennial) return mid;
  if (f <= 0.15) return ini;
  if (f <= 0.45) return ini + ((mid - ini) * (f - 0.15)) / 0.3;
  if (f <= 0.8) return mid;
  return mid + ((end - mid) * Math.min(1, (f - 0.8) / 0.2));
}

/** Rain that reaches the roots (light showers mostly evaporate). */
export const effectiveRain = (mm: number) => (mm < 5 ? 0 : 0.8 * mm);

/** Joins two daily series by date; `b` wins where both have a value. */
export function mergeDays(a: Day[], b: Day[]): Day[] {
  const m = new Map<string, Day>();
  for (const d of a) m.set(d.date, d);
  for (const d of b) {
    const prev = m.get(d.date);
    m.set(d.date, prev ? { date: d.date, tmax: d.tmax ?? prev.tmax, tmin: d.tmin ?? prev.tmin, rain: d.rain ?? prev.rain, et0: d.et0 ?? prev.et0 } : d);
  }
  return [...m.values()].sort((x, y) => x.date.localeCompare(y.date));
}

export interface Season {
  gdd: number;
  daysSince: number;
  f: number;
  stage: { index: number; name: string };
  kc: number;
  /** Last 7 days (mm). */
  used7: number;
  rain7: number;
  /** Since planting (mm). */
  used: number;
  rain: number;
  /** Next 7 days (mm). */
  need7: number;
  rainNext7: number;
  /** Suggested irrigation over the next week (mm), after the rain expected. */
  irrigate7: number;
  frost: { date: string; tmin: number }[];
  heat: { date: string; tmax: number }[];
  /** Estimated harvest window (ISO dates), if it can be projected. */
  harvest?: [string, string];
  /** Daily cumulative GDD (for a chart). */
  curve: { date: string; gdd: number }[];
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/** The season so far and the week ahead, from daily weather (past and forecast). */
export function season(crop: Crop, planted: string, days: Day[], today: string): Season {
  let gdd = 0, used = 0, rain = 0, used7 = 0, rain7 = 0, need7 = 0, rainNext7 = 0;
  const curve: Season["curve"] = [];
  const weekAgo = addDays(today, -7), weekOn = addDays(today, 7);
  const frost: Season["frost"] = [], heat: Season["heat"] = [];
  const recent: number[] = [];
  const daysSince = Math.max(0, Math.round((Date.parse(today) - Date.parse(planted)) / 86_400_000));
  for (const d of days) {
    if (d.date < planted) continue;
    const past = d.date < today;
    const g = crop.base !== null && d.tmax !== null && d.tmin !== null ? gddDay(d.tmax, d.tmin, crop.base, crop.cap) : 0;
    const dayN = Math.round((Date.parse(d.date) - Date.parse(planted)) / 86_400_000);
    const f = progress(crop, gdd, dayN);
    const etc = (d.et0 ?? 0) * kcAt(crop, Math.min(1, f));
    const r = d.rain ?? 0;
    if (past) {
      gdd += g;
      used += etc;
      rain += effectiveRain(r);
      if (d.date >= weekAgo) { used7 += etc; rain7 += effectiveRain(r); recent.push(g); }
      curve.push({ date: d.date, gdd });
    } else if (d.date < weekOn) {
      need7 += etc;
      rainNext7 += effectiveRain(r);
      recent.push(g);
    }
    if (d.date >= today && d.date < weekOn) {
      if (d.tmin !== null && d.tmin <= 2) frost.push({ date: d.date, tmin: d.tmin });
      if (d.tmax !== null && d.tmax >= 35) heat.push({ date: d.date, tmax: d.tmax });
    }
  }
  const f = progress(crop, gdd, daysSince);
  let harvest: [string, string] | undefined;
  if (crop.gdd) {
    const rate = recent.length ? recent.reduce((s, x) => s + x, 0) / recent.length : 0;
    if (gdd >= crop.gdd[0]) harvest = [today, gdd >= crop.gdd[1] ? today : addDays(today, rate > 0.5 ? Math.ceil((crop.gdd[1] - gdd) / rate) : 30)];
    else if (rate > 0.5) harvest = [addDays(today, Math.ceil((crop.gdd[0] - gdd) / rate)), addDays(today, Math.ceil((crop.gdd[1] - gdd) / rate))];
  } else {
    const left = crop.days - daysSince;
    harvest = left <= 0 ? [today, today] : [addDays(today, Math.round(left * 0.9)), addDays(today, Math.round(left * 1.1))];
  }
  return {
    gdd, daysSince, f, stage: stageAt(crop, f), kc: kcAt(crop, Math.min(1, f)),
    // No irrigation once the crop is ripening (perennials are watered all year).
    used7, rain7, used, rain, need7, rainNext7, irrigate7: !crop.perennial && f >= 0.85 ? 0 : Math.max(0, need7 - rainNext7),
    frost, heat, harvest, curve,
  };
}

/** Litres of water for `mm` over an area (1 mm on 1 m² is 1 litre). */
export const litres = (mm: number, m2: number) => mm * m2;
