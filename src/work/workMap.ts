// Work's front door, in two steps.
//   1. What's your field? Every industry as a tile, grouped, or describe what
//      you do in your own words and the tools that fit come up.
//   2. The field: its tools on three rungs that read the same in every field:
//      Everyday (for anyone), Pro (for people who do the work), Services (for
//      companies that serve it). Mining: Mines and minerals → Mining Pro →
//      Mining equipment & services.
// Terreno remembers your field, so Work opens on it next time; the last tool
// you had open is one tap away. (Design notes: docs/work-design.md.)
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { FAMILIES, LINES, lookOf, rank, TIERS, tierOf, type Line, type Station } from "./workLines";

const RECENT = "atlas.work.recent.v1";
const FIELD = "atlas.work.field.v1";
const readJson = (k: string): unknown => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

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
export function remember(id: string) { write(RECENT, [id, ...recent().filter((x) => x !== id)].slice(0, 5)); }
/** The field you work in, if you've picked one. */
export const myField = (): Line | undefined => { const id = readJson(FIELD); return LINES.find((l) => l.id === id); };
export const setMyField = (id: string | null) => write(FIELD, id);

const icon = (key: string) => (icons as Record<string, string>)[key] ?? icons.briefcase;
const find = (id: string) => { for (const line of LINES) { const s = line.stations.find((x) => x.id === id); if (s) return { line, s }; } return null; };

export function workMap(onOpen: (s: Station, line: Line) => void): HTMLElement {
  const root = h("div", { class: "wk" });
  const open = (s: Station, line: Line) => { remember(s.id); setMyField(line.id); onOpen(s, line); };
  const show = (view: HTMLElement, dir: "in" | "back") => {
    view.classList.add(dir === "in" ? "wk-enter" : "wk-return");
    root.replaceChildren(view);
    root.closest(".work-panel")?.scrollTo({ top: 0 });
  };

  /** "Carry on with Mining Pro": the last tool you had open. */
  const carryOn = () => {
    const last = recent().map(find).find((x) => !!x);
    if (!last) return "";
    const look = lookOf(last.line);
    return h("button", { class: "wk-carry", style: `--c:${last.line.color}`, onclick: () => open(last.s, last.line) },
      h("span", { class: "wk-glyph sm", html: icon(look.icon) }),
      h("span", { class: "wk-carry-text" }, h("small", {}, "Carry on"), h("strong", {}, last.s.label)),
      h("span", { class: "wk-chev", "aria-hidden": "true" }, "›"));
  };

  // ---- 1. What's your field? ----
  function picker(focusAsk = false): HTMLElement {
    const mine = myField();
    const ask = h("input", { class: "wk-ask", type: "search", placeholder: "Or describe what you do", "aria-label": "Describe what you do", enterkeyhint: "go" }) as HTMLInputElement;
    const results = h("div", { class: "wk-results", role: "list" });
    const groups = h("div", { class: "wk-groups" }, ...FAMILIES.map((f) => {
      const lines = LINES.filter((l) => lookOf(l).family === f.id);
      return h("section", { class: "wk-group" },
        h("h3", { class: "wk-group-title" }, f.label),
        h("div", { class: "wk-grid" }, ...lines.map((line) => h("button", { class: "wk-tile" + (mine?.id === line.id ? " mine" : ""), style: `--c:${line.color}`, onclick: () => { setMyField(line.id); show(field(line), "in"); } },
          h("span", { class: "wk-glyph", html: icon(lookOf(line).icon) }),
          h("span", { class: "wk-tile-name" }, line.label),
          h("small", {}, `${line.stations.length} tool${line.stations.length === 1 ? "" : "s"}`)))));
    }));
    let best: ReturnType<typeof rank>[number] | undefined;
    const search = () => {
      const q = ask.value.trim(), all = q ? rank(q) : [], r = all.filter((x) => x.score >= all[0].score / 2).slice(0, 6);
      best = r[0];
      groups.hidden = !!q;
      results.replaceChildren(...(q && !r.length ? [h("p", { class: "wk-none" }, "Nothing fits yet. Try the kind of work (“we hire out cranes”), not the company's name.")] : r.map((x, i) => {
        const tier = TIERS.find((t) => t.id === tierOf(x.station))!;
        return h("button", { class: "wk-hit" + (i === 0 ? " best" : ""), role: "listitem", style: `--c:${x.line.color}`, onclick: () => open(x.station, x.line) },
          h("span", { class: "wk-glyph sm", html: icon(lookOf(x.line).icon) }),
          h("span", { class: "wk-hit-text" }, h("strong", {}, x.station.label), h("small", { class: "wk-where" }, `${x.line.label} · ${tier.label}`), h("small", {}, x.station.who)),
          h("span", { class: "wk-chev", "aria-hidden": "true" }, "›"));
      })));
    };
    ask.addEventListener("input", search);
    ask.addEventListener("keydown", (e) => { if (e.key === "Enter" && best) open(best.station, best.line); });
    const view = h("div", { class: "wk-view" },
      carryOn(),
      h("h2", { class: "wk-q" }, "What's your field?"),
      h("p", { class: "wk-sub" }, "Pick one to see its tools."),
      h("div", { class: "wk-ask-wrap" }, h("span", { class: "wk-ask-icon", html: icons.search }), ask),
      results, groups);
    if (focusAsk) requestAnimationFrame(() => ask.focus());
    return view;
  }

  // ---- 2. A field, on its three rungs ----
  function field(line: Line): HTMLElement {
    const look = lookOf(line);
    const rungs = TIERS.map((t) => ({ t, stations: line.stations.filter((s) => tierOf(s) === t.id) }));
    const sections = new Map<string, HTMLElement>();
    const chain = h("nav", { class: "wk-chain", "aria-label": `${line.label}: the three kinds of tools` }, ...rungs.map(({ t, stations }) =>
      h("button", { class: "wk-rung" + (stations.length ? "" : " empty"), disabled: !stations.length, onclick: () => sections.get(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        h("i", {}), h("strong", {}, t.label), h("small", {}, stations.length ? `${stations.length} tool${stations.length === 1 ? "" : "s"}` : "None yet"))));
    const body = rungs.filter((r) => r.stations.length).map(({ t, stations }) => {
      const sec = h("section", { class: `wk-tier ${t.id}` },
        h("header", {}, h("span", { class: "wk-tier-name" }, t.label), h("span", { class: "wk-tier-for" }, t.for(look.noun))),
        ...stations.map((s) => h("button", { class: "wk-tool", onclick: () => open(s, line) },
          h("span", { class: "wk-tool-text" }, h("strong", {}, s.label), h("small", {}, s.who)),
          inUse(s) ? h("span", { class: "wk-badge" }, "In use") : "",
          h("span", { class: "wk-chev", "aria-hidden": "true" }, "›"))));
      sections.set(t.id, sec);
      return sec;
    });
    return h("div", { class: "wk-view wk-field", style: `--c:${line.color}` },
      h("button", { class: "link-btn wk-back", onclick: () => show(picker(), "back") }, "‹ All fields"),
      h("header", { class: "wk-hero" },
        h("span", { class: "wk-glyph lg", html: icon(look.icon) }),
        h("h2", {}, line.label),
        look.blurb ? h("p", {}, look.blurb) : ""),
      chain, ...body,
      h("button", { class: "wk-other", onclick: () => show(picker(true), "back") }, "Not quite it? Describe what you do"));
  }

  const mine = myField();
  root.append(mine ? field(mine) : picker());
  return root;
}
