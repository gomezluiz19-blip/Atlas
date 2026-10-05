// Guides: some of a person's places, in order, with what to do at each.
// Playing one draws the route on the globe, numbers the stops, and flies from
// each to the next with the words beside it; it plays itself, or you step
// through. Guides live on their author's page and share as links.
import { ArcType, Cartesian3, Color, HeightReference, VerticalOrigin, type Entity } from "cesium";
import type { App } from "../app";
import { pushGuide } from "../cloud/sync";
import { h } from "../ui/dom";
import { canvasUrl } from "../ui/canvasUrl";
import { icons } from "../ui/icons";
import { flyToPlace } from "../ui/search";
import { avatarEl } from "./account";
import { SPOT_KINDS, type Guide, type Profile, type Spot } from "./model";

const newId = () => Math.random().toString(36).slice(2, 10);
const stopsOf = (p: Profile, g: Guide) => g.stops.map((st) => ({ st, spot: p.spots.find((x) => x.id === st.spot) })).filter((x): x is { st: Guide["stops"][number]; spot: Spot } => !!x.spot);

const numberPin = (n: number, color: string) => canvasUrl(`gd|${n}|${color}`, () => {
  const c = document.createElement("canvas");
  c.width = 52; c.height = 52;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 6; g.shadowOffsetY = 2;
  g.beginPath(); g.arc(26, 26, 20, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  g.shadowColor = "transparent";
  g.lineWidth = 3.5; g.strokeStyle = "#fff"; g.stroke();
  g.fillStyle = "#fff"; g.font = "700 20px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(String(n), 26, 27);
  return c;
});

/** Plays a guide on the globe. Returns a function that stops it. */
export function playGuide(app: App, p: Profile, g: Guide, opts: { color: string; onClose(): void; onShare(): void }): () => void {
  const viewer = app.globe.viewer;
  const stops = stopsOf(p, g);
  const drawn: Entity[] = [];
  drawn.push(viewer.entities.add({ polyline: { positions: stops.map((x) => Cartesian3.fromDegrees(x.spot.lon, x.spot.lat)), width: 4, arcType: ArcType.GEODESIC, clampToGround: stops.every((x, i) => i === 0 || Math.hypot(x.spot.lon - stops[i - 1].spot.lon, x.spot.lat - stops[i - 1].spot.lat) < 3), material: Color.fromCssColorString(opts.color).withAlpha(0.85) } }));
  let stopped = false;
  void Promise.all(stops.map((_, i) => numberPin(i + 1, opts.color))).then((imgs) => {
    if (stopped) return;
    stops.forEach((x, i) => drawn.push(viewer.entities.add({ position: Cartesian3.fromDegrees(x.spot.lon, x.spot.lat), billboard: { image: imgs[i], scale: 0.6, verticalOrigin: VerticalOrigin.CENTER, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } })));
    viewer.scene.requestRender();
  });
  viewer.scene.requestRender();

  let i = 0, playing = false, timer = 0;
  const card = h("section", { class: "gd-player", style: `--gc:${opts.color}`, role: "dialog", "aria-label": g.title });
  (document.getElementById("ui") ?? document.body).append(card);
  const go = (k: number) => {
    i = Math.max(0, Math.min(stops.length - 1, k));
    const { st, spot } = stops[i];
    void flyToPlace(app.globe, { name: spot.name, lon: spot.lon, lat: spot.lat, radius: 700 });
    render();
    clearTimeout(timer);
    if (playing) timer = window.setTimeout(() => (i < stops.length - 1 ? go(i + 1) : setPlaying(false)), 9000 + st.note.length * 25);
  };
  const setPlaying = (on: boolean) => { playing = on; clearTimeout(timer); if (on) go(i); else render(); };
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    for (const e of drawn) viewer.entities.remove(e);
    viewer.scene.requestRender();
    card.remove();
    removeEventListener("keydown", keys);
  };
  const keys = (e: KeyboardEvent) => { if (e.key === "ArrowRight") go(i + 1); else if (e.key === "ArrowLeft") go(i - 1); else if (e.key === "Escape") { stop(); opts.onClose(); } };
  addEventListener("keydown", keys);
  function render() {
    const { st, spot } = stops[i];
    card.replaceChildren(
      h("div", { class: "gd-top" },
        avatarEl(p, 26),
        h("span", { class: "gd-title" }, h("strong", {}, g.title), h("small", {}, `A guide by ${p.name}`)),
        h("button", { class: "icon-btn", "aria-label": "Share this guide", html: icons.share, onclick: opts.onShare }),
        h("button", { class: "icon-btn", "aria-label": "Close the guide", html: icons.close, onclick: () => { stop(); opts.onClose(); } })),
      h("div", { class: "gd-dots" }, ...stops.map((_, k) => h("button", { class: k === i ? "on" : k < i ? "done" : "", "aria-label": `Stop ${k + 1}`, onclick: () => go(k) }))),
      h("div", { class: "gd-stop" },
        h("span", { class: "gd-num" }, String(i + 1)),
        h("div", {},
          h("small", {}, [st.time, `${SPOT_KINDS[spot.kind].emoji} ${SPOT_KINDS[spot.kind].label}`].filter(Boolean).join(" · ")),
          h("h3", {}, spot.name),
          h("p", {}, st.note || spot.note || ""))),
      h("div", { class: "gd-controls" },
        h("button", { class: "pill-btn", disabled: i === 0, onclick: () => go(i - 1) }, "Back"),
        h("button", { class: "gd-play", "aria-label": playing ? "Pause" : "Play", onclick: () => setPlaying(!playing) }, playing ? "❚❚" : "▶"),
        i < stops.length - 1 ? h("button", { class: "primary-btn", onclick: () => go(i + 1) }, "Next") : h("button", { class: "primary-btn", onclick: () => { stop(); opts.onClose(); } }, "Done")));
  }
  go(0);
  return stop;
}

