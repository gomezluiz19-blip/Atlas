// Atlas AI proxy: a Cloudflare Worker that forwards the task robot's requests
// to Anthropic's Messages API with your key, so visitors don't need their own.
// It only accepts calls from your site's origins, only allows the models Atlas
// uses, caps the response length, and rate-limits each visitor.
//
// Deploy (see docs/ai-proxy.md):
//   npx wrangler deploy proxy/atlas-ai-worker.js --name atlas-ai
//   npx wrangler secret put ANTHROPIC_API_KEY
//   Set ALLOWED_ORIGINS, e.g. "https://you.github.io,http://localhost:5173"

const MODELS = new Set(["claude-sonnet-5", "claude-haiku-4-5-20251001", "claude-opus-5-5"]);
const MAX_TOKENS = 1024;
const PER_MINUTE = 12;
const hits = new Map(); // best effort, per Worker instance

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": ok ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, anthropic-version",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: cors });
    if (!ok) return json({ error: { message: "This site isn't allowed to use this proxy." } }, 403, cors);
    if (request.method !== "POST") return json({ error: { message: "POST only." } }, 405, cors);

    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
    if (recent.length >= PER_MINUTE) return json({ error: { message: "Slow down a little: try again in a minute." } }, 429, cors);
    recent.push(now);
    hits.set(ip, recent);

    let body;
    try { body = await request.json(); } catch { return json({ error: { message: "Bad request." } }, 400, cors); }
    if (!MODELS.has(body.model)) body.model = "claude-sonnet-5";
    body.max_tokens = Math.min(Number(body.max_tokens) || MAX_TOKENS, MAX_TOKENS);
    delete body.stream;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": env.ANTHROPIC_API_KEY },
      body: JSON.stringify(body),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { ...cors, "content-type": "application/json" } });
  },
};

const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, "content-type": "application/json" } });
