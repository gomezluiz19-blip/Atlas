// Sun on a building, facade by facade and floor by floor (pure). The building
// is a box `length` × `depth` metres, its long side running along `bearing`;
// each of its four faces looks out at a compass direction. A neighbour across
// from a face (`distance` metres away, `height` tall) can shade the lower
// floors. Hours of direct sun are counted every 10 minutes through a day.
import { sunPosition } from "../delight/sun";

export interface Block { length: number; depth: number; floors: number; floorHeight: number; bearing: number }
export interface Neighbour { distance: number; height: number }
export type Face = "front" | "back" | "left" | "right";
export const FACES: Face[] = ["front", "right", "back", "left"];

const R = Math.PI / 180;
/** The compass direction each face looks out to. */
export const faceAz = (b: Block, f: Face) => ((({ front: b.bearing + 90, back: b.bearing - 90, left: b.bearing + 180, right: b.bearing } as const)[f]) % 360 + 360) % 360;
export const compass = (d: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((d % 360) + 360) % 360) / 45) % 8];

/** Hours of direct sun on one floor of one face on a day (pure). `day`: midnight UTC of the date. */
export function sunHours(b: Block, f: Face, floor: number, lat: number, lon: number, day: number, n?: Neighbour): number {
  const normal = faceAz(b, f), z = (floor + 0.5) * b.floorHeight;
  let mins = 0;
  for (let m = 0; m < 1440; m += 10) {
    const t = day + m * 60_000 - (lon / 15) * 3_600_000, s = sunPosition(t, lat, lon);
    if (s.alt <= 0.5) continue;
    const off = (((s.az - normal + 540) % 360) - 180) * R;
    if (Math.cos(off) <= 0.05) continue; // the sun is behind this face
    if (n && n.height > z) {
      // The ray towards the sun meets the neighbour's wall after distance / cos(off) metres across the ground.
      const reach = n.distance / Math.cos(off);
      if (z + Math.tan(s.alt * R) * reach < n.height) continue;
    }
    mins += 10;
  }
  return Math.round((mins / 60) * 10) / 10;
}

export interface SunTable { face: Face; az: number; floors: number[] }
/** Every face and floor on a day (pure). */
export const sunTable = (b: Block, lat: number, lon: number, day: number, n?: Partial<Record<Face, Neighbour>>): SunTable[] =>
  FACES.map((f) => ({ face: f, az: faceAz(b, f), floors: Array.from({ length: b.floors }, (_, i) => sunHours(b, f, i, lat, lon, day, n?.[f])) }));

/** The three days that bracket the year: midwinter, equinox, midsummer (in that hemisphere), as UTC midnights. */
export function keyDays(lat: number, year = new Date().getUTCFullYear()): { label: string; day: number }[] {
  const north = lat >= 0;
  return [
    { label: "Midwinter", day: Date.UTC(year, north ? 11 : 5, 21) },
    { label: "Equinox", day: Date.UTC(year, 2, 20) },
    { label: "Midsummer", day: Date.UTC(year, north ? 5 : 11, 21) },
  ];
}

/** A colour for hours of sun: deep blue (none) through teal and yellow to orange (8+). */
export function sunColor(hours: number): string {
  const stops: [number, [number, number, number]][] = [[0, [40, 60, 120]], [2, [40, 140, 190]], [4, [120, 200, 120]], [6, [255, 214, 10]], [8, [255, 150, 30]]];
  const hrs = Math.max(0, Math.min(8, hours));
  for (let i = 1; i < stops.length; i++) if (hrs <= stops[i][0]) {
    const [h0, c0] = stops[i - 1], [h1, c1] = stops[i], k = (hrs - h0) / (h1 - h0);
    return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(",")})`;
  }
  return "rgb(255,150,30)";
}
