// A geologic cross-section shown in 3D: a vertical "curtain" hung beneath the
// section line, painted with the rock layers, seen through see-through ground.
import { BoundingSphere, Cartesian3, Cartographic, Color, HeadingPitchRange, ImageMaterialProperty, Rectangle, type Entity, type Viewer } from "cesium";
import { horizonElevation, layerIndexAt, type StackLayer, type Structure } from "../analysis/geosection";
import { lithPattern, patternFor } from "../ui/lithology";

const TEX_W = 1024, TEX_H = 512;

export class Curtain {
  private wall: Entity | null = null;
  private saved: { collision: boolean } | null = null;

  constructor(private viewer: Viewer) {}

  get visible() {
    return this.wall !== null;
  }

  show(
    points: [number, number][],
    distance: ArrayLike<number>,
    elevation: ArrayLike<number>,
    stack: StackLayer[],
    structure: Structure,
    exaggeration: number,
    highlight: number | null,
  ) {
    this.clear(false);
    const n = points.length;
    let zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < n; i++) { zmin = Math.min(zmin, elevation[i]); zmax = Math.max(zmax, elevation[i]); }
    const bottom = zmin - Math.max(400, (zmax - zmin) * 0.8);
    const step = Math.max(1, Math.floor(n / 150));
    const idx: number[] = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);

    const texture = paint(distance, elevation, stack, structure, bottom, highlight);
    this.wall = this.viewer.entities.add({
      wall: {
        positions: Cartesian3.fromDegreesArray(idx.flatMap((i) => points[i])),
        maximumHeights: idx.map((i) => elevation[i] * exaggeration),
        minimumHeights: idx.map(() => bottom * exaggeration),
        material: new ImageMaterialProperty({ image: texture, transparent: false }),
      },
    });

    // Make the ground around the section see-through so the curtain shows.
    const { scene } = this.viewer;
    const carto = points.map(([lon, lat]) => Cartographic.fromDegrees(lon, lat));
    const rect = Rectangle.fromCartographicArray(carto);
    const pad = Math.max(rect.width, rect.height) * 0.25 + 0.0005;
    scene.globe.translucency.enabled = true;
    scene.globe.translucency.frontFaceAlpha = 0.45;
    scene.globe.undergroundColor = Color.fromCssColorString("#3a2e24");
    scene.globe.translucency.rectangle = new Rectangle(rect.west - pad, rect.south - pad, rect.east + pad, rect.north + pad);
    this.saved ??= { collision: scene.screenSpaceCameraController.enableCollisionDetection };
    scene.screenSpaceCameraController.enableCollisionDetection = false;
  }

  /** Moves the camera to look at the curtain face-on, slightly from above. */
  frame(points: [number, number][], distance: ArrayLike<number>, elevation: ArrayLike<number>, exaggeration: number) {
    const n = points.length;
    const [lon1, lat1] = points[0], [lon2, lat2] = points[n - 1];
    const toRad = Math.PI / 180;
    const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
    const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) - Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
    const bearing = Math.atan2(y, x);
    const mid = points[n >> 1];
    const L = distance[n - 1];
    const centre = Cartesian3.fromDegrees(mid[0], mid[1], elevation[n >> 1] * exaggeration);
    this.viewer.camera.flyToBoundingSphere(new BoundingSphere(centre, L / 2), {
      offset: new HeadingPitchRange(bearing + Math.PI / 2, -0.3, L * 1.25),
      duration: 2,
    });
  }

  clear(restore = true) {
    if (this.wall) this.viewer.entities.remove(this.wall);
    this.wall = null;
    if (restore && this.saved) {
      const { scene } = this.viewer;
      scene.globe.translucency.enabled = false;
      scene.globe.undergroundColor = Color.BLACK;
      scene.screenSpaceCameraController.enableCollisionDetection = this.saved.collision;
      this.saved = null;
    }
  }
}

/** Texture for the wall: each column runs from `bottom` (last row) up to the ground (first row). */
function paint(
  distance: ArrayLike<number>,
  elevation: ArrayLike<number>,
  stack: StackLayer[],
  s: Structure,
  bottom: number,
  highlight: number | null,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;
  const n = distance.length, L = distance[n - 1];
  const colors = stack.map((l) => l.unit.color);
  // Paint column by column: find which layer each texel falls in.
  const img = ctx.createImageData(TEX_W, TEX_H);
  const rgb = colors.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  for (let px = 0; px < TEX_W; px++) {
    const x = (px / (TEX_W - 1)) * L;
    const k = Math.min(n - 1, Math.round((x / L) * (n - 1)));
    const top = elevation[k];
    for (let py = 0; py < TEX_H; py++) {
      const e = top - (py / (TEX_H - 1)) * (top - bottom);
      const i = layerIndexAt(stack, s, x, e);
      const o = (py * TEX_W + px) * 4;
      let c = i >= 0 && i < stack.length ? rgb[i] : [141, 138, 134];
      if (i < 0) c = [200, 190, 170];
      const dim = highlight !== null && i !== highlight ? 0.35 : 1;
      img.data[o] = c[0] * dim + 20 * (1 - dim);
      img.data[o + 1] = c[1] * dim + 24 * (1 - dim);
      img.data[o + 2] = c[2] * dim + 32 * (1 - dim);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Lithology patterns on top, per layer, using the same mapping.
  stack.forEach((l, i) => {
    const pat = lithPattern(ctx, patternFor(l.unit.lith), 1.5);
    if (!pat) return;
    ctx.save();
    ctx.beginPath();
    for (let px = 0; px <= TEX_W; px += 8) {
      const x = (Math.min(px, TEX_W - 1) / (TEX_W - 1)) * L;
      const k = Math.min(n - 1, Math.round((x / L) * (n - 1)));
      const top = elevation[k];
      const toRow = (e: number) => ((top - e) / (top - bottom)) * (TEX_H - 1);
      const r0 = Math.max(0, toRow(horizonElevation(s, l.depthTop, x)));
      const r1 = Math.min(TEX_H, toRow(horizonElevation(s, l.depthBottom, x)));
      if (r1 > r0) ctx.rect(px, r0, 8, r1 - r0);
    }
    ctx.clip();
    ctx.globalAlpha = highlight !== null && i !== highlight ? 0.3 : 1;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    ctx.restore();
  });
  return canvas;
}
