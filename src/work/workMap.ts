// The Work map: every pro tool as a station on an industry's line, drawn
// like a metro map, with the specialists branching off the tools they serve.
// Say what you do and the stations that fit light up; the ones you already
// use are filled in; the last one you had open is one tap away.
import { h } from "../ui/dom";
import { LINES, rank, type Line, type Station } from "./workLines";

const RECENT = "atlas.work.recent.v1";
const readJson = (k: string): unknown => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } };

/** Is there saved work behind this station (for a Field Network sector, a company in that sector)? */
export function inUse(s: Station): boolean {
  if (!s.key) return false;
  const v = readJson(s.key);
  if (!Array.isArray(v) || !v.length) return false;
  if (s.tool.startsWith("scout:")) { const ind = s.tool.slice(6); return v.some((x: { industry?: string; sites?: unknown[] }) => x.industry === ind && !!x.sites?.length); }
  if (s.tool.startsWith("services:")) { const sector = s.tool.slice(9); return v.some((c: { vertical?: string }) => (c.vertical ?? "mining") === sector); }
  return true;
}
export const recent = (): string[] => { const v = readJson(RECENT); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; };
export function remember(id: string) { try { localStorage.setItem(RECENT, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 5))); } catch { /* private mode */ } }

export function workMap(onOpen: (s: Station, line: Line) => void): HTMLElement {
  const find = (id: string) => { for (const line of LINES) { const s = line.stations.find((x) => x.id === id); if (s) return { line, s }; } return null; };
  const open = (s: Station, line: Line) => { remember(s.id); onOpen(s, line); };
  const stops = new Map<string, HTMLElement>(), rows = new Map<string, HTMLElement>();
  const hint = h("p", { class: "wm-hint" });
  const ask = h("input", { class: "wm-ask", placeholder: "What do you do? “We hire out cranes”, “I run a clinic charity”", "aria-label": "What do you do?" }) as HTMLInputElement;
  let best: { s: Station; line: Line } | null = null;
  const light = () => {
    const q = ask.value.trim(), r = q ? rank(q) : [];
    const hits = new Map(r.map((x) => [x.station.id, x.score]));
    best = r[0] ? { s: r[0].station, line: r[0].line } : null;
    for (const [id, el] of stops) { el.classList.toggle("hit", hits.has(id)); el.classList.toggle("best", best?.s.id === id); }
    for (const [id, el] of rows) el.classList.toggle("dim", !!q && !LINES.find((l) => l.id === id)!.stations.some((s) => hits.has(s.id)));
    hint.replaceChildren(...(q ? (best ? [`Best fit: `, h("strong", {}, best.s.label), ` · ${best.s.who}. `, h("button", { class: "link-btn", onclick: () => best && open(best.s, best.line) }, "Open it →")] : ["Nothing fits yet. Try the kind of work, not the company name."]) : []));
  };
  ask.addEventListener("input", light);
  ask.addEventListener("keydown", (e) => { if (e.key === "Enter" && best) open(best.s, best.line); });

  const last = recent().map(find).filter((x): x is NonNullable<typeof x> => !!x)[0];
  const lines = h("div", { class: "wm-lines" }, ...LINES.map((line) => {
    const row = h("div", { class: "wm-line", style: `--c:${line.color}` },
      h("span", { class: "wm-industry" }, line.label),
      h("div", { class: "wm-track" }, ...line.stations.map((s, i) => {
        const el = h("button", { class: "wm-stop" + (i === 0 ? " root" : "") + (inUse(s) ? " used" : ""), title: s.who, onclick: () => open(s, line) },
          h("i", { class: "wm-dot" }), h("strong", {}, s.label), h("small", {}, s.who));
        stops.set(s.id, el);
        return el;
      })));
    rows.set(line.id, row);
    return row;
  }));
  return h("div", { class: "wm" },
    ask, hint,
    last ? h("button", { class: "wm-last", style: `--c:${last.line.color}`, onclick: () => open(last.s, last.line) }, h("i", { class: "wm-dot" }), h("span", {}, "Carry on with ", h("strong", {}, last.s.label))) : "",
    lines,
    h("p", { class: "muted small wm-legend" }, h("i", { class: "wm-dot used" }), " in use   ", h("i", { class: "wm-dot" }), " not yet"));
}
