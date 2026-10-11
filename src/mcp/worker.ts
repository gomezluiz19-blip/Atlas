// Terreno's MCP server: the tools in src/mcp/tools.ts, served over MCP's Streamable HTTP transport as a
// Cloudflare Worker, so Claude (and any MCP client) can ask Terreno about the real Earth. Stateless JSON-RPC:
// every POST to /mcp is answered with JSON. Deploy and connect: docs/mcp.md.
import { callTool, ToolInputError, TOOLS } from "./tools";

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER = { name: "terreno", title: "Terreno: the real Earth", version: "0.1.0" };
const INSTRUCTIONS = "Terreno answers questions about real places on Earth from open data (terrain, climate, weather, borders) and says where each value comes from. Pass longitude and latitude in degrees. Quote the source when you use a value; use scene to give the person a link that opens the place on Terreno's live 3D globe.";

/** Requests a minute per caller, best effort (per Worker instance). */
const PER_MINUTE = 60;
const hits = new Map<string, number[]>();
const limited = (who: string) => {
  const now = Date.now(), recent = (hits.get(who) ?? []).filter((t) => now - t < 60_000);
  recent.push(now); hits.set(who, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > PER_MINUTE;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, mcp-protocol-version, mcp-session-id, authorization",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** One JSON-RPC message in, its answer out (null for notifications, which get none). */
export async function handle(msg: Rpc): Promise<unknown | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Not a JSON-RPC 2.0 request.");
  const notification = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return reply(msg.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping": return reply(msg.id, {});
    case "tools/list": return reply(msg.id, { tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? ""), args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (!TOOLS.some((t) => t.name === name)) return fail(msg.id, -32602, `No tool called ${name}.`);
      try {
        const out = await callTool(name, args);
        return reply(msg.id, { content: [{ type: "text", text: JSON.stringify(out, null, 1) }], structuredContent: out, isError: false });
      } catch (e) {
        // Tool errors go back to the model as results it can read and correct, not protocol errors.
        const text = e instanceof ToolInputError ? e.message : `Couldn't get that just now (${(e as Error).message}). Try again in a moment.`;
        return reply(msg.id, { content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      if (notification || msg.method.startsWith("notifications/")) return null;
      return fail(msg.id, -32601, `Terreno doesn't do ${msg.method}.`);
  }
}

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/" && req.method === "GET") return json({ ...SERVER, mcp: `${url.origin}/mcp`, tools: TOOLS.map((t) => t.name) });
    if (url.pathname !== "/mcp") return json({ error: "Not found. The MCP endpoint is /mcp." }, 404);
    // This server keeps no sessions and sends nothing unasked, so there's no event stream to open.
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } });
    if (limited(req.headers.get("cf-connecting-ip") ?? "anon")) return json(fail(null, -32000, "Too many requests: wait a minute."), 429);
    let body: unknown;
    try { body = await req.json(); } catch { return json(fail(null, -32700, "That isn't JSON."), 400); }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handle(m as Rpc)))).filter((x) => x !== null);
      return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
    }
    const out = await handle(body as Rpc);
    return out === null ? new Response(null, { status: 202, headers: CORS }) : json(out);
  },
};
