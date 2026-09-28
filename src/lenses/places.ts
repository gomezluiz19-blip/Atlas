// Three lenses for places people use: Forest, Transit and True size.
import { ArcType, CallbackProperty, Cartesian3, Color, CustomDataSource, PolygonHierarchy } from "cesium";
import { countryAt } from "../data/countries";
import { haversine } from "../data/mercator";
import { speciesCounts } from "../data/inaturalist";
import { formatArea, formatDistance, h } from "../ui/dom";
import { areaM2 } from "../work/geo";
import { bar, stat } from "./charts";
import { areaContaining, forestsAround, transitAround, type Ring } from "./osm";
import { chain } from "./trace";
import type { Lens, Subject } from "./types";
import { featureFor } from "../content/features";
import { factCard, factsFor } from "./facts";

const LEAF: Record<string, { label: string; color: string }> = {
  broadleaved: { label: "Broadleaf (oak, beech, maple…)", color: "#7cc84a" },
  needleleaved: { label: "Conifer (pine, spruce, fir…)", color: "#1f7a5c" },
  mixed: { label: "Mixed", color: "#3fa05a" },
  unknown: { label: "Type not mapped", color: "#58b368" },
};

const poly = (ds: CustomDataSource, ring: Ring, fill: string, alpha: number, outline = fill, width = 2) => {
  ds.entities.add({ polygon: { hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(ring.flat())), material: Color.fromCssColorString(fill).withAlpha(alpha) } });
  ds.entities.add({ polyline: { positions: Cartesian3.fromDegreesArray([...ring, ring[0]].flat()), width, clampToGround: true, material: Color.fromCssColorString(outline) } });
};

