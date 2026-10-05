// Gaussian splats: the photoreal 3D captures phones and drones now make (Polycam, Luma, Scaniverse, Postshot,
// Nerfstudio and others). Each splat is a soft, coloured, oriented ellipsoid; millions of them together render
// a real place, from any angle, faster than a mesh. This file reads the common formats into one in-memory
// shape and writes Niantic's compact SPZ format, which is what Cesium renders natively inside 3D Tiles (see
// globe.ts). Everything here is pure, for tests and workers.
//
// The in-memory shape is the "raw" Gaussian, as training produces it: log scales, logit opacity, and the
// colour as the degree-0 spherical-harmonic coefficient (view-independent colour).

export interface SplatCloud {
  count: number;
  /** x, y, z per splat, metres, in the capture's own frame. */
  positions: Float32Array;
  /** log of the ellipsoid's three radii. */
  scales: Float32Array;
  /** Orientation quaternion, x, y, z, w (normalized). */
  rotations: Float32Array;
  /** Opacity before the sigmoid (logit). */
  alphas: Float32Array;
  /** Colour as the SH degree-0 coefficient per channel (colour = 0.5 + SH_C0 · c). */
  colors: Float32Array;
}

export const SH_C0 = 0.28209479177387814;
const logit = (p: number) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, p)); return Math.log(q / (1 - q)); };
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const rgbToDc = (u8: number) => (u8 / 255 - 0.5) / SH_C0;

function empty(n: number): SplatCloud {
  return { count: n, positions: new Float32Array(n * 3), scales: new Float32Array(n * 3), rotations: new Float32Array(n * 4), alphas: new Float32Array(n), colors: new Float32Array(n * 3) };
}

/** Which format a file is in, from its first bytes and name (pure). */
export function sniff(bytes: Uint8Array, name = ""): "ply" | "splat" | "spz" | "unknown" {
  if (bytes.length >= 3 && bytes[0] === 0x70 && bytes[1] === 0x6c && bytes[2] === 0x79) return "ply"; // "ply"
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return "spz"; // gzip
  if (/\.splat$/i.test(name) && bytes.length % 32 === 0) return "splat";
  return "unknown";
}

const PLY_TYPES: Record<string, [number, (v: DataView, o: number) => number]> = {
  char: [1, (v, o) => v.getInt8(o)], int8: [1, (v, o) => v.getInt8(o)], uchar: [1, (v, o) => v.getUint8(o)], uint8: [1, (v, o) => v.getUint8(o)],
  short: [2, (v, o) => v.getInt16(o, true)], int16: [2, (v, o) => v.getInt16(o, true)], ushort: [2, (v, o) => v.getUint16(o, true)], uint16: [2, (v, o) => v.getUint16(o, true)],
  int: [4, (v, o) => v.getInt32(o, true)], int32: [4, (v, o) => v.getInt32(o, true)], uint: [4, (v, o) => v.getUint32(o, true)], uint32: [4, (v, o) => v.getUint32(o, true)],
  float: [4, (v, o) => v.getFloat32(o, true)], float32: [4, (v, o) => v.getFloat32(o, true)], double: [8, (v, o) => v.getFloat64(o, true)], float64: [8, (v, o) => v.getFloat64(o, true)],
};

/**
 * A binary little-endian PLY: the standard 3D Gaussian Splatting export (x y z, f_dc_0..2, opacity, scale_0..2,
 * rot_0..3, plus f_rest_* which are dropped), or a plain coloured point cloud (x y z red green blue), which
 * becomes small round splats (pure).
 */
