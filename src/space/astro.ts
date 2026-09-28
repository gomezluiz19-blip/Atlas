// Positions in the solar system, for the solar system view and tonight's sky.
// Planets from JPL's approximate Keplerian elements (Standish, valid
// 1800–2050, accurate to a fraction of a degree for the inner planets);
// the Sun from Earth's orbit; the Moon's phase from its mean synodic month.

const DEG = Math.PI / 180;
export const AU_KM = 149_597_870.7;

/** Julian centuries since J2000.0 (TT ≈ UTC here; the difference doesn't matter at this precision). */
export const centuries = (ms: number) => (ms / 86_400_000 + 2440587.5 - 2451545.0) / 36525;

type El = [number, number]; // value at J2000, rate per century
export interface Planet {
  id: string;
  name: string;
  color: string;
  /** Equatorial radius, km. */
  radius: number;
  a: El; e: El; I: El; L: El; peri: El; node: El;
  facts: { day: string; year: string; moons: number; about: string };
}

export const PLANETS: Planet[] = [
  { id: "mercury", name: "Mercury", color: "#b5aea6", radius: 2440, a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.2503235, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081],
    facts: { day: "176 Earth days (sunrise to sunrise)", year: "88 days", moons: 0, about: "The smallest planet and closest to the Sun: 430 °C by day, −180 °C at night." } },
  { id: "venus", name: "Venus", color: "#e9cf9c", radius: 6052, a: [0.72333566, 0.0000039], e: [0.00677672, -0.00004107], I: [3.39467605, -0.0007889], L: [181.9790995, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418],
    facts: { day: "117 Earth days, spinning backwards", year: "225 days", moons: 0, about: "The hottest planet (465 °C) under thick clouds of sulphuric acid." } },
  { id: "earth", name: "Earth", color: "#4d8fd6", radius: 6371, a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0, 0],
    facts: { day: "24 hours", year: "365.25 days", moons: 1, about: "Home: the only world known to have oceans of liquid water on its surface, and life." } },
  { id: "mars", name: "Mars", color: "#c8562c", radius: 3390, a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343],
    facts: { day: "24 h 37 min", year: "687 days", moons: 2, about: "A cold desert with the tallest volcano in the solar system, Olympus Mons." } },
  { id: "jupiter", name: "Jupiter", color: "#d9b98c", radius: 69911, a: [5.202887, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106],
    facts: { day: "9 h 56 min", year: "11.9 years", moons: 95, about: "The largest planet, a gas giant with a storm (the Great Red Spot) bigger than Earth." } },
  { id: "saturn", name: "Saturn", color: "#e4cf96", radius: 58232, a: [9.53667594, -0.0012506], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794],
    facts: { day: "10 h 34 min", year: "29.4 years", moons: 146, about: "Its rings are mostly ice, hundreds of thousands of kilometres wide but often only tens of metres thick." } },
  { id: "uranus", name: "Uranus", color: "#a6e0ea", radius: 25362, a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], peri: [170.9542763, 0.40805281], node: [74.01692503, 0.04240589],
    facts: { day: "17 h 14 min", year: "84 years", moons: 28, about: "An ice giant tipped on its side, so each pole gets 42 years of sunlight, then 42 of dark." } },
  { id: "neptune", name: "Neptune", color: "#4f73e0", radius: 24622, a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], peri: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664],
    facts: { day: "16 h 6 min", year: "165 years", moons: 16, about: "The windiest world: storms at over 2,000 km/h, 4.5 billion km from the Sun." } },
];

const val = (el: El, T: number) => el[0] + el[1] * T;

/** Solves Kepler's equation M = E − e sin E. */
function eccentricAnomaly(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** Heliocentric ecliptic position (AU, J2000 ecliptic) of a planet at a time. */
export function heliocentric(p: Planet, ms: number): [number, number, number] {
  const T = centuries(ms);
  const a = val(p.a, T), e = val(p.e, T), I = val(p.I, T) * DEG, L = val(p.L, T), peri = val(p.peri, T), node = val(p.node, T);
  const w = (peri - node) * DEG, O = node * DEG;
  let M = ((L - peri) % 360) * DEG;
  if (M > Math.PI) M -= 2 * Math.PI;
  const E = eccentricAnomaly(M, e);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** The orbit as a loop of points (AU), for drawing. */
export function orbitPath(p: Planet, ms: number, steps = 180): [number, number, number][] {
  const T = centuries(ms);
  const periodDays = 365.25 * Math.pow(val(p.a, T), 1.5);
  return Array.from({ length: steps + 1 }, (_, i) => heliocentric(p, ms + (i / steps) * periodDays * 86_400_000));
}

const OBLIQUITY = 23.43928 * DEG;

/** Ecliptic → equatorial (both J2000). */
export function toEquatorial([x, y, z]: [number, number, number]): [number, number, number] {
  return [x, y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY), y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY)];
}

/** Unit vector from Earth to the Sun, equatorial (close enough to TEME for shadow tests). */
export function sunDirection(ms: number): [number, number, number] {
  const e = heliocentric(PLANETS[2], ms);
  const eq = toEquatorial([-e[0], -e[1], -e[2]]);
  const n = Math.hypot(...eq);
  return [eq[0] / n, eq[1] / n, eq[2] / n];
}

/** Greenwich mean sidereal time, radians. */
export function gmst(ms: number): number {
  const d = ms / 86_400_000 + 2440587.5 - 2451545.0;
  return (((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360 * DEG;
}

/** Altitude and azimuth (degrees) of an equatorial direction for an observer. */
export function altAz(eq: [number, number, number], lon: number, lat: number, ms: number): { alt: number; az: number } {
  const ra = Math.atan2(eq[1], eq[0]), dec = Math.atan2(eq[2], Math.hypot(eq[0], eq[1]));
  const H = gmst(ms) + lon * DEG - ra, φ = lat * DEG;
  const alt = Math.asin(Math.sin(φ) * Math.sin(dec) + Math.cos(φ) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H) * Math.cos(dec), Math.cos(φ) * Math.sin(dec) - Math.sin(φ) * Math.cos(dec) * Math.cos(H));
  return { alt: alt / DEG, az: ((az / DEG) + 360) % 360 };
}

export function sunAltAz(lon: number, lat: number, ms: number) {
  return altAz(sunDirection(ms), lon, lat, ms);
}

/** Where a planet is in the sky, and its distance from Earth (AU). */
export function planetSky(p: Planet, lon: number, lat: number, ms: number) {
  const P = heliocentric(p, ms), E = heliocentric(PLANETS[2], ms);
  const g: [number, number, number] = [P[0] - E[0], P[1] - E[1], P[2] - E[2]];
  return { ...altAz(toEquatorial(g), lon, lat, ms), distance: Math.hypot(...g) };
}

const SYNODIC = 29.530588853;
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14);

/** The Moon's phase: age in days, illuminated fraction and a name. */
export function moonPhase(ms: number) {
  const age = ((((ms - NEW_MOON_2000) / 86_400_000) % SYNODIC) + SYNODIC) % SYNODIC;
  const lit = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  const name = names[Math.round((age / SYNODIC) * 8) % 8];
  const emoji = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"][Math.round((age / SYNODIC) * 8) % 8];
  return { age, lit, name, emoji };
}

/** Compass point for an azimuth. */
export const compass = (az: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(az / 45) % 8];
