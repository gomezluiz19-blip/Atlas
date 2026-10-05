// The great feats of nature: lights in the sky, the great migrations, the
// animals people come to see, the rainforests, mountain ranges, deserts,
// deeps and the strange places where the Earth shows its workings. Many
// move, so their intros use effects (aurora, herds, rivers, clouds, glow)
// rather than a model; the animals are modelled in white, like a sculpture.
import type { Fx } from "./fx";
import type { Form, IntroPlace } from "./places";

const P = (id: string, name: string, where: string, lon: number, lat: number, size: number, tags: string[], lines: string[], facts: [string, string][], extra: Partial<IntroPlace> = {}): IntroPlace =>
  ({ id, name, where, lon, lat, size, tags: ["nature", ...tags], lines, facts, ...extra });

const clouds: Fx = { fx: "clouds", n: 8 };
/** A herd crossing the plinth from south-west to north-east. */
const crossing = (size: number, n: number, color: string, scale = 1, fly = 0, seconds = 24): Fx =>
  ({ fx: "herd", n, from: [-size * 0.45, -size * 0.32], to: [size * 0.45, size * 0.3], spread: size * 0.35, size: (size / 260) * scale, color, seconds, fly });

/** A lion, standing, facing south (metres). */
const LION: Form[] = [
  // A tilted cylinder is centred on its height: the body's axis sits at z.
  { f: "cyl", r: 0.4, h: 1.5, tilt: 90, dy: 0.75, z: 0.98 },
  { f: "sphere", r: 0.43, dy: 0.62, z: 0.55 }, { f: "sphere", r: 0.42, dy: -0.55, z: 0.56 },
  ...[[-0.2, 0.6], [0.2, 0.6], [-0.21, -0.55], [0.21, -0.55]].map(([dx, dy]): Form => ({ f: "cyl", r: 0.13, top: 0.1, h: 0.75, dx, dy })),
  { f: "sphere", r: 0.5, dy: -0.82, z: 0.62 },
  { f: "sphere", r: 0.3, dy: -1.08, z: 1.0 },
  { f: "sphere", r: 0.15, dy: -1.33, z: 1.02 },
  { f: "sphere", r: 0.08, dx: -0.19, dy: -1.0, z: 1.52 }, { f: "sphere", r: 0.08, dx: 0.19, dy: -1.0, z: 1.52 },
  { f: "cyl", r: 0.045, h: 0.85, tilt: -120, dy: 0.8, z: 1.12 },
  { f: "sphere", r: 0.09, dy: 1.54, z: 0.6 },
];
/** An elephant, standing, facing south (metres). */
const ELEPHANT: Form[] = [
  { f: "cyl", r: 1.1, h: 2.7, tilt: 90, dy: 1.3, z: 2.05 },
  ...[[-0.6, 0.9], [0.6, 0.9], [-0.6, -0.9], [0.6, -0.9]].map(([dx, dy]): Form => ({ f: "cyl", r: 0.34, h: 1.45, dx, dy })),
  { f: "sphere", r: 0.8, dy: -1.7, z: 1.25 },
  { f: "cyl", r: 0.78, h: 0.1, tilt: 90, dx: -0.85, dy: -1.35, z: 2.15 }, { f: "cyl", r: 0.78, h: 0.1, tilt: 90, dx: 0.85, dy: -1.35, z: 2.15 },
  { f: "cyl", r: 0.12, top: 0.22, h: 1.7, dy: -2.3, z: 0.2 },
  { f: "cyl", r: 0.07, h: 0.9, tilt: 120, dx: -0.32, dy: -2.05, z: 1.55 }, { f: "cyl", r: 0.07, h: 0.9, tilt: 120, dx: 0.32, dy: -2.05, z: 1.55 },
  { f: "cyl", r: 0.04, h: 1.0, tilt: -150, dy: 1.32, z: 2.6 },
];
/** A giant sequoia (metres). */
const SEQUOIA: Form[] = [
  { f: "cyl", r: 5.5, top: 2.6, h: 72 },
  { f: "cone", r: 9, h: 26, z: 58 },
  ...[[6, 0, 44], [-6, 3, 50], [2, -6, 56], [-3, -5, 40]].map(([dx, dy, z]): Form => ({ f: "sphere", r: 4.5, dx, dy, z })),
];
/** Baobabs along a road (metres). */
const BAOBABS: Form[] = [-120, -80, -45, -10, 30, 70, 110].flatMap((y, i): Form[] => {
  const dx = i % 2 ? 14 : -14, h = 20 + (i % 3) * 4;
  return [{ f: "cyl", r: 1.6, top: 1.3, h, dx, dy: y }, { f: "sphere", r: 2.6, dx, dy: y, z: h - 1 }, { f: "sphere", r: 1.8, dx: dx + 2.5, dy: y, z: h - 2 }, { f: "sphere", r: 1.8, dx: dx - 2.5, dy: y + 1, z: h - 2.5 }];
}).concat([{ f: "box", w: 6, d: 300, h: 0.2 }]);

