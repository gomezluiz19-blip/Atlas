// Atlas service worker: the app opens instantly on a return visit, keeps
// working with a weak or no connection, and moves to a new deploy seamlessly.
// - Pages: the navigation is fetched while the worker starts (navigation
//   preload), network first, falling back to the cached copy.
// - The app's own startup files are fetched at install (the build writes the
//   list into PRECACHE), so the second visit loads them from disk.
// - Built files carry a content hash, so a cached copy is always right: cache
//   first, and kept across deploys in their own cache, so a tab still open on
//   the last deploy can still load its screens after a new one goes out.
// - Other same-origin files (bundled data, Cesium): fresh when the network
//   answers quickly, the cached copy when it doesn't.
// - Weather (Open-Meteo, CC-BY): network first, the last reading when offline.
// - Terrain tiles (open data): cached as you look, capped, so the shape of the
//   places you visit still shows offline. Satellite imagery is left to the
//   browser's own cache: its providers' terms limit storing tiles (see
//   docs/data-licensing.md); add the host here once a licence allows it.
// The build stamps VERSION and PRECACHE (vite.config.ts).
const VERSION = "atlas-dev";
const PRECACHE = [];
const APP = `${VERSION}-app`, ASSETS = "atlas-assets", TILES = "atlas-tiles", API = "atlas-api";
const KEEP = [APP, ASSETS, TILES, API];
const TILE_HOSTS = /(^|\.)(s3\.amazonaws\.com)$/;
const API_HOSTS = /(^|\.)open-meteo\.com$/;
const MAX_TILES = 4000, MAX_ASSETS = 600, MAX_API = 300;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const app = await caches.open(APP);
    await app.addAll(["./", "./index.html"]).catch(() => {});
    // Startup files: one at a time is plenty (they're usually in the HTTP cache already).
    const assets = await caches.open(ASSETS);
    await Promise.allSettled(PRECACHE.map(async (u) => { if (!(await assets.match(u))) await assets.add(u); }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)));
    // Start fetching a page while this worker wakes up, rather than after.
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
const sometimes = (c, max) => (Math.random() < 0.02 ? trim(c, max) : undefined);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    // A place's page (p/nile/) is kept as itself, not as the app's front page.
    const page = /\/p\/[^/]+\/?$/.test(url.pathname);
    e.respondWith((async () => {
      try {
        const res = (await e.preloadResponse) || (await fetch(req));
        if (res.ok) { const copy = res.clone(); caches.open(APP).then((c) => c.put(page ? req : "./index.html", copy)); }
        return res;
      } catch {
        return (page && (await caches.match(req))) || (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    const hashed = /\/assets\/.+-[\w-]{8,}\.\w+$/.test(url.pathname);
    if (hashed) {
      e.respondWith(caches.open(ASSETS).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone()).then(() => sometimes(c, MAX_ASSETS));
        return res;
      }));
      return;
    }
    // Everything else (bundled data, Cesium, styles) could have changed: fresh from the network when
    // it answers quickly, the cached copy when it doesn't or when offline.
    e.respondWith(caches.open(APP).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
      if (!hit) return net;
      return Promise.race([net.catch(() => hit), new Promise((r) => setTimeout(() => r(hit), 2500))]);
    }));
    return;
  }

  if (API_HOSTS.test(url.hostname)) {
    e.respondWith(caches.open(API).then(async (c) => {
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone()).then(() => sometimes(c, MAX_API));
        return res;
      } catch (err) {
        const hit = await c.match(req);
        if (hit) return hit;
        throw err;
      }
    }));
    return;
  }

  if (TILE_HOSTS.test(url.hostname)) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone()).then(() => sometimes(c, MAX_TILES));
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
