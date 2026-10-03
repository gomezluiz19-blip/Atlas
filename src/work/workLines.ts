// Work's fields: one per industry. Each field's tools sit on the same three
// rungs, so every field reads the same way:
//   Everyday  for anyone: look around the field, or your own project;
//   Pro       for people who do the work (Mining Pro, Build Pro, a site scout);
//   Services  for companies that serve the work (mining equipment, plant hire).
// Describing what you do ranks the tools that fit (pure).

import { INDUSTRIES } from "./scoutModel";

/** The made-and-grown-nearby stations, between the pro's scout and the companies that serve them. */
const SOURCE_STATIONS: Record<string, [label: string, who: string, words: string]> = {
  food: ["Foodshed", "Chefs: the farms, orchards and boats within a day's drive, and what's in season", "chef sourcing local produce farm to table seasonal menu supplier farmers farm shop"],
  fashion: ["Made nearby", "Designers: mills, tanneries, workrooms and fabric within reach", "sourcing manufacturer mill tannery local production textile supplier factory"],
  architecture: ["Local materials", "Architects and builders: stone, timber, brick and trades within reach", "materials stone timber brick local sourcing quarry sawmill"],
  art: ["Makers and suppliers", "Artists: foundries, studios, framers and suppliers within reach", "foundry framer fabrication art supplies casting printmaking"],
};

/** The companies that serve each industry (Field Network sectors), kept here so the Work map doesn't load the sector engine. */
const SERVES: Record<string, [label: string, who: string, words: string]> = {
  art: ["Art handling and installation", "Fine-art shippers, installers and display-case makers", "art handling fine art shipping installer display cases museum services conservation art logistics"],
  fashion: ["Textile and sewing machinery", "Dealers and servicers of sewing, knitting and cutting machines", "sewing machine dealer textile machinery garment factory supplier knitting embroidery machine technician"],
  gaming: ["Arcade and venue tech", "Operators and servicers of arcade machines, VR and venue screens", "arcade machines amusement operator vr installer venue av led screens cabinet repair"],
  realestate: ["Property maintenance", "Facilities and building-services companies looking after many buildings", "facilities management building services hvac elevator maintenance property maintenance fm"],
  architecture: ["Surveys and inspection", "Surveying, scanning and façade-inspection companies", "surveyor laser scanning drone survey facade inspection building survey measured survey"],
  food: ["Kitchens and refrigeration", "Companies that install and service restaurant kitchens and cold rooms", "commercial kitchen refrigeration engineer catering equipment cold room installer restaurant equipment"],
  retail: ["Fixtures, checkouts and cold cases", "Companies that fit out and service shops and supermarkets", "shop fitting store fixtures pos epos refrigeration self checkout retail installer"],
  tech: ["Field IT and data centres", "Companies that install and service networks, servers and data-centre plant", "data centre field engineer it support msp remote hands ups cooling network installer"],
};

/** The three rungs of every field (see the top of this file and docs/work-design.md). */
export type Tier = "everyday" | "pro" | "services";
export const TIERS: { id: Tier; label: string; for: (noun: string) => string }[] = [
  { id: "everyday", label: "Everyday", for: (n) => `For anyone into ${n}` },
  { id: "pro", label: "Pro", for: (n) => `For people who work in ${n}` },
  { id: "services", label: "Services", for: (n) => `For companies that serve ${n}` },
];
/** The groups fields are shown in, when choosing one. */
export const FAMILIES = [
  { id: "make", label: "Make and build" },
  { id: "serve", label: "Shops and hospitality" },
  { id: "money", label: "Money and trade" },
  { id: "people", label: "Culture and community" },
] as const;
export type Family = (typeof FAMILIES)[number]["id"];

