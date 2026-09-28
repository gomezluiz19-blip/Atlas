// Stories that ship with Atlas: the start of the library. The Nile set is made
// to show how stories connect: each ends by pointing to the others. Figures
// are the commonly cited ones.
import { overhead, TEMPLATES } from "../work/presentModel";

const A = { name: "Atlas" };
const ref = (id: string, title: string) => ({ id, title, author: "Atlas" });
const NILE = ref("atlas-nile", "The Nile, from source to sea");
const DAM = ref("atlas-aswan", "The Aswan High Dam");
const EGYPT = ref("atlas-egypt", "Ancient Egypt: a ribbon of green");
const RIFT = ref("atlas-rift", "The Great Rift Valley");
const AMAZON = ref("atlas-amazon", "The Amazon, a river like a sea");

export const FEATURED = [
  {
    id: NILE.id, title: NILE.title, author: A, tags: ["Rivers and water", "Countries"], level: "Ages 8–11",
    summary: "Follow the world's longest river 6,650 km from the lakes of East Africa to the Mediterranean, through eleven countries.",
    links: [DAM, EGYPT, RIFT, AMAZON],
    slides: [
      { title: "The longest river", text: "The Nile runs about 6,650 km north through eleven countries. Almost everyone in Egypt lives within a few kilometres of it.", camera: overhead(31, 14, 8_000_000) },
      { title: "Lake Victoria: the White Nile begins", text: "Africa's largest lake feeds the White Nile, which flows out at Jinja in Uganda. Its furthest sources are streams in Rwanda and Burundi.", camera: overhead(33, -1, 900_000) },
      { title: "Lake Tana: the Blue Nile", text: "The Blue Nile starts here in the Ethiopian highlands. It brings most of the river's water, and the summer flood, from the Ethiopian rains.", camera: overhead(37.3, 12, 450_000) },
      { title: "Khartoum: where two Niles meet", text: "The Blue and White Nile join at Khartoum. From the air you can see the two colours of water side by side.", camera: overhead(32.51, 15.62, 45_000, 35), orbit: true },
      { title: "Lake Nasser and the Aswan High Dam", text: "Since 1970 the High Dam has held the flood back in one of the world's largest reservoirs, 550 km long.", camera: overhead(32.88, 23.5, 400_000) },
      { title: "Luxor: temples by the river", text: "Ancient Thebes: Karnak and Luxor temples on the east bank, the Valley of the Kings on the west.", camera: overhead(32.63, 25.71, 30_000, 45) },
      { title: "Cairo", text: "Africa's largest city grew where the valley opens into the delta. The pyramids of Giza stand on the desert edge.", camera: overhead(31.23, 30.04, 70_000, 30) },
      { title: "The delta", text: "The river splits into branches and fans out into a green triangle of farmland before reaching the Mediterranean.", camera: overhead(31, 31, 380_000) },
    ],
  },
  {
    id: DAM.id, title: DAM.title, author: A, tags: ["Rivers and water", "Countries"], level: "Ages 11–14",
    summary: "How one dam ended the Nile's yearly flood: electricity and year-round farming, and what was lost.",
    links: [NILE, EGYPT],
    slides: [
      { title: "A wall across the Nile", text: "Finished in 1970, the dam is 3.8 km long and 111 m high. Its power station once made half of Egypt's electricity.", camera: overhead(32.88, 23.97, 18_000, 40), orbit: true },
      { title: "Lake Nasser", text: "The reservoir stretches 550 km south into Sudan. It stores about two years of the river's flow.", camera: overhead(32.3, 22.5, 700_000) },
      { title: "Abu Simbel moved", text: "The rising water would have drowned the temples of Abu Simbel, so they were cut into blocks and rebuilt 65 m higher.", camera: overhead(31.63, 22.34, 8_000, 45) },
      { title: "No more flood, no more silt", text: "Farms downstream now get water all year, but no longer the fertile silt the flood carried. The delta's coast is slowly retreating.", camera: overhead(31, 31.2, 300_000) },
    ],
  },
  {
    id: EGYPT.id, title: EGYPT.title, author: A, tags: ["History", "Rivers and water"], level: "Ages 8–11",
    summary: "Why a civilisation grew along one river in the desert, from the pyramids to the Valley of the Kings.",
    links: [NILE, DAM],
    slides: [
      { title: "Green in the desert", text: "Seen from space, Egypt is a thin green line of fields along the Nile, with desert on both sides.", camera: overhead(31.5, 26.5, 1_600_000) },
      { title: "The pyramids of Giza", text: "Built around 4,500 years ago as tombs for kings. The Great Pyramid was the tallest building on Earth for nearly 4,000 years.", camera: overhead(31.134, 29.978, 3_500, 45), orbit: true },
      { title: "Karnak", text: "One of the largest religious sites ever built, added to by pharaohs over 2,000 years.", camera: overhead(32.657, 25.719, 3_000, 45) },
      { title: "The Valley of the Kings", text: "Pharaohs of the New Kingdom were buried in hidden tombs cut into this valley, including Tutankhamun.", camera: overhead(32.601, 25.74, 4_000, 45) },
      { title: "Abu Simbel", text: "Ramesses II carved four giant statues of himself at Egypt's southern border, to impress anyone arriving from the south.", camera: overhead(31.626, 22.337, 2_500, 45) },
    ],
  },
  {
    id: RIFT.id, title: RIFT.title, author: A, tags: ["Earth and rocks", "Rivers and water"], level: "Ages 11–14",
    summary: "Africa is slowly splitting apart. The rift makes lakes, volcanoes and the highlands where the Nile begins.",
    links: [NILE],
    slides: [
      { title: "A continent pulling apart", text: "The East African Rift runs over 3,000 km. The plates move apart a few millimetres a year.", camera: overhead(36, 0, 5_500_000) },
      { title: "The Afar triangle", text: "Here three rifts meet. The ground is below sea level and among the hottest places on Earth.", camera: overhead(41.5, 12.5, 700_000) },
      { title: "Lake Tanganyika", text: "A rift lake 1,470 m deep, the second deepest in the world, filling a crack in the crust.", camera: overhead(29.5, -6, 1_300_000) },
      { title: "Kilimanjaro", text: "Africa's highest mountain, a volcano built by the same forces that open the rift.", camera: overhead(37.35, -3.07, 60_000, 40), orbit: true },
      { title: "Lake Victoria, between the rifts", text: "The lake sits in a shallow basin between two branches of the rift, and feeds the White Nile.", camera: overhead(33, -1, 1_000_000) },
    ],
  },
  {
    id: AMAZON.id, title: AMAZON.title, author: A, tags: ["Rivers and water", "Wildlife"], level: "Ages 8–11",
    summary: "The Nile is longer, but the Amazon carries more water than the next seven largest rivers together.",
    links: [NILE],
    slides: [
      { title: "The biggest river by far", text: "About a fifth of all the river water reaching the world's oceans comes out of the Amazon.", camera: overhead(-60, -4, 5_000_000) },
      { title: "The Meeting of the Waters", text: "The dark Rio Negro and the sandy Solimões run side by side for kilometres before mixing.", camera: overhead(-59.9, -3.13, 40_000, 35), orbit: true },
      { title: "The mouth", text: "The river mouth is over 300 km wide, with an island the size of Switzerland in it.", camera: overhead(-50, -0.5, 900_000) },
    ],
  },
  ...TEMPLATES.map((t, i) => ({
    id: `atlas-topic-${i}`, title: t.name, author: A, tags: ["History"], level: "Ages 11–14", summary: t.about, links: [], slides: t.slides,
  })),
];
