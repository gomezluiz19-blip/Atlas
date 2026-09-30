// Sea routes between any two ports: a graph of the waypoints ships actually
// pass (straits, canals, capes and open-ocean turning points), shortest path
// by great-circle distance. Chokepoints can be closed, and the route finds its
// way round, which is how "what if the Red Sea shuts" becomes days and fuel.
// An estimate for planning: real voyages follow weather routing, traffic
// separation schemes and draught limits this doesn't model.

export type LonLat = [number, number];

/** Waypoints: [lon, lat, name]. */
export const NODES: Record<string, [number, number, string]> = {
  ENG: [-5.5, 49.3, "Western Approaches"], DOV: [1.5, 51.0, "Dover Strait"], NSEA: [3.5, 54.5, "North Sea"], SKAG: [10.5, 57.9, "Skagerrak"],
  DAN: [11.0, 55.3, "Danish Straits"], BALT: [18.0, 55.8, "Baltic Sea"], GOF: [24.0, 59.8, "Gulf of Finland"], BISC: [-10.0, 43.5, "off Finisterre"],
  GIB: [-5.6, 35.95, "Strait of Gibraltar"], MEDW: [4.0, 38.0, "Western Mediterranean"], SIC: [11.8, 37.3, "Strait of Sicily"], MEDE: [26.0, 34.5, "Eastern Mediterranean"],
  AEG: [25.3, 39.0, "Aegean Sea"], BOS: [29.0, 41.1, "Bosporus"], BLK: [32.0, 43.0, "Black Sea"], PSD: [32.4, 31.4, "Port Said (Suez Canal north)"],
  SUEZ: [32.6, 29.8, "Suez (Suez Canal south)"], REDC: [38.0, 21.0, "Red Sea"], BAB: [43.4, 12.6, "Bab el-Mandeb"], ADEN: [48.0, 12.5, "Gulf of Aden"],
  ARAB: [62.0, 15.0, "Arabian Sea"], HORM: [56.4, 26.5, "Strait of Hormuz"], GULF: [52.0, 26.5, "Persian Gulf"], LKA: [80.5, 5.5, "south of Sri Lanka"],
  BOB: [88.0, 15.0, "Bay of Bengal"], MAL: [97.5, 5.5, "Strait of Malacca"], SGP: [104.0, 1.2, "Singapore Strait"], SCS: [112.0, 12.0, "South China Sea"],
  HKG: [114.5, 21.5, "off Hong Kong"], TWN: [119.8, 24.2, "Taiwan Strait"], ECS: [124.0, 30.0, "East China Sea"], YEL: [123.0, 36.0, "Yellow Sea"],
  KOR: [129.2, 34.5, "Korea Strait"], JPN: [141.0, 34.5, "off Tokyo Bay"], PHIL: [128.0, 12.0, "Philippine Sea"], JAVA: [112.0, -5.0, "Java Sea"],
  SUNDA: [105.8, -6.0, "Sunda Strait"], LOMB: [115.7, -8.8, "Lombok Strait"], SOMA: [52.0, 0.0, "off Somalia"], MAUR: [57.0, -20.0, "off Mauritius"],
  MOZ: [41.0, -17.0, "Mozambique Channel"], DUR: [32.0, -31.0, "off Durban"], CAPE: [18.5, -35.5, "Cape of Good Hope"], WAFR: [3.0, 3.0, "Gulf of Guinea"],
  SEN: [-18.5, 14.5, "off Dakar"], CANA: [-15.5, 28.0, "Canary Islands"], BRA: [-34.0, -8.0, "off eastern Brazil"], SANT: [-45.5, -25.0, "off Santos"],
  PLAT: [-55.0, -36.0, "River Plate"], HORN: [-67.0, -56.5, "Cape Horn"], CHIL: [-73.0, -33.0, "off central Chile"], PERU: [-78.0, -12.0, "off Peru"],
  PANP: [-79.5, 8.5, "Panama Canal (Pacific)"], PANA: [-79.9, 9.5, "Panama Canal (Caribbean)"], CARB: [-75.0, 15.0, "Caribbean Sea"], ANTL: [-60.0, 14.0, "Lesser Antilles"],
  WIND: [-73.8, 20.0, "Windward Passage"], FLA: [-80.0, 25.0, "Florida Strait"], GOM: [-90.0, 26.0, "Gulf of Mexico"], USEC: [-72.0, 37.0, "off the US east coast"],
  NYC: [-73.0, 40.2, "off New York"], HAL: [-63.0, 43.0, "off Halifax"], NATL: [-40.0, 45.0, "North Atlantic"], AZOR: [-28.0, 38.0, "Azores"],
  BAJA: [-110.0, 20.0, "off Mexico's Pacific coast"], LAX: [-119.0, 33.0, "off Los Angeles"], PNW: [-125.5, 48.5, "Strait of Juan de Fuca"], ALEU: [-170.0, 50.0, "south of the Aleutians"],
  HAW: [-157.0, 21.0, "Hawaii"], FIJI: [178.0, -18.0, "Fiji"], SPAC: [-130.0, -20.0, "South Pacific"], AUSW: [114.0, -32.5, "off Perth"],
  AUSS: [130.0, -37.0, "Great Australian Bight"], BASS: [145.5, -39.5, "Bass Strait"], SYD: [152.0, -34.0, "off Sydney"], CORAL: [155.0, -15.0, "Coral Sea"],
  NZ: [175.5, -36.0, "off Auckland"],
};

