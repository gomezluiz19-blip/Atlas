// Recent earthquakes from the USGS real-time feed (magnitude 2.5+, past week).
import { getJson } from "./http";

export interface Quake {
  id: string;
  lon: number;
  lat: number;
  depthKm: number;
  mag: number;
  place: string;
  time: number;
  url: string;
}

export async function recentQuakes(): Promise<Quake[]> {
  const body = await getJson<{ features: { id: string; geometry: { coordinates: [number, number, number] }; properties: { mag: number; place: string; time: number; url: string } }[] }>(
    "USGS",
    `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson?t=${Math.floor(Date.now() / 600_000)}`,
  );
  return body.features.map((f) => ({
    id: f.id, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depthKm: f.geometry.coordinates[2],
    mag: f.properties.mag, place: f.properties.place, time: f.properties.time, url: f.properties.url,
  }));
}