export const NATURE_INTROS: IntroPlace[] = [
  // ---- Lights in the sky ----------------------------------------------------------------------------
  P("aurora-borealis", "Aurora borealis", "Abisko, Swedish Lapland", 18.8, 68.35, 15000, ["sky"],
    ["The northern lights: particles from the Sun strike oxygen and nitrogen 100 to 300 km up.", "Earth's magnetic field draws them into a ring around the pole; Abisko lies under it, often in a gap in the clouds."],
    [["Height", "about 100–300 km"], ["Season", "September–March"]],
    { also: ["Northern lights", "Aurora", "Aurora Borealis", "Abisko", "Tromsø northern lights"], fx: [{ fx: "aurora" }] }),
  P("aurora-australis", "Aurora australis", "Lake Tekapo, New Zealand", 170.4775, -44.0047, 12000, ["sky"],
    ["The southern lights, seen from a dark-sky reserve in the Mackenzie Basin.", "Red and pink come from oxygen highest up; green from oxygen lower down."],
    [["Dark-sky reserve since", "2012"]], { also: ["Southern lights", "Aurora Australis", "Lake Tekapo"], fx: [{ fx: "aurora", colors: ["#5dffb0", "#ff5fb0"] }] }),
  P("midnight-sun", "Midnight sun at North Cape", "Nordkapp, Norway", 25.7837, 71.1688, 6000, ["sky"],
    ["From mid-May to late July the sun never sets over this cliff at the top of Europe.", "In the dark of winter it doesn't rise for about two months."],
    [["Cliff", "about 307 m"]], { also: ["Midnight sun", "North Cape", "Nordkapp"], fx: [clouds] }),
  // ---- Migrations -----------------------------------------------------------------------------------
  P("great-migration", "The Great Migration", "Mara River, Kenya", 35.03, -1.52, 6000, ["wildlife"],
    ["About 1.5 million wildebeest, with zebras and gazelles, circle between the Serengeti and the Maasai Mara, following the rain.", "From about July to October they cross the Mara River, past crocodiles."],
    [["Wildebeest", "about 1.5 million"], ["River crossings", "July–October"]],
    { also: ["Wildebeest migration", "Mara River crossing", "Serengeti migration", "Maasai Mara", "Masai Mara"],
      fx: [{ fx: "river", pts: [[-300, -3000], [150, -1200], [-200, 300], [250, 1500], [0, 3000]], color: "#7fb6d8" }, { fx: "herd", n: 420, from: [-2600, -1500], to: [2600, 1500], spread: 1400, size: 24, color: "#3d3128", seconds: 30 }] }),
  P("monarch-butterflies", "Monarch butterfly sanctuary", "El Rosario, Michoacán, Mexico", -100.2667, 19.5917, 3000, ["wildlife"],
    ["Millions of monarchs fly up to about 4,000 km from Canada and the United States to winter on these fir-clad mountains.", "No butterfly makes the round trip: it takes several generations."],
    [["Season", "November–March"]], { also: ["Monarch butterflies", "Monarch migration", "El Rosario"], fx: [crossing(3000, 360, "#ff8a1e", 0.5, 60, 20)] }),
  P("christmas-island-crabs", "Red crab migration", "Christmas Island, Australia", 105.63, -10.45, 8000, ["wildlife"],
    ["Tens of millions of red crabs leave the forest for the sea to spawn, with the first rains of the wet season.", "Roads close and bridges are built for them."],
    [["Red crabs", "about 40–50 million"]], { also: ["Christmas Island red crabs", "Red crab migration"], fx: [crossing(8000, 500, "#d6322a", 0.45, 0, 26)] }),
  P("caribou-migration", "Porcupine caribou", "Arctic National Wildlife Refuge, Alaska", -144.5, 69.8, 30000, ["wildlife"],
    ["Some 200,000 caribou travel up to about 2,400 km a year between Yukon and the calving grounds on Alaska's coastal plain.", "The Gwich'in call the calving grounds the sacred place where life begins."],
    [["Caribou", "about 200,000"]], { also: ["Caribou migration", "Porcupine caribou herd", "ANWR"], fx: [crossing(30000, 380, "#6a5a48", 0.9, 0, 34)] }),
  P("kasanka-bats", "Kasanka bat migration", "Kasanka National Park, Zambia", 30.25, -12.55, 3000, ["wildlife"],
    ["About 10 million straw-coloured fruit bats arrive each October to December, the largest mammal migration on Earth.", "At dusk they rise from a small patch of swamp forest and darken the sky."],
    [["Bats", "about 10 million"]], { also: ["Kasanka", "Fruit bat migration"], fx: [crossing(3000, 500, "#2a2622", 0.4, 120, 14)] }),
  P("gray-whales", "Gray whale lagoons", "San Ignacio Lagoon, Baja California", -113.2, 26.8, 15000, ["wildlife"],
    ["Gray whales swim from the Arctic to calve in Baja's lagoons, one of the longest migrations of any mammal.", "Here, mothers bring their calves up to the boats."],
    [["Round trip", "about 16,000–20,000 km"]], { also: ["Gray whales", "San Ignacio Lagoon", "Whale watching Baja"], fx: [crossing(15000, 24, "#8a9199", 2.5, 0, 60)] }),
  P("sardine-run", "Sardine Run", "Wild Coast, South Africa", 29.55, -31.6, 20000, ["wildlife"],
    ["In winter, shoals of sardines kilometres long move up the coast, followed by dolphins, sharks and diving gannets.", "It is one of the largest gatherings of animals in the oceans."],
    [["Season", "May–July"]], { also: ["Sardine run"], fx: [crossing(20000, 480, "#9fb6c8", 0.35, 0, 22)] }),
  P("brooks-falls", "Brooks Falls", "Katmai National Park, Alaska", -155.7783, 58.5547, 600, ["wildlife", "park"],
    ["In July, brown bears stand at the lip of the falls catching sockeye salmon as they leap.", "The bears' autumn weight is celebrated each year in Fat Bear Week."],
    [["Season", "July and September"]], { also: ["Katmai", "Fat Bear Week"], fx: [{ fx: "river", pts: [[-300, 40], [-60, 0], [0, -10], [300, -60]], color: "#7fb6d8" }, { fx: "herd", n: 40, from: [250, -50], to: [-250, 30], spread: 40, size: 2.4, color: "#c2453a", seconds: 8, fly: 3 }] }),
  P("lake-natron", "Lake Natron flamingos", "Arusha, Tanzania", 36.0, -2.4, 30000, ["wildlife"],
    ["A caustic soda lake that is the breeding ground for most of the world's lesser flamingos.", "Its salt-loving microbes turn the water red."],
    [["Water", "up to pH 10.5"]], { also: ["Lake Natron", "Flamingos"], fx: [crossing(30000, 300, "#ff8fb4", 0.5, 0, 50)] }),
  // ---- Animals --------------------------------------------------------------------------------------
  P("african-lion", "African lion", "Maasai Mara, Kenya", 35.1, -1.4, 8, ["wildlife"],
    ["The only cat that lives in prides: related lionesses, their cubs and one or a few males.", "A roar can be heard about 8 km away."],
    [["Male weight", "up to about 190 kg"], ["Wild lions", "about 20,000–25,000"]],
    { also: ["Lion", "Lions", "Lions of the Maasai Mara"], forms: LION, parts: [{ label: "Mane", dy: -0.82, h: 1.6 }, { label: "Tail tuft", dy: 1.54, h: 0.7 }] }),
  P("african-elephant", "African elephant", "Amboseli, Kenya", 37.26, -2.65, 16, ["wildlife"],
    ["The largest land animal; Amboseli's herds walk under Kilimanjaro.", "Elephants know each other's calls from kilometres away and stay with their dead."],
    [["Bulls", "up to about 6 tonnes"], ["Shoulder height", "about 3 m"]],
    { also: ["Elephant", "Elephants", "Amboseli"], forms: ELEPHANT, parts: [{ label: "Trunk: about 40,000 muscles", dy: -2.3, h: 1.2 }, { label: "Ears that cool the blood", dx: 0.9, dy: -1.35, h: 2.3 }] }),
  // ---- Forests, rivers, wetlands --------------------------------------------------------------------
  P("amazon", "Amazon rainforest", "Amazonas, Brazil", -62.0, -3.3, 200000, ["forest"],
    ["The largest rainforest on Earth, about 5.5 million km².", "Its river carries about a fifth of all the fresh water flowing into the oceans.", "Its trees make much of their own rain, water passing from leaf to cloud and back again."],
    [["Forest", "about 5.5 million km²"], ["River", "about 6,400 km"]],
    { also: ["Amazon", "Amazon River", "Amazonia", "Amazon Rainforest", "Solimões"], fx: [{ fx: "river", pts: [[-100000, 15000], [-55000, -4000], [-10000, 6000], [40000, -6000], [100000, 2000]], color: "#c9a77a", n: 300 }, clouds] }),
  P("pantanal", "Pantanal", "Mato Grosso, Brazil", -57.0, -17.5, 100000, ["wildlife", "forest"],
    ["The largest tropical wetland in the world, flooded each wet season.", "It's the best place on Earth to see wild jaguars."],
    [["Area", "about 150,000 km²"]], { fx: [{ fx: "river", pts: [[-50000, 40000], [-10000, 5000], [5000, -20000], [40000, -50000]], color: "#7fb6d8" }] }),
  P("nile", "The Nile at Aswan", "Aswan, Egypt", 32.8778, 24.0889, 15000, ["river"],
    ["The longest river in Africa, about 6,650 km, flowing north through the desert to the Mediterranean.", "At Aswan it runs through granite islands at the First Cataract."],
    [["Length", "about 6,650 km"]], { also: ["Nile", "River Nile", "Nile River"], fx: [{ fx: "river", pts: [[300, -7500], [-400, -2500], [200, 0], [-300, 3500], [100, 7500]], color: "#4c9ac9" }] }),
  P("general-sherman", "General Sherman Tree", "Sequoia National Park, California", -118.7514, 36.5819, 120, ["forest", "park"],
    ["The largest tree on Earth by volume, about 1,487 m³, a giant sequoia about 84 m tall.", "It may be about 2,200 years old."],
    [["Height", "about 84 m"], ["Base", "about 11 m across"]], { also: ["General Sherman", "Sequoia National Park", "Giant sequoia"], forms: SEQUOIA }),
  P("avenue-of-the-baobabs", "Avenue of the Baobabs", "Menabe, Madagascar", 44.4182, -20.2509, 400, ["forest"],
    ["Grandidier's baobabs, some 800 years old and up to about 30 m tall, line a dirt road.", "They're what's left of a forest cleared around them."],
    [["Age", "up to about 800 years"]], { also: ["Baobab Alley", "Baobabs"], forms: BAOBABS }),
  // ---- Mountains ------------------------------------------------------------------------------------
  P("himalaya", "The Himalaya", "Nepal and Tibet", 86.75, 27.95, 150000, ["mountains"],
    ["The highest mountains on Earth, still rising as India pushes north into Asia at about 5 cm a year.", "The range runs about 2,400 km; ten of the fourteen peaks over 8,000 m stand in it."],
    [["Length", "about 2,400 km"], ["Peaks over 8,000 m", "10"]], { also: ["Himalayas", "Himalaya", "Himalayan Mountains"], fx: [clouds] }),
  P("rocky-mountains", "The Rocky Mountains", "Colorado", -105.68, 40.3, 80000, ["mountains"],
    ["About 4,800 km of mountains from British Columbia to New Mexico, raised some 80 to 55 million years ago.", "Their crest is the Continental Divide: rain on one side runs to the Pacific, on the other to the Atlantic."],
    [["Mount Elbert", "4,401 m"], ["Length", "about 4,800 km"]], { also: ["Rockies", "Rocky Mountains", "Rocky Mountain National Park", "Continental Divide"], fx: [clouds] }),
  P("adirondacks", "The Adirondacks", "New York", -73.95, 44.11, 60000, ["mountains", "park"],
    ["A dome of ancient rock in northern New York, worn into the 46 High Peaks and thousands of lakes and ponds.", "The Adirondack Park, about 24,000 km², is larger than Yellowstone, Yosemite, Glacier, Grand Canyon and Great Smoky Mountains combined."],
    [["Mount Marcy", "1,629 m"], ["Park since", "1892"]], { also: ["Adirondack Mountains", "Adirondack Park", "Adirondack", "Adirondack High Peaks"], fx: [clouds] }),
  P("andes", "Aconcagua and the Andes", "Mendoza, Argentina", -70.0109, -32.6532, 40000, ["mountains"],
    ["The longest mountain range on land, about 7,000 km down South America.", "Aconcagua is the highest mountain outside Asia."],
    [["Aconcagua", "6,961 m"], ["Length", "about 7,000 km"]], { also: ["Andes", "Aconcagua", "Andes Mountains"], fx: [clouds] }),
  P("mont-blanc", "Mont Blanc", "Alps, France and Italy", 6.8652, 45.8326, 30000, ["mountains"],
    ["The highest mountain of the Alps; its first ascent, in 1786, is often called the birth of mountaineering.", "The Alps run about 1,200 km across eight countries."],
    [["Summit", "about 4,806 m"]], { also: ["Alps", "Monte Bianco", "The Alps"], fx: [clouds] }),
  P("denali", "Denali", "Alaska", -151.0074, 63.0695, 40000, ["mountains", "park"],
    ["The highest mountain in North America, rising about 5,500 m from its base, more than Everest does from its own.", "Its name in the Koyukon language means 'the high one'."],
    [["Summit", "6,190 m"]], { also: ["Mount McKinley", "Denali National Park"], fx: [clouds] }),
  P("k2", "K2", "Karakoram, Pakistan and China", 76.5133, 35.8825, 25000, ["mountains"],
    ["The second-highest mountain on Earth, the Savage Mountain, harder and deadlier than Everest.", "It was first climbed in winter only in 2021, by a team of Nepali climbers."],
    [["Summit", "8,611 m"]], { also: ["Mount Godwin-Austen", "Chhogori", "Karakoram"], fx: [clouds] }),
  P("mauna-kea", "Mauna Kea", "Hawaiʻi", -155.4681, 19.8206, 40000, ["mountains", "sky"],
    ["Measured from its base on the sea floor, about 10,200 m: taller than Everest.", "Its summit, above most of the atmosphere's water, holds some of the world's great telescopes."],
    [["Above sea level", "4,207 m"], ["From its base", "about 10,200 m"]], { also: ["Mauna Kea Observatories"] }),
  P("mount-st-helens", "Mount St. Helens", "Washington", -122.1944, 46.1912, 15000, ["mountains"],
    ["On 18 May 1980 its north side collapsed in the largest landslide ever recorded, and it lost about 400 m of its height.", "Life has been returning to the blast zone since."],
    [["Erupted", "18 May 1980"], ["Summit now", "2,549 m"]], { also: ["Mount Saint Helens", "St. Helens"] }),
  P("rainbow-mountain", "Rainbow Mountain", "Cusco, Peru", -71.303, -13.8697, 5000, ["mountains"],
    ["Stripes of red, yellow and green sediments, laid down over millions of years and folded up into the Andes.", "Snow and ice hid them until recently."],
    [["Summit", "about 5,200 m"]], { also: ["Vinicunca", "Montaña de Siete Colores"] }),
  P("zhangye-danxia", "Zhangye Danxia", "Gansu, China", 100.0, 38.92, 8000, ["mountains"],
    ["Sandstone hills striped in reds, oranges and yellows like a painted cake.", "The colours come from minerals laid down over 24 million years."],
    [["Colours laid down over", "about 24 million years"]], { also: ["Rainbow Mountains of China", "Danxia landform"] }),
  // ---- Deserts, ice, deeps --------------------------------------------------------------------------
  P("sahara", "Erg Chebbi, Sahara", "Merzouga, Morocco", -4.0135, 31.15, 15000, ["desert"],
    ["Dunes up to about 150 m high at the edge of the Sahara, the largest hot desert on Earth, about 9 million km².", "The dunes turn from gold to red as the sun goes down."],
    [["Sahara", "about 9 million km²"]], { also: ["Sahara", "Sahara Desert", "Erg Chebbi", "Merzouga"] }),
  P("dead-sea", "Dead Sea", "Jordan Rift Valley", 35.5, 31.5, 50000, ["desert"],
    ["The lowest land on Earth, its shore about 430 m below sea level.", "Its water is about a third salt, so dense you float."],
    [["Shore below sea level", "about 430 m"]], { also: ["The Dead Sea"] }),
  P("danakil", "Dallol, Danakil Depression", "Afar, Ethiopia", 40.3, 14.24, 3000, ["desert"],
    ["One of the hottest inhabited places on Earth, where acid hot springs paint the salt yellow, green and orange.", "Camel caravans still carry salt slabs out of the depression."],
    [["Below sea level", "about 125 m"]], { also: ["Danakil Depression", "Dallol"] }),
  P("challenger-deep", "Challenger Deep", "Mariana Trench, Pacific Ocean", 142.2, 11.35, 120000, ["ocean"],
    ["The deepest point in the oceans, about 10,935 m down.", "People first reached the bottom in 1960; only a few dozen have been since."],
    [["Depth", "about 10,935 m"], ["First reached", "1960"]], { also: ["Mariana Trench", "Marianas Trench"] }),
  P("lake-baikal", "Lake Baikal", "Siberia, Russia", 108.2, 53.6, 120000, ["water"],
    ["The deepest and oldest lake on Earth, about 1,642 m deep and some 25 million years old.", "It holds about a fifth of the world's unfrozen fresh surface water."],
    [["Depth", "about 1,642 m"]], { also: ["Baikal"] }),
  P("vatnajokull", "Vatnajökull", "Iceland", -16.8, 64.4, 80000, ["ice"],
    ["The largest ice cap in Europe by volume, with active volcanoes beneath it.", "When they erupt under the ice they send out floods called jökulhlaups."],
    [["Ice up to", "about 900 m thick"]], { also: ["Vatnajokull"], fx: [clouds] }),
  P("antarctic-peninsula", "Lemaire Channel", "Antarctic Peninsula", -64.0, -65.1, 15000, ["ice"],
    ["Antarctica holds about 70% of the world's fresh water, as ice up to about 4.8 km thick.", "The Lemaire Channel, between peaks and glaciers, is called Kodak Gap."],
    [["Ice up to", "about 4.8 km thick"]], { also: ["Antarctica", "Antarctic", "Lemaire Channel"], fx: [clouds] }),
  P("great-rift-valley", "Great Rift Valley", "Kenya", 36.59, -0.98, 60000, ["mountains"],
    ["Here Africa is pulling apart, a few millimetres a year, along a rift thousands of kilometres long.", "Fossils from the rift tell much of the story of how humans evolved."],
    [["Rift length", "thousands of km"]], { also: ["Rift Valley", "East African Rift"] }),
  P("lake-hillier", "Lake Hillier", "Middle Island, Western Australia", 123.2, -34.093, 3000, ["water"],
    ["A lake that stays bubble-gum pink, coloured by salt-loving algae and microbes.", "It is separated from the blue ocean by a thin strip of sand and forest."],
    [["Length", "about 600 m"]], { also: ["Pink lake"] }),
  P("fingals-cave", "Fingal's Cave", "Staffa, Scotland", -6.341, 56.434, 1500, ["ocean"],
    ["A sea cave of six-sided basalt columns, from the same lava flow as the Giant's Causeway.", "Mendelssohn wrote his Hebrides Overture after visiting in 1829."],
    [["Cave length", "about 70 m"]], { also: ["Staffa"] }),
  // ---- Glowing nights -------------------------------------------------------------------------------
  P("synchronous-fireflies", "Synchronous fireflies", "Elkmont, Great Smoky Mountains", -83.58, 35.66, 1500, ["wildlife", "park"],
    ["For about two weeks around early June, thousands of fireflies flash together in waves through the forest.", "It's how the males find mates, and nobody fully knows how they keep time."],
    [["Season", "about two weeks in late May–June"]], { also: ["Elkmont fireflies", "Fireflies"], fx: [{ fx: "glow", n: 700, color: "#f6ff7a", spread: 1200 }] }),
  P("mosquito-bay", "Mosquito Bay", "Vieques, Puerto Rico", -65.44, 18.1, 2000, ["ocean"],
    ["The brightest bioluminescent bay recorded: tiny plankton glow blue when the water moves.", "Swimming is not allowed, but kayaks leave trails of light."],
    [["Plankton", "dinoflagellates"]], { also: ["Bioluminescent Bay", "Vieques bio bay"], fx: [{ fx: "glow", n: 900, color: "#4fd4ff", spread: 1100, low: 1 }] }),
  P("waitomo", "Waitomo Glowworm Caves", "Waikato, New Zealand", 175.1, -38.26, 600, ["wildlife"],
    ["Thousands of glowworms light the roof of a cave like a starry sky, seen from boats in the dark.", "They're the larvae of a fungus gnat, fishing for insects with sticky threads."],
    [["Glowworm", "Arachnocampa luminosa"]], { also: ["Waitomo Caves", "Glowworm caves"], fx: [{ fx: "glow", n: 600, color: "#7affef", spread: 450, low: 20 }] }),
];
