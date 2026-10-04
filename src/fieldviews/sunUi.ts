// Sun on a building (Real estate): a building standing at the spot in 3D, each
// floor of each face coloured by how many hours of direct sun it gets on the
// day you pick. Midwinter, the equinox and midsummer side by side; a grid of
// face by floor; which flats get the most light; and a what-if: put a tower
// across the street and see which floors lose their sun.
import { Cartesian2, Cartesian3, Color, CustomDataSource, HeadingPitchRange, BoundingSphere, Math as CesiumMath } from "cesium";
import type { App } from "../app";
import { elevation } from "../data/elevation";
import { wake } from "../globe/motion";
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import { compass, FACES, faceAz, keyDays, sunColor, sunTable, type Block, type Face, type Neighbour } from "./sunModel";

let ds: CustomDataSource | null = null;
const FACE_NAME: Record<Face, string> = { front: "Front", right: "Right end", back: "Back", left: "Left end" };

export function openSun(ctx: WorkCtx, app: App) {
  const viewer = app.globe.viewer;
  ds ??= new CustomDataSource("sun-building");
  if (!viewer.dataSources.contains(ds)) void viewer.dataSources.add(ds);
  const cv = viewer.canvas, mid = app.globe.pick(new Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2));
  const at = app.place ? { lon: app.place.lon, lat: app.place.lat, name: app.place.name?.title ?? "this spot" } : mid ? { lon: mid.lon, lat: mid.lat, name: "the middle of the map" } : { lon: -73.9857, lat: 40.7484, name: "Midtown Manhattan" };
  let b: Block = { length: 40, depth: 18, floors: 12, floorHeight: 3.2, bearing: 0 };
  let dayIdx = 0, ground = 0;
  const neighbours: Partial<Record<Face, Neighbour>> = {};
  const days = keyDays(at.lat);
  const grid = h("div", { class: "sb-grid" });
  const best = h("div", { class: "sb-best" });
  const dayTabs = h("div", { class: "segmented", role: "tablist" }, ...days.map((d, i) => {
    const btn = h("button", { role: "tab", "aria-selected": String(i === dayIdx), onclick: () => { dayIdx = i; dayTabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === btn))); draw(); } }, d.label);
    return btn;
  }));

  const mLat = 111_320, mLon = 111_320 * Math.cos((at.lat * Math.PI) / 180);
  const pt = (x: number, y: number) => { const r = (b.bearing * Math.PI) / 180; const e = x * Math.sin(r) + y * Math.cos(r), n = x * Math.cos(r) - y * Math.sin(r); return [at.lon + e / mLon, at.lat + n / mLat] as [number, number]; };
  /** The two ends of a face, along the building's own axes (x along its length). */
  const faceEnds = (f: Face): [[number, number], [number, number]] => {
    const L = b.length / 2, D = b.depth / 2;
    return ({ front: [pt(-L, D), pt(L, D)], back: [pt(L, -D), pt(-L, -D)], right: [pt(L, D), pt(L, -D)], left: [pt(-L, -D), pt(-L, D)] } as const)[f] as [[number, number], [number, number]];
  };

  function draw() {
    const table = sunTable(b, at.lat, at.lon, days[dayIdx].day, neighbours);
    ds!.entities.removeAll();
    // Each face, floor by floor, in its colour of sun.
    for (const t of table) {
      const [p, q] = faceEnds(t.face);
      t.floors.forEach((hrs, i) => {
        ds!.entities.add({ wall: { positions: Cartesian3.fromDegreesArray([...p, ...q]), minimumHeights: [ground + i * b.floorHeight + 0.15, ground + i * b.floorHeight + 0.15], maximumHeights: [ground + (i + 1) * b.floorHeight - 0.15, ground + (i + 1) * b.floorHeight - 0.15],
          material: Color.fromCssColorString(sunColor(hrs)).withAlpha(0.95), outline: false } });
      });
    }
    // The roof, and any neighbour standing across the street.
    const corners = [pt(-b.length / 2, -b.depth / 2), pt(b.length / 2, -b.depth / 2), pt(b.length / 2, b.depth / 2), pt(-b.length / 2, b.depth / 2)];
    ds!.entities.add({ polygon: { hierarchy: Cartesian3.fromDegreesArray(corners.flat()), height: ground + b.floors * b.floorHeight, material: Color.fromCssColorString("#e5e5ea").withAlpha(0.9) } });
    for (const f of FACES) {
      const n = neighbours[f];
      if (!n) continue;
      const out = (f === "front" ? [0, 1] : f === "back" ? [0, -1] : f === "right" ? [1, 0] : [-1, 0]) as [number, number];
      const cx = out[0] * (b.length / 2 + n.distance + 9), cy = out[1] * (b.depth / 2 + n.distance + 9);
      const w = out[0] ? 18 : b.length + 10, d = out[0] ? b.depth + 10 : 18;
      const nc = [pt(cx - w / 2, cy - d / 2), pt(cx + w / 2, cy - d / 2), pt(cx + w / 2, cy + d / 2), pt(cx - w / 2, cy + d / 2)];
      ds!.entities.add({ polygon: { hierarchy: Cartesian3.fromDegreesArray(nc.flat()), height: ground, extrudedHeight: ground + n.height, material: Color.fromCssColorString("#8e8e93").withAlpha(0.55), outline: true, outlineColor: Color.WHITE.withAlpha(0.6) } });
    }
    app.canvas.put({ id: "view:sun", label: `☀️ Sun on a building · ${at.name}`, color: "#ffd60a", scope: "world", pinned: true, show: (v) => { ds!.show = v; }, remove: () => ds?.entities.removeAll() }, true);
    wake(1200);
    // The grid: faces across, floors up, hours in each cell.
    const max = Math.max(...table.flatMap((t) => t.floors));
    grid.replaceChildren(
      h("div", { class: "sb-head" }, h("span", {}), ...table.map((t) => h("span", {}, h("strong", {}, compass(t.az)), h("small", {}, FACE_NAME[t.face])))),
      ...Array.from({ length: b.floors }, (_, k) => b.floors - 1 - k).map((i) => h("div", { class: "sb-row" }, h("span", { class: "sb-floor" }, i === 0 ? "G" : String(i)),
        ...table.map((t) => h("span", { class: "sb-cell", style: `background:${sunColor(t.floors[i])}`, title: `${FACE_NAME[t.face]} (${compass(t.az)}), floor ${i}: ${t.floors[i]} h` }, String(Math.round(t.floors[i])))))));
    const flats = table.flatMap((t) => t.floors.map((hrs, i) => ({ t, i, hrs }))).sort((x, y) => y.hrs - x.hrs);
    const sunniest = flats[0], darkest = flats[flats.length - 1];
    const lost = Object.keys(neighbours).length ? table.flatMap((t) => t.floors.map((hrs, i) => ({ t, i, hrs }))).filter((x) => x.hrs < 1).length : 0;
    best.replaceChildren(
      h("p", {}, h("strong", {}, `${FACE_NAME[sunniest.t.face]} (${compass(sunniest.t.az)}), floor ${sunniest.i}`), ` gets the most on ${days[dayIdx].label.toLowerCase()}: ${sunniest.hrs} h; `, h("strong", {}, `${FACE_NAME[darkest.t.face]} (${compass(darkest.t.az)}), floor ${darkest.i}`), ` the least: ${darkest.hrs} h.`),
      max < 2 ? h("p", { class: "muted" }, "Little direct sun anywhere that day: it's midwinter at a high latitude.") : "",
      lost ? h("p", { class: "sb-warn" }, `With the neighbour${Object.keys(neighbours).length > 1 ? "s" : ""}, ${lost} flat-faces get under an hour of sun.`) : "");
  }

  const num = (label: string, v: number, min: number, max: number, step: number, set: (x: number) => void) => {
    const inp = h("input", { type: "range", min, max, step, value: v, "aria-label": label }) as HTMLInputElement, out = h("output", {}, String(v));
    inp.addEventListener("input", () => { set(Number(inp.value)); out.textContent = inp.value; draw(); });
    return h("label", { class: "wi-sev" }, h("span", {}, label), inp, out);
  };
  const nbFace = h("select", { class: "pro-url", "aria-label": "Which side" }, ...FACES.map((f) => h("option", { value: f }, `${FACE_NAME[f]} (${compass(faceAz(b, f))})`))) as HTMLSelectElement;
  const nbH = h("input", { type: "range", min: 0, max: 150, step: 5, value: 0, "aria-label": "Neighbour height" }) as HTMLInputElement;
  const nbD = h("input", { type: "range", min: 8, max: 80, step: 2, value: 20, "aria-label": "Across the street" }) as HTMLInputElement;
  const nbOut = h("output", {}, "none");
  const setNb = () => {
    const f = nbFace.value as Face, height = Number(nbH.value), distance = Number(nbD.value);
    if (height > 0) neighbours[f] = { height, distance }; else delete neighbours[f];
    nbOut.textContent = height ? `${height} m tall, ${distance} m away` : "none";
    draw();
  };
  for (const el of [nbFace, nbH, nbD]) el.addEventListener("input", setNb);

  ctx.show("Sun on a building", () => { ds?.entities.removeAll(); app.canvas.drop("view:sun"); ctx.home(); },
    h("p", { class: "mp-intro" }, `Hours of direct sun on every floor of every face of a building at ${at.name}. Warm colours get the sun; blue faces don't.`),
    dayTabs, grid,
    h("p", { class: "ec-legend" }, ...[0, 2, 4, 6, 8].map((x) => h("span", { class: "sb-key", style: `background:${sunColor(x)}` }, `${x}${x === 8 ? "+" : ""} h`))),
    best,
    h("section", { class: "wi on" }, h("header", {}, h("strong", {}, "What if a tower goes up across the street?")), nbFace,
      h("label", { class: "wi-sev" }, h("span", {}, "Height"), nbH, nbOut), h("label", { class: "wi-sev" }, h("span", {}, "Distance"), nbD)),
    h("details", { class: "md-adjust" }, h("summary", {}, "The building"),
      num("Floors", b.floors, 2, 40, 1, (x) => { b = { ...b, floors: x }; }),
      num("Length (m)", b.length, 10, 120, 5, (x) => { b = { ...b, length: x }; }),
      num("Depth (m)", b.depth, 8, 60, 2, (x) => { b = { ...b, depth: x }; }),
      num("Turned (°)", b.bearing, 0, 175, 5, (x) => { b = { ...b, bearing: x }; })),
    h("p", { class: "fineprint" }, "Direct sun only, counted every 10 minutes; sky light and reflections add more. The neighbour is a simple block; real streets have many."));
  void elevation.sample([[at.lon, at.lat]], 12).then((z) => { ground = Number.isFinite(z[0]) ? z[0] : 0; }).catch(() => {}).finally(() => {
    draw();
    viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(at.lon, at.lat, ground + 20), 60), { offset: new HeadingPitchRange(CesiumMath.toRadians(210), CesiumMath.toRadians(-22), 230), duration: 2 });
  });
}