export const forestLens: Lens = {
  id: "forest",
  label: "Forest",
  icon: "🌲",
  blurb: "The woods around: broadleaf or conifer, how much cover, which trees",
  score: (s) => ({ forest: 1, peak: 0.5, range: 0.5, volcano: 0.4, land: 0.55, river: 0.5, lake: 0.5, city: 0.4, canyon: 0.3, crater: 0.3, glacier: 0.2, coast: 0.4, island: 0.5, desert: 0.1, sea: 0 })[s.kind],
  async open(host, s) {
    const viewer = host.app.globe.viewer;
    const ds = new CustomDataSource("lens-forest");
    void viewer.dataSources.add(ds);
    host.onClose(() => viewer.dataSources.remove(ds, true));
    const R = Math.max(2000, Math.min(8000, s.radius));
    host.title("Forest", `${s.name} · within ${formatDistance(R)}`);
    host.body.replaceChildren(h("p", { class: "muted small" }, "Finding the woods on OpenStreetMap…"));
    const shapes = await forestsAround(s.lon, s.lat, R).catch(() => null);
    if (!shapes) { host.body.replaceChildren(h("p", { class: "pro-warn" }, "Couldn't reach OpenStreetMap. Try again in a moment.")); return; }
    const byType: Record<string, number> = { broadleaved: 0, needleleaved: 0, mixed: 0, unknown: 0 };
    let total = 0, evergreen = 0, deciduous = 0;
    const named = new Map<string, number>();
    for (const f of shapes) {
      const type = f.tags.leaf_type in LEAF ? f.tags.leaf_type : "unknown";
      const a = f.rings.reduce((t, r) => t + areaM2(r), 0);
      byType[type] += a;
      total += a;
      if (f.tags.leaf_cycle === "evergreen") evergreen += a;
      if (f.tags.leaf_cycle === "deciduous") deciduous += a;
      if (f.name) named.set(f.name, (named.get(f.name) ?? 0) + a);
      for (const r of f.rings) poly(ds, r, LEAF[type].color, 0.45, LEAF[type].color, 1.5);
    }
    const circle = Math.PI * R * R;
    const cover = Math.min(1, total / circle);
    const trees = await speciesCounts({ lon: s.lon, lat: s.lat, radiusKm: R / 1000 }, "taxon_id=136329", { perPage: 8 }).catch(() => ({ total: 0, results: [] }));
    const flowering = await speciesCounts({ lon: s.lon, lat: s.lat, radiusKm: R / 1000 }, "taxon_id=47125", { perPage: 6 }).catch(() => ({ total: 0, results: [] }));
    host.body.replaceChildren(
      h("div", { class: "lens-stats" }, stat(`${Math.round(cover * 100)}%`, "Wooded (mapped)"), stat(formatArea(total), "Of woodland"), stat(String(shapes.length), "Woods and forests")),
      bar((Object.keys(LEAF)).map((k) => ({ share: total ? byType[k] / total : 0, color: LEAF[k].color, label: LEAF[k].label }))),
      h("div", { class: "lens-legend" }, ...Object.keys(LEAF).filter((k) => byType[k] > 0).map((k) => h("div", { class: "lens-layer" }, h("i", { style: `background:${LEAF[k].color}` }), h("span", {}, h("strong", {}, `${LEAF[k].label} · ${Math.round((byType[k] / total) * 100)}%`))))),
      evergreen + deciduous ? h("p", { class: "small" }, `Where it's recorded: ${Math.round((evergreen / (evergreen + deciduous)) * 100)}% evergreen, ${Math.round((deciduous / (evergreen + deciduous)) * 100)}% loses its leaves in winter.`) : "",
      named.size ? h("p", { class: "small" }, "Named woods: ", [...named].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n).join(", "), ".") : "",
      trees.results.length || flowering.results.length ? h("h3", { class: "lens-sub" }, "Trees and plants people have recorded here") : "",
      h("div", { class: "lens-species" }, ...[...trees.results, ...flowering.results].slice(0, 12).map((r) => h("div", { class: "lens-sp" },
        r.taxon.default_photo?.square_url ? h("img", { src: r.taxon.default_photo.square_url, alt: "" }) : h("span", {}, "🌿"),
        h("span", {}, h("strong", {}, r.taxon.preferred_common_name ?? r.taxon.name), h("small", {}, `${r.count} records`))))),
      h("div", { class: "pro-actions" },
        h("button", { class: "pill-btn", onclick: () => host.app.actions.get("work:ndvi")?.run() }, "Greenness from space (NDVI)"),
        h("button", { class: "pill-btn", onclick: () => { host.close(); host.app.actions.get("lens:rewind")?.run(); } }, "See it change (Rewind)")),
      h("p", { class: "muted small" }, "Woods as mapped on OpenStreetMap (coverage varies by country); tree records from iNaturalist."),
    );
  },
};

