// What's on the streets around a place, from OpenStreetMap, read once and
// shared by every topic: shops and markets (Money & trade), boutiques
// (Fashion), restaurants and cafés (Food), pitches and gyms (Sports),
// theatres, venues and galleries (Arts & music), hotels and sights
// (Tourism), schools and universities (Education), hospitals, clinics and
// pharmacies (Health).
import { elementPoint, overpass, type OsmElement } from "../data/overpass";

export type Topic = "money" | "fashion" | "food" | "sports" | "arts" | "tourism" | "education" | "health";

export interface Spot {
  id: string;
  name?: string;
  lon: number;
  lat: number;
  topic: Topic;
  /** What it is, in words ("Clothes shop", "Football pitch"). */
  kind: string;
  tags: Record<string, string>;
}

export interface Street {
  spots: Spot[];
  /** How far around the place was read, in metres. */
  radius: number;
}

const FASHION: Record<string, string> = {
  clothes: "Clothes shop", boutique: "Boutique", fashion: "Fashion shop", shoes: "Shoe shop", fashion_accessories: "Accessories",
  jewelry: "Jeweller", bag: "Bags", tailor: "Tailor", fabric: "Fabric shop", watches: "Watches", leather: "Leather goods", second_hand: "Second-hand",
};
const FOOD_AMENITY: Record<string, string> = {
  restaurant: "Restaurant", cafe: "Café", fast_food: "Fast food", bar: "Bar", pub: "Pub", ice_cream: "Ice cream", food_court: "Food court", biergarten: "Beer garden",
};
const FOOD_SHOP: Record<string, string> = {
  bakery: "Bakery", butcher: "Butcher", greengrocer: "Greengrocer", deli: "Deli", cheese: "Cheese shop", seafood: "Fishmonger",
  confectionery: "Sweet shop", pastry: "Pastry shop", wine: "Wine shop", coffee: "Coffee shop", tea: "Tea shop", spices: "Spice shop", beverages: "Drinks shop",
};
const SPORTS: Record<string, string> = {
  pitch: "Pitch", sports_centre: "Sports centre", stadium: "Stadium", fitness_centre: "Gym", swimming_pool: "Swimming pool",
  golf_course: "Golf course", track: "Running track", ice_rink: "Ice rink", sports_hall: "Sports hall",
};
const ARTS: Record<string, string> = {
  theatre: "Theatre", arts_centre: "Arts centre", cinema: "Cinema", music_venue: "Music venue", nightclub: "Nightclub",
  museum: "Museum", gallery: "Gallery", music: "Music shop", musical_instrument: "Instruments", art: "Art shop", craft: "Craft shop",
};
const MONEY_AMENITY: Record<string, string> = { marketplace: "Market", bank: "Bank", atm: "Cash machine", bureau_de_change: "Money exchange", money_transfer: "Money transfer" };
const MONEY_SHOP: Record<string, string> = {
  mall: "Shopping centre", department_store: "Department store", supermarket: "Supermarket", convenience: "Corner shop", general: "General store",
  variety_store: "Variety store", wholesale: "Wholesale", electronics: "Electronics", mobile_phone: "Phones", hardware: "Hardware", doityourself: "DIY",
  furniture: "Furniture", chemist: "Chemist", pharmacy: "Pharmacy", books: "Books", car: "Car dealer", kiosk: "Kiosk", gift: "Gifts", beauty: "Beauty",
  hairdresser: "Hairdresser", cosmetics: "Cosmetics", optician: "Optician", toys: "Toys", pawnbroker: "Pawnbroker",
};
const STAYS: Record<string, string> = {
  hotel: "Hotel", guest_house: "Guest house", hostel: "Hostel", motel: "Motel", apartment: "Holiday flat", camp_site: "Campsite", chalet: "Chalet",
  attraction: "Sight", viewpoint: "Viewpoint", theme_park: "Theme park", zoo: "Zoo", aquarium: "Aquarium",
};
const SCHOOLS: Record<string, string> = {
  kindergarten: "Nursery", school: "School", college: "College", university: "University", library: "Library",
  language_school: "Language school", music_school: "Music school", driving_school: "Driving school",
};
const HEALTH: Record<string, string> = { hospital: "Hospital", clinic: "Clinic", doctors: "Doctor", dentist: "Dentist", pharmacy: "Pharmacy" };
const tidy = (v: string) => (v.charAt(0).toUpperCase() + v.slice(1)).replace(/_/g, " ");