export function parsePly(buf: ArrayBuffer): SplatCloud {
  const bytes = new Uint8Array(buf);
  const headEnd = (() => { const tail = "end_header\n"; for (let i = 0; i < Math.min(bytes.length, 65536); i++) { let ok = true; for (let j = 0; j < tail.length; j++) if (bytes[i + j] !== tail.charCodeAt(j)) { ok = false; break; } if (ok) return i + tail.length; } return -1; })();
  if (headEnd < 0) throw new Error("That PLY file has no header.");
  const header = new TextDecoder().decode(bytes.subarray(0, headEnd)).split(/\r?\n/);
  if (!header.some((l) => /^format binary_little_endian/.test(l))) throw new Error("Only binary little-endian PLY files are supported (the usual Gaussian splat export).");
  let count = 0, inVertex = false, stride = 0;
  const props: { name: string; off: number; read: (v: DataView, o: number) => number }[] = [];
  for (const l of header) {
    const el = l.match(/^element (\w+) (\d+)/);
    if (el) {
      if (inVertex) break;
      inVertex = el[1] === "vertex";
      if (inVertex) count = Number(el[2]);
      continue;
    }
    const pr = l.match(/^property (\w+) (\w+)$/);
    if (pr && inVertex) {
      const t = PLY_TYPES[pr[1]];
      if (!t) throw new Error(`Unsupported PLY property type ${pr[1]}.`);
      props.push({ name: pr[2], off: stride, read: t[1] });
      stride += t[0];
    }
  }
  if (!count) throw new Error("That PLY file has no vertices.");
  if (headEnd + count * stride > bytes.length) throw new Error("That PLY file is shorter than its header says.");
  const view = new DataView(buf, headEnd);
  const p = (n: string) => props.find((x) => x.name === n);
  const X = p("x"), Y = p("y"), Z = p("z");
  if (!X || !Y || !Z) throw new Error("That PLY file has no x, y, z.");
  const dc = [p("f_dc_0"), p("f_dc_1"), p("f_dc_2")], rgb = [p("red"), p("green"), p("blue")];
  const sc = [p("scale_0"), p("scale_1"), p("scale_2")], rot = [p("rot_0"), p("rot_1"), p("rot_2"), p("rot_3")], op = p("opacity");
  const gaussian = dc.every(Boolean) && sc.every(Boolean) && rot.every(Boolean) && !!op;
  const c = empty(count);
  // Plain point clouds: splats about a quarter of the typical spacing, nearly opaque.
  const pointLog = Math.log(0.02), opaque = logit(0.98);
  for (let i = 0; i < count; i++) {
    const o = i * stride;
    c.positions[i * 3] = X.read(view, o + X.off); c.positions[i * 3 + 1] = Y.read(view, o + Y.off); c.positions[i * 3 + 2] = Z.read(view, o + Z.off);
    if (gaussian) {
      for (let k = 0; k < 3; k++) { c.colors[i * 3 + k] = dc[k]!.read(view, o + dc[k]!.off); c.scales[i * 3 + k] = sc[k]!.read(view, o + sc[k]!.off); }
      c.alphas[i] = op!.read(view, o + op!.off);
      // PLY stores the quaternion w first; SplatCloud keeps x, y, z, w.
      const w = rot[0]!.read(view, o + rot[0]!.off), x = rot[1]!.read(view, o + rot[1]!.off), y = rot[2]!.read(view, o + rot[2]!.off), z = rot[3]!.read(view, o + rot[3]!.off);
      const n = Math.hypot(x, y, z, w) || 1;
      c.rotations.set([x / n, y / n, z / n, w / n], i * 4);
    } else {
      for (let k = 0; k < 3; k++) { c.colors[i * 3 + k] = rgb[k] ? rgbToDc(rgb[k]!.read(view, o + rgb[k]!.off)) : 0; c.scales[i * 3 + k] = pointLog; }
      c.alphas[i] = opaque;
      c.rotations.set([0, 0, 0, 1], i * 4);
    }
  }
  return c;
}

