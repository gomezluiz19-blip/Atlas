// Anatomy: how a mountain, volcano, range or crater is put together. Its
// height, steepness and which way it faces; bands of life from forest to
// snow painted onto it (moved up or down for its latitude); and for craters,
// the rim, floor and shape.
import { Cartesian3, Color, CustomDataSource, LabelStyle, VerticalOrigin, Cartesian2 } from "cesium";
import { zoomForSpacing } from "../analysis/profile";
import { elevation } from "../data/elevation";
import { formatDistance, h } from "../ui/dom";
import { bar, lines, rose, stat } from "./charts";
import { demLayer } from "./demLayer";
import { ZONES, craterShape, reliefStats, snowline, treeline, zoneAt, type Zone } from "./landforms";
import { offset } from "./slice";
import type { Lens } from "./types";

const rgb = (c: [number, number, number]) => `rgb(${c.join(",")})`;
const m = (v: number) => `${Math.round(v).toLocaleString()} m`;

export const anatomyLens: Lens = {
  id: "anatomy",
  label: "Anatomy",
  icon: "📐",
  blurb: "Height, steepness, faces and bands of life from forest to snow",
  score: (s) => ({ peak: 1, volcano: 1, range: 0.95, crater: 1, canyon: 0.8, glacier: 0.8, island: 0.6, land: s.relief > 300 ? 0.6 : 0.3, desert: 0.4, river: 0.3, lake: 0.3, forest: 0.4, coast: 0.3, sea: 0, city: 0.2 })[s.kind],
  async open(host, s) {
    const { app } = host;
    const viewer = app.globe.viewer;
    const c = s.centre ?? [s.lon, s.lat];
    const R = Math.max(1500, s.radius), N = 121;
    const [, north] = offset(c[0], c[1], 0, R), [, south] = offset(c[0], c[1], 180, R), [east] = offset(c[0], c[1], 90, R), [west] = offset(c[0], c[1], 270, R);
    const pts: [number, number][] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([west + ((east - west) * i) / (N - 1), north - ((north - south) * j) / (N - 1)]);
    const cell = (2 * R) / (N - 1);
    const g = await elevation.sample(pts, Math.min(13, zoomForSpacing(cell, c[1])));
    const st = reliefStats(g, N, cell, c[1]);
    // Paint the bands of life onto the mountain.
    const layer = demLayer((hh, lat) => {
      if (hh <= 0) return null;
      const col = ZONES[zoneAt(hh, lat, st.base)].color;
      return [col[0], col[1], col[2], 150];
    }, { bbox: [west, south, east, north] });
    viewer.imageryLayers.add(layer);
    const ds = new CustomDataSource("lens-anatomy");
    void viewer.dataSources.add(ds);
    let sk = 0;
    for (let k = 0; k < N * N; k++) if (g[k] > g[sk]) sk = k;
    const top = pts[sk];
    ds.entities.add({ position: Cartesian3.fromDegrees(top[0], top[1], st.summit * app.globe.state.exaggeration), point: { pixelSize: 10, color: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: `${s.kind === "crater" ? "Highest point on the rim" : "Summit"} ${m(st.summit)}`, font: "700 13px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 4, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -10), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    host.onClose(() => { viewer.imageryLayers.remove(layer, true); viewer.dataSources.remove(ds, true); });

    const t = treeline(c[1]), sn = snowline(c[1]);
    const zones = (Object.keys(ZONES) as Zone[]).map((z) => ({ z, share: st.zones[z] }));
    const dirs = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
    const most = st.aspects.indexOf(Math.max(...st.aspects));
    const blocks: (Node | string)[] = [
      h("div", { class: "lens-stats" },
        stat(m(st.summit), "Highest point"), stat(m(st.relief), `Rise above the lowest ground within ${formatDistance(R)}`),
        stat(`${Math.round(st.meanSlope)}°`, "Average slope"), stat(`${Math.round(st.steepest)}°`, "Steepest slope")),
      h("h3", { class: "lens-sub" }, "Bands of life"),
      bar(zones.map(({ z, share }) => ({ share, color: rgb(ZONES[z].color), label: ZONES[z].label }))),
      h("div", { class: "lens-legend" }, ...zones.filter((z) => z.share > 0.005).map(({ z, share }) => h("div", { class: "lens-layer" }, h("i", { style: `background:${rgb(ZONES[z].color)}` }), h("span", {}, h("strong", {}, `${ZONES[z].label} · ${Math.round(share * 100)}%`), h("small", {}, ZONES[z].about))))),
      h("p", { class: "muted small" }, `At this latitude trees typically stop near ${m(t)} and snow lasts all year above about ${m(sn)}. Local climate moves these a lot; they're shown painted on the mountain.`),
      h("h3", { class: "lens-sub" }, "Which way it faces"),
      h("div", { class: "lens-row" }, rose(st.aspects), h("p", {}, `Most slopes face ${dirs[most]}. `, c[1] >= 0 ? "In the northern hemisphere south-facing slopes get the most sun: warmer, drier, with snow melting first." : "In the southern hemisphere north-facing slopes get the most sun: warmer, drier, with snow melting first.")),
      h("h3", { class: "lens-sub" }, "How the height is spread"),
      lines([{ values: st.hypsometry.map((v) => v * 100), color: "#8b5fa8" }], { yLabel: (v) => `${Math.round(v)}%`, xLabels: ["low", "summit"], fill: true }),
      h("p", { class: "muted small" }, `Share of the ground above each height. ${st.integral > 0.55 ? "A high, broad shape: a young mountain or a plateau, not yet worn down." : st.integral < 0.35 ? "Mostly low ground with a narrow top: an old, well-worn landscape or a lone peak." : "A balanced shape, partly worn by rivers and ice."}`),
    ];

    if (s.kind === "crater" || s.kind === "volcano") {
      const rays = 8, steps = 40, step = R / steps;
      const ray = await Promise.all(Array.from({ length: rays }, (_, k) => elevation.sample(Array.from({ length: steps }, (_, i) => offset(c[0], c[1], k * 45, i * step)), Math.min(13, zoomForSpacing(step, c[1]))).then((v) => Array.from(v))));
      const cr = craterShape(ray, step);
      // Only when there's a real bowl: a rim out from the centre, well above the floor.
      if (cr.diameter > 4 * step && cr.depth > 25) blocks.unshift(
        h("h3", { class: "lens-sub" }, s.kind === "crater" ? "The crater" : "The summit crater"),
        h("div", { class: "lens-stats" }, stat(formatDistance(cr.diameter), "Rim to rim"), stat(m(cr.depth), "Rim to floor"), stat(cr.ratio.toFixed(2), "Depth ÷ width")),
        lines(ray.map((p, i) => ({ values: p, color: `hsl(${i * 45},70%,55%)` })), { yLabel: (v) => `${Math.round(v)} m`, xLabels: ["centre", formatDistance(R)] }),
        h("p", { class: "muted small" }, cr.type === "simple" ? "A bowl about a fifth as deep as it is wide: the classic shape of a fresh, simple crater." : cr.type === "complex" ? "Wide and shallow for its size: big craters collapse into flat floors, often with a central peak." : "Shallow for its width: worn down, filled in, or a volcanic crater rather than an impact."));
      // Trace the rim on the globe.
      if (cr.diameter > 4 * step && cr.depth > 25) {
      const rimPts = ray.map((p, k) => { let i = 0; for (let q = 1; q < p.length; q++) if (p[q] > p[i]) i = q; return offset(c[0], c[1], k * 45, i * step); });
      ds.entities.add({ polyline: { positions: Cartesian3.fromDegreesArray([...rimPts, rimPts[0]].flat()), width: 3, clampToGround: true, material: Color.fromCssColorString("#e1b843") } });
      }
    }
    host.title("Anatomy", s.name);
    host.body.replaceChildren(...blocks);
  },
};