export const transitLens: Lens = {
  id: "transit",
  label: "Transit",
  icon: "🚇",
  blurb: "The metro: lines in their colours, stations, trains moving, underground view",
  score: (s) => (s.kind === "city" ? 1 : s.kind === "land" || s.kind === "coast" || s.kind === "river" ? 0.35 : 0),
  async open(host, s) {
    const { app } = host;
    const viewer = app.globe.viewer;
    const ds = new CustomDataSource("lens-transit");
    void viewer.dataSources.add(ds);
    const R = Math.max(8000, Math.min(25_000, s.radius * 1.5));
    let under = false;
    const scene = viewer.scene;
    const restore = () => { scene.globe.translucency.enabled = false; scene.screenSpaceCameraController.enableCollisionDetection = true; };
    host.onClose(() => { viewer.dataSources.remove(ds, true); restore(); });
    host.title("Transit", `${s.name} · metro and light rail`);
    host.body.replaceChildren(h("p", { class: "muted small" }, "Loading the network from OpenStreetMap…"));
    const net = await transitAround(s.lon, s.lat, R).catch(() => null);
    if (!net) { host.body.replaceChildren(h("p", { class: "pro-warn" }, "Couldn't reach OpenStreetMap. Try again in a moment.")); return; }
    if (!net.lines.length) { host.body.replaceChildren(h("p", {}, `No metro or light rail is mapped within ${formatDistance(R)} of here.`), h("p", { class: "muted small" }, "Try a big city: London, Paris, Tokyo, New York, Mexico City, Seoul.")); return; }
    const depth = -35;
    const draw = () => {
      ds.entities.removeAll();
      let km = 0;
      for (const l of net.lines) {
        const col = Color.fromCssColorString(l.colour);
        for (const p of l.pieces) {
          for (let i = 1; i < p.length; i++) km += haversine(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) / 1000;
          ds.entities.add(under
            ? { polyline: { positions: p.map(([x, y]) => Cartesian3.fromDegrees(x, y, depth)), width: 6, material: col, depthFailMaterial: col.withAlpha(0.75), arcType: ArcType.NONE } }
            : { polyline: { positions: Cartesian3.fromDegreesArray(p.flat()), width: 5, clampToGround: true, material: col } });
        }
        // A few trains running along the longest joined stretch.
        const path = chain(l.pieces, l.pieces.reduce((bi, p, i, arr) => (p.length > arr[bi].length ? i : bi), 0));
        const dist = [0];
        for (let i = 1; i < path.length; i++) dist.push(dist[i - 1] + haversine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]));
        const L = dist[dist.length - 1];
        if (L < 500) continue;
        for (let k = 0; k < Math.min(6, Math.ceil(L / 4000)); k++) {
          const phase = k / Math.min(6, Math.ceil(L / 4000)), dir = k % 2;
          ds.entities.add({
            position: new CallbackProperty(() => {
              let f = ((performance.now() / 1000) * 400 / L + phase) % 1; // ~400 m/s: sped up
              if (dir) f = 1 - f;
              const d = f * L;
              const i = Math.max(1, dist.findIndex((x) => x >= d));
              const u = (d - dist[i - 1]) / (dist[i] - dist[i - 1] || 1);
              return Cartesian3.fromDegrees(path[i - 1][0] + (path[i][0] - path[i - 1][0]) * u, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * u, under ? depth + 3 : 25);
            }, false) as never,
            point: { pixelSize: 9, color: Color.WHITE, outlineColor: col, outlineWidth: 3, disableDepthTestDistance: under ? 0 : Number.POSITIVE_INFINITY },
          });
        }
      }
      for (const st of net.stations) {
        ds.entities.add(under
          ? { polyline: { positions: [Cartesian3.fromDegrees(st.lon, st.lat, depth), Cartesian3.fromDegrees(st.lon, st.lat, 40)], width: 3, material: Color.WHITE.withAlpha(0.8), depthFailMaterial: Color.WHITE.withAlpha(0.5), arcType: ArcType.NONE } }
          : { position: Cartesian3.fromDegrees(st.lon, st.lat), point: { pixelSize: 6, color: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
      }
      return km;
    };
    const km = draw();
    const setUnder = (on: boolean) => {
      under = on;
      scene.globe.translucency.enabled = on;
      scene.globe.translucency.frontFaceAlpha = 0.35;
      scene.globe.undergroundColor = Color.fromCssColorString("#2a241e");
      scene.screenSpaceCameraController.enableCollisionDetection = !on;
      draw();
      if (on) viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(s.lon, s.lat - 0.06, 3500), orientation: { heading: 0, pitch: -0.45, roll: 0 }, duration: 2 });
    };
    // Interchanges: stations near two or more lines.
    const near = (st: { lon: number; lat: number }, l: typeof net.lines[0]) => l.pieces.some((p) => p.some(([x, y]) => Math.abs(x - st.lon) < 0.0025 && Math.abs(y - st.lat) < 0.0018 && haversine(x, y, st.lon, st.lat) < 180));
    const hubs = net.stations.slice(0, 400).map((st) => ({ st, n: net.lines.filter((l) => near(st, l)).length })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6);
    const system = featureFor({ lon: s.lon, lat: s.lat, kinds: ["metro"], withinKm: 40 });
    host.body.replaceChildren(
      system && system !== factsFor(s) ? factCard(system, true) : "",
      h("div", { class: "lens-stats" }, stat(String(net.lines.length), "Lines"), stat(String(net.stations.length), "Stations"), stat(`${Math.round(km / 2)} km`, "Of line (roughly)")),
      h("div", { class: "chips wrap" },
        h("button", { class: "chip", onclick: (e: Event) => { setUnder(!under); (e.currentTarget as HTMLElement).classList.toggle("on", under); } }, "Underground view"),
        h("button", { class: "chip", onclick: () => viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(s.lon, s.lat, R * 2.2), duration: 1.5 }) }, "Whole network")),
      h("div", { class: "lens-legend" }, ...net.lines.sort((a, b) => (a.ref || a.name).localeCompare(b.ref || b.name, undefined, { numeric: true })).slice(0, 30).map((l) => h("div", { class: "lens-layer" }, h("i", { style: `background:${l.colour}` }), h("span", {}, h("strong", {}, l.ref && !l.name.includes(l.ref) ? `${l.ref} · ${l.name}` : l.name), h("small", {}, l.mode.replace("_", " ")))))),
      hubs.length ? h("p", { class: "small" }, "Busiest interchanges: ", hubs.map((x) => `${x.st.name} (${x.n} lines)`).join(", "), ".") : "",
      h("p", { class: "muted small" }, "From OpenStreetMap. Trains are illustrative, sped up and not a timetable. The underground view makes the ground see-through and draws the lines below the streets (depths are typical, not surveyed)."),
    );
  },
};

