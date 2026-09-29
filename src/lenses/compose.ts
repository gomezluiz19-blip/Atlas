// Turning words into a lens. With Atlas AI connected, Claude designs the
// recipe; without it, a composer that knows the common passions (birds,
// stars, surf, coffee, wildflowers, fungi, light, trails, fishing…) and a
// few hundred kinds of place builds one from the words it recognises.
import type { Block, LensDef } from "./custom";
import { SPECIES_GROUPS, lensFromJson } from "./custom";

interface Template { re: RegExp; name: string; icon: string; color: string; blurb: string; for?: LensDef["for"]; radiusKm?: number; blocks: Block[] }

const TEMPLATES: Template[] = [
  { re: /\b(?:bird|birding|twitch|owl|raptor|heron|duck|waders?)/, name: "Birdwatching", icon: "🐦", color: "#30b0c7", blurb: "What's been seen here lately, where to watch from, and whether it's calm enough",
    for: ["lake", "coast", "forest", "river", "land"], radiusKm: 5,
    blocks: [{ type: "species", group: "birds", days: 30 }, { type: "places", title: "Hides and reserves", emoji: "🔭", tags: ["leisure=bird_hide", "leisure=nature_reserve"] }, { type: "weather", good: { windMax: 25, rainMax: 0.2 }, when: "day" }, { type: "sun" }, { type: "tip", text: "Go early. Birds are busiest in the first two hours after sunrise, and quiet down in the midday heat." }] },
  { re: /\b(?:stars?\b|stargaz|astro|night sky|milky way|meteor|galax|telescope|planets?)/, name: "Stargazing", icon: "🔭", color: "#5e5ce6", blurb: "Tonight's darkness, the moon and cloud, and somewhere with a view",
    radiusKm: 15, blocks: [{ type: "sky" }, { type: "weather", title: "Cloud after dark", good: { cloudMax: 30 }, when: "night" }, { type: "places", title: "Viewpoints", emoji: "🌄", tags: ["tourism=viewpoint"] }, { type: "ground" }, { type: "tip", text: "Give your eyes 20 minutes in the dark, and use a red light: white light resets them." }] },
  { re: /\b(?:surf|swell|waves?|bodyboard|kite ?surf)/, name: "Surf check", icon: "🏄", color: "#0a84ff", blurb: "The swell, the wind and the breaks nearby",
    for: ["coast", "sea", "island"], radiusKm: 8, blocks: [{ type: "marine" }, { type: "weather", title: "Wind", good: { windMax: 20 }, when: "day" }, { type: "places", title: "Beaches and breaks", emoji: "🏖️", tags: ["natural=beach", "sport=surfing"] }, { type: "tip", text: "Period matters more than height: long-period swell from a distant storm gives clean, powerful waves." }] },
  { re: /\b(?:coffee|caf[eé]s?|espresso|latte|brunch)/, name: "Coffee crawl", icon: "☕", color: "#a2845e", blurb: "Cafés within a walk, and whether to sit outside",
    for: ["city"], radiusKm: 1.2, blocks: [{ type: "places", title: "Cafés", emoji: "☕", tags: ["amenity=cafe"] }, { type: "places", title: "Bakeries", emoji: "🥐", tags: ["shop=bakery"] }, { type: "weather", title: "Sitting outside", good: { rainMax: 0, tempMin: 14 }, when: "day" }] },
  { re: /\b(?:wild ?flowers?|bloom|blossom|orchid|meadow)/, name: "Wildflowers", icon: "🌸", color: "#ff375f", blurb: "What's flowering nearby, and the parks and meadows to find it in",
    radiusKm: 6, blocks: [{ type: "species", group: "flowers", days: 21 }, { type: "places", title: "Parks and reserves", emoji: "🌳", tags: ["leisure=nature_reserve", "leisure=park"] }, { type: "weather", good: { rainMax: 0.2 }, when: "day" }] },
  { re: /\b(?:mushroom|fung|forag|chanterelle|morel)/, name: "Fungi foray", icon: "🍄", color: "#bf5af2", blurb: "Fungi found nearby lately, and woods to look in",
    for: ["forest", "land"], radiusKm: 8, blocks: [{ type: "species", group: "fungi", days: 45 }, { type: "places", title: "Woods", emoji: "🌲", tags: ["natural=wood", "landuse=forest"] }, { type: "weather", good: { rainMax: 1 }, when: "day" }, { type: "tip", text: "Never eat anything you can't identify with complete certainty. Photograph, don't pick, in reserves." }] },
  { re: /\b(?:photo|golden hour|sunset|sunrise|light\b|instagram|camera)/, name: "Golden hour", icon: "📷", color: "#ff9f0a", blurb: "When the light is best, whether the sky will play along, and where to stand",
    radiusKm: 6, blocks: [{ type: "sun" }, { type: "weather", title: "The sky", good: { cloudMin: 15, cloudMax: 70, rainMax: 0 }, when: "any" }, { type: "places", title: "Viewpoints", emoji: "🌄", tags: ["tourism=viewpoint"] }, { type: "ground" }, { type: "tip", text: "Some cloud is good: broken cloud catches the colour after the sun has gone. A clear sky is often the dullest sunset." }] },
  { re: /\b(?:fish|angl|trout|salmon|fly fishing)/, name: "Fishing", icon: "🎣", color: "#34c759", blurb: "Fish recorded nearby, the spots, and the wind",
    for: ["lake", "river", "coast"], radiusKm: 6, blocks: [{ type: "species", group: "fish", days: 120 }, { type: "places", title: "Fishing spots", emoji: "🎣", tags: ["leisure=fishing", "man_made=pier"] }, { type: "weather", good: { windMax: 20 }, when: "day" }, { type: "sun" }] },
  { re: /\b(?:hik|trail|walk|trek|ramble|summit|mountain)/, name: "Trail day", icon: "🥾", color: "#248a3d", blurb: "The weather window, the peaks and viewpoints, and water on the way",
    for: ["peak", "range", "volcano", "canyon", "forest", "land"], radiusKm: 8, blocks: [{ type: "weather", good: { rainMax: 0.2, windMax: 35 }, when: "day" }, { type: "places", title: "Peaks", emoji: "⛰️", tags: ["natural=peak"] }, { type: "places", title: "Viewpoints", emoji: "🌄", tags: ["tourism=viewpoint"] }, { type: "places", title: "Drinking water", emoji: "🚰", tags: ["amenity=drinking_water"] }, { type: "ground" }, { type: "sun" }] },
  { re: /\b(?:whale|dolphin|orca|seals?\b)/, name: "Whale watch", icon: "🐋", color: "#0a84ff", blurb: "Whales and dolphins seen lately, and the sea state",
    for: ["coast", "sea", "island"], radiusKm: 25, blocks: [{ type: "species", group: "whales", days: 60 }, { type: "marine", good: { waveMax: 1.5, waveMin: 0, periodMin: 0 } }, { type: "places", title: "Viewpoints", emoji: "🌄", tags: ["tourism=viewpoint"] }] },
  { re: /\b(?:butterfl|moth|bees?|pollinator|insect|bugs?\b)/, name: "Butterflies and bees", icon: "🦋", color: "#ff9f0a", blurb: "Insects seen lately, warm sunny hours, and gardens",
    radiusKm: 5, blocks: [{ type: "species", group: "butterflies", days: 30 }, { type: "species", group: "insects", days: 30, title: "Other insects seen here" }, { type: "weather", good: { tempMin: 15, cloudMax: 50, windMax: 20 }, when: "day" }, { type: "places", title: "Parks and gardens", emoji: "🌻", tags: ["leisure=garden", "leisure=park"] }] },
  { re: /\b(?:frog|newt|salamander|toad|reptile|lizard|snake)/, name: "Frogs and reptiles", icon: "🐸", color: "#34c759", blurb: "Amphibians and reptiles recorded nearby, and wet places",
    radiusKm: 6, blocks: [{ type: "species", group: "amphibians", days: 90 }, { type: "species", group: "reptiles", days: 90 }, { type: "places", title: "Ponds and wetlands", emoji: "💧", tags: ["natural=wetland", "water=pond"] }] },
  { re: /\b(?:rocks?\b|geolog|fossil|mineral|crystal)/, name: "Rock detective", icon: "🪨", color: "#a2845e", blurb: "The ground, the rocks you can see, and old quarries",
    radiusKm: 10, blocks: [{ type: "ground" }, { type: "places", title: "Rock you can see", emoji: "🪨", tags: ["geological=outcrop", "natural=cliff", "natural=rock"] }, { type: "places", title: "Old quarries", emoji: "⛏️", tags: ["landuse=quarry", "historic=mine"] }, { type: "tip", text: "Look at road cuttings, cliffs and old walls: they're windows into the rock under your feet. Open the Rewind lens to see how old it is." }] },
];

