// Rewind: look back in time from any place.
//   Then and now: drag a divider across the globe between archived satellite
//     imagery (Esri World Imagery Wayback, since 2014) and today's.
//   Deep time: where this spot was on the moving plates, back to 500 million
//     years ago, with the coastlines of the time (GPlates Web Service).
import { Cartesian2, Cartesian3, Color, CustomDataSource, ImageryLayer, LabelStyle, SplitDirection, UrlTemplateImageryProvider, VerticalOrigin } from "cesium";
import { fetchMapUnit, formatAge } from "../data/macrostrat";
import { canvasLayer, tracePath } from "../globe/networkLayer";
import { h } from "../ui/dom";
import type { Lens, LensHost, Subject } from "./types";

interface Release { id: number; date: string; url: string }

let releases: Promise<Release[]> | null = null;
export function waybackReleases(): Promise<Release[]> {
  releases ??= fetch("https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json")
    .then((r) => { if (!r.ok) throw new Error(`Wayback answered ${r.status}`); return r.json(); })
    .then((cfg: Record<string, { itemTitle: string; itemURL: string }>) => Object.entries(cfg).map(([id, v]) => ({
      id: Number(id), date: /(\d{4}-\d{2}-\d{2})/.exec(v.itemTitle)?.[1] ?? "", url: v.itemURL.replace("{level}", "{z}").replace("{row}", "{y}").replace("{col}", "{x}"),
    })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date)));
  releases.catch(() => (releases = null));
  return releases;
}

/** One release per year, the earliest of each. */
export const perYear = (list: Release[]) => list.filter((r, i) => i === 0 || r.date.slice(0, 4) !== list[i - 1].date.slice(0, 4));

async function thenAndNow(host: LensHost, box: HTMLElement) {
  const viewer = host.app.globe.viewer;
  const list = perYear(await waybackReleases());
  if (!list.length) throw new Error("no archive");
  let pick = list[0];
  let layer: ImageryLayer | null = null;
  const divider = h("div", { class: "swipe-bar", role: "slider", "aria-label": "Compare then and now" }, h("span", { class: "swipe-then" }), h("i", {}), h("span", { class: "swipe-now" }, "Today"));
  (document.getElementById("ui") ?? document.body).append(divider);
  const setPos = (x: number) => {
    const f = Math.max(0.02, Math.min(0.98, x / innerWidth));
    viewer.scene.splitPosition = f;
    divider.style.left = `${f * 100}%`;
  };
  const show = (r: Release) => {
    pick = r;
    if (layer) viewer.imageryLayers.remove(layer, true);
    layer = new ImageryLayer(new UrlTemplateImageryProvider({ url: r.url, maximumLevel: 19, credit: `Esri World Imagery Wayback, ${r.date}` }), { splitDirection: SplitDirection.LEFT });
    // Just above the base imagery, below labels and overlays.
    viewer.imageryLayers.add(layer, 1);
    (divider.querySelector(".swipe-then") as HTMLElement).textContent = r.date.slice(0, 4);
  };
  let drag = false;
  divider.addEventListener("pointerdown", (e) => { drag = true; divider.setPointerCapture(e.pointerId); });
  divider.addEventListener("pointermove", (e) => { if (drag) setPos(e.clientX); });
  divider.addEventListener("pointerup", () => (drag = false));
  setPos(innerWidth * 0.5);
  show(pick);
  host.onClose(() => { if (layer) viewer.imageryLayers.remove(layer, true); divider.remove(); viewer.scene.splitPosition = 0.5; });
  box.replaceChildren(
    h("p", {}, "Drag the divider on the map: left is the archive, right is today. Zoom in on a city edge, a glacier, a coast or a forest."),
    h("div", { class: "chips wrap" }, ...list.map((r) => h("button", { class: "chip" + (r === pick ? " on" : ""), onclick: (e: Event) => { show(r); box.querySelectorAll(".chip").forEach((c) => c.classList.remove("on")); (e.currentTarget as HTMLElement).classList.add("on"); } }, r.date.slice(0, 4)))),
    h("p", { class: "muted small" }, "Esri World Imagery Wayback. Older imagery isn't available everywhere, so some places look the same in every year."),
  );
}

