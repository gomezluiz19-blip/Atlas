// Slice: cut straight through the feature and see the rock inside, hung in 3D
// under see-through ground and drawn as a figure. The cut lines itself up with
// the feature (across a range, through a summit or a crater's middle) and can
// be turned and lengthened.
import { Cartesian3, Color, CustomDataSource, PolylineGlowMaterialProperty } from "cesium";
import { elevation } from "../data/elevation";
import { greatCirclePoints } from "../data/mercator";
import { Curtain } from "../globe/curtain";
import { formatDistance, h } from "../ui/dom";
import { buildSection, paintSection, type Section } from "./geomodel";
import type { Lens, Subject } from "./types";

const R = 6371000;
/** The point `d` metres from (lon, lat) on a bearing (degrees). */
export function offset(lon: number, lat: number, bearingDeg: number, d: number): [number, number] {
  const δ = d / R, θ = (bearingDeg * Math.PI) / 180, φ1 = (lat * Math.PI) / 180, λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

/**
 * The direction the ground falls away most consistently (degrees), from a grid
 * of elevations: across a ridge or valley rather than along it.
 */
export function dominantBearing(grid: ArrayLike<number>, size: number): number {
  let sxx = 0, syy = 0, sxy = 0;
  for (let j = 1; j < size - 1; j++) for (let i = 1; i < size - 1; i++) {
    const gx = grid[j * size + i + 1] - grid[j * size + i - 1];
    const gy = grid[(j - 1) * size + i] - grid[(j + 1) * size + i]; // north is up
    sxx += gx * gx; syy += gy * gy; sxy += gx * gy;
  }
  // Principal axis of the gradient structure tensor.
  const θ = 0.5 * Math.atan2(2 * sxy, sxx - syy); // from east, counter-clockwise
  return ((90 - (θ * 180) / Math.PI) % 180 + 180) % 180;
}

async function autoBearing(s: Subject): Promise<number> {
  if (s.kind === "crater" || s.kind === "sea") return 90;
  const N = 15, pts: [number, number][] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const [lon] = offset(s.lon, s.lat, 90, ((i / (N - 1)) * 2 - 1) * s.radius);
    const [, lat] = offset(s.lon, s.lat, 0, (1 - (j / (N - 1)) * 2) * s.radius);
    pts.push([lon, lat]);
  }
  try {
    const v = await elevation.sample(pts, s.radius > 20_000 ? 9 : 12);
    return dominantBearing(v, N);
  } catch {
    return 90;
  }
}