/** Which topic an OpenStreetMap feature belongs to, and what to call it. */
export function classify(t: Record<string, string>): { topic: Topic; kind: string } | null {
  const { shop, amenity, leisure, tourism } = t;
  if (amenity && HEALTH[amenity]) return { topic: "health", kind: HEALTH[amenity] };
  if (amenity && SCHOOLS[amenity]) return { topic: "education", kind: SCHOOLS[amenity] };
  if (tourism && STAYS[tourism]) return { topic: "tourism", kind: STAYS[tourism] };
  if (shop && FASHION[shop]) return { topic: "fashion", kind: FASHION[shop] };
  if (amenity && FOOD_AMENITY[amenity]) return { topic: "food", kind: FOOD_AMENITY[amenity] };
  if (shop && FOOD_SHOP[shop]) return { topic: "food", kind: FOOD_SHOP[shop] };
  if (leisure && SPORTS[leisure]) return { topic: "sports", kind: leisure === "pitch" && t.sport ? `${sportName(t.sport.split(";")[0])} pitch` : SPORTS[leisure] };
  if (shop === "sports") return { topic: "sports", kind: "Sports shop" };
  const art = amenity && ARTS[amenity] ? ARTS[amenity] : tourism && ARTS[tourism] ? ARTS[tourism] : shop && ARTS[shop] ? ARTS[shop] : null;
  if (art) return { topic: "arts", kind: art };
  if (amenity && MONEY_AMENITY[amenity]) return { topic: "money", kind: MONEY_AMENITY[amenity] };
  if (shop) return { topic: "money", kind: MONEY_SHOP[shop] ?? (shop === "yes" ? "Shop" : tidy(shop)) };
  return null;
}

const SPORT_NAMES: Record<string, string> = {
  soccer: "Football", american_football: "American football", basketball: "Basketball", baseball: "Baseball", softball: "Softball", tennis: "Tennis",
  volleyball: "Volleyball", beachvolleyball: "Beach volleyball", cricket: "Cricket", rugby_union: "Rugby", rugby_league: "Rugby league", rugby: "Rugby",
  golf: "Golf", swimming: "Swimming", athletics: "Athletics", running: "Running", hockey: "Hockey", field_hockey: "Hockey", ice_hockey: "Ice hockey",
  handball: "Handball", table_tennis: "Table tennis", padel: "Padel", pickleball: "Pickleball", badminton: "Badminton", boules: "Boules", petanque: "Pétanque",
  equestrian: "Riding", skateboard: "Skating", multi: "Multi-sport", gaelic_games: "Gaelic games", australian_football: "Aussie rules", netball: "Netball",
  fitness: "Fitness", boxing: "Boxing", climbing: "Climbing", cycling: "Cycling", motor: "Motor sport", horse_racing: "Horse racing", shooting: "Shooting",
};
export const sportName = (s: string) => SPORT_NAMES[s] ?? tidy(s);

/** Counts things by a label, most common first. */
export function tally(labels: (string | undefined)[], top = 8): { label: string; n: number }[] {
  const m = new Map<string, number>();
  for (const l of labels) if (l) m.set(l, (m.get(l) ?? 0) + 1);
  return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, top);
}

/** The cuisines a place's restaurants serve ("pizza;italian" counts for both). */
export const cuisines = (spots: Spot[]) => tally(spots.flatMap((s) => (s.tags.cuisine ?? "").split(/[;,]/).map((c) => c.trim()).filter(Boolean).map(tidy)), 10);
/** The sports played on the pitches and in the halls around. */
export const sportsPlayed = (spots: Spot[]) => tally(spots.flatMap((s) => (s.tags.sport ?? "").split(";").filter(Boolean).map(sportName)), 10);

export function toSpots(els: OsmElement[]): Spot[] {
  const out: Spot[] = [];
  for (const e of els) {
    const c = e.tags && classify(e.tags);
    const pt = elementPoint(e);
    if (!c || !pt) continue;
    out.push({ id: `${e.type}/${e.id}`, name: e.tags!.name, lon: pt[0], lat: pt[1], ...c, tags: e.tags! });
  }
  return out;
}

const query = (lon: number, lat: number, r: number) => {
  const a = `(around:${r},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:25];
(
  nwr${a}[shop];
  nwr${a}[amenity~"^(${[...Object.keys(FOOD_AMENITY), ...Object.keys(MONEY_AMENITY), "theatre", "arts_centre", "cinema", "music_venue", "nightclub", ...Object.keys(SCHOOLS), ...Object.keys(HEALTH)].join("|")})$"];
  nwr${a}[leisure~"^(${Object.keys(SPORTS).join("|")})$"];
  nwr${a}[tourism~"^(museum|gallery|${Object.keys(STAYS).join("|")})$"];
);
out center tags 6000;`;
};

const cache = new Map<string, Promise<Street>>();
/** Everything around a place (1.5 km in towns; wider in the countryside, where there's less). */
export function streetAround(lon: number, lat: number): Promise<Street> {
  const key = `${lon.toFixed(3)},${lat.toFixed(3)}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const near = toSpots(await overpass(query(lon, lat, 1500)));
      if (near.length >= 25) return { spots: near, radius: 1500 };
      const wide = toSpots(await overpass(query(lon, lat, 8000)));
      return wide.length > near.length ? { spots: wide, radius: 8000 } : { spots: near, radius: 1500 };
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Hospitals within 30 km, for "the nearest hospital" when there's none on the streets around. */
export async function hospitalsAround(lon: number, lat: number): Promise<Spot[]> {
  return toSpots(await overpass(`[out:json][timeout:25];
nwr(around:30000,${lat.toFixed(4)},${lon.toFixed(4)})["amenity"="hospital"];
out center tags 300;`));
}

/** Kilometres between two points (near enough for a town or a region). */
export function kmBetween(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6371;
}

/** "within 1.5 km" / "within 8 km" */
export const within = (r: number) => `within ${r >= 1000 ? `${+(r / 1000).toFixed(1)} km` : `${r} m`}`;