const GWS = "https://gws.gplates.org/reconstruct";
const MODEL = "MERDITH2021";

async function paleo(lon: number, lat: number, ma: number): Promise<[number, number] | null> {
  const r = await fetch(`${GWS}/reconstruct_points/?points=${lon.toFixed(3)},${lat.toFixed(3)}&time=${ma}&model=${MODEL}`);
  if (!r.ok) throw new Error(`GPlates answered ${r.status}`);
  const j = await r.json();
  const c = j?.coordinates?.[0] ?? j?.features?.[0]?.geometry?.coordinates;
  return Array.isArray(c) && Number.isFinite(c[0]) ? [c[0], c[1]] : null;
}

type Rings = [number, number][][];
async function coastlines(ma: number): Promise<Rings> {
  const r = await fetch(`${GWS}/coastlines/?time=${ma}&model=${MODEL}`);
  if (!r.ok) throw new Error(`GPlates answered ${r.status}`);
  const j = await r.json();
  const rings: Rings = [];
  const add = (g: { type: string; coordinates: unknown } | undefined) => {
    if (!g) return;
    if (g.type === "Polygon") rings.push(...(g.coordinates as Rings));
    else if (g.type === "MultiPolygon") for (const p of g.coordinates as Rings[]) rings.push(...p);
  };
  if (j.type === "FeatureCollection") for (const f of j.features) add(f.geometry);
  else if (j.type === "GeometryCollection") for (const g of j.geometries) add(g);
  else add(j);
  return rings;
}

const ERAS: [number, string][] = [[0, "Today"], [20, "Grasslands spread"], [66, "End of the dinosaurs"], [100, "Mid-Cretaceous"], [150, "Late Jurassic"], [200, "Pangaea splits"], [250, "Pangaea"], [300, "Coal forests"], [400, "First forests"], [500, "Cambrian seas"]];

