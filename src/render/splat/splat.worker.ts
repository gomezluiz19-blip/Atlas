// Turns a capture file into SPZ off the main thread: parse, tidy the floaters, centre it, compress. A phone
// capture of a few million splats takes a second or two here instead of freezing the page.
import { bounds, encodeSpz, parsePly, parseSplat, recentre, SH_C0, sniff, tidy, type SplatCloud } from "./format";

export interface SplatJob { id: number; name: string; bytes: ArrayBuffer; maxCount: number }
export interface SplatResult { id: number; ok: true; spz: Uint8Array; count: number; original: number; min: number[]; max: number[]; radius: number }
export interface SplatError { id: number; ok: false; error: string }

/** An .spz someone already has: decode it (the library Cesium uses), so it can be tidied and measured like the others. */
async function fromSpz(bytes: Uint8Array): Promise<SplatCloud> {
  const { loadSpz } = await import("@spz-loader/core");
  const g = await loadSpz(bytes, { unpackOptions: { coordinateSystem: "UNSPECIFIED" } });
  const n = g.numPoints;
  const c: SplatCloud = { count: n, positions: g.positions, rotations: g.rotations, scales: new Float32Array(n * 3), alphas: new Float32Array(n), colors: new Float32Array(n * 3) };
  for (let i = 0; i < n * 3; i++) { c.scales[i] = Math.log(Math.max(1e-7, g.scales[i])); c.colors[i] = (g.colors[i] - 0.5) / SH_C0; }
  for (let i = 0; i < n; i++) { const a = Math.min(0.999999, Math.max(1e-6, g.alphas[i])); c.alphas[i] = Math.log(a / (1 - a)); }
  return c;
}

export async function processJob(job: SplatJob): Promise<SplatResult | SplatError> {
  try {
    const u8 = new Uint8Array(job.bytes);
    const kind = sniff(u8, job.name);
    const raw = kind === "ply" ? parsePly(job.bytes) : kind === "splat" ? parseSplat(job.bytes) : kind === "spz" ? await fromSpz(u8) : null;
    if (!raw) return { id: job.id, ok: false, error: "That isn't a capture Terreno can read: use a .ply (Gaussian splat or coloured point cloud), .splat or .spz file." };
    const c = tidy(raw, job.maxCount);
    if (!c.count) return { id: job.id, ok: false, error: "No splats left after removing stray ones." };
    const b = bounds(c);
    recentre(c, b.centre);
    const b2 = bounds(c);
    const spz = await encodeSpz(c);
    return { id: job.id, ok: true, spz, count: c.count, original: raw.count, min: b2.min, max: b2.max, radius: b2.radius };
  } catch (e) {
    return { id: job.id, ok: false, error: (e as Error).message || "That file couldn't be read." };
  }
}

self.onmessage = async (e: MessageEvent<SplatJob>) => {
  const r = await processJob(e.data);
  (self as unknown as Worker).postMessage(r, r.ok ? [r.spz.buffer] : []);
};
