// The card follows the map. After you move the map yourself (drag, scroll, pinch, the zoom buttons), if the
// place you chose has left the part of the map you can see (or you've pulled right out to the whole planet),
// the card lets go of it and shows what's in view instead, with "Back to …" one tap away. Terreno's own camera
// moves (arriving somewhere, time travel, framing an answer) never do this, nor do moves while a lens or a
// drawing tool is working on the place.
import { Cartesian3, SceneTransforms } from "cesium";
import type { App } from "../app";
import { flyToPlace, freeArea } from "../ui/search";

/** `busy`: something is working on the place right now (a lens is open), so the card holds on to it. */
export function cardFollowsMap(app: App, busy: () => boolean, openPlace: (slug: string) => Promise<void>) {
  const globe = app.globe, canvas = globe.viewer.scene.canvas;
  let byHand = false;
  const mark = () => { byHand = true; };
  for (const ev of ["pointerdown", "wheel", "touchstart"]) canvas.addEventListener(ev, mark, { passive: true });
  document.addEventListener("click", (e) => { if ((e.target as Element | null)?.closest?.(".map-zoom, .map-ctl")) mark(); }, true);
  const inView = (p: { lon: number; lat: number; height: number }) => {
    const scene = globe.viewer.scene, pos = Cartesian3.fromDegrees(p.lon, p.lat, 0);
    // Behind the globe?
    const cam = scene.camera.positionWC, n = Cartesian3.normalize(pos, new Cartesian3());
    if (Cartesian3.dot(Cartesian3.subtract(cam, pos, new Cartesian3()), n) < 0) return false;
    const w = SceneTransforms.worldToWindowCoordinates(scene, pos);
    if (!w) return false;
    const pad = freeArea(canvas), W = canvas.clientWidth, H = canvas.clientHeight, m = 12;
    return w.x >= pad.left - m && w.x <= W - pad.right + m && w.y >= pad.top - m && w.y <= H - pad.bottom + m;
  };
  globe.viewer.camera.moveEnd.addEventListener(() => {
    if (!byHand) return;
    byHand = false;
    const p = app.place;
    if (!p || busy() || app.interacting) return;
    const far = globe.viewer.camera.positionCartographic.height > 6_000_000;
    if (!inView(p) || far) app.release();
  });
  // "Back to …": fly back and open it again, as it was.
  app.onReturn = (p) => {
    const slug = p.slug;
    if (slug && !slug.startsWith("@")) { void openPlace(slug); return; }
    void flyToPlace(globe, { name: p.name?.title ?? "", lon: p.lon, lat: p.lat, radius: 1500 });
    app.select({ lon: p.lon, lat: p.lat, height: p.height }, p.name, p.feature);
  };
}
