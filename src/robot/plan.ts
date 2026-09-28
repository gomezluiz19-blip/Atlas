// The task robot's planner: turns a plain-language request into steps Atlas
// can carry out, e.g. "where does rain go in downtown Chicago, and show the
// storm drains and railways" becomes:
//   find "downtown Chicago" → add railways → rain path → city water.
// No language model: a vocabulary of the things Atlas can do, matched against
// the request, plus rules for finding the place. Anything it can't place is
// reported back rather than guessed at.

import { nearestYear, yearLabel } from "../data/history";

export type PlanPlace =
  | { kind: "query"; text: string }
  | { kind: "here" };

export type Step =
  | { kind: "view"; theme: string; subtab: string; label: string }
  | { kind: "layer"; action: string; label: string }
  | { kind: "commodity"; id: string; label: string };

export interface Plan {
  place: PlanPlace | null;
  steps: Step[];
  /** Words it couldn't make sense of. */
  unknown: string[];
}

interface Rule {
  re: RegExp;
  step: Step;
  /** A view to open if the request names no view of its own. */
  related?: [string, string];
}

const view = (theme: string, subtab: string, label: string): Step => ({ kind: "view", theme, subtab, label });
const layer = (action: string, label: string): Step => ({ kind: "layer", action, label });

// Most specific phrases first; each match is removed before the next rule runs.
const RULES: Rule[] = [
  // Atlas Pro: live operations for a saved building
  { re: /\b(how (full|busy|booked)|occupancy|occupied|vacanc(y|ies)|bookings?|reservations?|check.?ins?|guests? (in|at|staying)|rooms? (free|available|left))\b/, step: layer("pro:occupancy", "Show live occupancy (Pro)") },
  // Space
  { re: /\b(solar system|planets?|saturn|jupiter|neptune|uranus|mercury|venus)\b/, step: layer("space:solar", "Open the solar system") },
  { re: /\b(iss|international space station|space station|satellites?|starlink|rocket launch(es)?|launch(es)?|rockets?|outer space|space view|orbit(s|ing)?)\b/, step: layer("space:open", "Open Space: satellites, the ISS and launches") },
  // Lenses: looks at the selected feature itself (a mountain, sea, river, city…)
  { re: /\b(slice (through|open|into|up)?|splice|cut (it |this )?(open|through)|what('s| is) (inside|under(neath)?|beneath) (it|this|the (mountain|volcano|canyon|ground)))\b/, step: layer("lens:slice", "Slice it open to see the rock layers") },
  { re: /\b(block (diagram|model|view)|3d block|cut ?out|diorama|explod(e|ed) view|lift (it|this) out|x.?ray)\b/, step: layer("lens:block", "Lift it out as a 3D block") },
  { re: /\b(anatomy|tree ?line|snow ?line|bands of life|how (steep|big is the crater|deep is the crater)|crater (depth|size|shape))\b/, step: layer("lens:anatomy", "Show its anatomy: summit, slopes and zones") },
  { re: /\b(drain (the )?(sea|ocean|lake)s?|sea.?levels? (rise|rises|rising|fall|falls|drop)|(rising|falling) seas?|ice.?age (coast(line)?s?|sea level)|doggerland|if (all )?the ice (caps? )?melted|flood the (world|coast))\b/, step: layer("lens:sealevel", "Move the sea level") },
  { re: /\b(sea ?floor|ocean floor|sea ?bed|bathymetry|how deep is (the|this)|deepest point|underwater (landscape|mountains))\b/, step: layer("lens:seafloor", "Show the sea floor") },
  { re: /\b(trace (the |this )?(river|stream|flow)|follow (the |this )?river|(source|start) of (the |this )?river|river from source|ocean currents?|sea currents?|gulf stream|currents)\b/, step: layer("lens:trace", "Trace the flow") },
  { re: /\b(then and now|before and after|how (it|this|the city) (has )?changed|(old|past) (satellite )?imagery|deep time|millions of years ago|pangaea|continental drift|where (was|were) (it|this|the continents))\b/, step: layer("lens:rewind", "Rewind time") },
  { re: /\b(subway|metro|underground|tube map|light rail|tram lines?|transit (map|lines?|network|system))\b/, step: layer("lens:transit", "Map the metro lines") },
  { re: /\b(forest (cover|types?)|leaf types?|evergreen|deciduous|conifers?|how much (forest|woodland)|woodlands?)\b/, step: layer("lens:forest", "Look at the forest") },
  { re: /\b(true size|real size|actual size|how big is|compare (the )?size|size (of|compared)|drop (it|this) on|as big as)\b/, step: layer("lens:size", "Compare its true size") },
  // Work mode
  { re: /\b(plan (a |my |the |our )?(trip|route|journey|holiday|vacation|event|party|wedding|conference)|trip planner|itinerary)\b/, step: layer("work:plan", "Open Plan (Work)") },
  { re: /\b((make|create|start|build) (a |my )?(presentation|slides?|slideshow|slide deck)|presentation|slideshow)\b/, step: layer("work:present", "Open Present (Work)") },
  { re: /\b(record (a )?(video|tour|this)|screen ?record(ing)?|make a video|video)\b/, step: layer("work:video", "Open Video (Work)") },
  { re: /\b(my (field|farm|crops?)|crop (growth|stage|health)s?|when to (harvest|plant)|irrigat(e|ion)|growing degree days|gdd)\b/, step: layer("work:grow", "Open Grow (Work)") },
  { re: /\b(construction|building site|worksite|work site|construction site|build (a |an |my )?(house|building|tower|block)|site progress)\b/, step: layer("work:build", "Open Build (Work)") },
  { re: /\b(livestock|herds?|flocks?|my (cows|cattle|sheep|goats|pigs|horses|chickens|animals)|paddocks?|vet(erinary)? (practice|clinic|records)|animal rescue|rescue cent(re|er)|(pet|animal) adoption|adoption agency|adopt a (dog|cat|pet))\b/, step: layer("work:flock", "Open Flock (Work)") },
  { re: /\b(learn(ing)? games?|games? (for|to learn)|flight (game|school)|flag (game|quiz|match)|flags of|my passport|daily challenge|homework|(museums?|librar(y|ies)|science cent(re|er)s?|planetariums?|zoos?) (near|nearby|around|to visit|for (kids|students))|free museums?|places to learn|student discounts?)\b/, step: layer("work:learn", "Open Learn (Work)") },
  { re: /\b(field trips?|school trips?|class trips?|excursions?|lesson( plans?)?|quiz(zes)?|tests? for my class|my (class|students)|teach(ing)?|classroom|world summit)\b/, step: layer("work:teach", "Open Teach (Work)") },
  { re: /\b(plant|crop|vegetation) health\b|\bndvi\b|\bhow green\b/, step: layer("work:ndvi", "Add plant health from space (NDVI)") },
  // Map layers
  { re: /\b(live )?(rain )?radar\b|\bis it raining\b/, step: layer("overlay:radar", "Add live rain radar") },
  { re: /\b(earthquakes?|quakes?|seismic( activity)?)\b/, step: layer("overlay:quakes", "Add this week's earthquakes") },
  { re: /\b(tectonic plates?|plate boundar(y|ies)|plates|fault lines?)\b/, step: layer("overlay:plates", "Add tectonic plate boundaries") },
  { re: /\b((northern|southern) lights|auroras?)\b/, step: layer("overlay:aurora", "Add the aurora forecast") },
  { re: /\b((night|city) lights|earth at night|light pollution)\b/, step: layer("overlay:lights", "Add Earth at night") },
  { re: /\b(wildlife|species) records\b/, step: layer("overlay:species", "Add wildlife records") },
  { re: /\b(undersea|submarine|internet|fib(er|re)[- ]?optic) cables?\b/, step: layer("net:cables", "Add undersea cables"), related: ["built", "internet"] },
  { re: /\bpower (plants?|stations?|grid)\b/, step: layer("net:power", "Add power plants"), related: ["built", "energy"] },
  { re: /\bshipping( lanes?| routes?)?\b|\bsea routes?\b/, step: layer("net:shipping", "Add shipping lanes"), related: ["built", "transport"] },
  { re: /\b(railways?|railroads?|rail(way)? lines?|train (lines?|tracks?)|trains?|rail)\b/, step: layer("net:rail", "Add railways"), related: ["built", "transport"] },
  { re: /\b(highways?|motorways?|freeways?|major roads|roads)\b/, step: layer("net:roads", "Add highways"), related: ["built", "transport"] },
  { re: /\b(airports?|airfields?)\b/, step: layer("net:airports", "Add airports"), related: ["built", "transport"] },
  { re: /\b(sea ?ports?|ports?|harbou?rs?)\b/, step: layer("net:ports", "Add seaports"), related: ["built", "transport"] },
  { re: /\bgeolog(y|ic|ical)( map)?\b/, step: layer("globe:geology", "Colour the map by bedrock geology"), related: ["land", "rocks"] },
  { re: /\b(slopes?|steepness|how steep)\b/, step: layer("globe:slope", "Colour the map by slope"), related: ["land", "overview"] },
  { re: /\bcontours?( lines)?\b/, step: layer("globe:contours", "Add contour lines"), related: ["land", "overview"] },
  { re: /\belevation (colou?rs?|map)\b/, step: layer("globe:elevation", "Colour the map by elevation"), related: ["land", "overview"] },

  // Views of the place
  { re: /\b(watersheds?|catchments?|drainage basins?|(what|which) land drains)\b/, step: view("water", "watershed", "Outline the watershed") },
  { re: /\b(storm ?drains?|drains?|drainage|sewers?|sewage|culverts?|wastewater|water (mains|pipes?|supply|system|infrastructure)|pipes?|pipelines?|city water|urban water)\b/, step: view("water", "city", "Map how water moves through the city") },
  { re: /\b(rain ?water|rain(fall)?|water|runoff) (flows?|goes|go|runs?|ends up|drains)\b|\b(rain|flow) path\b|\brunoff\b|\bflows? downhill\b|\bwhere (does|do|would) (the )?(rain|water|rainwater)\b/, step: view("water", "rain", "Follow the rain downhill") },
  { re: /\b(rivers?|lakes?|streams?|springs?|wells?|groundwater|ponds?|wetlands?|reservoirs?)\b/, step: view("water", "nearby", "Find rivers, lakes, springs and wells") },
  { re: /\b(cross[- ]?sections?|profiles?|slice)\b/, step: view("land", "profile", "Slice through the land") },
  { re: /\b(rocks?|bedrock|strata|rock layers)\b/, step: view("land", "rocks", "Show the rock layers below") },
  { re: /\b(elevation|altitude|height|terrain|landforms?|how high)\b/, step: view("land", "overview", "Read the ground: height, slope, landform") },
  { re: /\b(minerals?|ores?)\b/, step: view("minerals", "here", "Read the rock and its minerals") },
  { re: /\b(mines?|mining|quarr(y|ies))\b/, step: view("minerals", "mines", "Find mines and quarries nearby") },
  { re: /\b(climate change|global warming|warming|getting (hotter|warmer))\b/, step: view("climate", "change", "Show how the climate is changing") },
  { re: /\b(weather|forecast|temperature (now|today)|right now)\b/, step: view("climate", "now", "Check the weather now") },
  { re: /\b(climate|average temperature|seasons?)\b/, step: view("climate", "climate", "Show the climate through the year") },
  { re: /\b(endangered|threatened|at risk|extinct(ion)?)\b/, step: view("animals", "threatened", "List species at risk") },
  { re: /\b(plants?|trees?|flowers?|vegetation|flora|forests?)\b/, step: view("plants", "species", "See what grows here") },
  { re: /\b(animals?|wildlife|birds?|mammals?|fauna|reptiles?|insects?|fish)\b/, step: view("animals", "species", "See what lives here") },
  { re: /\b(internet|connectivity)\b/, step: view("built", "internet", "Find the undersea cable links") },
  { re: /\b(energy|electricity|power)\b/, step: view("built", "energy", "Show power plants and the energy mix") },
  { re: /\b(transport(ation)?|transit|stations?|how (to )?get (there|here))\b/, step: view("built", "transport", "Find airports, ports and lines") },
  { re: /\b(infrastructure|what'?s built|buildings?)\b/, step: view("built", "overview", "Map what's been built") },
  { re: /\b(economy|gdp|income|trade|exports?)\b/, step: view("countries", "economy", "Show the country's economy") },
  { re: /\b(population|people|life expectancy)\b/, step: view("countries", "people", "Show the country's people") },
  { re: /\b(emissions|co2|carbon)\b/, step: view("countries", "environment", "Show emissions and forests") },
  { re: /\b(country|nation)\b/, step: view("countries", "overview", "Open the country profile") },
  { re: /\b(landmarks?|sights?|famous|tell me about|what'?s (here|there)|what is (here|there))\b/, step: view("explore", "here", "Tell me about this place") },
  { re: /\bwater\b/, step: view("water", "overview", "Look at water nearby") },
];

const COMMODITY_WORDS: [RegExp, string, string][] = [
  [/\bcopper\b/, "copper", "Copper"], [/\blithium\b/, "lithium", "Lithium"], [/\bcobalt\b/, "cobalt", "Cobalt"],
  [/\bnickel\b/, "nickel", "Nickel"], [/\brare[- ]earths?( elements| metals)?\b/, "rare-earths", "Rare earths"],
  [/\bgraphite\b/, "graphite", "Graphite"], [/\biron( ore)?\b/, "iron", "Iron ore"], [/\b(alumin(i)?um|bauxite)\b/, "aluminium", "Aluminium"],
  [/\bgold\b/, "gold", "Gold"], [/\bsilver\b/, "silver", "Silver"], [/\b(platinum|palladium)\b/, "platinum", "Platinum group"],
  [/\buranium\b/, "uranium", "Uranium"], [/\bcoal\b/, "coal", "Coal"], [/\bdiamonds?\b/, "diamonds", "Diamonds"],
  [/\btin\b/, "tin", "Tin"], [/\bzinc\b/, "zinc", "Zinc"], [/\bmanganese\b/, "manganese", "Manganese"],
  [/\btungsten\b/, "tungsten", "Tungsten"], [/\bpotash\b/, "potash", "Potash"], [/\bphosphates?\b/, "phosphate", "Phosphate"],
];

const STOP = new Set(("show me the a an and or what whats what's where is are how does do did map maps find see display add turn on off of please " +
  "with plus then near in at around across through for over can could you i i'd want wanna to look like all some any get give tell about this " +
  "that there my go goes going flow flows flowing it its be will would which who why when also both into from up down list compare vs versus " +
  "nearby close by let lets let's us we our on onto just now show's showing view layer layers overlay add also everything stuff things " +
  "happens happening plan planning check checking make making create start manage managing track tracking keep record open need help").split(/\s+/));

/** Words that describe a place without naming one. */
const GENERIC = new Set("city town area place region neighbourhood neighborhood district downtown centre center here there local spot zone streets street urban".split(" "));

const CONNECTOR = /\s*(?:,|;|\band\b|\bthen\b|\bwith\b|\bplus\b|\balso\b|\bshow\b|\badd\b|\bwhere\b|\bhow\b|\bwhat\b)\s*/;
const PREPOSITION = /\b(in|at|near|around|across|through|for|of|over|by)\s+/g;

/** Strips words the robot understood (and filler), leaving candidate place words. */
function leftovers(text: string): string[] {
  let t = ` ${text} `;
  for (const r of RULES) t = t.replace(new RegExp(r.re.source, "g"), " ");
  for (const [re] of COMMODITY_WORDS) t = t.replace(new RegExp(re.source, "g"), " ");
  return t.split(/[^a-z0-9'’\-.]+/).map((w) => w.replace(/^[-.']+|[-.']+$/g, "")).filter((w) => w && !STOP.has(w));
}

function findPlace(text: string): { place: PlanPlace | null; used: string } {
  if (/\b(here|this (place|spot|area)|my location|where i am)\b/.test(text) && !/\b(there)\b/.test(text)) {
    // "here" only counts if nothing more specific is named.
    const named = leftovers(text).filter((w) => !GENERIC.has(w));
    if (!named.length) return { place: { kind: "here" }, used: "" };
  }
  for (const m of text.matchAll(PREPOSITION)) {
    const after = text.slice((m.index ?? 0) + m[0].length);
    const chunk = after.split(CONNECTOR)[0].replace(/^(the|a|an)\s+/, "").replace(/[?.!]+$/, "").trim();
    const words = leftovers(chunk);
    if (words.length && words.some((w) => !GENERIC.has(w))) return { place: { kind: "query", text: chunk }, used: chunk };
  }
  // No "in X": whatever's left after the known words, e.g. "Tokyo earthquakes".
  const rest = leftovers(text).filter((w) => !GENERIC.has(w));
  if (rest.length) return { place: { kind: "query", text: rest.join(" ") }, used: rest.join(" ") };
  return { place: null, used: "" };
}

const HISTORY_WORDS = /\b(historical |old )?(borders?|empires?|kingdoms?|who ruled|history|historical map|political map)\b/;
const YEAR = /\b(?:(?:in|of|during|around|from|circa|by)\s+)?(?:(ad|ce)\s*)?(\d{1,6})(?:\s*(bc|bce|ad|ce)\b)?/;

/** Empires named by adjective, and where to look for them. */
const EMPIRES: Record<string, string> = {
  "holy roman": "Germany", roman: "Rome", byzantine: "Istanbul", ottoman: "Istanbul", mongol: "Mongolia", persian: "Iran", achaemenid: "Iran",
  aztec: "Mexico City", inca: "Cusco", mughal: "Delhi", british: "London", spanish: "Madrid", portuguese: "Lisbon", french: "Paris",
  russian: "Moscow", chinese: "China", qing: "China", ming: "China", han: "China", egyptian: "Egypt", greek: "Greece", macedonian: "Greece",
  mali: "Mali", songhai: "Mali", ghana: "Ghana", maurya: "India", gupta: "India", carolingian: "Aachen", austro: "Vienna", "austro-hungarian": "Vienna",
  habsburg: "Vienna", japanese: "Japan", khmer: "Angkor", assyrian: "Mosul", babylonian: "Iraq",
};

/** "borders in 1914", "empires of 500 BC": the nearest year there's a map for. */
export function historyYear(text: string): { year: number; match: string } | null {
  // A history word, an era (BC/AD), or "in 1914".
  const bare = /\b(?:in|during|around) (1\d{3}|20[01]\d)\b(?! [a-z]*\s*(street|st|avenue|ave|road|rd))/.exec(text);
  if (!HISTORY_WORDS.test(text) && !/\d\s*(bc|bce)\b|\b(ad|ce)\s*\d/.test(text) && !bare) return null;
  const m = YEAR.exec(text);
  if (!m) return null;
  const n = Number(m[2]);
  if (!n) return null;
  return { year: nearestYear(/bc/.test(m[3] ?? "") ? -n : n), match: m[0] };
}

export function plan(request: string): Plan {
  let text = request.toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
  const hist = historyYear(text);
  if (hist) {
    text = text.replace(hist.match, " ");
    const e = /\b(holy roman|austro-hungarian|[a-z]+) (empire|kingdom|dynasty|sultanate|caliphate)\b/.exec(text);
    if (e && EMPIRES[e[1]]) text = text.replace(e[0], ` in ${EMPIRES[e[1]].toLowerCase()} `);
    text = text.replace(HISTORY_WORDS, " ").replace(/\s+/g, " ").trim();
  }
  const { place, used } = findPlace(text);
  // Match the vocabulary in what's left once the place name is taken out,
  // so words in a place name ("Salt Lake City", "Iron Mountain") aren't read as requests.
  let rest = ` ${used ? text.replace(used, " ") : text} `;
  const found: { at: number; step: Step; related?: [string, string] }[] = [];
  for (const r of RULES) {
    const m = r.re.exec(rest);
    if (!m) continue;
    found.push({ at: m.index, step: r.step, related: r.related });
    rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  const commodities: Step[] = [];
  for (const [re, id, label] of COMMODITY_WORDS) {
    const m = re.exec(rest);
    if (!m) continue;
    commodities.push({ kind: "commodity", id, label: `Show where ${label.toLowerCase()} comes from` });
    rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  // Water "through the city" or "downtown" (words the place name may have used up) means the city's water system too.
  if (/\b(rain|water|runoff|flood|flow)/.test(text) && /\b((through|in|across) (the |a |this )?(city|town|streets|urban)|downtown|urban)\b/.test(text) && !found.some((f) => f.step.kind === "view" && f.step.subtab === "city"))
    found.push({ at: Infinity, step: view("water", "city", "Map how water moves through the city") });
  found.sort((a, b) => a.at - b.at);
  const layers = found.filter((f) => f.step.kind === "layer").map((f) => f.step);
  if (hist) layers.unshift(layer(`work:borders:${hist.year}`, `Show the borders in ${yearLabel(hist.year)}`));
  let views = found.filter((f) => f.step.kind === "view").map((f) => f.step);
  if (!views.length && !commodities.length) {
    const rel = found.find((f) => f.related)?.related;
    if (rel && place) views = [RULES.find((r) => r.step.kind === "view" && r.step.theme === rel[0] && r.step.subtab === rel[1])?.step ?? view(rel[0], rel[1], "Open the related view")];
  }
  if (commodities.length) views.push(view("minerals", "commodities", "Open the commodity explorer"));
  // One step per view or layer, in the order asked.
  const seen = new Set<string>();
  const steps = [...layers, ...commodities, ...views].filter((s) => {
    const key = s.kind === "view" ? `v:${s.theme}/${s.subtab}` : s.kind === "layer" ? `l:${s.action}` : `c:${s.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const unknown = place?.kind === "query" ? [] : leftovers(rest).filter((w) => !GENERIC.has(w));
  return { place, steps, unknown };
}

/** True when the input reads as a request rather than just a place name. */
export function looksLikeRequest(p: Plan): boolean {
  return p.steps.length > 0;
}