const E = (s: string) => s.split(" ").map((p) => p.split("-") as [string, string]);
export const EDGES: [string, string][] = E(
  "ENG-DOV DOV-NSEA NSEA-SKAG SKAG-DAN DAN-BALT BALT-GOF ENG-BISC BISC-GIB BISC-AZOR BISC-CANA ENG-NATL GIB-MEDW MEDW-SIC SIC-MEDE MEDE-AEG AEG-BOS BOS-BLK " +
  "MEDE-PSD PSD-SUEZ SUEZ-REDC REDC-BAB BAB-ADEN ADEN-ARAB ARAB-HORM HORM-GULF ARAB-LKA ADEN-SOMA SOMA-MOZ SOMA-MAUR MOZ-DUR MAUR-DUR DUR-CAPE LKA-MAUR " +
  "LKA-BOB LKA-MAL BOB-MAL MAL-SGP SGP-SCS SCS-HKG HKG-TWN TWN-ECS ECS-YEL ECS-KOR KOR-JPN ECS-JPN SCS-PHIL PHIL-ECS PHIL-JPN PHIL-CORAL " +
  "SGP-JAVA JAVA-SUNDA JAVA-LOMB SUNDA-LKA SUNDA-AUSW LOMB-AUSW AUSW-AUSS AUSS-BASS BASS-SYD SYD-NZ SYD-CORAL SYD-FIJI FIJI-NZ " +
  "GIB-CANA CANA-SEN SEN-WAFR WAFR-CAPE SEN-BRA BRA-SANT SANT-PLAT PLAT-HORN HORN-CHIL CHIL-PERU PERU-PANP PANP-PANA PANA-CARB CARB-ANTL ANTL-BRA ANTL-AZOR ANTL-CANA " +
  "CARB-WIND WIND-USEC CARB-FLA FLA-GOM FLA-USEC USEC-NYC NYC-HAL HAL-NATL NYC-NATL USEC-AZOR AZOR-GIB CAPE-BRA CAPE-SANT " +
  "PANP-BAJA BAJA-LAX LAX-PNW LAX-HAW LAX-ALEU PNW-ALEU ALEU-JPN HAW-JPN PANP-HAW HAW-FIJI CHIL-SPAC SPAC-FIJI PANP-SPAC PERU-SPAC",
);

/** Chokepoints that can close, and the graph edges each one takes out. */
export const CHOKEPOINTS: Record<string, { label: string; edges: string[]; note: string }> = {
  redsea: { label: "Red Sea / Bab el-Mandeb", edges: ["REDC-BAB", "BAB-ADEN"], note: "Attacks on shipping since late 2023 sent most container lines round the Cape." },
  suez: { label: "Suez Canal", edges: ["PSD-SUEZ"], note: "About an eighth of world trade; the 2021 blockage held it shut for six days." },
  panama: { label: "Panama Canal", edges: ["PANP-PANA"], note: "Drought in 2023–24 cut daily transits and draughts." },
  hormuz: { label: "Strait of Hormuz", edges: ["ARAB-HORM"], note: "Roughly a fifth of the world's oil passes through." },
  malacca: { label: "Strait of Malacca", edges: ["LKA-MAL", "BOB-MAL", "MAL-SGP"], note: "The shortest way between the Indian Ocean and East Asia." },
  taiwan: { label: "Taiwan Strait", edges: ["HKG-TWN", "TWN-ECS"], note: "Busy lane between South and North East Asia." },
  bosporus: { label: "Bosporus", edges: ["AEG-BOS"], note: "The Black Sea's only way out." },
  gibraltar: { label: "Strait of Gibraltar", edges: ["GIB-MEDW"], note: "The Mediterranean's western door." },
};

