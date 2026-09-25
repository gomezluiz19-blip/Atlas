// Web Mercator ("slippy map") math. Global pixel coordinates at zoom z run
// from 0 to 256 * 2^z, with y increasing southward.

export const TILE_SIZE = 256;
const EARTH_CIRCUMFERENCE = 40075016.686; // metres at the equator
const MAX_LAT = 85.05112878;

export function worldSize(z: number): number {
  return TILE_SIZE * 2 ** z;
}

export function lonLatToPixel(lon: number, lat: number, z: number): [number, number] {
  const size = worldSize(z);
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  const x = ((lon + 180) / 360) * size;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  return [x, y];
}

export function pixelToLonLat(px: number, py: number, z: number): [number, number] {
  const size = worldSize(z);
  const lon = (px / size) * 360 - 180;
  const n = Math.PI * (1 - (2 * py) / size);
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return [lon, lat];
}

/** Ground size of one pixel, in metres, at a latitude and zoom. */
export function metersPerPixel(lat: number, z: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / worldSize(z);
}

/** Great-circle distance in metres (haversine, spherical Earth). */
export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Points evenly spaced along the great circle between two points (inclusive). */
export function greatCirclePoints(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  count: number,
): [number, number][] {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const f1 = lat1 * toRad, l1 = lon1 * toRad, f2 = lat2 * toRad, l2 = lon2 * toRad;
  const d = haversine(lon1, lat1, lon2, lat2) / 6371008.8;
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    if (d < 1e-12) {
      out.push([lon1, lat1]);
      continue;
    }
    const a = Math.sin((1 - t) * d) / Math.sin(d);
    const b = Math.sin(t * d) / Math.sin(d);
    const x = a * Math.cos(f1) * Math.cos(l1) + b * Math.cos(f2) * Math.cos(l2);
    const y = a * Math.cos(f1) * Math.sin(l1) + b * Math.cos(f2) * Math.sin(l2);
    const zc = a * Math.sin(f1) + b * Math.sin(f2);
    out.push([Math.atan2(y, x) * toDeg, Math.atan2(zc, Math.hypot(x, y)) * toDeg]);
  }
  return out;
}