export interface Station {
  id: string;
  label: string;
  /** Who it's for, in a line. */
  who: string;
  /** The tool it opens: a tool id, "services:<sector>" for Field Network in a sector, "explore:<industry>" or "scout:<industry>". */
  tool: string;
  /** Words people use for this work, for matching "what do you do?". */
  words: string;
  /** Saved data that means it's in use (a localStorage key). */
  key?: string;
}
export interface Line { id: string; label: string; color: string; stations: Station[] }
/** How a field is shown: its icon (a key of ui/icons), its group, what to call the work in a sentence, and a line about it. */
export interface FieldLook { icon: string; family: Family; noun: string; blurb: string }

export const LINES: Line[] = [
  // Industries where people work around a place: the everyday look round first, then the pro's scout, then the companies that serve them.
  ...INDUSTRIES.filter((i) => i.id !== "sport").map((i): Line => ({ id: i.id, label: i.label, color: i.color, stations: [
    { id: `explore-${i.id}`, label: i.explore.label, who: i.explore.who, tool: `explore:${i.id}`, words: i.words.explore },
    { id: `scout-${i.id}`, label: i.scout.label, who: i.scout.who, tool: `scout:${i.id}`, words: i.words.scout, key: "atlas.work.scout.v1" },
    ...(SOURCE_STATIONS[i.id] ? [{ id: `source-${i.id}`, label: SOURCE_STATIONS[i.id][0], who: SOURCE_STATIONS[i.id][1], tool: `source:${i.id}`, words: SOURCE_STATIONS[i.id][2] }] : []),
    ...(i.sector && SERVES[i.sector] ? [{ id: `fn-${i.sector}`, label: SERVES[i.sector][0], who: SERVES[i.sector][1], tool: `services:${i.sector}`, words: SERVES[i.sector][2], key: "atlas.pro.services.v1" }] : []),
  ] })),
  { id: "sport", label: "Sport", color: "#bf5af2", stations: [
    { id: "explore-sport", label: "Stadiums and games", who: "Grounds, gyms and pitches near you, and the world's great stadiums", tool: "explore:sport", words: "fan tickets match game stadium gym swim run" },
    { id: "scout-sport", label: "Gym and club scout", who: "Gyms, studios and clubs: where members will come from", tool: "scout:sport", words: "gym owner fitness studio personal trainer yoga studio climbing gym", key: "atlas.work.scout.v1" },
    { id: "sports", label: "Sports Pro", who: "Clubs: fixtures, travel, fans, scouting", tool: "sports", words: "club team coach sports manager football soccer baseball league scouting", key: "atlas.pro.clubs.v1" },
    { id: "fn-sports", label: "Surfaces & facilities", who: "Pitch, turf and stadium equipment companies", tool: "services:sports", words: "pitch turf artificial grass stadium sports facilities groundskeeping floodlights", key: "atlas.pro.services.v1" },
  ] },
  { id: "build", label: "Building", color: "#ff9f0a", stations: [
    { id: "build", label: "Build", who: "Your own project: a house, an extension, a barn", tool: "build", words: "home renovation extension self build house barn homeowner", key: "atlas.work.build.v1" },
    { id: "buildpro", label: "Build Pro", who: "Builders and contractors running sites", tool: "buildpro", words: "contractor builder construction general contractor site manager project manager developer subcontractor civil engineering", key: "atlas.pro.build.v1" },
    { id: "fn-construction", label: "Suppliers & plant hire", who: "Cranes, lifts, plant and materials for sites", tool: "services:construction", words: "crane plant hire equipment rental lifts scaffolding building supplier materials merchant construction supplier", key: "atlas.pro.services.v1" },
  ] },
  { id: "mine", label: "Mining", color: "#ac8e68", stations: [
    { id: "explore-mine", label: "Mines and minerals", who: "The world's great mines, what each metal is for, and what's under your feet", tool: "theme:minerals/commodities", words: "minerals metals commodities copper lithium gold rocks geology curious mines of the world" },
    { id: "mining", label: "Mining Pro", who: "Mine operators: pit to port, communities, permits, tailings", tool: "mining", words: "mine miner mining operator quarry pit smelter tailings community relations", key: "atlas.pro.mines.v1" },
    { id: "fn-mining", label: "Mining equipment & services", who: "Companies that sell to and service mines", tool: "services:mining", words: "mining equipment drill rigs haul trucks mining services oem dealer technician mining supplier", key: "atlas.pro.services.v1" },
  ] },
  { id: "finance", label: "Finance", color: "#2a78d6", stations: [
    { id: "fin-markets", label: "Markets now", who: "The world's exchanges following the sun: who's trading, when each opens and closes", tool: "fin:markets", words: "stock market exchange trading hours open close nyse nasdaq lse tokyo markets investor trader" },
    { id: "fin-company", label: "Company explorer", who: "Any company: owners, subsidiaries, assets and partners on the map; stock and figures year by year", tool: "fin:company", words: "company stock shares ticker analyst investor equity research subsidiaries owners parent revenue earnings financials market cap holding corporate structure m&a private equity venture" },
    { id: "fin-watch", label: "Watchlist", who: "The companies you follow on the map, and where they're based", tool: "fin:watch", words: "portfolio watchlist investments holdings stocks shares fund manager wealth", key: "atlas.fin.watch.v1" },
  ] },
  { id: "banking", label: "Banking", color: "#1baf7a", stations: [
    { id: "bank-near", label: "Banks near you", who: "Banks, ATMs and credit unions around a place, nearest first", tool: "bank:near", words: "bank atm cash credit union branch near me withdraw deposit" },
    { id: "bank-company", label: "Bank explorer", who: "Any bank: its group, subsidiaries, assets, listings and figures, and its branches near you", tool: "bank:company", words: "bank banking group lender subsidiaries total assets capital bank analyst regulator" },
    { id: "bank-coverage", label: "Branch coverage", who: "Bankers: each bank's share of branches around a place, and the areas more than 2 km from any branch", tool: "bank:coverage", words: "banker branch network retail banking branch planning market share banking desert financial inclusion credit union manager" },
  ] },
  { id: "freight", label: "Freight & trade", color: "#0a84ff", stations: [
    { id: "explore-freight", label: "Ships, live", who: "Cargo ships, tankers and ferries moving right now", tool: "action:live:ships", words: "ships boats vessels marine traffic container ships tankers" },
    { id: "shipping", label: "Freight Desk", who: "Forwarders, shipping agents and shippers", tool: "shipping", words: "freight forwarder shipping agent shipper logistics container import export customs broker ocean cargo vessel port", key: "atlas.pro.shipping.v1" },
    { id: "network", label: "Business network", who: "Your sites, suppliers and customers, and what flows between them", tool: "network", words: "supply chain suppliers distributor wholesale manufacturer business sites partners customers", key: "atlas.pro.networks.v1" },
  ] },
  { id: "aid", label: "Aid & development", color: "#30d158", stations: [
    { id: "explore-aid", label: "Where people live", who: "How many people live where, their homes, health and who's online", tool: "theme:people", words: "population people density homes poverty" },
    { id: "field", label: "Field Ops", who: "Programme managers: who's out of reach of water, health, school", tool: "field", words: "ngo aid programme manager development humanitarian charity field coordinator water health school", key: "atlas.pro.field.v1" },
    { id: "relief", label: "Relief Pipeline", who: "Humanitarian logisticians: port to people", tool: "relief", words: "humanitarian logistics relief supply chain warehouse emergency response wfp unhcr food distribution", key: "atlas.pro.relief.v1" },
  ] },
  { id: "farm", label: "Farming", color: "#8bd346", stations: [
    { id: "grow", label: "Grow", who: "Your fields and crops: growth stage, harvest, water and frost", tool: "grow", words: "farmer grower fields crops garden allotment", key: "atlas.work.fields.v1" },
    { id: "flock", label: "Flock", who: "Animals in your care: herds, flocks, vets and their records", tool: "flock", words: "livestock sheep cattle cows herd flock vet hens animals rancher" },
    { id: "fn-agriculture", label: "Farm machinery & service", who: "Dealers and servicers of tractors, combines, irrigation", tool: "services:agriculture", words: "tractor dealer farm machinery combine irrigation agricultural equipment ag dealer", key: "atlas.pro.services.v1" },
  ] },
  { id: "energy", label: "Energy", color: "#ffd60a", stations: [
    { id: "explore-energy", label: "Power around you", who: "Power plants, lines and wind and solar farms on the map", tool: "theme:built/energy", words: "power plants electricity grid power lines energy" },
    { id: "fn-energy", label: "Wind & solar O&M", who: "Operations and maintenance for wind and solar farms", tool: "services:energy", words: "wind turbine solar farm renewable energy o&m operations maintenance technician inverter power plant", key: "atlas.pro.services.v1" },
  ] },
  { id: "health", label: "Health", color: "#ff375f", stations: [
    { id: "explore-health", label: "Care near you", who: "The nearest hospital, and clinics, doctors and pharmacies around a place", tool: "theme:health", words: "hospital clinic doctor pharmacy patient care near me" },
    { id: "fn-medical", label: "Medical equipment", who: "Companies that install and service hospital equipment", tool: "services:medical", words: "medical devices hospital equipment biomedical imaging scanner service engineer healthcare", key: "atlas.pro.services.v1" },
  ] },
  { id: "telecom", label: "Telecoms", color: "#64d2ff", stations: [
    { id: "explore-telecom", label: "Who's connected", who: "Undersea cables, data centres and how many people are online", tool: "theme:built/internet", words: "internet cables connectivity online broadband" },
    { id: "fn-telecom", label: "Tower services", who: "Towers, generators and fuel runs", tool: "services:telecom", words: "telecom tower mast mobile network generator fuel rigger isp", key: "atlas.pro.services.v1" },
  ] },
  { id: "gov", label: "Government", color: "#5e5ce6", stations: [
    { id: "explore-gov", label: "Who governs", who: "Your representatives, the districts and the people who run a place", tool: "theme:politics", words: "who represents me representative senator elections government citizen voter" },
    { id: "office", label: "Politics Pro", who: "Legislative offices: the district, casework, events, votes", tool: "office", words: "politician legislator congress councillor mayor office staffer casework constituents district campaign", key: "atlas.pro.offices.v1" },
  ] },
  { id: "host", label: "Hotels & buildings", color: "#ff6482", stations: [
    { id: "explore-host", label: "Travel", who: "Go somewhere: the way there, the weather when you land, and stays near what you came for", tool: "travel", words: "trip holiday vacation travel book a hotel stay" },
    { id: "occupancy", label: "Live occupancy", who: "Rooms, floors and bookings from your booking system", tool: "occupancy", words: "hotel hospitality property manager facilities building manager bookings rooms landlord" },
  ] },
];

