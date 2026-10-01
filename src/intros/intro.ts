// A landmark's intro: the place as a white architect's model on a plinth (the
// ground shaped from the real terrain, the buildings around it from
// OpenStreetMap, the landmark itself as a simple massing model), a few lines
// about it, callouts on its parts, then a cut to the real place on the globe.
// three.js is loaded only when an intro plays.
import * as THREE from "three";
import { isNight, makeFx, type FxScene } from "./fx";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { zoomForSpacing } from "../analysis/profile";
import { elevation } from "../data/elevation";
import { fetchBuildings, type Building } from "../myplaces/scene";
import { h } from "../ui/dom";
import { markSeen, setIntrosOff, type Form, type IntroPlace } from "./places";

const W = 10; // the plinth is 10 units across
const PUSH = 3; // seconds on the wide shot before moving in
const N = 64; // terrain grid
const DEG = Math.PI / 180;

/** One massing form as geometry, in metres: x east, y up, z south. */
export function formGeometry(f: Form): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  switch (f.f) {
    case "box": g = new THREE.BoxGeometry(f.w, f.h, f.d).translate(0, f.h / 2, 0); break;
    case "frustum": g = new THREE.CylinderGeometry(f.top / Math.SQRT2, f.w / Math.SQRT2, f.h, 4, 1).rotateY(Math.PI / 4).translate(0, f.h / 2, 0); break;
    case "cyl":
      g = new THREE.CylinderGeometry(f.top ?? f.r, f.r, f.h, 40).translate(0, f.h / 2, 0);
      if (f.tilt) g.rotateX(f.tilt * DEG); // leans south
      break;
    case "cone": g = new THREE.ConeGeometry(f.r, f.h, 40).translate(0, f.h / 2, 0); break;
    case "dome": g = new THREE.SphereGeometry(f.r, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, (f.h ?? f.r) / f.r, 1); break;
    case "sphere": g = new THREE.SphereGeometry(f.r, 32, 18).translate(0, f.r, 0); break;
    case "pyramid": g = new THREE.ConeGeometry(f.w / Math.SQRT2, f.h, 4, 1).rotateY(Math.PI / 4).translate(0, f.h / 2, 0); break;
    case "steps": {
      const n = Math.max(1, f.n), lh = f.h / n;
      g = mergeGeometries(Array.from({ length: n }, (_, i) => {
        const w = f.w + ((f.top - f.w) * i) / Math.max(1, n - 1);
        return new THREE.BoxGeometry(w, lh, w).translate(0, lh * i + lh / 2, 0);
      }));
      break;
    }
    case "ring": {
      const s = new THREE.Shape().absellipse(0, 0, f.rx, f.ry, 0, Math.PI * 2, false, 0);
      s.holes.push(new THREE.Path().absellipse(0, 0, f.ix, f.iy, 0, Math.PI * 2, true, 0));
      g = new THREE.ExtrudeGeometry(s, { depth: f.h, bevelEnabled: false, curveSegments: 56 }).rotateX(-Math.PI / 2);
      break;
    }
    case "stand": {
      const n = Math.max(1, f.n ?? 3), full = f.from === undefined || f.to === undefined;
      const a0 = (f.from ?? 0) * DEG, a1 = (f.to ?? 360) * DEG;
      g = mergeGeometries(Array.from({ length: n }, (_, i) => {
        const fi = i / n, fo = (i + 1) / n;
        const irx = f.ix + (f.rx - f.ix) * fi, iry = f.iy + (f.ry - f.iy) * fi, orx = f.ix + (f.rx - f.ix) * fo, ory = f.iy + (f.ry - f.iy) * fo;
        const s = new THREE.Shape();
        if (full) {
          s.absellipse(0, 0, orx, ory, 0, Math.PI * 2, false, 0);
          s.holes.push(new THREE.Path().absellipse(0, 0, irx, iry, 0, Math.PI * 2, true, 0));
        } else {
          s.absellipse(0, 0, orx, ory, a0, a1, false, 0);
          s.absellipse(0, 0, irx, iry, a1, a0, true, 0);
        }
        return new THREE.ExtrudeGeometry(s, { depth: (f.h * (i + 1)) / n, bevelEnabled: false, curveSegments: 56 }).rotateX(-Math.PI / 2);
      }));
      break;
    }
    case "stones":
      g = mergeGeometries(Array.from({ length: f.n }, (_, i) => {
        const a = (2 * Math.PI * i) / f.n;
        return new THREE.BoxGeometry(f.w, f.h, f.d).rotateY(-(a + Math.PI / 2)).translate(f.r * Math.cos(a), f.h / 2, f.r * Math.sin(a));
      }));
      break;
    case "arch": {
      const pts = Array.from({ length: 33 }, (_, i) => {
        const x = -f.span / 2 + (f.span * i) / 32;
        return new THREE.Vector3(x, f.h * (1 - (2 * x / f.span) ** 2), 0);
      });
      g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, f.t / 2, 10);
      break;
    }
    case "shell": g = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI, 0, Math.PI / 2).scale(f.rx, f.h, f.ry); break;
  }
  const rot = "rot" in f ? f.rot ?? 0 : 0;
  if (rot) g.rotateY(-rot * DEG);
  const z = "z" in f ? f.z ?? 0 : 0;
  return g.translate(f.dx ?? 0, z, -(f.dy ?? 0));
}

