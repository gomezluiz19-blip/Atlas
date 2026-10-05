// Captures on the globe. A capture becomes a one-tile 3D Tiles tileset (SPZ inside glTF, built in the browser
// from blob URLs) that Cesium renders natively: sorted on the GPU side by its WebAssembly sorter, depth-tested
// against the terrain, lit by nothing (splats carry their own light, as captured). Placement (where, which
// way, how big, how high) is the tileset's model matrix, so moving it is instant; changing which way is up
// rewrites only the small glTF wrapper around the same compressed splats.
import { Cartesian3, Cartographic, Cesium3DTileset, HeadingPitchRange, Math as CMath, Matrix3, Matrix4, sampleTerrain, Transforms } from "cesium";
import type { App } from "../../app";
import { wake } from "../../globe/motion";
import { splatGlb, splatTileset } from "./format";
import type { SplatError, SplatJob, SplatResult } from "./splat.worker";

export type UpAxis = "y" | "z" | "-y";
export interface Placement { lon: number; lat: number; /** metres above the ground */ height: number; /** degrees clockwise from north */ heading: number; scale: number; up: UpAxis }
export interface Capture { id: string; name: string; spz: Uint8Array; count: number; original: number; min: number[]; max: number[]; radius: number; placement: Placement }

/** The node matrix that turns a capture's own "up" into glTF's +Y (column-major) (pure). */
export function upMatrix(up: UpAxis): number[] {
  // z-up: rotate −90° about X (z → y). y-down (raw 3DGS / COLMAP): 180° about X.
  if (up === "z") return [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
  if (up === "-y") return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
/** How far the capture's lowest splat sits below its centre, along its up axis (pure). */
export const baseDepth = (c: Pick<Capture, "min" | "max">, up: UpAxis) => (up === "z" ? -c.min[2] : up === "-y" ? c.max[1] : -c.min[1]);

let worker: Worker | null = null, seq = 0;
const waiting = new Map<number, (r: SplatResult | SplatError) => void>();
/** Parses and compresses a capture file off the main thread. */
export function prepare(name: string, bytes: ArrayBuffer, maxCount = 1_500_000): Promise<SplatResult | SplatError> {
  worker ??= new Worker(new URL("./splat.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<SplatResult | SplatError>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); };
  const id = ++seq;
  return new Promise((resolve) => { waiting.set(id, resolve); worker!.postMessage({ id, name, bytes, maxCount } satisfies SplatJob, [bytes]); });
}

export class CaptureLayer {
  private live = new Map<string, { tileset: Cesium3DTileset; urls: string[]; up: UpAxis; ground: number }>();
  constructor(private app: App) {}

  /** Puts a capture on the globe (or rebuilds it if its up axis changed). */
  async show(c: Capture) {
    const old = this.live.get(c.id);
    if (old && old.up === c.placement.up) { this.place(c); return old.tileset; }
    this.hide(c.id);
    const glb = splatGlb(c.spz, c.count, { min: c.min, max: c.max });
    // The up-axis fix lives in the glTF's node, so it applies before glTF's Y-up is turned into the globe's Z-up.
    const fixed = withNodeMatrix(glb, upMatrix(c.placement.up));
    const glbUrl = URL.createObjectURL(new Blob([fixed as BlobPart], { type: "model/gltf-binary" }));
    const ts = splatTileset(glbUrl, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], c.radius * c.placement.scale);
    const tsUrl = URL.createObjectURL(new Blob([JSON.stringify(ts)], { type: "application/json" }));
    const tileset = await Cesium3DTileset.fromUrl(tsUrl, { maximumScreenSpaceError: 1 });
    this.app.globe.viewer.scene.primitives.add(tileset);
    const ground = await groundAt(this.app, c.placement.lon, c.placement.lat);
    this.live.set(c.id, { tileset, urls: [glbUrl, tsUrl], up: c.placement.up, ground });
    this.place(c);
    return tileset;
  }

  /** Moves, turns or scales a capture already on the globe: just its model matrix. */
  place(c: Capture) {
    const l = this.live.get(c.id);
    if (!l) return;
    const p = c.placement;
    const lift = l.ground + p.height + baseDepth(c, p.up) * p.scale;
    const enu = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(p.lon, p.lat, lift));
    const turn = Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(CMath.toRadians(-p.heading)));
    const size = Matrix4.fromUniformScale(p.scale);
    l.tileset.modelMatrix = Matrix4.multiply(Matrix4.multiply(enu, turn, new Matrix4()), size, new Matrix4());
    wake(400);
  }

  /** Re-reads the ground height (after moving the capture somewhere else). */
  async reground(c: Capture) {
    const l = this.live.get(c.id);
    if (!l) return;
    l.ground = await groundAt(this.app, c.placement.lon, c.placement.lat);
    this.place(c);
  }

  fly(c: Capture) {
    const l = this.live.get(c.id);
    const r = Math.max(15, c.radius * c.placement.scale * 2.6);
    const centre = Cartesian3.fromDegrees(c.placement.lon, c.placement.lat, (l?.ground ?? 0) + c.placement.height + r * 0.2);
    this.app.globe.viewer.camera.flyToBoundingSphere({ center: centre, radius: r } as never, { offset: new HeadingPitchRange(CMath.toRadians(c.placement.heading + 30), CMath.toRadians(-22), r * 2.2), duration: 1.6 });
  }

  hide(id: string) {
    const l = this.live.get(id);
    if (!l) return;
    this.app.globe.viewer.scene.primitives.remove(l.tileset);
    for (const u of l.urls) URL.revokeObjectURL(u);
    this.live.delete(id);
    wake(300);
  }
  hideAll() { for (const id of [...this.live.keys()]) this.hide(id); }
  isShown(id: string) { return this.live.has(id); }
}

async function groundAt(app: App, lon: number, lat: number): Promise<number> {
  try {
    const [p] = await Promise.race([sampleTerrain(app.globe.viewer.scene.terrainProvider, 14, [Cartographic.fromDegrees(lon, lat)]), new Promise<Cartographic[]>((r) => setTimeout(() => r([new Cartographic(0, 0, 0)]), 4000))]);
    return (p.height ?? 0) * (app.globe.viewer.scene.verticalExaggeration ?? 1);
  } catch { return 0; }
}

/** A copy of a GLB with a matrix on its node (pure). */
export function withNodeMatrix(glb: Uint8Array, m: number[]): Uint8Array {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)));
  json.nodes[0].matrix = m;
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const jb = new TextEncoder().encode(text), rest = glb.subarray(20 + jsonLen);
  const out = new Uint8Array(20 + jb.length + rest.length), o = new DataView(out.buffer);
  out.set(glb.subarray(0, 20)); out.set(jb, 20); out.set(rest, 20 + jb.length);
  o.setUint32(8, out.length, true); o.setUint32(12, jb.length, true);
  return out;
}
