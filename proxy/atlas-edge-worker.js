// Atlas's edge: a Cloudflare Worker between visitors and the free public
// services Atlas reads, and the keeper of service keys that mustn't ship in
// the web page. Deploy with Wrangler (docs/backend.md › The edge).
//
//   GET/POST /f/<encoded URL>   a cached passthrough to an allowed public service
//   GET      /k/<service>/<path> a keyed service; the Worker adds the key
//   WS       /ws/ais?bbox=w,s,e,n live ship positions, relayed from AISStream
//                                 (its key stays here: AISStream refuses browsers)
//
// Answers are cached at Cloudflare's edge (weather for 10 minutes, place names and
// maps for a week), so a crowd of visitors looks like one polite client. Only the
// site's own origins may call it, and each visitor is rate-limited.

const ALLOWED = /^https:\/\/(nominatim\.openstreetmap\.org|photon\.komoot\.io|api\.open-meteo\.com|archive-api\.open-meteo\.com|marine-api\.open-meteo\.com|climate-api\.open-meteo\.com|air-quality-api\.open-meteo\.com|query\.wikidata\.org|overpass-api\.de|api\.inaturalist\.org|macrostrat\.org|api\.worldbank\.org|restcountries\.com|services\.swpc\.noaa\.gov|earthquake\.usgs\.gov|[a-z]+\.wikipedia\.org|api\.gdeltproject\.org|eonet\.gsfc\.nasa\.gov|api\.adsb\.lol|api\.airplanes\.live|opensky-network\.org|meri\.digitraffic\.fi)\//;

/** How long answers keep, by service (seconds). */
function ttl(url) {
  if (/open-meteo\.com\/v1\/(forecast|marine|air-quality)/.test(url)) return 600;
  if (/swpc\.noaa\.gov|earthquake\.usgs\.gov/.test(url)) return 300;
  if (/inaturalist\.org/.test(url)) return 3600;
  // Live traffic: a few seconds, so a crowd shares one poll without seeing stale positions.
  if (/adsb\.lol|airplanes\.live|opensky-network\.org/.test(url)) return 5;
  if (/digitraffic\.fi/.test(url)) return 20;
  if (/gdeltproject\.org|eonet\.gsfc|rest_v1\/feed/.test(url)) return 900;
  return 7 * 86400;
}

const KEYED = {
  ticketmaster: { base: "https://app.ticketmaster.com", add: (u, env) => u.searchParams.set("apikey", env.TICKETMASTER_KEY) },
  seatgeek: { base: "https://api.seatgeek.com", add: (u, env) => u.searchParams.set("client_id", env.SEATGEEK_CLIENT_ID) },
  eventbrite: { base: "https://www.eventbriteapi.com", headers: (env) => ({ Authorization: `Bearer ${env.EVENTBRITE_TOKEN}` }) },
};

// A small per-visitor limit (per Worker instance; use Cloudflare's rate-limiting rules for more).
const hits = new Map();
function limited(ip, perMinute) {
  const now = Date.now(), w = hits.get(ip) ?? [];
  const recent = w.filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > perMinute;
}

function cors(origin, env) {
  const ok = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const allow = ok.includes(origin) ? origin : ok[0] ?? "";
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Accept-Language", Vary: "Origin" };
}

async function sha(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("Origin") ?? "";
    const head = cors(origin, env);
    if (req.method === "OPTIONS") return new Response(null, { headers: head });
    const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim());
    if (origin && !allowed.includes(origin)) return new Response("Not allowed", { status: 403, headers: head });
    const ip = req.headers.get("CF-Connecting-IP") ?? "?";
    if (limited(ip, Number(env.PER_MINUTE ?? 240))) return new Response("Too many requests", { status: 429, headers: { ...head, "Retry-After": "20" } });

    const url = new URL(req.url);
    if (url.pathname === "/ws/ais") return aisRelay(req, env, url);
    let target, init = { method: req.method, headers: { "User-Agent": env.USER_AGENT ?? "Atlas (https://github.com/)", Accept: "application/json" } }, maxAge;

    if (url.pathname.startsWith("/f/")) {
      target = decodeURIComponent(url.pathname.slice(3)) + url.search;
      if (!ALLOWED.test(target)) return new Response("Not an allowed service", { status: 400, headers: head });
      maxAge = ttl(target);
      const lang = req.headers.get("Accept-Language");
      if (lang) init.headers["Accept-Language"] = lang;
    } else if (url.pathname.startsWith("/k/")) {
      const [, , service, ...rest] = url.pathname.split("/");
      const k = KEYED[service];
      if (!k) return new Response("Unknown service", { status: 404, headers: head });
      const u = new URL(`${k.base}/${rest.join("/")}${url.search}`);
      k.add?.(u, env);
      Object.assign(init.headers, k.headers?.(env) ?? {});
      target = u.toString();
      maxAge = 900;
    } else {
      return new Response("Atlas edge", { headers: head });
    }

    // POST bodies (Overpass queries) are part of the cache key.
    const body = req.method === "POST" ? await req.text() : undefined;
    if (body !== undefined) { init.body = body; init.headers["Content-Type"] = req.headers.get("Content-Type") ?? "application/x-www-form-urlencoded"; }
    const key = new Request(`https://atlas-edge.cache/${await sha(`${target}|${body ?? ""}|${init.headers["Accept-Language"] ?? ""}`)}`);
    const cache = caches.default;
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...head, "X-Atlas-Cache": "hit" } });

    const res = await fetch(target, init);
    const out = new Response(res.body, { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json", "Cache-Control": `public, max-age=${maxAge}` } });
    if (res.ok) ctx.waitUntil(cache.put(key, out.clone()));
    return new Response(out.body, { status: out.status, headers: { ...Object.fromEntries(out.headers), ...head, "X-Atlas-Cache": "miss" } });
  },
};

/** Relays AISStream's live positions for a box to one visitor (a few fields, no key). */
async function aisRelay(req, env, url) {
  if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
  if (!env.AISSTREAM_KEY) return new Response("No AISStream key", { status: 503 });
  const [w, s, e, n] = (url.searchParams.get("bbox") ?? "").split(",").map(Number);
  if (![w, s, e, n].every(Number.isFinite)) return new Response("bbox=w,s,e,n", { status: 400 });
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  const up = await fetch("https://stream.aisstream.io/v0/stream", { headers: { Upgrade: "websocket" } });
  const ws = up.webSocket;
  if (!ws) { server.close(1011, "AISStream unavailable"); return new Response(null, { status: 101, webSocket: client }); }
  ws.accept();
  ws.send(JSON.stringify({ APIKey: env.AISSTREAM_KEY, BoundingBoxes: [[[s, w], [n, e]]], FilterMessageTypes: ["PositionReport", "ShipStaticData"] }));
  ws.addEventListener("message", (m) => { try { server.send(typeof m.data === "string" ? m.data : new TextDecoder().decode(m.data)); } catch { /* visitor gone */ } });
  ws.addEventListener("close", () => { try { server.close(1000, "done"); } catch { /* already closed */ } });
  server.addEventListener("close", () => { try { ws.close(1000, "done"); } catch { /* already closed */ } });
  return new Response(null, { status: 101, webSocket: client });
}
