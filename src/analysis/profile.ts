// Statistics for an elevation profile (a cross-section or a river long profile).

export interface ProfileStats {
  length: number;
  minElevation: number;
  maxElevation: number;
  relief: number;
  totalAscent: number;
  totalDescent: number;
  /** Steepest slope between neighbouring samples, in degrees. */
  maxSlopeDeg: number;
  meanSlopeDeg: number;
  /** Index of the lowest sample. */
  lowestIndex: number;
  /**
   * Incision: how far the lowest point sits below the lower of the two
   * highest points on either side of it (the "rims"). This is the depth of a
   * gorge or valley as a person standing on the lower rim would experience it.
   */
  incision: {
    depth: number;
    leftRimIndex: number;
    rightRimIndex: number;
    /** Horizontal distance between the two rims. */
    rimWidth: number;
  } | null;
}

/**
 * @param distance cumulative horizontal distance of each sample, metres
 * @param elevation elevation of each sample, metres
 */
export function profileStats(distance: ArrayLike<number>, elevation: ArrayLike<number>): ProfileStats {
  const n = elevation.length;
  if (n === 0 || distance.length !== n) throw new Error("profileStats: need matching, non-empty arrays");
  let min = Infinity, max = -Infinity, lowestIndex = 0;
  let ascent = 0, descent = 0, maxSlope = 0, slopeSum = 0, slopeRun = 0;
  for (let i = 0; i < n; i++) {
    const z = elevation[i];
    if (z < min) { min = z; lowestIndex = i; }
    if (z > max) max = z;
    if (i > 0) {
      const dz = z - elevation[i - 1];
      const dx = distance[i] - distance[i - 1];
      if (dz > 0) ascent += dz; else descent -= dz;
      if (dx > 0) {
        const s = (Math.atan(Math.abs(dz) / dx) * 180) / Math.PI;
        if (s > maxSlope) maxSlope = s;
        slopeSum += s * dx;
        slopeRun += dx;
      }
    }
  }

  let incision: ProfileStats["incision"] = null;
  if (lowestIndex > 0 && lowestIndex < n - 1) {
    let left = 0, right = lowestIndex + 1;
    for (let i = 0; i < lowestIndex; i++) if (elevation[i] > elevation[left]) left = i;
    for (let i = lowestIndex + 1; i < n; i++) if (elevation[i] > elevation[right]) right = i;
    const depth = Math.min(elevation[left], elevation[right]) - min;
    if (depth > 0) {
      incision = {
        depth,
        leftRimIndex: left,
        rightRimIndex: right,
        rimWidth: distance[right] - distance[left],
      };
    }
  }

  return {
    length: distance[n - 1] - distance[0],
    minElevation: min,
    maxElevation: max,
    relief: max - min,
    totalAscent: ascent,
    totalDescent: descent,
    maxSlopeDeg: maxSlope,
    meanSlopeDeg: slopeRun > 0 ? slopeSum / slopeRun : 0,
    lowestIndex,
    incision,
  };
}

/** Elevation zoom level that resolves a line of this length with ~`samples` points. */
export function zoomForSpacing(spacingMeters: number, lat: number): number {
  const mpp0 = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 256;
  const z = Math.round(Math.log2(mpp0 / Math.max(spacingMeters, 1)));
  return Math.max(4, Math.min(14, z));
}
