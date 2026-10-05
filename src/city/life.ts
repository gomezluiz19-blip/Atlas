// The living city: when you come down close over a town, Terreno builds it
// around you from OpenStreetMap and sets it going. Buildings rise in soft
// clay tones over the real satellite ground, trees stand in the parks, and
// small toy-like cars drive the real streets (keeping to their side, turning
// at junctions) while figurine people walk the pavements, thickest near shops,
// cafés and stations. How many are out follows the local hour: rush hours
// busy, nights quiet. It's a simulation on real streets, not live tracking.
import {
  BoxGeometry, Cartesian2, Cartesian3, Color, ColorGeometryInstanceAttribute, CylinderGeometry, EllipsoidGeometry, GeometryInstance, HeadingPitchRoll,
  Math as CesiumMath, Matrix4, PerInstanceColorAppearance, PolygonGeometry, PolygonHierarchy, Primitive, Transforms,
} from "cesium";
import type { App } from "../app";
import { everyFrame } from "../globe/motion";
import { elevation } from "../data/elevation";
import { busyAt, dist, fetchCity, localHour, M_LAT, mLon, type CityData, type Mover, type Road } from "./data";

const CAR_COLORS = ["#c4513a", "#3563d6", "#e1b843", "#f2f2f7", "#2c2c2e", "#5b9467", "#d19a2e", "#8c8f87", "#8b5fa8", "#4c9ac9", "#f2f2f7", "#1c1c1e"];
const CLOTHES = ["#b8496a", "#5160c2", "#e1b843", "#5b9467", "#d19a2e", "#4c9ac9", "#f2f2f7", "#8b5fa8", "#1c1c1e", "#3563d6"];
const SKIN = ["#f3cfb3", "#e0ac7e", "#b67a4c", "#7b4b2a", "#5a3620"];
const CLAY: Record<string, string> = { house: "#f1e7da", detached: "#f1e7da", residential: "#efe6d8", apartments: "#ece4d6", commercial: "#e7eaf0", retail: "#efe3e0", office: "#e3e8ef", industrial: "#ddd8cf", warehouse: "#ddd8cf", church: "#ecdcc4", school: "#f2e2c2", hospital: "#eef0f2", yes: "#ebe6de" };
const ROOF: Record<string, string> = { house: "#c98f6c", detached: "#c98f6c", residential: "#b99c86", apartments: "#a9a39c", commercial: "#9fb0c2", retail: "#c7a19a", office: "#93a7bd", industrial: "#a7a39b", warehouse: "#a7a39b", church: "#8f9aa3", school: "#c9ad7d", hospital: "#b8c4cc", yes: "#b5aca1" };
const LEAVES = ["#4caf50", "#5cb85c", "#3f9e4d", "#6cc070", "#2e8b57"];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const inst = (geometry: ConstructorParameters<typeof GeometryInstance>[0]["geometry"], color: string, modelMatrix?: Matrix4) =>
  new GeometryInstance({ geometry, modelMatrix, attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(color)) } });
const lift = (x: number, y: number, z: number) => Matrix4.fromTranslation(new Cartesian3(x, y, z));
const APPEARANCE = () => new PerInstanceColorAppearance({ flat: false, translucent: false });

interface Agent { who: Mover; road: Road; seg: number; d: number; dir: 1 | -1; speed: number; side: number; prim: Primitive; phase: number }

