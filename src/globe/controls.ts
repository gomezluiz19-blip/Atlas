// Map controls in the corner: zoom in and out, and a compass that shows which
// way is north and turns the view back to north-up, straight down, when
// tapped. Double-click (or double-tap) zooms in on that spot. All moves are
// short animations, so the globe glides instead of jumping.
import { Cartesian2, Cartesian3, EasingFunction, Math as CesiumMath, ScreenSpaceEventType, type Viewer } from "cesium";
import { h } from "../ui/dom";

const plus = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const minus = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
const needle = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2.5 15.5 12h-7z" fill="#ff453a"/><path d="M12 21.5 8.5 12h7z" fill="currentColor" opacity=".55"/></svg>';

/** The point on the ground at a screen position (or the screen centre). */
function groundAt(viewer: Viewer, at?: Cartesian2): Cartesian3 | undefined {
  const c = viewer.canvas;
  const p = at ?? new Cartesian2(c.clientWidth / 2, c.clientHeight / 2);
  const ray = viewer.camera.getPickRay(p);
  return (ray && viewer.scene.globe.pick(ray, viewer.scene)) ?? viewer.camera.pickEllipsoid(p) ?? undefined;
}

/** Glides the camera towards (factor < 1) or away from (factor > 1) a ground point, keeping the view's angle. */
function glide(viewer: Viewer, target: Cartesian3, factor: number, seconds = 0.35) {
  const cam = viewer.camera;
  const offset = Cartesian3.subtract(cam.positionWC, target, new Cartesian3());
  const dist = Cartesian3.magnitude(offset);
  // Don't go underground or out beyond the whole-Earth view.
  const next = Math.min(40_000_000, Math.max(120, dist * factor));
  const destination = Cartesian3.add(target, Cartesian3.multiplyByScalar(offset, next / dist, new Cartesian3()), new Cartesian3());
  cam.cancelFlight();
  cam.flyTo({ destination, orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0 }, duration: seconds, easingFunction: EasingFunction.QUADRATIC_OUT });
}

export function createMapControls(viewer: Viewer): HTMLElement {
  const zoom = (factor: number) => { const t = groundAt(viewer); if (t) glide(viewer, t, factor); };
  const compassNeedle = h("span", { class: "compass-needle", html: needle });
  const compass = h("button", { class: "map-ctl compass", title: "North up", "aria-label": "Turn to north up", onclick: () => {
    const cam = viewer.camera, t = groundAt(viewer);
    if (!t) { cam.flyTo({ destination: cam.positionWC, orientation: { heading: 0, pitch: cam.pitch, roll: 0 }, duration: 0.5 }); return; }
    const dist = Cartesian3.distance(cam.positionWC, t);
    const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(t);
    cam.cancelFlight();
    cam.flyTo({ destination: Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + dist), orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 }, duration: 0.6, easingFunction: EasingFunction.QUADRATIC_IN_OUT });
  } }, compassNeedle);
  const el = h("div", { class: "map-controls" },
    compass,
    h("div", { class: "map-zoom" },
      h("button", { class: "map-ctl", title: "Zoom in", "aria-label": "Zoom in", html: plus, onclick: () => zoom(0.5) }),
      h("button", { class: "map-ctl", title: "Zoom out", "aria-label": "Zoom out", html: minus, onclick: () => zoom(2) })));

  // The needle turns with the view; the compass fades when already north-up and straight down.
  let last = NaN;
  viewer.scene.postRender.addEventListener(() => {
    const deg = Math.round(CesiumMath.toDegrees(viewer.camera.heading));
    const tilted = CesiumMath.toDegrees(viewer.camera.pitch) > -80;
    const key = deg * 2 + (tilted ? 1 : 0);
    if (key === last) return;
    last = key;
    compassNeedle.style.transform = `rotate(${-deg}deg)`;
    compass.classList.toggle("idle", (deg % 360 === 0 || Math.abs(deg % 360) < 1) && !tilted);
  });

  // Keyboard: + and - zoom (outside text boxes).
  addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))) return;
    if (e.key === "+" || e.key === "=") zoom(0.5);
    else if (e.key === "-" || e.key === "_") zoom(2);
  });

  // Double-click / double-tap zooms in on that spot (instead of Cesium's entity tracking).
  const handler = viewer.cesiumWidget.screenSpaceEventHandler;
  handler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  handler.setInputAction((e: { position: Cartesian2 }) => {
    const t = groundAt(viewer, e.position);
    if (t) glide(viewer, t, 0.45, 0.45);
  }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  return el;
}

/** A rough centre for the user's part of the world, from the device's time zone (no permission needed). */
export function homeRegion(): { lon: number; lat: number } {
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""; } catch { /* old browser */ }
  const exact: Record<string, [number, number]> = {
    "America/New_York": [-78, 39], "America/Toronto": [-79, 44], "America/Chicago": [-90, 38], "America/Denver": [-106, 40], "America/Phoenix": [-112, 34],
    "America/Los_Angeles": [-120, 37], "America/Vancouver": [-123, 49], "America/Anchorage": [-150, 62], "Pacific/Honolulu": [-157, 20],
    "America/Mexico_City": [-100, 21], "America/Bogota": [-74, 5], "America/Lima": [-76, -10], "America/Santiago": [-71, -33], "America/Sao_Paulo": [-48, -18],
    "America/Argentina/Buenos_Aires": [-62, -34], "Europe/London": [-2, 53], "Europe/Dublin": [-8, 53], "Europe/Lisbon": [-8, 40], "Europe/Madrid": [-4, 40],
    "Europe/Paris": [2, 47], "Europe/Berlin": [10, 51], "Europe/Rome": [12, 43], "Europe/Stockholm": [16, 60], "Europe/Moscow": [38, 55], "Europe/Istanbul": [32, 39],
    "Africa/Cairo": [30, 27], "Africa/Lagos": [8, 9], "Africa/Nairobi": [37, 0], "Africa/Johannesburg": [25, -29], "Asia/Dubai": [54, 24], "Asia/Kolkata": [79, 22],
    "Asia/Shanghai": [110, 33], "Asia/Hong_Kong": [114, 22], "Asia/Tokyo": [138, 36], "Asia/Seoul": [127, 36], "Asia/Singapore": [104, 1], "Asia/Jakarta": [110, -6],
    "Asia/Manila": [122, 12], "Australia/Sydney": [147, -32], "Australia/Melbourne": [145, -37], "Australia/Perth": [117, -30], "Pacific/Auckland": [174, -40],
  };
  const hit = exact[tz];
  if (hit) return { lon: hit[0], lat: hit[1] };
  const region: Record<string, [number, number]> = { America: [-85, 25], Europe: [12, 50], Asia: [95, 30], Africa: [20, 5], Australia: [135, -25], Pacific: [170, -15], Atlantic: [-30, 40], Indian: [70, -10] };
  const r = region[tz.split("/")[0]];
  return r ? { lon: r[0], lat: r[1] } : { lon: -40, lat: 25 };
}