async function deepTime(host: LensHost, box: HTMLElement, s: Subject) {
  const viewer = host.app.globe.viewer;
  let layer: ImageryLayer | null = null;
  const ds = new CustomDataSource("lens-deeptime");
  void viewer.dataSources.add(ds);
  // Today's place names don't belong on a map of the past.
  const labels = (host.app as unknown as { labels?: { setVisible(v: boolean): void } }).labels;
  labels?.setVisible(false);
  host.onClose(() => { if (layer) viewer.imageryLayers.remove(layer, true); viewer.dataSources.remove(ds, true); labels?.setVisible(true); });
  const status = h("p", { class: "muted small" });
  const title = h("strong", { class: "lens-level" });
  let job = 0;
  const go = async (ma: number) => {
    const my = ++job;
    title.textContent = ma ? `${ma} million years ago` : "Today";
    status.textContent = "Moving the plates…";
    try {
      const [pt, rings] = await Promise.all([paleo(s.lon, s.lat, ma), coastlines(ma)]);
      if (my !== job) return;
      const shapes = rings.filter((r) => r.length > 2).map((r) => { let w = 180, so = 90, e = -180, n = -90; for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); n = Math.max(n, y); } return { xy: new Float32Array(r.flat()), bbox: [w, so, e, n] as [number, number, number, number] }; });
      if (layer) viewer.imageryLayers.remove(layer, true);
      layer = canvasLayer((ctx, t) => {
        ctx.fillStyle = "rgba(12,40,92,0.88)";
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = "rgba(196,170,120,0.95)";
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const sh of shapes) if (t.touches(sh.bbox, 4)) { tracePath(ctx, t, sh.xy); ctx.closePath(); }
        ctx.fill("evenodd");
        ctx.stroke();
      }, { maximumLevel: 6, credit: "Plate reconstruction: GPlates Web Service, Merdith et al. (2021)" });
      viewer.imageryLayers.add(layer);
      ds.entities.removeAll();
      if (pt) {
        ds.entities.add({ position: Cartesian3.fromDegrees(pt[0], pt[1]), point: { pixelSize: 14, color: Color.fromCssColorString("#ffd60a"), outlineColor: Color.BLACK, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: { text: `${s.name}, ${ma ? `${ma} Ma` : "today"}`, font: "700 14px -apple-system, system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 4, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -12), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
        viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(pt[0], pt[1], 16_000_000), duration: 1.5 });
        const moved = Math.round(Math.hypot(pt[0] - s.lon, pt[1] - s.lat));
        status.textContent = `Then at ${Math.abs(pt[1]).toFixed(0)}°${pt[1] >= 0 ? "N" : "S"} (today ${Math.abs(s.lat).toFixed(0)}°${s.lat >= 0 ? "N" : "S"})${ma ? `, about ${moved}° away from where it is now.` : "."}${Math.abs(pt[1]) < 25 && Math.abs(s.lat) > 30 ? " It sat in the tropics." : ""}`;
      } else status.textContent = "This spot was on a plate that no longer exists at the surface (subducted), so it can't be placed.";
    } catch (e) {
      if (my === job) status.textContent = `Couldn't reach the plate model (${(e as Error).message}).`;
    }
  };
  // Start when the rock under the place formed, if the map knows.
  const { unit } = await fetchMapUnit(s.lon, s.lat).catch(() => ({ unit: null }));
  const age = unit?.b_age && unit.b_age <= 540 ? Math.round(unit.b_age / 10) * 10 : 250;
  box.replaceChildren(
    title,
    h("div", { class: "chips wrap" }, ...ERAS.map(([ma, label]) => h("button", { class: "chip", title: label, onclick: () => void go(ma) }, ma ? `${ma} Ma` : "Now"))),
    status,
    unit?.b_age ? h("p", { class: "small" }, `The rock at the surface here (${unit.name}) formed about ${formatAge(unit.b_age)}: that's where this starts.`) : "",
    h("p", { class: "muted small" }, "Continents drift a few centimetres a year. Coastlines of the past are drawn over the globe; the yellow dot is this place then."),
  );
  await go(age);
}

export const rewindLens: Lens = {
  id: "rewind",
  label: "Rewind",
  icon: "⏪",
  blurb: "Then and now from space, or where this place was when dinosaurs lived",
  score: (s) => (s.kind === "city" || s.kind === "glacier" || s.kind === "coast" || s.kind === "forest" ? 0.95 : 0.75),
  async open(host, s) {
    host.title("Rewind", s.name);
    const box = h("div", { class: "lens-body" });
    let mode: "then" | "deep" = s.kind === "city" || s.kind === "glacier" || s.kind === "coast" || s.kind === "forest" || s.kind === "river" ? "then" : "deep";
    let cleanup: (() => void)[] = [];
    const sub: LensHost = { ...host, onClose: (fn) => cleanup.push(fn) };
    const run = async () => {
      for (const f of cleanup.splice(0)) f();
      box.replaceChildren(h("p", { class: "muted small" }, "Loading…"));
      try {
        if (mode === "then") await thenAndNow(sub, box);
        else await deepTime(sub, box, s);
      } catch (e) {
        box.replaceChildren(h("p", { class: "pro-warn" }, `Couldn't load: ${(e as Error).message}`));
      }
    };
    host.onClose(() => { for (const f of cleanup.splice(0)) f(); });
    const tabs = h("div", { class: "segmented-mini" },
      ...(["then", "deep"] as const).map((m) => h("button", { class: "segmented-mini-btn", "aria-pressed": String(mode === m), onclick: (e: Event) => { mode = m; tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false")); (e.currentTarget as HTMLElement).setAttribute("aria-pressed", "true"); void run(); } }, m === "then" ? "Then and now" : "Deep time")));
    host.body.replaceChildren(tabs, box);
    await run();
  },
};
