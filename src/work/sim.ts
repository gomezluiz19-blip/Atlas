// Work › Teach › World Summit: the class plays an international relations
// game over several lessons. Each team leads a real country; the globe shows
// the teams' countries, their capitals, and lines for alliances, trade and
// sanctions; headlines report what happened each turn.
import type { ImageryLayer } from "cesium";
import type { App } from "../app";
import { countryShapes, type CountryShape } from "../data/countries";
import { canvasLayer, tracePath } from "../globe/networkLayer";
import { h } from "../ui/dom";
import { CAPITALS } from "./gameData";
import type { WorkCtx } from "./hub";
import { WorkLayer } from "./layer";
import { flyToView } from "./present";
import { overhead } from "./presentModel";
import { confetti } from "./quiz";
import { ACTIONS, DEBRIEF, newGame, pairKey, resolveTurn, wellbeing, type ActionId, type Choice, type SimState } from "./simModel";
import { ListStore, download, newId } from "./store";

const games = new ListStore<SimState>("atlas.work.sims.v1");
const COLORS = ["#ff375f", "#0a84ff", "#30d158", "#ff9f0a", "#bf5af2", "#64d2ff", "#ffd60a", "#ac8e68"];
let fills: ImageryLayer | null = null;
let lines: WorkLayer | null = null;

/** A capital (or the middle of the largest land area) for a country. */
function anchor(c: CountryShape): [number, number] {
  const cap = CAPITALS.find((x) => c.name.toLowerCase().includes(x.hint.replace(/^capital of (the )?/, "").toLowerCase()));
  if (cap) return [cap.lon, cap.lat];
  let best = c.polygons[0][0], area = -1;
  for (const p of c.polygons) {
    const r = p[0];
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
    if (Math.abs(a) > area) { area = Math.abs(a); best = r; }
  }
  return [best.reduce((s, q) => s + q[0], 0) / best.length, best.reduce((s, q) => s + q[1], 0) / best.length];
}

async function drawWorld(app: App, g: SimState) {
  const shapes = await countryShapes();
  const viewer = app.globe.viewer;
  if (fills) viewer.imageryLayers.remove(fills, true);
  const mine = g.nations.map((n) => ({ n, shape: shapes.find((s) => s.name === n.name) })).filter((x) => x.shape);
  fills = canvasLayer((ctx, t) => {
    for (const { n, shape } of mine) {
      if (!t.touches(shape!.bbox, 4)) continue;
      ctx.beginPath();
      for (const poly of shape!.polygons) for (const ring of poly) { tracePath(ctx, t, new Float32Array(ring.flat())); ctx.closePath(); }
      ctx.fillStyle = n.color + "a0";
      ctx.fill("evenodd");
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = n.color;
      ctx.stroke();
    }
  }, { maximumLevel: 7 });
  viewer.imageryLayers.add(fills);
  lines ??= new WorkLayer(app, "work:summit", "World Summit", "#ff375f");
  const at = (id: string) => { const n = g.nations.find((x) => x.id === id)!; return [n.lon, n.lat] as [number, number]; };
  lines.set([
    ...g.alliances.map((k) => ({ id: `a${k}`, kind: "line" as const, pts: k.split("|").map(at), color: "#30d158" })),
    ...g.trade.filter((k) => !g.alliances.includes(k)).map((k) => ({ id: `t${k}`, kind: "line" as const, pts: k.split("|").map(at), color: "#0a84ff", dashed: true })),
    ...g.sanctions.map((k) => ({ id: `s${k}`, kind: "line" as const, pts: k.split(">").map(at), color: "#ff3b30", dashed: true })),
    ...g.nations.map((n) => ({ id: n.id, kind: "point" as const, pts: [[n.lon, n.lat] as [number, number]], color: n.color, label: `${n.team} · ${n.name}` })),
  ], `World Summit · ${g.name}`);
}

export function openSims(ctx: WorkCtx, back: () => void) {
  ctx.show("World Summit", back,
    h("p", { class: "mp-intro" }, "A game of international relations for your class, played over several lessons. Each team leads a real country and chooses policies every turn: trade, aid, alliances, sanctions, investment, the environment. Events test them, and the globe shows who's allied, trading or at odds."),
    h("div", { class: "chips wrap" }, h("button", { class: "chip", onclick: () => void setup(ctx, back) }, "+ New game")),
    games.all().length ? h("section", { class: "group" }, h("h2", { class: "group-title" }, "Games"),
      h("div", { class: "list" }, ...games.all().map((g) =>
        h("button", { class: "list-row", onclick: () => openSim(ctx, g.id, back) },
          h("span", { class: "sim-dots" }, ...g.nations.map((n) => h("span", { class: "dot", style: `background:${n.color}` }))),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, g.name), h("span", { class: "list-sub" }, g.turn > g.maxTurns ? "Finished" : `Turn ${g.turn} of ${g.maxTurns} · ${g.nations.length} teams`)),
          h("span", { class: "chev", html: "&rsaquo;" }))))) : "",
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "How to run it"),
      h("ol", { class: "sim-how" },
        h("li", {}, "Put the class in teams of 3–5 and give each a country (real rivals and partners make it lively)."),
        h("li", {}, "Each lesson, teams debate and hand in two choices; you enter them and press Play the turn."),
        h("li", {}, "Read the headlines aloud, look at the map, and let teams negotiate before the next turn."),
        h("li", {}, "After the last turn, use the debrief questions."))),
  );
}

