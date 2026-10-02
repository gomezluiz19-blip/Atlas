// The hologram's survey: what it knows about a place's buildings and where
// that came from. Your own building comes first, in this order: the outline
// you traced yourself, the one OpenStreetMap has where you are, or, when
// nobody has mapped it yet (common for houses in the suburbs), a house-sized
// estimate on the spot, clearly marked, with a way to trace the real one.
// Pure functions; the drawing is in holo.ts.
import type { Building } from "./scene";
import type { PlaceKind } from "./store";

/** Typical footprint (m) and height (m) by kind of place, for the estimate. */
const TYPICAL: Record<PlaceKind, { w: number; d: number; h: number }> = {
  home: { w: 12, d: 10, h: 7 }, hotel: { w: 30, d: 18, h: 15 }, business: { w: 20, d: 14, h: 6 },
  farm: { w: 16, d: 11, h: 7 }, school: { w: 40, d: 20, h: 8 }, other: { w: 12, d: 10, h: 6 },
};

const metresPerDeg = (lat: number) => ({ kx: 111_320 * Math.cos((lat * Math.PI) / 180), ky: 110_540 });

/** A rectangle w × d metres centred on a point, turned `turnDeg` clockwise (pure). */
export function rectangle(lon: number, lat: number, w: number, d: number, turnDeg = 0): [number, number][] {
  const { kx, ky } = metresPerDeg(lat), a = (turnDeg * Math.PI) / 180;
  const corners: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  return corners.map(([x, y]) => [lon + (x * Math.cos(a) + y * Math.sin(a)) / kx, lat + (-x * Math.sin(a) + y * Math.cos(a)) / ky]);
}

/** A house-sized estimate where the place is, for when no building is mapped there (pure). */
export function estimateBuilding(lon: number, lat: number, kind: PlaceKind = "home"): Building {
  const t = TYPICAL[kind];
  return { ring: rectangle(lon, lat, t.w, t.d), height: t.h, heightSource: "guess", tags: { building: "estimate" }, name: "Estimated" };
}

/** Your traced outline as a building (pure). */
export function tracedBuilding(ring: [number, number][], storeys = 1): Building {
  return { ring, height: Math.max(1, storeys) * 3 + 1, heightSource: "floors", tags: { building: "traced" }, name: "Traced" };
}

/** A key for a building's outline, to skip the same one arriving twice (pure). */
export const ringKey = (ring: [number, number][]) => ring.slice(0, 3).map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).join(";");

/** New buildings only, by outline (pure). */
export function newOnes(have: Set<string>, bs: Building[]): Building[] {
  const out: Building[] = [];
  for (const b of bs) { const k = ringKey(b.ring); if (!have.has(k)) { have.add(k); out.push(b); } }
  return out;
}

export type Yours = "traced" | "mapped" | "estimated" | "none";

/** The survey's lines, as the hologram shows them (pure). */
export function surveyLines(s: { ground: "wait" | "ok" | "flat"; yours: Yours | "wait"; around: number | "wait" | "failed"; radiusM: number; land?: string }): string[] {
  return [
    s.ground === "wait" ? "◌ Reading the ground…" : s.ground === "ok" ? "✓ Ground from elevation data" : "△ Ground: flat (elevation didn't load)",
    s.yours === "wait" ? "◌ Finding your building…" : s.yours === "traced" ? "✓ Your building: as you traced it" : s.yours === "mapped" ? "✓ Your building: from OpenStreetMap" : s.yours === "estimated" ? "△ Your building isn't mapped yet: estimated" : "",
    s.land ?? "",
    s.around === "wait" ? `◌ Surveying ${s.radiusM.toLocaleString()} m around…` : s.around === "failed" ? "△ Buildings around didn't load: try again later" : `✓ ${s.around.toLocaleString()} buildings within ${s.radiusM.toLocaleString()} m`,
  ].filter(Boolean);
}
