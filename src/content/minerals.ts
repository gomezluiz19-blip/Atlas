// Minerals and mining reference: commodities (what they're for, where they come
// from), the world's landmark mines, a guide to common minerals, and which
// minerals and deposits go with which rocks.
//
// Production shares are rounded, for 2023 mine production, from USGS Mineral
// Commodity Summaries 2024 unless noted (uranium: World Nuclear Association,
// 2022; coal: Energy Institute Statistical Review, 2023; diamonds: Kimberley
// Process, 2023, by carats). Mine coordinates point at the pit or mine site;
// a few are approximate to within a few kilometres.

export type CommodityGroup = "battery" | "base" | "precious" | "energy" | "industrial" | "gems";

export const GROUP_INFO: Record<CommodityGroup, { label: string; color: string }> = {
  battery: { label: "Battery & tech metals", color: "#5b9467" },
  base: { label: "Base & bulk metals", color: "#d19a2e" },
  precious: { label: "Precious metals", color: "#e1b843" },
  energy: { label: "Energy", color: "#8c8f87" },
  industrial: { label: "Fertiliser & industrial", color: "#4c9ac9" },
  gems: { label: "Gems", color: "#8b5fa8" },
};

export interface Commodity {
  id: string;
  name: string;
  group: CommodityGroup;
  color: string;
  /** Chemical symbol or short tag shown on markers. */
  tag: string;
  what: string;
  uses: string;
  /** Main ore minerals or sources. */
  ores: string;
  /** Where it forms, in a sentence. */
  geology: string;
  /** Top producing countries, share of world mine production (%). */
  producers: [string, number][];
  source?: string;
}

