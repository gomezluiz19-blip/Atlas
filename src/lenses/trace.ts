// Trace: follow how things flow. A river from source to mouth (and fly down
// it); the rain falling on each side of a mountain; the great ocean currents.
import { CallbackProperty, Cartesian3, Color, CustomDataSource, HeadingPitchRoll, PolylineArrowMaterialProperty, PolylineGlowMaterialProperty, Math as CesiumMath } from "cesium";
import { traceFlow, type FlowTrace } from "../analysis/water";
import { countryAt } from "../data/countries";
import { elevation } from "../data/elevation";
import { haversine } from "../data/mercator";
import { riverLines } from "../data/worldData";
import { formatDistance, h } from "../ui/dom";
import { lines, stat } from "./charts";
import { offset } from "./slice";
import type { Lens, LensHost, Subject } from "./types";

type Pt = [number, number];

/** Distance (m) from a point to a polyline given as flat [lon, lat, …]. */
function distToLine(p: Pt, xy: number[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < xy.length; i += 2) best = Math.min(best, haversine(p[0], p[1], xy[i], xy[i + 1]));
  return best;
}

/** Joins pieces of a river end to end, starting from `first`. */
export function chain(pieces: Pt[][], first: number): Pt[] {
  const used = new Set([first]);
  let path = [...pieces[first]];
  const close = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.02 && Math.abs(a[1] - b[1]) < 0.02;
  for (let grew = true; grew;) {
    grew = false;
    for (let k = 0; k < pieces.length; k++) {
      if (used.has(k)) continue;
      const q = pieces[k], s = path[0], e = path[path.length - 1];
      if (close(e, q[0])) path = [...path, ...q.slice(1)];
      else if (close(e, q[q.length - 1])) path = [...path, ...q.slice(0, -1).reverse()];
      else if (close(s, q[q.length - 1])) path = [...q.slice(0, -1), ...path];
      else if (close(s, q[0])) path = [...q.slice(1).reverse(), ...path];
      else continue;
      used.add(k);
      grew = true;
    }
  }
  return path;
}

/** Flies the camera along a path, looking ahead; returns a stop function. */
export function flyAlong(host: LensHost, path: Pt[], seconds: number, height: number): () => void {
  const viewer = host.app.globe.viewer;
  const step = Math.max(1, Math.floor(path.length / 400));
  const pts = path.filter((_, i) => i % step === 0);
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  const L = dist[dist.length - 1];
  const t0 = performance.now();
  let heading = 0, stopped = false;
  const at = (d: number): Pt => {
    let i = dist.findIndex((x) => x >= d);
    if (i <= 0) return pts[0];
    const f = (d - dist[i - 1]) / (dist[i] - dist[i - 1] || 1);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
  };
  const off = viewer.scene.preRender.addEventListener(() => {
    const f = Math.min(1, (performance.now() - t0) / (seconds * 1000));
    const d = f * L, p = at(Math.max(0, d - height * 1.2)), ahead = at(Math.min(L, d + height * 2));
    const want = Math.atan2(ahead[0] - p[0], ahead[1] - p[1]) ;
    heading += Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * 0.05;
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(p[0], p[1], height), orientation: new HeadingPitchRoll(heading, CesiumMath.toRadians(-28), 0) });
    if (f >= 1) stop();
  });
  const stop = () => { if (!stopped) { stopped = true; off(); } };
  host.onClose(stop);
  return stop;
}

