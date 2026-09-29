// The task robot, backed by Claude. Claude reads the request and uses tools
// that are Atlas's own abilities (fly somewhere, switch on layers, open a
// theme, show historical borders, open a tool), then answers in a sentence
// or two. Runs from the browser with either the person's own Anthropic API key
// (kept in this browser, sent only to Anthropic) or a small proxy that holds a
// key for everyone (see docs/ai-proxy.md). Without either, the rule-based
// planner answers as before.
import { LENSES } from "../lenses";
import type { App } from "../app";
import { YEARS, nearestYear, yearLabel } from "../data/history";
import type { Resolver, RunStep } from "./run";

export type AiMode = "off" | "key" | "proxy";
export interface AiConfig { mode: AiMode; key?: string; proxy?: string; model: string }

export const MODELS = [
  { id: "claude-sonnet-5", label: "Balanced (Claude Sonnet 5)" },
  { id: "claude-haiku-4-5-20251001", label: "Fastest (Claude Haiku 4.5)" },
  { id: "claude-opus-5-5", label: "Most capable (Claude Opus 5.5)" },
];

const KEY = "atlas.ai.v1";
/** A proxy baked in at build time (VITE_ATLAS_AI_PROXY) makes the AI work for every visitor. */
const BUILT_IN_PROXY = (import.meta.env?.VITE_ATLAS_AI_PROXY as string | undefined) || "";

export function loadAi(): AiConfig {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && typeof v.mode === "string") return { model: MODELS[0].id, ...v };
  } catch { /* defaults */ }
  return BUILT_IN_PROXY ? { mode: "proxy", proxy: BUILT_IN_PROXY, model: MODELS[0].id } : { mode: "off", model: MODELS[0].id };
}
export function saveAi(c: AiConfig) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* session only */ }
}
export const aiOn = (c = loadAi()) => (c.mode === "key" && !!c.key) || (c.mode === "proxy" && !!c.proxy);