async function setup(ctx: WorkCtx, back: () => void) {
  const shapes = (await countryShapes()).filter((s) => s.name).sort((a, b) => a.name.localeCompare(b.name));
  const name = h("input", { class: "mp-name", value: "World Summit", "aria-label": "Game name" }) as HTMLInputElement;
  const turns = h("select", {}, ...[4, 6, 8, 10, 12].map((n) => h("option", { value: n, selected: n === 8 }, `${n} turns`))) as HTMLSelectElement;
  const suggest = ["United States of America", "China", "Brazil", "Nigeria", "India", "Germany", "Japan", "Egypt"];
  const rows: { team: HTMLInputElement; country: HTMLSelectElement }[] = [];
  const box = h("div", { class: "sim-teams" });
  const addRow = () => {
    const i = rows.length;
    if (i >= COLORS.length) return;
    const team = h("input", { value: `Team ${i + 1}`, "aria-label": "Team name" }) as HTMLInputElement;
    const country = h("select", { "aria-label": "Country" }, ...shapes.map((s) => h("option", { value: s.name, selected: s.name === suggest[i] }, s.name))) as HTMLSelectElement;
    rows.push({ team, country });
    box.append(h("div", { class: "sim-team" }, h("span", { class: "dot big", style: `background:${COLORS[i]}` }), team, country));
  };
  for (let i = 0; i < 4; i++) addRow();
  ctx.show("New game", () => openSims(ctx, back),
    name, h("label", { class: "mp-field" }, h("span", {}, "Length"), turns),
    h("h2", { class: "group-title" }, "Teams"), box,
    h("button", { class: "link-btn", onclick: addRow }, "+ Add a team"),
    h("div", { class: "pro-actions" }, h("button", { class: "primary-btn", onclick: () => {
      const picked = rows.map((r, i) => {
        const s = shapes.find((x) => x.name === r.country.value)!;
        const [lon, lat] = anchor(s);
        return { team: r.team.value.trim() || `Team ${i + 1}`, name: s.name, color: COLORS[i], lon, lat };
      });
      if (new Set(picked.map((p) => p.name)).size !== picked.length) { ctx.app.toast("Give each team a different country.", 4000); return; }
      const g = newGame(newId(), name.value.trim() || "World Summit", picked, Number(turns.value));
      games.save(g);
      openSim(ctx, g.id, back);
    } }, "Start the game")),
  );
}