async function traceRiver(host: LensHost, s: Subject, ds: CustomDataSource): Promise<boolean> {
  const rivers = await riverLines();
  const p: Pt = [s.lon, s.lat];
  let bestName = "", best = Infinity;
  for (const r of rivers) {
    const d = distToLine(p, r.pts);
    if (d < best) { best = d; bestName = r.name; }
  }
  if (best > 25_000 || !bestName) return false;
  const pieces = rivers.filter((r) => r.name === bestName).map((r) => { const q: Pt[] = []; for (let i = 0; i + 1 < r.pts.length; i += 2) q.push([r.pts[i], r.pts[i + 1]]); return q; });
  const nearest = pieces.map((q) => distToLine(p, q.flat())).reduce((bi, d, i, arr) => (d < arr[bi] ? i : bi), 0);
  let path = chain(pieces, nearest);
  const [z0, z1] = await elevation.sample([path[0], path[path.length - 1]], 9);
  if (z0 < z1) path = path.reverse(); // run from source to mouth
  let length = 0;
  for (let i = 1; i < path.length; i++) length += haversine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  const prof = Array.from(await elevation.sample(path.filter((_, i) => i % Math.max(1, Math.floor(path.length / 120)) === 0), 9));
  ds.entities.add({ polyline: { positions: Cartesian3.fromDegreesArray(path.flat()), width: 9, clampToGround: true, material: new PolylineGlowMaterialProperty({ glowPower: 0.3, color: Color.fromCssColorString("#4fc3f7") }) } });
  host.app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees((path[0][0] + path[path.length - 1][0]) / 2, (path[0][1] + path[path.length - 1][1]) / 2, Math.min(9_000_000, Math.max(300_000, length * 1.6))), duration: 2 });
  const countriesEl = h("p", { class: "small" }, "Finding the countries it flows through…");
  const statsEl = h("div", { class: "lens-stats" }, stat(formatDistance(length), "Length of this stretch"), stat(`${Math.round(Math.max(...prof))} m`, "Highest point"), stat(`${Math.round(prof[prof.length - 1])} m`, "At the end"));
  host.body.replaceChildren(
    h("p", {}, h("strong", {}, `The ${bestName}`), " from its upper reaches to where it ends, as mapped at world scale."),
    statsEl,
    lines([{ values: prof, color: "#4fc3f7" }], { yLabel: (v) => `${Math.round(v)} m`, xLabels: ["source", "mouth"], fill: true }),
    countriesEl,
    h("div", { class: "pro-actions" },
      h("button", { class: "primary-btn", onclick: () => { host.app.globe.viewer.camera.cancelFlight(); flyAlong(host, path, Math.min(90, Math.max(25, length / 40_000)), Math.min(60_000, Math.max(3000, length / 150))); } }, "▶ Fly along it"),
      h("button", { class: "pill-btn", onclick: () => void rainPaths(host, s, ds) }, "Trace the rain instead")),
    h("p", { class: "muted small" }, "River lines from Natural Earth (the main rivers); small streams aren't included."),
  );
  // Countries along the way, in order.
  const seen: string[] = [];
  for (const q of path.filter((_, i) => i % Math.max(1, Math.floor(path.length / 40)) === 0)) {
    const c = await countryAt(q[0], q[1]).catch(() => null);
    if (c && seen[seen.length - 1] !== c.name && !seen.includes(c.name)) seen.push(c.name);
  }
  countriesEl.textContent = seen.length ? `Flows through ${seen.join(" → ")}.` : "";
  return true;
}

async function rainPaths(host: LensHost, s: Subject, ds: CustomDataSource) {
  ds.entities.removeAll();
  const c = s.centre ?? [s.lon, s.lat];
  const status = h("p", { class: "muted small" }, "Dropping rain on each side…");
  const list = h("div", { class: "lens-legend" });
  host.body.replaceChildren(h("p", {}, "Rain falling on each side of the high ground, followed downhill."), status, list,
    h("p", { class: "muted small" }, "Surface runoff only, from elevation data (it ignores soil and groundwater). Where paths split to different seas you're on a drainage divide."));
  const sides: [string, number, string][] = [["North", 0, "#64d2ff"], ["East", 90, "#30d158"], ["South", 180, "#ff9f0a"], ["West", 270, "#bf5af2"]];
  const d = Math.max(500, Math.min(3000, s.radius * 0.15));
  const results = await Promise.all(sides.map(async ([name, b, color]) => {
    const [lon, lat] = offset(c[0], c[1], b, d);
    try {
      const t: FlowTrace = await traceFlow(lon, lat, 12, undefined, 14);
      ds.entities.add({ polyline: { positions: Cartesian3.fromDegreesArray(t.points.filter((_, i) => i % 3 === 0).flatMap((q) => [q.lon, q.lat])), width: 5, clampToGround: true, material: Color.fromCssColorString(color) } });
      return { name, color, t };
    } catch { return { name, color, t: null }; }
  }));
  status.textContent = "";
  list.replaceChildren(...results.map(({ name, color, t }) => h("div", { class: "lens-layer" }, h("i", { style: `background:${color}` }),
    h("span", {}, h("strong", {}, `${name} side`), h("small", {}, t ? `${formatDistance(t.distance[t.distance.length - 1])} downhill · ${t.end === "sea" ? "reaches the sea" : t.end === "flat" ? "ends in a flat or a lake" : "keeps going beyond the analysis area"}` : "Couldn't trace")))));
}

