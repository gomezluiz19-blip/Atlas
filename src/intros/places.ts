// The places that get an intro of their own: a few lines, the figures worth
// knowing, the parts worth pointing at, and (for built landmarks) a simple
// massing model in white, like an architect's model. Chosen from the places
// people look up most, spread deliberately across the world.
//
// Offsets are metres east (dx) and north (dy) of the place's point; heights
// are metres above the ground there.

import type { Fx } from "./fx";
import { FOOTHOLD_INTROS } from "./footholds";
import { HERITAGE_INTROS } from "./heritage";
import { MORE_INTROS } from "./more";
import { NATURE_INTROS } from "./nature";

export type Form =
  | { f: "box"; w: number; d: number; h: number; dx?: number; dy?: number; z?: number; rot?: number }
  | { f: "frustum"; w: number; top: number; h: number; dx?: number; dy?: number; z?: number; rot?: number }
  | { f: "cyl"; r: number; h: number; top?: number; dx?: number; dy?: number; z?: number; tilt?: number }
  | { f: "cone"; r: number; h: number; dx?: number; dy?: number; z?: number }
  | { f: "dome"; r: number; h?: number; dx?: number; dy?: number; z?: number }
  | { f: "sphere"; r: number; dx?: number; dy?: number; z?: number }
  | { f: "pyramid"; w: number; h: number; dx?: number; dy?: number; z?: number; rot?: number }
  | { f: "steps"; w: number; top: number; h: number; n: number; dx?: number; dy?: number; z?: number }
  | { f: "ring"; rx: number; ry: number; ix: number; iy: number; h: number; dx?: number; dy?: number; z?: number; rot?: number }
  | { f: "stones"; r: number; n: number; w: number; d: number; h: number; dx?: number; dy?: number }
  | { f: "arch"; span: number; h: number; t: number; dx?: number; dy?: number; rot?: number }
  /** Raked stands: n tiers stepping up and out from the inner edge; `from`/`to` (degrees, 0 = east, 90 = north) for a part of the way round. */
  | { f: "stand"; rx: number; ry: number; ix: number; iy: number; h: number; n?: number; from?: number; to?: number; dx?: number; dy?: number; z?: number; rot?: number }
  | { f: "shell"; rx: number; ry: number; h: number; dx?: number; dy?: number; z?: number; rot?: number };

export interface Part { label: string; dx?: number; dy?: number; h: number }

export interface IntroPlace {
  id: string;
  name: string;
  /** Other names people search it by. */
  also?: string[];
  where: string;
  lon: number;
  lat: number;
  /** Width of the diorama, metres. */
  size: number;
  lines: string[];
  facts: [string, string][];
  forms?: Form[];
  parts?: Part[];
  /** What it's about (sport, art, fashion, food, retail, tech, gaming…), for the Work map's industries. */
  tags?: string[];
  /** What moves: aurora, a herd, a river, clouds, fireflies. */
  fx?: Fx[];
  /** Its id on UNESCO's World Heritage List, if it's on it. */
  whc?: number;
}

const P = (id: string, name: string, where: string, lon: number, lat: number, size: number, lines: string[], facts: [string, string][], extra: Partial<IntroPlace> = {}): IntroPlace =>
  ({ id, name, where, lon, lat, size, lines, facts, ...extra });

