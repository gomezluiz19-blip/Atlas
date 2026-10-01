// The industries people work in around a place, each as three steps: the
// everyday look round (where to eat, shop, see art, play), the pro's site
// scout (where to open, what's near a candidate address, who else is there),
// and the companies that serve them (Field Network). One table of what to
// look for on OpenStreetMap drives both the look round and the scout; the
// scoring is plain counts within a walk, weighted per industry (pure).
import type { Vertical } from "../pro/services/network";

/** A kind of place, as OSM tags: any of `v` under key `k` (or any value, if `v` is empty). */
export interface Match { k: string; v: string[] }
export interface Find { id: string; label: string; emoji: string; color: string; match: Match[] }
export interface Industry {
  id: string; label: string; color: string;
  /** Tags of signature places (intros) that belong to it. */
  tags: string[];
  explore: { label: string; who: string; finds: Find[] };
  scout: { label: string; who: string; noun: string;
    /** Weight of each find or draw within the walk: positive draws people, negative competes. */
    weights: Record<string, number>;
    /** True where like attracts like (fashion streets, gallery districts, tech clusters): rivals count for you. */
    cluster?: boolean };
  sector?: Vertical;
  words: { explore: string; scout: string };
}

const m = (k: string, ...v: string[]): Match => ({ k, v });

/** What brings people past a door, used by every scout. */
export const DRAWS: Find[] = [
  { id: "transit", label: "Stations and stops", emoji: "🚉", color: "#64d2ff", match: [m("railway", "station", "halt", "subway_entrance", "tram_stop"), m("public_transport", "station"), m("highway", "bus_stop")] },
  { id: "offices", label: "Offices", emoji: "🏢", color: "#a1a1aa", match: [m("office")] },
  { id: "students", label: "Schools and colleges", emoji: "🎓", color: "#ffd60a", match: [m("amenity", "school", "college", "university")] },
  { id: "visitors", label: "Sights and hotels", emoji: "📸", color: "#ff9f0a", match: [m("tourism", "attraction", "hotel", "museum", "viewpoint")] },
];

