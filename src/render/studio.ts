// 3D Studio (Create): bring any 3D onto the real globe and film it. Gaussian-splat captures (from phone scanning
// apps, Polycam, Luma, Postshot, Scaniverse, research code: .ply, .splat, .spz), photogrammetry, LiDAR and BIM as
// 3D Tiles, and glTF models; each stood on the ground where you want it, turned and scaled. Then a camera
// operator's shot library (orbit, reveal, flyover, dronie, crane, dolly zoom) around whatever you picked, and a
// colourist's grades over the whole picture. Captures stay on this device between visits.
import { Cartesian2, Cartographic, Math as CMath } from "cesium";
import type { App } from "../app";
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import { currentQuality } from "../globe/quality";
import { shots, type Shot, type Subject } from "./cinema";
import { applyGrade, currentGrade, GRADES } from "./grade";
import { addModel, addTiles, kindOf, type Placed } from "./import3d";
import { play, type Playing } from "./play";
import { baseDepth, CaptureLayer, prepare, type Capture, type Placement, type UpAxis } from "./splat/globe";
import { demoSplat } from "./splat/format";
import { deleteCapture, listCaptures, saveCapture } from "./store";

type Item = { kind: "capture"; c: Capture } | { kind: "model"; m: Placed & { place(p: Placement): void }; p: Placement } | { kind: "tiles"; t: Placed };

let layer: CaptureLayer | null = null;
const items: Item[] = [];
let loaded = false, selected: string | null = null, playing: Playing | null = null;

const idOf = (i: Item) => (i.kind === "capture" ? i.c.id : i.kind === "model" ? i.m.id : i.t.id);
const nameOf = (i: Item) => (i.kind === "capture" ? i.c.name : i.kind === "model" ? i.m.name : i.t.name);
/** How many splats this device keeps from a capture. */
export const splatBudget = (tier: string) => (tier === "low" ? 400_000 : tier === "high" ? 1_500_000 : 1_000_000);
/** "1.2M splats" (pure). */
export const splatsText = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)) + " splats";

/** Where the middle of the screen falls on the ground, else under the camera. */
function centre(app: App): { lon: number; lat: number } {
  const cv = app.globe.viewer.canvas, p = app.globe.pick(new Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2));
  if (p) return { lon: p.lon, lat: p.lat };
  const c = Cartographic.fromCartesian(app.globe.viewer.camera.positionWC);
  return { lon: CMath.toDegrees(c.longitude), lat: CMath.toDegrees(c.latitude) };
}

/** What a shot circles: the picked capture or model, else the middle of the map. */
function subjectOf(app: App, it: Item | undefined): Subject {
  if (it?.kind === "capture") {
    const { c } = it, s = c.placement.scale;
    return { lon: c.placement.lon, lat: c.placement.lat, height: c.placement.height + Math.max(0.5, baseDepth(c, c.placement.up) * s), size: c.radius * s * 2 };
  }
  if (it?.kind === "model") return { lon: it.p.lon, lat: it.p.lat, height: it.p.height + 10 * it.p.scale, size: 40 * it.p.scale };
  const m = centre(app);
  return { lon: m.lon, lat: m.lat, height: 40, size: 160 };
}