export const sliceLens: Lens = {
  id: "slice",
  label: "Slice",
  icon: "🔪",
  blurb: "Cut it open and see the rock layers inside",
  score: (s) => ({ peak: 1, volcano: 1, range: 1, crater: 0.95, canyon: 1, river: 0.7, glacier: 0.7, island: 0.7, sea: 0.6, lake: 0.5, coast: 0.6, desert: 0.7, forest: 0.4, land: 0.7, city: 0.3 })[s.kind],
  async open(host, s) {
    const { app } = host;
    const viewer = app.globe.viewer;
    const ds = new CustomDataSource("lens-slice");
    void viewer.dataSources.add(ds);
    const curtain = new Curtain(viewer);
    host.onClose(() => { curtain.clear(); viewer.dataSources.remove(ds, true); app.drawer.hide(); });
    const centre = s.centre ?? [s.lon, s.lat];
    let bearing = await autoBearing(s);
    let length = Math.min(250_000, Math.max(2500, s.radius * 2.4));
    let section: Section | null = null, job = 0, highlight: number | null = null;

    const figure = h("div", { class: "lens-figure" });
    const legend = h("div", { class: "lens-legend" });
    const status = h("p", { class: "muted small" }, "Cutting…");
    const note = h("p", { class: "muted small" });
    const angle = h("input", { type: "range", min: 0, max: 179, value: Math.round(bearing), "aria-label": "Direction of the cut" }) as HTMLInputElement;
    const len = h("input", { type: "range", min: 0, max: 100, value: 50, "aria-label": "Length of the cut" }) as HTMLInputElement;
    const angleLabel = h("span", {}), lenLabel = h("span", {});
    const baseLen = length;

    const line = () => {
      const a = offset(centre[0], centre[1], bearing + 180, length / 2), b = offset(centre[0], centre[1], bearing, length / 2);
      return greatCirclePoints(a[0], a[1], b[0], b[1], 360);
    };
    const drawLine = (pts: [number, number][]) => {
      ds.entities.removeAll();
      ds.entities.add({ polyline: { positions: Cartesian3.fromDegreesArray(pts.filter((_, i) => i % 6 === 0).flat()), width: 7, clampToGround: true, material: new PolylineGlowMaterialProperty({ glowPower: 0.25, color: Color.fromCssColorString("#ffd60a") }) } });
    };
    const drawFigure = () => {
      if (!section) return;
      const c = paintSection(section, 760, 300, "figure", highlight);
      c.className = "lens-canvas";
      const L = section.distance[section.distance.length - 1];
      let zmax = -Infinity;
      for (const v of section.elevation) zmax = Math.max(zmax, v);
      figure.replaceChildren(c, h("div", { class: "lens-axis" }, h("span", {}, "0"), h("span", {}, `${formatDistance(L)} · ground ${Math.round(Math.min(...section.elevation))}–${Math.round(zmax)} m · drawn to ${Math.round(section.bottom)} m`)));
      legend.replaceChildren(...section.layers.map((l, i) => h("button", { class: "lens-layer" + (highlight === i ? " on" : ""), onclick: () => { highlight = highlight === i ? null : i; drawFigure(); show3d(); } },
        h("i", { style: `background:${l.color}` }), h("span", {}, h("strong", {}, l.name), h("small", {}, [l.age, l.about].filter(Boolean).join(" · "))))));
      note.textContent = section.note;
    };
    const show3d = () => {
      if (!section) return;
      const tex = paintSection(section, 1024, 512, "wall", highlight);
      const ex = app.globe.state.exaggeration;
      curtain.showTexture(section.points, section.elevation, section.bottom, ex, tex, (i) => Math.max(section!.elevation[i], 0));
    };
    const run = async () => {
      const my = ++job;
      angleLabel.textContent = `${Math.round(bearing)}°`;
      lenLabel.textContent = formatDistance(length);
      const pts = line();
      drawLine(pts);
      status.textContent = "Cutting…";
      try {
        const sec = await buildSection(pts, { surfaceSamples: 20 });
        if (my !== job) return;
        section = sec;
        status.textContent = "";
        drawFigure();
        show3d();
        curtain.frame(pts, sec.distance, sec.elevation, app.globe.state.exaggeration);
      } catch (e) {
        if (my === job) status.textContent = `Couldn't read the ground or the rocks here (${(e as Error).message}).`;
      }
    };
    let t = 0;
    const later = () => { clearTimeout(t); t = window.setTimeout(() => void run(), 500); };
    angle.addEventListener("input", () => { bearing = Number(angle.value); angleLabel.textContent = `${bearing}°`; drawLine(line()); later(); });
    len.addEventListener("input", () => { length = baseLen * Math.pow(4, (Number(len.value) - 50) / 50); lenLabel.textContent = formatDistance(length); drawLine(line()); later(); });

    host.title("Slice", s.name);
    host.body.replaceChildren(
      status, figure,
      h("div", { class: "lens-controls" },
        h("label", {}, h("span", {}, "Turn the cut"), angle, angleLabel),
        h("label", {}, h("span", {}, "Length"), len, lenLabel)),
      h("h3", { class: "lens-sub" }, "What it's made of"), legend, note,
      h("p", { class: "muted small" }, "Tap a layer to pick it out. The cut is also hung under the see-through ground on the globe: tilt the view to look at it."),
    );
    await run();
  },
};