/** Words for places, and the OpenStreetMap tags that find them. */
const PLACES: [RegExp, string, string, string[]][] = [
  [/\b(?:bars?|pubs?|cocktails?|drinks?|beer|brewer)/, "Bars and pubs", "🍸", ["amenity=bar", "amenity=pub", "craft=brewery"]],
  [/\b(?:wine)/, "Wine bars", "🍷", ["amenity=bar", "shop=wine"]],
  [/\b(?:restaurants?|dinner|lunch|eat\b|eating|food|dining)/, "Places to eat", "🍽️", ["amenity=restaurant"]],
  [/\b(?:pizza)/, "Pizza", "🍕", ["cuisine=pizza"]], [/\b(?:ramen|noodle)/, "Noodles", "🍜", ["cuisine=ramen", "cuisine=noodle"]], [/\b(?:sushi)/, "Sushi", "🍣", ["cuisine=sushi"]],
  [/\b(?:tacos?|mexican)/, "Tacos", "🌮", ["cuisine=mexican", "cuisine=tacos"]], [/\b(?:vegan|vegetarian|plant.based)/, "Vegan food", "🥗", ["diet:vegan=yes"]],
  [/\b(?:ice cream|gelato)/, "Ice cream", "🍦", ["amenity=ice_cream"]], [/\b(?:baker|bread|pastr)/, "Bakeries", "🥐", ["shop=bakery"]],
  [/\b(?:books?|bookshop|library|libraries)/, "Books", "📚", ["shop=books", "amenity=library"]],
  [/\b(?:playground|kids|children|family)/, "Playgrounds", "🛝", ["leisure=playground"]],
  [/\b(?:dogs?)/, "Dog parks", "🐕", ["leisure=dog_park"]],
  [/\b(?:parks?|gardens?|green space)/, "Parks", "🌳", ["leisure=park", "leisure=garden"]],
  [/\b(?:swim|bathing|lido|pool\b)/, "Swimming", "🏊", ["leisure=swimming_area", "sport=swimming", "leisure=swimming_pool"]],
  [/\b(?:beach(es)?)/, "Beaches", "🏖️", ["natural=beach"]],
  [/\b(?:waterfalls?)/, "Waterfalls", "💦", ["waterway=waterfall"]],
  [/\b(?:hot springs?|onsen|thermal)/, "Hot springs", "♨️", ["natural=hot_spring", "amenity=public_bath"]],
  [/\b(?:climb|boulder)/, "Climbing", "🧗", ["sport=climbing"]],
  [/\b(?:camp(ing|site)?\b|tent\b)/, "Campsites", "⛺", ["tourism=camp_site"]],
  [/\b(?:picnic)/, "Picnic spots", "🧺", ["tourism=picnic_site", "leisure=picnic_table"]],
  [/\b(?:museums?|galler(y|ies)|art\b)/, "Museums and galleries", "🏛️", ["tourism=museum", "tourism=gallery"]],
  [/\b(?:castles?|ruins?|histor)/, "History", "🏰", ["historic=castle", "historic=ruins", "historic=monument"]],
  [/\b(?:music|gigs?|concerts?|venues?)/, "Music venues", "🎶", ["amenity=music_venue", "amenity=theatre", "amenity=nightclub"]],
  [/\b(?:markets?|farmers)/, "Markets", "🧺", ["amenity=marketplace"]],
  [/\b(?:bik(e|ing)|cycl)/, "Bikes", "🚲", ["amenity=bicycle_rental", "shop=bicycle"]],
  [/\b(?:skate)/, "Skateparks", "🛹", ["sport=skateboard"]],
  [/\b(?:church|temple|mosque|shrine|synagogue)/, "Places of worship", "⛪", ["amenity=place_of_worship"]],
  [/\b(?:view(point)?s?|lookout|scenic)/, "Viewpoints", "🌄", ["tourism=viewpoint"]],
  [/\b(?:toilets?|restroom|loo)/, "Toilets", "🚻", ["amenity=toilets"]],
  [/\b(?:water fountain|drinking water|refill)/, "Drinking water", "🚰", ["amenity=drinking_water"]],
  [/\b(?:ev\b|charg)/, "EV charging", "🔌", ["amenity=charging_station"]],
];