/** The guides on someone's page. */
export function guideCards(p: Profile, own: boolean, editing: boolean, act: { play(g: Guide): void; edit(g: Guide | null): void; aerial(lon: number, lat: number): string }): HTMLElement | string {
  const gs = p.guides ?? [];
  if (!gs.length && !own) return "";
  const first = p.name.split(" ")[0];
  return h("section", { class: "pf-card" },
    h("h2", {}, own ? "My guides" : `${first}'s guides`),
    ...gs.map((g) => {
      const stops = stopsOf(p, g);
      const cover = stops[0]?.spot;
      return h("div", { class: "gd-card" },
        h("button", { class: "gd-card-main", onclick: () => act.play(g) },
          h("span", { class: "gd-cover" }, ...stops.slice(0, 3).map((x) => h("img", { src: act.aerial(x.spot.lon, x.spot.lat), alt: "", loading: "lazy" })), cover ? "" : h("i", {}, "🗺️")),
          h("span", { class: "gd-card-text" }, h("strong", {}, g.title), h("small", {}, g.blurb), h("em", {}, `${stops.length} stops · ▶ Play`))),
        own && editing ? h("button", { class: "link-btn", onclick: () => act.edit(g) }, "Edit") : "");
    }),
    own ? h("button", { class: "pf-btn", onclick: () => act.edit(null) }, p.spots.length >= 2 ? "🧭  Make a guide from your places" : "🧭  Add two or more places to make a guide") : "");
}

/** Making or changing a guide from your own places. */
export function guideEditor(p: Profile, g: Guide | null, done: (g: Guide | null, removed?: boolean) => void): HTMLElement {
  const draft: Guide = g ? structuredClone(g) : { id: newId(), title: "", blurb: "", stops: p.top.slice(0, 5).map((id) => ({ spot: id, note: "" })), updated: "" };
  const box = h("section", { class: "pf-card gd-edit" });
  const render = () => {
    const title = h("input", { class: "pf-input", value: draft.title, placeholder: "A title (“Lisbon in a day”)", "aria-label": "Guide title", oninput: (e: Event) => (draft.title = (e.target as HTMLInputElement).value) });
    const blurb = h("textarea", { class: "pf-input", rows: 2, placeholder: "One or two lines: who it's for, what it's like", "aria-label": "About the guide", oninput: (e: Event) => (draft.blurb = (e.target as HTMLTextAreaElement).value) }, draft.blurb);
    const unused = p.spots.filter((s) => !draft.stops.some((x) => x.spot === s.id));
    const add = h("select", { class: "pf-input", "aria-label": "Add a stop", onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; if (v) { draft.stops.push({ spot: v, note: "" }); render(); } } },
      h("option", { value: "" }, unused.length ? "Add a stop…" : "All your places are in it"), ...unused.map((s) => h("option", { value: s.id }, `${SPOT_KINDS[s.kind].emoji} ${s.name}`)));
    box.replaceChildren(
      h("h2", {}, g ? "Edit guide" : "New guide"),
      title, blurb,
      h("ol", { class: "gd-stops" }, ...draft.stops.map((st, k) => {
        const s = p.spots.find((x) => x.id === st.spot);
        return h("li", {},
          h("div", { class: "gd-stop-head" },
            h("span", { class: "gd-num" }, String(k + 1)), h("strong", {}, s ? `${SPOT_KINDS[s.kind].emoji} ${s.name}` : "?"),
            h("input", { class: "pf-input gd-time", value: st.time ?? "", placeholder: "When", "aria-label": "When", oninput: (e: Event) => (st.time = (e.target as HTMLInputElement).value || undefined) }),
            k > 0 ? h("button", { class: "icon-btn", "aria-label": "Move up", onclick: () => { draft.stops.splice(k - 1, 0, draft.stops.splice(k, 1)[0]); render(); } }, "↑") : "",
            h("button", { class: "icon-btn", "aria-label": "Remove", html: icons.close, onclick: () => { draft.stops.splice(k, 1); render(); } })),
          h("textarea", { class: "pf-input", rows: 2, placeholder: "What to do here, and why", "aria-label": `Note for stop ${k + 1}`, oninput: (e: Event) => (st.note = (e.target as HTMLTextAreaElement).value) }, st.note));
      })),
      add,
      h("div", { class: "pf-row" },
        h("button", { class: "pf-btn primary", onclick: () => {
          if (!draft.title.trim()) { (box.querySelector("input") as HTMLInputElement).focus(); return; }
          if (draft.stops.length < 2) return;
          draft.title = draft.title.trim(); draft.blurb = draft.blurb.trim(); draft.updated = new Date().toISOString().slice(0, 10);
          done(draft);
        } }, "Save guide"),
        h("button", { class: "pf-btn", onclick: () => done(null) }, "Cancel"),
        g ? h("button", { class: "link-btn danger", onclick: () => done(g, true) }, "Delete") : ""));
  };
  render();
  return box;
}

/** Publishes a guide (with its places) for discovery, when the servers are on. */
export function publishGuide(p: Profile, g: Guide) {
  const stops = stopsOf(p, g).map(({ st, spot }) => ({ ...st, name: spot.name, kind: spot.kind, lon: spot.lon, lat: spot.lat }));
  void pushGuide({ ...g, author: p.handle, stops } as unknown as { id: string; stops: { lon: number; lat: number }[] }).catch(() => {});
}
