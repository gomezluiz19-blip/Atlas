// Atlas service worker: the app keeps working with a weak or no connection.
// - Pages: network first, falling back to the cached copy.
// - Built files, Cesium and bundled data: served from cache, refreshed in the background.
// - Terrain tiles (open data): cached as you look, capped, so the shape of the
//   places you visit still shows offline. Satellite imagery is left to the
//   browser's own cache: its providers' terms limit storing tiles (see
//   docs/data-licensing.md); add the host here once a licence allows it.
const VERSION = "atlas-v1";
const APP = `${VERSION}-app`, TILES = `${VERSION}-tiles`;
const TILE_HOSTS = /(^|\.)(s3\.amazonaws\.com)$/;
const MAX_TILES = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(["./", "./index.html"]).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(APP).then((c) => c.put("./index.html", copy));
      return res;
    }).catch(() => caches.match("./index.html").then((r) => r || caches.match("./"))));
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(APP).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  if (TILE_HOSTS.test(url.hostname)) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      try {
        const res = await fetch(req);
        if (res.ok) { c.put(req, res.clone()).then(() => (Math.random() < 0.02 ? trim(c, MAX_TILES) : undefined)); }
        return res;
      } catch (err) {
        const hit = await c.match(req);
        if (hit) return hit;
        throw err;
      }
    }));
  }
});
