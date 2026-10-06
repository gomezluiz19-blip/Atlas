// What a venue's card needs beyond what it is: whether it's open now, its street address, what's nearby by
// kind, photos and videos taken around it, and links out for directions. Pure: no DOM, no network.

type Spot = { lon: number; lat: number };

// ---- Open now ----------------------------------------------------------------------------------------

const DAY_IDS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const toMin = (hhmm: string) => { const [hh, mm] = hhmm.split(":").map(Number); return hh * 60 + mm; };
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export interface OpenState { open: boolean; /** "Closes 15:30", "Opens 08:00", "Opens Mon 08:00". */ next: string }

/** The days a rule covers ("Mo-Fr", "Sa,Su", "Mo-We,Fr"), as 0–6 with Sunday 0; null if it isn't a day list. */
function daysOf(spec: string): number[] | null {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!m) return null;
    const a = DAY_IDS.indexOf(m[1]), b = m[2] ? DAY_IDS.indexOf(m[2]) : a;
    for (let d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b) break; }
  }
  return out;
}

/**
 * Whether a place is open at a given time, from its opening_hours (pure). Handles the common forms
 * ("24/7", "Mo-Fr 08:00-15:30; Sa 09:00-12:00", "Mo,We 10:00-12:00,13:00-17:00", "Su off", a bare
 * "08:00-20:00"); returns null for anything subtler (holidays, months, sunrise) rather than guessing.
 */
export function openNow(oh: string, at: Date): OpenState | null {
  const s = oh.trim();
  if (s === "24/7") return { open: true, next: "Open 24 hours" };
  // Each day's spans, in minutes since midnight.
  const week: [number, number][][] = Array.from({ length: 7 }, () => []);
  for (const rule of s.split(";").map((r) => r.trim()).filter(Boolean)) {
    const m = /^(?:([A-Za-z,\- ]+?)\s+)?(off|closed|(?:\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:\s*,\s*)?)+)$/.exec(rule);
    if (!m) return null;
    const days = m[1] ? daysOf(m[1].replace(/\s/g, "")) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return null;
    const spans = /off|closed/.test(m[2]) ? [] : m[2].split(",").map((x) => x.trim().split("-").map(toMin) as [number, number]);
    // A later rule for a day replaces an earlier one, as the format says.
    for (const d of days) week[d] = spans;
  }
  const day = at.getDay(), now = at.getHours() * 60 + at.getMinutes();
  // Still open from a span that ran past midnight yesterday.
  for (const [a, b] of week[(day + 6) % 7]) if (b < a && now < b) return { open: true, next: `Closes ${clock(b)}` };
  for (const [a, b] of week[day]) {
    const end = b <= a ? b + 1440 : b;
    if (now >= a && now < end) return { open: true, next: `Closes ${clock(b)}` };
  }
  const later = week[day].map(([a]) => a).filter((a) => a > now).sort((x, y) => x - y)[0];
  if (later !== undefined) return { open: false, next: `Opens ${clock(later)}` };
  for (let k = 1; k <= 7; k++) {
    const d = (day + k) % 7, first = week[d].map(([a]) => a).sort((x, y) => x - y)[0];
    if (first !== undefined) return { open: false, next: `Opens ${k === 1 ? "tomorrow" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]} ${clock(first)}` };
  }
  return { open: false, next: "Closed" };
}

// ---- Address -----------------------------------------------------------------------------------------

/** A street address from the map's address parts ("2290 Albany Post Rd, Buchanan, NY 10511") (pure). */
export function addressLine(a: Record<string, string> | null | undefined): string {
  if (!a) return "";
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway].filter(Boolean).join(" ");
  const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.municipality ?? "";
  const state = a["ISO3166-2-lvl4"]?.split("-")[1] ?? a.state ?? "";
  const tail = [state, a.postcode].filter(Boolean).join(" ");
  return [street, town, tail].filter(Boolean).join(", ");
}

// ---- Nearby ------------------------------------------------------------------------------------------

export type NearbyId = "food" | "coffee" | "groceries" | "parks" | "transit" | "schools" | "health" | "fuel";
export interface NearbyKind { id: NearbyId; label: string; /** OpenStreetMap key=value|value… pairs. */ osm: string[] }

export const NEARBY: NearbyKind[] = [
  { id: "food", label: "Restaurants", osm: ["amenity=restaurant|fast_food|food_court"] },
  { id: "coffee", label: "Coffee", osm: ["amenity=cafe"] },
  { id: "groceries", label: "Groceries", osm: ["shop=supermarket|convenience|greengrocer|bakery"] },
  { id: "parks", label: "Parks & rec", osm: ["leisure=park|playground|sports_centre|pitch|swimming_pool|nature_reserve|dog_park"] },
  { id: "transit", label: "Transit", osm: ["highway=bus_stop", "railway=station|halt|tram_stop", "public_transport=station"] },
  { id: "schools", label: "Schools", osm: ["amenity=school|kindergarten|college|university|library"] },
  { id: "health", label: "Health", osm: ["amenity=pharmacy|clinic|doctors|hospital|dentist"] },
  { id: "fuel", label: "Gas", osm: ["amenity=fuel|charging_station"] },
];

