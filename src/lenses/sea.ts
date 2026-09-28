// Two lenses for the sea. Seafloor: the zones of the ocean floor from the
// shallow shelf to the trenches, a profile across, and the deepest point
// nearby. Sea level: raise or drain the oceans and watch coasts drown or the
// seabed appear (ice-age land bridges at −120 m, the whole shelf at −200 m).
import { Cartesian2, Cartesian3, Color, CustomDataSource, LabelStyle, VerticalOrigin } from "cesium";
import { zoomForSpacing } from "../analysis/profile";
import { elevation } from "../data/elevation";
import { greatCirclePoints } from "../data/mercator";
import { formatArea, formatDistance, h } from "../ui/dom";
import { bar, lines, stat } from "./charts";
import { demLayer } from "./demLayer";
import { SEA_ZONES, seaZone, type SeaZone } from "./landforms";
import { offset } from "./slice";
import type { Lens, Subject } from "./types";
import { featureFor } from "../content/features";
import { factCard, factsFor } from "./facts";

const rgb = (c: [number, number, number]) => `rgb(${c.join(",")})`;

async function grid(s: Subject, R: number, N = 81) {
  const [, north] = offset(s.lon, s.lat, 0, R), [, south] = offset(s.lon, s.lat, 180, R), [east] = offset(s.lon, s.lat, 90, R), [west] = offset(s.lon, s.lat, 270, R);
  const pts: [number, number][] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([west + ((east - west) * i) / (N - 1), north - ((north - south) * j) / (N - 1)]);
  const cell = (2 * R) / (N - 1);
  const v = await elevation.sample(pts, Math.min(11, zoomForSpacing(cell, s.lat)));
  return { pts, v, cell, bbox: [west, south, east, north] as [number, number, number, number] };
}

