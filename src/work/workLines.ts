// The Work map's lines: one per industry, like a metro line. Each runs from
// the everyday tool (if there is one) to the pro tool for the people who run
// that kind of work, and on to the specialists who serve them: Build → Build
// Pro → suppliers and plant hire; Mining Pro → mining equipment and
// services. Typing what you do lights up the stations that fit (pure).

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
    { id: "mining", label: "Mining Pro", who: "Mine operators: pit to port, communities, permits, tailings", tool: "mining", words: "mine miner mining operator quarry pit smelter tailings community relations", key: "atlas.pro.mines.v1" },
    { id: "fn-mining", label: "Mining equipment & services", who: "Companies that sell to and service mines", tool: "services:mining", words: "mining equipment drill rigs haul trucks mining services oem dealer technician mining supplier", key: "atlas.pro.services.v1" },
  ] },
  { id: "freight", label: "Freight & trade", color: "#0a84ff", stations: [
    { id: "shipping", label: "Freight Desk", who: "Forwarders, shipping agents and shippers", tool: "shipping", words: "freight forwarder shipping agent shipper logistics container import export customs broker ocean cargo vessel port", key: "atlas.pro.shipping.v1" },
    { id: "network", label: "Business network", who: "Your sites, suppliers and customers, and what flows between them", tool: "network", words: "supply chain suppliers distributor wholesale manufacturer business sites partners customers", key: "atlas.pro.networks.v1" },
  ] },
  { id: "aid", label: "Aid & development", color: "#30d158", stations: [
    { id: "field", label: "Field Ops", who: "Programme managers: who's out of reach of water, health, school", tool: "field", words: "ngo aid programme manager development humanitarian charity field coordinator water health school", key: "atlas.pro.field.v1" },
    { id: "relief", label: "Relief Pipeline", who: "Humanitarian logisticians: port to people", tool: "relief", words: "humanitarian logistics relief supply chain warehouse emergency response wfp unhcr food distribution", key: "atlas.pro.relief.v1" },
  ] },
  { id: "farm", label: "Farming", color: "#8bd346", stations: [
    { id: "grow", label: "Grow", who: "Your fields and crops", tool: "grow", words: "farmer grower fields crops garden allotment", key: "atlas.work.fields.v1" },
    { id: "fn-agriculture", label: "Farm machinery & service", who: "Dealers and servicers of tractors, combines, irrigation", tool: "services:agriculture", words: "tractor dealer farm machinery combine irrigation agricultural equipment ag dealer", key: "atlas.pro.services.v1" },
  ] },
  { id: "energy", label: "Energy", color: "#ffd60a", stations: [
    { id: "fn-energy", label: "Wind & solar O&M", who: "Operations and maintenance for wind and solar farms", tool: "services:energy", words: "wind turbine solar farm renewable energy o&m operations maintenance technician inverter power plant", key: "atlas.pro.services.v1" },
  ] },
  { id: "health", label: "Health", color: "#ff375f", stations: [
    { id: "fn-medical", label: "Medical equipment", who: "Companies that install and service hospital equipment", tool: "services:medical", words: "medical devices hospital equipment biomedical imaging scanner service engineer healthcare", key: "atlas.pro.services.v1" },
  ] },
  { id: "telecom", label: "Telecoms", color: "#64d2ff", stations: [
    { id: "fn-telecom", label: "Tower services", who: "Towers, generators and fuel runs", tool: "services:telecom", words: "telecom tower mast mobile network generator fuel rigger isp", key: "atlas.pro.services.v1" },
  ] },
  { id: "gov", label: "Government", color: "#5e5ce6", stations: [
    { id: "office", label: "Politics Pro", who: "Legislative offices: the district, casework, events, votes", tool: "office", words: "politician legislator congress councillor mayor office staffer casework constituents district campaign", key: "atlas.pro.offices.v1" },
  ] },
  { id: "host", label: "Hotels & buildings", color: "#ff6482", stations: [
    { id: "occupancy", label: "Live occupancy", who: "Rooms, floors and bookings from your booking system", tool: "occupancy", words: "hotel hospitality property manager facilities building manager bookings rooms landlord" },
  ] },
];

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
