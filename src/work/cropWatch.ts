// Common pests and diseases to watch for, by crop and part of the season.
// General guidance: local advisers know what's about in your area this year.

export type Phase = "early" | "mid" | "late";
export interface Watch { phase: Phase; name: string; sign: string }

const w = (phase: Phase, name: string, sign: string): Watch => ({ phase, name, sign });

export const WATCH: Record<string, Watch[]> = {
  maize: [w("early", "Cutworms and wireworms", "seedlings cut off at soil level or wilting"), w("mid", "Corn borer / fall armyworm", "ragged leaf holes, frass in the whorl"), w("mid", "Northern corn leaf blight", "long grey-green lesions on leaves"), w("late", "Ear rots", "mould on cobs after wet weather at silking")],
  sweetcorn: [w("early", "Birds and slugs", "seed dug up, seedlings grazed"), w("mid", "Corn earworm", "caterpillars at the cob tip"), w("late", "Smut", "grey swollen galls on cobs")],
  wheat: [w("early", "Slugs and aphids", "grazed seedlings; aphids spread virus"), w("mid", "Septoria and rusts", "brown blotches with dark specks; orange or yellow pustules"), w("late", "Fusarium head blight", "bleached spikelets after a wet flowering")],
  "wheat-winter": [w("early", "Slugs, aphids (BYDV)", "patchy seedlings; yellowing in patches"), w("mid", "Septoria tritici and yellow rust", "blotches with black specks; yellow stripes of pustules"), w("late", "Fusarium head blight", "bleached ears after rain at flowering")],
  barley: [w("early", "Aphids (BYDV)", "yellow, stunted patches"), w("mid", "Net blotch and rhynchosporium", "net-like brown lesions; pale scald marks"), w("late", "Brackling and lodging", "stems bending over near harvest")],
  oats: [w("early", "Frit fly", "central shoot dies"), w("mid", "Crown rust and mildew", "orange pustules; white powdery patches"), w("late", "Lodging", "flattened crop after storms")],
  rice: [w("early", "Snails and weeds", "missing hills in the paddy"), w("mid", "Rice blast", "diamond-shaped grey lesions"), w("late", "Stem borers", "white, empty panicles (whiteheads)")],
  potato: [w("early", "Slugs and wireworm", "holes in seed tubers"), w("mid", "Late blight", "dark water-soaked patches with white mould beneath, after warm humid spells"), w("mid", "Aphids and Colorado beetle", "virus spread; striped beetles and red larvae"), w("late", "Tuber blight and slugs", "rot and holes in tubers: lift promptly")],
  tomato: [w("early", "Damping off", "seedlings collapse at the stem"), w("mid", "Late blight", "brown patches on leaves and stems, fast spread in humid weather"), w("mid", "Whitefly and aphids", "sticky leaves, clouds of tiny white flies"), w("late", "Blossom end rot and splitting", "dark sunken fruit bases from uneven watering")],
  beans: [w("early", "Bean seed fly and slugs", "missing or damaged seedlings"), w("mid", "Black bean aphid", "dense black colonies on tips"), w("late", "Rust and halo blight", "orange pustules; spots with yellow halos")],
  soybean: [w("early", "Seedling blights", "poor, patchy emergence"), w("mid", "Aphids and rust", "curled leaves; tan to brown pustules"), w("late", "Pod and stem blight", "dark specks on stems and pods")],
  peas: [w("early", "Pea and bean weevil", "U-shaped notches on leaf edges"), w("mid", "Powdery mildew and pea moth", "white coating; maggots in pods"), w("late", "Birds", "pods pecked open")],
  lentils: [w("mid", "Ascochyta blight", "tan lesions with dark margins"), w("late", "Botrytis grey mould", "grey fuzz in a dense canopy")],
  chickpeas: [w("mid", "Ascochyta blight", "circular lesions, stems breaking"), w("late", "Pod borer", "holes in pods")],
  canola: [w("early", "Flea beetle", "shot-holes in the first leaves"), w("mid", "Pollen beetle", "buds eaten before flowering"), w("late", "Sclerotinia stem rot", "bleached stems with black resting bodies inside")],
  sunflower: [w("early", "Birds and slugs", "seed taken, seedlings grazed"), w("mid", "Downy mildew", "stunted, yellowed plants"), w("late", "Birds and head rot", "seed eaten; soft rotting heads")],
  lettuce: [w("early", "Slugs and aphids", "holes; clusters under leaves"), w("mid", "Downy mildew", "yellow patches with white growth beneath"), w("late", "Bolting and tip burn", "flower stalks in heat; brown leaf edges")],
  carrot: [w("early", "Carrot fly", "rusty tunnels in roots; cover with fine mesh"), w("mid", "Aphids (willow-carrot)", "twisted, yellowing leaves"), w("late", "Cavity spot and splitting", "sunken lesions; cracks after heavy rain")],
  onion: [w("early", "Onion fly and birds", "wilting seedlings; sets pulled up"), w("mid", "Downy mildew and rust", "grey-purple fuzz; orange pustules"), w("late", "White rot and neck rot", "white fluffy mould at the base; soft necks in store")],
  garlic: [w("mid", "Rust", "orange pustules on leaves"), w("late", "White rot", "yellowing and white mould at the base")],
  cabbage: [w("early", "Flea beetle and cabbage root fly", "shot-holed leaves; wilting transplants"), w("mid", "Caterpillars (cabbage white, diamondback)", "ragged holes, green droppings"), w("mid", "Aphids (mealy)", "grey waxy colonies"), w("late", "Clubroot", "swollen, distorted roots; lime acid soils")],
  pepper: [w("early", "Aphids", "curled young leaves"), w("mid", "Spider mites (under cover)", "fine speckling, webbing"), w("late", "Blossom end rot", "sunken fruit ends")],
  cucumber: [w("early", "Slugs", "seedlings grazed overnight"), w("mid", "Powdery mildew", "white powder on leaves"), w("mid", "Cucumber beetles / red spider mite", "chewed leaves; speckling under cover")],
  squash: [w("early", "Slugs", "young plants grazed"), w("mid", "Powdery mildew", "white powder spreading from old leaves"), w("late", "Fruit rot", "lift fruit off wet soil to cure")],
  strawberry: [w("early", "Frost on flowers", "black centres in open flowers"), w("mid", "Grey mould (botrytis)", "fuzzy grey fruit in wet weather"), w("mid", "Slugs and birds", "holes and pecked fruit: net and mulch"), w("late", "Powdery mildew", "leaf edges curling up, purple blotches")],
  watermelon: [w("mid", "Powdery mildew and aphids", "white coating; curled leaves"), w("late", "Fruit rot", "soft patches where fruit touches soil")],
  grape: [w("early", "Frost after budburst", "blackened young shoots"), w("mid", "Powdery and downy mildew", "white dusting; oily spots with white down beneath"), w("late", "Botrytis bunch rot and wasps", "grey mould in tight bunches")],
  apple: [w("early", "Apple scab", "olive-brown spots on leaves and fruit after wet springs"), w("mid", "Codling moth", "grubs in the core, frass at the eye"), w("mid", "Aphids and powdery mildew", "curled leaves; white shoot tips"), w("late", "Brown rot", "soft brown fruit with rings of pustules")],
  citrus: [w("mid", "Scale insects and aphids", "sticky leaves, sooty mould"), w("late", "Fruit fly", "puncture marks, fruit dropping")],
  olive: [w("mid", "Olive fly", "stings on fruit, maggots inside"), w("mid", "Peacock spot", "dark rings on leaves, leaf drop")],
  cotton: [w("early", "Thrips and aphids", "crinkled seedling leaves"), w("mid", "Bollworms", "holes in squares and bolls"), w("late", "Boll rots", "rotting bolls in wet weather")],
  sugarcane: [w("mid", "Stem borers", "dead hearts, bored stalks"), w("late", "Red rot", "red stalk tissue with white patches")],
  sweetpotato: [w("mid", "Sweet potato weevil", "tunnels in vines and roots"), w("late", "Rodents", "gnawed roots near harvest")],
  cassava: [w("mid", "Cassava mosaic and brown streak viruses", "mottled, distorted leaves; brown root streaks"), w("mid", "Mealybugs and whitefly", "bunched shoot tips")],
  hay: [w("mid", "Weeds (docks, ragwort)", "ragwort is poisonous in hay: pull it before cutting"), w("late", "Rain at cutting", "wait for three dry days to make hay")],
  alfalfa: [w("mid", "Alfalfa weevil", "skeletonised tip leaves"), w("late", "Leaf diseases", "leaf drop before cutting")],
  coffee: [w("mid", "Coffee berry borer", "tiny holes at the berry tip"), w("mid", "Coffee leaf rust", "orange powder under leaves")],
  cacao: [w("mid", "Black pod", "brown-black rot spreading over pods in wet weather"), w("mid", "Mirids (capsids)", "dark lesions on pods and shoots")],
  banana: [w("mid", "Black Sigatoka", "streaks turning to black leaf patches"), w("mid", "Banana weevil", "tunnels in the corm, toppling plants")],
};

/** Which part of the season a stage falls in. */
export function phaseOf(stageIndex: number, stages: number): Phase {
  const f = stageIndex / Math.max(1, stages - 1);
  return f < 0.3 ? "early" : f < 0.75 ? "mid" : "late";
}

/** What to watch for now, and what's coming next. */
export function watchFor(cropId: string, stageIndex: number, stages: number): { now: Watch[]; next: Watch[] } {
  const list = WATCH[cropId] ?? [];
  const p = phaseOf(stageIndex, stages);
  const order: Phase[] = ["early", "mid", "late"];
  const nextPhase = order[Math.min(2, order.indexOf(p) + 1)];
  return { now: list.filter((x) => x.phase === p), next: p === "late" ? [] : list.filter((x) => x.phase === nextPhase) };
}