export const COMMODITIES: Commodity[] = [
  {
    id: "copper", name: "Copper", group: "base", color: "#e8793a", tag: "Cu",
    what: "The metal of electricity: conducts better than anything but silver.",
    uses: "Wiring, motors, electronics and plumbing. An electric car uses several times as much copper as a petrol one.",
    ores: "Chalcopyrite, bornite, chalcocite",
    geology: "Mostly from porphyry deposits: huge low-grade bodies around granite intrusions above subduction zones, as in the Andes.",
    producers: [["Chile", 23], ["Peru", 12], ["DR Congo", 11], ["China", 8], ["United States", 5]],
  },
  {
    id: "lithium", name: "Lithium", group: "battery", color: "#5b9467", tag: "Li",
    what: "The lightest metal, and the heart of rechargeable batteries.",
    uses: "Batteries for phones, cars and the grid take most of it; also glass, ceramics and grease.",
    ores: "Spodumene in pegmatite (hard rock); lithium-rich brine under salt flats",
    geology: "Either in pegmatites (coarse granite veins), as in Western Australia, or pumped as brine from salt flats in the high Andes.",
    producers: [["Australia", 48], ["Chile", 24], ["China", 18], ["Argentina", 5], ["Brazil", 3]],
  },
  {
    id: "cobalt", name: "Cobalt", group: "battery", color: "#3563d6", tag: "Co",
    what: "A tough, heat-resistant metal mined mostly alongside copper and nickel.",
    uses: "Battery cathodes, superalloys for jet engines, magnets and cutting tools.",
    ores: "Mostly a by-product of copper (Central African Copperbelt) and nickel",
    geology: "Concentrated in the sediment-hosted copper deposits of the Central African Copperbelt.",
    producers: [["DR Congo", 74], ["Indonesia", 7], ["Russia", 4], ["Australia", 2], ["Philippines", 2]],
  },
  {
    id: "nickel", name: "Nickel", group: "battery", color: "#98989d", tag: "Ni",
    what: "A corrosion-proof metal that makes steel stainless.",
    uses: "Stainless steel takes about two-thirds; high-energy battery cathodes are the fastest-growing use.",
    ores: "Pentlandite (sulfide ores); laterite (weathered tropical soils)",
    geology: "Sulfide ores form from nickel-rich magmas (Sudbury, Norilsk); laterites form where tropical rain weathers ultramafic rock.",
    producers: [["Indonesia", 50], ["Philippines", 11], ["New Caledonia", 6], ["Russia", 6], ["Canada", 5]],
  },
  {
    id: "rare-earths", name: "Rare earths", group: "battery", color: "#b8496a", tag: "REE",
    what: "Seventeen elements, not actually rare, but rarely concentrated enough to mine.",
    uses: "Neodymium magnets for electric motors and wind turbines, phosphors, catalysts and lasers.",
    ores: "Bastnäsite, monazite; ionic clays in southern China",
    geology: "Carbonatites and alkaline intrusions (Bayan Obo, Mountain Pass), and clays weathered from granite.",
    producers: [["China", 69], ["United States", 12], ["Myanmar", 11], ["Australia", 5], ["Thailand", 2]],
  },
  {
    id: "graphite", name: "Graphite", group: "battery", color: "#636366", tag: "C",
    what: "Pure carbon in soft, slippery sheets (the same element as diamond).",
    uses: "Battery anodes, heat-resistant linings for furnaces, lubricants and pencils.",
    ores: "Flake graphite in metamorphic rock",
    geology: "Forms when carbon-rich sediments are cooked into schist, gneiss and marble.",
    producers: [["China", 77], ["Madagascar", 6], ["Mozambique", 6], ["Brazil", 5]],
  },
  {
    id: "iron", name: "Iron ore", group: "base", color: "#b0413e", tag: "Fe",
    what: "About 95% of all metal used is iron, nearly all of it as steel.",
    uses: "Steel for buildings, bridges, cars, ships and machines.",
    ores: "Hematite, magnetite",
    geology: "Banded iron formations laid down on the seafloor 2.5–1.8 billion years ago, as oxygen first built up in the oceans.",
    producers: [["Australia", 38], ["Brazil", 18], ["China", 11], ["India", 11], ["Russia", 4]],
  },
  {
    id: "aluminium", name: "Aluminium (bauxite)", group: "base", color: "#c7c7cc", tag: "Al",
    what: "The most common metal in Earth's crust, mined as bauxite.",
    uses: "Aircraft, cans, power lines, window frames and car bodies.",
    ores: "Bauxite (gibbsite, boehmite)",
    geology: "Bauxite is a soil: tropical rain leaches everything but aluminium and iron oxides from the rock beneath.",
    producers: [["Australia", 25], ["Guinea", 24], ["China", 23], ["Brazil", 8], ["India", 6]],
  },
  {
    id: "gold", name: "Gold", group: "precious", color: "#e1b843", tag: "Au",
    what: "Dense, unreactive and beautiful: it never tarnishes.",
    uses: "Jewellery takes about half; investment, central banks and electronics most of the rest.",
    ores: "Native gold, in quartz veins or river gravels",
    geology: "Carried by hot fluids into veins along faults, often near old plate boundaries; erosion concentrates it in river placers.",
    producers: [["China", 12], ["Australia", 10], ["Russia", 10], ["Canada", 7], ["United States", 6]],
  },
  {
    id: "silver", name: "Silver", group: "precious", color: "#e5e5ea", tag: "Ag",
    what: "The best electrical conductor of all metals.",
    uses: "Electronics, solar panels, jewellery, coins and silverware.",
    ores: "Argentite; mostly a by-product of lead, zinc and copper mining",
    geology: "Hydrothermal veins, often with lead and zinc, as in Mexico's silver belt and Bolivia's Cerro Rico.",
    producers: [["Mexico", 24], ["China", 13], ["Peru", 12], ["Chile", 5], ["Poland", 5]],
  },
  {
    id: "platinum", name: "Platinum group", group: "precious", color: "#d1d1d6", tag: "Pt",
    what: "Platinum, palladium and four cousins: rare, dense catalysts.",
    uses: "Catalytic converters, hydrogen fuel cells and electrolysers, jewellery, lab and medical equipment.",
    ores: "Thin layers (reefs) in huge layered intrusions",
    geology: "Nearly all from two giant magma bodies: South Africa's Bushveld Complex and Russia's Norilsk.",
    producers: [["South Africa", 67], ["Russia", 11], ["Zimbabwe", 10], ["Canada", 4], ["United States", 2]],
    source: "Platinum only. For palladium, Russia produces about 40% and South Africa about 35%.",
  },
  {
    id: "uranium", name: "Uranium", group: "energy", color: "#8b5fa8", tag: "U",
    what: "A heavy, slightly radioactive metal whose atoms can be split for energy.",
    uses: "Fuel for nuclear power stations.",
    ores: "Uraninite (pitchblende)",
    geology: "Where groundwater carrying uranium hits a chemical barrier: old unconformities (Athabasca Basin), sandstones, and granites.",
    producers: [["Kazakhstan", 43], ["Canada", 15], ["Namibia", 11], ["Australia", 8], ["Uzbekistan", 7]],
    source: "World Nuclear Association (2022).",
  },
  {
    id: "coal", name: "Coal", group: "energy", color: "#48484a", tag: "C",
    what: "Fossilised swamp forests, the largest source of electricity and of CO₂.",
    uses: "Power stations, and coking coal to make steel.",
    ores: "Lignite, bituminous coal, anthracite",
    geology: "Peat from ancient swamps buried and pressure-cooked, much of it 360–300 million years ago (the Carboniferous).",
    producers: [["China", 54], ["India", 11], ["Indonesia", 9], ["United States", 6], ["Australia", 5]],
    source: "Energy Institute Statistical Review (2023).",
  },
  {
    id: "diamonds", name: "Diamonds", group: "gems", color: "#4c9ac9", tag: "◆",
    what: "Carbon squeezed into the hardest natural material, 150+ km down.",
    uses: "Gems; industrial cutting and drilling (now mostly synthetic diamond).",
    ores: "Kimberlite pipes; river and beach gravels",
    geology: "Carried up from the mantle in explosive kimberlite eruptions through the oldest, thickest parts of continents.",
    producers: [["Russia", 34], ["Botswana", 23], ["Canada", 15], ["Angola", 9]],
    source: "Kimberley Process (2023), by carats.",
  },
  {
    id: "tin", name: "Tin", group: "base", color: "#aeaeb2", tag: "Sn",
    what: "A soft, low-melting metal, alloyed with copper to make bronze.",
    uses: "Solder that joins every electronic circuit; tin plate for cans.",
    ores: "Cassiterite",
    geology: "Around granites, and eroded into river and offshore placers (Indonesia's tin islands).",
    producers: [["China", 23], ["Indonesia", 18], ["Myanmar", 15], ["Peru", 10], ["DR Congo", 7]],
  },
  {
    id: "zinc", name: "Zinc", group: "base", color: "#8e9aaf", tag: "Zn",
    what: "The metal that stops steel rusting.",
    uses: "Galvanising steel, brass, die-cast parts and batteries.",
    ores: "Sphalerite",
    geology: "Seafloor vent deposits and fluids moving through limestone, usually with lead.",
    producers: [["China", 33], ["Peru", 12], ["Australia", 9], ["India", 7], ["United States", 6]],
  },
  {
    id: "manganese", name: "Manganese", group: "base", color: "#9a7552", tag: "Mn",
    what: "A hard, brittle metal essential to steel.",
    uses: "Steelmaking takes almost all of it; also battery cathodes.",
    ores: "Pyrolusite and other oxides",
    geology: "Seafloor sediments from times of changing ocean oxygen, like the Kalahari field.",
    producers: [["South Africa", 36], ["Gabon", 23], ["Australia", 16], ["China", 5], ["Ghana", 4]],
  },
  {
    id: "tungsten", name: "Tungsten", group: "base", color: "#6e6e73", tag: "W",
    what: "The metal with the highest melting point (3,422 °C).",
    uses: "Tungsten carbide tools and drill bits, filaments, armour and electronics.",
    ores: "Wolframite, scheelite",
    geology: "In veins and skarns around granites.",
    producers: [["China", 81], ["Vietnam", 4], ["Russia", 3], ["Bolivia", 2]],
  },
  {
    id: "potash", name: "Potash", group: "industrial", color: "#ff6482", tag: "K",
    what: "Potassium salts: one of the three nutrients every crop needs.",
    uses: "Fertiliser takes about 90%.",
    ores: "Sylvite and carnallite in evaporite beds",
    geology: "Left behind when ancient inland seas evaporated, then buried (the Prairie Evaporite of Saskatchewan).",
    producers: [["Canada", 33], ["Russia", 17], ["China", 15], ["Belarus", 10], ["Israel", 6]],
  },
  {
    id: "phosphate", name: "Phosphate", group: "industrial", color: "#9ad1d4", tag: "P",
    what: "Phosphorus rock. Crops can't grow without it, and nothing can replace it.",
    uses: "Fertiliser, animal feed and food additives.",
    ores: "Apatite; phosphorite",
    geology: "Mostly marine sediments laid down where nutrient-rich currents rose along ancient coasts.",
    producers: [["China", 41], ["Morocco", 16], ["United States", 9], ["Russia", 6], ["Jordan", 5]],
  },
];