/** The main surface currents, simplified (warm or cold). Schematic, not measured. */
export const CURRENTS: { name: string; warm: boolean; pts: Pt[] }[] = [
  { name: "Gulf Stream", warm: true, pts: [[-80, 25], [-80, 30], [-75, 35], [-65, 40], [-50, 42], [-40, 45]] },
  { name: "North Atlantic Drift", warm: true, pts: [[-40, 45], [-30, 50], [-20, 55], [-10, 58], [0, 62], [10, 68]] },
  { name: "Labrador Current", warm: false, pts: [[-60, 62], [-55, 55], [-52, 48], [-50, 43]] },
  { name: "Canary Current", warm: false, pts: [[-12, 40], [-15, 30], [-18, 22], [-20, 15]] },
  { name: "North Equatorial Current (Atlantic)", warm: true, pts: [[-20, 15], [-35, 15], [-50, 15], [-62, 16], [-75, 20]] },
  { name: "Brazil Current", warm: true, pts: [[-35, -8], [-38, -15], [-42, -25], [-50, -35]] },
  { name: "Benguela Current", warm: false, pts: [[15, -35], [12, -28], [10, -20], [5, -10]] },
  { name: "Agulhas Current", warm: true, pts: [[40, -15], [35, -25], [30, -32], [22, -38]] },
  { name: "Antarctic Circumpolar Current", warm: false, pts: [[-179, -58], [-120, -60], [-60, -58], [0, -52], [60, -50], [120, -52], [179, -58]] },
  { name: "Kuroshio", warm: true, pts: [[125, 20], [128, 26], [135, 32], [142, 36], [155, 38]] },
  { name: "Oyashio", warm: false, pts: [[165, 55], [155, 50], [148, 44], [145, 40]] },
  { name: "North Pacific Current", warm: true, pts: [[155, 38], [170, 40], [-170, 42], [-150, 44], [-135, 45]] },
  { name: "California Current", warm: false, pts: [[-130, 45], [-125, 38], [-120, 32], [-115, 25]] },
  { name: "Humboldt Current", warm: false, pts: [[-75, -40], [-75, -30], [-78, -18], [-82, -6]] },
  { name: "East Australian Current", warm: true, pts: [[155, -15], [154, -25], [152, -32], [155, -38]] },
  { name: "North Equatorial Current (Pacific)", warm: true, pts: [[-110, 12], [-140, 12], [-170, 13], [160, 13], [130, 15]] },
];

function currents(host: LensHost, ds: CustomDataSource) {
  const viewer = host.app.globe.viewer;
  for (const c of CURRENTS) {
    const color = Color.fromCssColorString(c.warm ? "#ff6b4a" : "#4aa8ff");
    ds.entities.add({ polyline: { positions: Cartesian3.fromDegreesArray(c.pts.flat()), width: 12, material: new PolylineArrowMaterialProperty(color.withAlpha(0.8)) } });
    // Water flowing along it.
    const dist = [0];
    for (let i = 1; i < c.pts.length; i++) dist.push(dist[i - 1] + haversine(c.pts[i - 1][0], c.pts[i - 1][1], c.pts[i][0], c.pts[i][1]));
    const L = dist[dist.length - 1];
    for (let k = 0; k < 8; k++) {
      const phase = k / 8;
      ds.entities.add({
        position: new CallbackProperty(() => {
          const d = (((performance.now() / 40_000 + phase) % 1) * L);
          const i = Math.max(1, dist.findIndex((x) => x >= d));
          const f = (d - dist[i - 1]) / (dist[i] - dist[i - 1] || 1);
          const a = c.pts[i - 1], b = c.pts[i];
          return Cartesian3.fromDegrees(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 20_000);
        }, false) as never,
        point: { pixelSize: 6, color: Color.WHITE.withAlpha(0.9), outlineColor: color, outlineWidth: 2 },
      });
    }
  }
  viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(host.app.place?.lon ?? -30, 20, 22_000_000), duration: 2 });
  host.body.replaceChildren(
    h("p", {}, "The great surface currents carry heat around the planet: warm water (red) flows away from the tropics, cold water (blue) back towards them."),
    h("div", { class: "lens-legend" }, ...CURRENTS.map((c) => h("div", { class: "lens-layer" }, h("i", { style: `background:${c.warm ? "#ff6b4a" : "#4aa8ff"}` }), h("span", {}, h("strong", {}, c.name), h("small", {}, c.warm ? "Warm" : "Cold"))))),
    h("p", { class: "muted small" }, "Simplified paths of the main currents, drawn by hand from standard maps; real currents meander and change with the seasons."),
  );
}

export const traceLens: Lens = {
  id: "trace",
  label: "Trace",
  icon: "〰️",
  blurb: "Follow the flow: a river to the sea, rain off a mountain, the ocean currents",
  score: (s) => ({ river: 1, lake: 0.8, sea: 0.9, coast: 0.8, peak: 0.8, volcano: 0.7, range: 0.8, glacier: 0.8, canyon: 0.8, crater: 0.4, island: 0.6, forest: 0.4, desert: 0.3, land: 0.5, city: 0.5 })[s.kind],
  async open(host, s) {
    const viewer = host.app.globe.viewer;
    const ds = new CustomDataSource("lens-trace");
    void viewer.dataSources.add(ds);
    host.onClose(() => viewer.dataSources.remove(ds, true));
    host.title("Trace", s.name);
    if (s.kind === "sea" || (s.kind === "coast" && s.elevation < 0)) return currents(host, ds);
    if ((s.kind === "river" || s.kind === "lake" || s.kind === "city" || s.kind === "land" || s.kind === "canyon") && (await traceRiver(host, s, ds))) return;
    await rainPaths(host, s, ds);
  },
};
