// Right now, here: one live snapshot of any spot on Earth. The weather and
// the air, where the sun is, what's flying overhead, the nearest recent
// earthquake and natural events, and the news that mentions it. Said in
// plain sentences for people, and given as a small JSON "world state" for
// software (an agent, a robot, a drone planner) that needs to know what the
// world is like at a point before it acts there.
import { airNow, forecast } from "../data/openmeteo";
import { recentQuakes } from "../data/quakes";
import { weatherText } from "../analysis/climate";
import { sunPosition } from "../delight/sun";
import { naturalEvents, newsAbout, EVENT_LOOK, type EventKind } from "./news";
import { planesAround, type Track } from "./traffic";

export interface NowHere {
  place: { name?: string; lon: number; lat: number };
  /** When this was read (ISO, UTC). */
  time: string;
  timezone?: string;
  weather?: { temperatureC: number; feelsLikeC: number; condition: string; humidityPct: number; windKmh: number; windFrom: string; precipitationMm: number; isDay: boolean };
  air?: { usAqi?: number; europeanAqi?: number; pm25?: number; uvIndex?: number; quality: string };
  sun: { altitudeDeg: number; azimuthDeg: number; phase: "day" | "twilight" | "night"; sunriseLocal?: string; sunsetLocal?: string };
  aircraft?: { count: number; withinKm: number; highest?: { callsign: string; altitudeM: number }; lowest?: { callsign: string; altitudeM: number }; source: string };
  earthquake?: { magnitude: number; place: string; distanceKm: number; hoursAgo: number };
  events: { title: string; kind: EventKind; distanceKm: number }[];
  news?: { title: string; source: string; url: string };
  /** What couldn't be read just now. */
  missing: string[];
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const kmApart = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
};
/** US AQI in words. */
export function airWords(aqi?: number): string {
  if (aqi === undefined || !Number.isFinite(aqi)) return "unknown";
  return aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "unhealthy for sensitive groups" : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very unhealthy" : "hazardous";
}

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("slow")), ms))]);

/** Reads everything live for a spot (each part gives up after a few seconds; what's missing is listed). */
export async function nowHere(place: { name?: string; context?: string; lon: number; lat: number }, now = Date.now()): Promise<NowHere> {
  const { lon, lat } = place;
  const missing: string[] = [];
  const soft = <T,>(what: string, p: Promise<T>, ms = 7000) => within(p, ms).catch(() => { missing.push(what); return null; });
  const country = place.context?.split(",").pop()?.trim();
  const [wx, air, sky, quakes, events, news] = await Promise.all([
    soft("weather", forecast(lon, lat, true)),
    soft("air quality", airNow(lon, lat)),
    soft("aircraft", planesAround(lon, lat, 40)),
    soft("earthquakes", recentQuakes()),
    soft("natural events", naturalEvents()),
    place.name && !/^-?\d/.test(place.name) ? soft("news", newsAbout(place.name, country)) : Promise.resolve(null),
  ]);
  const sun = sunPosition(now, lat, lon);
  const out: NowHere = {
    place: { name: place.name, lon: +lon.toFixed(5), lat: +lat.toFixed(5) },
    time: new Date(now).toISOString(),
    sun: { altitudeDeg: +sun.alt.toFixed(1), azimuthDeg: +sun.az.toFixed(1), phase: sun.alt > 0 ? "day" : sun.alt > -6 ? "twilight" : "night" },
    events: [],
    missing,
  };
  if (wx) {
    const c = wx.current;
    out.timezone = wx.timezone;
    out.weather = {
      temperatureC: c.temperature_2m, feelsLikeC: c.apparent_temperature, condition: weatherText(c.weather_code).text, humidityPct: c.relative_humidity_2m,
      windKmh: c.wind_speed_10m, windFrom: COMPASS[Math.round((c.wind_direction_10m % 360) / 45) % 8], precipitationMm: c.precipitation, isDay: !!c.is_day,
    };
    out.sun.sunriseLocal = wx.daily.sunrise[0]?.slice(11, 16);
    out.sun.sunsetLocal = wx.daily.sunset[0]?.slice(11, 16);
  }
  if (air) {
    const a = air.current;
    out.air = { usAqi: a.us_aqi, europeanAqi: a.european_aqi, pm25: a.pm2_5, uvIndex: a.uv_index, quality: airWords(a.us_aqi) };
  }
  if (sky) {
    const up = sky.tracks.filter((t: Track) => !t.ground);
    const by = [...up].sort((a, b) => b.alt - a.alt);
    out.aircraft = {
      count: up.length, withinKm: 40, source: sky.source,
      highest: by[0] ? { callsign: by[0].label, altitudeM: Math.round(by[0].alt) } : undefined,
      lowest: by.length > 1 ? { callsign: by[by.length - 1].label, altitudeM: Math.round(by[by.length - 1].alt) } : undefined,
    };
  }
  if (quakes) {
    const near = quakes.filter((q) => now - q.time < 7 * 86_400_000).map((q) => ({ q, d: kmApart(place, q) })).filter((x) => x.d < 500).sort((a, b) => b.q.mag - a.q.mag)[0];
    if (near) out.earthquake = { magnitude: near.q.mag, place: near.q.place, distanceKm: Math.round(near.d), hoursAgo: Math.round((now - near.q.time) / 3_600_000) };
  }
  if (events) out.events = events.map((e) => ({ title: e.title, kind: e.kind, distanceKm: Math.round(kmApart(place, e)) })).filter((e) => e.distanceKm < 600).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 3);
  if (news?.[0]) out.news = { title: news[0].title, source: news[0].source, url: news[0].url };
  return out;
}