export interface Mine {
  name: string;
  country: string;
  lon: number;
  lat: number;
  /** Commodity ids, main one first. */
  goods: string[];
  kind: "open pit" | "underground" | "open pit and underground" | "brine" | "placer" | "historic";
  note: string;
}

const m = (name: string, country: string, lat: number, lon: number, goods: string[], kind: Mine["kind"], note: string): Mine => ({ name, country, lat, lon, goods, kind, note });

export const MINES: Mine[] = [
  // Copper
  m("Escondida", "Chile", -24.27, -69.07, ["copper"], "open pit", "The world's largest copper mine, in the Atacama Desert"),
  m("Chuquicamata", "Chile", -22.29, -68.9, ["copper"], "open pit and underground", "One of the largest open pits on Earth, now going underground"),
  m("Collahuasi", "Chile", -20.98, -68.64, ["copper"], "open pit", "Over 4,000 m up in the Andes"),
  m("El Teniente", "Chile", -34.09, -70.35, ["copper"], "underground", "The largest underground copper mine, with thousands of kilometres of tunnels"),
  m("Cerro Verde", "Peru", -16.53, -71.59, ["copper"], "open pit", "A porphyry copper giant beside Arequipa"),
  m("Antamina", "Peru", -9.54, -77.05, ["copper", "zinc"], "open pit", "Copper and zinc from a skarn at 4,300 m"),
  m("Grasberg", "Indonesia", -4.05, 137.11, ["copper", "gold"], "open pit and underground", "One of the largest gold and copper deposits, high in the Papuan mountains"),
  m("Kamoto (Kolwezi)", "DR Congo", -10.72, 25.42, ["copper", "cobalt"], "open pit and underground", "At the heart of the Copperbelt, source of much of the world's cobalt"),
  m("Bingham Canyon", "United States", 40.523, -112.151, ["copper", "gold"], "open pit", "Over 1 km deep and 4 km across; mined since 1906"),
  m("Morenci", "United States", 33.08, -109.35, ["copper"], "open pit", "North America's largest copper mine"),
  m("Oyu Tolgoi", "Mongolia", 43.01, 106.87, ["copper", "gold"], "open pit and underground", "A giant copper-gold deposit in the Gobi"),
  m("Olympic Dam", "Australia", -30.44, 136.88, ["copper", "uranium", "gold"], "underground", "The largest known uranium deposit, and a major copper mine"),
  // Battery metals
  m("Greenbushes", "Australia", -33.86, 116.06, ["lithium"], "open pit", "The world's largest hard-rock lithium mine, in a pegmatite"),
  m("Pilgangoora", "Australia", -21.03, 118.91, ["lithium"], "open pit", "Spodumene pegmatites in the Pilbara"),
  m("Salar de Atacama", "Chile", -23.6, -68.35, ["lithium", "potash"], "brine", "Lithium brine pumped into evaporation ponds you can see from space"),
  m("Salar del Hombre Muerto", "Argentina", -25.4, -67.1, ["lithium"], "brine", "Brine operations in Argentina's lithium triangle"),
  m("Salar de Uyuni", "Bolivia", -20.13, -67.49, ["lithium"], "brine", "The world's largest salt flat, over one of the biggest lithium resources"),
  m("Sudbury Basin", "Canada", 46.6, -81.0, ["nickel", "copper", "platinum"], "underground", "Nickel ores in the scar of a 1.85-billion-year-old asteroid impact"),
  m("Norilsk–Talnakh", "Russia", 69.49, 88.4, ["nickel", "platinum", "copper"], "underground", "The largest source of palladium and a leading nickel producer, above the Arctic Circle"),
  m("Sorowako", "Indonesia", -2.53, 121.36, ["nickel"], "open pit", "Laterite nickel from weathered ultramafic rock on Sulawesi"),
  m("Bayan Obo", "China", 41.78, 109.97, ["rare-earths", "iron"], "open pit", "The world's largest rare-earth mine"),
  m("Mountain Pass", "United States", 35.48, -115.53, ["rare-earths"], "open pit", "America's only rare-earth mine, in a carbonatite"),
  m("Mount Weld", "Australia", -28.86, 122.55, ["rare-earths"], "open pit", "One of the richest rare-earth deposits, in a weathered carbonatite"),
  m("Balama", "Mozambique", -13.33, 38.6, ["graphite"], "open pit", "One of the largest graphite mines"),
  // Iron and bulk
  m("Carajás (Serra Norte)", "Brazil", -6.07, -50.18, ["iron"], "open pit", "The world's largest iron ore mine, in the Amazon"),
  m("Mount Whaleback", "Australia", -23.36, 119.72, ["iron"], "open pit", "A mountain of banded iron formation, now a 5 km pit"),
  m("Kiruna", "Sweden", 67.83, 20.2, ["iron"], "underground", "The largest underground iron ore mine; the town is being moved to make room"),
  m("Weipa", "Australia", -12.66, 141.87, ["aluminium"], "open pit", "Bauxite scraped from the top few metres of Cape York"),
  m("Sangarédi (Boké)", "Guinea", 11.1, -13.8, ["aluminium"], "open pit", "Guinea holds the world's largest bauxite reserves"),
  m("Kalahari Manganese Field", "South Africa", -27.2, 22.95, ["manganese"], "open pit and underground", "Holds most of the world's known land-based manganese"),
  m("Red Dog", "United States", 68.07, -162.87, ["zinc"], "open pit", "One of the world's largest zinc mines, in Arctic Alaska"),
  m("Rampura Agucha", "India", 25.83, 74.73, ["zinc"], "underground", "One of the largest zinc mines"),
  m("Mittersill (Felbertal)", "Austria", 47.22, 12.49, ["tungsten"], "underground", "Europe's largest tungsten mine, inside the Hohe Tauern mountains"),
  m("Bangka Island", "Indonesia", -2.1, 106.1, ["tin"], "placer", "Tin dredged from river and offshore sands"),
  // Precious
  m("Muruntau", "Uzbekistan", 41.51, 64.57, ["gold"], "open pit", "One of the largest gold mines, a pit in the Kyzylkum Desert"),
  m("Super Pit (Kalgoorlie)", "Australia", -30.78, 121.5, ["gold"], "open pit", "Australia's most famous gold pit, 3.5 km long"),
  m("Carlin Trend (Goldstrike)", "United States", 40.99, -116.35, ["gold"], "open pit and underground", "Invisible gold, too fine to see, in Nevada limestones"),
  m("Mponeng", "South Africa", -26.43, 27.42, ["gold"], "underground", "The deepest mine on Earth, about 4 km down"),
  m("Lihir", "Papua New Guinea", -3.12, 152.64, ["gold"], "open pit", "Mined inside the crater of an extinct volcano"),
  m("Pueblo Viejo", "Dominican Republic", 18.93, -70.18, ["gold", "silver"], "open pit", "One of the largest gold mines in the Americas"),
  m("Peñasquito", "Mexico", 24.66, -101.69, ["silver", "gold", "zinc"], "open pit", "A top silver producer in Mexico, the world's largest silver country"),
  m("Cerro Rico (Potosí)", "Bolivia", -19.62, -65.75, ["silver", "tin"], "historic", "The 'rich mountain' whose silver funded the Spanish Empire"),
  m("Mogalakwena", "South Africa", -23.99, 28.93, ["platinum"], "open pit", "Platinum from the northern limb of the Bushveld Complex"),
  m("Rustenburg", "South Africa", -25.65, 27.25, ["platinum"], "underground", "Deep mines along the Bushveld's Merensky Reef"),
  // Energy
  m("Cigar Lake", "Canada", 58.07, -104.53, ["uranium"], "underground", "The highest-grade uranium mine in the world"),
  m("McArthur River", "Canada", 57.76, -105.05, ["uranium"], "underground", "One of the largest high-grade uranium mines"),
  m("Rössing", "Namibia", -22.48, 15.05, ["uranium"], "open pit", "Low-grade uranium in granite, mined since 1976"),
  m("North Antelope Rochelle", "United States", 43.49, -105.24, ["coal"], "open pit", "The largest coal mine by reserves, in the Powder River Basin"),
  m("Garzweiler", "Germany", 51.06, 6.47, ["coal"], "open pit", "A lignite pit that has swallowed whole villages"),
  m("Hambach", "Germany", 50.91, 6.5, ["coal"], "open pit", "One of Europe's deepest open pits, about 400 m"),
  // Gems and fertiliser
  m("Jwaneng", "Botswana", -24.53, 24.7, ["diamonds"], "open pit", "The richest diamond mine by value"),
  m("Mir", "Russia", 62.53, 113.99, ["diamonds"], "historic", "A 525 m deep kimberlite pit, now closed"),
  m("Udachny", "Russia", 66.43, 112.32, ["diamonds"], "open pit and underground", "One of Russia's largest diamond mines"),
  m("Diavik", "Canada", 64.49, -110.27, ["diamonds"], "open pit and underground", "Kimberlite pipes under a subarctic lake, held back by dikes"),
  m("Argyle", "Australia", -16.71, 128.39, ["diamonds"], "historic", "Source of most of the world's pink diamonds; closed in 2020"),
  m("Kimberley Big Hole", "South Africa", -28.738, 24.758, ["diamonds"], "historic", "Dug largely by hand in the 1870s diamond rush"),
  m("Esterhazy", "Canada", 50.66, -102.05, ["potash"], "underground", "Potash from the Prairie Evaporite, about 1 km down"),
  m("Soligorsk", "Belarus", 52.8, 27.55, ["potash"], "underground", "Belarus's potash, among the largest in the world"),
  m("Khouribga", "Morocco", 32.88, -6.9, ["phosphate"], "open pit", "The largest phosphate mine; Morocco holds most of the world's reserves"),
];

