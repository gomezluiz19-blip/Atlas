// Data for Learn: flags for the capital cities, famous museums with free or
// cheaper entry, and the kinds of places to learn found on OpenStreetMap.
import { CAPITALS } from "./gameData";

/** ISO 3166 alpha-2 codes for the countries in CAPITALS (by capital name). */
const ISO: Record<string, string> = {
  London: "GB", Paris: "FR", Madrid: "ES", Lisbon: "PT", Rome: "IT", Berlin: "DE", Warsaw: "PL", Stockholm: "SE", Oslo: "NO", Helsinki: "FI",
  Athens: "GR", Ankara: "TR", Moscow: "RU", Kyiv: "UA", Cairo: "EG", Nairobi: "KE", "Addis Ababa": "ET", Abuja: "NG", Accra: "GH", Dakar: "SN",
  Pretoria: "ZA", Kinshasa: "CD", Rabat: "MA", Riyadh: "SA", Tehran: "IR", "New Delhi": "IN", Islamabad: "PK", Dhaka: "BD", Beijing: "CN",
  Tokyo: "JP", Seoul: "KR", Bangkok: "TH", Hanoi: "VN", Jakarta: "ID", Manila: "PH", Canberra: "AU", Wellington: "NZ", Ottawa: "CA",
  "Washington, D.C.": "US", "Mexico City": "MX", Havana: "CU", "Santo Domingo": "DO", Bogotá: "CO", Lima: "PE", Quito: "EC", Brasília: "BR",
  "Buenos Aires": "AR", Santiago: "CL", Caracas: "VE", Reykjavík: "IS",
};

/** The flag emoji for a two-letter country code. */
export const flag = (iso2: string) => String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

export const FLAG_COUNTRIES = CAPITALS.filter((c) => ISO[c.name]).map((c) => ({
  country: c.hint.replace(/^capital of (the )?/, ""),
  the: /^capital of the /.test(c.hint),
  capital: c.name, iso: ISO[c.name], lon: c.lon, lat: c.lat,
}));

export interface FreeMuseum { name: string; city: string; lat: number; lon: number; deal: string; kind: string }

/** Famous museums that are free, or free for young people and students. Prices change: check before going. */
export const FREE_MUSEUMS: FreeMuseum[] = [
  { name: "British Museum", city: "London", lat: 51.5194, lon: -0.127, deal: "Free for everyone (some exhibitions charge)", kind: "History" },
  { name: "Natural History Museum", city: "London", lat: 51.4967, lon: -0.1764, deal: "Free for everyone", kind: "Nature" },
  { name: "Science Museum", city: "London", lat: 51.4978, lon: -0.1745, deal: "Free for everyone", kind: "Science" },
  { name: "National Gallery", city: "London", lat: 51.5089, lon: -0.1283, deal: "Free for everyone", kind: "Art" },
  { name: "Tate Modern", city: "London", lat: 51.5076, lon: -0.0994, deal: "Free (some exhibitions charge)", kind: "Art" },
  { name: "National Museum of Scotland", city: "Edinburgh", lat: 55.9469, lon: -3.1893, deal: "Free for everyone", kind: "History" },
  { name: "National Air and Space Museum", city: "Washington, D.C.", lat: 38.8882, lon: -77.0199, deal: "Free (timed-entry passes may be needed)", kind: "Science" },
  { name: "National Museum of Natural History", city: "Washington, D.C.", lat: 38.8913, lon: -77.0261, deal: "Free for everyone", kind: "Nature" },
  { name: "National Gallery of Art", city: "Washington, D.C.", lat: 38.8913, lon: -77.02, deal: "Free for everyone", kind: "Art" },
  { name: "Getty Center", city: "Los Angeles", lat: 34.078, lon: -118.4741, deal: "Free entry (parking is paid)", kind: "Art" },
  { name: "Griffith Observatory", city: "Los Angeles", lat: 34.1184, lon: -118.3004, deal: "Free entry (planetarium shows are paid)", kind: "Space" },
  { name: "Museo Soumaya", city: "Mexico City", lat: 19.4406, lon: -99.2047, deal: "Free for everyone", kind: "Art" },
  { name: "The Met", city: "New York", lat: 40.7794, lon: -73.9632, deal: "Pay what you wish for New York State residents and NY, NJ and CT students", kind: "Art" },
  { name: "American Museum of Natural History", city: "New York", lat: 40.7813, lon: -73.974, deal: "Pay what you wish for NY, NJ and CT residents", kind: "Nature" },
  { name: "Louvre", city: "Paris", lat: 48.8606, lon: 2.3376, deal: "Free under 18, and for EU residents under 26", kind: "Art" },
  { name: "Musée d'Orsay", city: "Paris", lat: 48.86, lon: 2.3266, deal: "Free under 18, and for EU residents under 26", kind: "Art" },
  { name: "Museo del Prado", city: "Madrid", lat: 40.4138, lon: -3.6921, deal: "Free in the last two hours most days; free for many students", kind: "Art" },
  { name: "Rijksmuseum", city: "Amsterdam", lat: 52.36, lon: 4.8852, deal: "Free under 18", kind: "Art" },
  { name: "Vatican Museums", city: "Vatican City", lat: 41.9065, lon: 12.4536, deal: "Free on the last Sunday of the month; reduced for students", kind: "Art" },
  { name: "National Museum of Australia", city: "Canberra", lat: -35.2931, lon: 149.1206, deal: "Free general admission", kind: "History" },
  { name: "Australian War Memorial", city: "Canberra", lat: -35.2809, lon: 149.1488, deal: "Free for everyone", kind: "History" },
];