/** The Overpass query for one kind of place around a spot (pure). */
export function nearbyQuery(c: Spot, kind: NearbyKind, radiusM: number): string {
  const parts = kind.osm.map((sel) => {
    const [k, v] = sel.split("=");
    return `nwr(around:${Math.round(radiusM)},${c.lat.toFixed(5)},${c.lon.toFixed(5)})["${k}"~"^(${v})$"]["name"];`;
  });
  return `[out:json][timeout:20];(${parts.join("")});out center tags 80;`;
}

interface El { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

export interface NearbyPlace extends Spot { name: string; key: string; value: string; osm: string; km: number; tags: Record<string, string> }

const kmBetween = (a: Spot, b: Spot) => {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/** Named places from an Overpass answer, nearest first, without the venue itself or repeats (pure). */
export function nearbyFrom(els: El[], kind: NearbyKind, from: Spot, selfName = ""): NearbyPlace[] {
  const keys = kind.osm.map((s) => s.split("=")[0]);
  const seen = new Set<string>();
  const self = selfName.trim().toLowerCase();
  const out: NearbyPlace[] = [];
  for (const e of els) {
    const t = e.tags ?? {}, p = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
    if (!p || !t.name) continue;
    const key = keys.find((k) => t[k]);
    if (!key) continue;
    const name = t.name.trim(), dup = name.toLowerCase();
    if (dup === self || seen.has(dup)) continue;
    seen.add(dup);
    out.push({ name, key, value: t[key], osm: `${e.type[0].toUpperCase()}${e.id}`, lon: p.lon, lat: p.lat, km: kmBetween(from, p), tags: t });
  }
  return out.sort((a, b) => a.km - b.km);
}

// ---- Photos and videos -------------------------------------------------------------------------------

export interface Media { title: string; thumb: string; full: string; page: string; video: boolean; by: string; km: number }

/** Wikimedia Commons files within a radius of a spot, with thumbnails (a keyless, open API) (pure). */
export function commonsNearUrl(c: Spot, radiusM = 800, limit = 30): string {
  const q = new URLSearchParams({
    action: "query", format: "json", origin: "*", generator: "geosearch", ggsnamespace: "6",
    ggscoord: `${c.lat.toFixed(5)}|${c.lon.toFixed(5)}`, ggsradius: String(Math.min(10_000, Math.round(radiusM))), ggslimit: String(limit),
    prop: "imageinfo|coordinates", iiprop: "url|mime|extmetadata", iiurlwidth: "480", iiextmetadatafilter: "Artist|ObjectName",
  });
  return `https://commons.wikimedia.org/w/api.php?${q}`;
}

interface CommonsPage { title: string; coordinates?: { lat: number; lon: number }[]; imageinfo?: { url: string; thumburl?: string; descriptionurl: string; mime: string; extmetadata?: Record<string, { value: string }> }[] }
export interface CommonsResponse { query?: { pages?: Record<string, CommonsPage> } }

const plain = (html = "") => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Photos and videos from a Commons answer, nearest first, without maps, logos, diagrams or documents (pure). */
export function mediaFrom(r: CommonsResponse, from: Spot): Media[] {
  const out: Media[] = [];
  for (const p of Object.values(r.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const video = /^video\//.test(ii.mime) || /\.(webm|ogv)$/i.test(ii.url);
    if (!video && !/^image\/(jpeg|png|webp)$/.test(ii.mime)) continue;
    const name = p.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
    if (/\b(map|logo|diagram|plan|chart|locator|seal|flag|coat of arms|signature)\b/i.test(name)) continue;
    const at = p.coordinates?.[0];
    out.push({
      title: plain(ii.extmetadata?.ObjectName?.value) || name.replace(/_/g, " "),
      thumb: ii.thumburl ?? ii.url, full: ii.url, page: ii.descriptionurl, video,
      by: plain(ii.extmetadata?.Artist?.value).slice(0, 60),
      km: at ? kmBetween(from, at) : Infinity,
    });
  }
  return out.sort((a, b) => a.km - b.km);
}

// ---- Links out ---------------------------------------------------------------------------------------

export type TravelMode = "walk" | "bike" | "drive" | "transit";
const GMODE: Record<TravelMode, string> = { walk: "walking", bike: "bicycling", drive: "driving", transit: "transit" };

/** Directions in Google Maps (pure). */
export const googleDirections = (to: Spot, mode: TravelMode = "drive") =>
  `https://www.google.com/maps/dir/?api=1&destination=${to.lat.toFixed(6)},${to.lon.toFixed(6)}&travelmode=${GMODE[mode]}`;

/** Directions in Apple Maps (pure). */
export const appleDirections = (to: Spot, name: string, mode: TravelMode = "drive") =>
  `https://maps.apple.com/?daddr=${to.lat.toFixed(6)},${to.lon.toFixed(6)}&q=${encodeURIComponent(name)}&dirflg=${mode === "walk" ? "w" : mode === "transit" ? "r" : "d"}`;

/** Street-level imagery at a spot in Google Street View (pure). */
export const streetView = (at: Spot) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${at.lat.toFixed(6)},${at.lon.toFixed(6)}`;