export interface Mineral {
  name: string;
  formula: string;
  hardness: string;
  looks: string;
  /** What it's for, or why it matters. */
  why: string;
  /** Commodity it is an ore of, if any. */
  ore?: string;
}

export const MINERALS: Record<string, Mineral> = {
  quartz: { name: "Quartz", formula: "SiO₂", hardness: "7", looks: "Glassy, clear to milky, no cleavage", why: "The most common mineral at the surface; sand, glass and silicon chips" },
  feldspar: { name: "Feldspar", formula: "(K,Na,Ca)AlSi₃O₈", hardness: "6", looks: "Pink or white, blocky with flat cleavage", why: "The most common mineral in the crust; ceramics and glass" },
  mica: { name: "Mica", formula: "KAl₂(AlSi₃O₁₀)(OH)₂", hardness: "2.5", looks: "Shiny flakes that peel into sheets", why: "Electrical insulation, the shimmer in paint and cosmetics" },
  hornblende: { name: "Hornblende", formula: "Ca₂(Mg,Fe)₄Al(Si₇Al)O₂₂(OH)₂", hardness: "5.5", looks: "Black, elongated crystals", why: "Tells geologists about the magma a rock came from" },
  pyroxene: { name: "Pyroxene", formula: "(Ca,Mg,Fe)SiO₃", hardness: "6", looks: "Dark green to black, stubby crystals", why: "A main ingredient of basalt and the mantle" },
  olivine: { name: "Olivine", formula: "(Mg,Fe)₂SiO₄", hardness: "6.5–7", looks: "Bottle-green grains (the gem peridot)", why: "The most common mineral in the upper mantle" },
  plagioclase: { name: "Plagioclase", formula: "(Na,Ca)(Si,Al)₄O₈", hardness: "6", looks: "White to grey, with fine parallel stripes", why: "Makes up about half of the ocean crust" },
  calcite: { name: "Calcite", formula: "CaCO₃", hardness: "3", looks: "White or clear, fizzes in acid", why: "Limestone, marble and cement; shells and coral are made of it" },
  dolomite: { name: "Dolomite", formula: "CaMg(CO₃)₂", hardness: "3.5–4", looks: "Like calcite but fizzes only when powdered", why: "Building stone and a source of magnesium" },
  clay: { name: "Clay minerals", formula: "e.g. kaolinite Al₂Si₂O₅(OH)₄", hardness: "1–2", looks: "Earthy, soft, slippery when wet", why: "Bricks, porcelain and paper; soils hold water and nutrients because of them" },
  gypsum: { name: "Gypsum", formula: "CaSO₄·2H₂O", hardness: "2", looks: "White, soft enough to scratch with a fingernail", why: "Plaster and plasterboard" },
  halite: { name: "Halite", formula: "NaCl", hardness: "2.5", looks: "Clear cubes, tastes salty", why: "Table and road salt; chemicals industry" },
  garnet: { name: "Garnet", formula: "(Fe,Mg,Ca)₃Al₂Si₃O₁₂", hardness: "6.5–7.5", looks: "Deep red, rounded crystals", why: "Abrasives and waterjet cutting; January's birthstone" },
  chlorite: { name: "Chlorite", formula: "(Mg,Fe)₅Al(AlSi₃O₁₀)(OH)₈", hardness: "2–2.5", looks: "Green, soft, flaky", why: "Gives greenschist and slate their colour" },
  serpentine: { name: "Serpentine", formula: "(Mg,Fe)₃Si₂O₅(OH)₄", hardness: "3–5", looks: "Green, waxy, often streaked", why: "Forms where seawater alters mantle rock; can host nickel and chromite" },
  chalcopyrite: { name: "Chalcopyrite", formula: "CuFeS₂", hardness: "3.5–4", looks: "Brassy yellow, often iridescent", why: "The main ore of copper", ore: "copper" },
  pyrite: { name: "Pyrite", formula: "FeS₂", hardness: "6–6.5", looks: "Brassy cubes ('fool's gold')", why: "A sign of hydrothermal fluids; often found with gold and copper" },
  galena: { name: "Galena", formula: "PbS", hardness: "2.5", looks: "Heavy, silver-grey cubes", why: "The main ore of lead, often with silver" },
  sphalerite: { name: "Sphalerite", formula: "ZnS", hardness: "3.5–4", looks: "Resinous brown to black", why: "The main ore of zinc", ore: "zinc" },
  hematite: { name: "Hematite", formula: "Fe₂O₃", hardness: "5.5–6.5", looks: "Steel-grey to red, with a red streak", why: "The main ore of iron", ore: "iron" },
  magnetite: { name: "Magnetite", formula: "Fe₃O₄", hardness: "5.5–6.5", looks: "Black, strongly magnetic", why: "Iron ore; it records Earth's magnetic field in rocks", ore: "iron" },
  spodumene: { name: "Spodumene", formula: "LiAlSi₂O₆", hardness: "6.5–7", looks: "Pale, long crystals, sometimes metres long", why: "The main hard-rock ore of lithium", ore: "lithium" },
  cassiterite: { name: "Cassiterite", formula: "SnO₂", hardness: "6–7", looks: "Heavy, brown to black", why: "The main ore of tin", ore: "tin" },
  gold: { name: "Native gold", formula: "Au", hardness: "2.5–3", looks: "Yellow, soft, very heavy, never tarnishes", why: "Found as grains and nuggets in quartz veins and river gravels", ore: "gold" },
  uraninite: { name: "Uraninite", formula: "UO₂", hardness: "5–6", looks: "Black, pitchy, very heavy", why: "The main ore of uranium", ore: "uranium" },
  bauxite: { name: "Bauxite", formula: "Al(OH)₃ + AlO(OH)", hardness: "1–3", looks: "Red-brown, earthy pebbles", why: "The ore of aluminium", ore: "aluminium" },
  sylvite: { name: "Sylvite", formula: "KCl", hardness: "2", looks: "Like halite, often reddish; bitter taste", why: "The main source of potash fertiliser", ore: "potash" },
  apatite: { name: "Apatite", formula: "Ca₅(PO₄)₃(F,Cl,OH)", hardness: "5", looks: "Green to blue hexagonal crystals", why: "Phosphate fertiliser; also what teeth and bones are made of", ore: "phosphate" },
  graphite: { name: "Graphite", formula: "C", hardness: "1–2", looks: "Soft, greasy, black flakes", why: "Battery anodes and pencils", ore: "graphite" },
  diamond: { name: "Diamond", formula: "C", hardness: "10", looks: "Brilliant, the hardest natural substance", why: "Gems and cutting tools", ore: "diamonds" },
  chromite: { name: "Chromite", formula: "FeCr₂O₄", hardness: "5.5", looks: "Black, metallic, weakly magnetic", why: "The only ore of chromium, for stainless steel" },
  bastnasite: { name: "Bastnäsite", formula: "(Ce,La)CO₃F", hardness: "4–4.5", looks: "Yellow to reddish-brown", why: "The main ore of rare earths", ore: "rare-earths" },
  coal: { name: "Coal", formula: "mostly C", hardness: "1–2.5", looks: "Black, dull to shiny, lightweight", why: "A rock made of plant remains; fuel", ore: "coal" },
};

