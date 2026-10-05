// Hand-picked places to start from in each theme: the classic examples a
// textbook would use, grouped into short collections. Coordinates point at the
// feature itself; `radius` (metres) frames it when flying there.

import { FEATURES, type FeatureKind } from "./features";

export interface Site {
  name: string;
  /** Where it is, briefly. */
  where: string;
  /** Why it's worth a look, in one line. */
  why: string;
  lon: number;
  lat: number;
  radius: number;
}

export interface SiteCollection {
  title: string;
  sites: Site[];
}

const s = (name: string, where: string, why: string, lat: number, lon: number, radius: number): Site => ({ name, where, why, lat, lon, radius });

export const SITES: Record<string, SiteCollection[]> = {
  explore: [
    {
      title: "Icons",
      sites: [
        s("Midtown Manhattan", "New York", "Empire State, Times Square and the Hudson in one view", 40.758, -73.9855, 3000),
        s("Westminster", "London", "Big Ben, the Thames and Parliament", 51.5007, -0.1246, 1500),
        s("Eiffel Tower", "Paris", "324 m of wrought iron on the Seine", 48.8584, 2.2945, 1200),
        s("Giza pyramids", "Egypt", "The last standing Wonder of the Ancient World", 29.9792, 31.1342, 1500),
        s("Machu Picchu", "Peru", "Inca citadel on a ridge 450 m above the Urubamba", -13.1631, -72.545, 1500),
        s("Petra", "Jordan", "City carved into rose-red sandstone", 30.3285, 35.4444, 1500),
        s("Taj Mahal", "Agra, India", "Marble mausoleum on the Yamuna", 27.1751, 78.0421, 900),
        s("Sydney Opera House", "Australia", "Shell roofs on Bennelong Point", -33.8568, 151.2153, 1200),
        s("Christ the Redeemer", "Rio de Janeiro", "Statue on Corcovado, 700 m above the city", -22.9519, -43.2105, 2500),
      ],
    },
    {
      title: "Northern and southern lights",
      sites: [
        s("Tromsø", "Norway", "Under the auroral oval on most clear winter nights", 69.6492, 18.9553, 20000),
        s("Abisko", "Sweden", "A rain shadow keeps its skies unusually clear", 68.35, 18.83, 20000),
        s("Fairbanks", "Alaska", "Aurora on most clear nights from August to April", 64.8378, -147.7164, 20000),
        s("Yellowknife", "Canada", "Flat, dark and right beneath the oval", 62.454, -114.3718, 20000),
        s("Rovaniemi", "Finnish Lapland", "On the Arctic Circle", 66.5039, 25.7294, 20000),
        s("Rakiura / Stewart Island", "New Zealand", "Aurora australis over the Southern Ocean", -46.9, 168.1, 30000),
      ],
    },
  ],
  land: [
    {
      title: "Canyons and gorges",
      sites: [
        s("Grand Canyon", "Arizona", "Nearly two billion years of rock cut by the Colorado", 36.1, -112.113, 9000),
        s("Yarlung Tsangpo Gorge", "Tibet", "One of Earth's deepest canyons", 29.72, 94.97, 14000),
        s("Colca Canyon", "Peru", "More than twice as deep as the Grand Canyon", -15.61, -71.88, 12000),
        s("Fish River Canyon", "Namibia", "Africa's largest canyon", -27.58, 17.59, 12000),
      ],
    },
    {
      title: "Volcanoes",
      sites: [
        s("Mount St. Helens", "Washington", "1980 lateral blast left a horseshoe crater", 46.1912, -122.1944, 5000),
        s("Kīlauea", "Hawaiʻi", "Shield volcano over a hotspot, erupting often", 19.421, -155.287, 6000),
        s("Mount Fuji", "Japan", "Textbook stratovolcano, 3,776 m", 35.3606, 138.7274, 9000),
        s("Mount Etna", "Sicily", "Europe's most active volcano", 37.751, 14.993, 9000),
        s("Ol Doinyo Lengai", "Tanzania", "The only volcano erupting carbonatite lava", -2.764, 35.914, 5000),
      ],
    },
    {
      title: "Plates, faults and landforms",
      sites: [
        s("Þingvellir rift", "Iceland", "The Mid-Atlantic Ridge on land", 64.26, -21.12, 7000),
        s("Carrizo Plain", "California", "The San Andreas Fault in plain sight", 35.18, -119.83, 7000),
        s("Mount Everest", "Nepal / China", "Highest peak, pushed up by India's collision with Asia", 27.9881, 86.925, 10000),
        s("Uluru", "Australia", "Arkose sandstone rising 348 m from the plain", -25.3444, 131.0369, 4000),
        s("Giant's Causeway", "Northern Ireland", "Some 40,000 columns of cooled basalt", 55.2408, -6.5116, 800),
        s("Meteor Crater", "Arizona", "A 1.2 km impact crater about 50,000 years old", 35.0272, -111.0225, 1500),
      ],
    },
  ],
  water: [
    {
      title: "Rivers and deltas",
      sites: [
        s("Meeting of the Waters", "Manaus, Brazil", "Black Rio Negro and sandy Solimões run side by side", -3.13, -59.9, 8000),
        s("Mississippi River Delta", "Louisiana", "A bird's-foot delta building into the Gulf", 29.2, -89.3, 40000),
        s("Nile Delta", "Egypt", "The fan of farmland that feeds Egypt", 30.8, 31.0, 80000),
        s("Okavango Delta", "Botswana", "A delta that ends in the desert, not the sea", -19.3, 22.9, 60000),
      ],
    },
    {
      title: "Falls and lakes",
      sites: [
        s("Angel Falls", "Venezuela", "Tallest uninterrupted waterfall, 979 m", 5.9701, -62.5362, 2500),
        s("Victoria Falls", "Zambia / Zimbabwe", "A 1.7 km curtain of falling water", -17.9243, 25.8572, 2500),
        s("Iguazú Falls", "Argentina / Brazil", "About 275 falls along the river's edge", -25.6953, -54.4367, 3000),
        s("Lake Baikal", "Siberia", "Deepest lake, 1,642 m; a fifth of Earth's fresh surface water", 53.5, 108.0, 300000),
        s("Dead Sea", "Jordan / Israel", "Shore more than 400 m below sea level", 31.5, 35.5, 40000),
      ],
    },
    {
      title: "Ice and ocean",
      sites: [
        s("Challenger Deep", "Mariana Trench", "The ocean's deepest point, about 10.9 km", 11.3733, 142.5917, 60000),
        s("Perito Moreno Glacier", "Argentina", "A calving front 60 m tall on Lago Argentino", -50.48, -73.05, 8000),
        s("Aletsch Glacier", "Switzerland", "The Alps' largest glacier", 46.47, 8.03, 10000),
      ],
    },
  ],
  climate: [
    {
      title: "Extremes",
      sites: [
        s("Death Valley", "California", "Hottest air temperature on record, 56.7 °C", 36.457, -116.866, 30000),
        s("Vostok Station", "Antarctica", "Coldest measured air temperature, −89.2 °C", -78.464, 106.837, 30000),
        s("Oymyakon", "Siberia", "Coldest permanently inhabited place, −67.7 °C", 63.46, 142.79, 20000),
        s("Mawsynram", "Meghalaya, India", "About 11.9 m of rain in an average year", 25.3, 91.58, 15000),
        s("Atacama Desert", "Chile", "Driest non-polar desert", -24.5, -69.25, 100000),
        s("Mount Washington", "New Hampshire", "A 372 km/h gust in 1934, a record for 62 years", 44.2706, -71.3033, 6000),
      ],
    },
    {
      title: "Climate change in view",
      sites: [
        s("Aral Sea", "Kazakhstan / Uzbekistan", "Lost about 90% of its area to irrigation", 45.0, 60.0, 250000),
        s("Great Barrier Reef", "Australia", "Repeated mass bleaching since 2016", -18.29, 147.7, 200000),
        s("Funafuti", "Tuvalu", "An atoll a few metres above a rising sea", -8.52, 179.2, 10000),
        s("Ilulissat Icefjord", "Greenland", "Icebergs from one of the fastest-retreating glaciers", 69.13, -50.0, 25000),
        s("Moore", "Oklahoma", "Hit by EF5 tornadoes in 1999 and 2013", 35.34, -97.49, 15000),
      ],
    },
  ],
  plants: [
    {
      title: "Record-holders",
      sites: [
        s("General Sherman Tree", "Sequoia National Park", "Largest tree on Earth by volume", 36.5816, -118.7511, 800),
        s("Redwood National Park", "California", "Home of the tallest trees, over 115 m", 41.21, -124.0, 12000),
        s("Ancient Bristlecone Pine Forest", "California", "Trees nearly 5,000 years old", 37.385, -118.17, 6000),
        s("Pando", "Utah", "A single aspen clone across 43 hectares", 38.525, -111.75, 1200),
        s("Welwitschia Plains", "Namibia", "Desert plants that live for over a thousand years", -22.6, 15.0, 15000),
      ],
    },
    {
      title: "Hotspots of plant life",
      sites: [
        s("Amazon rainforest", "Brazil", "Largest tropical rainforest", -3.5, -62.0, 400000),
        s("Table Mountain", "Cape Town", "Fynbos: the richest of the world's six floral kingdoms", -33.96, 18.4, 20000),
        s("Daintree Rainforest", "Queensland", "Among the oldest rainforests, over 100 million years", -16.17, 145.42, 20000),
        s("Socotra", "Yemen", "Dragon's blood trees; about a third of plants found nowhere else", 12.5, 53.9, 70000),
        s("Mount Kinabalu", "Borneo", "Some 5,000 plant species on one mountain", 6.075, 116.558, 12000),
        s("Joshua Tree National Park", "California", "Where the Mojave and Colorado deserts meet", 33.88, -115.9, 30000),
      ],
    },
  ],
  animals: [
    {
      title: "Great gatherings",
      sites: [
        s("Serengeti", "Tanzania", "About 1.5 million wildebeest on the move", -2.33, 34.83, 80000),
        s("Monarch Butterfly Reserve", "Michoacán, Mexico", "Millions of monarchs spend the winter here", 19.6, -100.25, 15000),
        s("Christmas Island", "Indian Ocean", "Tens of millions of red crabs migrate to the sea", -10.49, 105.62, 12000),
        s("Salisbury Plain", "South Georgia", "One of the largest king penguin colonies", -54.06, -37.33, 5000),
      ],
    },
    {
      title: "Evolution's showcases",
      sites: [
        s("Galápagos Islands", "Ecuador", "Giant tortoises, marine iguanas and Darwin's finches", -0.6, -90.5, 150000),
        s("Andasibe", "Madagascar", "Home of the indri, the largest lemur", -18.93, 48.42, 8000),
        s("Raja Ampat", "Indonesia", "The most diverse coral reefs on Earth", -0.5, 130.5, 80000),
      ],
    },
    {
      title: "Big animals, big parks",
      sites: [
        s("Yellowstone", "Wyoming", "Wolves, bison and grizzlies", 44.6, -110.5, 60000),
        s("Bwindi Impenetrable Forest", "Uganda", "About half the world's mountain gorillas", -1.02, 29.66, 15000),
        s("Sundarbans", "Bangladesh / India", "Bengal tigers in the largest mangrove forest", 21.95, 89.18, 60000),
        s("Wolong", "Sichuan, China", "Giant panda reserve in bamboo forest", 31.0, 103.2, 25000),
        s("Kruger National Park", "South Africa", "Lion, leopard, rhino, elephant and buffalo", -24.0, 31.5, 100000),
        s("Monterey Bay", "California", "Sea otters, kelp forests and passing whales", 36.8, -121.9, 25000),
      ],
    },
  ],
  built: [
    {
      title: "Engineering",
      sites: [
        s("Three Gorges Dam", "China", "The world's largest power station by capacity", 30.823, 111.003, 5000),
        s("Hoover Dam", "Nevada / Arizona", "Holds back Lake Mead, the largest US reservoir", 36.0161, -114.7377, 2000),
        s("Panama Canal", "Miraflores Locks", "Lifts ships 16 m between two oceans", 9.0155, -79.5925, 3000),
        s("Suez Canal", "Ismailia, Egypt", "About 12% of world trade passes through here", 30.58, 32.3, 60000),
        s("Hong Kong–Zhuhai–Macau Bridge", "Pearl River Delta", "55 km of bridge and undersea tunnel", 22.29, 113.73, 20000),
        s("Øresund Bridge", "Denmark / Sweden", "Bridge that dives into a tunnel mid-strait", 55.575, 12.83, 10000),
        s("Itaipu Dam", "Brazil / Paraguay", "Among the world's biggest power producers, shared by two countries", -25.408, -54.589, 5000),
        s("Grand Ethiopian Renaissance Dam", "Ethiopia", "Africa's largest hydropower dam, on the Blue Nile", 11.215, 35.093, 6000),
        s("Kariba Dam", "Zambia / Zimbabwe", "Holds back Lake Kariba, one of the largest reservoirs by volume", -16.522, 28.762, 4000),
        s("Noor Ouarzazate", "Morocco", "A field of mirrors and a solar tower on the edge of the Sahara", 31.03, -6.86, 5000),
        s("Lake Turkana Wind Power", "Kenya", "Africa's largest wind farm, in a natural wind tunnel", 2.52, 36.82, 8000),
        s("Bhadla Solar Park", "Rajasthan, India", "One of the world's largest solar parks, in the Thar Desert", 27.54, 71.91, 9000),
        s("Bandra–Worli Sea Link", "Mumbai", "A cable-stayed bridge across Mahim Bay", 19.0368, 72.8175, 3000),
      ],
    },
    {
      title: "Cities and structures",
      sites: [
        s("Burj Khalifa", "Dubai", "Tallest building, 828 m", 25.1972, 55.2744, 1500),
        s("Palm Jumeirah", "Dubai", "An island built from dredged sand", 25.112, 55.139, 5000),
        s("Great Wall at Mutianyu", "Beijing", "A restored stretch climbing the ridges", 40.4319, 116.5704, 2000),
        s("Yangshan Port", "Shanghai", "Part of the world's busiest container port", 30.63, 122.07, 8000),
        s("Svalbard Global Seed Vault", "Norway", "Backup of the world's crop seeds, in permafrost", 78.2357, 15.4913, 1500),
        s("Petronas Towers", "Kuala Lumpur", "Twin towers joined by a sky bridge, once the world's tallest", 3.1579, 101.7116, 1200),
        s("Eko Atlantic", "Lagos", "A new city district being built on land reclaimed from the Atlantic", 6.412, 3.409, 4000),
        s("Brasília's Monumental Axis", "Brazil", "A capital planned from scratch in the shape of an aeroplane", -15.7939, -47.8828, 5000),
        s("Mi Teleférico", "La Paz and El Alto, Bolivia", "The world's largest urban cable-car network, as city transit", -16.4955, -68.1336, 6000),
        s("Medellín Metrocable", "Colombia", "Cable cars that linked hillside neighbourhoods to the metro", 6.2929, -75.5405, 3000),
        s("Dharavi", "Mumbai", "One of Asia's largest informal neighbourhoods, and a hub of small industry", 19.043, 72.853, 1500),
        s("Kibera", "Nairobi", "One of Africa's largest informal settlements", -1.313, 36.787, 2000),
      ],
    },
    {
      title: "Famous streets and squares",
      sites: [
        s("Champs-Élysées", "Paris", "From Concorde to the Arc de Triomphe, about 1.9 km", 48.8698, 2.3078, 1800),
        s("Times Square", "New York", "Lit up day and night where Broadway meets Seventh Avenue", 40.758, -73.9855, 800),
        s("Broadway", "New York", "Runs the length of Manhattan and beyond, cutting across the grid", 40.7831, -73.9712, 6000),
        s("Fifth Avenue", "New York", "Shops, museums and Central Park's edge", 40.7744, -73.9656, 3500),
        s("Wall Street", "New York", "Named for a 17th-century wall; the heart of finance", 40.7061, -74.0092, 600),
        s("Lombard Street", "San Francisco", "The crooked street: eight hairpin bends in one block", 37.8021, -122.4187, 400),
        s("Las Vegas Strip", "Nevada", "Six kilometres of resorts and neon", 36.1147, -115.1728, 4000),
        s("Hollywood Walk of Fame", "Los Angeles", "Over 2,700 stars set in the pavement", 34.1016, -118.3267, 1500),
        s("Route 66", "Oatman, Arizona", "The Mother Road from Chicago to Santa Monica", 35.0264, -114.3833, 5000),
        s("Bourbon Street", "New Orleans", "The French Quarter's street of music", 29.9584, -90.0654, 800),
        s("Avenida 9 de Julio", "Buenos Aires", "One of the widest avenues in the world", -34.6037, -58.3816, 1500),
        s("Avenida Paulista", "São Paulo", "Business, culture and Sunday car-free days", -23.5614, -46.6559, 2000),
        s("Oxford Street", "London", "Europe's busiest shopping street", 51.5152, -0.1419, 1500),
        s("Abbey Road", "London", "The zebra crossing from the Beatles' album cover", 51.532, -0.1778, 300),
        s("Trafalgar Square", "London", "Nelson's Column and the National Gallery", 51.508, -0.1281, 500),
        s("Royal Mile", "Edinburgh", "From the castle down to Holyrood Palace", 55.9505, -3.1883, 1200),
        s("La Rambla", "Barcelona", "A tree-lined promenade down to the sea", 41.3809, 2.1734, 1200),
        s("Plaza Mayor", "Madrid", "A 17th-century arcaded square", 40.4155, -3.7074, 400),
        s("Grand-Place", "Brussels", "Guildhalls around one of Europe's finest squares", 50.8467, 4.3525, 400),
        s("Piazza San Marco", "Venice", "Napoleon's 'drawing room of Europe'", 45.4341, 12.3388, 500),
        s("Unter den Linden", "Berlin", "From the Brandenburg Gate to Museum Island", 52.5169, 13.3889, 1500),
        s("Strøget", "Copenhagen", "One of Europe's longest pedestrian streets", 55.6786, 12.5745, 1200),
        s("Red Square", "Moscow", "The Kremlin, St Basil's and Lenin's tomb", 55.7539, 37.6208, 800),
        s("Nevsky Prospekt", "Saint Petersburg", "The city's grand avenue", 59.9343, 30.3351, 2500),
        s("İstiklal Avenue", "Istanbul", "A historic tram along a busy pedestrian street", 41.0339, 28.9779, 1200),
        s("Jemaa el-Fnaa", "Marrakesh", "Storytellers, music and food stalls at night", 31.6258, -7.9891, 500),
        s("Tiananmen Square", "Beijing", "One of the largest city squares", 39.9055, 116.3976, 1200),
        s("Nanjing Road", "Shanghai", "China's famous shopping street", 31.2352, 121.4747, 1500),
        s("Shibuya Crossing", "Tokyo", "Thousands cross at once when the lights change", 35.6595, 139.7005, 400),
        s("Ginza", "Tokyo", "Chūō-dōri closes to cars on weekends", 35.6717, 139.765, 1000),
        s("Khao San Road", "Bangkok", "The backpackers' street", 13.7589, 100.4974, 500),
        s("Orchard Road", "Singapore", "A former fruit-orchard lane turned shopping boulevard", 1.3048, 103.8318, 1500),
        s("Chandni Chowk", "Old Delhi", "A 17th-century market street, still one of India's busiest", 28.6506, 77.2303, 1200),
        s("Marine Drive", "Mumbai", "The Queen's Necklace: a curve of lights along the Arabian Sea", 18.944, 72.823, 2500),
        s("Old Quarter", "Hanoi", "Thirty-six streets once named for the goods sold on each", 21.0341, 105.85, 1200),
        s("Malioboro Street", "Yogyakarta", "Street food, batik and becaks toward the sultan's palace", -7.7926, 110.3658, 1500),
        s("Naqsh-e Jahan Square", "Isfahan", "One of the world's largest squares, ringed by mosques and a bazaar", 32.6575, 51.6777, 700),
        s("Tahrir Square", "Cairo", "Cairo's central square, focus of the 2011 revolution", 30.0444, 31.2357, 700),
        s("Balogun Market", "Lagos Island", "A maze of fabric, electronics and everything else", 6.4595, 3.3875, 900),
        s("Oxford Street, Osu", "Accra", "Accra's liveliest street for food, shops and nightlife", 5.5571, -0.1819, 1000),
        s("Vilakazi Street", "Soweto", "The only street where two Nobel Peace Prize winners lived", -26.2378, 27.9086, 600),
        s("Long Street", "Cape Town", "Victorian balconies under Table Mountain", -33.922, 18.417, 900),
        s("Moi Avenue", "Nairobi", "The city centre's main street, past the Kenyatta Conference Centre", -1.2833, 36.825, 1000),
        s("Zócalo", "Mexico City", "The great square over the ruins of Aztec Tenochtitlan", 19.4326, -99.1332, 700),
        s("Plaza de Armas", "Cusco", "The Inca capital's square, rebuilt by the Spanish", -13.5167, -71.9788, 500),
        s("Avenida Atlântica", "Copacabana, Rio", "The wave-pattern promenade along Copacabana beach", -22.9711, -43.1822, 2500),
      ],
    },
    {
      title: "Mines",
      sites: [
        s("Bingham Canyon Mine", "Utah", "One of the largest human-made excavations", 40.523, -112.151, 5000),
        s("Chuquicamata", "Chile", "One of the largest open-pit copper mines", -22.29, -68.9, 6000),
        s("Kolwezi", "DR Congo", "Heart of the copper-cobalt belt that powers the world's batteries", -10.72, 25.47, 8000),
        s("Jwaneng", "Botswana", "The richest diamond mine in the world by value", -24.53, 24.7, 5000),
        s("Grasberg", "Papua, Indonesia", "One of the largest gold and copper mines, high in the mountains", -4.058, 137.116, 6000),
        s("Carajás", "Pará, Brazil", "The world's largest iron-ore mine, in the Amazon", -6.07, -50.18, 8000),
      ],
    },
  ],
  countries: [
    {
      title: "Extremes",
      sites: [
        s("Russia", "Europe and Asia", "Largest country, spanning 11 time zones", 61.0, 100.0, 2500000),
        s("Vatican City", "Rome", "Smallest country, 0.44 km²", 41.9029, 12.4534, 1000),
        s("Monaco", "French Riviera", "Most densely populated country", 43.7384, 7.4246, 2000),
        s("Mongolia", "Central Asia", "Least densely populated country", 46.9, 103.8, 900000),
        s("India", "South Asia", "Most populous country since 2023", 22.0, 79.0, 1500000),
        s("Kazakhstan", "Central Asia", "Largest landlocked country", 48.0, 67.0, 1200000),
      ],
    },
    {
      title: "Curiosities",
      sites: [
        s("Lesotho", "Southern Africa", "Surrounded by South Africa; all of it above 1,000 m", -29.6, 28.2, 150000),
        s("Indonesia", "Southeast Asia", "More than 17,000 islands", -2.5, 118.0, 1800000),
        s("Chile", "South America", "About 4,300 km long, never more than about 350 km wide", -30.0, -71.0, 1500000),
        s("Nauru", "Pacific Ocean", "Smallest republic, 21 km²", -0.5228, 166.9315, 5000),
        s("Singapore", "Southeast Asia", "A city-state that has grown about 25% by reclamation", 1.3521, 103.8198, 25000),
        s("Baarle-Hertog", "Belgium / Netherlands", "A patchwork of enclaves, some inside a single house", 51.44, 4.93, 2500),
        s("Bhutan", "Himalaya", "Absorbs more carbon than it emits", 27.5, 90.4, 150000),
      ],
    },
  ],
};