export type LearnKind = "museum" | "science" | "art" | "history" | "nature" | "library";

export const KINDS: Record<LearnKind, { label: string; emoji: string; color: string }> = {
  museum: { label: "Museums", emoji: "🏛️", color: "#8b5fa8" },
  science: { label: "Science and space", emoji: "🔭", color: "#3563d6" },
  art: { label: "Art", emoji: "🎨", color: "#b8496a" },
  history: { label: "History", emoji: "🏰", color: "#9a7552" },
  nature: { label: "Zoos, aquariums, gardens", emoji: "🦁", color: "#5b9467" },
  library: { label: "Libraries", emoji: "📚", color: "#d19a2e" },
};

/** Sorts an OpenStreetMap feature into a kind of place to learn. */
export function kindOf(t: Record<string, string>): LearnKind | null {
  const m = t.museum ?? "";
  if (t.amenity === "library") return "library";
  if (t.amenity === "planetarium" || /science|technology|space|aviation|railway|transport/.test(m)) return "science";
  if (t.tourism === "zoo" || t.tourism === "aquarium" || t["garden:type"] === "botanical" || /natural_history|nature/.test(m)) return "nature";
  if (t.tourism === "gallery" || t.amenity === "arts_centre" || /art/.test(m)) return "art";
  if (t.historic || /history|archaeolog|military|local/.test(m)) return "history";
  if (t.tourism === "museum") return "museum";
  return null;
}

/** What OpenStreetMap says about the price: free, paid, or unknown. */
export function priceOf(t: Record<string, string>): "free" | "paid" | "unknown" {
  if (t.fee === "no" || t.fee === "free") return "free";
  if (t.fee === "yes" || t.charge) return "paid";
  if (t.amenity === "library") return "free";
  return "unknown";
}

export const overpassQuery = (lat: number, lon: number, r = 15000) => `[out:json][timeout:25];
(
  nwr(around:${r},${lat},${lon})[tourism=museum];
  nwr(around:${r},${lat},${lon})[amenity=library][name];
  nwr(around:${r},${lat},${lon})[tourism~"^(zoo|aquarium|gallery)$"];
  nwr(around:${r},${lat},${lon})[amenity~"^(planetarium|arts_centre)$"];
  nwr(around:${r},${lat},${lon})[leisure=garden]["garden:type"=botanical];
  nwr(around:${r},${lat},${lon})[historic~"^(castle|fort|archaeological_site|ruins|monument)$"][name];
);
out center tags 400;`;
