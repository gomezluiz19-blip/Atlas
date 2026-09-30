// Atlas service worker: the app keeps working with a weak or no connection.
// - Pages: network first, falling back to the cached copy.
// - Built files, Cesium and bundled data: served from cache, refreshed in the background.
// - Terrain tiles (open data): cached as you look, capped, so the shape of the
//   places you visit still shows offline. Satellite imagery is left to the
//   browser's own cache: its providers' terms limit storing tiles (see
//   docs/data-licensing.md); add the host here once a licence allows it.
// The build stamps VERSION (vite.config.ts), so each deploy starts a fresh app cache and clears the
// last one; the terrain tile cache is kept across deploys.
const VERSION = "atlas-dev";
const APP = `${VERSION}-app`, TILES = "atlas-tiles";
const TILE_HOSTS = /(^|\.)(s3\.amazonaws\.com)$/;
const MAX_TILES = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(["./", "./index.html"]).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== APP && k !== TILES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
    // A place's page (p/nile/) is kept as itself, not as the app's front page.
    const page = /\/p\/[^/]+\/?$/.test(url.pathname);
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(APP).then((c) => c.put(page ? req : "./index.html", copy));
      return res;
    }).catch(() => (page ? caches.match(req) : Promise.resolve(undefined)).then((r) => r || caches.match("./index.html")).then((r) => r || caches.match("./"))));
    return;
  }

  if (url.origin === self.location.origin) {
    // Built files carry a content hash in their name, so a cached copy is always right: cache first.
    // Everything else (bundled data, Cesium, styles) could have changed: fresh from the network when
    // it answers quickly, the cached copy when it doesn't or when offline.
    const hashed = /\/assets\/.+-[\w-]{8,}\.\w+$/.test(url.pathname);
    e.respondWith(caches.open(APP).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
      if (hashed && hit) return hit;
      if (!hit) return net;
      return Promise.race([net.catch(() => hit), new Promise((r) => setTimeout(() => r(hit), 2500))]);
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

// A watch's notification: open (or focus) Atlas on that watch.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "./";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if ("focus" in w) { await w.focus(); if ("navigate" in w) await w.navigate(url); return; }
    await self.clients.openWindow(url);
  })());
});
