// A venue: a place people go to (a school, a shop, a clinic, a station, a house), as opposed to a landform
// or a region. Search tells us which from the map's own category ("amenity=school"); a tapped label from its
// kind. A venue's card leads with what people want from it (what it is, its hours, how long it takes to get
// there) instead of the planet's views of it, which suit mountains and coasts, not an elementary school.
// Pure: no DOM, no network.

/** What the map says a search result is (OpenStreetMap's key and value, e.g. amenity / school). */
export interface Category { key: string; value: string; type?: string; /** "N123", "W456" or "R789", to look up its details. */ osm?: string }

export type VenueKind = "school" | "health" | "food" | "shop" | "lodging" | "culture" | "worship" | "transport" | "park" | "sport" | "service" | "office" | "address" | "street";

export interface Venue { kind: VenueKind; /** What to call it ("Elementary school", "Pharmacy"). */ label: string }

const words = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const AMENITY: Record<string, VenueKind> = {
  school: "school", kindergarten: "school", college: "school", university: "school", childcare: "school", music_school: "school", language_school: "school", driving_school: "school",
  hospital: "health", clinic: "health", doctors: "health", dentist: "health", pharmacy: "health", veterinary: "health",
  restaurant: "food", cafe: "food", fast_food: "food", bar: "food", pub: "food", food_court: "food", ice_cream: "food", biergarten: "food",
  library: "culture", theatre: "culture", cinema: "culture", arts_centre: "culture", community_centre: "culture", events_venue: "culture", nightclub: "culture",
  place_of_worship: "worship",
  bus_station: "transport", ferry_terminal: "transport", parking: "transport", fuel: "transport", charging_station: "transport", bicycle_rental: "transport", car_rental: "transport",
  police: "service", fire_station: "service", townhall: "service", post_office: "service", bank: "service", courthouse: "service", embassy: "service", marketplace: "shop",
};
const TOURISM: Record<string, VenueKind> = {
  hotel: "lodging", motel: "lodging", hostel: "lodging", guest_house: "lodging", apartment: "lodging", camp_site: "lodging", chalet: "lodging",
  museum: "culture", gallery: "culture", zoo: "park", aquarium: "culture", theme_park: "park",
};
const LEISURE: Record<string, VenueKind> = {
  park: "park", playground: "park", garden: "park", dog_park: "park", nature_reserve: "park",
  sports_centre: "sport", stadium: "sport", pitch: "sport", fitness_centre: "sport", swimming_pool: "sport", golf_course: "sport", ice_rink: "sport", track: "sport",
};
const LABEL: Partial<Record<string, string>> = {
  fast_food: "Fast food", place_of_worship: "Place of worship", townhall: "Town hall", doctors: "Doctor's surgery", community_centre: "Community centre",
  arts_centre: "Arts centre", sports_centre: "Sports centre", fitness_centre: "Gym", bus_station: "Bus station", fuel: "Petrol station", charging_station: "Charging station",
};

/** A school's level from its name, when the map only says "school". */
function schoolLabel(value: string, name: string): string {
  const n = name.toLowerCase();
  if (value === "university") return "University";
  if (value === "college") return "College";
  if (value === "kindergarten" || /pre-?k|preschool|nursery/.test(n)) return "Preschool";
  if (/elementary|primary|grade school/.test(n)) return "Elementary school";
  if (/middle|junior high|intermediate/.test(n)) return "Middle school";
  if (/high school|secondary|academy|lyc[eé]e|gymnasium/.test(n)) return "High school";
  return value === "school" ? "School" : words(value);
}

/** Whether a search result is a venue, and what kind (pure). Landforms, waters and regions aren't. */
export function venueOf(c: Category | null | undefined, name = ""): Venue | null {
  if (!c) return null;
  const { key, value, type } = c;
  let kind: VenueKind | undefined;
  if (key === "amenity") kind = AMENITY[value];
  else if (key === "shop") kind = "shop";
  else if (key === "tourism") kind = TOURISM[value];
  else if (key === "leisure") kind = LEISURE[value];
  else if (key === "office" || key === "craft") kind = "office";
  else if (key === "healthcare") kind = "health";
  else if (key === "railway" && /station|halt|tram_stop|subway_entrance/.test(value)) kind = "transport";
  else if (key === "public_transport" && /station|stop/.test(value)) kind = "transport";
  else if (key === "aeroway" && /aerodrome|terminal/.test(value)) kind = "transport";
  else if (key === "building" || type === "house" || (key === "place" && value === "house")) kind = "address";
  else if (key === "highway" || type === "street") kind = "street";
  if (!kind) return null;
  const label = kind === "school" ? schoolLabel(value, name)
    : kind === "address" ? (key === "building" && value !== "yes" && value !== "house" ? words(value) : "Address")
      : kind === "street" ? "Street"
        : kind === "shop" ? (value === "yes" ? "Shop" : words(LABEL[value] ?? value))
          : words(LABEL[value] ?? value);
  return { kind, label };
}