const FIRST: IntroPlace[] = [
  // ---- The Americas ----------------------------------------------------------------------------------
  P("statue-of-liberty", "Statue of Liberty", "Liberty Island, New York Harbor", -74.0445, 40.68925, 700,
    ["A gift from the people of France, dedicated in 1886.", "Copper skin over an iron frame designed by Gustave Eiffel.", "It stands on the star-shaped walls of Fort Wood."],
    [["Ground to torch", "93 m"], ["Dedicated", "1886"], ["Skin", "copper, 2.4 mm"]],
    { forms: [{ f: "box", w: 70, d: 70, h: 7 }, { f: "box", w: 70, d: 70, h: 7, rot: 45 }, { f: "frustum", w: 20, top: 16, h: 40, z: 7 }, { f: "cyl", r: 5, top: 3.2, h: 34, z: 47 }, { f: "sphere", r: 2.4, z: 83 }, { f: "box", w: 1.6, d: 1.6, h: 9, dx: 3.2, z: 81 }, { f: "cone", r: 1.4, h: 3, dx: 3.2, z: 90 }],
      parts: [{ label: "Torch", dx: 3, h: 93 }, { label: "Crown", h: 86 }, { label: "Pedestal", h: 40 }, { label: "Fort Wood's star walls", dx: 32, h: 7 }] }),
  P("empire-state", "Empire State Building", "Midtown Manhattan, New York", -73.98566, 40.74844, 800,
    ["Built in just over a year and opened in 1931.", "The world's tallest building for nearly 40 years."],
    [["Height to tip", "443 m"], ["Floors", "102"], ["Opened", "1931"]],
    { forms: [{ f: "box", w: 130, d: 57, h: 25 }, { f: "box", w: 100, d: 50, h: 60, z: 25 }, { f: "box", w: 60, d: 40, h: 240, z: 85 }, { f: "frustum", w: 20, top: 10, h: 55, z: 325 }, { f: "cyl", r: 2, h: 63, z: 380 }],
      parts: [{ label: "86th-floor deck", h: 320 }, { label: "Spire", h: 443 }] }),
  P("golden-gate", "Golden Gate Bridge", "San Francisco", -122.47825, 37.81993, 3400,
    ["A suspension bridge across the Golden Gate strait, opened in 1937.", "Its colour, International Orange, was picked to stand out in fog."],
    [["Main span", "1,280 m"], ["Towers", "227 m above water"], ["Opened", "1937"]],
    { forms: [{ f: "box", w: 27, d: 2737, h: 4, z: 67, rot: -10 }, { f: "box", w: 33, d: 10, h: 227, dy: 640, dx: -113 }, { f: "box", w: 33, d: 10, h: 227, dy: -640, dx: 113 }],
      parts: [{ label: "North tower", dx: -113, dy: 640, h: 227 }, { label: "South tower", dx: 113, dy: -640, h: 227 }, { label: "Deck, 67 m above the water", h: 70 }] }),
  P("grand-canyon", "Grand Canyon", "Arizona", -112.1401, 36.0544, 16000,
    ["Carved by the Colorado River over millions of years.", "Its walls show nearly two billion years of rock."],
    [["Depth", "about 1.8 km"], ["Length", "446 km"], ["Oldest rock", "1.8 billion years"]], { parts: [{ label: "South Rim", dy: -2500, h: 20 }, { label: "Colorado River", dy: 1500, h: 10 }] }),
  P("niagara-falls", "Niagara Falls", "Ontario and New York", -79.07563, 43.07729, 3000,
    ["Three waterfalls on the Niagara River, between Lake Erie and Lake Ontario.", "Horseshoe Falls carries most of the water."],
    [["Horseshoe Falls drop", "51 m"], ["Flow", "up to 2,800 m³ a second"]], { parts: [{ label: "Horseshoe Falls", dx: -300, dy: -600, h: 20 }, { label: "American Falls", dx: 450, dy: 450, h: 20 }] }),
  P("half-dome", "Half Dome", "Yosemite, California", -119.533, 37.74604, 7000,
    ["A granite dome sheared on one side by ice and rockfall.", "Its sheer face rises about 1,400 m above the valley floor."],
    [["Summit", "2,694 m"], ["Face", "about 1,400 m"]], { parts: [{ label: "Summit", h: 30 }] }),
  P("old-faithful", "Old Faithful", "Yellowstone, Wyoming", -110.82814, 44.46046, 2500,
    ["A geyser that erupts about every 90 minutes.", "Yellowstone sits over a hot spot of molten rock."],
    [["Eruption height", "30–55 m"], ["Interval", "about 90 min"]], { forms: [{ f: "cone", r: 6, h: 45 }], parts: [{ label: "The geyser", h: 45 }] }),
  P("mount-rushmore", "Mount Rushmore", "Black Hills, South Dakota", -103.45907, 43.8791, 2500,
    ["Four presidents' faces carved into granite between 1927 and 1941.", "Each face is about 18 m tall."],
    [["Faces", "18 m tall"], ["Carved", "1927–1941"]], { parts: [{ label: "The carving", h: 40 }] }),
  P("hollywood-sign", "Hollywood Sign", "Mount Lee, Los Angeles", -118.3215, 34.1341, 2000,
    ["Put up in 1923 as an advertisement, reading Hollywoodland.", "Each letter is about 14 m tall."],
    [["Letters", "about 14 m tall"], ["Put up", "1923"]], { forms: Array.from({ length: 9 }, (_, i) => ({ f: "box" as const, w: 9, d: 1, h: 14, dx: -60 + i * 15 })) }),
  P("gateway-arch", "Gateway Arch", "St. Louis, Missouri", -90.18478, 38.62469, 1200,
    ["A stainless-steel arch on the Mississippi, finished in 1965.", "It's as wide as it is tall."],
    [["Height and span", "192 m"], ["Finished", "1965"]], { forms: [{ f: "arch", span: 192, h: 192, t: 9 }], parts: [{ label: "The top: a viewing room", h: 192 }] }),
  P("cn-tower", "CN Tower", "Toronto", -79.38706, 43.64257, 900,
    ["A communications tower on the Toronto waterfront, opened in 1976.", "It was the world's tallest free-standing structure for 32 years."],
    [["Height", "553 m"], ["Opened", "1976"]], { forms: [{ f: "frustum", w: 60, top: 12, h: 340 }, { f: "cyl", r: 18, h: 22, z: 336 }, { f: "cyl", r: 3, h: 195, top: 1, z: 358 }], parts: [{ label: "Main pod and glass floor", h: 350 }, { label: "Antenna", h: 553 }] }),
  P("space-needle", "Space Needle", "Seattle", -122.3493, 47.62051, 700,
    ["Built for the 1962 World's Fair.", "Its saucer-shaped top holds a turning glass floor."],
    [["Height", "184 m"], ["Built", "1962"]], { forms: [{ f: "cyl", r: 5, top: 3, h: 158 }, { f: "cyl", r: 21, h: 10, z: 152 }, { f: "cone", r: 6, h: 22, z: 162 }] }),
  P("chichen-itza", "Chichén Itzá", "Yucatán, Mexico", -88.56866, 20.68297, 1100,
    ["A great Maya city, at its height from about 600 to 1200.", "At the equinoxes, the stairs of El Castillo cast a shadow like a serpent."],
    [["El Castillo", "30 m"], ["Terraces", "9"], ["Steps", "365 in all"]], { forms: [{ f: "steps", w: 55, top: 19, h: 24, n: 9 }, { f: "box", w: 13, d: 13, h: 6, z: 24 }], parts: [{ label: "El Castillo's temple", h: 30 }] }),
  P("teotihuacan", "Teotihuacan", "Valley of Mexico", -98.8437, 19.69249, 2600,
    ["Once one of the largest cities in the world, around the year 500.", "The Avenue of the Dead joins its great pyramids."],
    [["Pyramid of the Sun", "65 m"], ["Base", "225 m"]], { forms: [{ f: "steps", w: 225, top: 30, h: 65, n: 5 }, { f: "steps", w: 150, top: 25, h: 43, n: 4, dy: 755, dx: -15 }], parts: [{ label: "Pyramid of the Sun", h: 65 }, { label: "Pyramid of the Moon", dy: 755, dx: -15, h: 43 }] }),
  P("tikal", "Tikal", "Petén, Guatemala", -89.6237, 17.2222, 1600,
    ["A Maya city deep in the rainforest, at its height around 700.", "Its temples rise above the treetops."],
    [["Temple I", "47 m"], ["Peak", "around 200–850"]], { forms: [{ f: "steps", w: 35, top: 12, h: 38, n: 9 }, { f: "box", w: 10, d: 8, h: 9, z: 38 }] }),
  P("zocalo", "Zócalo", "Mexico City", -99.13315, 19.4326, 900,
    ["One of the largest city squares in the world, on the site of the Aztec capital Tenochtitlan.", "The Metropolitan Cathedral took nearly 250 years to build."],
    [["Square", "about 240 × 240 m"], ["Cathedral built", "1573–1813"]]),
  P("havana-capitolio", "El Capitolio", "Havana, Cuba", -82.3593, 23.1355, 900,
    ["Cuba's capitol, finished in 1929, now home again to its National Assembly.", "Its dome rises over Old Havana."],
    [["Dome", "92 m"], ["Finished", "1929"]], { forms: [{ f: "box", w: 207, d: 55, h: 25 }, { f: "cyl", r: 16, h: 30, z: 25 }, { f: "dome", r: 16, h: 25, z: 55 }, { f: "cone", r: 2, h: 12, z: 80 }] }),
  P("machu-picchu", "Machu Picchu", "Cusco Region, Peru", -72.54499, -13.16316, 3000,
    ["A 15th-century Inca estate on a ridge above the Urubamba River.", "Its stone walls fit together without mortar."],
    [["Altitude", "2,430 m"], ["Built", "about 1450"]], { parts: [{ label: "Huayna Picchu", dx: -150, dy: 700, h: 30 }, { label: "The citadel", h: 20 }] }),
  P("nazca-lines", "Nazca Lines", "Ica, Peru", -75.1286, -14.7390, 6000,
    ["Huge figures and lines scraped into the desert between about 500 BC and 500 AD.", "Best seen from the air: a hummingbird, a monkey, a spider."],
    [["Hummingbird", "93 m long"], ["Made", "500 BC–500 AD"]]),
  P("christ-the-redeemer", "Christ the Redeemer", "Corcovado, Rio de Janeiro", -43.21049, -22.95192, 1400,
    ["An Art Deco statue on the peak of Corcovado, finished in 1931.", "Reinforced concrete clad in soapstone tiles."],
    [["Statue", "30 m"], ["Arm span", "28 m"], ["Peak", "about 700 m"]], { forms: [{ f: "box", w: 8, d: 8, h: 8 }, { f: "cyl", r: 3, top: 1.8, h: 22, z: 8 }, { f: "box", w: 28, d: 3, h: 3, z: 25 }, { f: "sphere", r: 1.6, z: 31.5 }], parts: [{ label: "Arms: 28 m across", dx: 13, h: 27 }, { label: "Pedestal chapel", h: 8 }] }),
  P("sugarloaf", "Sugarloaf Mountain", "Rio de Janeiro", -43.15703, -22.94869, 3000,
    ["A granite peak at the mouth of Guanabara Bay.", "A cable car has run to its top since 1912."],
    [["Height", "396 m"], ["Cable car", "since 1912"]]),
  P("iguazu-falls", "Iguazú Falls", "Argentina and Brazil", -54.43667, -25.69522, 5000,
    ["Some 275 waterfalls along nearly 3 km of the Iguazú River.", "The Devil's Throat is a U-shaped chasm where half the river falls."],
    [["Falls", "about 275"], ["Highest drop", "82 m"]], { parts: [{ label: "Devil's Throat", dx: 500, dy: 300, h: 20 }] }),
  P("angel-falls", "Angel Falls", "Canaima, Venezuela", -62.53528, 5.96778, 5000,
    ["The world's highest uninterrupted waterfall, off the edge of Auyán-tepui.", "Its water turns to mist before it reaches the bottom."],
    [["Height", "979 m"], ["Plunge", "807 m"]]),
  P("salar-de-uyuni", "Salar de Uyuni", "Potosí, Bolivia", -67.4891, -20.13378, 30000,
    ["The world's largest salt flat, left by prehistoric lakes.", "After rain it becomes a vast mirror."],
    [["Area", "10,582 km²"], ["Altitude", "3,656 m"], ["Relief", "under 1 m"]]),
  P("lake-titicaca", "Lake Titicaca", "Peru and Bolivia", -69.35, -15.8, 40000,
    ["The largest lake in South America, high in the Andes.", "The Uros people live on islands woven from totora reeds."],
    [["Surface", "3,812 m up"], ["Area", "8,372 km²"]]),
  P("perito-moreno", "Perito Moreno Glacier", "Santa Cruz, Argentina", -73.0486, -50.4967, 8000,
    ["A glacier flowing out of the Southern Patagonian Ice Field.", "Its front breaks off in towers of ice into Lake Argentino."],
    [["Front", "about 5 km wide"], ["Ice above water", "about 70 m"]]),
  P("torres-del-paine", "Torres del Paine", "Magallanes, Chile", -72.99, -50.95, 14000,
    ["Three granite towers rising over Patagonian lakes.", "Shaped by glaciers from rock that cooled about 12 million years ago."],
    [["Highest tower", "about 2,850 m"], ["National park since", "1959"]]),
  P("cartagena", "Walled City of Cartagena", "Colombia", -75.5513, 10.4236, 1400,
    ["A Caribbean port fortified by Spain from the 16th century.", "Its walls run for 11 km around the old town."],
    [["Walls", "11 km"], ["Founded", "1533"]]),
  P("obelisco", "Obelisco de Buenos Aires", "Avenida 9 de Julio", -58.38159, -34.60372, 700,
    ["Built in 1936 for the city's 400th anniversary.", "It stands where the Argentine flag was first raised in the city."],
    [["Height", "67.5 m"], ["Built", "1936"]], { forms: [{ f: "box", w: 7, d: 7, h: 63 }, { f: "pyramid", w: 7, h: 4.5, z: 63 }] }),
  P("easter-island-moai", "Moai of Ahu Tongariki", "Rapa Nui (Easter Island)", -109.27694, -27.12583, 900,
    ["Fifteen moai stand on the largest ceremonial platform on the island.", "The Rapa Nui carved them from volcanic tuff."],
    [["Moai here", "15"], ["Tallest", "about 9 m"]], { forms: [{ f: "box", w: 100, d: 8, h: 2 }, ...Array.from({ length: 15 }, (_, i) => ({ f: "box" as const, w: 3, d: 2.5, h: 7 + (i % 3), dx: -45 + i * 6.4, z: 2 }))] }),
  P("galapagos", "Galápagos Islands", "Ecuador", -90.3, -0.7, 60000,
    ["Volcanic islands where Darwin saw finches and tortoises in 1835.", "Many animals here live nowhere else."],
    [["Islands", "13 large"], ["Darwin visited", "1835"]]),
  P("amazon-meeting-waters", "Meeting of the Waters", "Manaus, Brazil", -59.9026, -3.1364, 14000,
    ["The dark Rio Negro meets the sandy Solimões and they run side by side for kilometres.", "Different speed, temperature and silt keep them apart."],
    [["Side by side", "about 6 km"], ["Rio Negro", "about 28 °C"]]),
  P("kaieteur-falls", "Kaieteur Falls", "Guyana", -59.4803, 5.175, 4000,
    ["A single drop of the Potaro River over a sandstone cliff.", "By volume, one of the most powerful single-drop falls on Earth."],
    [["Drop", "226 m"], ["Width", "about 110 m"]]),

  // ---- Europe ---------------------------------------------------------------------------------------
  P("eiffel-tower", "Eiffel Tower", "Paris", 2.29448, 48.85837, 800,
    ["Built for the 1889 World's Fair and meant to last twenty years.", "Some 18,000 iron parts held by 2.5 million rivets."],
    [["Height", "330 m"], ["Built", "1887–1889"], ["Iron", "7,300 t"]],
    { forms: [{ f: "frustum", w: 125, top: 45, h: 57, rot: 45 }, { f: "frustum", w: 45, top: 20, h: 58, z: 57, rot: 45 }, { f: "frustum", w: 20, top: 6, h: 161, z: 115, rot: 45 }, { f: "cyl", r: 3, top: 1, h: 54, z: 276 }],
      parts: [{ label: "First floor", h: 57 }, { label: "Second floor", h: 115 }, { label: "Top deck", h: 276 }] }),
  P("colosseum", "Colosseum", "Rome", 12.49223, 41.89021, 700,
    ["An amphitheatre opened in the year 80 that held some 50,000 people.", "Gladiators fought on a wooden floor over tunnels and lifts."],
    [["Outer wall", "48 m"], ["Opened", "AD 80"], ["Seats", "about 50,000"]], { forms: [{ f: "ring", rx: 94, ry: 78, ix: 43, iy: 27, h: 48, rot: -18 }], parts: [{ label: "Arena floor", h: 2 }, { label: "Outer wall", dx: 90, h: 48 }] }),
  P("st-peters", "St. Peter's Basilica", "Vatican City", 12.45339, 41.90216, 900,
    ["Rebuilt from 1506 to 1626 over the tomb of St. Peter.", "Michelangelo designed its dome."],
    [["Dome", "136.6 m to the cross"], ["Built", "1506–1626"]], { forms: [{ f: "box", w: 186, d: 150, h: 45, rot: -5 }, { f: "cyl", r: 21, h: 30, z: 45 }, { f: "dome", r: 21, h: 45, z: 75 }, { f: "cyl", r: 3, h: 16, z: 120 }] }),
  P("leaning-tower", "Leaning Tower of Pisa", "Pisa", 10.39659, 43.72295, 600,
    ["The bell tower of Pisa Cathedral, begun in 1173.", "Soft ground made it lean; work in 2001 stopped it getting worse."],
    [["Height", "56 m"], ["Lean", "about 4°"], ["Begun", "1173"]], { forms: [{ f: "cyl", r: 7.8, h: 56, tilt: 4 }] }),
  P("venice-st-marks", "St. Mark's Square", "Venice", 12.33885, 45.43413, 800,
    ["Venice's great square, with the golden basilica at one end.", "The bell tower was rebuilt after it collapsed in 1902."],
    [["Campanile", "98.6 m"], ["Basilica consecrated", "1094"]], { forms: [{ f: "box", w: 12, d: 12, h: 85, dx: 60, dy: -40 }, { f: "pyramid", w: 12, h: 14, dx: 60, dy: -40, z: 85 }] }),
  P("acropolis", "Acropolis of Athens", "Athens", 23.72573, 37.97153, 1200,
    ["A rocky hill crowned by temples built in the 5th century BC.", "The Parthenon was dedicated to Athena."],
    [["Parthenon", "69.5 × 30.9 m"], ["Built", "447–432 BC"]], { forms: [{ f: "box", w: 69.5, d: 30.9, h: 14 }], parts: [{ label: "Parthenon", h: 14 }] }),
  P("sagrada-familia", "Sagrada Família", "Barcelona", 2.17436, 41.40363, 700,
    ["Antoni Gaudí's basilica, under construction since 1882.", "Its tower of Jesus Christ will make it the tallest church in the world."],
    [["Tallest tower", "172.5 m"], ["Begun", "1882"]], { forms: [{ f: "box", w: 90, d: 60, h: 45 }, { f: "cone", r: 10, h: 128, z: 45 }, ...[[-18, -14], [18, -14], [-18, 14], [18, 14]].map(([dx, dy]) => ({ f: "cone" as const, r: 6, h: 90, dx, dy, z: 45 })), ...[-12, -4, 4, 12].map((dx) => ({ f: "cone" as const, r: 3.2, h: 100, dx, dy: -38 }))], parts: [{ label: "Tower of Jesus Christ", h: 172 }] }),
  P("alhambra", "Alhambra", "Granada", -3.58813, 37.17605, 1400,
    ["A palace-fortress of the Nasrid emirs, mostly from the 13th and 14th centuries.", "Its courts are cooled by water and fine carved plaster."],
    [["Built", "mostly 1238–1391"], ["Walls", "about 2 km"]]),
  P("big-ben", "Big Ben", "Westminster, London", -0.12463, 51.50073, 700,
    ["Big Ben is the great bell; the tower is the Elizabeth Tower, finished in 1859.", "It stands at the north end of the Houses of Parliament."],
    [["Tower", "96 m"], ["Bell", "13.7 t"]], { forms: [{ f: "box", w: 12, d: 12, h: 76 }, { f: "pyramid", w: 12, h: 20, z: 76 }], parts: [{ label: "Clock faces", h: 58 }] }),
  P("tower-bridge", "Tower Bridge", "London", -0.07536, 51.50546, 800,
    ["A bascule bridge over the Thames, opened in 1894.", "Its roads lift to let ships through."],
    [["Towers", "65 m"], ["Opened", "1894"]], { forms: [{ f: "box", w: 20, d: 20, h: 65, dy: 40 }, { f: "box", w: 20, d: 20, h: 65, dy: -40 }, { f: "box", w: 8, d: 80, h: 4, z: 42 }, { f: "box", w: 12, d: 244, h: 3, z: 9 }], parts: [{ label: "High walkways", h: 44 }] }),
  P("stonehenge", "Stonehenge", "Wiltshire, England", -1.82622, 51.17886, 500,
    ["A ring of standing stones raised around 2500 BC.", "It lines up with sunrise at midsummer and sunset at midwinter."],
    [["Sarsens", "up to 7 m"], ["Raised", "about 2500 BC"]], { forms: [{ f: "stones", r: 16.5, n: 30, w: 2.1, d: 1.1, h: 4.1 }, { f: "stones", r: 7, n: 10, w: 2.4, d: 1.2, h: 6.5 }] }),
  P("edinburgh-castle", "Edinburgh Castle", "Edinburgh", -3.19992, 55.94856, 1400,
    ["A fortress on an extinct volcano's plug, at the top of the Royal Mile.", "St Margaret's Chapel, from the 1100s, is its oldest building."],
    [["Castle Rock", "130 m"], ["Oldest part", "1100s"]]),
  P("cliffs-of-moher", "Cliffs of Moher", "County Clare, Ireland", -9.4265, 52.9719, 5000,
    ["Sea cliffs running 14 km along the Atlantic.", "Their layers of shale and sandstone are about 320 million years old."],
    [["Highest", "214 m"], ["Length", "14 km"]]),
  P("mont-saint-michel", "Mont-Saint-Michel", "Normandy, France", -1.5115, 48.636, 1600,
    ["A tidal island crowned by an abbey, begun in the 8th century.", "The sea comes in around it at some of the highest tides in Europe."],
    [["Abbey spire", "about 92 m above the sea"], ["Tides", "up to 14 m"]], { forms: [{ f: "cone", r: 5, h: 32, z: 60 }] }),
  P("neuschwanstein", "Neuschwanstein Castle", "Bavaria", 10.74983, 47.55758, 1500,
    ["A 19th-century romantic castle built for King Ludwig II.", "Never finished; opened to visitors seven weeks after his death."],
    [["Begun", "1869"], ["Opened", "1886"]], { forms: [{ f: "box", w: 60, d: 20, h: 30 }, { f: "cyl", r: 5, h: 65 }, { f: "cone", r: 6, h: 14, z: 65 }] }),
  P("brandenburg-gate", "Brandenburg Gate", "Berlin", 13.3777, 52.51628, 700,
    ["A neoclassical gate from 1791, crowned by a chariot of victory.", "It stood in the no-man's-land of the Berlin Wall until 1989."],
    [["Height", "26 m"], ["Built", "1788–1791"]], { forms: [{ f: "box", w: 65.5, d: 11, h: 20 }, { f: "box", w: 30, d: 11, h: 6, z: 20 }] }),
  P("matterhorn", "Matterhorn", "Zermatt, Switzerland", 7.65861, 45.97638, 7000,
    ["A pyramid peak of four faces, pointing to the four points of the compass.", "First climbed in 1865."],
    [["Summit", "4,478 m"], ["First climbed", "1865"]], { parts: [{ label: "Summit", h: 20 }] }),
  P("santorini", "Santorini", "Cyclades, Greece", 25.37583, 36.46139, 16000,
    ["A ring of islands around a flooded volcanic caldera.", "The eruption around 1600 BC was one of the largest in human history."],
    [["Caldera", "about 12 × 7 km"], ["Eruption", "about 1600 BC"]]),
  P("red-square", "Red Square", "Moscow", 37.62308, 55.75253, 900,
    ["Moscow's central square, between the Kremlin and St. Basil's Cathedral.", "St. Basil's was built in 1555–1561 with nine chapels."],
    [["Square", "about 330 × 75 m"], ["St. Basil's", "1555–1561"]], { forms: [{ f: "cyl", r: 8, h: 30, dy: -200, dx: 150 }, { f: "sphere", r: 6, dy: -200, dx: 150, z: 36 }, ...[[-14, 0], [14, 0], [0, 14], [0, -14]].map(([a, b]) => ({ f: "sphere" as const, r: 4, dx: 150 + a, dy: -200 + b, z: 25 }))] }),
  P("hagia-sophia", "Hagia Sophia", "Istanbul", 28.98, 41.00854, 700,
    ["Built as a cathedral in 537, a mosque from 1453, a museum from 1934, and a mosque again from 2020.", "Its dome seemed to float on a ring of light."],
    [["Dome", "about 31 m across"], ["Built", "532–537"]], { forms: [{ f: "box", w: 82, d: 73, h: 30 }, { f: "dome", r: 16, h: 25, z: 30 }, ...[[-45, -40], [45, -40], [-45, 40], [45, 40]].map(([dx, dy]) => ({ f: "cyl" as const, r: 2, h: 60, dx, dy }))] }),
  P("blue-mosque", "Sultan Ahmed Mosque", "Istanbul", 28.97684, 41.00544, 700,
    ["The Blue Mosque, finished in 1616, named for its blue İznik tiles inside.", "It has six minarets."],
    [["Minarets", "6"], ["Main dome", "43 m high"]], { forms: [{ f: "box", w: 64, d: 72, h: 25 }, { f: "dome", r: 12, h: 18, z: 25 }, ...[[-40, -45], [40, -45], [-40, 45], [40, 45], [-40, 0], [40, 0]].map(([dx, dy]) => ({ f: "cyl" as const, r: 2, h: 64, dx, dy }))] }),
  P("cappadocia", "Cappadocia", "Central Anatolia, Türkiye", 34.83, 38.65, 8000,
    ["Fairy chimneys: soft volcanic tuff worn into towers under harder caps.", "People carved homes, churches and whole underground towns into the rock."],
    [["Underground city", "Derinkuyu, 8 levels"]]),

  // ---- Africa --------------------------------------------------------------------------------------
  P("giza-pyramids", "Pyramids of Giza", "Giza, Egypt", 31.13421, 29.97916, 2200,
    ["Tombs of three pharaohs of the Fourth Dynasty, about 4,500 years old.", "The Great Pyramid was the tallest thing people had built for nearly 4,000 years."],
    [["Great Pyramid", "146.6 m first, 138.5 m now"], ["Base", "230 m"], ["Built", "about 2560 BC"]],
    { forms: [{ f: "pyramid", w: 230, h: 139 }, { f: "pyramid", w: 215, h: 136, dx: -323, dy: -335 }, { f: "pyramid", w: 103, h: 65, dx: -567, dy: -736 }, { f: "box", w: 73, d: 19, h: 20, dx: 325, dy: -429 }],
      parts: [{ label: "Great Pyramid (Khufu)", h: 139 }, { label: "Khafre", dx: -323, dy: -335, h: 136 }, { label: "Menkaure", dx: -567, dy: -736, h: 65 }, { label: "Great Sphinx", dx: 325, dy: -429, h: 20 }] }),
  P("cairo-citadel", "Citadel of Cairo", "Cairo", 31.2599, 30.0287, 1200,
    ["Saladin's fortress on a spur of the Mokattam Hills, begun in 1176.", "The Mosque of Muhammad Ali crowns it with Ottoman domes."],
    [["Begun", "1176"], ["Mosque", "1830–1848"]], { forms: [{ f: "box", w: 50, d: 50, h: 20 }, { f: "dome", r: 10, h: 21, z: 20 }, { f: "cyl", r: 1.5, h: 82, dx: -25, dy: 30 }, { f: "cyl", r: 1.5, h: 82, dx: 25, dy: 30 }] }),
  P("abu-simbel", "Abu Simbel", "Aswan, Egypt", 31.6258, 22.3372, 1200,
    ["Two temples cut into a sandstone cliff by Ramesses II around 1260 BC.", "In the 1960s they were cut into blocks and lifted 65 m to escape the rising Nile."],
    [["Statues", "about 20 m"], ["Moved", "1964–1968"]], { forms: Array.from({ length: 4 }, (_, i) => ({ f: "box" as const, w: 7, d: 5, h: 20, dx: -12 + i * 8 })) }),
  P("marrakech", "Jemaa el-Fnaa and the Koutoubia", "Marrakech, Morocco", -7.98917, 31.62585, 1200,
    ["The great square of Marrakech: storytellers, musicians and food stalls at night.", "The Koutoubia's minaret, from the 1100s, set the model for others across North Africa."],
    [["Minaret", "77 m"], ["Built", "about 1150–1195"]], { tags: ["food", "retail"], forms: [{ f: "box", w: 12.8, d: 12.8, h: 69, dx: -415, dy: -200 }, { f: "box", w: 6, d: 6, h: 8, dx: -415, dy: -200, z: 69 }, ...[0, 1, 2, 3, 4, 5].flatMap((i) => [0, 1, 2].map((j): Form => ({ f: "box", w: 8, d: 5, h: 3, dx: -50 + i * 20, dy: -20 + j * 20 })))],
      parts: [{ label: "Evening food stalls", h: 4 }, { label: "Koutoubia minaret", dx: -415, dy: -200, h: 77 }] }),
  P("djenne-mosque", "Great Mosque of Djenné", "Djenné, Mali", -4.55556, 13.90528, 600,
    ["The largest mud-brick building in the world, rebuilt in 1907.", "Every year the town replasters it together in a festival."],
    [["Walls", "about 16 m"], ["Platform", "75 × 75 m"]], { forms: [{ f: "box", w: 75, d: 75, h: 3 }, { f: "box", w: 55, d: 50, h: 12, z: 3 }, ...[-15, 0, 15].map((dx) => ({ f: "box" as const, w: 7, d: 7, h: 16, dx, dy: 22, z: 3 }))] }),
  P("timbuktu", "Timbuktu", "Mali", -3.0102, 16.7716, 1500,
    ["A centre of trade and learning on the edge of the Sahara from the 1300s.", "The Djinguereber Mosque dates from 1327."],
    [["Djinguereber", "1327"], ["Manuscripts", "hundreds of thousands"]], { forms: [{ f: "box", w: 60, d: 40, h: 8 }, { f: "frustum", w: 10, top: 5, h: 16, dx: 20, z: 8 }] }),
  P("lalibela", "Church of St George, Lalibela", "Amhara, Ethiopia", 39.04106, 12.03182, 500,
    ["One of eleven churches carved down into the rock in the 12th and 13th centuries.", "Cut in the shape of a cross from a single block of stone."],
    [["Depth", "about 12 m"], ["Carved", "about 1200"]], { forms: [{ f: "box", w: 25, d: 12, h: 12, z: -12 }, { f: "box", w: 12, d: 25, h: 12, z: -12 }], parts: [{ label: "The church, below ground level", h: -2 }] }),
  P("aksum", "Stelae of Aksum", "Tigray, Ethiopia", 38.7185, 14.132, 500,
    ["Granite obelisks raised by the Kingdom of Aksum around the 4th century.", "One was taken to Rome in 1937 and returned in 2005."],
    [["King Ezana's Stele", "21 m"], ["Great Stele (fallen)", "33 m"]], { forms: [{ f: "box", w: 2.7, d: 1.5, h: 21 }, { f: "box", w: 2.3, d: 1.3, h: 24, dx: 30, dy: 10 }, { f: "box", w: 33, d: 3, h: 2, dx: -35, dy: -8 }] }),
  P("meroe", "Pyramids of Meroë", "River Nile State, Sudan", 33.74889, 16.93556, 900,
    ["Nearly 200 steep pyramids of the Kingdom of Kush, from about 300 BC to AD 350.", "More pyramids than in all of Egypt."],
    [["Pyramids", "about 200"], ["Tallest", "about 30 m"]], { forms: Array.from({ length: 12 }, (_, i) => ({ f: "pyramid" as const, w: 7 + (i % 3) * 2, h: 14 + (i % 4) * 4, dx: -120 + (i % 6) * 45, dy: i < 6 ? 30 : -30 })) }),
  P("dakar-renaissance", "African Renaissance Monument", "Dakar, Senegal", -17.49528, 14.72231, 1200,
    ["A bronze statue on a hill above Dakar, unveiled in 2010.", "Taller than the Statue of Liberty."],
    [["Statue", "49 m"], ["Unveiled", "2010"]], { forms: [{ f: "box", w: 20, d: 20, h: 6 }, { f: "cyl", r: 5, top: 3, h: 43, z: 6 }] }),
  P("cape-coast-castle", "Cape Coast Castle", "Central Region, Ghana", -1.2417, 5.1033, 700,
    ["A fort on the Gold Coast through which enslaved Africans were forced onto ships.", "The Door of No Return faces the sea."],
    [["Built", "1650s onwards"]], { forms: [{ f: "box", w: 80, d: 60, h: 12 }, { f: "box", w: 20, d: 20, h: 20, dx: 30, dy: 20 }] }),
  P("zanzibar-stone-town", "Stone Town", "Zanzibar, Tanzania", 39.1892, -6.1639, 1200,
    ["A Swahili trading town of coral-stone houses and carved wooden doors.", "It mixes African, Arab, Indian and European building."],
    [["World Heritage", "2000"]]),
  P("kilimanjaro", "Mount Kilimanjaro", "Tanzania", 37.35561, -3.0674, 22000,
    ["Africa's highest mountain: a dormant volcano with three cones.", "Its glaciers have shrunk by more than 80% since 1912."],
    [["Summit (Uhuru Peak)", "5,895 m"], ["Base to summit", "about 4,900 m"]], { parts: [{ label: "Kibo summit crater", h: 30 }] }),
  P("ngorongoro", "Ngorongoro Crater", "Tanzania", 35.5, -3.2, 30000,
    ["The world's largest unbroken volcanic caldera.", "About 25,000 large animals live on its floor."],
    [["Across", "about 19 km"], ["Depth", "about 610 m"]]),
  P("serengeti", "Serengeti", "Tanzania", 34.8333, -2.3333, 60000,
    ["Grassland plains where over a million wildebeest migrate each year.", "Its name comes from the Maasai for endless plains."],
    [["Area", "about 14,750 km²"], ["Wildebeest", "over 1.5 million"]]),
  P("victoria-falls", "Victoria Falls", "Zambia and Zimbabwe", 25.85719, -17.9243, 4500,
    ["Mosi-oa-Tunya, the Smoke that Thunders: the Zambezi falls into a narrow chasm.", "Its spray can be seen from 50 km away."],
    [["Width", "1,708 m"], ["Drop", "108 m"]], { parts: [{ label: "The falls", h: 20 }] }),
  P("great-zimbabwe", "Great Zimbabwe", "Masvingo, Zimbabwe", 30.93392, -20.2678, 800,
    ["Capital of a Shona kingdom from the 11th to 15th centuries.", "Its granite walls were built without mortar."],
    [["Great Enclosure wall", "11 m high"], ["Conical tower", "10 m"]], { forms: [{ f: "ring", rx: 44, ry: 33, ix: 41, iy: 30, h: 11 }, { f: "cone", r: 5.5, h: 10, dx: 15 }] }),
  P("table-mountain", "Table Mountain", "Cape Town, South Africa", 18.40372, -33.96276, 9000,
    ["A flat-topped mountain of sandstone above Cape Town.", "Clouds spill over it as the tablecloth."],
    [["Summit", "1,085 m"], ["Plateau", "about 3 km across"]]),
  P("sossusvlei", "Sossusvlei", "Namib Desert, Namibia", 15.29, -24.73, 12000,
    ["Red dunes around a white clay pan in the oldest desert on Earth.", "Their colour comes from iron oxide on the sand."],
    [["Big Daddy dune", "about 325 m"], ["Namib", "55 million years old"]]),
  P("okavango", "Okavango Delta", "Botswana", 22.9, -19.3, 60000,
    ["A river that never reaches the sea, spreading into a vast inland delta.", "The flood arrives in the dry season, from rain in Angola months before."],
    [["Area", "up to 15,000 km²"]]),
  P("nyiragongo", "Nyiragongo", "Virunga, DR Congo", 29.25, -1.52, 10000,
    ["A volcano holding one of the world's largest lava lakes.", "Its lava is unusually runny and fast."],
    [["Summit", "3,470 m"], ["Crater", "about 2 km across"]]),
  P("lagos-lekki-bridge", "Lekki–Ikoyi Link Bridge", "Lagos, Nigeria", 3.4356, 6.4473, 1400,
    ["A cable-stayed toll bridge over the Five Cowrie Creek, opened in 2013.", "Lagos is one of the fastest-growing cities in the world."],
    [["Length", "1.36 km"], ["Pylon", "90 m"]], { forms: [{ f: "box", w: 16, d: 1360, h: 3, z: 12, rot: 30 }, { f: "box", w: 6, d: 6, h: 90 }] }),
  P("nairobi-kicc", "Kenyatta International Convention Centre", "Nairobi, Kenya", 36.8235, -1.2889, 700,
    ["A 28-storey tower beside a cone-roofed hall, finished in 1973.", "Its roof is shaped like a traditional African hut."],
    [["Tower", "105 m"], ["Finished", "1973"]], { forms: [{ f: "cyl", r: 14, h: 105 }, { f: "cone", r: 30, h: 22, dx: 50 }] }),

  // ---- Asia and the Middle East -------------------------------------------------------------------------
  P("taj-mahal", "Taj Mahal", "Agra, India", 78.04216, 27.175, 800,
    ["A white marble tomb built by Shah Jahan for his wife Mumtaz Mahal.", "The four minarets lean slightly outward, so they'd fall away from it."],
    [["Height", "73 m"], ["Built", "1632–1653"]],
    { forms: [{ f: "box", w: 95, d: 95, h: 7 }, { f: "box", w: 57, d: 57, h: 35, z: 7 }, { f: "cyl", r: 11, h: 8, z: 42 }, { f: "dome", r: 17.5, h: 20, z: 50 }, { f: "cone", r: 1, h: 6, z: 67 }, ...[[-42, -42], [42, -42], [-42, 42], [42, 42]].map(([dx, dy]) => ({ f: "cyl" as const, r: 2.5, h: 40, dx, dy, z: 7 }))],
      parts: [{ label: "Main dome", h: 73 }, { label: "Minaret", dx: 42, dy: 42, h: 47 }, { label: "Marble plinth", dx: -40, h: 7 }] }),
  P("qutub-minar", "Qutub Minar", "Delhi, India", 77.18547, 28.52448, 600,
    ["A tower of red sandstone begun in 1199, with five storeys and balconies.", "The iron pillar nearby hasn't rusted in 1,600 years."],
    [["Height", "72.5 m"], ["Begun", "1199"]], { forms: [{ f: "cyl", r: 7.2, top: 1.6, h: 72.5 }] }),
  P("india-gate", "India Gate", "New Delhi", 77.2295, 28.6129, 800,
    ["A war memorial to Indian soldiers of the First World War, finished in 1931.", "More than 13,000 names are carved on it."],
    [["Height", "42 m"], ["Finished", "1931"]], { forms: [{ f: "box", w: 30, d: 12, h: 42 }] }),
  P("gateway-of-india", "Gateway of India", "Mumbai", 72.83466, 18.92198, 700,
    ["An arch on the Mumbai waterfront, finished in 1924.", "The last British troops left India through it in 1948."],
    [["Height", "26 m"], ["Finished", "1924"]], { forms: [{ f: "box", w: 26, d: 15, h: 26 }, ...[-10, 10].map((dx) => ({ f: "cyl" as const, r: 2, h: 32, dx }))] }),
  P("golden-temple", "Golden Temple", "Amritsar, India", 74.87648, 31.61998, 700,
    ["Harmandir Sahib, the holiest gurdwara of Sikhism, in a sacred pool.", "Its community kitchen serves free meals to up to 100,000 people a day."],
    [["Built", "1581–1604"], ["Pool", "about 150 × 150 m"]], { forms: [{ f: "box", w: 12, d: 12, h: 8 }, { f: "dome", r: 5, h: 6, z: 8 }, { f: "box", w: 3, d: 60, h: 1, dy: -35 }] }),
  P("varanasi", "Ghats of Varanasi", "Uttar Pradesh, India", 83.0107, 25.3073, 3000,
    ["Stone steps down to the Ganges in one of the world's oldest living cities.", "Dawn prayers and evening aarti light the river."],
    [["Ghats", "about 88"], ["On the Ganges", "about 6 km"]]),
  P("mazar-e-quaid", "Mazar-e-Quaid", "Karachi, Pakistan", 67.0409, 24.8752, 700,
    ["The white marble tomb of Muhammad Ali Jinnah, founder of Pakistan.", "Finished in 1970 on a raised platform in a large park."],
    [["Height", "43 m"], ["Square", "75 × 75 m"]], { forms: [{ f: "box", w: 75, d: 75, h: 4 }, { f: "box", w: 52, d: 52, h: 25, z: 4 }, { f: "dome", r: 22, h: 14, z: 29 }] }),
  P("dhaka-parliament", "National Parliament House", "Dhaka, Bangladesh", 90.3783, 23.7625, 900,
    ["Louis Kahn's concrete parliament, set in an artificial lake, finished in 1982.", "Its great cut-out circles and triangles bring in light."],
    [["Finished", "1982"], ["Architect", "Louis Kahn"]], { forms: [{ f: "cyl", r: 45, h: 30 }, ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => ({ f: "box" as const, w: 20, d: 20, h: 34, dx: Math.cos((a * Math.PI) / 180) * 55, dy: Math.sin((a * Math.PI) / 180) * 55 }))] }),
  P("everest", "Mount Everest", "Nepal and China", 86.925, 27.988, 16000,
    ["The highest point on Earth, where the Indian plate pushes into Asia.", "Its summit rock was once the floor of an ocean."],
    [["Summit", "8,849 m"], ["First climbed", "1953"]], { parts: [{ label: "Summit", h: 30 }] }),
  P("boudhanath", "Boudhanath", "Kathmandu, Nepal", 85.362, 27.7215, 600,
    ["One of the largest stupas in the world, on the old trade route to Tibet.", "The Buddha's eyes look out in all four directions."],
    [["Height", "36 m"], ["Across", "about 100 m"]], { forms: [{ f: "steps", w: 95, top: 60, h: 8, n: 3 }, { f: "dome", r: 25, h: 14, z: 8 }, { f: "box", w: 9, d: 9, h: 5, z: 22 }, { f: "cone", r: 5, h: 13, z: 27 }] }),
  P("potala-palace", "Potala Palace", "Lhasa, Tibet", 91.11707, 29.65575, 1400,
    ["The winter palace of the Dalai Lamas, rising 13 storeys up Marpo Ri hill.", "Built mostly in the 17th century."],
    [["Height", "117 m"], ["Front", "about 400 m"]], { forms: [{ f: "box", w: 360, d: 80, h: 70 }, { f: "box", w: 120, d: 60, h: 45, z: 70 }] }),
  P("great-wall", "Great Wall at Mutianyu", "Beijing", 116.57039, 40.43194, 3500,
    ["A restored stretch of the Ming-dynasty wall along a steep ridge.", "The walls, together, run for more than 20,000 km."],
    [["All the walls", "21,196 km"], ["Mutianyu", "rebuilt 1569"]]),
  P("forbidden-city", "Forbidden City", "Beijing", 116.39708, 39.91629, 1600,
    ["The palace of China's emperors from 1420 to 1912.", "Some 980 buildings inside a moat and a 10 m wall."],
    [["Area", "72 hectares"], ["Buildings", "about 980"]]),
  P("terracotta-army", "Terracotta Army", "Xi'an, China", 109.2785, 34.3841, 900,
    ["Thousands of life-size clay soldiers buried with the first emperor, Qin Shi Huang.", "Found by farmers digging a well in 1974."],
    [["Figures", "about 8,000"], ["Buried", "about 210 BC"]], { forms: [{ f: "box", w: 230, d: 62, h: 22 }] }),
  P("zhangjiajie", "Zhangjiajie", "Hunan, China", 110.4812, 29.3249, 5000,
    ["Thousands of sandstone pillars rising from forest.", "Rain and frost split the rock along vertical cracks."],
    [["Pillars", "over 3,000"], ["Tallest", "over 200 m"]]),
  P("mount-fuji", "Mount Fuji", "Honshu, Japan", 138.73045, 35.36283, 20000,
    ["Japan's highest mountain: a near-perfect cone, last erupted in 1707.", "Climbed by some 200,000 people each summer."],
    [["Summit", "3,776 m"], ["Last eruption", "1707"]], { parts: [{ label: "Summit crater", h: 30 }] }),
  P("tokyo-skytree", "Tokyo Skytree", "Sumida, Tokyo", 139.8107, 35.71006, 800,
    ["A broadcasting tower opened in 2012, the tallest tower in the world.", "Its core is a separate column, built to sway against earthquakes."],
    [["Height", "634 m"], ["Opened", "2012"]], { forms: [{ f: "frustum", w: 68, top: 22, h: 350 }, { f: "cyl", r: 11, top: 5, h: 284, z: 350 }] }),
  P("petronas-towers", "Petronas Towers", "Kuala Lumpur", 101.71165, 3.15785, 700,
    ["Twin towers opened in 1998, the tallest buildings in the world until 2004.", "A skybridge joins them at the 41st and 42nd floors."],
    [["Height", "452 m"], ["Opened", "1998"]], { forms: [{ f: "cyl", r: 23, top: 12, h: 400, dx: -40 }, { f: "cyl", r: 23, top: 12, h: 400, dx: 40 }, { f: "cone", r: 5, h: 52, dx: -40, z: 400 }, { f: "cone", r: 5, h: 52, dx: 40, z: 400 }, { f: "box", w: 58, d: 5, h: 6, z: 170 }], parts: [{ label: "Skybridge, 170 m up", h: 173 }] }),
  P("marina-bay-sands", "Marina Bay Sands", "Singapore", 103.86072, 1.28341, 800,
    ["Three hotel towers joined at the top by a park in the sky, opened in 2010.", "The rooftop pool is 57 floors up."],
    [["Towers", "194 m"], ["SkyPark", "340 m long"]], { forms: [...[-80, 0, 80].map((dx) => ({ f: "box" as const, w: 30, d: 70, h: 191, dx })), { f: "box", w: 340, d: 40, h: 8, z: 191 }] }),
  P("angkor-wat", "Angkor Wat", "Siem Reap, Cambodia", 103.867, 13.41247, 2000,
    ["The largest religious monument in the world, built in the early 1100s.", "Its five towers stand for the peaks of Mount Meru."],
    [["Central tower", "65 m"], ["Moat", "190 m wide"]], { forms: [{ f: "steps", w: 187, top: 75, h: 23, n: 3 }, { f: "cone", r: 12, h: 42, z: 23 }, ...[[-30, -30], [30, -30], [-30, 30], [30, 30]].map(([dx, dy]) => ({ f: "cone" as const, r: 8, h: 28, dx, dy, z: 23 }))], parts: [{ label: "Central tower", h: 65 }] }),
  P("borobudur", "Borobudur", "Central Java, Indonesia", 110.20376, -7.60788, 700,
    ["The largest Buddhist temple in the world, built in the 8th and 9th centuries.", "Nine stacked platforms with 504 Buddha statues and 72 bell-shaped stupas."],
    [["Base", "123 m square"], ["Height", "35 m"]], { forms: [{ f: "steps", w: 123, top: 30, h: 28, n: 9 }, { f: "dome", r: 8, h: 7, z: 28 }] }),
  P("monas", "National Monument (Monas)", "Jakarta, Indonesia", 106.82715, -6.17539, 800,
    ["A 132 m obelisk for Indonesia's independence, topped with a gold-leaf flame.", "Built between 1961 and 1975."],
    [["Height", "132 m"], ["Flame", "gold leaf"]], { forms: [{ f: "frustum", w: 45, top: 45, h: 17 }, { f: "frustum", w: 8, top: 5, h: 105, z: 17 }, { f: "cone", r: 3, h: 10, z: 122 }] }),
  P("shwedagon", "Shwedagon Pagoda", "Yangon, Myanmar", 96.14962, 16.79832, 700,
    ["A gilded stupa on Singuttara Hill, the most sacred in Myanmar.", "Its tip holds thousands of diamonds and rubies."],
    [["Height", "99 m"], ["Hill", "51 m"]], { forms: [{ f: "steps", w: 60, top: 40, h: 10, n: 3 }, { f: "dome", r: 18, h: 30, z: 10 }, { f: "cone", r: 8, h: 59, z: 40 }] }),
  P("bagan", "Bagan", "Mandalay Region, Myanmar", 94.86, 21.17, 8000,
    ["Over 2,000 temples and pagodas on a plain by the Irrawaddy.", "Most were built between the 11th and 13th centuries."],
    [["Temples still standing", "over 2,200"]]),
  P("ha-long-bay", "Ha Long Bay", "Quảng Ninh, Vietnam", 107.18, 20.91, 20000,
    ["Some 1,600 limestone islands and islets rising from emerald water.", "Its name means where the dragon descends."],
    [["Islands", "about 1,600"], ["Area", "1,553 km²"]]),
  P("banaue-rice-terraces", "Banaue Rice Terraces", "Ifugao, Philippines", 121.1417, 16.9267, 4000,
    ["Terraces carved into the mountains by the Ifugao some 2,000 years ago.", "Fed by water channelled from the forests above."],
    [["Age", "about 2,000 years"]]),
  P("chocolate-hills", "Chocolate Hills", "Bohol, Philippines", 124.1395, 9.8297, 10000,
    ["More than 1,200 cone-shaped limestone hills.", "Their grass turns brown in the dry season."],
    [["Hills", "at least 1,260"], ["Tallest", "about 120 m"]]),
  P("sigiriya", "Sigiriya", "Central Province, Sri Lanka", 80.7597, 7.957, 2500,
    ["A rock fortress built by King Kashyapa in the 5th century.", "A giant lion's paws still guard the stair to the top."],
    [["Rock", "about 180 m"], ["Built", "477–495"]]),
  P("registan", "Registan", "Samarkand, Uzbekistan", 66.97496, 39.65475, 700,
    ["Three madrasas around one square, from the 15th to 17th centuries.", "Samarkand was a great city of the Silk Road."],
    [["Oldest madrasa", "1417–1420"]], { forms: [{ f: "box", w: 56, d: 81, h: 20, dx: -60 }, { f: "box", w: 56, d: 81, h: 20, dx: 60 }, { f: "box", w: 70, d: 56, h: 20, dy: 60 }, { f: "dome", r: 10, h: 14, dy: 60, z: 20 }] }),
  P("persepolis", "Persepolis", "Fars, Iran", 52.8912, 29.9343, 900,
    ["Ceremonial capital of the Achaemenid Persian Empire, begun about 518 BC.", "Burned by Alexander the Great in 330 BC."],
    [["Terrace", "about 125,000 m²"], ["Begun", "about 518 BC"]], { forms: [{ f: "box", w: 300, d: 450, h: 12 }, ...Array.from({ length: 36 }, (_, i) => ({ f: "cyl" as const, r: 0.9, h: 19, dx: -25 + (i % 6) * 10, dy: -25 + Math.floor(i / 6) * 10, z: 12 }))] }),
  P("petra", "Petra", "Ma'an, Jordan", 35.45142, 30.32234, 2500,
    ["The rock-cut city of the Nabataeans, reached through a narrow canyon, the Siq.", "The Treasury's facade was carved from the cliff in the 1st century."],
    [["Treasury", "about 40 m tall"], ["Siq", "1.2 km long"]], { forms: [{ f: "box", w: 25, d: 4, h: 40 }], parts: [{ label: "The Treasury", h: 40 }] }),
  P("wadi-rum", "Wadi Rum", "Aqaba, Jordan", 35.42, 29.57, 14000,
    ["A desert valley of sandstone and granite mountains.", "Also called the Valley of the Moon."],
    [["Highest peak nearby", "about 1,850 m"]]),
  P("burj-khalifa", "Burj Khalifa", "Dubai", 55.27437, 25.19716, 1500,
    ["The tallest building in the world since 2010.", "Its Y-shaped plan steps back in a spiral as it rises."],
    [["Height", "828 m"], ["Floors", "163"], ["Opened", "2010"]], { forms: [{ f: "cyl", r: 32, top: 26, h: 150 }, { f: "cyl", r: 26, top: 18, h: 200, z: 150 }, { f: "cyl", r: 18, top: 10, h: 200, z: 350 }, { f: "cyl", r: 10, top: 5, h: 130, z: 550 }, { f: "cone", r: 5, h: 148, z: 680 }], parts: [{ label: "Observation deck", h: 555 }, { label: "Spire", h: 828 }] }),
  P("burj-al-arab", "Burj Al Arab", "Dubai", 55.18525, 25.14124, 900,
    ["A hotel on its own island, shaped like a dhow's sail, opened in 1999.", "Its helipad hangs off the side 210 m up."],
    [["Height", "321 m"], ["Opened", "1999"]], { forms: [{ f: "shell", rx: 50, ry: 28, h: 321 }] }),
  P("masjid-al-haram", "Masjid al-Haram", "Mecca, Saudi Arabia", 39.8262, 21.4225, 1200,
    ["Islam's holiest mosque, around the Kaaba.", "Millions of pilgrims come for the Hajj each year."],
    [["Kaaba", "about 13 m tall"]], { forms: [{ f: "box", w: 11, d: 13, h: 13 }] }),
  P("western-wall", "Old City of Jerusalem", "Jerusalem", 35.2345, 31.7767, 1100,
    ["A walled city holy to Judaism, Christianity and Islam.", "The Dome of the Rock and the Western Wall stand side by side."],
    [["Walls", "about 4 km, from the 1530s"]], { forms: [{ f: "cyl", r: 26, h: 11, dx: 50, dy: 60 }, { f: "dome", r: 10, h: 12, dx: 50, dy: 60, z: 25 }] }),

  P("yamoussoukro-basilica", "Basilica of Our Lady of Peace", "Yamoussoukro, Côte d'Ivoire", -5.2968, 6.8113, 700,
    ["Modelled on St Peter's in Rome and consecrated in 1990.", "Its dome rises higher than St Peter's."],
    [["To the cross", "158 m"], ["Consecrated", "1990"]],
    { also: ["Yamoussoukro Basilica"], forms: [{ f: "box", w: 200, d: 150, h: 2 }, { f: "cyl", r: 45, h: 60, z: 2 }, { f: "dome", r: 45, h: 58, z: 62 }, { f: "cyl", r: 5, h: 18, z: 118 }, { f: "cone", r: 3, h: 20, z: 136 }],
      parts: [{ label: "Dome", h: 120 }, { label: "Lantern and cross", h: 156 }] }),
  P("kairouan-mosque", "Great Mosque of Kairouan", "Kairouan, Tunisia", 10.1037, 35.6814, 500,
    ["Founded in 670, one of the oldest mosques in Africa.", "Its square minaret became a model across North Africa."],
    [["Minaret", "about 31 m"], ["Founded", "670"]],
    { also: ["Mosque of Uqba"], forms: [{ f: "box", w: 78, d: 127, h: 10 }, { f: "frustum", w: 10.5, top: 7, h: 31.5, dy: 58 }],
      parts: [{ label: "Minaret", dy: 58, h: 31.5 }, { label: "Prayer hall", dy: -40, h: 10 }] }),
  P("sheikh-zayed-mosque", "Sheikh Zayed Grand Mosque", "Abu Dhabi", 54.475, 24.4128, 900,
    ["Opened in 2007, with 82 domes and room for over 40,000 worshippers.", "It holds one of the world's largest hand-knotted carpets."],
    [["Minarets", "about 107 m"], ["Main dome", "85 m high"], ["Opened", "2007"]],
    { forms: [{ f: "box", w: 290, d: 420, h: 15 }, { f: "cyl", r: 16, h: 45, z: 15 }, { f: "dome", r: 16, h: 25, z: 60 },
      ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, y]) => ({ f: "cyl" as const, r: 4, h: 107, dx: x * 140, dy: y * 205 }))],
      parts: [{ label: "Main dome", h: 85 }, { label: "Minaret", dx: 140, dy: 205, h: 107 }] }),
  P("gyeongbokgung", "Gyeongbokgung Palace", "Seoul, South Korea", 126.977, 37.5796, 900,
    ["The main royal palace of the Joseon dynasty, built in 1395.", "Burned and rebuilt more than once; much of it restored since 1990."],
    [["Built", "1395"], ["Throne hall", "Geunjeongjeon"]],
    { forms: [{ f: "steps", w: 60, top: 50, h: 3, n: 2 }, { f: "box", w: 30, d: 21, h: 15, z: 3 }, { f: "pyramid", w: 36, h: 8, z: 18 }, { f: "box", w: 26, d: 8, h: 12, dy: -220 }],
      parts: [{ label: "Geunjeongjeon throne hall", h: 26 }, { label: "Gwanghwamun gate", dy: -220, h: 12 }] }),
  P("fushimi-inari", "Fushimi Inari Taisha", "Kyoto, Japan", 135.7727, 34.9671, 400,
    ["A Shinto shrine founded in 711, dedicated to Inari, god of rice.", "Thousands of vermilion torii gates line the paths up the mountain."],
    [["Founded", "711"], ["Torii", "about 10,000"]],
    { also: ["Fushimi Inari"], forms: [{ f: "box", w: 24, d: 14, h: 10, dy: -80 },
      ...Array.from({ length: 13 }, (_, i) => ({ f: "arch" as const, span: 3.5, h: 4.5, t: 0.5, dx: 10 + i * 1.2, dy: -40 + i * 8, rot: 80 }))],
      parts: [{ label: "Senbon torii: a thousand gates", dx: 17, dy: 8, h: 5 }, { label: "Main hall", dy: -80, h: 10 }] }),
  // ---- Oceania ---------------------------------------------------------------------------------------
  P("sydney-opera-house", "Sydney Opera House", "Bennelong Point, Sydney", 151.21514, -33.85681, 700,
    ["Jørn Utzon's concert hall on the harbour, opened in 1973.", "Its shells are cut from one imaginary sphere."],
    [["Highest shell", "67 m above the sea"], ["Opened", "1973"]], { forms: [{ f: "box", w: 120, d: 183, h: 8, rot: -25 }, ...[[0, -40, 60], [0, 0, 55], [0, 35, 45]].map(([dx, dy, h]) => ({ f: "shell" as const, rx: 22, ry: 14, h, dx: dx - 20, dy, z: 8, rot: -25 })), ...[[0, -30, 45], [0, 5, 40]].map(([dx, dy, h]) => ({ f: "shell" as const, rx: 18, ry: 12, h, dx: dx + 25, dy, z: 8, rot: -25 }))] }),
  P("uluru", "Uluru", "Northern Territory, Australia", 131.03686, -25.34443, 9000,
    ["A sandstone monolith sacred to the Aṉangu people.", "It changes colour through the day, glowing red at sunset."],
    [["Height", "348 m above the plain"], ["Around", "9.4 km"]]),
  P("great-barrier-reef", "Heart Reef, Great Barrier Reef", "Queensland, Australia", 149.04, -19.28, 12000,
    ["The world's largest coral reef system, visible from space.", "Made by billions of tiny coral animals."],
    [["Length", "about 2,300 km"], ["Reefs", "about 2,900"]]),
  P("nan-madol", "Nan Madol", "Pohnpei, Micronesia", 158.3353, 6.8436, 1500,
    ["A city of nearly 100 artificial islets, built from basalt columns off Pohnpei.", "Seat of the Saudeleur dynasty from about 1180 to 1628."],
    [["Islets", "about 100"], ["Tallest walls", "about 7.6 m"]],
    { forms: [{ f: "box", w: 70, d: 60, h: 7.6 }, { f: "box", w: 40, d: 40, h: 2, dx: -120, dy: 60 }, { f: "box", w: 50, d: 35, h: 2, dx: 90, dy: -110 }, { f: "box", w: 30, d: 45, h: 2, dx: -60, dy: -150 }, { f: "box", w: 35, d: 30, h: 3, dx: 160, dy: 120 }],
      parts: [{ label: "Nandauwas, the royal mortuary", h: 8 }] }),
  P("milford-sound", "Milford Sound", "Fiordland, New Zealand", 167.9, -44.64, 16000,
    ["A fiord carved by glaciers, walled by cliffs over 1,000 m high.", "Mitre Peak rises straight from the water."],
    [["Mitre Peak", "1,692 m"], ["Length", "about 15 km"]]),
];

