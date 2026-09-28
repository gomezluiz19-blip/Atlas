// Facts about the world's notable natural and built features, for the lenses'
// "Worth knowing" cards: rivers, mountains, volcanoes, impact craters, ocean
// deeps, forests and metro systems. Figures are the commonly cited ones and
// sources differ (river lengths especially); coordinates mark the feature (for
// rivers, roughly the middle of the main stem).

export type FeatureKind = "river" | "peak" | "volcano" | "crater" | "deep" | "forest" | "metro";

export interface Feature {
  name: string;
  kind: FeatureKind;
  lon: number;
  lat: number;
  /** Other names people search for. */
  aka?: string[];
  /** Short label/value pairs. */
  facts: [string, string][];
  /** One or two sentences worth knowing. */
  blurb: string;
}

const f = (kind: FeatureKind, name: string, lat: number, lon: number, facts: [string, string][], blurb: string, aka?: string[]): Feature => ({ kind, name, lat, lon, facts, blurb, aka });
const river = (name: string, lat: number, lon: number, km: number, flow: number | null, mouth: string, blurb = "", aka?: string[]) =>
  f("river", name, lat, lon, [["Length", `about ${km.toLocaleString()} km`], ...(flow ? [["Average flow", `about ${flow.toLocaleString()} m³/s`] as [string, string]] : []), ["Ends in", mouth]], blurb, aka);
const peak = (name: string, lat: number, lon: number, m: number, first: string, range: string, blurb = "", aka?: string[]) =>
  f("peak", name, lat, lon, [["Height", `${m.toLocaleString()} m`], ["First climbed", first], ["Range", range]], blurb, aka);
const volcano = (name: string, lat: number, lon: number, m: number, type: string, known: string, blurb: string, aka?: string[]) =>
  f("volcano", name, lat, lon, [["Height", `${m.toLocaleString()} m`], ["Type", type], ["Known for", known]], blurb, aka);
const crater = (name: string, lat: number, lon: number, km: number, age: string, blurb: string, aka?: string[]) =>
  f("crater", name, lat, lon, [["Diameter", km < 1 ? `${Math.round(km * 1000)} m` : `about ${km} km`], ["Age", age], ["Origin", "Asteroid or comet impact"]], blurb, aka);
const deep = (name: string, lat: number, lon: number, m: number, ocean: string, blurb: string, aka?: string[]) =>
  f("deep", name, lat, lon, [["Deepest point", `about ${m.toLocaleString()} m`], ["Ocean", ocean]], blurb, aka);
const forest = (name: string, lat: number, lon: number, area: string, type: string, blurb: string, aka?: string[]) =>
  f("forest", name, lat, lon, [["Area", area], ["Type", type]], blurb, aka);
const metro = (name: string, city: string, lat: number, lon: number, opened: number, blurb: string, aka?: string[]) =>
  f("metro", name, lat, lon, [["City", city], ["Opened", String(opened)]], blurb, aka);

