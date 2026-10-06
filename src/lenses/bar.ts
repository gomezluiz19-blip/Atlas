// The lens strip in the place card: what Terreno thinks you tapped, and the
// lenses that suit it, best first. Opening a lens gives it a panel; opening
// another (or choosing a new place) closes the last one and tidies up.
import type { App, Place } from "../app";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { identify } from "./identify";
import { venueOfPlace } from "../place/venue";
import { factLine, factsFor } from "./facts";
import { FAMILY, lensOrder, lookOf } from "./glyphs";
import { KIND_LABEL, type Lens, type LensHost, type Subject, type SubjectKind } from "./types";

const KIND_ICON: Record<SubjectKind, string> = {
  peak: "⛰️", volcano: "🌋", range: "🏔️", crater: "🕳️", canyon: "🏜️", river: "🏞️", lake: "💧", sea: "🌊", coast: "🏖️",
  glacier: "🧊", forest: "🌲", desert: "🐪", island: "🏝️", city: "🏙️", land: "🗺️",
};

export function createLenses(app: App, lenses: Lens[]) {
  const strip = h("div", { class: "lens-strip", hidden: true });
  const panel = h("section", { class: "lens-panel", hidden: true, role: "dialog", "aria-label": "Lens" });
  const titleEl = h("h2", {}), subEl = h("p", { class: "muted small" });
  const body = h("div", { class: "lens-body" });
  let cleanups: (() => void)[] = [];
  let subject: Subject | null = null;
  let active: Lens | null = null;
  let job = 0;
  let pending: Promise<void> = Promise.resolve();

  const close = () => {
    for (const f of cleanups.splice(0)) { try { f(); } catch { /* keep closing */ } }
    panel.hidden = true;
    active = null;
    render();
  };
  panel.append(
    h("div", { class: "lens-head" }, h("div", {}, titleEl, subEl), h("button", { class: "icon-btn", "aria-label": "Close lens", html: icons.close, onclick: close })),
    body);

  const open = async (lens: Lens, s = subject) => {
    if (!s) return;
    close();
    active = lens;
    render();
    panel.hidden = false;
    body.replaceChildren(h("p", { class: "muted small" }, "Opening…"));
    const host: LensHost = {
      app, body,
      title: (t, sub) => {
        const look = lookOf(lens);
        titleEl.replaceChildren(look.glyph ? h("span", { class: "lens-title-glyph", style: `--c:${FAMILY[look.family].color}`, html: look.glyph }) : `${lens.icon} `, t);
        subEl.textContent = sub ?? "";
      },
      onClose: (fn) => cleanups.push(fn),
      close,
    };
    host.title(lookOf(lens).name, s.name);
    try {
      await lens.open(host, s);
    } catch (e) {
      body.replaceChildren(h("p", { class: "pro-warn" }, `This lens hit a problem: ${(e as Error).message}`));
    }
  };

  // Every lens that suits this feature, in a fixed order by family (not by score, so the strip
  // reads the same on every mountain or city).
  // The ones that really suit it show; weaker fits wait behind "More".
  let showAll = false;
  const suited = () => {
    if (!subject) return { main: [] as Lens[], rest: [] as Lens[] };
    const scored = lenses.map((l) => ({ l, s: l.score(subject!) })).filter((x) => x.s > 0);
    // At most four views up front (the best fits, plus the open one): a strip to choose from, not a toolbox.
    const best = scored.filter((x) => x.s >= 0.55).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.l);
    if (active && !best.includes(active)) best.push(active);
    const main = best.sort(lensOrder);
    const rest = scored.filter((x) => !main.includes(x.l)).map((x) => x.l).sort(lensOrder);
    return { main, rest };
  };
  const render = () => {
    if (!subject) return;
    const fact = factsFor(subject);
    const { main, rest } = suited();
    const list = showAll ? [...main, ...rest] : main;
    const hint = h("p", { class: "lens-hint" }, "Tap a view to see it differently");
    const say = (text: string) => () => (hint.textContent = text);
    const reset = say(active ? `${lookOf(active).name}: ${lookOf(active).hint}` : "Tap a view to see it differently");
    let lastFamily = "";
    const tiles = list.map((l) => {
      const look = lookOf(l), fam = FAMILY[look.family];
      const gap = lastFamily && lastFamily !== look.family ? " gap" : "";
      lastFamily = look.family;
      return h("button", {
        class: `lens-tile${active === l ? " on" : ""}${gap}`, style: `--c:${fam.color}`, title: `${look.name}: ${look.hint}`, "aria-pressed": String(active === l),
        onmouseenter: say(`${look.name}: ${look.hint}`), onfocus: say(`${look.name}: ${look.hint}`), onmouseleave: reset, onblur: reset,
        onclick: () => void (active === l ? close() : open(l)),
      }, look.glyph ? h("span", { class: "lens-glyph", html: look.glyph }) : h("span", { class: "lens-glyph emoji" }, l.icon), h("span", { class: "lens-name" }, look.name));
    });
    reset();
    strip.replaceChildren(
      h("div", { class: "lens-kind" }, h("span", {}, KIND_ICON[subject.kind]), h("span", {}, h("strong", {}, KIND_LABEL[subject.kind]), h("small", {}, "See it differently"))),
      // The feature's facts, unless the card is already this feature's own page.
      fact && fact.name !== app.place?.name?.title ? factLine(fact) : "",
      h("div", { class: "lens-row" }, ...tiles,
        rest.length && !showAll ? h("button", { class: "lens-tile make gap", style: `--c:#8c8f87`, title: "Views that suit it less", onmouseenter: say(`${rest.length} more views: ${rest.map((l) => lookOf(l).name).join(", ")}`), onmouseleave: reset, onclick: () => { showAll = true; render(); } },
          h("span", { class: "lens-glyph" }, `+${rest.length}`), h("span", { class: "lens-name" }, "More")) : "",
        h("button", { class: "lens-tile make gap", style: `--c:${FAMILY.yours.color}`, title: "Describe a view and Terreno builds it", onmouseenter: say("Make your own: describe a view and Terreno builds it"), onmouseleave: reset, onclick: () => app.actions.get("lens:studio")?.run() },
          h("span", { class: "lens-glyph", html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' }), h("span", { class: "lens-name" }, "Make one"))),
      hint);
  };

  const update = (p: Place | null) => (pending = identifyPlace(p));
  const identifyPlace = async (p: Place | null) => {
    const my = ++job;
    close();
    // No place, or a venue (a school, a shop, an address): the planet's views of the ground don't suit it.
    if (!p || venueOfPlace(p)) { subject = null; strip.hidden = true; return; }
    strip.hidden = false;
    showAll = false;
    strip.replaceChildren(h("div", { class: "lens-kind" }, h("span", { class: "spinner small" }), h("span", {}, h("small", {}, "Working out what this is…"))));
    const s = await identify(p).catch(() => null);
    if (my !== job || !s) return;
    subject = s;
    render();
  };

  // Keep the name fresh once reverse geocoding answers.
  const rename = (p: Place | null) => { if (subject && p?.name?.title && subject.lon === p.lon && subject.lat === p.lat) { subject.name = p.name.title; render(); } };

  return {
    strip, panel, update, rename, close,
    /** Lenses were added or removed: redraw the chips. */
    refresh() { if (subject) render(); },
    get subject() { return subject; },
    /** Opens a lens by id on the current subject (for the task robot and links). */
    openById(id: string) { const l = lenses.find((x) => x.id === id); if (l && subject) void open(l); return !!(l && subject); },
    /** Waits for the current place to be identified, then opens a lens (false if it can't). */
    async openWhenReady(id: string) { await pending; return this.openById(id); },
    /** Opens a lens on a given subject. */
    openOn(id: string, s: Subject) { const l = lenses.find((x) => x.id === id); if (l) { subject = s; void open(l, s); } },
  };
}