export const seafloorLens: Lens = {
  id: "seafloor",
  label: "Seafloor",
  icon: "🐋",
  blurb: "The ocean floor's zones, a profile across, and the deepest point",
  score: (s) => (s.kind === "sea" ? 1 : s.kind === "coast" || s.kind === "island" ? 0.7 : s.elevation < 0 ? 0.8 : 0),
  async open(host, s) {
    const { app } = host;
    const viewer = app.globe.viewer;
    const layer = demLayer((hh) => { const z = seaZone(hh); if (!z) return null; const c = SEA_ZONES[z].color; return [c[0], c[1], c[2], 200]; }, { maxLevel: 10 });
    viewer.imageryLayers.add(layer);
    const ds = new CustomDataSource("lens-seafloor");
    void viewer.dataSources.add(ds);
    host.onClose(() => { viewer.imageryLayers.remove(layer, true); viewer.dataSources.remove(ds, true); });
    const R = Math.max(50_000, Math.min(1_500_000, s.radius));
    const { pts, v, cell } = await grid(s, R);
    let deep = 0, sea = 0;
    const share: Record<SeaZone, number> = { shelf: 0, slope: 0, rise: 0, abyss: 0, trench: 0 };
    for (let k = 0; k < v.length; k++) { if (v[k] < v[deep]) deep = k; const z = seaZone(v[k]); if (z) { share[z]++; sea++; } }
    for (const z of Object.keys(share) as SeaZone[]) share[z] /= sea || 1;
    ds.entities.add({ position: Cartesian3.fromDegrees(pts[deep][0], pts[deep][1]), point: { pixelSize: 10, color: Color.fromCssColorString("#ff375f"), outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: `Deepest nearby: ${Math.round(-v[deep]).toLocaleString()} m`, font: "700 13px -apple-system, system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 4, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -10), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    // A profile across, east to west through the point.
    const a = offset(s.lon, s.lat, 270, R), b = offset(s.lon, s.lat, 90, R);
    const line = greatCirclePoints(a[0], a[1], b[0], b[1], 200);
    const prof = Array.from(await elevation.sample(line, Math.min(10, zoomForSpacing((2 * R) / 200, s.lat))));
    ds.entities.add({ polyline: { positions: Cartesian3.fromDegreesArray(line.filter((_, i) => i % 4 === 0).flat()), width: 3, clampToGround: true, material: Color.fromCssColorString("#ffd60a") } });
    const zones = Object.keys(SEA_ZONES) as SeaZone[];
    const avg = v.reduce((t, x) => t + Math.min(0, x), 0) / (sea || 1);
    host.title("Seafloor", s.name);
    const trench = featureFor({ lon: s.lon, lat: s.lat, kinds: ["deep"], withinKm: Math.max(600, R / 1000 * 1.5) });
    host.body.replaceChildren(
      trench && trench !== factsFor(s) ? factCard(trench) : "",
      h("div", { class: "lens-stats" }, stat(`${Math.round(-v[deep]).toLocaleString()} m`, "Deepest point nearby"), stat(`${Math.round(-avg).toLocaleString()} m`, "Average depth"), stat(`${Math.round((sea / v.length) * 100)}%`, `Sea within ${formatDistance(R)}`)),
      h("h3", { class: "lens-sub" }, "Profile, west to east"),
      lines([{ values: prof, color: "#2f6aa3" }], { yLabel: (x) => `${Math.round(x)} m`, xLabels: ["W", `E · ${formatDistance(2 * R)}`], fill: true }),
      h("h3", { class: "lens-sub" }, "Zones of the ocean floor"),
      bar(zones.map((z) => ({ share: share[z], color: rgb(SEA_ZONES[z].color), label: SEA_ZONES[z].label }))),
      h("div", { class: "lens-legend" }, ...zones.map((z) => h("div", { class: "lens-layer" }, h("i", { style: `background:${rgb(SEA_ZONES[z].color)}` }), h("span", {}, h("strong", {}, `${SEA_ZONES[z].label} · ${SEA_ZONES[z].depth}${share[z] ? ` · ${Math.round(share[z] * 100)}%` : ""}`), h("small", {}, SEA_ZONES[z].about))))),
      h("p", { class: "muted small" }, `Depths from the global elevation model (seafloor mapped at about ${Math.round(cell / 1000)} km detail here; much of the ocean floor is still mapped only from space).`),
    );
  },
};

const PRESETS: [number, string][] = [
  [66, "All ice melted"], [7, "Greenland melted"], [1, "About 2100 (high)"], [0, "Today"], [-120, "Last ice age"], [-200, "Shelves dry"], [-2000, "Drain 2 km"], [-6000, "Drain to the abyss"],
];

export const seaLevelLens: Lens = {
  id: "sealevel",
  label: "Sea level",
  icon: "🌊",
  blurb: "Raise or drain the oceans: drowned coasts, ice-age land bridges",
  score: (s) => (s.kind === "sea" || s.kind === "coast" || s.kind === "island" ? 1 : s.elevation < 150 ? 0.7 : s.kind === "city" ? 0.5 : 0.25),
  async open(host, s) {
    const { app } = host;
    const viewer = app.globe.viewer;
    let level = s.elevation < 0 ? -120 : 7;
    let layer: ReturnType<typeof demLayer> | null = null;
    const paint = () => {
      if (layer) viewer.imageryLayers.remove(layer, true);
      const L = level;
      layer = demLayer((hh) => {
        if (L >= 0) return hh >= 0 && hh < L ? [30, 120, 220, 170] : null;
        if (hh < 0 && hh >= L) { const t = Math.min(1, -hh / Math.max(200, -L)); return [Math.round(214 - 60 * t), Math.round(190 - 50 * t), Math.round(140 - 30 * t), 225]; }
        return null;
      }, { maxLevel: s.radius < 30_000 ? 13 : 10 });
      viewer.imageryLayers.add(layer);
    };
    host.onClose(() => { if (layer) viewer.imageryLayers.remove(layer, true); });
    const R = Math.max(20_000, Math.min(600_000, s.radius * 3));
    const { v, cell } = await grid(s, R, 101);
    const cellArea = cell * cell;
    const readout = h("div", { class: "lens-stats" });
    const label = h("strong", { class: "lens-level" });
    const slider = h("input", { type: "range", min: 0, max: 1000, "aria-label": "Sea level" }) as HTMLInputElement;
    // The slider is stretched: fine steps near today, big steps into the deep.
    const toLevel = (t: number) => (t >= 500 ? Math.round(((t - 500) / 500) ** 2 * 80) : -Math.round(((500 - t) / 500) ** 2.5 * 11000));
    const toT = (L: number) => (L >= 0 ? 500 + Math.sqrt(L / 80) * 500 : 500 - Math.pow(-L / 11000, 1 / 2.5) * 500);
    const update = () => {
      label.textContent = level === 0 ? "Today's sea level" : `${level > 0 ? "+" : "−"}${Math.abs(level).toLocaleString()} m`;
      let changed = 0;
      for (const x of v) if (level >= 0 ? x >= 0 && x < level : x < 0 && x >= level) changed++;
      readout.replaceChildren(stat(formatArea(changed * cellArea), level >= 0 ? "Land under water, nearby" : "Seabed out of the water, nearby"), stat(`${Math.round((changed / v.length) * 100)}%`, `of the area within ${formatDistance(R)}`));
    };
    let t = 0;
    slider.value = String(toT(level));
    slider.addEventListener("input", () => { level = toLevel(Number(slider.value)); update(); clearTimeout(t); t = window.setTimeout(paint, 250); });
    const setLevel = (L: number) => { level = L; slider.value = String(toT(L)); update(); paint(); };
    host.title("Sea level", s.name);
    host.body.replaceChildren(
      h("div", { class: "lens-level-row" }, label), slider,
      h("div", { class: "chips wrap" }, ...PRESETS.map(([L, name]) => h("button", { class: "chip", onclick: () => setLevel(L) }, name))),
      readout,
      h("p", { class: "muted small" }, "Blue: land the sea would cover. Sand: seabed that would be dry land. About 20,000 years ago sea level was ~120 m lower: Britain joined Europe and Asia joined Alaska. If all the ice on land melted it would rise about 66 m."),
      h("p", { class: "muted small" }, "A simple 'bathtub' model: it ignores defences, land rising or sinking, and how fast water gets in. Not a flood forecast."),
    );
    update();
    paint();
  },
};
