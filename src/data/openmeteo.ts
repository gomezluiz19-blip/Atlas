// Weather and climate history from Open-Meteo (https://open-meteo.com), CC-BY 4.0.
// Forecasts come from national weather models; history from the ERA5 reanalysis.
import { getJson } from "./http";

export interface Forecast {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    is_day: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
    sunrise: string[];
    sunset: string[];
  };
  timezone: string;
}

export interface History {
  daily: { time: string[]; temperature_2m_mean: (number | null)[]; precipitation_sum: (number | null)[] };
}

const ll = (lon: number, lat: number) => `latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`;

/** The week's forecast and the weather now (`live` fetches afresh instead of reusing this session's answer). */
export function forecast(lon: number, lat: number, live = false): Promise<Forecast> {
  return getJson<Forecast>(
    "Open-Meteo",
    `https://api.open-meteo.com/v1/forecast?${ll(lon, lat)}` +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset" +
      "&timezone=auto&forecast_days=7",
    undefined, 25_000, live,
  );
}

export interface Hours { hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: (number | null)[]; precipitation: number[]; weather_code: number[]; wind_speed_10m: number[]; is_day: number[]; cloud_cover: number[] }; utc_offset_seconds: number; timezone: string }
/** The next 48 hours, hour by hour (local time). */
export function hours48(lon: number, lat: number): Promise<Hours> {
  return getJson<Hours>("Open-Meteo", `https://api.open-meteo.com/v1/forecast?${ll(lon, lat)}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day,cloud_cover&forecast_hours=48&timezone=auto`, undefined, 20_000);
}

export interface Projection { daily: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[] } }
/** Daily highs and lows from a climate model (CMIP6, EC-Earth3P-HR), 1991–2050. */
export function projectedExtremes(lon: number, lat: number): Promise<Projection> {
  return getJson<Projection>("Open-Meteo", `https://climate-api.open-meteo.com/v1/climate?${ll(lon, lat)}&start_date=1991-01-01&end_date=2050-12-31&models=EC_Earth3P_HR&daily=temperature_2m_max,temperature_2m_min`, undefined, 60_000);
}

export interface AirNow { current: { us_aqi?: number; european_aqi?: number; pm2_5?: number; pm10?: number; uv_index?: number; ozone?: number } }
/** Air quality and UV now (Open-Meteo's CAMS-based air-quality model). */
export function airNow(lon: number, lat: number): Promise<AirNow> {
  return getJson<AirNow>("Open-Meteo", `https://air-quality-api.open-meteo.com/v1/air-quality?${ll(lon, lat)}&current=us_aqi,european_aqi,pm2_5,pm10,uv_index,ozone`, undefined, 15_000, true);
}

/** Daily mean temperature and precipitation from 1950 to the end of last year. */
export function history(lon: number, lat: number): Promise<History> {
  const end = `${new Date().getUTCFullYear() - 1}-12-31`;
  return getJson<History>(
    "Open-Meteo",
    `https://archive-api.open-meteo.com/v1/archive?${ll(lon, lat)}&start_date=1950-01-01&end_date=${end}&daily=temperature_2m_mean,precipitation_sum&timezone=UTC`,
    undefined,
    60_000,
  );
}

export interface FarmDay { date: string; tmax: number | null; tmin: number | null; rain: number | null; et0: number | null }

type DailyFarm = { daily: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_sum: (number | null)[]; et0_fao_evapotranspiration: (number | null)[] } };
const FARM_VARS = "daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration&timezone=auto";
const farmDays = (r: DailyFarm): FarmDay[] =>
  r.daily.time.map((date, i) => ({ date, tmax: r.daily.temperature_2m_max[i], tmin: r.daily.temperature_2m_min[i], rain: r.daily.precipitation_sum[i], et0: r.daily.et0_fao_evapotranspiration[i] }));

/**
 * Daily temperature, rain and reference evapotranspiration (FAO-56 ET0) for a
 * field: from `since` (YYYY-MM-DD) to 16 days ahead. The last 92 days and the
 * forecast come from the forecast models; anything older from ERA5.
 */
