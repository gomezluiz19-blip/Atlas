// Getting ahead of the visitor. Once the globe has settled and the browser is
// idle, fetch the screens people most often open next (a landmark's intro, the
// World Heritage List, answers), so the first tap on them is instant. Skipped
// on data saver, slow connections and light devices (globe/quality.ts).
// And deploys are seamless: a tab open across a deploy checks for the new
// version when it comes back to the front, and if a screen from the old
// deploy can no longer be fetched, the page quietly reloads onto the new one.
import type { Globe } from "../globe/viewer";
import { quality } from "../globe/motion";

type Idle = (cb: () => void, o?: { timeout: number }) => number;
const idle: Idle = (cb, o) => ((globalThis as { requestIdleCallback?: Idle }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200) as unknown as number))(cb, o);

/** Fetches `loads` one at a time in idle moments, after the globe's tiles are in. */
export function warmUp(globe: Globe, loads: (() => Promise<unknown>)[]) {
  if (!quality().prefetch) return;
  const scene = globe.viewer.scene;
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    off();
    const next = (i: number) => { if (i < loads.length && quality().prefetch) idle(() => void loads[i]().catch(() => {}).finally(() => next(i + 1)), { timeout: 4000 }); };
    // A beat after the tiles land, so the warm-up never competes with them.
    setTimeout(() => next(0), 1500);
  };
  const off = scene.globe.tileLoadProgressEvent.addEventListener((n: number) => { if (n === 0) go(); });
  setTimeout(go, 12_000);
}

/** Registers the service worker and keeps the tab on the newest deploy. */
export function seamlessDeploys() {
  // A screen whose file is gone (an old tab after a deploy): reload once onto the new version.
  addEventListener("vite:preloadError", (e) => {
    try {
      if (sessionStorage.getItem("atlas.reloaded") === "1") return;
      sessionStorage.setItem("atlas.reloaded", "1");
    } catch { /* private mode */ }
    e.preventDefault();
    location.reload();
  });
  setTimeout(() => { try { sessionStorage.removeItem("atlas.reloaded"); } catch { /* private mode */ } }, 30_000);
  if (!("serviceWorker" in navigator)) return;
  addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").then((reg) => {
      // Back to the tab after a while: look for a new deploy (the browser only checks on navigation).
      let last = Date.now();
      document.addEventListener("visibilitychange", () => {
        if (document.hidden || Date.now() - last < 10 * 60_000) return;
        last = Date.now();
        void reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
}