const ftOf = (m: number) => `${(Math.round(m / 0.3048 / 100) * 100).toLocaleString()} ft`;

/** The snapshot in plain sentences, most useful first (pure). */
export function nowSentences(n: NowHere): string[] {
  const out: string[] = [];
  const w = n.weather;
  if (w) out.push(`${Math.round(w.temperatureC)}°C and ${w.condition.toLowerCase()}${Math.abs(w.feelsLikeC - w.temperatureC) >= 3 ? ` (feels like ${Math.round(w.feelsLikeC)}°C)` : ""}; wind ${Math.round(w.windKmh)} km/h from the ${w.windFrom}.`);
  if (n.air?.usAqi !== undefined) out.push(`Air ${n.air.quality} (AQI ${Math.round(n.air.usAqi)})${n.air.uvIndex !== undefined && n.sun.phase === "day" ? `; UV ${Math.round(n.air.uvIndex)}` : ""}.`);
  const s = n.sun;
  out.push(s.phase === "day"
    ? `The sun is up, ${Math.round(s.altitudeDeg)}° high${s.sunsetLocal ? `; it sets at ${s.sunsetLocal}` : ""}.`
    : s.phase === "twilight" ? `Twilight: the sun is just below the horizon${s.sunriseLocal && s.altitudeDeg < 0 ? `; sunrise ${s.sunriseLocal}` : ""}.`
      : `Night here${s.sunriseLocal ? `; sunrise at ${s.sunriseLocal}` : ""}.`);
  const a = n.aircraft;
  if (a) out.push(a.count === 0 ? `No planes within ${a.withinKm} km just now.` : `${a.count} plane${a.count === 1 ? "" : "s"} in the sky within ${a.withinKm} km${a.highest ? `; highest ${a.highest.callsign} at ${ftOf(a.highest.altitudeM)}` : ""}.`);
  if (n.earthquake) out.push(`Strongest earthquake nearby this week: magnitude ${n.earthquake.magnitude.toFixed(1)}, ${n.earthquake.distanceKm} km away, ${n.earthquake.hoursAgo < 24 ? `${n.earthquake.hoursAgo} h` : `${Math.round(n.earthquake.hoursAgo / 24)} days`} ago.`);
  for (const e of n.events.slice(0, 2)) out.push(`${EVENT_LOOK[e.kind].emoji} ${e.title}, ${e.distanceKm} km away.`);
  return out;
}