/** Reads as a request or a question rather than just a place name. */
export function looksLikeAsk(q: string): boolean {
  const t = q.trim().toLowerCase();
  if (t.length < 8 || /^-?\d/.test(t) || /^https?:\/\//.test(t)) return false;
  return /\?$/.test(t) || /^(what|where|why|how|when|which|who|show|find|take|fly|tell|explain|compare|plan|help|can|is|are|do|does|i want|let'?s|give|zoom|open|turn|add|map)\b/.test(t) || t.split(/\s+/).length >= 5;
}

// ---- The tools ------------------------------------------------------------------------------

interface Tool { name: string; description: string; input_schema: Record<string, unknown> }

const WORK_TOOLS = ["plan", "present", "video", "grow", "build", "flock", "teach", "learn"];

function tools(app: App): Tool[] {
  const layers = [...app.actions.keys()].filter((k) => !k.startsWith("work:borders:") && !k.startsWith("work:") && !k.startsWith("space:") && !k.startsWith("lens:") && k !== "pro:occupancy");
  const lenses = LENSES.filter((l) => app.actions.has(`lens:${l.id}`));
  const views = app.themes.flatMap((t) => t.subtabs.map((s) => `${t.id}/${s.id}`));
  return [
    { name: "fly_to", description: "Find a place by name (city, address, landmark, region, country, mountain, river…) and fly the globe there, selecting it. Do this before opening a view about a place.", input_schema: { type: "object", properties: { place: { type: "string", description: "The place, as specific as possible, e.g. 'Lisbon, Portugal' or 'Mount Fuji'." }, zoom: { type: "string", enum: ["street", "city", "region", "country", "continent"], description: "How far out to frame it." } }, required: ["place"] } },
    { name: "add_layers", description: `Switch on world map layers. Available: ${layers.map((l) => `${l} (${app.actions.get(l)!.label})`).join("; ")}.`, input_schema: { type: "object", properties: { layers: { type: "array", items: { type: "string", enum: layers } } }, required: ["layers"] } },
    { name: "open_view", description: `Open a theme's view about the selected place (fly_to first). Views: ${app.themes.map((t) => `${t.id} (${t.label}): ${t.subtabs.map((s) => `${s.id} = ${s.label}`).join(", ")}`).join(" | ")}.`, input_schema: { type: "object", properties: { view: { type: "string", enum: views } }, required: ["view"] } },
    { name: "show_borders", description: `Show the world's political borders in a past year (maps exist for ${yearLabel(YEARS[0])} to ${yearLabel(YEARS[YEARS.length - 1])}; the nearest map is used). Use a negative year for BC. Pass null to hide them.`, input_schema: { type: "object", properties: { year: { type: ["integer", "null"] } }, required: ["year"] } },
    { name: "open_tool", description: "Open one of Atlas's tools: plan (trips, events, sites, zones, routes), present (slides), video (record the globe), grow (fields and crops), build (construction projects), flock (animals), teach (lessons, quizzes, field trips), learn (games for students, places to learn), space (satellites, ISS, launches), solar (the solar system view), myplace (the person's saved places and today's brief there: frost, heat, storms, animals and tasks due).", input_schema: { type: "object", properties: { tool: { type: "string", enum: [...WORK_TOOLS, "space", "solar", "myplace"] } }, required: ["tool"] } },
    { name: "today_brief", description: "Read today's brief for the person's own saved place (home, farm or site): weather to act on, animals due, fields to harvest or irrigate, projects behind. Use it for questions like 'what do I need to do today?' or 'anything due on the farm?'.", input_schema: { type: "object", properties: {} } },
    { name: "log_record", description: "Record something that happened at the person's place, as ONE plain sentence per call that names the animal (by name or tag), field or building project, e.g. 'Daisy had twins', 'weighed 101 at 590 kg', 'wormed all the sheep with Cydectin', 'sprayed Top field with fungicide', 'Oak Street: poured the slab, 14 crew'. Split a sentence about several animals into several calls.", input_schema: { type: "object", properties: { line: { type: "string" } }, required: ["line"] } },
    { name: "open_lens", description: `Look at the selected feature (fly_to it first) through a lens. Lenses: ${lenses.map((l) => `${l.id} = ${l.label}: ${l.blurb}`).join(" | ")}.`, input_schema: { type: "object", properties: { lens: { type: "string", enum: lenses.map((l) => l.id) } }, required: ["lens"] } },
  ];
}

const SYSTEM = `You are the assistant inside Atlas, a 3D globe with real satellite imagery and terrain. People type requests in its search box.
Act by calling tools: fly to places, switch on layers, open views, look at a feature through a lens, show historical borders, open tools, read the brief for the person's own place, and log what happened there. Chain several calls for multi-part requests (place first, then layers, then a view).
Then reply in at most three short sentences: what you showed and one interesting, accurate fact. Plain text, no markdown, no lists.
Only use the layers, views and tools listed. If something isn't available, say so briefly and show the closest thing that is.
Never invent data. If you aren't sure of a fact, don't state it. Keep it friendly and suitable for all ages.`;

// ---- Running a request -------------------------------------------------------------------------

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
interface Reply { content: Block[]; stop_reason: string }

async function call(c: AiConfig, body: Record<string, unknown>, signal?: AbortSignal): Promise<Reply> {
  const url = c.mode === "proxy" ? c.proxy! : "https://api.anthropic.com/v1/messages";
  const headers: Record<string, string> = { "content-type": "application/json", "anthropic-version": "2023-06-01" };
  if (c.mode === "key") {
    headers["x-api-key"] = c.key!;
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json())?.error?.message ?? msg; } catch { /* keep status */ }
    throw new Error(res.status === 401 ? "The API key was refused." : res.status === 429 ? "Too many requests right now; try again in a moment." : msg);
  }
  return res.json();
}

const ZOOM: Record<string, number> = { street: 400, city: 12_000, region: 150_000, country: 700_000, continent: 3_000_000 };

export interface AiDeps {
  resolver: Resolver;
  showBorders(year: number | null): Promise<void>;
  openTool(tool: string): void;
  /** Today's brief for the person's main saved place, as text (empty when none is saved). */
  brief?(): Promise<string>;
  /** Logs one plain-words line to Flock, Grow or Build; returns what was saved, or null. */
  logLine?(line: string): Promise<string | null>;
}

/** Runs a request through Claude, reporting each action as a step. Returns Claude's answer. */
export async function askAi(app: App, deps: AiDeps, request: string, onStep: (steps: RunStep[]) => void, signal?: AbortSignal): Promise<string> {
  const c = loadAi();
  const steps: RunStep[] = [{ label: "Reading your request", status: "running" }];
  const push = () => onStep(steps.map((s) => ({ ...s })));
  push();
  const where = app.place ? `The selected place is at ${app.place.lat.toFixed(4)}, ${app.place.lon.toFixed(4)}.` : "No place is selected.";
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: `${request}\n\n(${where} Current theme: ${app.theme?.label ?? "Explore"}.)` }];
  const toolList = tools(app);
  let answer = "";
  for (let turn = 0; turn < 6; turn++) {
    const reply = await call(c, { model: c.model, max_tokens: 800, system: SYSTEM, tools: toolList, messages }, signal);
    if (turn === 0) steps[0].status = "done";
    answer = reply.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join(" ").trim() || answer;
    const uses = reply.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (!uses.length || reply.stop_reason !== "tool_use") break;
    messages.push({ role: "assistant", content: reply.content });
    const results = [];
    for (const u of uses) {
      const step: RunStep = { label: describeUse(app, u), status: "running" };
      steps.push(step);
      push();
      let out: string, ok = true;
      try {
        out = await runTool(app, deps, u);
      } catch (e) {
        ok = false;
        out = (e as Error).message;
      }
      step.status = ok ? "done" : "failed";
      if (!ok) step.note = out;
      push();
      results.push({ type: "tool_result", tool_use_id: u.id, content: out, is_error: !ok });
    }
    messages.push({ role: "user", content: results });
  }
  push();
  return answer;
}

