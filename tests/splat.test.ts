import { describe, expect, it } from "vitest";
import { bounds, encodeSpz, parsePly, parseSplat, sigmoid, SH_C0, sniff, splatGlb, splatTileset, tidy, type SplatCloud } from "../src/render/splat/format";

function cloud(n: number): SplatCloud {
  const c: SplatCloud = { count: n, positions: new Float32Array(n * 3), scales: new Float32Array(n * 3), rotations: new Float32Array(n * 4), alphas: new Float32Array(n), colors: new Float32Array(n * 3) };
  for (let i = 0; i < n; i++) {
    c.positions.set([Math.cos(i) * 3, Math.sin(i) * 2, i * 0.01], i * 3);
    c.scales.set([Math.log(0.05), Math.log(0.02), Math.log(0.1)], i * 3);
    const a = i * 0.1, q = [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
    c.rotations.set(q, i * 4);
    c.alphas[i] = 2 - (i % 5);
    c.colors.set([(0.8 - 0.5) / SH_C0, (0.2 - 0.5) / SH_C0, (0.5 - 0.5) / SH_C0], i * 3);
  }
  return c;
}

describe("Gaussian splats", () => {
  it("encodes SPZ that the decoder Cesium uses reads back faithfully", async () => {
    const c = cloud(200);
    const spz = await encodeSpz(c);
    expect(sniff(spz)).toBe("spz");
    // The same WebAssembly decoder Cesium uses. Its build skips a Node-only branch when told it's in a renderer.
    const proc = process as unknown as { type?: string };
    const before = proc.type;
    proc.type = "renderer";
    const { loadSpz } = await import("@spz-loader/core");
    const g = await loadSpz(spz, { unpackOptions: { coordinateSystem: "UNSPECIFIED" } }).finally(() => { proc.type = before; });
    expect(g.numPoints).toBe(200);
    for (const i of [0, 57, 199]) {
      for (let k = 0; k < 3; k++) expect(g.positions[i * 3 + k]).toBeCloseTo(c.positions[i * 3 + k], 3);
      expect(g.alphas[i]).toBeCloseTo(sigmoid(c.alphas[i]), 1);
      // Colours come back as display values (0–1), as Cesium uses them.
      expect(g.colors[i * 3]).toBeCloseTo(0.8, 1);
      expect(g.colors[i * 3 + 1]).toBeCloseTo(0.2, 1);
      // Scales come back linear.
      expect(g.scales[i * 3]).toBeCloseTo(0.05, 2);
      // Quaternions come back x, y, z, w (same rotation, up to sign).
      const q = Array.from(g.rotations.slice(i * 4, i * 4 + 4)), e = Array.from(c.rotations.slice(i * 4, i * 4 + 4));
      const dot = Math.abs(q.reduce((s, v, k) => s + v * e[k], 0));
      expect(dot).toBeGreaterThan(0.99);
    }
  });

  it("reads a 3DGS PLY and a plain coloured point cloud", () => {
    const ply = (props: string[], rows: number[][], types: string[]) => {
      const head = `ply\nformat binary_little_endian 1.0\nelement vertex ${rows.length}\n${props.map((p, i) => `property ${types[i]} ${p}`).join("\n")}\nend_header\n`;
      const sizes = types.map((t) => (t === "uchar" ? 1 : 4));
      const stride = sizes.reduce((a, b) => a + b, 0);
      const h = new TextEncoder().encode(head), buf = new ArrayBuffer(h.length + rows.length * stride), dv = new DataView(buf);
      new Uint8Array(buf).set(h);
      rows.forEach((r, i) => { let o = h.length + i * stride; r.forEach((v, k) => { if (types[k] === "uchar") dv.setUint8(o, v); else dv.setFloat32(o, v, true); o += sizes[k]; }); });
      return buf;
    };
    const gp = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3", "f_rest_0"];
    const g = parsePly(ply(gp, [[1, 2, 3, 0.5, 0, -0.5, 1.5, -3, -3.5, -4, 1, 0, 0, 0, 9]], gp.map(() => "float")));
    expect(Array.from(g.positions)).toEqual([1, 2, 3]);
    expect(Array.from(g.rotations)).toEqual([0, 0, 0, 1]);
    expect(g.alphas[0]).toBeCloseTo(1.5);
    expect(g.scales[2]).toBeCloseTo(-4);
    const pc = parsePly(ply(["x", "y", "z", "red", "green", "blue"], [[0, 0, 0, 255, 0, 128]], ["float", "float", "float", "uchar", "uchar", "uchar"]));
    expect(0.5 + SH_C0 * pc.colors[0]).toBeCloseTo(1, 2);
    expect(sigmoid(pc.alphas[0])).toBeGreaterThan(0.9);
    expect(sniff(new Uint8Array(ply(["x", "y", "z"], [[0, 0, 0]], ["float", "float", "float"])))).toBe("ply");
  });

  it("reads the .splat web format", () => {
    const buf = new ArrayBuffer(32), f = new Float32Array(buf), u = new Uint8Array(buf);
    f.set([1, 2, 3, 0.1, 0.2, 0.3]);
    u.set([255, 0, 0, 128, 255, 128, 128, 128], 24); // red, half opacity, identity rotation (w first)
    const c = parseSplat(buf);
    expect(Array.from(c.positions)).toEqual([1, 2, 3]);
    expect(Math.exp(c.scales[1])).toBeCloseTo(0.2, 5);
    expect(sigmoid(c.alphas[0])).toBeCloseTo(128 / 255, 3);
    expect(c.rotations[3]).toBeCloseTo(1, 2);
    expect(sniff(new Uint8Array(buf), "room.splat")).toBe("splat");
  });

  it("drops floaters and faint splats, and packs a glTF and a tileset Cesium accepts", async () => {
    const c = cloud(1000);
    c.positions.set([5000, 5000, 5000], 0);
    const t = tidy(c);
    expect(t.count).toBeLessThan(1000);
    expect(bounds(t).radius).toBeLessThan(100);
    const spz = await encodeSpz(t);
    const glb = splatGlb(spz, t.count, bounds(t));
    const dv = new DataView(glb.buffer);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))));
    expect(json.meshes[0].primitives[0].extensions.KHR_gaussian_splatting.extensions.KHR_gaussian_splatting_compression_spz_2.bufferView).toBe(0);
    expect(json.accessors[0].count).toBe(t.count);
    const ts = splatTileset("blob:x", Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)), 10);
    expect(ts.extensions["3DTILES_content_gltf"].extensionsRequired).toContain("KHR_gaussian_splatting_compression_spz_2");
  });
});