export interface RockProfile {
  label: string;
  /** Keys into MINERALS for the minerals that make up this rock. */
  minerals: string[];
  /** Deposits rocks like this can host. */
  hosts: string;
  /** Commodity ids associated with this rock type. */
  goods: string[];
}

/** Rock types matched by keywords in bedrock descriptions, most specific first. */
export const ROCKS: [RegExp, RockProfile][] = [
  [/pegmatite/, { label: "Pegmatite", minerals: ["quartz", "feldspar", "mica", "spodumene"], hosts: "Lithium, tantalum, rare gems and ceramic feldspar", goods: ["lithium"] }],
  [/kimberlite/, { label: "Kimberlite", minerals: ["olivine", "serpentine", "garnet", "diamond"], hosts: "Diamonds carried up from the mantle", goods: ["diamonds"] }],
  [/carbonatite/, { label: "Carbonatite", minerals: ["calcite", "dolomite", "apatite", "bastnasite"], hosts: "Rare earths, niobium and phosphate", goods: ["rare-earths", "phosphate"] }],
  [/banded iron|iron.?formation|taconite|jaspilite/, { label: "Banded iron formation", minerals: ["hematite", "magnetite", "quartz"], hosts: "Most of the world's iron ore", goods: ["iron"] }],
  [/evaporite|halite|\bsalt\b|\bpotash|anhydrite|gypsum/, { label: "Evaporite", minerals: ["halite", "gypsum", "sylvite"], hosts: "Rock salt, potash and gypsum", goods: ["potash"] }],
  [/coal|lignite/, { label: "Coal measures", minerals: ["coal", "clay", "quartz", "pyrite"], hosts: "Coal seams, fireclay", goods: ["coal"] }],
  [/phosphor/, { label: "Phosphorite", minerals: ["apatite", "calcite", "quartz"], hosts: "Phosphate fertiliser rock", goods: ["phosphate"] }],
  [/laterite|bauxite/, { label: "Laterite", minerals: ["bauxite", "hematite", "clay"], hosts: "Bauxite, and nickel where it formed on ultramafic rock", goods: ["aluminium", "nickel"] }],
  [/peridotite|dunite|serpentin|ultramafic|komatiite/, { label: "Ultramafic rock", minerals: ["olivine", "pyroxene", "serpentine", "chromite"], hosts: "Nickel, chromium, platinum-group metals and asbestos", goods: ["nickel", "platinum"] }],
  [/granite|granodiorite|monzogranite|syenogranite/, { label: "Granite", minerals: ["quartz", "feldspar", "mica", "hornblende"], hosts: "Tin, tungsten, uranium and lithium around its edges; dimension stone", goods: ["tin", "tungsten", "uranium"] }],
  [/porphyr|diorite|tonalite|monzonite/, { label: "Intermediate intrusive rock", minerals: ["plagioclase", "hornblende", "quartz", "feldspar"], hosts: "Porphyry copper, gold and molybdenum deposits", goods: ["copper", "gold"] }],
  [/andesite|dacite|volcanic|tuff|breccia/, { label: "Volcanic rock", minerals: ["plagioclase", "pyroxene", "hornblende", "quartz"], hosts: "Epithermal gold and silver veins; porphyry copper beneath", goods: ["gold", "silver", "copper"] }],
  [/rhyolite/, { label: "Rhyolite", minerals: ["quartz", "feldspar", "mica"], hosts: "Epithermal gold and silver, lithium clays in old calderas", goods: ["gold", "silver", "lithium"] }],
  [/gabbro|norite|anorthosite/, { label: "Gabbro", minerals: ["plagioclase", "pyroxene", "olivine", "magnetite"], hosts: "Nickel-copper sulfides and platinum in layered intrusions", goods: ["nickel", "platinum", "copper"] }],
  [/basalt|diabase|dolerite|greenstone/, { label: "Basalt", minerals: ["plagioclase", "pyroxene", "olivine", "magnetite"], hosts: "Copper in old lava flows; gold in greenstone belts; seafloor massive sulfides", goods: ["copper", "gold", "zinc"] }],
  [/schist|gneiss|amphibolite|migmatite/, { label: "Schist or gneiss", minerals: ["quartz", "feldspar", "mica", "garnet"], hosts: "Graphite, garnet, and gold in shear zones", goods: ["graphite", "gold"] }],
  [/slate|phyllite/, { label: "Slate", minerals: ["mica", "chlorite", "quartz", "clay"], hosts: "Roofing slate; gold in quartz veins", goods: ["gold"] }],
  [/marble/, { label: "Marble", minerals: ["calcite", "dolomite", "graphite"], hosts: "Building and sculpture stone; graphite and skarn ores at contacts", goods: ["graphite"] }],
  [/quartzite/, { label: "Quartzite", minerals: ["quartz"], hosts: "Silica for glass and silicon", goods: [] }],
  [/conglomerate/, { label: "Conglomerate", minerals: ["quartz", "feldspar", "pyrite"], hosts: "Ancient gold and uranium placers, as in the Witwatersrand", goods: ["gold", "uranium"] }],
  [/limestone|dolostone|dolomite|chalk|carbonate/, { label: "Limestone", minerals: ["calcite", "dolomite"], hosts: "Cement and lime; lead–zinc deposits; oil and gas reservoirs", goods: ["zinc"] }],
  [/sandstone|arkose|greywacke|graywacke/, { label: "Sandstone", minerals: ["quartz", "feldspar", "clay"], hosts: "Roll-front uranium, copper, groundwater, oil and gas", goods: ["uranium", "copper"] }],
  [/shale|mudstone|siltstone|claystone|argillite/, { label: "Shale", minerals: ["clay", "quartz", "mica", "pyrite"], hosts: "Oil and gas source rock; sediment-hosted copper and zinc", goods: ["copper", "zinc"] }],
  [/alluvi|gravel|sand\b|clay|till|glacial|loess|unconsolidated|sediment/, { label: "Loose sediment", minerals: ["quartz", "feldspar", "clay"], hosts: "Sand, gravel and clay for construction; placer gold and tin", goods: ["gold", "tin"] }],
];