function describeUse(app: App, u: Extract<Block, { type: "tool_use" }>): string {
  const i = u.input;
  switch (u.name) {
    case "fly_to": return `Find ${String(i.place)}`;
    case "add_layers": return `Add ${(i.layers as string[] ?? []).map((l) => app.actions.get(l)?.label ?? l).join(", ")}`;
    case "open_view": {
      const [t, s] = String(i.view).split("/");
      const th = app.themes.find((x) => x.id === t);
      return `Open ${th?.label ?? t} › ${th?.subtabs.find((x) => x.id === s)?.label ?? s}`;
    }
    case "show_borders": return i.year === null ? "Hide historical borders" : `Show the borders in ${yearLabel(nearestYear(Number(i.year)))}`;
    case "open_tool": return `Open ${String(i.tool)}`;
    case "today_brief": return "Read today's brief";
    case "log_record": return `Log: ${String(i.line)}`;
    case "open_lens": return `Look through the ${LENSES.find((l) => l.id === i.lens)?.label ?? String(i.lens)} lens`;
    default: return u.name;
  }
}

async function runTool(app: App, deps: AiDeps, u: Extract<Block, { type: "tool_use" }>): Promise<string> {
  const i = u.input;
  switch (u.name) {
    case "fly_to": {
      const found = await deps.resolver.find(String(i.place));
      if (!found) throw new Error(`No place called "${i.place}" was found.`);
      const radius = typeof i.zoom === "string" && ZOOM[i.zoom] ? ZOOM[i.zoom] : found.radius;
      await deps.resolver.go({ ...found, radius });
      return `Showing ${found.name}${found.detail ? `, ${found.detail}` : ""} (${found.lat.toFixed(3)}, ${found.lon.toFixed(3)}).`;
    }
    case "add_layers": {
      const done: string[] = [];
      for (const l of (i.layers as string[]) ?? []) {
        const a = app.actions.get(l);
        if (!a) continue;
        a.run();
        done.push(a.label);
      }
      if (!done.length) throw new Error("None of those layers exist.");
      return `Switched on: ${done.join(", ")}.`;
    }
    case "open_view": {
      const [t, s] = String(i.view).split("/");
      if (!app.themes.some((x) => x.id === t)) throw new Error("No such view.");
      if (!app.place) {
        const c = deps.resolver.centre();
        if (c) app.select({ lon: c.lon, lat: c.lat, height: 0 });
      }
      app.setTheme(t, s);
      await new Promise((r) => setTimeout(r, 700));
      return `Opened ${t}/${s}.`;
    }
    case "show_borders": {
      const y = i.year === null || i.year === undefined ? null : nearestYear(Number(i.year));
      await deps.showBorders(y);
      return y === null ? "Borders hidden." : `Showing borders for ${yearLabel(y)} (nearest available map).`;
    }
    case "open_tool":
      deps.openTool(String(i.tool));
      return `Opened ${i.tool}.`;
    case "today_brief": {
      const text = deps.brief ? await deps.brief() : "";
      return text || "No place is saved yet. The person can save one in My Place (top right).";
    }
    case "log_record": {
      if (!deps.logLine) throw new Error("Logging isn't available.");
      const r = await deps.logLine(String(i.line));
      if (!r) throw new Error(`Couldn't tell which animal, field or project "${i.line}" is about. Ask the person to name it.`);
      return `Saved: ${r}`;
    }
    case "open_lens": {
      const a = app.actions.get(`lens:${String(i.lens)}`);
      if (!a) throw new Error("No such lens.");
      a.run();
      await new Promise((r) => setTimeout(r, 900));
      return `Opened the ${String(i.lens)} lens on the selected place.`;
    }
  }
  throw new Error(`Unknown tool ${u.name}.`);
}

/** Checks the connection with a tiny request. */
export async function testAi(c: AiConfig): Promise<string> {
  const r = await call(c, { model: c.model, max_tokens: 30, messages: [{ role: "user", content: "Reply with just: Atlas AI is connected." }] });
  return r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

/** Asks Claude to fill in one tool's input (a structured answer), e.g. a lens recipe. */
export async function askForTool(system: string, tool: Tool, request: string, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  const c = loadAi();
  const r = await call(c, { model: c.model, max_tokens: 1500, system, tools: [tool], tool_choice: { type: "tool", name: tool.name }, messages: [{ role: "user", content: request }] }, signal);
  const use = r.content.find((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
  return use?.input ?? null;
}
export type { Tool as AiTool };
