// Pure maths for the Anatomy, Seafloor and Sea level lenses.

const lerpTable = (table: [number, number][], x: number) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (x <= table[i][0]) {
    const [x0, y0] = table[i - 1], [x1, y1] = table[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[table.length - 1][1];
};

// Typical treeline and permanent snowline heights by latitude (both hemispheres).
// They vary a lot with climate (dry mountains have higher snowlines), so these
// are guides, not measurements.
const TREELINE: [number, number][] = [[0, 3900], [10, 3900], [20, 3700], [30, 3400], [40, 2600], [45, 2200], [50, 1700], [55, 1200], [60, 800], [65, 500], [70, 200], [90, 0]];
const SNOWLINE: [number, number][] = [[0, 4800], [10, 4900], [20, 5200], [30, 4600], [40, 3500], [45, 3000], [50, 2400], [55, 1800], [60, 1300], [65, 900], [70, 500], [90, 0]];

export const treeline = (lat: number) => lerpTable(TREELINE, Math.abs(lat));
export const snowline = (lat: number) => lerpTable(SNOWLINE, Math.abs(lat));

export type Zone = "valley" | "forest" | "alpine" | "rock" | "snow";
export const ZONES: Record<Zone, { label: string; color: [number, number, number]; about: string }> = {
  valley: { label: "Valleys and lowlands", color: [220, 214, 150], about: "Farms, towns and rivers" },
  forest: { label: "Mountain forest", color: [46, 125, 72], about: "Trees up to the treeline" },
  alpine: { label: "Alpine meadows", color: [150, 190, 90], about: "Grass and flowers above the trees" },
  rock: { label: "Rock and scree", color: [150, 132, 118], about: "Too cold and high for most plants" },
  snow: { label: "Snow and ice", color: [240, 246, 252], about: "Above the snowline, snow lasts all year" },
};

export function zoneAt(h: number, lat: number, base: number): Zone {
  const t = treeline(lat), s = snowline(lat);
  if (h >= s) return "snow";
  if (h >= t + 500) return "rock";
  if (h >= t) return "alpine";
  if (h < Math.max(base + 150, 0) && h < t - 800) return "valley";
  return "forest";
}

export type SeaZone = "shelf" | "slope" | "rise" | "abyss" | "trench";
export const SEA_ZONES: Record<SeaZone, { label: string; color: [number, number, number]; about: string; depth: string }> = {
  shelf: { label: "Continental shelf", color: [110, 205, 215], about: "Shallow, sunlit sea over the edge of the continent: most fishing happens here", depth: "0–200 m" },
  slope: { label: "Continental slope", color: [45, 140, 190], about: "Where the continent drops away to the deep sea", depth: "200–2,000 m" },
  rise: { label: "Continental rise", color: [30, 90, 160], about: "Sediment piled at the foot of the slope", depth: "2,000–4,000 m" },
  abyss: { label: "Abyssal plain", color: [22, 50, 115], about: "The flat, cold, dark ocean floor: most of the planet's surface", depth: "4,000–6,000 m" },
  trench: { label: "Trench", color: [60, 20, 90], about: "Where one plate dives under another: the deepest places on Earth", depth: "below 6,000 m" },
};

export function seaZone(h: number): SeaZone | null {
  if (h >= 0) return null;
  if (h > -200) return "shelf";
  if (h > -2000) return "slope";
  if (h > -4000) return "rise";
  if (h > -6000) return "abyss";
  return "trench";
}

export interface Relief { summit: number; base: number; relief: number; meanSlope: number; steepest: number; aspects: number[]; hypsometry: number[]; zones: Record<Zone, number>; integral: number }

/** Stats from a square grid of heights (`cell` metres apart). */
export function reliefStats(g: ArrayLike<number>, n: number, cell: number, lat: number): Relief {
  let summit = -Infinity, base = Infinity;
  for (let k = 0; k < n * n; k++) { summit = Math.max(summit, g[k]); base = Math.min(base, g[k]); }
  const aspects = new Array(8).fill(0);
  let slopeSum = 0, steepest = 0, count = 0;
  const zones: Record<Zone, number> = { valley: 0, forest: 0, alpine: 0, rock: 0, snow: 0 };
  let sum = 0;
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const dzdx = (g[j * n + i + 1] - g[j * n + i - 1]) / (2 * cell), dzdy = (g[(j - 1) * n + i] - g[(j + 1) * n + i]) / (2 * cell);
    const s = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    slopeSum += s; steepest = Math.max(steepest, s); count++;
    if (s > 3) {
      // Aspect: the compass direction the slope faces (downhill).
      const az = ((Math.atan2(-dzdx, -dzdy) * 180) / Math.PI + 360) % 360;
      aspects[Math.round(az / 45) % 8]++;
    }
    const h = g[j * n + i];
    zones[zoneAt(h, lat, base)]++;
    sum += h;
  }
  const total = aspects.reduce((a, b) => a + b, 0) || 1;
  // Hypsometric curve: share of the area above each tenth of the relief.
  const hyp = Array.from({ length: 11 }, (_, k) => {
    const lvl = base + ((summit - base) * k) / 10;
    let above = 0;
    for (let q = 0; q < n * n; q++) if (g[q] >= lvl) above++;
    return above / (n * n);
  });
  for (const z of Object.keys(zones) as Zone[]) zones[z] /= count || 1;
  return {
    summit, base, relief: summit - base, meanSlope: slopeSum / (count || 1), steepest, aspects: aspects.map((a) => a / total), hypsometry: hyp, zones,
    integral: summit > base ? (sum / (count || 1) - base) / (summit - base) : 0,
  };
}

export interface CraterShape { rim: number; floor: number; depth: number; diameter: number; ratio: number; type: "simple" | "complex" | "shallow"; profiles: number[][] }

/**
 * Crater geometry from radial profiles out from the centre (each an array of
 * heights at steps of `step` metres): the rim is the highest point on each.
 */
export function craterShape(profiles: number[][], step: number): CraterShape {
  const rims = profiles.map((p) => { let k = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[k]) k = i; return { r: k * step, h: p[k] }; });
  const floor = Math.min(...profiles.map((p) => Math.min(...p.slice(0, Math.max(2, Math.round(p.length / 4))))));
  const rim = rims.reduce((s, r) => s + r.h, 0) / rims.length;
  const diameter = 2 * (rims.reduce((s, r) => s + r.r, 0) / rims.length);
  const depth = rim - floor;
  const ratio = diameter > 0 ? depth / diameter : 0;
  // Fresh simple craters are about a fifth as deep as they are wide (elevation data smooths them a little); big ones collapse into flat-floored complex craters.
  const type = ratio >= 0.1 ? "simple" : diameter > 4000 ? "complex" : "shallow";
  return { rim, floor, depth, diameter, ratio, type, profiles };
}
