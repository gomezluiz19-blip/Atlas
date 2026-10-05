// Plays a cinematic shot on the globe: each animation frame, the camera sits where the spline says, looks at
// the spline's target with the horizon level, and takes the shot's field of view (for the dolly zoom). Heights
// in shots are above the ground, so the ground under the path is looked up once at the start.
import { Cartesian3, Cartographic, Ellipsoid, Math as CMath, PerspectiveFrustum, sampleTerrain } from "cesium";
import type { App } from "../app";
import { wake } from "../globe/motion";
import { sample, type Shot } from "./cinema";

export interface Playing { stop(): void; done: Promise<void> }

export async function play(app: App, shot: Shot, onFrame?: (t: number) => void): Promise<Playing> {
  const viewer = app.globe.viewer, camera = viewer.camera, scene = viewer.scene;
  const frustum = camera.frustum as PerspectiveFrustum;
  const fov0 = frustum.fov;
  // Ground under the keys (and their targets), so "40 m up" means above this ground.
  const pts = shot.keys.flatMap((k) => [k.at, k.look]);
  let ground = pts.map(() => 0);
  try {
    const got = await Promise.race([sampleTerrain(scene.terrainProvider, 13, pts.map((p) => Cartographic.fromDegrees(p[0], p[1]))), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
    if (got) ground = got.map((c) => (c.height ?? 0) * (scene.verticalExaggeration ?? 1));
  } catch { /* sea level */ }
  const g = ground.reduce((a, b) => a + b, 0) / Math.max(1, ground.length);
  let raf = 0, stopped = false, resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const t0 = performance.now();
  const up = new Cartesian3(), dir = new Cartesian3(), right = new Cartesian3();
  const frame = () => {
    if (stopped) return;
    const t = (performance.now() - t0) / 1000;
    const k = sample(shot, Math.min(t, shot.seconds));
    const pos = Cartesian3.fromDegrees(k.at[0], k.at[1], g + k.at[2]);
    const target = Cartesian3.fromDegrees(k.look[0], k.look[1], g + k.look[2]);
    Cartesian3.normalize(Cartesian3.subtract(target, pos, dir), dir);
    // Level horizon: "up" is the local vertical, made perpendicular to the view direction.
    Ellipsoid.WGS84.geodeticSurfaceNormal(pos, up);
    Cartesian3.normalize(Cartesian3.cross(dir, up, right), right);
    Cartesian3.normalize(Cartesian3.cross(right, dir, up), up);
    camera.setView({ destination: pos, orientation: { direction: dir, up } });
    if (k.fov) frustum.fov = CMath.toRadians(Math.min(100, Math.max(8, k.fov)));
    onFrame?.(t);
    wake(200);
    if (t >= shot.seconds) { finish(); return; }
    raf = requestAnimationFrame(frame);
  };
  const finish = () => { stopped = true; cancelAnimationFrame(raf); frustum.fov = fov0; wake(300); resolve(); };
  // Grabbing the map ends the shot.
  const off = () => { if (!stopped) finish(); };
  viewer.canvas.addEventListener("pointerdown", off, { once: true });
  viewer.canvas.addEventListener("wheel", off, { once: true, passive: true });
  raf = requestAnimationFrame(frame);
  return { stop: finish, done };
}
