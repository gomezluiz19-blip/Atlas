// Distances on the Earth, in one place. A sphere of mean radius 6,371 km (haversine): within half a percent of
// the true ellipsoid, which is far finer than anything Terreno draws or says. Three shapes, for the three ways
// points are carried around the code: objects, bare numbers, and [lon, lat] pairs.

export interface LonLat { lon: number; lat: number }

export const EARTH_KM = 6371;
const RAD = Math.PI / 180;

/** Great-circle kilometres between two points given as numbers (pure). */
export function kmAt(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const h = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Great-circle kilometres between two points (pure). */
export const kmBetween = (a: LonLat, b: LonLat): number => kmAt(a.lon, a.lat, b.lon, b.lat);

/** Great-circle kilometres between two [lon, lat] pairs (pure). */
export const kmPair = (a: readonly [number, number] | number[], b: readonly [number, number] | number[]): number => kmAt(a[0], a[1], b[0], b[1]);