const cap = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());

/** Builds a lens from a description, with no AI. Null when nothing is recognised. */
export function composeLens(prompt: string): LensDef | null {
  const t = prompt.toLowerCase();
  const hits = TEMPLATES.filter((x) => x.re.test(t));
  const blocks: Block[] = [];
  const add = (b: Block) => {
    const key = JSON.stringify(b.type === "places" ? b.tags : b.type === "species" ? b.group : b.type);
    if (!blocks.some((x) => JSON.stringify(x.type === "places" ? x.tags : x.type === "species" ? x.group : x.type) === key)) blocks.push(b);
  };
  for (const tpl of hits) for (const b of tpl.blocks) add(b);
  for (const [re, title, emoji, tags] of PLACES) if (re.test(t)) add({ type: "places", title, emoji, tags });
  // Any other living things by name ("owls", "wildlife").
  if (/\bwildlife|animals?|nature\b/.test(t) && !blocks.some((b) => b.type === "species")) add({ type: "species", group: "all", days: 30 });
  if (!blocks.length) return null;
  // Weather, unless it's all indoors.
  if (!blocks.some((b) => b.type === "weather" || b.type === "sky" || b.type === "marine")) add({ type: "weather", good: /\boutside|outdoor|picnic|walk|park\b/.test(t) ? { rainMax: 0.2 } : undefined, when: "day" });
  const main = hits[0];
  const places = blocks.filter((b): b is Extract<Block, { type: "places" }> => b.type === "places");
  const name = main ? (hits.length > 1 ? `${main.name} and more` : main.name) : cap(prompt.trim().split(/[,.;:!?]/)[0].split(/\s+/).slice(0, 4).join(" "));
  return lensFromJson({
    name: name.length > 28 ? name.slice(0, 28).trim() : name,
    icon: main?.icon ?? places[0]?.emoji ?? "✨",
    color: main?.color ?? "#0a84ff",
    blurb: main && hits.length === 1 && places.length <= main.blocks.filter((b) => b.type === "places").length ? main.blurb : cap(blocks.filter((b) => b.type !== "tip").map((b) => b.type === "places" ? b.title.toLowerCase() : b.type === "species" ? `${SPECIES_GROUPS[b.group].label.toLowerCase()} seen lately` : b.type === "weather" ? "the weather" : b.type === "marine" ? "the swell" : b.type === "sky" ? "the night sky" : b.type === "sun" ? "the light" : "the ground").slice(0, 4).join(", ")),
    for: main?.for, radiusKm: main?.radiusKm ?? (places.length ? 1.5 : 5), blocks,
  });
}