/** The ".splat" web format: 32 bytes a splat (position, linear scale, RGBA, quaternion w-first in bytes) (pure). */
export function parseSplat(buf: ArrayBuffer): SplatCloud {
  if (buf.byteLength % 32) throw new Error("That .splat file isn't a whole number of splats.");
  const n = buf.byteLength / 32, f = new Float32Array(buf), u = new Uint8Array(buf), c = empty(n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      c.positions[i * 3 + k] = f[i * 8 + k];
      c.scales[i * 3 + k] = Math.log(Math.max(1e-7, f[i * 8 + 3 + k]));
      c.colors[i * 3 + k] = rgbToDc(u[i * 32 + 24 + k]);
    }
    c.alphas[i] = logit(u[i * 32 + 27] / 255);
    const q = [0, 1, 2, 3].map((k) => (u[i * 32 + 28 + k] - 128) / 128); // w, x, y, z
    const nn = Math.hypot(...q) || 1;
    c.rotations.set([q[1] / nn, q[2] / nn, q[3] / nn, q[0] / nn], i * 4);
  }
  return c;
}

/** Axis-aligned bounds and the centre (pure). */
export function bounds(c: SplatCloud): { min: [number, number, number]; max: [number, number, number]; centre: [number, number, number]; radius: number } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < c.count; i++) for (let k = 0; k < 3; k++) { const v = c.positions[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  const centre = [0, 1, 2].map((k) => (min[k] + max[k]) / 2) as [number, number, number];
  return { min, max, centre, radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 };
}

/**
 * Drops the floaters most captures have (splats far from the bulk, or nearly invisible), keeping at most
 * `maxCount` of the most visible (pure). Large captures run on phones too.
 */
export function tidy(c: SplatCloud, maxCount = 1_500_000, minOpacity = 0.02, spread = 3.5): SplatCloud {
  // A robust centre and size: the median and the median distance.
  const pick = (k: number) => { const a = new Float32Array(Math.min(c.count, 20_000)); const step = c.count / a.length; for (let i = 0; i < a.length; i++) a[i] = c.positions[Math.floor(i * step) * 3 + k]; a.sort(); return a[a.length >> 1]; };
  const m = [pick(0), pick(1), pick(2)];
  const dists = new Float32Array(Math.min(c.count, 20_000)); const step = c.count / dists.length;
  for (let i = 0; i < dists.length; i++) { const j = Math.floor(i * step) * 3; dists[i] = Math.hypot(c.positions[j] - m[0], c.positions[j + 1] - m[1], c.positions[j + 2] - m[2]); }
  dists.sort();
  const limit = (dists[Math.floor(dists.length * 0.9)] || Infinity) * spread;
  const keep: number[] = [];
  for (let i = 0; i < c.count; i++) {
    if (sigmoid(c.alphas[i]) < minOpacity) continue;
    if (Math.hypot(c.positions[i * 3] - m[0], c.positions[i * 3 + 1] - m[1], c.positions[i * 3 + 2] - m[2]) > limit) continue;
    keep.push(i);
  }
  if (keep.length > maxCount) keep.sort((a, b) => c.alphas[b] + c.scales[b * 3] + c.scales[b * 3 + 1] + c.scales[b * 3 + 2] - (c.alphas[a] + c.scales[a * 3] + c.scales[a * 3 + 1] + c.scales[a * 3 + 2])).length = maxCount;
  const out = empty(keep.length);
  keep.forEach((s, i) => {
    out.positions.set(c.positions.subarray(s * 3, s * 3 + 3), i * 3); out.scales.set(c.scales.subarray(s * 3, s * 3 + 3), i * 3);
    out.colors.set(c.colors.subarray(s * 3, s * 3 + 3), i * 3); out.rotations.set(c.rotations.subarray(s * 4, s * 4 + 4), i * 4); out.alphas[i] = c.alphas[s];
  });
  return out;
}

/** Moves the cloud so its centre (or the middle of its base, on an axis) is the origin (pure, in place). Returns the shift. */
export function recentre(c: SplatCloud, centre: [number, number, number]) {
  for (let i = 0; i < c.count; i++) for (let k = 0; k < 3; k++) c.positions[i * 3 + k] -= centre[k];
  return centre;
}

/**
 * SPZ (Niantic, open format): header, then positions as 24-bit fixed point, opacities, colours, log scales and
 * quaternions, each quantized to bytes, all gzipped: about a tenth the size of a PLY. Version 2, no
 * view-dependent colour (degree 0). Returns the uncompressed packed bytes; `encodeSpz` gzips them.
 */
export function packSpz(c: SplatCloud, antialiased = false): Uint8Array {
  const n = c.count;
  let maxAbs = 1e-6;
  for (let i = 0; i < n * 3; i++) maxAbs = Math.max(maxAbs, Math.abs(c.positions[i]));
  // As many fractional bits as fit the largest coordinate into 24 signed bits (12 = 0.25 mm, ±2 km).
  const fractionalBits = Math.max(0, Math.min(16, Math.floor(Math.log2(0x7fffff / maxAbs))));
  const out = new Uint8Array(16 + n * 9 + n + n * 3 + n * 3 + n * 3);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x5053474e, true); // "NGSP"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, n, true);
  out[12] = 0; // SH degree
  out[13] = fractionalBits;
  out[14] = antialiased ? 1 : 0;
  out[15] = 0;
  const u8 = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  let o = 16;
  const scale = 1 << fractionalBits;
  for (let i = 0; i < n * 3; i++) {
    const fixed = Math.max(-0x800000, Math.min(0x7fffff, Math.round(c.positions[i] * scale)));
    out[o++] = fixed & 0xff; out[o++] = (fixed >> 8) & 0xff; out[o++] = (fixed >> 16) & 0xff;
  }
  for (let i = 0; i < n; i++) out[o++] = u8(sigmoid(c.alphas[i]) * 255);
  for (let i = 0; i < n * 3; i++) out[o++] = u8(c.colors[i] * (0.15 * 255) + 0.5 * 255);
  for (let i = 0; i < n * 3; i++) out[o++] = u8((c.scales[i] + 10) * 16);
  for (let i = 0; i < n; i++) {
    let x = c.rotations[i * 4], y = c.rotations[i * 4 + 1], z = c.rotations[i * 4 + 2], w = c.rotations[i * 4 + 3];
    const len = Math.hypot(x, y, z, w) || 1;
    const s = w < 0 ? -1 / len : 1 / len;
    x *= s; y *= s; z *= s; w *= s;
    out[o++] = u8(x * 127.5 + 127.5); out[o++] = u8(y * 127.5 + 127.5); out[o++] = u8(z * 127.5 + 127.5);
  }
  return out;
}

