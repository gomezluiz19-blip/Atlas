// The lens strip in the place card: what Atlas thinks you tapped, and the
// lenses that suit it, best first. Opening a lens gives it a panel; opening
// another (or choosing a new place) closes the last one and tidies up.
import type { App, Place } from "../app";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { identify } from "./identify";
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
  let job = 0, showAll = false;
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
      title: (t, sub) => { titleEl.textContent = `${lens.icon} ${t}`; subEl.textContent = sub ?? ""; },
      onClose: (fn) => cleanups.push(fn),
      close,
    };
    host.title(lens.label, s.name);
    try {
      await lens.open(host, s);
    } catch (e) {
      body.replaceChildren(h("p", { class: "pro-warn" }, `This lens hit a problem: ${(e as Error).message}`));
    }
  };

  const ranked = () => subject ? lenses.map((l) => ({ l, score: l.score(subject!) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score) : [];
  const render = () => {
    if (!subject) return;
    const list = ranked();
    const shown = showAll ? list : list.filter((x, i) => i < 6 || x.l === active);
    strip.replaceChildren(
      h("div", { class: "lens-kind" }, h("span", {}, KIND_ICON[subject.kind]), h("span", {}, h("strong", {}, KIND_LABEL[subject.kind]), h("small", {}, "Look at it through a lens"))),
      h("div", { class: "lens-chips" },
        ...shown.map(({ l }) => h("button", { class: "lens-chip" + (active === l ? " on" : ""), title: l.blurb, onclick: () => void (active === l ? close() : open(l)) }, h("span", {}, l.icon), l.label)),
        list.length > shown.length ? h("button", { class: "lens-chip more", onclick: () => { showAll = true; render(); } }, `+${list.length - shown.length}`) : ""));
  };

  const update = (p: Place | null) => (pending = identifyPlace(p));
  const identifyPlace = async (p: Place | null) => {
    const my = ++job;
    close();
    showAll = false;
    if (!p) { subject = null; strip.hidden = true; return; }
    strip.hidden = false;
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
    get subject() { return subject; },
    /** Opens a lens by id on the current subject (for the task robot and links). */
    openById(id: string) { const l = lenses.find((x) => x.id === id); if (l && subject) void open(l); return !!(l && subject); },
    /** Waits for the current place to be identified, then opens a lens (false if it can't). */
    async openWhenReady(id: string) { await pending; return this.openById(id); },
    /** Opens a lens on a given subject. */
    openOn(id: string, s: Subject) { const l = lenses.find((x) => x.id === id); if (l) { subject = s; void open(l, s); } },
  };
}