const R = 6371;
/** Great-circle kilometres (pure). */
export function gcKm(a: LonLat, b: LonLat): number {
  const toR = Math.PI / 180, dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
export const NM = 1.852;

export interface SeaRoute { km: number; pts: LonLat[]; via: string[]; chokepoints: string[] }

const key = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const at = (id: string): LonLat => [NODES[id][0], NODES[id][1]];

/** Which chokepoints a list of waypoint ids passes (pure). */
export function passes(ids: string[]): string[] {
  const used = new Set<string>();
  for (let i = 1; i < ids.length; i++) used.add(key(ids[i - 1], ids[i]));
  return Object.entries(CHOKEPOINTS).filter(([, c]) => c.edges.some((e) => { const [a, b] = e.split("-"); return used.has(key(a, b)); })).map(([id]) => id);
}

/**
 * The shortest sea route between two ports, avoiding closed chokepoints
 * (pure). Each port joins the graph at its two nearest waypoints; two ports
 * that close are joined directly. Null if closures leave no way through.
 */
export function seaRoute(from: LonLat, to: LonLat, closed: string[] = []): SeaRoute | null {
  const shut = new Set(closed.flatMap((c) => CHOKEPOINTS[c]?.edges ?? []).map((e) => { const [a, b] = e.split("-"); return key(a, b); }));
  const adj = new Map<string, { to: string; km: number }[]>();
  const link = (a: string, b: string, km: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, km });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ to: a, km });
  };
  for (const [a, b] of EDGES) if (!shut.has(key(a, b))) link(a, b, gcKm(at(a), at(b)));
  const pos = (id: string): LonLat => (id === "@A" ? from : id === "@B" ? to : at(id));
  for (const [id, p] of [["@A", from], ["@B", to]] as const) {
    const near = Object.keys(NODES).map((n) => ({ n, km: gcKm(p, at(n)) })).sort((x, y) => x.km - y.km).slice(0, 2);
    for (const x of near) link(id, x.n, x.km);
  }
  const direct = gcKm(from, to);
  if (direct < 400) link("@A", "@B", direct);
  // Dijkstra (the graph is small).
  const dist = new Map<string, number>([["@A", 0]]), prev = new Map<string, string>(), done = new Set<string>();
  for (;;) {
    let u: string | null = null, best = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < best) { best = d; u = n; }
    if (!u) return null;
    if (u === "@B") break;
    done.add(u);
    for (const e of adj.get(u) ?? []) {
      const d = best + e.km;
      if (d < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, d); prev.set(e.to, u); }
    }
  }
  const ids: string[] = [];
  for (let n: string | undefined = "@B"; n; n = prev.get(n)) ids.unshift(n);
  const inner = ids.slice(1, -1);
  return { km: dist.get("@B")!, pts: ids.map(pos), via: inner.map((n) => NODES[n][2]), chokepoints: passes(inner) };
}

/** A point `km` along a route, and the leg index it's on (pure). */
export function along(pts: LonLat[], km: number): { p: LonLat; leg: number } {
  let left = Math.max(0, km);
  for (let i = 1; i < pts.length; i++) {
    const seg = gcKm(pts[i - 1], pts[i]);
    if (left <= seg) return { p: interp(pts[i - 1], pts[i], seg ? left / seg : 0), leg: i - 1 };
    left -= seg;
  }
  return { p: pts[pts.length - 1], leg: Math.max(0, pts.length - 2) };
}

/** Great-circle interpolation between two points (pure). */
export function interp(a: LonLat, b: LonLat, f: number): LonLat {
  const toR = Math.PI / 180, toD = 180 / Math.PI;
  const [l1, p1, l2, p2] = [a[0] * toR, a[1] * toR, b[0] * toR, b[1] * toR];
  const d = gcKm(a, b) / R;
  if (d < 1e-9) return a;
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return [Math.atan2(y, x) * toD, Math.atan2(z, Math.hypot(x, y)) * toD];
}

/** How far along a route a reported position is: km from the start at the nearest point on it (pure). */
export function progressKm(pts: LonLat[], p: LonLat): number {
  let best = Infinity, bestKm = 0, run = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = gcKm(pts[i - 1], pts[i]), n = Math.max(2, Math.ceil(seg / 50));
    for (let k = 0; k <= n; k++) {
      const q = interp(pts[i - 1], pts[i], k / n), d = gcKm(q, p);
      if (d < best) { best = d; bestKm = run + (seg * k) / n; }
    }
    run += seg;
  }
  return bestKm;
}

/** The route cut into points about every `stepKm`, for drawing and for checking what it crosses (pure). */
export function densify(pts: LonLat[], stepKm = 200): LonLat[] {
  const out: LonLat[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const n = Math.max(1, Math.ceil(gcKm(pts[i - 1], pts[i]) / stepKm));
    for (let k = 1; k <= n; k++) out.push(interp(pts[i - 1], pts[i], k / n));
  }
  return out;
}

/** Days at sea for a distance at a speed in knots (pure). */
export const seaDays = (km: number, knots: number) => km / (Math.max(1, knots) * NM * 24);

/** A route cut where the ship is: the part behind, and the part ahead (pure). */
export function splitRoute(pts: LonLat[], doneKm: number): [LonLat[], LonLat[]] {
  const { p, leg } = along(pts, doneKm);
  return [[...pts.slice(0, leg + 1), p], [p, ...pts.slice(leg + 1)]];
}
