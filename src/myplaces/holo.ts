// Your place, booted up: a holographic model of it on a projector, the ground
// from the real terrain and the buildings around from OpenStreetMap, yours
// lit warm among the cool blue ones, your cameras, panels and tanks where you
// put them, and each camera's view drawn on the ground. Around it, what's
// going on there now, and a dock of everything you do with it. Tap a dock
// item and the model shrinks to a puck in the corner while that opens; tap
// the puck to bring it back. three.js is loaded only when a place boots.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { zoomForSpacing } from "../analysis/profile";
import { elevation } from "../data/elevation";
import { h } from "../ui/dom";
import { cameraSector, fetchBuildings, ownBuilding, type Building } from "./scene";
import { DEVICES, KIND_LABEL, type MyPlace } from "./store";

export interface DockItem { id: string; label: string; icon: string; color: string; badge?: string; alert?: boolean }
export interface HoloLine { k: string; v: string }
export interface Holo {
  close(): void;
  minimize(): void;
  restore(): void;
  setDock(items: DockItem[]): void;
  setHud(lines: HoloLine[], headline?: string): void;
  readonly el: HTMLElement;
}

const N = 48;
const SIZE = 520; // metres across
const CYAN = 0x5ad8ff, WARM = 0xffc46b;
const within = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

