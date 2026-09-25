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

export function forecast(lon: number, lat: number): Promise<Forecast> {
  return getJson<Forecast>(
    "Open-Meteo",
    `https://api.open-meteo.com/v1/forecast?${ll(lon, lat)}` +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset" +
      "&timezone=auto&forecast_days=7",
  );
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