/** Suggestions for the studio's empty state. */
export const IDEAS = [
  "Birdwatching: what's been seen lately and whether the wind's calm",
  "Stargazing: how dark tonight gets, the moon, and cloud",
  "Surf check for the nearest beach",
  "A coffee crawl with bakeries",
  "Where to take the kids: playgrounds, ice cream and toilets",
  "Mushroom foraging after rain",
  "Golden hour photography spots",
  "A night out: bars and live music",
];

// ---- With Claude -----------------------------------------------------------------------------

export const LENS_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short name, 1-3 words (e.g. 'Birdwatching')." },
    icon: { type: "string", description: "One emoji." },
    color: { type: "string", description: "A hex colour that suits it, e.g. #30b0c7." },
    blurb: { type: "string", description: "One line: what the lens shows, under 90 characters." },
    for: { type: "array", items: { type: "string", enum: ["peak", "volcano", "range", "crater", "canyon", "river", "lake", "sea", "coast", "glacier", "forest", "desert", "island", "city", "land"] }, description: "Kinds of feature it suits best; empty for anywhere." },
    radiusKm: { type: "number", description: "How far around the place to look, km (a walk: 1-2; a day out: 5-15)." },
    blocks: {
      type: "array", description: "2-6 building blocks, most useful first.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["species", "places", "weather", "marine", "sky", "sun", "ground", "tip"] },
          group: { type: "string", enum: Object.keys(SPECIES_GROUPS), description: "species: which living things." },
          days: { type: "number", description: "species: how many recent days to count sightings over." },
          tags: { type: "array", items: { type: "string" }, description: "places: OpenStreetMap tags as key=value, e.g. amenity=cafe, leisure=bird_hide, tourism=viewpoint, natural=beach, cuisine=ramen." },
          title: { type: "string", description: "places/species/weather: a short heading." },
          emoji: { type: "string", description: "places: an emoji for the pins." },
          good: { type: "object", description: "weather: windMax (km/h), rainMax (mm/h), cloudMax, cloudMin (%), tempMin, tempMax (°C). marine: waveMin, waveMax (m), periodMin (s).", properties: { windMax: { type: "number" }, rainMax: { type: "number" }, cloudMax: { type: "number" }, cloudMin: { type: "number" }, tempMin: { type: "number" }, tempMax: { type: "number" }, waveMin: { type: "number" }, waveMax: { type: "number" }, periodMin: { type: "number" } } },
          when: { type: "string", enum: ["day", "night", "any"], description: "weather: which hours count." },
          text: { type: "string", description: "tip: one or two sentences of genuinely useful, accurate advice." },
        },
        required: ["type"],
      },
    },
  },
  required: ["name", "icon", "blurb", "blocks"],
};

export const LENS_SYSTEM = `You design "lenses" for Atlas, a 3D globe app. A lens is a recipe of building blocks that, applied to any place, shows what matters for one passion or purpose, and whether now is a good time for it.
Blocks: species (wildlife recorded nearby lately, from iNaturalist, by group), places (named OpenStreetMap features within the radius, by tags), weather (the next hours with a best window, judged by the "good" thresholds), marine (wave height, period, sea temperature), sky (tonight's darkness, moon phase, cloud), sun (sunrise, sunset, golden hour), ground (elevation and relief), tip (advice from the maker).
Pick only blocks that genuinely serve the request, most useful first. Use real, common OpenStreetMap tags. Set sensible "good" thresholds for the activity. Include one tip only if it's accurate and useful. Keep it friendly and suitable for all ages. Call make_lens exactly once.`;