export function createCityLife(app: App) {
  const viewer = app.globe.viewer, scene = viewer.scene, camera = viewer.camera;
  let on = true;
  let city: CityData | null = null, heights = new Map<Road, number[]>();
  let statics: Primitive[] = [];
  let agents: Agent[] = [];
  let loading = false, job = 0;
  const scratch = { m: new Matrix4(), p: new Cartesian3(), hpr: new HeadingPitchRoll() };
  const exag = () => app.globe.state.exaggeration;
  const real3d = () => app.globe.state.photorealistic;

  const status = (text: string) => {
    if (!on) return;
    app.canvas.put({ id: "city:life", label: `Living city · ${text}`, color: "#d19a2e", scope: "world", pinned: true,
      show: (v) => { for (const p of statics) p.show = v && !real3d(); for (const a of agents) a.prim.show = v; },
      remove: () => set(false) }, true);
  };

  // ---- Building the static city ----
  const clear = () => {
    for (const p of statics) scene.primitives.remove(p);
    for (const a of agents) scene.primitives.remove(a.prim);
    statics = []; agents = [];
  };

  const buildStatics = async (c: CityData) => {
    // Ground heights, in one batch: building centres, trees, and every road point.
    const cent = c.buildings.map((b) => [b.ring.reduce((s, q) => s + q[0], 0) / b.ring.length, b.ring.reduce((s, q) => s + q[1], 0) / b.ring.length] as [number, number]);
    const roadPts = c.roads.flatMap((r) => r.pts);
    const all = await elevation.sample([...cent, ...c.trees, ...roadPts], 15).catch(() => null);
    const hAt = (i: number) => Math.max(0, all?.[i] ?? 0) * exag();
    heights = new Map();
    let k = cent.length + c.trees.length;
    for (const r of c.roads) { heights.set(r, r.pts.map((_, i) => hAt(k + i))); k += r.pts.length; }
    // Buildings: batches of extruded footprints, soft clay colours (a guessed height a touch paler).
    for (let s = 0; s < c.buildings.length; s += 400) {
      const batch = c.buildings.slice(s, s + 400).flatMap((b, j) => {
        const ring = b.ring[0][0] === b.ring[b.ring.length - 1][0] && b.ring[0][1] === b.ring[b.ring.length - 1][1] ? b.ring.slice(0, -1) : b.ring;
        if (ring.length < 3) return [];
        const g = hAt(s + j), hier = new PolygonHierarchy(Cartesian3.fromDegreesArray(ring.flat()));
        const wall = CLAY[b.kind] ?? CLAY.yes;
        return [
          inst(new PolygonGeometry({ polygonHierarchy: hier, height: g - 1.5, extrudedHeight: g + b.height, vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), wall),
          // A roof in a slightly deeper tone, so the blocks read as buildings.
          inst(new PolygonGeometry({ polygonHierarchy: hier, height: g + b.height, extrudedHeight: g + b.height + 0.5, vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), ROOF[b.kind] ?? ROOF.yes),
        ];
      });
      if (batch.length) statics.push(scene.primitives.add(new Primitive({ geometryInstances: batch, appearance: APPEARANCE(), shadows: 0 })));
    }
    // Trees: a trunk and a round crown each, in a few greens.
    const trees = c.trees.flatMap((t, i) => {
      const g = hAt(cent.length + i), size = 0.8 + ((i * 37) % 10) / 20;
      const frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(t[0], t[1], g));
      const at = (z: number, sc: number) => Matrix4.multiply(frame, Matrix4.multiplyByUniformScale(lift(0, 0, z * size), sc * size, new Matrix4()), new Matrix4());
      return [
        inst(new CylinderGeometry({ length: 2.6, topRadius: 0.2, bottomRadius: 0.28, vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), "#8b5a3c", at(1.3, 1)),
        inst(new EllipsoidGeometry({ radii: new Cartesian3(2, 2, 2.4), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), LEAVES[i % LEAVES.length], at(4, 1)),
      ];
    });
    if (trees.length) statics.push(scene.primitives.add(new Primitive({ geometryInstances: trees, appearance: APPEARANCE() })));
    for (const p of statics) p.show = !real3d();
  };

  // ---- Movers ----
  const carShape = (color: string) => [
    inst(BoxGeometry.fromDimensions({ dimensions: new Cartesian3(4.4, 1.9, 0.9), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), color, lift(0, 0, 0.75)),
    inst(BoxGeometry.fromDimensions({ dimensions: new Cartesian3(2.3, 1.7, 0.72), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), "#27313d", lift(-0.25, 0, 1.55)),
  ];
  const personShape = (clothes: string, skin: string) => [
    // A figurine: a rounded body and a big friendly head.
    inst(new CylinderGeometry({ length: 1.0, topRadius: 0.3, bottomRadius: 0.4, vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), clothes, lift(0, 0, 0.5)),
    inst(new EllipsoidGeometry({ radii: new Cartesian3(0.34, 0.34, 0.36), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), skin, lift(0, 0, 1.36)),
  ];

  const spawn = (who: Mover): Agent | null => {
    if (!city) return null;
    const pool = city.roads.filter((r) => (who === "car" ? r.car : r.foot));
    if (!pool.length) return null;
    // Walkers start where streets are busy; cars anywhere, by length.
    const weight = (r: Road) => (who === "car" ? r.len : r.len * r.busy);
    let t = Math.random() * pool.reduce((s, r) => s + weight(r), 0), road = pool[0];
    for (const r of pool) { t -= weight(r); if (t <= 0) { road = r; break; } }
    const d = Math.random() * road.len;
    const dir: 1 | -1 = road.oneway && who === "car" ? 1 : Math.random() < 0.5 ? 1 : -1;
    const prim = new Primitive({ geometryInstances: who === "car" ? carShape(pick(CAR_COLORS)) : personShape(pick(CLOTHES), pick(SKIN)), appearance: APPEARANCE(), asynchronous: false });
    scene.primitives.add(prim);
    const side = who === "car" ? (road.oneway ? 0 : 1.8) : (road.car ? 5.5 : 0.8) * (Math.random() < 0.5 ? 1 : -1);
    const speed = who === "car" ? road.speed * (0.7 + Math.random() * 0.35) : 1.1 + Math.random() * 0.5;
    return { who, road, seg: segAt(road, d), d, dir, speed, side, prim, phase: Math.random() * 10 };
  };
  const segAt = (r: Road, d: number) => { let i = 0; while (i < r.cum.length - 2 && r.cum[i + 1] < d) i++; return i; };

  /** Onto another street at a junction (cars keep to one-ways' direction); back the way it came if there's none. */
  const turn = (a: Agent, node: number) => {
    const opts = (city?.junctions.get(node) ?? []).filter((o) => o.road !== a.road.id).map((o) => ({ ...o, r: city!.roads[o.road] }))
      .filter((o) => (a.who === "car" ? o.r.car && (!o.r.oneway || o.i < o.r.pts.length - 1) : o.r.foot));
    if (!opts.length) {
      if (a.who === "car" && a.road.oneway) { const fresh = spawnPlace(a); if (fresh) return; }
      a.dir = a.dir === 1 ? -1 : 1;
      return;
    }
    const o = pick(opts);
    a.road = o.r;
    a.d = o.r.cum[o.i];
    a.dir = o.r.oneway && a.who === "car" ? 1 : o.i === 0 ? 1 : o.i === o.r.pts.length - 1 ? -1 : Math.random() < 0.5 ? 1 : -1;
    a.seg = Math.min(o.i, o.r.pts.length - 2);
    if (a.who === "car") { a.speed = o.r.speed * (0.7 + Math.random() * 0.35); a.side = o.r.oneway ? 0 : 1.8; }
    else a.side = (o.r.car ? 5.5 : 0.8) * Math.sign(a.side || 1);
  };
  const spawnPlace = (a: Agent) => {
    const fresh = spawn(a.who);
    if (!fresh) return false;
    scene.primitives.remove(fresh.prim);
    Object.assign(a, { road: fresh.road, d: fresh.d, dir: fresh.dir, seg: fresh.seg, side: fresh.side, speed: fresh.speed });
    return true;
  };

  let last = 0;
  everyFrame(scene, () => {
    const now = performance.now(), dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    if (!on || !agents.length || camera.positionCartographic.height > 6000 || document.hidden) return;
    for (const a of agents) {
      const r = a.road;
      a.d += a.dir * a.speed * dt;
      // Past a junction point: sometimes turn there.
      while (a.dir === 1 && a.seg < r.pts.length - 2 && a.d > r.cum[a.seg + 1]) { a.seg++; const n = r.nodes[a.seg]; if (city!.junctions.has(n) && Math.random() < 0.3) { turn(a, n); break; } }
      while (a.dir === -1 && a.seg > 0 && a.d < r.cum[a.seg]) { const n = r.nodes[a.seg]; a.seg--; if (city!.junctions.has(n) && Math.random() < 0.3) { turn(a, n); break; } }
      if (a.d >= a.road.len) { a.d = a.road.len; turn(a, a.road.nodes[a.road.nodes.length - 1]); }
      else if (a.d <= 0) { a.d = 0; turn(a, a.road.nodes[0]); }
      place(a, now);
    }
  }, () => on && agents.length > 0 && camera.positionCartographic.height <= 6000 && !document.hidden);

  const place = (a: Agent, now: number) => {
    const r = a.road, i = Math.max(0, Math.min(a.seg, r.pts.length - 2));
    const p0 = r.pts[i], p1 = r.pts[i + 1], segLen = Math.max(0.01, r.cum[i + 1] - r.cum[i]);
    const f = Math.max(0, Math.min(1, (a.d - r.cum[i]) / segLen));
    const lat = p0[1] + (p1[1] - p0[1]) * f, lon = p0[0] + (p1[0] - p0[0]) * f;
    const hs = heights.get(r);
    const ground = hs ? hs[i] + (hs[i + 1] - hs[i]) * f : 0;
    // Heading along the street the way it's going, and off to its side of the road.
    const ex = (p1[0] - p0[0]) * mLon(lat), ny = (p1[1] - p0[1]) * M_LAT;
    let bearing = Math.atan2(ex, ny);
    if (a.dir === -1) bearing += Math.PI;
    const side = a.side;
    const offE = Math.cos(bearing) * side, offN = -Math.sin(bearing) * side;
    const bob = a.who === "person" ? Math.abs(Math.sin(now / 160 + a.phase)) * 0.12 : 0;
    Cartesian3.fromDegrees(lon + offE / mLon(lat), lat + offN / M_LAT, ground + bob, undefined, scratch.p);
    scratch.hpr.heading = bearing - Math.PI / 2;
    Transforms.headingPitchRollToFixedFrame(scratch.p, scratch.hpr, undefined, undefined, scratch.m);
    // Toy scale: life-size close up, growing with distance so they still read from above.
    const far = Cartesian3.distance(camera.positionWC, scratch.p);
    const k = a.who === "car" ? Math.min(5.5, Math.max(1.2, far / 170)) : Math.min(5, Math.max(1.6, far / 150));
    Matrix4.multiplyByUniformScale(scratch.m, k, scratch.m);
    Matrix4.clone(scratch.m, a.prim.modelMatrix);
  };

  /** Sets how many are out for this hour, adding or retiring movers. */
  const populate = () => {
    if (!city) return;
    const hour = localHour(city.centre[0]);
    const carKm = city.roads.filter((r) => r.car).reduce((s, r) => s + r.len, 0) / 1000;
    const footKm = city.roads.filter((r) => r.foot).reduce((s, r) => s + r.len * Math.min(3, r.busy / 2), 0) / 1000;
    const cap = matchMedia("(max-width: 820px)").matches ? 70 : 150;
    const want = { car: Math.round(Math.min(cap, carKm * 9) * busyAt(hour, "car")), person: Math.round(Math.min(cap, footKm * 8 + city.hotspots.length * 0.6) * busyAt(hour, "person")) };
    for (const who of ["car", "person"] as Mover[]) {
      const have = agents.filter((a) => a.who === who);
      for (let n = have.length; n < want[who]; n++) { const a = spawn(who); if (a) agents.push(a); }
      for (const a of have.slice(want[who])) { scene.primitives.remove(a.prim); agents = agents.filter((x) => x !== a); }
    }
    const cars = agents.filter((a) => a.who === "car").length, people = agents.length - cars;
    status(`${city.buildings.length.toLocaleString()} buildings, ${cars} cars, ${people} people`);
  };
  setInterval(() => { if (on && city) populate(); }, 120_000);

  // ---- When to build ----
  const centreOfView = (): [number, number] | null => {
    const c = viewer.canvas;
    const ray = camera.getPickRay(new Cartesian2(c.clientWidth / 2, c.clientHeight * 0.55));
    const hit = ray ? scene.globe.pick(ray, scene) : undefined;
    if (!hit) return null;
    const g = scene.globe.ellipsoid.cartesianToCartographic(hit);
    return [CesiumMath.toDegrees(g.longitude), CesiumMath.toDegrees(g.latitude)];
  };
  const maybeBuild = async () => {
    if (!on || loading) return;
    const h = camera.positionCartographic.height;
    const show = h < 6000;
    for (const p of statics) p.show = show && !real3d();
    for (const a of agents) a.prim.show = show;
    if (h > 3500) return;
    const c = centreOfView();
    if (!c || (city && dist(c, city.centre) < 450)) return;
    loading = true;
    const my = ++job;
    status("building the streets around…");
    try {
      const data = await fetchCity(c[0], c[1]);
      if (my !== job || !on) return;
      clear();
      city = data;
      await buildStatics(data);
      if (my !== job || !on) return;
      populate();
    } catch {
      status("couldn't reach OpenStreetMap just now");
    } finally {
      loading = false;
    }
  };
  let t = 0;
  camera.moveEnd.addEventListener(() => { clearTimeout(t); t = window.setTimeout(() => void maybeBuild(), 600); });

  const set = (v: boolean) => {
    on = v;
    if (!v) { clear(); city = null; app.canvas.drop("city:life"); }
    else void maybeBuild();
  };

  return { set, isOn: () => on, refresh: () => void maybeBuild(), counts: () => ({ cars: agents.filter((a) => a.who === "car").length, people: agents.filter((a) => a.who === "person").length, buildings: city?.buildings.length ?? 0 }) };
}