export const FEATURES: Feature[] = [
  // ---- Rivers -------------------------------------------------------------------------------
  river("Nile", 15.6, 32.5, 6650, 2800, "the Mediterranean Sea", "Usually counted the longest river. The White and Blue Niles meet at Khartoum; Egypt's farmland is a thin green strip along it.", ["White Nile", "Blue Nile"]),
  river("Amazon", -3.2, -60.0, 6400, 209000, "the Atlantic Ocean", "Carries about a fifth of all the river water reaching the oceans, more than the next seven rivers combined.", ["Amazonas", "Solimões"]),
  river("Yangtze", 30.6, 114.3, 6300, 30000, "the East China Sea", "The longest river in Asia. The Three Gorges Dam across it is the world's biggest power station.", ["Chang Jiang"]),
  river("Mississippi", 35.0, -90.1, 3730, 16800, "the Gulf of Mexico", "With the Missouri it drains about 40% of the lower 48 United States; its delta is still building out into the Gulf.", ["Mississippi River"]),
  river("Missouri", 41.0, -96.0, 3770, 2500, "the Mississippi", "North America's longest river, from the Rockies of Montana to St. Louis."),
  river("Yenisei", 60.0, 90.0, 5540, 19600, "the Kara Sea (Arctic)", "Divides western and eastern Siberia; its source basin includes Lake Baikal."),
  river("Yellow River", 35.0, 110.5, 5460, 2600, "the Bohai Sea", "Named for the loess silt it carries, the most of any major river; the cradle of Chinese civilisation.", ["Huang He"]),
  river("Ob", 61.0, 69.0, 3650, 12500, "the Gulf of Ob (Arctic)", "With the Irtysh it forms one of the longest river systems in Asia."),
  river("Irtysh", 53.0, 76.0, 4250, 2800, "the Ob"),
  river("Paraná", -27.4, -58.5, 4880, 17000, "the Río de la Plata (Atlantic)", "Joins the Uruguay to form the Río de la Plata; the Itaipú Dam on it is one of the world's largest hydro plants."),
  river("Congo", -2.0, 22.0, 4700, 41000, "the Atlantic Ocean", "The world's deepest river (over 220 m in places) and second by flow; it crosses the equator twice.", ["Zaire"]),
  river("Amur", 50.0, 128.0, 4440, 11400, "the Strait of Tartary (Pacific)", "Forms much of the border between Russia and China."),
  river("Lena", 64.0, 125.0, 4400, 17000, "the Laptev Sea (Arctic)", "Flows through permafrost; its delta is a vast Arctic wetland."),
  river("Mekong", 15.0, 105.8, 4350, 16000, "the South China Sea", "Feeds one of the world's richest freshwater fisheries and the rice of Vietnam's delta."),
  river("Mackenzie", 64.0, -125.0, 1740, 9900, "the Beaufort Sea (Arctic)", "Canada's longest river system, flowing north to the Arctic."),
  river("Niger", 13.5, 2.0, 4200, 5600, "the Gulf of Guinea", "Takes a great boomerang bend, flowing into the Sahara before turning south; the Inner Niger Delta floods each year."),
  river("Murray", -34.3, 140.5, 2510, 770, "the Southern Ocean", "Australia's longest river; with the Darling it drains a seventh of the continent.", ["Murray River"]),
  river("Darling", -31.0, 144.0, 1470, null, "the Murray"),
  river("Volga", 51.0, 46.0, 3530, 8000, "the Caspian Sea", "Europe's longest river, flowing into a lake (the Caspian) rather than the ocean."),
  river("Danube", 45.0, 21.0, 2850, 6500, "the Black Sea", "Flows through or along ten countries, more than any other river, and four capitals.", ["Donau", "Duna", "Dunărea"]),
  river("Ganges", 25.4, 83.0, 2525, 16600, "the Bay of Bengal", "Sacred in Hinduism; with the Brahmaputra it builds the world's largest delta.", ["Ganga"]),
  river("Brahmaputra", 26.2, 91.7, 2900, 19800, "the Bay of Bengal", "Rises in Tibet as the Yarlung Tsangpo and cuts the world's deepest canyon through the Himalaya.", ["Yarlung Tsangpo", "Jamuna"]),
  river("Indus", 28.0, 69.5, 3180, 6600, "the Arabian Sea", "Cradle of the Harappan civilisation; waters most of Pakistan's farmland."),
  river("Zambezi", -16.5, 28.0, 2570, 3400, "the Indian Ocean", "Plunges over Victoria Falls; Kariba and Cahora Bassa dams make huge lakes on it."),
  river("Orinoco", 7.8, -64.5, 2140, 37000, "the Atlantic Ocean", "Linked to the Amazon by the Casiquiare, a natural channel between two river basins."),
  river("Rhine", 50.4, 7.6, 1230, 2300, "the North Sea", "Europe's busiest waterway, from the Swiss Alps to Rotterdam.", ["Rhein", "Rijn", "Rhin"]),
  river("Colorado", 36.1, -112.1, 2330, 600, "the Gulf of California (rarely reaches it now)", "Carved the Grand Canyon; so much is taken for cities and farms that it seldom reaches the sea.", ["Colorado River"]),
  river("Columbia", 46.2, -119.0, 2000, 7500, "the Pacific Ocean", "The largest river flowing into the Pacific from the Americas; dozens of dams generate much of the Northwest's power."),
  river("St. Lawrence", 47.0, -70.5, 1200, 10100, "the Gulf of St. Lawrence (Atlantic)", "Drains the Great Lakes to the Atlantic; the Seaway lets ships reach the heart of the continent.", ["Saint Lawrence", "Saint-Laurent"]),
  river("Yukon", 64.0, -153.0, 3190, 6400, "the Bering Sea", "Famous for the Klondike gold rush of the 1890s."),
  river("Rio Grande", 29.5, -104.0, 3050, 80, "the Gulf of Mexico", "Forms the border between Texas and Mexico; much of its water is used before the sea.", ["Río Bravo"]),
  river("Tigris", 34.0, 43.8, 1850, 1000, "the Shatt al-Arab (Persian Gulf)", "With the Euphrates it defines Mesopotamia, where cities and writing began."),
  river("Euphrates", 34.5, 40.5, 2800, 800, "the Shatt al-Arab (Persian Gulf)", "The longest river of western Asia."),
  river("Thames", 51.5, -0.9, 346, 65, "the North Sea", "Tidal through London; the Thames Barrier protects the city from surge tides.", ["River Thames"]),
  river("Seine", 49.0, 1.5, 777, 560, "the English Channel", "Flows through Paris; its banks there are a World Heritage site."),
  river("Loire", 47.4, 0.7, 1010, 840, "the Bay of Biscay", "France's longest river, lined with Renaissance châteaux."),
  river("Elbe", 52.5, 11.5, 1090, 870, "the North Sea", "Runs from the Czech Republic through Dresden to Hamburg.", ["Labe"]),
  river("Rhône", 44.5, 4.7, 813, 1700, "the Mediterranean Sea", "Born from the Rhône Glacier in Switzerland; ends in the Camargue delta.", ["Rhone"]),
  river("Po", 45.0, 10.5, 652, 1540, "the Adriatic Sea", "Italy's longest river, watering the Po Valley farmland."),
  river("Dnieper", 49.0, 32.5, 2200, 1700, "the Black Sea", "Flows through Kyiv; the fourth-longest river in Europe.", ["Dnipro"]),
  river("Don", 49.0, 41.0, 1870, 900, "the Sea of Azov"),
  river("Irrawaddy", 20.0, 95.0, 2170, 13000, "the Andaman Sea", "Myanmar's lifeline, from the Himalaya to a rice-growing delta.", ["Ayeyarwady"]),
  river("Salween", 20.0, 98.0, 2800, 4900, "the Andaman Sea", "One of Asia's last long free-flowing rivers.", ["Nu", "Thanlwin"]),
  river("Ohio", 38.7, -85.5, 1580, 8000, "the Mississippi", "Carries more water than the upper Mississippi where they meet at Cairo, Illinois."),
  river("Hudson", 41.8, -73.95, 507, 600, "the Atlantic at New York", "Tidal for 250 km north of New York City."),
  river("Tagus", 39.5, -6.5, 1010, 500, "the Atlantic at Lisbon", "The longest river of the Iberian Peninsula.", ["Tajo", "Tejo"]),
  river("Vistula", 52.2, 20.0, 1050, 1080, "the Baltic Sea", "Poland's longest river, through Kraków and Warsaw.", ["Wisła"]),
  river("Okavango", -19.0, 22.8, 1600, 300, "the Kalahari (an inland delta)", "Never reaches the sea: it spreads into the Okavango Delta and evaporates."),
  river("Orange", -28.6, 20.0, 2200, 365, "the Atlantic Ocean", "South Africa's longest river."),
  river("Limpopo", -22.3, 30.0, 1750, 170, "the Indian Ocean", "Kipling's 'great grey-green, greasy Limpopo'."),
  river("São Francisco", -10.0, -41.0, 2910, 2900, "the Atlantic Ocean", "Brazil's longest river flowing entirely within the country.", ["Sao Francisco"]),
  river("Magdalena", 7.0, -74.0, 1530, 7200, "the Caribbean Sea", "Colombia's main river."),
  river("Fraser", 51.0, -122.0, 1375, 3500, "the Pacific at Vancouver", "One of the world's great salmon rivers."),
  river("Shannon", 53.2, -8.0, 360, 200, "the Atlantic Ocean", "Ireland's longest river."),
  river("Jordan", 32.0, 35.55, 250, 15, "the Dead Sea", "Ends at the lowest land on Earth, 430 m below sea level."),

  // ---- Mountains -----------------------------------------------------------------------------
  peak("Mount Everest", 27.988, 86.925, 8849, "1953, Tenzing Norgay and Edmund Hillary", "Himalaya", "Earth's highest summit above sea level; its top is marine limestone, once a seabed.", ["Everest", "Sagarmatha", "Chomolungma"]),
  peak("K2", 35.881, 76.513, 8611, "1954, Lino Lacedelli and Achille Compagnoni", "Karakoram", "The second highest, and one of the most dangerous to climb.", ["Chhogori", "Mount Godwin-Austen"]),
  peak("Kangchenjunga", 27.703, 88.147, 8586, "1955, Joe Brown and George Band", "Himalaya", "The third highest; the first climbers stopped short of the summit to respect local belief."),
  peak("Lhotse", 27.962, 86.933, 8516, "1956", "Himalaya", "Joined to Everest by the South Col."),
  peak("Makalu", 27.889, 87.089, 8485, "1955", "Himalaya", "A near-perfect four-sided pyramid."),
  peak("Cho Oyu", 28.094, 86.661, 8188, "1954", "Himalaya", "Often called the most approachable of the 8,000 m peaks."),
  peak("Dhaulagiri", 28.698, 83.487, 8167, "1960", "Himalaya"),
  peak("Manaslu", 28.549, 84.559, 8163, "1956", "Himalaya"),
  peak("Nanga Parbat", 35.237, 74.589, 8126, "1953, Hermann Buhl (solo to the top)", "Himalaya", "Its Rupal Face rises about 4,600 m from base to summit, one of the biggest mountain walls."),
  peak("Annapurna", 28.596, 83.820, 8091, "1950, Maurice Herzog and Louis Lachenal", "Himalaya", "The first 8,000 m peak to be climbed."),
  peak("Gasherbrum I", 35.724, 76.696, 8080, "1958", "Karakoram", "Hidden Peak."),
  peak("Broad Peak", 35.810, 76.565, 8051, "1957", "Karakoram"),
  peak("Gasherbrum II", 35.758, 76.653, 8035, "1956", "Karakoram"),
  peak("Shishapangma", 28.352, 85.780, 8027, "1964", "Himalaya", "The only 8,000 m peak entirely in Tibet."),
  peak("Aconcagua", -32.653, -70.011, 6961, "1897, Matthias Zurbriggen", "Andes", "The highest mountain outside Asia, in both the Western and Southern hemispheres."),
  peak("Denali", 63.069, -151.007, 6190, "1913, Hudson Stuck's party", "Alaska Range", "About 5,500 m from base to summit, a bigger rise than Everest's from its plateau.", ["Mount McKinley"]),
  peak("Mount Logan", 60.567, -140.405, 5959, "1925", "Saint Elias Mountains", "Canada's highest; it may have the largest base of any non-volcanic mountain."),
  peak("Mount Elbrus", 43.355, 42.439, 5642, "1874 (west summit)", "Caucasus", "Europe's highest mountain, a dormant volcano.", ["Elbrus"]),
  peak("Vinson Massif", -78.525, -85.617, 4892, "1966", "Ellsworth Mountains", "Antarctica's highest.", ["Mount Vinson"]),
  peak("Puncak Jaya", -4.078, 137.158, 4884, "1962, Heinrich Harrer's party", "Sudirman Range", "The highest island peak in the world, with shrinking equatorial glaciers.", ["Carstensz Pyramid"]),
  peak("Mont Blanc", 45.833, 6.865, 4806, "1786, Jacques Balmat and Michel-Gabriel Paccard", "Alps", "The highest peak of the Alps; its first ascent is often called the birth of mountaineering.", ["Monte Bianco"]),
  peak("Matterhorn", 45.976, 7.658, 4478, "1865, Edward Whymper's party", "Alps", "Four of the seven first-ascent climbers died on the descent.", ["Monte Cervino", "Mont Cervin"]),
  peak("Eiger", 46.577, 8.005, 3967, "1858", "Alps", "Its North Face, 1,800 m of rock and ice, was first climbed in 1938."),
  peak("Mount Whitney", 36.579, -118.292, 4421, "1873", "Sierra Nevada", "The highest peak in the lower 48 states, 136 km from the lowest point, Badwater in Death Valley."),
  peak("Mount Kosciuszko", -36.456, 148.263, 2228, "1840", "Great Dividing Range", "Mainland Australia's highest; you can walk to the top."),
  peak("Ben Nevis", 56.797, -5.004, 1345, "1771", "Grampians", "Britain's highest mountain."),
  peak("Table Mountain", -33.963, 18.403, 1085, "1503, António de Saldanha", "Cape Fold Belt", "Its flat top is often covered by a 'tablecloth' of cloud."),
  peak("Mount Olympus", 40.086, 22.358, 2918, "1913", "Olympus massif", "Home of the gods in Greek myth; Greece's highest.", ["Olympus"]),
  peak("Aoraki / Mount Cook", -43.595, 170.142, 3724, "1894", "Southern Alps", "New Zealand's highest, lower since a 1991 rock avalanche took 10 m off the top.", ["Mount Cook", "Aoraki"]),
  peak("Chimborazo", -1.469, -78.817, 6263, "1880, Edward Whymper", "Andes", "Because Earth bulges at the equator, its summit is the point farthest from Earth's centre."),
  peak("Huascarán", -9.122, -77.604, 6768, "1932", "Cordillera Blanca", "Peru's highest; the tallest tropical mountain."),
  peak("Mount Kinabalu", 6.075, 116.558, 4095, "1851 (Hugh Low reached the plateau)", "Crocker Range", "A hotspot of plant life, with hundreds of orchid species."),
  peak("Toubkal", 31.060, -7.915, 4167, "1923", "Atlas Mountains", "North Africa's highest."),
  peak("Mount Ararat", 39.702, 44.298, 5137, "1829, Friedrich Parrot", "Armenian Highlands", "A dormant volcano, linked in tradition with Noah's Ark.", ["Ararat", "Ağrı Dağı"]),
  peak("Mount Damavand", 35.955, 52.110, 5610, "905 (recorded)", "Alborz", "Asia's highest volcano.", ["Damavand"]),

  // ---- Volcanoes ----------------------------------------------------------------------------
  volcano("Mount Etna", 37.751, 14.993, 3357, "stratovolcano", "near-constant activity", "Europe's highest active volcano and one of the most active anywhere; farmers grow vines and pistachios on its rich soils.", ["Etna"]),
  volcano("Mount Vesuvius", 40.821, 14.426, 1281, "stratovolcano", "burying Pompeii and Herculaneum in AD 79", "Last erupted in 1944; about 600,000 people live in its red zone.", ["Vesuvius", "Vesuvio"]),
  volcano("Stromboli", 38.789, 15.213, 924, "stratovolcano", "small explosions every few minutes", "Called the Lighthouse of the Mediterranean; 'Strombolian' eruptions are named after it."),
  volcano("Kīlauea", 19.421, -155.287, 1247, "shield volcano", "lava lakes and flows", "One of the most active volcanoes on Earth; its 2018 eruption destroyed over 700 homes.", ["Kilauea"]),
  volcano("Mauna Loa", 19.475, -155.608, 4169, "shield volcano", "being the largest active volcano on Earth", "Rises about 9 km from the sea floor; its flows built much of Hawaiʻi Island."),
  volcano("Mauna Kea", 19.821, -155.468, 4207, "shield volcano", "being the tallest mountain from base to summit", "About 10,200 m from the ocean floor; its summit hosts major observatories."),
  volcano("Mount St. Helens", 46.191, -122.195, 2549, "stratovolcano", "the 1980 lateral blast", "The 18 May 1980 eruption removed 400 m of the summit in a landslide and blast.", ["St. Helens", "Saint Helens"]),
  volcano("Mount Rainier", 46.853, -121.760, 4392, "stratovolcano", "glaciers and mudflow (lahar) risk", "The most glaciated peak in the lower 48 states; towns are built on old lahars.", ["Rainier", "Tahoma"]),
  volcano("Mount Fuji", 35.361, 138.728, 3776, "stratovolcano", "its near-perfect cone", "Last erupted in 1707; Japan's highest mountain and a sacred site.", ["Fuji", "Fujisan"]),
  volcano("Krakatoa", -6.102, 105.423, 813, "caldera with a growing cone", "the 1883 explosion", "The 1883 blast was heard 4,800 km away; Anak Krakatau ('child of Krakatoa') rose from the sea in 1927.", ["Krakatau", "Anak Krakatau"]),
  volcano("Mount Tambora", -8.25, 118.0, 2850, "stratovolcano", "the largest eruption in recorded history (1815)", "Its ash cooled the world: 1816 was 'the year without a summer'.", ["Tambora"]),
  volcano("Mount Pinatubo", 15.13, 120.35, 1486, "stratovolcano", "the 1991 eruption", "The 1991 eruption cooled the planet by about 0.5 °C for a year.", ["Pinatubo"]),
  volcano("Eyjafjallajökull", 63.63, -19.62, 1651, "ice-capped stratovolcano", "grounding European flights in 2010", "Its 2010 ash cloud closed much of Europe's airspace for six days."),
  volcano("Hekla", 63.98, -19.70, 1491, "stratovolcano", "frequent eruptions since settlement", "Medieval Europeans called it the gateway to hell."),
  volcano("Popocatépetl", 19.023, -98.622, 5426, "stratovolcano", "frequent ash emissions near Mexico City", "About 25 million people live within 100 km.", ["Popocatepetl", "El Popo"]),
  volcano("Cotopaxi", -0.681, -78.436, 5897, "stratovolcano", "its glacier-capped cone", "One of the highest active volcanoes; melting ice can send lahars toward nearby towns."),
  volcano("Nyiragongo", -1.52, 29.25, 3470, "stratovolcano", "a lava lake and very fast lava flows", "Its runny lava has reached 60 km/h, among the fastest recorded."),
  volcano("Mount Erebus", -77.53, 167.17, 3794, "stratovolcano", "a long-lived lava lake in Antarctica", "The southernmost active volcano."),
  volcano("Yellowstone Caldera", 44.43, -110.67, 2800, "supervolcano caldera", "geysers and three huge eruptions", "The last caldera-forming eruption was 640,000 years ago; its heat drives Old Faithful.", ["Yellowstone"]),
  volcano("Lake Toba", 2.68, 98.88, 2157, "supervolcano caldera", "the largest eruption of the last 2 million years", "About 74,000 years ago; the caldera is now a 100 km lake.", ["Toba"]),
  volcano("Santorini", 36.404, 25.396, 367, "caldera", "the Minoan eruption, about 1600 BC", "The island's crescent is the rim of a flooded caldera.", ["Thera"]),
  volcano("Hunga Tonga–Hunga Haʻapai", -20.55, -175.39, 114, "submarine volcano", "the 2022 explosion", "Its 2022 eruption sent a plume 57 km high and a pressure wave around the world several times.", ["Hunga Tonga"]),
  volcano("Mount Merapi", -7.54, 110.446, 2910, "stratovolcano", "frequent pyroclastic flows", "One of Indonesia's most active volcanoes, above the city of Yogyakarta.", ["Merapi"]),
  volcano("Mayon", 13.257, 123.685, 2463, "stratovolcano", "the most perfect cone", "The Philippines' most active volcano."),
  volcano("Sakurajima", 31.593, 130.657, 1117, "stratovolcano", "near-daily small eruptions", "Joined to the mainland by its own 1914 lava flow."),
  volcano("Villarrica", -39.42, -71.93, 2847, "stratovolcano", "a lava lake in its crater", "One of Chile's most active volcanoes, above a ski resort."),
  volcano("Mount Ruapehu", -39.28, 175.57, 2797, "stratovolcano", "a warm crater lake", "New Zealand's largest active volcano, with ski fields on its slopes.", ["Ruapehu"]),
  volcano("Arenal", 10.463, -84.703, 1670, "stratovolcano", "near-continuous eruption from 1968 to 2010", "Costa Rica's youngest volcano."),
  volcano("Mount Pelée", 14.81, -61.17, 1397, "stratovolcano", "the 1902 disaster", "Its 1902 pyroclastic flow destroyed the town of Saint-Pierre in minutes.", ["Pelée"]),
  volcano("Ol Doinyo Lengai", -2.764, 35.914, 2962, "stratovolcano", "the only active carbonatite volcano", "Its lava is black when it erupts and turns white as it cools."),
  volcano("Kilimanjaro", -3.067, 37.356, 5895, "dormant stratovolcano", "being Africa's highest mountain", "The world's tallest free-standing mountain; its ice fields are shrinking fast.", ["Mount Kilimanjaro", "Kibo"]),
  volcano("Paricutín", 19.493, -102.251, 3170, "cinder cone", "being born in a cornfield in 1943", "Grew from a crack in a farmer's field to 424 m in nine years.", ["Paricutin"]),

  // ---- Impact craters -----------------------------------------------------------------------
  crater("Meteor Crater", 35.027, -111.022, 1.19, "about 50,000 years", "The best preserved impact crater on Earth; it proved that impacts shape planets.", ["Barringer Crater"]),
  crater("Vredefort", -27.0, 27.5, 300, "about 2 billion years", "The largest known impact structure on Earth, now deeply eroded; a World Heritage site.", ["Vredefort Dome"]),
  crater("Chicxulub", 21.3, -89.5, 180, "66 million years", "The impact that ended the age of the dinosaurs; buried under Yucatán, traced by a ring of sinkholes (cenotes).", ["Chicxulub crater"]),
  crater("Sudbury Basin", 46.6, -81.18, 130, "1.85 billion years", "One of the world's richest nickel and copper mining districts formed in the melt of this impact.", ["Sudbury"]),
  crater("Popigai", 71.65, 111.18, 100, "35.7 million years", "Its rocks hold impact diamonds, formed when graphite was shocked."),
  crater("Manicouagan", 51.38, -68.7, 100, "214 million years", "A ring-shaped lake (a reservoir) visible from space: 'the eye of Quebec'.", ["Manicouagan Reservoir"]),
  crater("Acraman", -32.02, 135.45, 90, "about 580 million years", "Its ejecta layer has been found 300 km away in the Flinders Ranges."),
  crater("Chesapeake Bay crater", 37.28, -76.02, 40, "35.5 million years", "Buried under the bay; it still shapes the region's groundwater."),
  crater("Siljan Ring", 61.03, 14.87, 52, "377 million years", "Europe's largest known impact; lakes trace the ring.", ["Siljan"]),
  crater("Charlevoix", 47.53, -70.3, 54, "about 342 million years", "Half the crater lies under the St. Lawrence River."),
  crater("Nördlinger Ries", 48.88, 10.62, 24, "14.8 million years", "The town of Nördlingen sits inside it; its church is built of impact rock (suevite).", ["Ries crater", "Nördlingen"]),
  crater("Steinheim crater", 48.69, 10.07, 3.8, "14.8 million years", "Formed with the Ries, perhaps by a companion of the same asteroid."),
  crater("Pingualuit crater", 61.28, -73.66, 3.44, "1.4 million years", "Holds one of the clearest lakes in the world.", ["Pingualuit"]),
  crater("Wolfe Creek crater", -19.17, 127.8, 0.88, "about 120,000 years", "A near-perfect ring in the Australian desert.", ["Wolfe Creek"]),
  crater("Lonar Lake", 19.98, 76.51, 1.83, "about 570,000 years", "An impact crater in basalt, holding a salty, alkaline lake.", ["Lonar crater"]),
  crater("Lake Bosumtwi", 6.5, -1.41, 10.5, "1.07 million years", "Ghana's only natural lake, sacred to the Ashanti.", ["Bosumtwi"]),
  crater("Gosses Bluff", -23.82, 132.31, 22, "142 million years", "The eroded central uplift stands as a ring of hills.", ["Tnorala"]),
  crater("Kaali crater", 58.37, 22.67, 0.11, "about 3,500 years", "A small crater field on Saaremaa, seen by people when it formed.", ["Kaali"]),
  crater("Tswaing crater", -25.41, 28.08, 1.13, "about 220,000 years", "A salt lake in a crater near Pretoria.", ["Tswaing"]),
  crater("Clearwater Lakes", 56.2, -74.3, 36, "about 290 and 460 million years", "Two lakes once thought to be twin craters; they formed at different times.", ["Clearwater"]),
  crater("Haughton crater", 75.38, -89.67, 23, "about 31 million years", "On Devon Island, used to rehearse missions to Mars.", ["Haughton"]),
  crater("Aorounga", 19.1, 19.25, 12.6, "less than 345 million years", "Its rings stand out in the Sahara, sculpted by wind."),
  crater("Roter Kamm", -27.77, 16.3, 2.5, "3.7 million years", "Half filled by Namib sand."),
  crater("Tenoumer crater", 22.92, -10.4, 1.9, "about 21,000 years", "A clear bowl in the Mauritanian desert.", ["Tenoumer"]),
  crater("Mistastin Lake", 55.88, -63.3, 28, "36 million years", "Its impact glass helped astronauts learn lunar geology.", ["Mistastin"]),
  crater("Kara crater", 69.1, 64.15, 65, "70 million years", "Near the Kara Sea in Arctic Russia."),
  crater("Morokweng", -26.47, 23.53, 70, "145 million years", "Buried under the Kalahari; a fragment of the asteroid itself was found in its melt."),

  // ---- Ocean deeps ---------------------------------------------------------------------------
  deep("Mariana Trench", 11.35, 142.2, 10935, "Pacific", "Challenger Deep is the deepest known point in the oceans; only a handful of people have been to the bottom.", ["Challenger Deep", "Marianas Trench"]),
  deep("Tonga Trench", -23.25, -174.7, 10800, "Pacific", "Horizon Deep is the second deepest point; the fastest plate convergence on Earth.", ["Horizon Deep"]),
  deep("Kermadec Trench", -31.9, -177.3, 10047, "Pacific", "Continues the Tonga Trench south toward New Zealand."),
  deep("Philippine Trench", 10.4, 126.7, 10540, "Pacific", "Galathea Depth is one of the deepest points on Earth.", ["Galathea Depth"]),
  deep("Kuril–Kamchatka Trench", 44.1, 150.6, 9600, "Pacific", "Where the Pacific plate dives under the Okhotsk plate.", ["Kuril Trench"]),
  deep("Izu–Ogasawara Trench", 29.1, 142.8, 9780, "Pacific", "South of Tokyo, part of the Pacific's Ring of Fire.", ["Izu-Bonin Trench"]),
  deep("Japan Trench", 38.0, 144.0, 8400, "Pacific", "The source of the 2011 Tōhoku earthquake and tsunami."),
  deep("Aleutian Trench", 51.3, -174.0, 7680, "Pacific", "Follows the arc of the Aleutian Islands."),
  deep("Peru–Chile Trench", -23.4, -71.3, 8065, "Pacific", "5,900 km long, beside the Andes; Richards Deep is its deepest point.", ["Atacama Trench"]),
  deep("Middle America Trench", 14.0, -93.0, 6670, "Pacific", "Along Mexico and Central America."),
  deep("Puerto Rico Trench", 19.77, -66.9, 8376, "Atlantic", "Milwaukee Deep is the Atlantic's deepest point.", ["Milwaukee Deep"]),
  deep("South Sandwich Trench", -55.2, -26.2, 8265, "Southern Ocean and Atlantic", "The deepest point of the Southern Ocean."),
  deep("Cayman Trough", 19.2, -80.0, 7686, "Caribbean", "Where the North American and Caribbean plates slide past each other."),
  deep("Java Trench", -10.3, 110.0, 7290, "Indian", "The Indian Ocean's deepest point; the 2004 tsunami began at its northern end.", ["Sunda Trench"]),
  deep("Molloy Deep", 79.14, 2.8, 5550, "Arctic", "The deepest point of the Arctic Ocean, in the Fram Strait."),

  // ---- Forests ---------------------------------------------------------------------------------
  forest("Amazon rainforest", -3.5, -62.0, "about 5.5 million km²", "tropical rainforest", "The largest rainforest, home to around one in ten known species; it makes much of its own rain.", ["Amazon", "Amazonia"]),
  forest("Congo rainforest", 0.5, 20.0, "about 2 million km²", "tropical rainforest", "The second largest rainforest; home to gorillas, bonobos and forest elephants.", ["Congo Basin"]),
  forest("Taiga of Siberia", 62.0, 100.0, "part of the boreal forest", "boreal forest (larch, pine, spruce)", "The boreal forest is the largest land biome; Siberia's larches shed their needles in winter.", ["Siberian taiga"]),
  forest("Daintree Rainforest", -16.17, 145.42, "about 1,200 km²", "tropical rainforest", "Perhaps the oldest continuously surviving tropical rainforest, over 100 million years old.", ["Daintree"]),
  forest("Black Forest", 48.3, 8.2, "about 6,000 km²", "conifer and mixed forest", "Dense spruce and fir on granite hills; the home of the cuckoo clock.", ["Schwarzwald"]),
  forest("Białowieża Forest", 52.7, 23.8, "about 1,400 km²", "primeval mixed forest", "One of Europe's last primeval lowland forests, home to wild European bison.", ["Bialowieza"]),
  forest("Sherwood Forest", 53.2, -1.07, "about 4 km² of ancient woodland", "oak woodland", "Robin Hood's forest; the Major Oak is about 1,000 years old."),
  forest("New Forest", 50.87, -1.6, "about 570 km²", "heath and ancient woodland", "Ponies, cattle and pigs still graze it under medieval commoners' rights."),
  forest("Tongass National Forest", 57.0, -134.0, "about 69,000 km²", "temperate rainforest", "The largest national forest in the United States."),
  forest("Great Bear Rainforest", 52.5, -128.0, "about 64,000 km²", "temperate rainforest", "Home of the white 'spirit bear'."),
  forest("Redwood National and State Parks", 41.3, -124.0, "about 540 km²", "coast redwood forest", "The world's tallest trees; Hyperion is about 116 m.", ["Redwood National Park", "Redwoods"]),
  forest("Sequoia National Park", 36.56, -118.75, "about 1,635 km²", "giant sequoia groves", "General Sherman is the largest single tree by volume.", ["Giant Forest"]),
  forest("Hoh Rain Forest", 47.86, -123.93, "about 100 km²", "temperate rainforest", "One of the wettest places in the lower 48 states: over 3.5 m of rain a year."),
  forest("Sundarbans", 21.95, 89.18, "about 10,000 km²", "mangrove forest", "The largest mangrove forest, home to Bengal tigers that swim between islands."),
  forest("Monteverde Cloud Forest", 10.3, -84.8, "about 105 km²", "cloud forest", "Trees draped in moss and orchids catch water straight from the clouds."),
  forest("Valdivian temperate rainforest", -40.5, -72.5, "about 250,000 km²", "temperate rainforest", "Home of alerce trees that live over 3,000 years."),
  forest("Atlantic Forest", -23.0, -45.0, "about 12% of its original extent remains", "tropical and subtropical forest", "A biodiversity hotspot along Brazil's coast.", ["Mata Atlântica"]),
  forest("Yakushima", 30.35, 130.53, "about 500 km²", "ancient cedar forest", "Jōmon Sugi is a cedar thought to be several thousand years old."),
  forest("Aokigahara", 35.47, 138.62, "about 30 km²", "forest on lava", "Grows on the 864 AD lava flow from Mount Fuji."),
  forest("Borneo lowland rainforest", 1.0, 114.5, "about 427,000 km² (ecoregion)", "tropical rainforest", "Among the richest forests in tree species; home to orangutans."),
  forest("Ardennes", 50.0, 5.5, "about 11,000 km²", "mixed forest", "Rolling forested hills across Belgium, Luxembourg and France."),
  forest("Fontainebleau Forest", 48.4, 2.65, "about 250 km²", "mixed forest on sandstone", "A royal hunting forest, now famous for bouldering."),

  // ---- Metro systems ---------------------------------------------------------------------------
  metro("London Underground", "London", 51.507, -0.128, 1863, "The world's first underground railway; 'the Tube' carries millions a day.", ["The Tube", "Tube"]),
  metro("New York City Subway", "New York", 40.75, -73.99, 1904, "Runs 24 hours a day, every day: one of very few metros that never closes.", ["NYC Subway"]),
  metro("Paris Métro", "Paris", 48.857, 2.352, 1900, "Opened for the 1900 World's Fair; its Art Nouveau entrances are by Hector Guimard.", ["Paris Metro"]),
  metro("Budapest Metro", "Budapest", 47.498, 19.04, 1896, "Line 1 is the oldest underground line in continental Europe."),
  metro("Berlin U-Bahn", "Berlin", 52.52, 13.405, 1902, "Divided by the Wall from 1961 to 1989; some stations became 'ghost stations'.", ["U-Bahn"]),
  metro("Madrid Metro", "Madrid", 40.417, -3.704, 1919, "One of the longest metro systems in Europe."),
  metro("Tokyo Metro and Toei Subway", "Tokyo", 35.681, 139.767, 1927, "Among the busiest in the world, famous for punctuality.", ["Tokyo Metro", "Toei"]),
  metro("Moscow Metro", "Moscow", 55.756, 37.617, 1935, "Its stations are palaces: chandeliers, mosaics and marble.", ["Moscow Metro"]),
  metro("Stockholm Metro", "Stockholm", 59.33, 18.07, 1950, "Called the world's longest art gallery; many stations are carved into bedrock.", ["Tunnelbana"]),
  metro("Toronto Subway", "Toronto", 43.653, -79.383, 1954, "Canada's first subway."),
  metro("Montreal Metro", "Montreal", 45.5, -73.567, 1966, "Runs on rubber tyres, linked to a large underground city.", ["Métro de Montréal"]),
  metro("Mexico City Metro", "Mexico City", 19.433, -99.133, 1969, "Each station has its own pictogram, from when many riders couldn't read.", ["Metro CDMX"]),
  metro("Beijing Subway", "Beijing", 39.904, 116.407, 1969, "One of the longest and busiest metro systems in the world."),
  metro("Seoul Subway", "Seoul", 37.566, 126.978, 1974, "Heated seats, Wi-Fi and screen doors on every line.", ["Seoul Metropolitan Subway"]),
  metro("São Paulo Metro", "São Paulo", -23.55, -46.633, 1974, "Among the most crowded metros in the world.", ["Metrô de São Paulo"]),
  metro("Washington Metro", "Washington, D.C.", 38.9, -77.036, 1976, "Coffered concrete vaults make its stations instantly recognisable.", ["WMATA", "Metrorail"]),
  metro("Hong Kong MTR", "Hong Kong", 22.302, 114.177, 1979, "Profitable, punctual and built over with its own property.", ["MTR"]),
  metro("Singapore MRT", "Singapore", 1.29, 103.85, 1987, "Driverless on its newer lines.", ["MRT"]),
  metro("Shanghai Metro", "Shanghai", 31.23, 121.47, 1993, "Grew from nothing in 1993 to the longest metro network in the world.", ["Shanghai Metro"]),
  metro("Delhi Metro", "Delhi", 28.632, 77.219, 2002, "India's largest metro, one of the fastest-growing anywhere."),
  metro("Dubai Metro", "Dubai", 25.2, 55.27, 2009, "Driverless, with air-conditioned stations."),
  metro("Copenhagen Metro", "Copenhagen", 55.676, 12.568, 2002, "Fully automatic, running around the clock."),
  metro("Santiago Metro", "Santiago", -33.44, -70.65, 1975, "One of the most extensive in Latin America."),
  metro("Cairo Metro", "Cairo", 30.044, 31.236, 1987, "Africa's first full metro system."),
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^(the|mount|mt\.?|lake|river)\s+/g, "").replace(/\s+(river|trench|crater|forest|rainforest|volcano|metro|subway)$/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function km(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const r = Math.PI / 180, a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/**
 * The feature that matches a name (and is plausibly the one meant, given where
 * it is), else the nearest of the given kinds within `withinKm`.
 */
export function featureFor(opts: { name?: string; lon: number; lat: number; kinds?: FeatureKind[]; withinKm?: number }): Feature | undefined {
  const pool = opts.kinds ? FEATURES.filter((x) => opts.kinds!.includes(x.kind)) : FEATURES;
  if (opts.name) {
    const n = norm(opts.name);
    if (n) {
      const hit = pool.filter((x) => [x.name, ...(x.aka ?? [])].some((a) => norm(a) === n))
        .sort((a, b) => km(opts.lon, opts.lat, a.lon, a.lat) - km(opts.lon, opts.lat, b.lon, b.lat))[0];
      // Rivers are long: accept a name match anywhere within 3,000 km; other things within 300 km.
      if (hit && km(opts.lon, opts.lat, hit.lon, hit.lat) < (hit.kind === "river" || hit.kind === "forest" ? 3000 : 300)) return hit;
    }
  }
  if (opts.withinKm) {
    let best: Feature | undefined, bd = Infinity;
    for (const x of pool) {
      const d = km(opts.lon, opts.lat, x.lon, x.lat);
      if (d < bd) { bd = d; best = x; }
    }
    if (best && bd <= opts.withinKm) return best;
  }
  return undefined;
}