/** gzip with the platform's own compressor (browsers and Node 18+). */
export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export const encodeSpz = async (c: SplatCloud, antialiased = false) => gzip(packSpz(c, antialiased));

/**
 * A glTF binary holding SPZ-compressed splats with the KHR_gaussian_splatting extension, the way Cesium
 * renders them (pure).
 */
export function splatGlb(spz: Uint8Array, count: number, b: { min: number[]; max: number[] }): Uint8Array {
  const pad = (n: number) => (n + 3) & ~3;
  const exts = ["KHR_gaussian_splatting", "KHR_gaussian_splatting_compression_spz_2"];
  const json = {
    asset: { version: "2.0", generator: "Terreno" },
    extensionsUsed: exts, extensionsRequired: exts,
    buffers: [{ byteLength: pad(spz.byteLength) }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: spz.byteLength }],
    accessors: [
      { count, componentType: 5126, type: "VEC3", min: b.min, max: b.max },
      { count, componentType: 5121, normalized: true, type: "VEC4" },
      { count, componentType: 5126, type: "VEC3" },
      { count, componentType: 5126, type: "VEC4" },
    ],
    meshes: [{ primitives: [{ mode: 0, attributes: { POSITION: 0, COLOR_0: 1, "KHR_gaussian_splatting:SCALE": 2, "KHR_gaussian_splatting:ROTATION": 3 },
      extensions: { KHR_gaussian_splatting: { kernel: "ellipse", colorSpace: "srgb_rec709_display", extensions: { KHR_gaussian_splatting_compression_spz_2: { bufferView: 0 } } } } }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const jsonBytes = new TextEncoder().encode(text), binLen = pad(spz.byteLength);
  const total = 12 + 8 + jsonBytes.length + 8 + binLen;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jsonBytes, 20);
  const binAt = 20 + jsonBytes.length;
  dv.setUint32(binAt, binLen, true); dv.setUint32(binAt + 4, 0x004e4942, true); out.set(spz, binAt + 8);
  return out;
}

/** A one-tile 3D Tiles tileset around a glTF, placed by a transform (column-major 4×4, local to Earth-fixed) (pure). */
export function splatTileset(contentUri: string, transform: number[], radius: number) {
  const exts = ["KHR_gaussian_splatting", "KHR_gaussian_splatting_compression_spz_2"];
  return {
    asset: { version: "1.1", generator: "Terreno" },
    extensionsUsed: ["3DTILES_content_gltf"], extensionsRequired: ["3DTILES_content_gltf"],
    extensions: { "3DTILES_content_gltf": { extensionsUsed: exts, extensionsRequired: exts } },
    geometricError: Math.max(1, radius),
    root: { transform, boundingVolume: { sphere: [0, 0, 0, Math.max(1, radius * 1.5)] }, geometricError: 0, refine: "ADD", content: { uri: contentUri } },
  };
}

/**
 * A demo capture in the 32-byte .splat layout (pure): a (2,3) torus knot drawn as a glowing tube over a soft
 * disc, so anyone can try captures on the globe without a file. Y is up, about 2 units across.
 */
export function demoSplat(n = 60_000): ArrayBuffer {
  const buf = new ArrayBuffer(n * 32), f = new Float32Array(buf), u = new Uint8Array(buf);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const knot = (t: number) => { const r = 0.55 + 0.25 * Math.cos(3 * t); return [r * Math.cos(2 * t), 0.9 + 0.25 * Math.sin(3 * t), r * Math.sin(2 * t)]; };
  const disc = Math.floor(n * 0.25);
  for (let i = 0; i < n; i++) {
    let p: number[], rgb: number[], s: number;
    if (i < disc) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 1.1;
      p = [r * Math.cos(a), rnd() * 0.01, r * Math.sin(a)];
      const k = 1 - r / 1.1;
      rgb = [40 + 60 * k, 44 + 70 * k, 60 + 110 * k];
      s = 0.012;
    } else {
      const t = rnd() * Math.PI * 2, c = knot(t), d = knot(t + 1e-3);
      // A point on a small circle around the curve.
      const tan = [d[0] - c[0], d[1] - c[1], d[2] - c[2]], tl = Math.hypot(...tan);
      const ax = Math.abs(tan[1] / tl) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const b1 = [tan[1] * ax[2] - tan[2] * ax[1], tan[2] * ax[0] - tan[0] * ax[2], tan[0] * ax[1] - tan[1] * ax[0]], bl = Math.hypot(...b1);
      const b2 = [(tan[1] * b1[2] - tan[2] * b1[1]) / (tl * bl), (tan[2] * b1[0] - tan[0] * b1[2]) / (tl * bl), (tan[0] * b1[1] - tan[1] * b1[0]) / (tl * bl)];
      const a = rnd() * Math.PI * 2, rr = 0.08 * Math.sqrt(rnd());
      p = c.map((v, k) => v + (Math.cos(a) * b1[k] / bl + Math.sin(a) * b2[k]) * rr);
      const h = t / (Math.PI * 2);
      rgb = [0, 1, 2].map((k) => 128 + 127 * Math.cos(2 * Math.PI * (h + k / 3)));
      s = 0.014;
    }
    f.set([p[0], p[1], p[2], s, s, s], i * 8);
    u.set([...rgb.map((v) => Math.round(Math.max(0, Math.min(255, v)))), i < disc ? 150 : 235, 255, 128, 128, 128], i * 32 + 24);
  }
  return buf;
}
