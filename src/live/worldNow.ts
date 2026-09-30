// World now: what's happening on Earth, on one screen and on the globe. The
// few biggest stories (Wikipedia's editors pick them), the latest from the
// wire services, natural events still going on, the week's strongest
// earthquakes, the next launch, what the world is reading, and this day in
// history. Every story with a place goes on the globe; tap one to go there.
import { Cartesian3, Color, CustomDataSource, HeightReference, NearFarScalar } from "cesium";
import type { App } from "../app";
import { recentQuakes, type Quake } from "../data/quakes";
import { makePickable } from "../globe/pickables";
import { upcoming, countdown, type Launch } from "../space/launches";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import type { WorkCtx } from "../work/hub";
import { note } from "../themes/common";
import { ago, EVENT_LOOK, naturalEvents, wireHeadlines, worldStories, type EventKind, type Headline, type NaturalEvent, type Story } from "./news";

interface Pin { lon: number; lat: number; title: string; context: string; color: string; size: number }

let pins: CustomDataSource | null = null;
let pinsOn = true;

/** Puts the stories, events and quakes on the globe (tap one to open its place). */
function drawPins(app: App, list: Pin[]) {
  if (!pins) { pins = new CustomDataSource("world-now"); void app.globe.viewer.dataSources.add(pins); }
  pins.entities.removeAll();
  for (const p of list) {
    const e = pins.entities.add({
      position: Cartesian3.fromDegrees(p.lon, p.lat),
      point: { pixelSize: p.size, color: Color.fromCssColorString(p.color), outlineColor: Color.WHITE.withAlpha(0.9), outlineWidth: 1.5, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: new NearFarScalar(2e5, 1.3, 2e7, 0.8) },
    });
    makePickable(e, { lon: p.lon, lat: p.lat, title: p.title, context: p.context, feature: { worldNow: true } });
  }
  pins.show = pinsOn;
  app.canvas.put({
    id: "world-now", label: "World now", color: "#ff375f", scope: "world", pinned: true,
    show: (v) => { if (pins) pins.show = v && pinsOn; },
    remove: () => { pins?.entities.removeAll(); },
  }, true);
}