/** A theme's collections, or a general list if it has none. */
export function sitesFor(themeId: string): SiteCollection[] {
  return SITES[themeId] ?? SITES.land;
}

// Collections drawn from the bundled feature facts.
const short = (t: string) => {
  const first = t.split(/(?<=\.)\s/)[0].replace(/\.$/, "");
  if (first.length < 78) return first;
  const cut = first.slice(0, 76);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};
const fromFeatures = (theme: string, kind: FeatureKind, radius: (facts: [string, string][]) => number): Site[] => {
  const have = new Set(SITES[theme].flatMap((c) => c.sites.map((x) => x.name)));
  return FEATURES.filter((x) => x.kind === kind && !have.has(x.name)).map((x) => ({ name: x.name, where: x.facts.find(([k]) => k === "City")?.[1] ?? x.facts[0][1], why: short(x.blurb || x.facts.map((f) => f[1]).join(" · ")), lon: x.lon, lat: x.lat, radius: radius(x.facts) }));
};
const craterSize = (facts: [string, string][]) => {
  const v = facts[0][1], n = parseFloat(v.replace(/[^\d.]/g, "")) || 1;
  return Math.max(2500, (v.includes(" m") && !v.includes("km") ? n / 1000 : n) * 1500);
};
SITES.land.push({ title: "Impact craters", sites: fromFeatures("land", "crater", craterSize) });
SITES.water.push({ title: "Ocean deeps", sites: fromFeatures("water", "deep", () => 400_000) });
SITES.plants.push({ title: "Great forests", sites: fromFeatures("plants", "forest", () => 60_000) });
SITES.built.push({ title: "Metro systems", sites: fromFeatures("built", "metro", () => 20_000) });
SITES.water.push({ title: "Great lakes of the world", sites: fromFeatures("water", "lake", () => 80_000) });
SITES.water.push({ title: "Great waterfalls", sites: fromFeatures("water", "waterfall", () => 3000) });
SITES.land.push({ title: "Canyons of the world", sites: fromFeatures("land", "canyon", () => 30_000) });
SITES.land.push({ title: "Deserts", sites: fromFeatures("land", "desert", () => 900_000) });
SITES.land.push({ title: "Mountain ranges", sites: fromFeatures("land", "range", () => 900_000) });
SITES.land.push({ title: "Where the plates meet", sites: fromFeatures("land", "rift", () => 250_000) });
SITES.land.push({ title: "Plateaus", sites: fromFeatures("land", "plateau", () => 600_000) });
SITES.land.push({ title: "Caves", sites: fromFeatures("land", "cave", () => 4000) });
SITES.land.push({ title: "Islands", sites: fromFeatures("land", "island", () => 300_000) });
SITES.water.push({ title: "Ice", sites: fromFeatures("water", "glacier", () => 120_000) });
SITES.water.push({ title: "Coral reefs", sites: fromFeatures("water", "reef", () => 150_000) });
SITES.water.push({ title: "Wetlands and deltas", sites: fromFeatures("water", "wetland", () => 150_000) });