/** Which rung a station sits on (pure). */
export function tierOf(s: Station): Tier {
  if (s.tool.startsWith("services:")) return "services";
  if (/^(explore:|theme:|action:)/.test(s.tool) || ["build", "travel", "fin-markets", "fin-watch", "bank-near"].includes(s.id)) return "everyday";
  return "pro";
}

export const LOOKS: Record<string, FieldLook> = {
  build: { icon: "crane", family: "make", noun: "building", blurb: "Your own project, the builders who run sites, and the plant and suppliers behind them." },
  architecture: { icon: "building", family: "make", noun: "architecture", blurb: "Great buildings, where a practice should be, local materials, and the surveyors who measure it all." },
  mine: { icon: "pick", family: "make", noun: "mining", blurb: "The world's mines, running one from pit to port, and the companies that equip and service them." },
  energy: { icon: "pylon", family: "make", noun: "energy", blurb: "The grid around you, and the crews who keep wind and solar farms turning." },
  farm: { icon: "sprout", family: "make", noun: "farming", blurb: "Fields, crops and animals, and the dealers who keep the machinery running." },
  telecom: { icon: "antenna", family: "make", noun: "telecoms", blurb: "How the world is wired, and the crews who keep towers powered." },
  food: { icon: "fork", family: "serve", noun: "food", blurb: "Where to eat, where to open, what's grown nearby, and who fits out the kitchen." },
  retail: { icon: "tag", family: "serve", noun: "retail", blurb: "Shops near you, the right street for a store, and who fits it out." },
  fashion: { icon: "shirt", family: "serve", noun: "fashion", blurb: "Fashion streets, where a boutique belongs, makers nearby, and the machinery behind them." },
  host: { icon: "suitcase", family: "serve", noun: "hotels", blurb: "Trips, and live rooms and bookings for the people who run hotels and buildings." },
  realestate: { icon: "home", family: "serve", noun: "real estate", blurb: "Neighbourhoods, comparing addresses, and the firms that look after buildings." },
  finance: { icon: "coin", family: "money", noun: "finance", blurb: "Markets as they open around the world, any company's owners and assets, and your watchlist." },
  banking: { icon: "bank", family: "money", noun: "banking", blurb: "Banks near you, any bank's group and figures, and branch coverage for bankers." },
  freight: { icon: "ship", family: "money", noun: "freight", blurb: "Ships moving now, every shipment on its route, and your business's flows." },
  tech: { icon: "chip", family: "money", noun: "tech", blurb: "Tech hubs, where a startup should base itself, and the engineers behind data centres." },
  art: { icon: "palette", family: "people", noun: "art", blurb: "Museums and galleries, where the scene is, makers and suppliers, and art handlers." },
  gaming: { icon: "gamepad", family: "people", noun: "gaming", blurb: "Arcades and venues, where to open one, and the people who keep machines running." },
  sport: { icon: "trophy", family: "people", noun: "sport", blurb: "Stadiums and games, gyms and clubs, running a club, and the surfaces they play on." },
  health: { icon: "medical", family: "people", noun: "health care", blurb: "Care near you, and the engineers who install and service hospital equipment." },
  aid: { icon: "people", family: "people", noun: "aid work", blurb: "Where people live, who's out of reach of water, health and school, and getting supplies to them." },
  gov: { icon: "flag", family: "people", noun: "government", blurb: "Who governs a place, and running a legislative office." },
};
export const lookOf = (line: Line): FieldLook => LOOKS[line.id] ?? { icon: "briefcase", family: "people", noun: line.label.toLowerCase(), blurb: "" };

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9&]/g, "").replace(/(ies)$/, "y").replace(/(es|s)$/, "");
const STOP = new Set(["i", "a", "an", "the", "and", "or", "for", "of", "to", "in", "at", "we", "our", "my", "run", "work", "do", "am", "im", "company", "business", "out", "up", "all", "with", "who", "people"]);

/** How well a station fits what someone says they do (pure): 0 is no fit. */
export function fit(s: Station, line: Line, query: string): number {
  const qs = query.toLowerCase().split(/[^a-z0-9&]+/).filter((w) => w && !STOP.has(w)).map(norm).filter(Boolean);
  if (!qs.length) return 0;
  const vocab = `${s.words} ${s.label} ${s.who} ${line.label}`.toLowerCase().split(/[^a-z0-9&]+/).map(norm).filter(Boolean);
  let score = 0;
  for (const q of qs) {
    if (vocab.includes(q)) score += 3;
    else if (q.length >= 3 && vocab.some((v) => v.startsWith(q) || (v.length >= 4 && q.startsWith(v)))) score += 1.5;
  }
  return score;
}

/** Stations ranked for what someone does (pure). */
export function rank(query: string): { line: Line; station: Station; score: number }[] {
  return LINES.flatMap((line) => line.stations.map((station) => ({ line, station, score: fit(station, line, query) }))).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}