// ---- True size ------------------------------------------------------------------------------

const TARGETS: [string, number, number][] = [["London", -0.12, 51.5], ["New York", -73.98, 40.75], ["Tokyo", 139.76, 35.68], ["Lagos", 3.39, 6.45], ["São Paulo", -46.63, -23.55], ["Mumbai", 72.88, 19.08], ["Sydney", 151.21, -33.87], ["Santo Domingo", -69.93, 18.49]];
const UNITS: [number, string][] = [[7140, "football pitches"], [3.41e6, "Central Parks"], [59.1e6, "Manhattans"], [1572e6, "Greater Londons"], [20_779e6, "Waleses"], [242_495e6, "United Kingdoms"], [695_662e6, "Texases"]];

/** "about 3.2 Manhattans": the unit closest to 1–20 of it. */
export function compare(area: number): string {
  let best = UNITS[0];
  for (const u of UNITS) if (area / u[0] >= 0.8) best = u;
  const n = area / best[0];
  return `about ${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString()} ${best[1]}`;
}

/** Moves rings from their centre to a new centre, keeping true distances. */
export function moveRings(rings: Ring[], to: [number, number]): Ring[] {
  const all = rings.flat();
  const lon0 = all.reduce((s, p) => s + p[0], 0) / all.length, lat0 = all.reduce((s, p) => s + p[1], 0) / all.length;
  const kx0 = 111_320 * Math.cos((lat0 * Math.PI) / 180), ky = 110_540;
  return rings.map((r) => r.map(([x, y]) => {
    const e = (x - lon0) * kx0, n = (y - lat0) * ky;
    const lat = to[1] + n / ky;
    return [to[0] + e / (111_320 * Math.cos((lat * Math.PI) / 180)), lat] as [number, number];
  }));
}

const circleRing = (s: Subject): Ring => Array.from({ length: 64 }, (_, i) => { const a = (i / 64) * Math.PI * 2; return [s.lon + (Math.sin(a) * s.radius) / (111_320 * Math.cos((s.lat * Math.PI) / 180)), s.lat + (Math.cos(a) * s.radius) / 110_540] as [number, number]; });

