// Terreno as tools Claude can call (docs/mcp.md). Each answers about the real Earth at a point, and every value
// says where it came from: the source, its date and how far to trust it. Plain functions over public data, so
// they run the same in a Cloudflare Worker (src/mcp/worker.ts), in tests, or anywhere with fetch.
import { koppen, monthlyNormals, weatherText } from "../analysis/climate";
import { dayAt, dayNote } from "../brief/model";
import { countryAt, countryFacts } from "../data/countries";
import { getJson } from "../data/http";
import { formatHash } from "../data/locationParse";
import { outlook } from "../data/openmeteo";

/** A fact with where it came from. */
export interface Sourced<T> { value: T; unit?: string; source: string; as_of?: string; note?: string }

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] };
}

const LON = { type: "number", minimum: -180, maximum: 180, description: "Longitude in degrees (east positive)." };
const LAT = { type: "number", minimum: -90, maximum: 90, description: "Latitude in degrees (north positive)." };
const UA = { "User-Agent": "Terreno/0.1 (+https://terreno.site)" };

export const TOOLS: ToolDef[] = [
  {
    name: "place_read",
    title: "Read a place",
    description: "What a point on Earth is like: its name, height above sea level, climate type (Köppen) with average temperature and rain, the weather now, and the country it's in. Every value carries its source.",
    inputSchema: { type: "object", properties: { lon: LON, lat: LAT }, required: ["lon", "lat"] },
  },
  {
    name: "weather_on",
    title: "Weather on a day",
    description: "The forecast for a place on a given day up to 16 days ahead, in plain words with what to do about it (\"Rain likely, 70%: take a jacket\"). For a trip, an event or a plan.",
    inputSchema: { type: "object", properties: { lon: LON, lat: LAT, date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "The local date, YYYY-MM-DD." } }, required: ["lon", "lat", "date"] },
  },
  {
    name: "country",
    title: "Country at a point",
    description: "The country a point is in, with its capital, population, area, languages, currencies, region and neighbours.",
    inputSchema: { type: "object", properties: { lon: LON, lat: LAT }, required: ["lon", "lat"] },
  },
  {
    name: "scene",
    title: "Open it in Terreno",
    description: "A link that opens Terreno on the live 3D globe at a place, framed to a radius, optionally in a view (people, nature, countries, climate, water, land, built). Use it to show someone the place or to film it.",
    inputSchema: {
      type: "object",
      properties: {
        lon: LON, lat: LAT,
        radius_m: { type: "number", minimum: 50, maximum: 5_000_000, description: "How much to frame around the point, in metres (default 1500)." },
        view: { type: "string", enum: ["people", "nature", "countries", "climate", "water", "land", "built", "explore"], description: "Which view to open in." },
      },
      required: ["lon", "lat"],
    },
  },
];

const num = (v: unknown, name: string, lo: number, hi: number): number => {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < lo || n > hi) throw new ToolInputError(`${name} must be a number from ${lo} to ${hi}.`);
  return n;
};
export class ToolInputError extends Error {}

// ---- place_read ---------------------------------------------------------------------------------------

interface Elev { elevation: number[] }
interface Archive { daily: { time: string[]; temperature_2m_mean: (number | null)[]; precipitation_sum: (number | null)[] } }
interface Now { current: { time: string; temperature_2m: number; weather_code: number; wind_speed_10m: number } }
interface Named { name?: string; display_name?: string; address?: Record<string, string>; error?: string }

