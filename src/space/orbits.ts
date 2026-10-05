// Satellites from CelesTrak's element sets (TLEs), propagated with SGP4
// (satellite.js) right here in the browser: where each one is now, its
// ground track, and when the ISS will pass over a place.
import { degreesLat, degreesLong, ecfToLookAngles, eciToEcf, eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";
import { sunAltAz, sunDirection } from "./astro";

export interface Sat { name: string; id: number; rec: SatRec; group: string }

export const GROUPS: { id: string; label: string; color: string; about: string }[] = [
  { id: "stations", label: "Space stations", color: "#e1b843", about: "The ISS, China's Tiangong and the craft visiting them" },
  { id: "visual", label: "Brightest", color: "#ffffff", about: "The 100 or so satellites easiest to see by eye" },
  { id: "science", label: "Science", color: "#8b5fa8", about: "Space telescopes and research satellites, like Hubble" },
  { id: "weather", label: "Weather", color: "#4c9ac9", about: "Satellites watching clouds and storms" },
  { id: "gps-ops", label: "GPS", color: "#5b9467", about: "The navigation satellites in your phone's location" },
  { id: "geo", label: "Geostationary", color: "#d19a2e", about: "Satellites that hover over one spot, 35,786 km up" },
  { id: "starlink", label: "Starlink", color: "#8e8ef0", about: "SpaceX's internet constellation, thousands of satellites" },
];

const cache = new Map<string, Promise<Sat[]>>();

export function parseTle(text: string, group: string): Sat[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out: Sat[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i++) {
    if (lines[i + 1]?.startsWith("1 ") && lines[i + 2]?.startsWith("2 ")) {
      try {
        const rec = twoline2satrec(lines[i + 1], lines[i + 2]);
        out.push({ name: lines[i].trim(), id: Number(lines[i + 1].slice(2, 7)), rec, group });
      } catch {
        /* skip a malformed set */
      }
      i += 2;
    }
  }
  return out;
}

export function loadGroup(group: string): Promise<Sat[]> {
  let p = cache.get(group);
  if (!p) {
    const key = `atlas.tle.${group}`;
    p = (async () => {
      // CelesTrak asks that data be fetched at most every couple of hours.
      try {
        const hit = JSON.parse(localStorage.getItem(key) ?? "null");
        if (hit && Date.now() - hit.at < 2 * 3_600_000) return parseTle(hit.text, group);
      } catch { /* refetch */ }
      const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`);
      if (!res.ok) throw new Error(`CelesTrak answered ${res.status}`);
      const text = await res.text();
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), text })); } catch { /* storage full: fine */ }
      return parseTle(text, group);
    })();
    p.catch(() => cache.delete(group));
    cache.set(group, p);
  }
  return p;
}

export interface SatState { lon: number; lat: number; alt: number; /** km/s */ speed: number; eci: [number, number, number] }

export function stateAt(s: Sat, ms: number): SatState | null {
  const date = new Date(ms);
  const pv = propagate(s.rec, date);
  if (!pv || !pv.position || typeof pv.position === "boolean") return null;
  const g = eciToGeodetic(pv.position, gstime(date));
  const v = pv.velocity && typeof pv.velocity !== "boolean" ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0;
  const lon = degreesLong(g.longitude), lat = degreesLat(g.latitude);
  if (!Number.isFinite(lon) || !Number.isFinite(g.height)) return null;
  return { lon, lat, alt: g.height, speed: v, eci: [pv.position.x, pv.position.y, pv.position.z] };
}

/** Orbital period (minutes) and inclination (degrees) from the elements. */
export function orbitInfo(s: Sat) {
  return { period: (2 * Math.PI) / s.rec.no, inclination: (s.rec.inclo * 180) / Math.PI };
}

/** Ground track from `fromMin` to `toMin` minutes around now. */
export function groundTrack(s: Sat, ms: number, fromMin: number, toMin: number, stepMin = 1): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let m = fromMin; m <= toMin; m += stepMin) {
    const st = stateAt(s, ms + m * 60_000);
    if (st) out.push([st.lon, st.lat, st.alt]);
  }
  return out;
}

/** True if the satellite is in sunlight (outside Earth's cylindrical shadow). */
export function sunlit(eci: [number, number, number], ms: number): boolean {
  const s = sunDirection(ms);
  const d = eci[0] * s[0] + eci[1] * s[1] + eci[2] * s[2];
  if (d > 0) return true;
  const perp = Math.hypot(eci[0] - d * s[0], eci[1] - d * s[1], eci[2] - d * s[2]);
  return perp > 6371;
}

export interface Pass { start: number; peak: number; end: number; maxAlt: number; startAz: number; endAz: number; visible: boolean }

/** Passes over a place in the next `hours`: above 10°, and whether it can be seen (dark sky, sunlit satellite). */
export function passes(s: Sat, lon: number, lat: number, from: number, hours = 72, minAlt = 10): Pass[] {
  const obs = { longitude: (lon * Math.PI) / 180, latitude: (lat * Math.PI) / 180, height: 0 };
  const out: Pass[] = [];
  let cur: Pass | null = null;
  const look = (ms: number) => {
    const date = new Date(ms);
    const pv = propagate(s.rec, date);
    if (!pv || !pv.position || typeof pv.position === "boolean") return null;
    const la = ecfToLookAngles(obs, eciToEcf(pv.position, gstime(date)));
    return { alt: (la.elevation * 180) / Math.PI, az: (((la.azimuth * 180) / Math.PI) + 360) % 360, eci: [pv.position.x, pv.position.y, pv.position.z] as [number, number, number] };
  };
  for (let t = from; t < from + hours * 3_600_000; t += 30_000) {
    const l = look(t);
    if (!l) continue;
    if (l.alt >= minAlt) {
      const seen = sunlit(l.eci, t) && sunAltAz(lon, lat, t).alt < -6;
      if (!cur) cur = { start: t, peak: t, end: t, maxAlt: l.alt, startAz: l.az, endAz: l.az, visible: seen };
      cur.end = t;
      cur.endAz = l.az;
      if (l.alt > cur.maxAlt) { cur.maxAlt = l.alt; cur.peak = t; }
      cur.visible ||= seen;
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}