// Later lists add places; an id already here wins.
export const INTROS: IntroPlace[] = [...FIRST, ...MORE_INTROS, ...HERITAGE_INTROS, ...FOOTHOLD_INTROS, ...NATURE_INTROS].filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);

/** The signature places tagged with any of these. */
export const introsTagged = (...tags: string[]) => INTROS.filter((p) => p.tags?.some((t) => tags.includes(t)));

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");

/** The intro place for a name (as searched) or a point, if there is one. */
export function introFor(name?: string | null, lon?: number, lat?: number): IntroPlace | null {
  const n = name ? norm(name) : "";
  if (n) {
    const hit = INTROS.find((p) => norm(p.name) === n || p.also?.some((a) => norm(a) === n)) ?? listed.find((x) => x.n === n)?.p
      ?? (n.length > 5 ? INTROS.find((p) => norm(p.name).startsWith(n)) : undefined);
    if (hit) return hit;
  }
  if (lon !== undefined && lat !== undefined)
    for (const p of INTROS) {
      const dx = (lon - p.lon) * 111_320 * Math.cos((p.lat * Math.PI) / 180), dy = (lat - p.lat) * 110_540;
      if (Math.hypot(dx, dy) < Math.min(1500, p.size / 3)) return p;
    }
  return listedFor(n, lon, lat);
}