export const INDUSTRIES: Industry[] = [
  { id: "food", label: "Food", color: "#ff6b3d", tags: ["food"], sector: "food",
    explore: { label: "Eat & drink", who: "Where to eat round here, and the world's great food markets", finds: [
      { id: "restaurant", label: "Restaurants", emoji: "🍽", color: "#ff6b3d", match: [m("amenity", "restaurant")] },
      { id: "cafe", label: "Cafés", emoji: "☕", color: "#c08552", match: [m("amenity", "cafe")] },
      { id: "quick", label: "Street food and fast", emoji: "🌮", color: "#ffb340", match: [m("amenity", "fast_food", "food_court")] },
      { id: "bar", label: "Bars and pubs", emoji: "🍷", color: "#bf5af2", match: [m("amenity", "bar", "pub", "biergarten")] },
      { id: "market", label: "Markets and food shops", emoji: "🧺", color: "#30d158", match: [m("amenity", "marketplace"), m("shop", "bakery", "butcher", "greengrocer", "deli", "cheese", "seafood", "pastry")] },
    ] },
    scout: { label: "Restaurant site scout", who: "Restaurateurs: compare addresses before you sign a lease", noun: "restaurant", weights: { transit: 3, offices: 2, students: 1, visitors: 3, restaurant: -1.5, quick: -1, cafe: -0.5, bar: 1, market: 1 } },
    words: { explore: "food restaurant eat dinner lunch brunch cafe coffee foodie street food market", scout: "restaurateur restaurant owner chef open a restaurant cafe owner bakery food truck franchise hospitality" } },
  { id: "retail", label: "Retail", color: "#ff375f", tags: ["retail"], sector: "retail",
    explore: { label: "Shop", who: "Shops near you, and the world's great shopping streets", finds: [
      { id: "mall", label: "Malls and department stores", emoji: "🛍", color: "#ff375f", match: [m("shop", "mall", "department_store")] },
      { id: "grocery", label: "Groceries", emoji: "🛒", color: "#30d158", match: [m("shop", "supermarket", "convenience")] },
      { id: "home", label: "Home and hardware", emoji: "🛋", color: "#ac8e68", match: [m("shop", "furniture", "hardware", "doityourself", "houseware", "interior_decoration")] },
      { id: "electronics", label: "Electronics", emoji: "📱", color: "#64d2ff", match: [m("shop", "electronics", "mobile_phone", "computer")] },
      { id: "books", label: "Books, gifts and toys", emoji: "🎁", color: "#ffd60a", match: [m("shop", "books", "gift", "toys", "stationery")] },
    ] },
    scout: { label: "Store site scout", who: "Retailers: footfall, rivals and draws at each address", noun: "store", weights: { transit: 3, offices: 2, students: 1, visitors: 2, mall: 2, grocery: 1, home: -0.5, electronics: -0.5, books: 0.5 } },
    words: { explore: "shopping shop buy mall store groceries", scout: "retailer retail store owner shop owner merchandiser store opening franchise supermarket chain" } },
  { id: "fashion", label: "Fashion", color: "#ff2d92", tags: ["fashion"], sector: "fashion",
    explore: { label: "Fashion streets", who: "Boutiques, tailors and vintage near you, and the world's fashion streets", finds: [
      { id: "clothes", label: "Boutiques", emoji: "👗", color: "#ff2d92", match: [m("shop", "clothes", "boutique", "fashion")] },
      { id: "shoes", label: "Shoes and bags", emoji: "👠", color: "#bf5af2", match: [m("shop", "shoes", "bag", "leather")] },
      { id: "jewelry", label: "Jewellery and watches", emoji: "💍", color: "#ffd60a", match: [m("shop", "jewelry", "watches")] },
      { id: "tailor", label: "Tailors and alterations", emoji: "🧵", color: "#64d2ff", match: [m("craft", "tailor", "dressmaker"), m("shop", "tailor")] },
      { id: "vintage", label: "Vintage and second-hand", emoji: "🧥", color: "#ac8e68", match: [m("shop", "second_hand", "charity")] },
      { id: "fabric", label: "Fabric and haberdashery", emoji: "🪡", color: "#30d158", match: [m("shop", "fabric", "sewing", "haberdashery")] },
    ] },
    scout: { label: "Boutique site scout", who: "Designers and brands: the right street for a store or showroom", noun: "boutique", cluster: true, weights: { transit: 2, offices: 1, students: 1, visitors: 3, clothes: 1.5, shoes: 1, jewelry: 1, tailor: 0.5, vintage: 0.5, fabric: 0.3 } },
    words: { explore: "fashion clothes style outfit vintage thrift boutique", scout: "designer fashion brand boutique owner stylist showroom label apparel buyer merchandiser" } },
  { id: "art", label: "Art", color: "#bf5af2", tags: ["art"], sector: "art",
    explore: { label: "See art", who: "Museums, galleries and public art near you, and the world's great collections", finds: [
      { id: "museum", label: "Museums", emoji: "🏛", color: "#bf5af2", match: [m("tourism", "museum")] },
      { id: "gallery", label: "Galleries", emoji: "🖼", color: "#ff2d92", match: [m("tourism", "gallery"), m("shop", "art")] },
      { id: "artwork", label: "Public art", emoji: "🗿", color: "#ffd60a", match: [m("tourism", "artwork")] },
      { id: "stage", label: "Theatres and arts centres", emoji: "🎭", color: "#ff6b3d", match: [m("amenity", "theatre", "arts_centre")] },
      { id: "studio", label: "Studios and makers", emoji: "🎨", color: "#30d158", match: [m("craft", "potter", "glassblower", "sculptor", "jeweller", "photographer"), m("amenity", "studio")] },
    ] },
    scout: { label: "Gallery and studio scout", who: "Artists, gallerists and curators: where the scene is", noun: "gallery", cluster: true, weights: { transit: 2, visitors: 3, students: 1, offices: 0.5, museum: 2, gallery: 1.5, stage: 1, artwork: 0.5, studio: 1 } },
    words: { explore: "art museum gallery exhibition painting sculpture culture", scout: "artist gallerist curator gallery owner art dealer studio collector art advisor" } },
  { id: "gaming", label: "Gaming", color: "#30d158", tags: ["gaming"], sector: "gaming",
    explore: { label: "Play", who: "Arcades, game shops, escape rooms and esports near you", finds: [
      { id: "arcade", label: "Arcades", emoji: "🕹", color: "#30d158", match: [m("leisure", "amusement_arcade")] },
      { id: "games", label: "Game shops", emoji: "🎮", color: "#64d2ff", match: [m("shop", "video_games", "games", "anime")] },
      { id: "netcafe", label: "Esports and internet cafés", emoji: "🖥", color: "#bf5af2", match: [m("amenity", "internet_cafe")] },
      { id: "escape", label: "Escape rooms", emoji: "🔐", color: "#ff9f0a", match: [m("leisure", "escape_game")] },
      { id: "bowling", label: "Bowling, cinemas, mini golf", emoji: "🎳", color: "#ff375f", match: [m("leisure", "bowling_alley", "miniature_golf", "trampoline_park"), m("amenity", "cinema")] },
    ] },
    scout: { label: "Venue site scout", who: "Arcade, esports and entertainment operators: where to open", noun: "venue", weights: { transit: 3, students: 3, offices: 0.5, visitors: 1.5, arcade: -1, netcafe: -0.5, escape: -0.3, games: 1, bowling: 0.5 } },
    words: { explore: "games gaming arcade play esports video games board games", scout: "arcade operator esports venue owner game developer studio gaming cafe escape room entertainment center" } },
  { id: "realestate", label: "Real estate", color: "#0a84ff", tags: ["architecture", "retail"], sector: "realestate",
    explore: { label: "The neighbourhood", who: "What's in walking distance of a home: schools, parks, shops, stations", finds: [
      { id: "school", label: "Schools", emoji: "🏫", color: "#ffd60a", match: [m("amenity", "school", "kindergarten")] },
      { id: "park", label: "Parks and playgrounds", emoji: "🌳", color: "#30d158", match: [m("leisure", "park", "playground")] },
      { id: "groceries", label: "Groceries", emoji: "🛒", color: "#ff9f0a", match: [m("shop", "supermarket", "convenience", "greengrocer", "bakery")] },
      { id: "health", label: "Doctors and pharmacies", emoji: "⚕️", color: "#ff375f", match: [m("amenity", "doctors", "clinic", "pharmacy", "hospital", "dentist")] },
      { id: "station", label: "Stations", emoji: "🚉", color: "#64d2ff", match: [m("railway", "station", "halt", "subway_entrance", "tram_stop"), m("public_transport", "station")] },
      { id: "eat", label: "Cafés and restaurants", emoji: "☕", color: "#c08552", match: [m("amenity", "cafe", "restaurant")] },
    ] },
    scout: { label: "Property compare", who: "Agents, investors and developers: how each address lives day to day", noun: "property", weights: { school: 2, park: 2, groceries: 2, health: 1.5, station: 3, eat: 1, transit: 1, offices: 0.5 } },
    words: { explore: "home house apartment rent buy move neighbourhood flat", scout: "real estate agent realtor broker investor developer landlord property manager estate agent leasing" } },
  { id: "architecture", label: "Architecture", color: "#ffd60a", tags: ["architecture"], sector: "architecture",
    explore: { label: "Buildings worth seeing", who: "Listed buildings, towers and bridges near you, and the world's great buildings", finds: [
      { id: "heritage", label: "Listed and historic", emoji: "🏛", color: "#ffd60a", match: [m("heritage"), m("historic", "building", "castle", "monument", "manor")] },
      { id: "worship", label: "Cathedrals, temples, mosques", emoji: "⛪", color: "#bf5af2", match: [m("amenity", "place_of_worship")] },
      { id: "tower", label: "Towers", emoji: "🗼", color: "#64d2ff", match: [m("building", "skyscraper"), m("man_made", "tower")] },
      { id: "bridge", label: "Bridges", emoji: "🌉", color: "#ff9f0a", match: [m("man_made", "bridge")] },
      { id: "civic", label: "Town halls and libraries", emoji: "🏤", color: "#30d158", match: [m("amenity", "townhall", "library", "courthouse")] },
    ] },
    scout: { label: "Site context study", who: "Architects and planners: what surrounds a site before you draw", noun: "site", cluster: true, weights: { heritage: 1.5, worship: 0.5, tower: 1, bridge: 0.3, civic: 1, transit: 2, offices: 1, visitors: 1 } },
    words: { explore: "architecture buildings design landmarks historic", scout: "architect planner urban designer surveyor heritage consultant landscape architect engineer" } },
  { id: "tech", label: "Tech", color: "#64d2ff", tags: ["tech"], sector: "tech",
    explore: { label: "Tech around you", who: "Electronics shops, coworking, makerspaces and campuses, and where tech was born", finds: [
      { id: "electronics", label: "Electronics and repairs", emoji: "📱", color: "#64d2ff", match: [m("shop", "electronics", "mobile_phone", "computer"), m("craft", "electronics_repair")] },
      { id: "cowork", label: "Coworking", emoji: "💻", color: "#30d158", match: [m("amenity", "coworking_space"), m("office", "coworking")] },
      { id: "techoffice", label: "Tech companies", emoji: "🏢", color: "#0a84ff", match: [m("office", "it", "telecommunication", "research")] },
      { id: "maker", label: "Makerspaces and labs", emoji: "🔧", color: "#ff9f0a", match: [m("leisure", "hackerspace")] },
      { id: "campus", label: "Universities", emoji: "🎓", color: "#ffd60a", match: [m("amenity", "university")] },
    ] },
    scout: { label: "Office and lab scout", who: "Founders and ops: talent, transit and the cluster around an address", noun: "office", cluster: true, weights: { transit: 3, offices: 1, students: 1, visitors: 0.5, techoffice: 1.5, cowork: 1, campus: 2, maker: 1, electronics: 0.3 } },
    words: { explore: "tech gadgets computers electronics coding", scout: "founder startup software engineer cto tech company office manager it lab hardware" } },
  { id: "sport", label: "Sport", color: "#bf5af2", tags: ["sport", "stadium"],
    explore: { label: "Stadiums and games", who: "Grounds, pitches, gyms and pools near you, and the world's great stadiums", finds: [
      { id: "stadium", label: "Stadiums", emoji: "🏟", color: "#bf5af2", match: [m("leisure", "stadium")] },
      { id: "pitch", label: "Pitches and courts", emoji: "⚽", color: "#30d158", match: [m("leisure", "pitch")] },
      { id: "gym", label: "Gyms and sports centres", emoji: "🏋", color: "#ff9f0a", match: [m("leisure", "fitness_centre", "sports_centre")] },
      { id: "pool", label: "Pools", emoji: "🏊", color: "#64d2ff", match: [m("leisure", "swimming_pool", "water_park")] },
      { id: "sportshop", label: "Sports shops", emoji: "👟", color: "#ff375f", match: [m("shop", "sports", "outdoor", "bicycle")] },
    ] },
    scout: { label: "Gym and club scout", who: "Gyms, studios and clubs: where members will come from", noun: "gym", weights: { transit: 2, offices: 2, students: 2, visitors: 0.5, gym: -1.5, pitch: 0.5, pool: 0.5, stadium: 0.5, sportshop: 0.5 } },
    words: { explore: "sport game match stadium tickets fan gym run swim", scout: "gym owner fitness studio personal trainer yoga studio club owner climbing gym" } },
];

