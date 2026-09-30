// The Work map's lines: one per industry, like a metro line. Each runs from
// the everyday tool (if there is one) to the pro tool for the people who run
// that kind of work, and on to the specialists who serve them: Build → Build
// Pro → suppliers and plant hire; Mining Pro → mining equipment and
// services. Typing what you do lights up the stations that fit (pure).

export interface Station {
  id: string;
  label: string;
  /** Who it's for, in a line. */
  who: string;
  /** The tool it opens: a tool id, or "services:<sector>" for Field Network in a sector. */
  tool: string;
  /** Words people use for this work, for matching "what do you do?". */
  words: string;
  /** Saved data that means it's in use (a localStorage key). */
  key?: string;
}
export interface Line { id: string; label: string; color: string; stations: Station[] }

export const LINES: Line[] = [
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
  { id: "sport", label: "Sport", color: "#bf5af2", stations: [
    { id: "sports", label: "Sports Pro", who: "Clubs: fixtures, travel, fans, scouting", tool: "sports", words: "club team coach sports manager football soccer baseball league scouting", key: "atlas.pro.clubs.v1" },
    { id: "fn-sports", label: "Surfaces & facilities", who: "Pitch, turf and stadium equipment companies", tool: "services:sports", words: "pitch turf artificial grass stadium sports facilities groundskeeping floodlights", key: "atlas.pro.services.v1" },
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
