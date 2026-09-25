// Place names for a point, from OpenStreetMap Nominatim.
import { getJson } from "./http";

export interface PlaceName {
  /** Short name for a heading, e.g. "Grand Canyon Village". */
  title: string;
  /** Wider context, e.g. "Coconino County, Arizona, United States". */
  context: string;
  countryCode?: string;
}

interface Reverse {
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

const KEYS = ["peak", "natural", "water", "national_park", "park", "village", "town", "city", "hamlet", "suburb", "municipality", "county", "state_district", "state", "region", "country"];

export async function reverseGeocode(lon: number, lat: number, zoom = 12): Promise<PlaceName | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=${zoom}&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
  const r = await getJson<Reverse & { error?: string }>("Nominatim", url, { headers: { "Accept-Language": navigator.language } });
  if (r.error || !r.address) return null;
  const a = r.address;
  const titleKey = KEYS.find((k) => a[k]);
  const title = r.name || (titleKey ? a[titleKey] : "") || "Unnamed place";
  const context = ["county", "state", "country"].map((k) => a[k]).filter((v) => v && v !== title).join(", ");
  return { title, context, countryCode: a.country_code?.toUpperCase() };
}