export function bootPlace(o: {
  place: MyPlace; places: MyPlace[]; dock: DockItem[];
  onPick(id: string): void; onSwitch(id: string): void; onGlobe(): void; onClose(): void; onAdd(): void;
}): Holo {
  const p = o.place;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer: THREE.WebGLRenderer | null = null;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { renderer = null; }

  // ---- The frame around it ----
  const hud = h("dl", { class: "holo-hud" });
  const headline = h("p", { class: "holo-headline" });
  const status = h("p", { class: "holo-boot" }, `Booting ${p.name}…`);
  const dock = h("nav", { class: "holo-dock", "aria-label": "Your place" });
  const canvasHost = h("div", { class: "holo-canvas" });
  const puckHint = h("span", { class: "holo-puck-hint" }, p.name);
  const el = h("section", { class: "holo", role: "dialog", "aria-label": `${p.name}: your place` },
    canvasHost,
    h("div", { class: "holo-scan", "aria-hidden": "true" }),
    h("header", { class: "holo-top" },
      h("div", {},
        h("p", { class: "holo-kind" }, `${KIND_LABEL[p.kind]} · ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`),
        h("h1", { class: "holo-name" }, p.name),
        status, headline,
        h("div", { class: "holo-places" }, ...o.places.map((x) => h("button", { class: "holo-chip" + (x.id === p.id ? " on" : ""), onclick: () => x.id !== p.id && o.onSwitch(x.id) }, x.name)), h("button", { class: "holo-chip add", onclick: () => o.onAdd() }, "+ Place"))),
      h("div", { class: "holo-actions" },
        h("button", { class: "holo-btn", onclick: () => o.onGlobe() }, "Fly in on the globe"),
        h("button", { class: "holo-btn icon", "aria-label": "Close", onclick: () => o.onClose() }, "✕"))),
    hud,
    dock,
    puckHint);
  canvasHost.addEventListener("click", () => { if (el.classList.contains("mini")) self.restore(); });
  let self: Holo;
  // Inside the app's layer, under its top bar (search and modes stay reachable).
  (document.getElementById("ui") ?? document.body).append(el);

  const setDock = (items: DockItem[]) => {
    dock.replaceChildren(...items.map((d, i) => h("button", { class: "holo-orb" + (d.alert ? " alert" : ""), style: `--c:${d.color};--i:${i}`, onclick: () => o.onPick(d.id) },
      h("span", { class: "holo-orb-icon", html: d.icon }), h("span", { class: "holo-orb-label" }, d.label), d.badge ? h("span", { class: "holo-orb-badge" }, d.badge) : "")));
  };
  setDock(o.dock);
  const setHud = (lines: HoloLine[], head?: string) => {
    hud.replaceChildren(...lines.map((l) => h("div", {}, h("dt", {}, l.k), h("dd", {}, l.v))));
    headline.textContent = head ?? "";
  };

  if (!renderer) {
    status.textContent = "3D isn't available on this device.";
    el.classList.add("in", "flat");
    self = { el, close: () => el.remove(), minimize: () => el.classList.add("mini"), restore: () => el.classList.remove("mini"), setDock, setHud };
    return self;
  }
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasHost.append(renderer.domElement);

  // ---- The scene ----
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x02060d, 18, 46);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 5; controls.maxDistance = 30; controls.maxPolarAngle = Math.PI * 0.46;
  controls.autoRotate = !reduced; controls.autoRotateSpeed = 0.5;
  camera.position.set(9, 7.5, 12);
  controls.target.set(0, 0.6, 0);

  const additive = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const lineMat = (color: number, opacity: number) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

  // The projector: rings of light on the floor, turning.
  const projector = new THREE.Group();
  for (const [r, w, op] of [[6.2, 0.05, 0.9], [6.5, 0.015, 0.5], [7.3, 0.01, 0.25]] as const)
    projector.add(new THREE.Mesh(new THREE.RingGeometry(r, r + w, 128).rotateX(-Math.PI / 2), additive(CYAN, op)));
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2, tick = new THREE.Mesh(new THREE.PlaneGeometry(0.02, i % 4 ? 0.12 : 0.3).rotateX(-Math.PI / 2), additive(CYAN, 0.6));
    tick.position.set(Math.cos(a) * 6.9, 0, Math.sin(a) * 6.9); tick.rotation.y = -a;
    projector.add(tick);
  }
  projector.position.y = -0.02;
  scene.add(projector);
  // A soft beam up from the projector.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.2, 4, 64, 1, true), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 2;
  scene.add(beam);
  // Motes rising in the beam.
  const motes = new THREE.BufferGeometry(), mcount = 260, mpos = new Float32Array(mcount * 3);
  for (let i = 0; i < mcount; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 5.6; mpos.set([Math.cos(a) * r, Math.random() * 4, Math.sin(a) * r], i * 3); }
  motes.setAttribute("position", new THREE.BufferAttribute(mpos, 3));
  scene.add(new THREE.Points(motes, new THREE.PointsMaterial({ color: CYAN, size: 0.035, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));

  const model = new THREE.Group();
  scene.add(model);
  const k = 10 / SIZE; // metres to units (the model is 10 across)
  const mx = 111_320 * Math.cos((p.lat * Math.PI) / 180), my = 110_540;
  const toXZ = (lon: number, lat: number): [number, number] => [(lon - p.lon) * mx, -(lat - p.lat) * my];
  const risers: THREE.Object3D[] = [];
  let heights: Float32Array | null = null, g0 = 0, ex = 1;
  const ground = (x: number, z: number) => {
    if (!heights) return 0;
    const fi = Math.min(N - 1, Math.max(0, ((x + SIZE / 2) / SIZE) * (N - 1))), fj = Math.min(N - 1, Math.max(0, ((z + SIZE / 2) / SIZE) * (N - 1)));
    const i = Math.min(N - 2, Math.floor(fi)), j = Math.min(N - 2, Math.floor(fj)), a = fi - i, b = fj - j, v = (ii: number, jj: number) => heights![jj * N + ii];
    return (v(i, j) * (1 - a) + v(i + 1, j) * a) * (1 - b) + (v(i, j + 1) * (1 - a) + v(i + 1, j + 1) * a) * b - g0;
  };
  // A disc of the place: only what's within the projector's circle is shown.
  const inDisc = (x: number, z: number) => Math.hypot(x, z) < SIZE / 2 * 0.98;

  const build = (hs: Float32Array | null, bs: Building[]) => {
    heights = hs && hs.length === N * N ? hs : null;
    if (heights) { g0 = heights[Math.floor(N / 2) * N + Math.floor(N / 2)]; let lo = Infinity, hi = -Infinity; for (const v of heights) { lo = Math.min(lo, v); hi = Math.max(hi, v); } ex = Math.min(2.5, Math.max(1, (0.06 * SIZE) / Math.max(1, hi - lo))); }
    model.scale.set(k, k * ex, k);
    // The ground: a contour-like grid of lines, only inside the disc.
    const segs: number[] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N - 1; i++) {
      const x0 = (i / (N - 1) - 0.5) * SIZE, x1 = ((i + 1) / (N - 1) - 0.5) * SIZE, z = (j / (N - 1) - 0.5) * SIZE;
      if (inDisc(x0, z) && inDisc(x1, z)) segs.push(x0, ground(x0, z), z, x1, ground(x1, z), z);
      if (inDisc(z, x0) && inDisc(z, x1)) segs.push(z, ground(z, x0), x0, z, ground(z, x1), x1);
    }
    const grid = new THREE.BufferGeometry();
    grid.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    model.add(new THREE.LineSegments(grid, lineMat(CYAN, 0.22)));
    // The buildings: pale glass with bright edges; yours warm.
    const own = ownBuilding(bs, p.lon, p.lat);
    const cool: THREE.BufferGeometry[] = [];
    let warm: THREE.BufferGeometry | null = null;
    for (const b of bs) {
      const pts = b.ring.map(([lon, lat]) => toXZ(lon, lat));
      const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
      if (!inDisc(cx, cz) || cool.length > 900) continue;
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(3, b.height) / ex, bevelEnabled: false }).rotateX(-Math.PI / 2);
      g.translate(0, ground(cx, cz), 0);
      if (b === own) warm = g; else cool.push(g);
    }
    const addGroup = (geos: THREE.BufferGeometry[], color: number, fill: number, edge: number) => {
      const merged = geos.length ? mergeGeometries(geos) : null;
      if (!merged) return;
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(merged, additive(color, fill)), new THREE.LineSegments(new THREE.EdgesGeometry(merged, 25), lineMat(color, edge)));
      model.add(grp);
      risers.push(grp);
    };
    addGroup(cool, CYAN, 0.07, 0.55);
    if (warm) addGroup([warm], WARM, 0.22, 1);
    // Where you are, if it isn't a building: a beacon.
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), additive(WARM, 0.35));
    beacon.position.set(0, 30, 0);
    model.add(beacon);
    // Your devices: a pin each; cameras also paint what they see.
    for (const d of p.devices) {
      const [x, z] = toXZ(d.lon, d.lat);
      if (!inDisc(x, z)) continue;
      const c = new THREE.Color(DEVICES[d.type].color).getHex();
      const pin = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), additive(c, 0.9));
      pin.position.set(x, ground(x, z) + 14, z);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 6), additive(c, 0.5));
      stem.position.set(x, ground(x, z) + 7, z);
      model.add(pin, stem);
      if (d.type === "camera") {
        const sector = cameraSector(d).map(([lon, lat]) => toXZ(lon, lat));
        const shape = new THREE.Shape(sector.map(([sx, sz]) => new THREE.Vector2(sx, -sz)));
        const fan = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), additive(c, 0.18));
        fan.position.y = ground(x, z) + 1.5;
        model.add(fan);
      }
    }
    for (const r of risers) r.scale.y = reduced ? 1 : 0.001;
    built = performance.now();
    status.textContent = `${bs.length} buildings within ${Math.round(SIZE / 2)} m${own ? ", yours lit" : ""}`;
    el.classList.add("booted");
  };
  let built = 0;
  const hsP = (() => {
    const pts: [number, number][] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([p.lon + ((i / (N - 1) - 0.5) * SIZE) / mx, p.lat + ((0.5 - j / (N - 1)) * SIZE) / my]);
    return within(elevation.sample(pts, Math.min(15, zoomForSpacing(SIZE / (N - 1), p.lat))), 3500, null);
  })();
  const bsP = within(fetchBuildings(p.lon, p.lat, SIZE / 2), 5000, [] as Building[]);
  let closed = false;
  void Promise.all([hsP, bsP]).then(([a, b]) => { if (!closed) build(a, b); });

  // ---- The loop ----
  const resize = () => {
    const mini = el.classList.contains("mini");
    const w = mini ? 200 : innerWidth, hh = mini ? 200 : innerHeight;
    renderer!.setSize(w, hh, false);
    camera.aspect = w / hh;
    if (!mini && w > 820) camera.setViewOffset(w, hh, 0, hh * 0.04, w, hh); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  resize();
  const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3);
  let raf = 0, last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    projector.rotation.y += dt * 0.08;
    const a = motes.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < mcount; i++) { let y = a.getY(i) + dt * 0.25; if (y > 4) y = 0; a.setY(i, y); }
    a.needsUpdate = true;
    if (built && !reduced) { const t = (now - built) / 1000; risers.forEach((r, i) => { r.scale.y = Math.max(0.001, ease((t - i * 0.35) / 1.3)); }); }
    controls.update();
    renderer!.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame((n) => { el.classList.add("in"); last = n; loop(n); });

  self = {
    el,
    close() {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      controls.dispose();
      scene.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; for (const q of Array.isArray(mat) ? mat : mat ? [mat] : []) q.dispose(); });
      renderer!.dispose(); renderer!.forceContextLoss();
      el.classList.add("out");
      setTimeout(() => el.remove(), reduced ? 0 : 350);
    },
    minimize() { el.classList.add("mini"); resize(); },
    restore() { el.classList.remove("mini"); resize(); },
    setDock,
    setHud,
  };
  return self;
}