/** Flies to a place and opens its card, titled with what's happening there. */
function goTo(app: App, lon: number, lat: number, title: string, context: string, radius = 400_000) {
  void flyToPlace(app.globe, { name: title, lon, lat, radius });
  app.select({ lon, lat, height: 0 }, { title, context });
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);
const reads = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M reads` : n >= 1000 ? `${Math.round(n / 1000)}K reads` : `${n} reads`);
const open = (url?: string) => { if (url) window.open(url, "_blank", "noopener"); };

function storyCard(app: App, s: Story, i: number): HTMLElement {
  const place = s.links.find((l) => l.lat !== undefined);
  return h("article", { class: "wn-story" + (i === 0 ? " lead" : "") },
    s.image ? h("img", { class: "wn-story-img", src: s.image, alt: "", loading: "lazy" }) : "",
    h("div", { class: "wn-story-body" },
      h("p", { class: "wn-story-text" }, s.text),
      h("div", { class: "wn-story-links" },
        place && s.lon !== undefined ? h("button", { class: "chip wn-where", onclick: () => goTo(app, s.lon!, s.lat!, place.title, clip(s.text, 120)) }, `📍 ${place.title}`) : "",
        ...s.links.filter((l) => l !== place).slice(0, 3).map((l) => h("button", { class: "chip", title: l.about ?? "", onclick: () => open(l.url) }, l.title)))));
}

function headlineRow(x: Headline): HTMLElement {
  return h("button", { class: "list-row", onclick: () => open(x.url) },
    h("span", { class: "list-text" }, h("span", { class: "list-title wn-head" }, x.title), h("span", { class: "list-sub" }, [x.source, ago(x.time)].filter(Boolean).join(" · "))),
    h("span", { class: "chev", html: "&rsaquo;" }));
}

/** Natural events: counts by kind (tap to filter), the notable ones listed. */
function eventsBlock(app: App, events: NaturalEvent[]): HTMLElement {
  const box = h("div", {});
  let only: EventKind | null = null;
  const kinds = [...new Set(events.map((e) => e.kind))].sort((a, b) => events.filter((e) => e.kind === b).length - events.filter((e) => e.kind === a).length);
  // Storms and volcanoes first (few, each news); fires by size.
  const order = (e: NaturalEvent) => (e.kind === "severeStorms" ? 0 : e.kind === "volcanoes" ? 1 : e.kind === "floods" ? 2 : 3);
  const draw = () => {
    const list = events.filter((e) => !only || e.kind === only).sort((a, b) => order(a) - order(b) || b.time - a.time).slice(0, 8);
    box.replaceChildren(
      h("div", { class: "chips wrap" }, ...kinds.map((k) => h("button", { class: "chip" + (only === k ? " on" : ""), onclick: () => { only = only === k ? null : k; draw(); } },
        `${EVENT_LOOK[k].emoji} ${EVENT_LOOK[k].label} · ${events.filter((e) => e.kind === k).length}`))),
      h("div", { class: "list" }, ...list.map((e) => h("button", { class: "list-row", onclick: () => goTo(app, e.lon, e.lat, e.title, `${EVENT_LOOK[e.kind].label} · NASA EONET`, 250_000) },
        h("span", { class: "story-mini-emoji" }, EVENT_LOOK[e.kind].emoji),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, e.title), h("span", { class: "list-sub" }, [e.size, `updated ${ago(e.time)}`].filter(Boolean).join(" · "))),
        h("span", { class: "chev", html: "&rsaquo;" })))));
  };
  draw();
  return box;
}

/** Opens World now in a hub panel. */
export function openWorldNow(ctx: WorkCtx, back: (() => void) | null = ctx.home) {
  const { app } = ctx;
  const stamp = h("span", { class: "wn-stamp" }, "Gathering…");
  const toggle = h("button", { class: "chip" + (pinsOn ? " on" : ""), title: "Show the stories and events on the globe" }, "On the globe") as HTMLButtonElement;
  toggle.onclick = () => { pinsOn = !pinsOn; toggle.classList.toggle("on", pinsOn); if (pins) pins.show = pinsOn; };
  const slots = {
    stories: h("div", { class: "wn-stories" }, h("p", { class: "muted small" }, "Finding the biggest stories…")),
    wires: h("div", {}), events: h("div", {}), quakes: h("div", {}), launch: h("div", {}), reading: h("div", {}), history: h("div", {}),
  };
  const refresh = h("button", { class: "link-btn", onclick: () => openWorldNow(ctx, back) }, "Refresh");
  ctx.show("World now", back,
    h("div", { class: "wn-top" }, h("span", { class: "pulse-dot" }), stamp, h("span", { class: "wn-gap" }), toggle, refresh),
    h("h2", { class: "group-title" }, "The biggest stories"), slots.stories,
    slots.wires, slots.events, slots.quakes, slots.launch, slots.reading, slots.history,
    note("Top stories and what people are reading from Wikipedia (chosen by its editors, updated through the day); headlines from GDELT, which watches news sites worldwide; natural events from NASA's EONET; earthquakes from the USGS; launches from The Space Devs. Headlines link to the original reporting."));

  const pinList: Pin[] = [];
  const addPins = (more: Pin[]) => { pinList.push(...more); drawPins(app, pinList); };
  const fail = (slot: HTMLElement, what: string) => slot.replaceChildren(h("p", { class: "muted small" }, `Couldn't reach ${what} just now.`));
  const section = (slot: HTMLElement, title: string, ...content: (Node | string)[]) => slot.replaceChildren(h("h2", { class: "group-title" }, title), ...content);

  void worldStories().then(({ stories, reading, onThisDay }) => {
    stamp.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    slots.stories.replaceChildren(...(stories.length ? stories.slice(0, 6).map((s, i) => storyCard(app, s, i)) : [h("p", { class: "muted small" }, "No stories posted yet today.")]));
    addPins(stories.filter((s) => s.lon !== undefined).map((s) => ({ lon: s.lon!, lat: s.lat!, title: s.links.find((l) => l.lat !== undefined)?.title ?? "In the news", context: clip(s.text, 140), color: "#ff375f", size: 13 })));
    if (reading.length) section(slots.reading, "What the world is reading today", h("div", { class: "list" }, ...reading.slice(0, 8).map((r) =>
      h("button", { class: "list-row", onclick: () => (r.lat !== undefined ? goTo(app, r.lon!, r.lat, r.title, r.about ?? "Most read on Wikipedia today", 150_000) : open(r.url)) },
        h("span", { class: "wn-rank" }, String(r.rank)),
        r.image ? h("img", { class: "tp-thumb", src: r.image, alt: "", loading: "lazy" }) : "",
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, r.title), h("span", { class: "list-sub" }, [r.about, reads(r.views)].filter(Boolean).join(" · "))),
        h("span", { class: "chev", html: "&rsaquo;" })))));
    if (onThisDay.length) section(slots.history, "On this day", h("div", { class: "list" }, ...onThisDay.slice(0, 4).map((e) =>
      h("button", { class: "list-row" + (e.link?.url ? "" : " static"), onclick: () => (e.link?.lat !== undefined ? goTo(app, e.link.lon!, e.link.lat, e.link.title, `${e.year}: ${clip(e.text, 120)}`, 300_000) : open(e.link?.url)) },
        h("span", { class: "wn-year" }, String(e.year)),
        h("span", { class: "list-text" }, h("span", { class: "list-sub wn-history" }, e.text))))));
  }).catch(() => fail(slots.stories, "Wikipedia's news"));

  void wireHeadlines().then((list) => {
    if (list.length) section(slots.wires, "Latest headlines", h("div", { class: "list" }, ...list.slice(0, 8).map(headlineRow)));
  }).catch(() => fail(slots.wires, "the news services"));

  void naturalEvents().then((events) => {
    if (!events.length) return;
    section(slots.events, `Natural events going on · ${events.length}`, eventsBlock(app, events));
    addPins(events.slice(0, 400).map((e) => ({ lon: e.lon, lat: e.lat, title: e.title, context: `${EVENT_LOOK[e.kind].label} · NASA EONET`, color: EVENT_LOOK[e.kind].color, size: e.kind === "wildfires" ? 7 : 10 })));
  }).catch(() => fail(slots.events, "NASA's natural events"));

  void recentQuakes().then((qs: Quake[]) => {
    const big = qs.filter((q) => Date.now() - q.time < 7 * 86_400_000).sort((a, b) => b.mag - a.mag).slice(0, 4);
    if (!big.length) return;
    section(slots.quakes, "Strongest earthquakes this week", h("div", { class: "list" }, ...big.map((q) =>
      h("button", { class: "list-row", onclick: () => goTo(app, q.lon, q.lat, `Magnitude ${q.mag.toFixed(1)} earthquake`, q.place, 300_000) },
        h("span", { class: "wn-mag" }, q.mag.toFixed(1)),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, q.place), h("span", { class: "list-sub" }, `${ago(q.time)} · ${Math.round(q.depthKm)} km deep`)),
        h("span", { class: "chev", html: "&rsaquo;" })))));
    addPins(big.map((q) => ({ lon: q.lon, lat: q.lat, title: `Magnitude ${q.mag.toFixed(1)} earthquake`, context: q.place, color: "#ff9500", size: 8 + q.mag })));
  }).catch(() => {});

  void upcoming().then((ls: Launch[]) => {
    const next = ls.filter((l) => l.net > Date.now()).sort((a, b) => a.net - b.net)[0];
    if (!next) return;
    section(slots.launch, "Next launch", h("div", { class: "list" },
      h("button", { class: "list-row", onclick: () => goTo(app, next.lon, next.lat, next.pad, `${next.rocket} · ${next.name}`, 30_000) },
        h("span", { class: "story-mini-emoji" }, "🚀"),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, next.name), h("span", { class: "list-sub" }, `${next.location} · ${countdown(next.net)}`)),
        h("span", { class: "chev", html: "&rsaquo;" }))));
  }).catch(() => {});
}

/** The top story, for a one-line teaser elsewhere (the opening pulse, the Overview card). */
export async function leadStory(): Promise<Story | null> {
  const { stories } = await worldStories();
  return stories[0] ?? null;
}
