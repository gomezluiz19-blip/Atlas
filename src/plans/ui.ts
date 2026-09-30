// My plans: everything planned across Atlas on one map, in one colour, the
// darker the sooner, with a timeline beside it grouped by when. Filter by
// kind, stretch or shorten the horizon, tap anything to go there.
import type { App } from "../app";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import type { WorkCtx } from "../work/hub";
import type { WorkFeature } from "../work/layer";
import { frame, OpsMap } from "../pro/kit/ui";
import { bucket, daysUntil, gatherAll, shade, toHex, type Planned } from "./gather";

let map: OpsMap | null = null;
let horizon = 90;
const hidden = new Set<string>();
const today = () => new Date().toISOString().slice(0, 10);
const when = (d: number) => (d < 0 ? `${-d} ${d === -1 ? "day" : "days"} ago` : d === 0 ? "today" : d === 1 ? "tomorrow" : d < 14 ? `in ${d} days` : d < 60 ? `in ${Math.round(d / 7)} weeks` : `in ${Math.round(d / 30)} months`);
const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

function draw(app: App, all: Planned[]) {
  map ??= new OpsMap(app, "plans", "#1f6fe5");
  const t = today(), shown = all.filter((p) => !hidden.has(p.source));
  const fs: WorkFeature[] = [];
  // Journeys and trips joined leg by leg, each leg in the shade of where it arrives.
  const groups = new Map<string, Planned[]>();
  for (const p of shown) if (p.group) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  for (const ps of groups.values()) for (let i = 1; i < ps.length; i++) {
    const d = daysUntil(ps[i].date, t);
    fs.push({ id: `g${ps[i].id}`, kind: "line", pts: [[ps[i - 1].lon, ps[i - 1].lat], [ps[i].lon, ps[i].lat]], color: toHex(shade(d, horizon)), dashed: d < 0, solid: true });
  }
  // Soonest last, so the darkest sit on top; labels for the next dozen.
  const upcoming = shown.filter((p) => daysUntil(p.date, t) >= 0);
  const labelled = new Set(upcoming.slice(0, 12).map((p) => p.id));
  for (const p of [...shown].sort((a, b) => daysUntil(b.date, t) - daysUntil(a.date, t)))
    fs.push({ id: p.id, kind: "point", pts: [[p.lon, p.lat]], color: toHex(shade(daysUntil(p.date, t), horizon)), label: labelled.has(p.id) ? `${fmtDate(p.date)} · ${p.title}` : undefined });
  map.draw("My plans", fs);
}

export function openPlans(ctx: WorkCtx, first = true) {
  const { app } = ctx;
  const all = gatherAll(), t = today();
  draw(app, all);
  if (first) { const soon = all.filter((p) => { const d = daysUntil(p.date, t); return d >= 0 && d <= horizon; }); frame(app, "My plans", soon.length ? soon : all, 20_000); }
  const sources = [...new Set(all.map((p) => p.source))];
  const shown = all.filter((p) => !hidden.has(p.source));
  const groups = (["Today", "This week", "This month", "Later", "Past"] as const).map((b) => ({ b, ps: shown.filter((p) => bucket(daysUntil(p.date, t)) === b) }));
  const next = shown.find((p) => daysUntil(p.date, t) >= 0);
  ctx.show("My plans", ctx.home,
    h("p", { class: "muted small" }, "Everything you've planned in Atlas, on the map: the darker the blue, the sooner it happens."),
    h("div", { class: "mp-scale" }, h("span", {}, "Today"), h("i", { style: `background: linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((f) => shade(f * horizon, horizon)).join(", ")})` }), h("span", {}, `${horizon} days`)),
    h("div", { class: "chips wrap" }, ...[30, 90, 365].map((d) => h("button", { class: "chip" + (d === horizon ? " on" : ""), style: d === horizon ? "--c:#1f6fe5" : "", onclick: () => { horizon = d; openPlans(ctx, false); } }, d === 365 ? "A year" : `${d} days`))),
    sources.length > 1 ? h("div", { class: "chips wrap" }, ...sources.map((s) => h("button", { class: "chip" + (hidden.has(s) ? "" : " on"), style: hidden.has(s) ? "" : "--c:#1f6fe5", onclick: () => { if (hidden.has(s)) hidden.delete(s); else hidden.add(s); openPlans(ctx, false); } }, `${s} · ${all.filter((p) => p.source === s).length}`))) : "",
    !all.length ? h("div", { class: "empty-state" }, h("p", {}, "Nothing dated yet."), h("p", { class: "muted small" }, "Plan a trip or an event in Create › Plan, or give dates to fixtures, permits, deliveries or deals in the Pro tools, and they appear here."))
      : h("div", {},
        next ? h("p", { class: "mp-next" }, h("strong", {}, `Next: ${next.title}`), ` · ${when(daysUntil(next.date, t))}, ${next.sub}`) : "",
        ...groups.filter((g) => g.ps.length).map((g) => h(g.b === "Past" ? "details" : "div", {},
          g.b === "Past" ? h("summary", { class: "group-title" }, `Past · ${g.ps.length}`) : h("h2", { class: "group-title" }, `${g.b} · ${g.ps.length}`),
          h("div", { class: "list" }, ...(g.b === "Past" ? [...g.ps].reverse().slice(0, 30) : g.ps).map((p) => {
            const d = daysUntil(p.date, t);
            return h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: p.title, lon: p.lon, lat: p.lat, radius: 3000 }) },
              h("span", { class: "mp-dot", style: `background:${shade(d, horizon)}` }),
              h("span", { class: "list-text" }, h("span", { class: "list-title" }, p.title), h("span", { class: "list-sub" }, `${fmtDate(p.date)} · ${when(d)} · ${p.source} · ${p.sub}`)),
              h("span", { class: "chev", html: "&rsaquo;" }));
          }))))));
}
