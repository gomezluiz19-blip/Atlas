// Who lives in a congressional district, from the Census Bureau's American
// Community Survey (5-year estimates; free, no key needed for light use).
import { cached } from "../../data/diskCache";
import { getJson } from "../../data/http";
import { US_STATES } from "../../politics/model";

export interface DistrictPeople {
  name: string; population: number; medianAge?: number; medianIncome?: number; medianHome?: number;
  veteransPct?: number; povertyPct?: number; foreignBornPct?: number; degreePct?: number; year: number;
}

const VARS = ["NAME", "B01003_001E", "B01002_001E", "B19013_001E", "B25077_001E", "B21001_002E", "B21001_001E", "B17001_002E", "B17001_001E", "B05002_013E", "B05002_001E", "B15003_022E", "B15003_001E"];

/** Reads one ACS row into figures (pure; negative codes mean "not available"). */
export function readAcs(head: string[], row: string[], year: number): DistrictPeople {
  const v = (k: string) => { const n = Number(row[head.indexOf(k)]); return Number.isFinite(n) && n >= 0 ? n : undefined; };
  const pct = (a: string, b: string) => { const x = v(a), y = v(b); return x !== undefined && y ? (x / y) * 100 : undefined; };
  return {
    name: row[head.indexOf("NAME")], population: v("B01003_001E") ?? 0, medianAge: v("B01002_001E"), medianIncome: v("B19013_001E"), medianHome: v("B25077_001E"),
    veteransPct: pct("B21001_002E", "B21001_001E"), povertyPct: pct("B17001_002E", "B17001_001E"), foreignBornPct: pct("B05002_013E", "B05002_001E"), degreePct: pct("B15003_022E", "B15003_001E"), year,
  };
}

/** The district's people (latest survey that answers). */
export function districtPeople(state: string, district: number): Promise<DistrictPeople | null> {
  const fips = US_STATES[state]?.[0];
  if (!fips) return Promise.resolve(null);
  return cached(`acs:cd:${state}:${district}`, 30 * 86_400_000, async () => {
    for (const year of [2023, 2022]) {
      try {
        const rows = await getJson<string[][]>("Census Bureau", `https://api.census.gov/data/${year}/acs/acs5?get=${VARS.join(",")}&for=congressional%20district:${String(district).padStart(2, "0")}&in=state:${fips}`);
        if (rows.length > 1) return readAcs(rows[0], rows[1], year);
      } catch { /* try the year before */ }
    }
    return null;
  });
}