export const sizeLens: Lens = {
  id: "size",
  label: "True size",
  icon: "📏",
  blurb: "Pick it up and drop it anywhere, at its real size",
  score: (s) => ({ lake: 1, sea: 0.8, crater: 0.9, forest: 0.8, city: 0.9, island: 0.9, desert: 0.8, range: 0.6, glacier: 0.8, volcano: 0.6, peak: 0.4, river: 0.3, canyon: 0.6, coast: 0.3, land: 0.5 })[s.kind],
  async open(host, s) {
    const { app } = host;
    const viewer = app.globe.viewer;
    const ds = new CustomDataSource("lens-size");
    void viewer.dataSources.add(ds);
    host.onClose(() => { viewer.dataSources.remove(ds, true); app.cancelPick(); });
    host.title("True size", s.name);
    host.body.replaceChildren(h("p", { class: "muted small" }, "Finding its outline…"));
    // The outline: the mapped area it's in, the country, or a circle of its size.
    let name = s.name, rings: Ring[] = [];
    const options: { label: string; rings: Ring[] }[] = [];
    const found = await areaContaining(s.lon, s.lat).catch(() => []);
    for (const f of found) options.push({ label: f.name || f.tags.natural || f.tags.leisure || "Mapped area", rings: f.rings });
    const country = await countryAt(s.lon, s.lat).catch(() => null);
    if (country) options.push({ label: country.name, rings: country.polygons.map((p) => p[0]) });
    options.push({ label: `A circle ${formatDistance(s.radius * 2)} across`, rings: [circleRing(s)] });
    options.sort((a, b) => a.rings.reduce((t, r) => t + areaM2(r), 0) - b.rings.reduce((t, r) => t + areaM2(r), 0));
    ({ label: name, rings } = options[0]);
    const info = h("div", {});
    const drawAt = (to: [number, number] | null) => {
      ds.entities.removeAll();
      for (const r of rings) poly(ds, r, "#ffd60a", 0.25, "#ffd60a", 3);
      if (!to) return;
      const moved = moveRings(rings, to);
      for (const r of moved) poly(ds, r, "#ff375f", 0.3, "#ff375f", 3);
      const all = moved.flat();
      const lons = all.map((p) => p[0]), lats = all.map((p) => p[1]);
      const span = Math.max(haversine(Math.min(...lons), to[1], Math.max(...lons), to[1]), haversine(to[0], Math.min(...lats), to[0], Math.max(...lats)));
      viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(to[0], to[1], Math.max(3000, span * 2.2)), duration: 2 });
    };
    const area = () => rings.reduce((t, r) => t + areaM2(r), 0);
    const render = () => {
      info.replaceChildren(
        h("div", { class: "lens-stats" }, stat(formatArea(area()), name), stat(compare(area()).replace(/^about /, "≈ "), "For scale")),
        h("p", {}, "Drop it on:"),
        h("div", { class: "chips wrap" },
          h("button", { class: "chip on", onclick: () => { host.body.classList.add("picking"); app.pickOnce("Tap where to drop it", (p) => drawAt([p.lon, p.lat])); } }, "Tap on the map…"),
          ...TARGETS.map(([n, lon, lat]) => h("button", { class: "chip", onclick: () => drawAt([lon, lat]) }, n))),
        options.length > 1 ? h("label", { class: "mp-field" }, h("span", {}, "Shape"),
          h("select", { onchange: (e: Event) => { const o = options[Number((e.target as HTMLSelectElement).value)]; name = o.label; rings = o.rings; drawAt(null); render(); } }, ...options.map((o, i) => h("option", { value: String(i), selected: o.label === name }, `${o.label} (${formatArea(o.rings.reduce((t, r) => t + areaM2(r), 0))})`)))) : "",
        h("p", { class: "muted small" }, "Yellow is where it really is; red is the copy you dropped, the same size on the ground (flat maps stretch places near the poles; the globe doesn't)."),
      );
    };
    host.body.replaceChildren(info);
    render();
    drawAt(null);
  },
};