/** How far out from the centre the model reaches (metres), so nearby OSM buildings don't overlap it. */
export function formReach(forms: Form[]): number {
  let r = 0;
  for (const f of forms) {
    const half = "w" in f ? f.w / 2 : "rx" in f ? Math.max(f.rx, f.ry) : "span" in f ? f.span / 2 : "r" in f ? f.r : 0;
    r = Math.max(r, Math.hypot(f.dx ?? 0, f.dy ?? 0) + half * Math.SQRT2);
  }
  return r;
}

const within = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/**
 * Plays the intro over everything. `onCut` runs once, when the intro hands
 * over to the real place (at the end, on "Go there", or on Skip).
 * Returns a function that closes it.
 */
export function playIntro(p: IntroPlace, onCut: () => void): () => void {
  markSeen(p);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch {
    onCut();
    return () => {};
  }
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // ---- The card ----
  const progress = h("i", {});
  const lines = p.lines.map((t) => h("p", { class: "lmi-line" }, t));
  const off = h("input", { type: "checkbox", onchange: () => setIntrosOff(off.checked) }) as HTMLInputElement;
  const go = h("button", { class: "lmi-go", onclick: () => cut(true) }, "Go there ", h("span", { "aria-hidden": "true" }, "→"));
  const card = h("div", { class: "lmi-card" },
    h("p", { class: "lmi-where" }, p.where),
    h("h1", { class: "lmi-name" }, p.name),
    ...lines,
    p.facts.length ? h("dl", { class: "lmi-facts" }, ...p.facts.map(([k, v]) => h("div", {}, h("dd", {}, v), h("dt", {}, k)))) : "",
    h("div", { class: "lmi-actions" }, go, h("button", { class: "lmi-skip", onclick: () => cut(false) }, "Skip")),
    h("label", { class: "lmi-off" }, off, " Don't play landmark intros"),
    h("div", { class: "lmi-progress", "aria-hidden": "true" }, progress));
  const calls = h("div", { class: "lmi-calls", "aria-hidden": "true" });
  const canvasHost = h("div", { class: "lmi-canvas" });
  const el = h("div", { class: "lmi", role: "dialog", "aria-label": `${p.name}: introduction` }, canvasHost, calls, card);
  canvasHost.append(renderer.domElement);
  document.body.append(el);

  // ---- The scene ----
  const scene = new THREE.Scene();
  const night = isNight(p.fx);
  scene.background = new THREE.Color(night ? 0x070b18 : 0xf6f6f3);
  if (night) el.classList.add("night");
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = -0.6;
  scene.add(night ? new THREE.HemisphereLight(0x8fa6d8, 0x1a2030, 0.9) : new THREE.HemisphereLight(0xffffff, 0xd9d6cf, 1.5));
  const sun = new THREE.DirectionalLight(night ? 0xbcd0ff : 0xffffff, night ? 0.9 : 2.1);
  sun.position.set(-7, 13, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 50 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  // A soft shadow under the plinth, on the white floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.13 }));
  floor.receiveShadow = true;
  scene.add(floor);

  const model = new THREE.Group(); // in metres, scaled into units
  scene.add(model);
  const k = W / p.size;
  const mx = 111_320 * Math.cos(p.lat * DEG), my = 110_540;
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x7e7c76, transparent: true, opacity: 0.6 });
  const risers: { o: THREE.Object3D; at: number }[] = [];
  const anchors: { label: string; v: THREE.Vector3; at: number; el: HTMLElement; hidden?: boolean }[] = [];
  const ray = new THREE.Raycaster();
  let frame = 0;
  let ex = 1, g0 = 0, bottom = -0.04 * p.size, heights: Float32Array | null = null, built = 0;
  const T0 = performance.now();

  const ground = (x: number, z: number) => {
    if (!heights) return g0;
    const fi = Math.min(N - 1, Math.max(0, ((x + p.size / 2) / p.size) * (N - 1))), fj = Math.min(N - 1, Math.max(0, ((z + p.size / 2) / p.size) * (N - 1)));
    const i = Math.min(N - 2, Math.floor(fi)), j = Math.min(N - 2, Math.floor(fj)), a = fi - i, b = fj - j;
    const v = (ii: number, jj: number) => heights![jj * N + ii];
    return (v(i, j) * (1 - a) + v(i + 1, j) * a) * (1 - b) + (v(i, j + 1) * (1 - a) + v(i + 1, j + 1) * a) * b;
  };

  const build = (hs: Float32Array | null, bs: Building[]) => {
    heights = hs && hs.length === N * N ? hs : null;
    let zmin = 0, zmax = 0;
    if (heights) { zmin = Infinity; zmax = -Infinity; for (const v of heights) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); } }
    g0 = Math.max(0, ground(0, 0));
    // A built landmark stands on a level pad (elevation data carries tree canopy and noise), eased
    // back into the real ground beyond it.
    if (heights && p.forms?.length) {
      const pad = formReach(p.forms) * 1.15 + 10, fade = pad * 0.8;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const d = Math.hypot((i / (N - 1) - 0.5) * p.size, (j / (N - 1) - 0.5) * p.size);
        const u = Math.min(1, Math.max(0, (d - pad) / fade)), t = u * u * (3 - 2 * u);
        const q = j * N + i;
        if (heights[q] > 0) heights[q] = Math.max(0.5, g0 + (heights[q] - g0) * t);
      }
    }
    // Natural places are lifted so their shape reads; built ones stay true to scale.
    const relief = Math.max(1, zmax - Math.max(zmin, 0));
    ex = p.forms?.length ? 1 : Math.min(3, Math.max(1, Math.round(((0.2 * p.size) / relief) * 2) / 2));
    bottom = Math.min(zmin, 0) - g0 - (0.045 * p.size) / ex;
    model.scale.set(k, k * ex, k);
    model.position.y = -bottom * k * ex;
    floor.position.y = -0.002;

    // The plinth: the terrain on top, the cut sides around it.
    const top = new THREE.PlaneGeometry(p.size, p.size, N - 1, N - 1).rotateX(-Math.PI / 2);
    const pos = top.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(N * N * 3), land = new THREE.Color(0xf7f6f2), sea = new THREE.Color(0xdde5ea);
    for (let q = 0; q < N * N; q++) {
      const z = heights ? heights[q] : 0;
      pos.setY(q, z - g0);
      (z < 0 ? sea : land).toArray(colors, q * 3);
    }
    top.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    top.computeVertexNormals();
    const terrain = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    terrain.receiveShadow = terrain.castShadow = true;
    model.add(terrain);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 1, side: THREE.DoubleSide });
    const half = p.size / 2;
    const sides: ((t: number) => [number, number])[] = [
      (t) => [-half + p.size * t, -half], (t) => [half, -half + p.size * t],
      (t) => [half - p.size * t, half], (t) => [-half, half - p.size * t],
    ];
    for (const at of sides) {
      const vs: number[] = [], idx: number[] = [];
      for (let i = 0; i < N; i++) {
        const [x, z] = at(i / (N - 1));
        vs.push(x, ground(x, z) - g0, z, x, bottom, z);
        if (i < N - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(vs, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, sideMat);
      m.castShadow = true;
      model.add(m);
    }
    if (zmin < 0) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(p.size, p.size).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb9d3e3, transparent: true, opacity: 0.6, roughness: 0.3 }));
      water.position.y = -g0 + 0.3 / ex;
      water.receiveShadow = true;
      model.add(water);
    }
    // A thin outline round the plinth's top: the crisp edge of a model.
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(p.size, -bottom, p.size).translate(0, bottom / 2, 0)), new THREE.LineBasicMaterial({ color: 0xc9c6bf }));
    model.add(rim);

    // The buildings around, pale; the landmark's own footprint is left to the model.
    const reach = p.forms?.length ? formReach(p.forms) : 0;
    const geos: THREE.BufferGeometry[] = [];
    for (const b of bs) {
      if (geos.length > 1800) break;
      const pts = b.ring.map(([lon, lat]) => [(lon - p.lon) * mx, (lat - p.lat) * my] as [number, number]);
      if (pts.some(([x, y]) => Math.abs(x) > half * 0.97 || Math.abs(y) > half * 0.97)) continue;
      const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
      if (reach && Math.hypot(cx, cy) < reach) continue;
      const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(2, b.height), bevelEnabled: false }).rotateX(-Math.PI / 2);
      g.translate(0, ground(cx, -cy) - g0, 0);
      geos.push(g);
    }
    if (geos.length) {
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      if (merged) {
        const town = new THREE.Group();
        const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.9 }));
        mesh.castShadow = mesh.receiveShadow = true;
        town.add(mesh, new THREE.LineSegments(new THREE.EdgesGeometry(merged, 30), new THREE.LineBasicMaterial({ color: 0xb8b5ad, transparent: true, opacity: 0.55 })));
        model.add(town);
        risers.push({ o: town, at: 0.25 });
      }
    }

    // The landmark, piece by piece.
    (p.forms ?? []).forEach((f, i) => {
      const g = formGeometry(f);
      const grp = new THREE.Group();
      const mesh = new THREE.Mesh(g, white);
      mesh.castShadow = mesh.receiveShadow = true;
      grp.add(mesh, new THREE.LineSegments(new THREE.EdgesGeometry(g, f.f === "arch" ? 60 : 28), edgeMat));
      model.add(grp);
      risers.push({ o: grp, at: 0.6 + i * 0.12 });
    });
    for (const r of risers) r.o.scale.y = reduced ? 1 : 0.001;

    // Callouts.
    (p.parts ?? []).forEach((part, i) => {
      const x = part.dx ?? 0, z = -(part.dy ?? 0);
      const base = p.forms?.length ? 0 : ground(x, z) - g0;
      const lab = h("div", { class: "lmi-call" }, h("span", {}, part.label), h("i", {}), h("b", {}));
      calls.append(lab);
      anchors.push({ label: part.label, v: new THREE.Vector3(x, base + part.h, z), at: PUSH + 1.2 + i * 0.8, el: lab });
    });

    // Frame it: look at the middle of the model's height.
    const tall = Math.max(...(p.forms ?? []).map((f) => ("z" in f ? f.z ?? 0 : 0) + ("h" in f && f.h ? f.h : "r" in f ? f.r * 2 : 0)), (zmax - g0) * ex, 0) * k;
    // Two shots: the whole plinth, then in close on the landmark (natural places stay wide).
    const deck = -bottom * k * ex;
    far.set(0, deck + tall * 0.2, 0);
    near.set(0, deck + tall * 0.45, 0);
    dFar = 21;
    dNear = p.forms?.length ? Math.min(17, Math.max(7, tall * 4.5 + 3, formReach(p.forms) * k * 4.5 + 3)) : 17;
    controls.target.copy(far);
    camera.position.copy(far).add(new THREE.Vector3(Math.sin(-35 * DEG), 0.62, Math.cos(-35 * DEG)).normalize().multiplyScalar(dFar * 1.3));
    if (p.fx?.length) fxScene = makeFx(p.fx, { model, size: p.size, ground: (x, z) => ground(x, z) - g0, top: zmax - g0, ex });
    built = performance.now();
  };
  let fxScene: FxScene | null = null;

  let dFar = 21, dNear = 12;
  const far = new THREE.Vector3(), near = new THREE.Vector3();
  const hs = (() => {
    const pts: [number, number][] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([p.lon + ((i / (N - 1) - 0.5) * p.size) / mx, p.lat + ((0.5 - j / (N - 1)) * p.size) / my]);
    return within(elevation.sample(pts, Math.min(14, zoomForSpacing(p.size / (N - 1), p.lat))), 3500, null);
  })();
  const bs = p.size <= 4000 ? within(fetchBuildings(p.lon, p.lat, Math.min(p.size * 0.7, 1200)), 4000, [] as Building[]) : Promise.resolve([] as Building[]);
  void Promise.all([hs, bs]).then(([a, b]) => { if (!closed) build(a, b); });

  // ---- The timeline ----
  const duration = Math.max(10, PUSH + 4 + p.lines.length * 1.6 + (p.parts?.length ?? 0) * 0.8);
  let paused = false, played = 0, last = performance.now(), raf = 0, closed = false, cutting = 0;
  controls.addEventListener("start", () => { paused = true; controls.autoRotate = false; el.classList.add("held"); });
  const resize = () => {
    const w = innerWidth, hh = innerHeight;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    // On wide screens the card takes the left; the model centres in the rest.
    const shift = w > 820 ? Math.min(230, w * 0.16) : 0;
    // On phones the card takes the bottom; the model sits above it.
    if (shift) camera.setViewOffset(w, hh, -shift, 0, w, hh); else camera.setViewOffset(w, hh, 0, hh * 0.18, w, hh);
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  resize();
  const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const v = new THREE.Vector3(), rel = new THREE.Vector3();

  const loop = (now: number) => {
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    const since = built ? (now - built) / 1000 : 0;
    // The model rises into place, piece by piece.
    for (const r of risers) if (!reduced) r.o.scale.y = Math.max(0.001, ease((since - r.at) / 0.9));
    fxScene?.update(reduced ? 2 : since);
    // Lines come in one by one.
    const t = (now - T0) / 1000;
    lines.forEach((l, i) => l.classList.toggle("on", reduced || t > 0.5 + i * 1.6));
    // The camera eases in, then circles slowly.
    if (built && !paused && !cutting) {
      const push = ease((played - PUSH) / 4.5);
      controls.target.lerpVectors(far, near, push);
      rel.copy(camera.position).sub(controls.target);
      const want = dFar * (1 + 0.3 * (1 - ease(since / 3))) * (1 - push) + dNear * push;
      rel.setLength(rel.length() + (want - rel.length()) * (1 - Math.exp(-dt * 3.5)));
      camera.position.copy(controls.target).add(rel);
    }
    if (cutting) {
      rel.copy(camera.position).sub(controls.target);
      rel.multiplyScalar(Math.exp(-dt * 5));
      camera.position.copy(controls.target).add(rel);
    }
    controls.update();
    renderer.render(scene, camera);
    const cw = innerWidth, ch = innerHeight;
    // Callouts follow their points; a label that would sit on another gets a longer leader.
    const placed: [number, number, number, number][] = [];
    const seen = anchors.map((a) => {
      v.copy(a.v).applyMatrix4(model.matrixWorld).project(camera);
      const show = !!built && played > a.at && cutting === 0 && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
      return { a, show, x: ((v.x + 1) / 2) * cw, y: ((1 - v.y) / 2) * ch };
    }).sort((p, q) => q.y - p.y);
    // Every few frames: is the point behind the model from here? Then its callout dims.
    if (++frame % 8 === 0)
      for (const a of anchors) {
        const w = a.v.clone().applyMatrix4(model.matrixWorld), d = w.distanceTo(camera.position);
        ray.set(camera.position, w.sub(camera.position).normalize());
        ray.far = d;
        a.hidden = ray.intersectObject(model, true).some((hit) => (hit.object as THREE.Mesh).isMesh && hit.distance < d - 0.08);
      }
    for (const s of seen) {
      s.a.el.classList.toggle("on", s.show);
      s.a.el.classList.toggle("behind", !!s.a.hidden);
      if (!s.show) continue;
      const w = s.a.label.length * 7 + 24;
      let lift = 34;
      const hits = (l: number) => placed.some(([x, y, pw]) => Math.abs(x - s.x) < (w + pw) / 2 + 6 && Math.abs(y - (s.y - l)) < 28);
      while (lift < 220 && hits(lift)) lift += 28;
      placed.push([s.x, s.y - lift, w, 0]);
      s.a.el.style.setProperty("--lift", `${lift}px`);
      s.a.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    }
    // The clock runs once the model is up, and stops while you turn it yourself.
    if (built && !paused && !cutting) played += dt;
    progress.style.width = `${Math.min(100, (played / duration) * 100)}%`;
    if (played >= duration && !cutting) cut(true);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame((n) => { el.classList.add("in"); last = n; loop(n); });

  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); cut(false); }
    else if (e.key === "Enter" && document.activeElement?.tagName !== "BUTTON") { e.preventDefault(); cut(true); }
  };
  addEventListener("keydown", keys);
  go.focus({ preventScroll: true });

  let handed = false;
  const handOver = () => { if (!handed) { handed = true; onCut(); } };
  function cut(swoop: boolean) {
    if (cutting || closed) return;
    cutting = performance.now();
    // The globe starts its flight now, behind the fading model.
    handOver();
    el.classList.add(swoop && !reduced ? "cut" : "gone");
    setTimeout(close, swoop && !reduced ? 900 : 250);
  }
  function close() {
    if (closed) return;
    closed = true;
    handOver();
    cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    removeEventListener("keydown", keys);
    controls.dispose();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) x.dispose();
    });
    fxScene?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    el.remove();
  }
  return close;
}