export function openStudio(ctx: WorkCtx) {
  const app = ctx.app;
  layer ??= new CaptureLayer(app);
  const status = h("p", { class: "muted small studio-status", role: "status", "aria-live": "polite" });
  const list = h("div", { class: "studio-list" });
  const editor = h("div", { class: "studio-editor" });
  const camera = h("div", { class: "studio-shots" });
  const say = (t: string) => { status.textContent = t; };

  // ── Bringing things in ──
  const file = h("input", { type: "file", hidden: true, multiple: true, accept: ".ply,.splat,.spz,.glb,.gltf", onchange: () => { void takeFiles([...(file.files ?? [])]); file.value = ""; } }) as HTMLInputElement;
  const drop = h("button", { class: "studio-drop", onclick: () => file.click(), "aria-label": "Choose a 3D file: a capture (.ply, .splat, .spz) or a model (.glb)" },
    h("span", { class: "studio-drop-orb", "aria-hidden": "true" }),
    h("strong", {}, "Drop a capture or a model"),
    h("span", {}, "Gaussian splats (.ply, .splat, .spz) from Polycam, Luma, Scaniverse, Postshot or your own training · glTF models (.glb)"));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); void takeFiles([...(e.dataTransfer?.files ?? [])]); });
  const link = h("input", { class: "pro-url", placeholder: "Or a link: tileset.json, .glb, .spz… or a Cesium ion asset number", "aria-label": "Link to 3D tiles, a model, a capture, or a Cesium ion asset number" }) as HTMLInputElement;
  link.addEventListener("keydown", (e) => { if (e.key === "Enter") void takeLink(); });

  async function takeFiles(files: File[]) {
    for (const f of files) {
      const k = kindOf(f.name);
      if (k === "capture") await addCapture(f.name, await f.arrayBuffer());
      else if (k === "model") {
        if (/\.gltf$/i.test(f.name)) { say("A .gltf with separate files can't be read from one file; export it as .glb (one file) or use a link."); continue; }
        await addModelFrom(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/, ""));
      } else say(`${f.name}: not a 3D file Terreno reads yet (captures: .ply, .splat, .spz; models: .glb).`);
    }
  }

  async function takeLink() {
    const s = link.value.trim();
    if (!s) return;
    const k = kindOf(s);
    try {
      if (k === "tiles" || k === "ion") {
        say("Streaming the 3D tiles…");
        const t = await addTiles(app, s, k === "ion" ? `Cesium ion asset ${s}` : new URL(s).hostname);
        items.push({ kind: "tiles", t }); selected = t.id; say(""); link.value = ""; render();
      } else if (k === "model") { await addModelFrom(s, decodeURIComponent(s.split("/").pop()!.replace(/\?.*$/, "").replace(/\.[^.]+$/, ""))); link.value = ""; }
      else if (k === "capture") {
        say("Downloading the capture…");
        const r = await fetch(s);
        if (!r.ok) throw new Error(`The link answered ${r.status}.`);
        await addCapture(decodeURIComponent(s.split("/").pop()!.replace(/\?.*$/, "")), await r.arrayBuffer());
        link.value = "";
      } else say("That link doesn't look like 3D: a tileset.json, a .glb, a .ply/.splat/.spz, or an ion asset number.");
    } catch (err) { say(`Couldn't load it: ${(err as Error).message}`); }
  }

  /** `file` keeps its extension: the reader tells the formats apart by it (and by the bytes). */
  async function addCapture(file: string, bytes: ArrayBuffer) {
    const name = file.replace(/\.[^.]+$/, "");
    const mb = (bytes.byteLength / 1e6).toFixed(1);
    say(`Reading and compressing ${name} (${mb} MB)…`);
    const budget = splatBudget(currentQuality().tier);
    const r = await prepare(file, bytes, budget);
    if (!r.ok) { say(r.error); return; }
    const at = centre(app);
    const c: Capture = { id: `cap-${Date.now().toString(36)}`, name, spz: r.spz, count: r.count, original: r.original, min: r.min, max: r.max, radius: r.radius,
      placement: { lon: at.lon, lat: at.lat, height: 0, heading: 0, scale: guessScale(r.radius), up: guessUp(file, r.min, r.max) } };
    items.push({ kind: "capture", c }); selected = c.id;
    await layer!.show(c);
    layer!.fly(c);
    const kept = await saveCapture(c);
    const trimmed = r.count < r.original ? ` (kept the best ${splatsText(r.count)} of ${splatsText(r.original)} for this device)` : "";
    say(`${name}: ${splatsText(r.count)}, ${(r.spz.byteLength / 1e6).toFixed(1)} MB compressed${trimmed}.${kept ? "" : " Not kept on this device: storage is full or off."}`);
    render();
  }

  async function addModelFrom(url: string, name: string) {
    say(`Loading ${name}…`);
    const p: Placement = { ...centre(app), height: 0, heading: 0, scale: 1, up: "y" };
    try {
      const m = await addModel(app, url, p, name);
      items.push({ kind: "model", m, p }); selected = m.id; say(""); render();
    } catch (err) { say(`Couldn't load the model: ${(err as Error).message}`); }
  }

  // ── The list and the placement controls ──
  function render() {
    list.replaceChildren(...items.map((it) => {
      const id = idOf(it), on = id === selected;
      const meta = it.kind === "capture" ? `Capture · ${splatsText(it.c.count)}` : it.kind === "model" ? "Model" : "3D tiles";
      const shown = it.kind !== "capture" || layer!.isShown(id);
      return h("div", { class: "studio-item" + (on ? " on" : "") },
        h("button", { class: "studio-pick", "aria-pressed": String(on), onclick: () => { selected = id; render(); } },
          h("span", { class: `studio-kind k-${it.kind}`, "aria-hidden": "true" }), h("span", {}, h("strong", {}, nameOf(it)), h("small", { class: "muted" }, meta))),
        it.kind === "capture" ? h("button", { class: "chip small", onclick: () => void toggle(it) }, shown ? "Hide" : "Show") : "",
        h("button", { class: "chip small", onclick: () => fly(it) }, "Go to"),
        h("button", { class: "chip small", "aria-label": `Remove ${nameOf(it)}`, onclick: () => remove(it) }, "Remove"));
    }));
    if (!items.length) list.replaceChildren(h("p", { class: "muted small" }, "Nothing yet. Drop a capture, paste a link, or try the demo."));
    editor.replaceChildren(...placementControls(items.find((i) => idOf(i) === selected)));
    renderShots();
  }

  async function toggle(it: Item & { kind: "capture" }) {
    if (layer!.isShown(it.c.id)) layer!.hide(it.c.id); else await layer!.show(it.c);
    render();
  }
  function fly(it: Item) { if (it.kind === "capture") { if (!layer!.isShown(it.c.id)) void layer!.show(it.c).then(() => layer!.fly(it.c)); else layer!.fly(it.c); } else if (it.kind === "model") it.m.fly(); else it.t.fly(); }
  function remove(it: Item) {
    const id = idOf(it);
    if (it.kind === "capture") { layer!.hide(id); void deleteCapture(id); } else if (it.kind === "model") it.m.remove(); else it.t.remove();
    items.splice(items.indexOf(it), 1);
    if (selected === id) selected = items[0] ? idOf(items[0]) : null;
    render();
  }

  function placementControls(it: Item | undefined): (Node | string)[] {
    if (!it || it.kind === "tiles") return [];
    const p = it.kind === "capture" ? it.c.placement : it.p;
    let saveTimer = 0;
    const acrossText = () => (it.kind === "capture" ? `About ${metres(it.c.radius * 2 * p.scale)} across. If it's on its side or upside down, change which way is up:` : "");
    const across = it.kind === "capture" ? h("p", { class: "muted small" }, acrossText()) : "";
    const apply = (regrounded = false) => {
      if (across) across.textContent = acrossText();
      if (it.kind === "capture") {
        if (regrounded) void layer!.reground(it.c); else layer!.place(it.c);
        clearTimeout(saveTimer); saveTimer = window.setTimeout(() => void saveCapture(it.c), 400);
      } else it.m.place(p);
    };
    const slider = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, show: (v: number) => string) => {
      const out = h("output", {}, show(get()));
      const input = h("input", { type: "range", min, max, step, value: get(), "aria-label": label, oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); set(v); out.textContent = show(get()); apply(); } });
      return h("label", { class: "studio-slider" }, h("span", {}, label), input, out);
    };
    // Scale on a log slider: from a model railway (1:100) to a giant (1000×).
    const scale = slider("Size", -2, 3, 0.01, () => Math.log10(p.scale), (v) => (p.scale = 10 ** v), () => (p.scale >= 10 ? `${Math.round(p.scale)}×` : `${p.scale.toPrecision(2)}×`));
    const ups: [UpAxis, string][] = [["y", "Y up"], ["z", "Z up"], ["-y", "Flipped"]];
    const upSeg = it.kind === "capture" ? h("div", { class: "segmented", role: "radiogroup", "aria-label": "Which way is up in the capture" },
      ...ups.map(([u, l]) => h("button", { role: "radio", "aria-checked": String(p.up === u), onclick: async () => { p.up = u; await layer!.show(it.c); void saveCapture(it.c); render(); } }, l))) : "";
    return [
      h("div", { class: "studio-row" },
        h("button", { class: "pill-btn", onclick: () => { Object.assign(p, centre(app)); apply(true); fly(it); } }, "Move to the middle of the map"),
        h("button", { class: "pill-btn", onclick: () => { p.heading = (p.heading + 90) % 360; apply(); render(); } }, "Turn 90°")),
      slider("Facing", 0, 359, 1, () => p.heading, (v) => (p.heading = v), (v) => `${Math.round(v)}°`),
      slider("Height", -50, 300, 0.5, () => p.height, (v) => (p.height = v), (v) => `${v.toFixed(1)} m`),
      scale,
      across,
      upSeg,
    ];
  }

  // ── Camera ──
  function renderShots() {
    const it = items.find((i) => idOf(i) === selected);
    const about = it && it.kind !== "tiles" ? `around ${nameOf(it)}` : "around the middle of the map";
    // Labels only: each shot is sized to its subject when it rolls, so moving or resizing in between counts.
    camera.replaceChildren(
      h("p", { class: "muted small" }, `Camera moves ${about}. Touch the map to cut.`),
      h("div", { class: "studio-shot-grid" }, ...shotsFor().map((s) =>
        h("button", { class: "studio-shot", onclick: () => void roll(s.id) }, h("span", { class: `shot-glyph g-${s.id}`, "aria-hidden": "true" }), h("strong", {}, s.label), h("small", {}, `${s.seconds} s`)))),
      h("div", { class: "studio-progress", "aria-hidden": "true" }, h("i", {})));
  }
  function shotsFor(): Shot[] {
    const it = items.find((i) => idOf(i) === selected);
    return shots(subjectOf(app, it), { heading: (it?.kind === "capture" ? it.c.placement.heading : it?.kind === "model" ? it.p.heading : 0) + 30 });
  }
  let rolls = 0;
  async function roll(id: string) {
    const s = shotsFor().find((x) => x.id === id)!, me = ++rolls;
    playing?.stop();
    const bar = camera.querySelector<HTMLElement>(".studio-progress i");
    ctx.hide();
    const p = await play(app, s, (t) => { if (bar) bar.style.width = `${Math.min(100, (t / s.seconds) * 100)}%`; });
    if (me !== rolls) { p.stop(); return; }
    playing = p;
    await p.done;
    // A newer shot took over: it owns the panel now.
    if (me !== rolls) return;
    playing = null;
    if (bar) bar.style.width = "0";
    ctx.unhide();
  }

  // ── Look ──
  const looks = h("div", { class: "studio-grades", role: "radiogroup", "aria-label": "Look" }, ...GRADES.map((g) =>
    h("button", { class: `studio-grade gr-${g.id}`, role: "radio", "aria-checked": String(currentGrade() === g.id), title: g.about, onclick: (e: Event) => {
      applyGrade(app, g.id);
      looks.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b === e.currentTarget)));
      say(g.about + ".");
    } }, h("span", { class: "studio-swatch", "aria-hidden": "true" }), g.label)));

  ctx.show("3D Studio", () => ctx.home(),
    h("p", { class: "mp-intro" }, "Put real 3D on the real Earth: scans, captures, buildings and models, stood on the ground where they belong. Then film them like a drone pilot and grade them like a colourist."),
    drop, file,
    h("div", { class: "pro-url-row" }, link, h("button", { class: "primary-btn", onclick: () => void takeLink() }, "Add")),
    h("button", { class: "link-btn studio-demo", onclick: () => void addCapture("Demo knot.splat", demoSplat()) }, "No capture to hand? Try a demo one"),
    status,
    h("h3", { class: "studio-h" }, "On the globe"), list, editor,
    h("h3", { class: "studio-h" }, "Camera"), camera,
    h("h3", { class: "studio-h" }, "Look"), looks,
    h("p", { class: "muted small" }, "Shadows, ambient occlusion and HDR switch on only where this device has the headroom. Captures stay on this device; models and tiles last for this visit."));
  render();

  // Captures kept from earlier visits come back once per session.
  if (!loaded) {
    loaded = true;
    void listCaptures().then(async (kept) => {
      for (const c of kept) if (!items.some((i) => idOf(i) === c.id)) items.push({ kind: "capture", c });
      if (kept.length) { selected ??= kept[0].id; render(); for (const c of kept) await layer!.show(c); render(); }
    });
  }
}

/** "3.3 m", "120 m", "1.4 km" (pure). */
export const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : m >= 10 ? `${Math.round(m)} m` : `${m.toFixed(1)} m`);

/** A first guess at a capture's scale: most are in metres already, but some come out tiny or huge (pure). */
export function guessScale(radius: number): number {
  if (radius < 0.05) return 100;
  if (radius > 5000) return 0.01;
  return 1;
}
/** A first guess at which way is up (pure): raw 3DGS training output is Y-down, scanning apps export Y-up, and survey-style clouds are Z-up and flat. */
export function guessUp(name: string, min: number[], max: number[]): UpAxis {
  if (/point_cloud|iteration_\d+/i.test(name)) return "-y";
  const dx = max[0] - min[0], dy = max[1] - min[1], dz = max[2] - min[2];
  // Flat in Z and spread in X and Y: a Z-up scan of a landscape or a street.
  if (dz < Math.min(dx, dy) * 0.4) return "z";
  return "y";
}