export const industry = (id: string) => INDUSTRIES.find((i) => i.id === id);
/** Every kind an industry counts: its own finds, then the shared draws. */
export const kindsOf = (ind: Industry): Find[] => [...ind.explore.finds, ...DRAWS];

/** OSM tags to the first kind they match, or null (pure). */
export function classify(tags: Record<string, string>, kinds: Find[]): Find | null {
  for (const f of kinds) for (const x of f.match) { const v = tags[x.k]; if (v !== undefined && (!x.v.length || x.v.includes(v))) return f; }
  return null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&");
/** The Overpass selectors for some kinds (pure). */
export function selectors(kinds: Find[]): string[] {
  return kinds.flatMap((f) => f.match.map((x) => (x.v.length ? `nwr["${x.k}"~"^(${x.v.map(esc).join("|")})$"]` : `nwr["${x.k}"]`)));
}
/** A query for these kinds inside a box (s,w,n,e) or around a point (pure). */
export function query(kinds: Find[], area: { bbox: string } | { lon: number; lat: number; m: number }, limit = 2500): string {
  const where = "bbox" in area ? `(${area.bbox})` : `(around:${Math.round(area.m)},${area.lat.toFixed(5)},${area.lon.toFixed(5)})`;
  return `[out:json][timeout:40];(${selectors(kinds).map((s) => `${s}${where};`).join("")});out center tags ${limit};`;
}

export interface Poi { id: string; name: string; lon: number; lat: number; kind: string; tags: Record<string, string> }

/** Elements to places of known kinds, named or not (pure). */
export function toPois(els: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[], kinds: Find[]): Poi[] {
  const out: Poi[] = [];
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, tags = e.tags ?? {};
    const k = classify(tags, kinds);
    if (lat === undefined || lon === undefined || !k) continue;
    out.push({ id: `${e.type}${e.id}`, name: tags.name ?? tags.brand ?? k.label.replace(/s$/, ""), lon, lat, kind: k.id, tags });
  }
  return out;
}