export async function farmWeather(lon: number, lat: number, since: string): Promise<{ recent: FarmDay[]; older: FarmDay[] }> {
  const daysAgo = Math.ceil((Date.now() - Date.parse(since)) / 86_400_000);
  const recentP = getJson<DailyFarm>("Open-Meteo", `https://api.open-meteo.com/v1/forecast?${ll(lon, lat)}&${FARM_VARS}&past_days=${Math.min(92, Math.max(1, daysAgo + 1))}&forecast_days=16`);
  let older: FarmDay[] = [];
  if (daysAgo > 92) {
    const end = new Date(Date.now() - 85 * 86_400_000).toISOString().slice(0, 10);
    const start = since < "1940-01-01" ? "1940-01-01" : since;
    older = farmDays(await getJson<DailyFarm>("Open-Meteo", `https://archive-api.open-meteo.com/v1/archive?${ll(lon, lat)}&start_date=${start}&end_date=${end}&${FARM_VARS}`, undefined, 40_000));
  }
  return { recent: farmDays(await recentP), older };
}

export interface SiteDay { date: string; rain: number; rainChance: number | null; windMax: number; gustMax: number; tmin: number; tmax: number }

/** The next 10 days for a building site: rain, wind and gusts (crane limits), frost (concrete). */
export async function siteWeather(lon: number, lat: number): Promise<SiteDay[]> {
  const r = await getJson<{ daily: { time: string[]; precipitation_sum: number[]; precipitation_probability_max: (number | null)[]; wind_speed_10m_max: number[]; wind_gusts_10m_max: number[]; temperature_2m_min: number[]; temperature_2m_max: number[] } }>(
    "Open-Meteo",
    `https://api.open-meteo.com/v1/forecast?${ll(lon, lat)}&daily=precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,temperature_2m_min,temperature_2m_max&timezone=auto&forecast_days=10`,
  );
  const d = r.daily;
  return d.time.map((date, i) => ({ date, rain: d.precipitation_sum?.[i] ?? 0, rainChance: d.precipitation_probability_max?.[i] ?? null, windMax: d.wind_speed_10m_max?.[i] ?? 0, gustMax: d.wind_gusts_10m_max?.[i] ?? 0, tmin: d.temperature_2m_min?.[i] ?? 10, tmax: d.temperature_2m_max?.[i] ?? 20 }));
}

/** Daily minimum and maximum temperature and rain for the last `years` full years (ERA5). */
export async function climateDays(lon: number, lat: number, years = 10): Promise<{ date: string; tmin: number | null; tmax: number | null; rain: number | null }[]> {
  const y = new Date().getUTCFullYear() - 1;
  const r = await getJson<{ daily: { time: string[]; temperature_2m_min: (number | null)[]; temperature_2m_max: (number | null)[]; precipitation_sum: (number | null)[] } }>(
    "Open-Meteo",
    `https://archive-api.open-meteo.com/v1/archive?${ll(lon, lat)}&start_date=${y - years + 1}-01-01&end_date=${y}-12-31&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=auto`,
    undefined,
    45_000,
  );
  return r.daily.time.map((date, i) => ({ date, tmin: r.daily.temperature_2m_min[i], tmax: r.daily.temperature_2m_max[i], rain: r.daily.precipitation_sum[i] }));
}

/** Hourly temperature and humidity from two days ago to four days ahead (for disease-risk rules). */
export async function hourlyHumid(lon: number, lat: number): Promise<{ time: string; t: number; rh: number }[]> {
  const r = await getJson<{ hourly: { time: string[]; temperature_2m: number[]; relative_humidity_2m: number[] } }>(
    "Open-Meteo",
    `https://api.open-meteo.com/v1/forecast?${ll(lon, lat)}&hourly=temperature_2m,relative_humidity_2m&past_days=2&forecast_days=5&timezone=auto`,
  );
  return r.hourly.time.map((time, i) => ({ time, t: r.hourly.temperature_2m[i], rh: r.hourly.relative_humidity_2m[i] }));
}

/**
 * A climate model's daily mean temperature for a place, 1991 to 2060 (CMIP6
 * HighResMIP EC-Earth3P-HR via Open-Meteo's climate API), for how much it
 * warms by mid-century.
 */
export function projection(lon: number, lat: number): Promise<{ daily: { time: string[]; temperature_2m_mean: (number | null)[] } }> {
  return getJson("Open-Meteo", `https://climate-api.open-meteo.com/v1/climate?${ll(lon, lat)}&start_date=1991-01-01&end_date=2060-12-31&models=EC_Earth3P_HR&daily=temperature_2m_mean`, undefined, 60_000);
}