// ---- The rest of the World Heritage List -----------------------------------------------------------
// Loaded on first need (it's 1,273 places); until then only the intros above are found.
let listed: { p: IntroPlace; n: string }[] = [];
let listing: Promise<void> | null = null;

/** Loads the World Heritage List, joining its sites onto the intros above and adding the rest. */
export function loadWorldHeritage(): Promise<void> {
  return (listing ??= import("./unesco").then((m) => { listed = m.worldHeritage(INTROS).map((p) => ({ p, n: norm(p.name) })); }));
}
export const worldHeritageCount = () => listed.length;

/** Like introFor, after making sure the World Heritage List is loaded. */
export async function introForAsync(name?: string | null, lon?: number, lat?: number): Promise<IntroPlace | null> {
  // Wait a moment for the List, not longer: arriving at the place matters more.
  await Promise.race([loadWorldHeritage().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  return introFor(name, lon, lat);
}

function listedFor(n: string, lon?: number, lat?: number): IntroPlace | null {
  if (n) {
    const hit = (n.length > 5 ? listed.find((x) => x.n.startsWith(n)) : undefined) ?? (n.length >= 6 ? listed.find((x) => ` ${x.n} `.includes(` ${n} `)) : undefined);
    if (hit) return hit.p;
  }
  // By point only for cultural sites, whose points sit on the place; natural sites' points are just somewhere inside them.
  if (lon !== undefined && lat !== undefined)
    for (const { p } of listed) {
      if (p.size > 1200) continue;
      const dx = (lon - p.lon) * 111_320 * Math.cos((p.lat * Math.PI) / 180), dy = (lat - p.lat) * 110_540;
      if (Math.hypot(dx, dy) < 300) return p;
    }
  return null;
}

// ---- When to play ----------------------------------------------------------------------------------
const SEEN = "atlas.intros.seen", OFF = "atlas.intros";

export function introsOff(): boolean {
  try { return localStorage.getItem(OFF) === "off"; } catch { return false; }
}

export function setIntrosOff(off: boolean) {
  try { if (off) localStorage.setItem(OFF, "off"); else localStorage.removeItem(OFF); } catch { /* private mode */ }
}

/** Plays once per place per visit, unless intros are switched off. */
export function shouldPlay(p: IntroPlace): boolean {
  if (introsOff()) return false;
  try { return !(sessionStorage.getItem(SEEN) ?? "").split(",").includes(p.id); } catch { return true; }
}

export function markSeen(p: IntroPlace) {
  try {
    const s = (sessionStorage.getItem(SEEN) ?? "").split(",").filter(Boolean);
    if (!s.includes(p.id)) sessionStorage.setItem(SEEN, [...s, p.id].join(","));
  } catch { /* private mode */ }
}