/** The rock profile for a bedrock description, or null. */
export function rockProfile(text: string): RockProfile | null {
  const t = text.toLowerCase();
  for (const [re, p] of ROCKS) if (re.test(t)) return p;
  return null;
}

export const commodity = (id: string) => COMMODITIES.find((c) => c.id === id);

/** ISO 3166 alpha-2 codes for the producer names used above. */
export const COUNTRY_CODES: Record<string, string> = {
  Chile: "CL", Peru: "PE", "DR Congo": "CD", China: "CN", "United States": "US", Australia: "AU", Argentina: "AR", Brazil: "BR",
  Indonesia: "ID", Russia: "RU", Philippines: "PH", "New Caledonia": "NC", Canada: "CA", Myanmar: "MM", Thailand: "TH",
  Madagascar: "MG", Mozambique: "MZ", India: "IN", Guinea: "GN", Mexico: "MX", Poland: "PL", "South Africa": "ZA", Zimbabwe: "ZW",
  Kazakhstan: "KZ", Namibia: "NA", Uzbekistan: "UZ", Botswana: "BW", Angola: "AO", Gabon: "GA", Ghana: "GH", Vietnam: "VN",
  Bolivia: "BO", Belarus: "BY", Israel: "IL", Morocco: "MA", Jordan: "JO",
};

/** The commodities a country ranks among the top producers of. */
export function countryRanks(iso2: string): { c: Commodity; rank: number; share: number }[] {
  const out: { c: Commodity; rank: number; share: number }[] = [];
  for (const c of COMMODITIES) {
    const i = c.producers.findIndex(([name]) => COUNTRY_CODES[name] === iso2);
    if (i >= 0) out.push({ c, rank: i + 1, share: c.producers[i][1] });
  }
  return out.sort((a, b) => a.rank - b.rank || b.share - a.share);
}