function openSim(ctx: WorkCtx, id: string, back: () => void) {
  const g = games.get(id);
  if (!g) return openSims(ctx, back);
  const { app } = ctx;
  void drawWorld(app, g);
  const over = g.turn > g.maxTurns;
  const ranked = [...g.nations].sort((a, b) => wellbeing(b) - wellbeing(a));
  const bar = (v: number, c: string) => h("span", { class: "sim-bar", title: String(v) }, h("span", { style: `width:${v}%;background:${c}` }));
  const standings = h("div", { class: "work-table-wrap" }, h("table", { class: "work-table sim-table" },
    h("thead", {}, h("tr", {}, h("th", {}, "Team"), h("th", {}, "Score"), h("th", {}, "Economy"), h("th", {}, "Security"), h("th", {}, "Stability"), h("th", {}, "Environment"), h("th", {}, "Budget"))),
    h("tbody", {}, ...ranked.map((n) => h("tr", {},
      h("td", {}, h("span", { class: "dot", style: `background:${n.color}` }), ` ${n.team}`, h("div", { class: "muted small" }, n.name)),
      h("td", {}, h("strong", {}, String(wellbeing(n)))),
      h("td", {}, bar(n.economy, "#ffd60a")), h("td", {}, bar(n.security, "#ff375f")), h("td", {}, bar(n.stability, "#0a84ff")), h("td", {}, bar(n.environment, "#30d158")),
      h("td", {}, `${n.treasury}`))))));

  // This turn's choices, two per team.
  const choiceRows = g.nations.map((n) => {
    const others = g.nations.filter((o) => o.id !== n.id);
    const make = () => {
      const act = h("select", { "aria-label": `${n.team} action` }, h("option", { value: "" }, "—"), ...(Object.keys(ACTIONS) as ActionId[]).map((a) => h("option", { value: a, disabled: n.treasury < ACTIONS[a].cost }, `${ACTIONS[a].label} (${ACTIONS[a].cost})`))) as HTMLSelectElement;
      const tgt = h("select", { "aria-label": "Target", hidden: true }, ...others.map((o) => h("option", { value: o.id }, `${o.team} (${o.name})`))) as HTMLSelectElement;
      act.addEventListener("change", () => { tgt.hidden = !ACTIONS[act.value as ActionId]?.target; act.title = ACTIONS[act.value as ActionId]?.about ?? ""; });
      return { act, tgt };
    };
    return { n, picks: [make(), make()] };
  });

  const relation = (a: string, b: string) => g.relations[pairKey(a, b)] ?? 0;
  const relTable = h("div", { class: "work-table-wrap" }, h("table", { class: "work-table sim-rel" },
    h("thead", {}, h("tr", {}, h("th", {}, ""), ...g.nations.map((n) => h("th", { title: n.name }, h("span", { class: "dot", style: `background:${n.color}` }))))),
    h("tbody", {}, ...g.nations.map((a) => h("tr", {}, h("th", {}, a.team), ...g.nations.map((b) => {
      if (a.id === b.id) return h("td", {}, "");
      const v = relation(a.id, b.id), k = pairKey(a.id, b.id);
      const tag = g.alliances.includes(k) ? "🤝" : g.sanctions.includes(`${a.id}>${b.id}`) || g.sanctions.includes(`${b.id}>${a.id}`) ? "⛔" : g.trade.includes(k) ? "⇄" : "";
      return h("td", { style: `background:${v >= 0 ? `rgba(48,209,88,${Math.min(0.5, v / 150)})` : `rgba(255,59,48,${Math.min(0.5, -v / 150)})`}`, title: `${v}` }, `${v > 0 ? "+" : ""}${v}${tag ? ` ${tag}` : ""}`);
    }))))));

  const recent = g.news.filter((x) => x.turn >= g.turn - 1).slice(-14).reverse();
  ctx.show(g.name, () => openSims(ctx, back),
    h("div", { class: "sim-head" }, h("strong", {}, over ? "Game over" : `Turn ${g.turn} of ${g.maxTurns}`), h("span", { class: "sim-dots" }, ...g.nations.map((n) => h("span", { class: "dot", style: `background:${n.color}` })))),
    standings,
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Headlines"),
      h("div", { class: "sim-news" }, ...recent.map((x, k) => h("p", { class: `sim-headline ${x.tone}`, style: `--k:${k}` }, x.text)))),
    over ? h("section", { class: "group" }, h("h2", { class: "group-title" }, "Debrief"),
      h("p", {}, `${ranked[0].team} (${ranked[0].name}) finished with the highest score, but the numbers aren't the whole story.`),
      h("ol", { class: "sim-how" }, ...DEBRIEF.map((d) => h("li", {}, d))))
    : h("section", { class: "group" }, h("h2", { class: "group-title" }, "This turn's decisions"),
      h("p", { class: "muted small" }, "Each team picks up to two actions (costs come out of their budget)."),
      ...choiceRows.map(({ n, picks }) => h("div", { class: "sim-choice", style: `--c:${n.color}` }, h("strong", {}, `${n.team} · budget ${n.treasury}`), ...picks.flatMap((p) => [p.act, p.tgt]))),
      h("div", { class: "pro-actions" }, h("button", { class: "primary-btn", onclick: () => {
        const choices: Record<string, Choice[]> = {};
        for (const { n, picks } of choiceRows) choices[n.id] = picks.filter((p) => p.act.value).map((p) => ({ action: p.act.value as ActionId, target: ACTIONS[p.act.value as ActionId].target ? p.tgt.value : undefined }));
        const next = resolveTurn(g, choices);
        next.id = g.id;
        games.save(next);
        openSim(ctx, id, back);
        if (next.turn > next.maxTurns) confetti(document.body);
      } }, g.turn === g.maxTurns ? "Play the final turn" : "Play the turn"))),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Relations"),
      relTable, h("p", { class: "muted small" }, "🤝 alliance · ⇄ trade · ⛔ sanctions. On the map: green lines are alliances, blue dashed trade, red dashed sanctions.")),
    h("div", { class: "pro-actions" },
      h("button", { class: "link-btn", onclick: () => void flyToView(app, overhead(g.nations.reduce((s, n) => s + n.lon, 0) / g.nations.length, 25, 20_000_000), 2) }, "Show on the globe"),
      h("button", { class: "link-btn", onclick: () => download(`${g.name}.terreno-summit.json`, JSON.stringify(g)) }, "Save as a file"),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Delete "${g.name}"?`)) { games.remove(g.id); lines?.clear(); if (fills) { app.globe.viewer.imageryLayers.remove(fills, true); fills = null; } openSims(ctx, back); } } }, "Delete game")),
  );
}