/** A point's name from OpenStreetMap, as "Peekskill, New York, United States". */
async function nameAt(lon: number, lat: number): Promise<string | null> {
  const r = await getJson<Named>("Nominatim", `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, { headers: UA }).catch(() => null);
  if (!r || r.error || !r.address) return null;
  const a = r.address;
  const place = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.county ?? r.name;
  return [place, a.state, a.country].filter((x, i, all) => x && all.indexOf(x) === i).join(", ") || null;
}

export async function placeRead(args: Record<string, unknown>) {
  const lon = num(args.lon, "lon", -180, 180), lat = num(args.lat, "lat", -90, 90);
  const ll = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`;
  const lastYear = new Date().getUTCFullYear() - 1;
  const [name, elev, archive, now, country] = await Promise.all([
    nameAt(lon, lat),
    getJson<Elev>("Open-Meteo", `https://api.open-meteo.com/v1/elevation?${ll}`).catch(() => null),
    getJson<Archive>("Open-Meteo", `https://archive-api.open-meteo.com/v1/archive?${ll}&start_date=${lastYear - 9}-01-01&end_date=${lastYear}-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=UTC`, undefined, 30_000).catch(() => null),
    getJson<Now>("Open-Meteo", `https://api.open-meteo.com/v1/forecast?${ll}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`).catch(() => null),
    countryAt(lon, lat).catch(() => null),
  ]);
  const out: Record<string, Sourced<unknown> | null> = {
    name: name ? { value: name, source: "OpenStreetMap (Nominatim)" } : null,
    height: elev && Number.isFinite(elev.elevation?.[0]) ? { value: Math.round(elev.elevation[0]), unit: "m above sea level", source: "Copernicus DEM GLO-90 via Open-Meteo", note: "90 m cells: a summit or a cliff edge may be higher or lower than this." } : null,
    country: country ? { value: country.name, source: "Natural Earth 1:50m borders" } : null,
  };
  if (archive?.daily?.time?.length) {
    const d = archive.daily;
    const n = monthlyNormals(d.time, d.temperature_2m_mean, d.precipitation_sum, lastYear - 9, lastYear);
    const k = koppen(n, lat);
    const yearMean = n.temp.reduce((s, x) => s + x, 0) / 12, yearRain = n.precip.reduce((s, x) => s + x, 0);
    const src = `ERA5 reanalysis via Open-Meteo, ${lastYear - 9}–${lastYear}`;
    out.climate = { value: `${k.code}: ${k.name}`, source: src, note: k.description };
    out.average_temperature = { value: Math.round(yearMean * 10) / 10, unit: "°C, yearly mean", source: src };
    out.yearly_rain = { value: Math.round(yearRain), unit: "mm a year", source: src };
  }
  if (now?.current) {
    const c = now.current;
    out.weather_now = { value: `${weatherText(c.weather_code).text}, ${Math.round(c.temperature_2m)}°C, wind ${Math.round(c.wind_speed_10m)} km/h`, source: "Open-Meteo forecast models", as_of: c.time };
  }
  return { lon, lat, ...out, open_in_terreno: sceneUrl(lon, lat, 1500) };
}

// ---- weather_on ---------------------------------------------------------------------------------------

export async function weatherOn(args: Record<string, unknown>) {
  const lon = num(args.lon, "lon", -180, 180), lat = num(args.lat, "lat", -90, 90);
  const date = String(args.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolInputError("date must be YYYY-MM-DD.");
  const o = await outlook(lon, lat);
  const i = o.daily.time.indexOf(date);
  if (i < 0) {
    return { lon, lat, date, available: false, note: `The forecast reaches ${o.daily.time[0]} to ${o.daily.time.at(-1)} (local dates). For later days, use place_read's climate as the typical weather.`, source: "Open-Meteo forecast models" };
  }
  const day = dayAt(o.daily, i), note = dayNote(day);
  return {
    lon, lat, date, available: true,
    summary: { value: note.words, source: "Open-Meteo forecast models", as_of: new Date().toISOString().slice(0, 10), note: i > 7 ? "More than a week out: the broad pattern holds better than the details." : undefined },
    advice: note.advice || null,
    kind: note.tone,
    high_c: Math.round(day.max), low_c: Math.round(day.min), rain_mm: Math.round(day.rain * 10) / 10, rain_chance_pct: day.chance, gusts_kmh: Math.round(day.gust), snow_cm: Math.round(day.snow),
    timezone: o.timezone,
  };
}

// ---- country ------------------------------------------------------------------------------------------

export async function country(args: Record<string, unknown>) {
  const lon = num(args.lon, "lon", -180, 180), lat = num(args.lat, "lat", -90, 90);
  const shape = await countryAt(lon, lat);
  if (!shape) return { lon, lat, country: null, note: "Not inside any country's borders (the sea, Antarctica, or a disputed edge)." };
  const f = await countryFacts(shape.id).catch(() => null);
  return {
    lon, lat,
    country: { value: f?.name.common ?? shape.name, source: "Natural Earth 1:50m borders" },
    ...(f ? {
      official_name: f.name.official, iso2: f.cca2, iso3: f.cca3,
      capital: f.capital?.[0] ?? null, region: [f.region, f.subregion].filter(Boolean).join(" · ") || null,
      population: f.population != null ? { value: f.population, source: "REST Countries" } : null,
      area_km2: f.area ?? null,
      languages: f.languages ? Object.values(f.languages) : [],
      currencies: f.currencies ? Object.entries(f.currencies).map(([code, c]) => `${c.name} (${code})`) : [],
      neighbours: f.borders ?? [], landlocked: f.landlocked ?? null, drives_on: f.car?.side ?? null,
    } : { note: "Its details couldn't be reached just now." }),
  };
}

// ---- scene --------------------------------------------------------------------------------------------

const SITE = "https://terreno.site/";
const VIEWS = new Set(["people", "nature", "countries", "climate", "water", "land", "built", "explore"]);

/** The share link the app reads (src/data/locationParse.ts): the place chosen, the view, the camera framing it. */
export function sceneUrl(lon: number, lat: number, radius = 1500, view?: string): string {
  // Height that frames the radius on a typical screen, looking down at 55° (as the app frames a place).
  const height = Math.max(250, Math.min(20_000_000, radius * 2.3));
  const tilt = radius < 20_000 ? -55 : -89;
  // Stand back from the point along the view so it sits in the middle.
  const back = radius < 20_000 ? height / Math.tan((-tilt * Math.PI) / 180) : 0;
  const camLat = lat - back / 110_540;
  return SITE + formatHash({ place: { lon, lat }, theme: view && VIEWS.has(view) && view !== "explore" ? view : undefined, camera: { lon, lat: camLat, height, heading: 0, pitch: tilt } });
}

export function scene(args: Record<string, unknown>) {
  const lon = num(args.lon, "lon", -180, 180), lat = num(args.lat, "lat", -90, 90);
  const radius = args.radius_m === undefined ? 1500 : num(args.radius_m, "radius_m", 50, 5_000_000);
  const view = typeof args.view === "string" ? args.view : undefined;
  if (view && !VIEWS.has(view)) throw new ToolInputError(`view must be one of ${[...VIEWS].join(", ")}.`);
  return { url: sceneUrl(lon, lat, radius, view), note: "Opens the live globe there; the place's card follows. Share it, or film it with Terreno's Video studio." };
}

/** Runs a tool by name. */
export async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "place_read": return placeRead(args);
    case "weather_on": return weatherOn(args);
    case "country": return country(args);
    case "scene": return scene(args);
    default: throw new ToolInputError(`No tool called ${name}.`);
  }
}
