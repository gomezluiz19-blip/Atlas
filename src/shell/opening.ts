// The opening. From black, the titles (first visit) or just the name, then the Earth in real sunlight on the
// viewer's side of the planet; then, like a maps app, the map comes down over where you are (your location if
// the browser already allows it, else your saved home). A link to a view or a place sets its own view instead.
import { Cartesian3, Math as CesiumMath } from "cesium";
import type { App } from "../app";
import type { parseHash } from "../data/locationParse";
import { playIntro } from "../delight/intro";
import { startTour, tourDone } from "../delight/tour";
import { homeRegion } from "../globe/controls";
import { homeOrFirst } from "../myplaces/saved";
import { flyToPlace } from "../ui/search";

export function openingView(app: App, o: {
  shared: ReturnType<typeof parseHash>;
  /** Opened by a link to a place's page, or to a followed plane or ship. */
  pageLinked: boolean;
  /** Opened by a link that brings its own screen (a TV): no tour. */
  quiet: boolean;
  /** Opens the linked place's page. */
  openLinked(): void;
}) {
  const { shared, pageLinked } = o, camera = app.globe.viewer.camera;
  const saved = homeOrFirst();
  if (shared.camera) {
    const c = shared.camera;
    camera.setView({
      destination: Cartesian3.fromDegrees(c.lon, c.lat, Math.max(50, c.height)),
      orientation: { heading: CesiumMath.toRadians(c.heading), pitch: CesiumMath.toRadians(c.pitch), roll: 0 },
    });
  } else {
    // On the user's own side of the planet (from the time zone).
    const home = homeRegion();
    camera.setView({ destination: Cartesian3.fromDegrees(home.lon - 25, home.lat * 0.6, 22_000_000) });
  }

  let seen = false;
  try { seen = localStorage.getItem("atlas.intro") === "1"; } catch { /* private mode */ }
  const home = !shared.camera && !pageLinked && !saved ? homeRegion() : null;
  void playIntro(app, { home, full: !seen && !!home }).then(() => {
    try { localStorage.setItem("atlas.intro", "1"); } catch { /* private mode */ }
    // The tour, once: after the first opening (not when arriving by a link to a place or view).
    if (home && !tourDone() && !o.quiet) setTimeout(() => startTour(app), 1200);
  });

  if (pageLinked) o.openLinked();
  // Terreno opens on People: you, your people and where they are. A link to a view or a place opens that instead.
  if (shared.theme) app.setTheme(shared.theme);
  else if (!pageLinked && !shared.place) app.setTheme("people");
  if (shared.place) { app.select({ lon: shared.place.lon, lat: shared.place.lat, height: 0 }); return; }
  if (shared.camera || pageLinked) return;

  // Over where you are: your location if the browser already allows it, else your saved place; with neither,
  // the Earth stays on your side of the planet and the locate button is there.
  const local = (lon: number, lat: number, name: string) => void flyToPlace(app.globe, { name, lon, lat, radius: 6000 });
  setTimeout(() => void (async () => {
    let granted = false;
    try { granted = (await navigator.permissions?.query({ name: "geolocation" as PermissionName }))?.state === "granted"; } catch { /* no permissions API */ }
    if (granted) navigator.geolocation.getCurrentPosition((p) => local(p.coords.longitude, p.coords.latitude, "You"), () => { if (saved) local(saved.lon, saved.lat, saved.name); }, { timeout: 6000, maximumAge: 300_000 });
    else if (saved) local(saved.lon, saved.lat, saved.name);
  })(), 1600);
}
