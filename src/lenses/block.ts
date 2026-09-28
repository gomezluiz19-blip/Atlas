// Block: lift a square of the Earth out and turn it in your hands. The top is
// the real terrain with satellite imagery; the four cut faces show the rock
// layers (the same section model as Slice). X-ray turns the surface to glass;
// Explode pulls the faces apart; the height can be exaggerated.
import { greatCirclePoints } from "../data/mercator";
import { elevation } from "../data/elevation";
import { zoomForSpacing } from "../analysis/profile";
import { formatDistance, h } from "../ui/dom";
import { buildSection, paintSection, type Section } from "./geomodel";
import { imageryCanvas } from "./imagery";
import { offset } from "./slice";
import type { Lens, Subject } from "./types";

const N = 129;

export interface BlockData {
  size: number;
  bbox: [number, number, number, number];
  heights: Float32Array;
  zmin: number;
  zmax: number;
  bottom: number;
  sides: Section[];
  image: HTMLCanvasElement | null;
}

/** Loads everything a block needs: heights, imagery, and the four cut faces. */
export async function loadBlock(s: Subject, size: number, onStatus: (t: string) => void): Promise<BlockData> {
  const c = s.centre ?? [s.lon, s.lat];
  const [, north] = offset(c[0], c[1], 0, size / 2), [, south] = offset(c[0], c[1], 180, size / 2);
  const [east] = offset(c[0], c[1], 90, size / 2), [west] = offset(c[0], c[1], 270, size / 2);
  const pts: [number, number][] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([west + ((east - west) * i) / (N - 1), north - ((north - south) * j) / (N - 1)]);
  onStatus("Reading the terrain…");
  const heights = await elevation.sample(pts, Math.min(14, zoomForSpacing(size / (N - 1), c[1])));
  let zmin = Infinity, zmax = -Infinity;
  for (const v of heights) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); }
  onStatus("Fetching satellite imagery…");
  const image = await imageryCanvas([west, south, east, north]).catch(() => reliefCanvas(heights, N, size));
  onStatus("Cutting the four faces…");
  // Faces run clockwise seen from above, each left-to-right as seen from outside.
  const edges: [[number, number], [number, number]][] = [
    [[east, north], [west, north]], // north face
    [[east, south], [east, north]], // east face
    [[west, south], [east, south]], // south face
    [[west, north], [west, south]], // west face
  ];
  const sides = await Promise.all(edges.map(([a, b]) => buildSection(greatCirclePoints(a[0], a[1], b[0], b[1], 200), { surfaceSamples: 10 })));
  const bottom = Math.min(zmin, ...sides.map((x) => x.bottom)) - 100;
  for (const sd of sides) sd.bottom = bottom;
  return { size, bbox: [west, south, east, north], heights, zmin, zmax, bottom, sides, image };
}

export const blockLens: Lens = {
  id: "block",
  label: "Block",
  icon: "🧊",
  blurb: "Lift it out as a 3D block, with the rocks on its sides",
  score: (s) => ({ peak: 1, volcano: 1, range: 0.9, crater: 1, canyon: 1, river: 0.6, glacier: 0.8, island: 0.8, sea: 0.5, lake: 0.6, coast: 0.7, desert: 0.6, forest: 0.5, land: 0.7, city: 0.4 })[s.kind],
  async open(host, s) {
    const size = Math.min(80_000, Math.max(3000, s.radius * 2.2));
    const status = h("p", { class: "muted small" }, "Building the block…");
    host.title("Block", `${s.name} · ${formatDistance(size)} square`);
    host.body.replaceChildren(status);
    let data: BlockData;
    try {
      data = await loadBlock(s, size, (t) => (status.textContent = t));
    } catch (e) {
      status.textContent = `Couldn't build the block here (${(e as Error).message}).`;
      return;
    }
    status.textContent = "";
    const view = await import("./blockView");
    const bv = view.createBlockView(data, s.name);
    // Inside the UI layer, so the lens panel stays on top of the block.
    (document.getElementById("ui") ?? document.body).append(bv.el);
    host.onClose(() => bv.dispose());
    const layers = new Map<string, { name: string; color: string; age: string }>();
    for (const sd of data.sides) for (const l of sd.layers) layers.set(l.key, l);
    const methods = new Set(data.sides.map((x) => x.method));
    host.body.replaceChildren(
      h("p", {}, "Drag to turn the block, scroll or pinch to zoom."),
      h("div", { class: "lens-controls" },
        h("label", {}, h("span", {}, "Height ×"), h("input", { type: "range", min: 1, max: 5, step: 0.5, value: bv.exaggeration, oninput: (e: Event) => bv.setExaggeration(Number((e.target as HTMLInputElement).value)) }))),
      h("div", { class: "chips wrap" },
        h("button", { class: "chip", onclick: (e: Event) => (e.currentTarget as HTMLElement).classList.toggle("on", bv.toggleXray()) }, "X-ray"),
        h("button", { class: "chip", onclick: (e: Event) => (e.currentTarget as HTMLElement).classList.toggle("on", bv.toggleExplode()) }, "Explode"),
        h("button", { class: "chip", onclick: (e: Event) => (e.currentTarget as HTMLElement).classList.toggle("on", bv.toggleSpin()) }, "Spin"),
        h("button", { class: "chip", onclick: () => bv.savePng(`${s.name} block.png`) }, "Save picture")),
      h("h3", { class: "lens-sub" }, "Rocks on the faces"),
      h("div", { class: "lens-legend" }, ...[...layers.values()].map((l) => h("div", { class: "lens-layer" }, h("i", { style: `background:${l.color}` }), h("span", {}, h("strong", {}, l.name), l.age ? h("small", {}, l.age) : "")))),
      h("p", { class: "muted small" }, `Ground ${Math.round(data.zmin)} to ${Math.round(data.zmax)} m, cut down to ${Math.round(data.bottom)} m. ${methods.has("column") ? "Layers from Macrostrat's stratigraphic columns." : methods.has("surface") ? "Rocks mapped at the surface, drawn to typical depths (inferred)." : methods.has("ocean") ? "Seafloor with schematic sediment and crust." : "No bedrock map here: schematic."}`),
    );
  },
};

/** Paints a face texture (exported for the view). */
export const faceTexture = (sd: Section) => paintSection(sd, 1024, 512, "wall");

/** Shaded relief with a colour for height: the top of the block when there's no imagery. */
export function reliefCanvas(heights: Float32Array, n: number, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  const img = g.createImageData(n, n);
  let lo = Infinity, hi = -Infinity;
  for (const v of heights) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const cell = size / (n - 1);
  const ramp = [[86, 120, 72], [150, 150, 96], [176, 142, 104], [150, 120, 100], [236, 236, 236]];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, v = heights[k];
    const dx = (heights[j * n + Math.min(n - 1, i + 1)] - heights[j * n + Math.max(0, i - 1)]) / (2 * cell);
    const dy = (heights[Math.max(0, j - 1) * n + i] - heights[Math.min(n - 1, j + 1) * n + i]) / (2 * cell);
    const shade = Math.max(0.35, Math.min(1.2, 0.85 + (-dx + dy) * 0.9));
    const o = k * 4;
    if (v < 0) { img.data.set([40, 90, 150, 255], o); continue; }
    const t = hi > lo ? (v - lo) / (hi - lo) : 0.5, f = t * (ramp.length - 1), a = Math.min(ramp.length - 2, Math.floor(f)), u = f - a;
    for (let q = 0; q < 3; q++) img.data[o + q] = Math.min(255, (ramp[a][q] + (ramp[a + 1][q] - ramp[a][q]) * u) * shade);
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
