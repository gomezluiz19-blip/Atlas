// Any other 3D, on the globe: 3D Tiles (photogrammetry meshes, LiDAR point clouds, BIM and digital twins,
// from a URL or a Cesium ion asset), and single glTF/GLB models (a design, a machine, a sculpture) placed
// where you are and turned and scaled like a capture. Point clouds get eye-dome lighting, the trick from
// scientific visualisation that shades points by the depth of their neighbours so a cloud of dots reads as
// solid surfaces without any normals.
import { Cartesian3, Cartographic, Cesium3DTileset, HeadingPitchRange, Ion, Math as CMath, Matrix3, Matrix4, Model, sampleTerrain, Transforms } from "cesium";
import type { App } from "../app";
import { config } from "../config";
import { wake } from "../globe/motion";
import type { Placement } from "./splat/globe";

export interface Placed { id: string; kind: "tiles" | "model"; name: string; remove(): void; fly(): void }

/** Which kind of 3D a link or file name is (pure). */
export function kindOf(nameOrUrl: string): "tiles" | "model" | "capture" | "ion" | null {
  const s = nameOrUrl.trim();
  if (/^\d{3,}$/.test(s)) return "ion";
  if (/tileset\.json(\?|$)/i.test(s) || /\/3dtiles\//i.test(s)) return "tiles";
  if (/\.(glb|gltf)(\?|$)/i.test(s)) return "model";
  if (/\.(ply|splat|spz)(\?|$)/i.test(s)) return "capture";
  return null;
}

export async function addTiles(app: App, source: string, name = "3D tiles"): Promise<Placed> {
  const viewer = app.globe.viewer;
  const options = {
    maximumScreenSpaceError: 8,
    // LiDAR and other point clouds: size by distance, and eye-dome lighting so surfaces read as solid.
    pointCloudShading: { attenuation: true, geometricErrorScale: 1, maximumAttenuation: 4, eyeDomeLighting: true, eyeDomeLightingStrength: 1.2, eyeDomeLightingRadius: 1.2 },
  };
  let tileset: Cesium3DTileset;
  if (/^\d+$/.test(source)) {
    if (!config.cesiumIonToken) throw new Error("Cesium ion assets need an ion access token in Terreno's settings (VITE_CESIUM_ION_TOKEN).");
    Ion.defaultAccessToken = config.cesiumIonToken;
    tileset = await Cesium3DTileset.fromIonAssetId(Number(source), options);
  } else tileset = await Cesium3DTileset.fromUrl(source, options);
  viewer.scene.primitives.add(tileset);
  const fly = () => { void viewer.flyTo(tileset, { duration: 1.6, offset: new HeadingPitchRange(CMath.toRadians(30), CMath.toRadians(-25), tileset.boundingSphere.radius * 2.4) }); };
  fly();
  wake(1000);
  return { id: `tiles-${Date.now()}`, kind: "tiles", name, fly, remove: () => { viewer.scene.primitives.remove(tileset); wake(300); } };
}

/** A glTF model from a URL or a dropped file, stood on the ground at a placement. */
export async function addModel(app: App, url: string, p: Placement, name = "Model"): Promise<Placed & { place(p: Placement): void }> {
  const viewer = app.globe.viewer, scene = viewer.scene;
  let ground = 0;
  try {
    const [c] = await Promise.race([sampleTerrain(scene.terrainProvider, 14, [Cartographic.fromDegrees(p.lon, p.lat)]), new Promise<Cartographic[]>((r) => setTimeout(() => r([new Cartographic()]), 3000))]);
    ground = (c.height ?? 0) * (scene.verticalExaggeration ?? 1);
  } catch { /* sea level */ }
  const matrix = (q: Placement) => {
    const enu = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(q.lon, q.lat, ground + q.height));
    const turn = Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(CMath.toRadians(-q.heading)));
    return Matrix4.multiply(Matrix4.multiply(enu, turn, new Matrix4()), Matrix4.fromUniformScale(q.scale), new Matrix4());
  };
  const model = await Model.fromGltfAsync({ url, modelMatrix: matrix(p), scene, minimumPixelSize: 24, upAxis: p.up === "z" ? 2 : 1 });
  scene.primitives.add(model);
  const fly = () => {
    const r = Math.max(10, (model.ready ? model.boundingSphere.radius : 20));
    void viewer.camera.flyToBoundingSphere({ center: Cartesian3.fromDegrees(p.lon, p.lat, ground + p.height + r * 0.3), radius: r } as never, { offset: new HeadingPitchRange(CMath.toRadians(p.heading + 30), CMath.toRadians(-20), r * 3), duration: 1.4 });
  };
  model.readyEvent.addEventListener(() => { fly(); wake(500); });
  return { id: `model-${Date.now()}`, kind: "model", name, fly, place: (q) => { model.modelMatrix = matrix(q); wake(300); }, remove: () => { scene.primitives.remove(model); wake(300); } };
}