/** Metres between two points (equirectangular; fine within a city; pure). */
export function metres(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot((a.lon - b.lon) * 111_320 * k, (a.lat - b.lat) * 110_540);
}

/** A walk: about seven minutes. */
export const WALK = 600;

export interface SiteScore {
  score: number;
  counts: Record<string, number>;
  /** The nearest place of the kind you'd open, metres. */
  nearest: number | null;
  rivals: number;
  lines: string[];
}

/**
 * How good an address is for an industry (0–100; pure): each kind within a
 * walk counts with its weight, with diminishing returns (log), so ten cafés
 * aren't ten times one. `as` is the kind you'd open: in a cluster industry
 * more of them help; otherwise they're rivals.
 */
export function scoreSite(ind: Industry, at: { lon: number; lat: number }, pois: Poi[], as?: string, r = WALK): SiteScore {
  const near = pois.filter((p) => metres(at, p) <= r);
  const counts: Record<string, number> = {};
  for (const p of near) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  const w = { ...ind.scout.weights };
  if (as) w[as] = ind.scout.cluster ? Math.max(1, w[as] ?? 1) : Math.min(-1.5, w[as] ?? -1.5);
  let raw = 0;
  for (const [k, n] of Object.entries(counts)) raw += (w[k] ?? 0) * Math.log2(1 + n);
  // Even, then up or down with what's near, flattening towards the ends.
  const s = 50 + 50 * Math.tanh(raw / 25);
  const mine = as ? pois.filter((p) => p.kind === as) : [];
  const nearest = mine.length ? Math.min(...mine.map((p) => metres(at, p))) : null;
  const rivals = as ? counts[as] ?? 0 : 0;
  const kinds = kindsOf(ind), name = (k: string) => kinds.find((f) => f.id === k)?.label.toLowerCase() ?? k;
  const drawn = Object.entries(counts).filter(([k]) => (w[k] ?? 0) > 0 && k !== as).sort((a, b) => (w[b[0]] ?? 0) * Math.log2(1 + b[1]) - (w[a[0]] ?? 0) * Math.log2(1 + a[1]));
  const lines = [
    as ? (rivals ? `${rivals} ${name(as)} within a ${Math.max(1, Math.round(r / 85))}-minute walk${nearest !== null ? `, the nearest ${Math.round(nearest)} m away` : ""}: ${ind.scout.cluster ? "a scene people already come to." : rivals >= 6 ? "crowded; you'd need to stand out." : "some company, not crowded."}` : `No other ${name(as)} within a walk: ${ind.scout.cluster ? "you'd have to bring people here yourself." : "a gap, if the people are there."}`) : "",
    drawn.length ? `What brings people: ${drawn.slice(0, 4).map(([k, n]) => `${n} ${name(k)}`).join(", ")}.` : "Little nearby brings people past.",
    !counts.transit && !counts.station ? "No station or stop within a walk." : "",
  ].filter(Boolean);
  return { score: Math.round(Math.max(0, Math.min(100, s))), counts, nearest, rivals, lines };
}

/** The places of the kinds shown, nearest a point first (pure). */
export function nearestFirst(pois: Poi[], at: { lon: number; lat: number }, kinds?: Set<string>): (Poi & { m: number })[] {
  return pois.filter((p) => !kinds || kinds.has(p.kind)).map((p) => ({ ...p, m: metres(at, p) })).sort((a, b) => a.m - b.m);
}