/** Kinds of notable places (from map labels) that are venues, and what to call them. */
const NOTABLE: Partial<Record<string, Venue>> = {
  education: { kind: "school", label: "School" }, transport: { kind: "transport", label: "Station" }, sports: { kind: "sport", label: "Stadium" },
  worship: { kind: "worship", label: "Place of worship" }, culture: { kind: "culture", label: "Museum or venue" }, zoo: { kind: "park", label: "Zoo" },
};

/** The venue a chosen place is, if any: from search ({ venue }) or a notable label's kind (pure). */
export function venueOfPlace(p: { feature?: unknown; name?: { title?: string } | null } | null | undefined): Venue | null {
  const f = p?.feature as { venue?: Category; notable?: { kind?: string; name?: string } } | undefined;
  if (f?.venue) return venueOf(f.venue, p?.name?.title ?? "");
  const k = f?.notable?.kind;
  if (k && NOTABLE[k]) return k === "education" ? { kind: "school", label: schoolLabel("school", f.notable?.name ?? "") } : NOTABLE[k]!;
  return null;
}

// ---- Details from the map's tags -------------------------------------------------------------------

export interface Detail { label: string; value: string; href?: string }

const DAYS: Record<string, string> = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun", PH: "holidays" };

/** "Mo-Fr 08:00-15:30; Sa 09:00-12:00" said plainly: "Mon–Fri 08:00–15:30 · Sat 09:00–12:00" (pure). */
export function hoursText(oh: string): string {
  if (oh.trim() === "24/7") return "Open 24 hours";
  return oh.split(";").map((part) => part.trim()).filter(Boolean).slice(0, 4)
    .map((part) => part.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d]).replace(/-/g, "–").replace(/,(?=\S)/g, ", ").replace(/\boff\b/, "closed"))
    .join(" · ");
}

const ISCED: Record<string, string> = { "0": "Preschool", "1": "Elementary", "2": "Middle", "3": "High school" };

/** The details worth showing from a place's map tags, most useful first (pure). */
export function detailsFrom(tags: Record<string, string>): Detail[] {
  const out: Detail[] = [];
  const t = (k: string) => tags[k]?.trim();
  const hours = t("opening_hours");
  if (hours) out.push({ label: "Hours", value: hoursText(hours) });
  const grades = t("grades") ?? (t("isced:level") ? t("isced:level")!.split(/[;,]/).map((x) => ISCED[x.trim()]).filter(Boolean).join(", ") : undefined);
  if (grades) out.push({ label: "Grades", value: grades });
  const phone = t("phone") ?? t("contact:phone");
  if (phone) out.push({ label: "Phone", value: phone, href: `tel:${phone.replace(/[^\d+]/g, "")}` });
  const web = t("website") ?? t("contact:website") ?? t("url");
  if (web) out.push({ label: "Website", value: web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), href: /^https?:/.test(web) ? web : `https://${web}` });
  const op = t("operator");
  if (op) out.push({ label: "Run by", value: op });
  const cuisine = t("cuisine");
  if (cuisine) out.push({ label: "Food", value: cuisine.split(";").slice(0, 3).map(words).join(", ") });
  const wheel = t("wheelchair");
  if (wheel) out.push({ label: "Wheelchair", value: wheel === "yes" ? "Accessible" : wheel === "limited" ? "Partly accessible" : wheel === "no" ? "Not accessible" : words(wheel) });
  const cap = t("capacity");
  if (cap && /^\d+$/.test(cap)) out.push({ label: "Capacity", value: Number(cap).toLocaleString() });
  return out;
}

/** A Nominatim lookup id ("W123") from Photon's osm_type ("W") and osm_id (pure). */
export const osmRef = (type?: string, id?: number | string) => (type && id !== undefined ? `${type.slice(0, 1).toUpperCase()}${id}` : undefined);
