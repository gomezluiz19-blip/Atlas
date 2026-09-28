// Where the camera is looking: centre, radius and an approximate web-map zoom.
import { Cartesian2, Cartographic, Math as CesiumMath, type Viewer } from "cesium";

export interface ViewInfo {
  lon: number;
  lat: number;
  /** Rough radius of what's on screen, km. */
  radiusKm: number;
  zoom: number;
  bbox: [number, number, number, number];
  height: number;
}

export function currentView(viewer: Viewer): ViewInfo {
  const { scene, camera } = viewer;
  const canvas = scene.canvas;
  const centre = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
  const ray = camera.getPickRay(centre);
  const hit = ray ? scene.globe.pick(ray, scene) : undefined;
  const cam = camera.positionCartographic;
  let lon = CesiumMath.toDegrees(cam.longitude), lat = CesiumMath.toDegrees(cam.latitude);
  let dist = cam.height;
  if (hit) {
    const c = Cartographic.fromCartesian(hit);
    lon = CesiumMath.toDegrees(c.longitude);
    lat = CesiumMath.toDegrees(c.latitude);
    dist = Math.max(cam.height, CesiumMathDistance(camera.positionWC, hit));
  }
  // Visible half-width at the look-at point for a ~60° field of view.
  const radiusKm = Math.min(6000, (dist * 0.7) / 1000);
  const dLat = radiusKm / 111;
  const dLon = Math.min(180, radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))));
  const zoom = Math.max(0, Math.log2(40_075 / Math.max(0.05, radiusKm * 2)) + 1);
  return { lon, lat, radiusKm, zoom, bbox: [lon - dLon, Math.max(-90, lat - dLat), lon + dLon, Math.min(90, lat + dLat)], height: cam.height };
}

function CesiumMathDistance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
