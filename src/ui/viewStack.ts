// The stack of views: everything on the map as a column of small bubbles at the
// edge of the globe, and a + to add more without leaving the view you've built.
//   Tap a bubble: hide it for a moment (it stays in the stack) or bring it back.
//   Hover it, or press and hold on a phone: its name, pin (keep it in every
//     theme and for every place), take it off; analysis layers add opacity and
//     a legend.
//   +: a small sheet beside the stack. Search ("wind", "railways",
//     "volcanoes") or browse the shelves; each row switches its view on or off
//     right there, so you can stack several in a row. The camera never moves
//     and no panel opens.
import type { App } from "../app";
import type { OverlayKind } from "../globe/viewer";
import { h } from "./dom";
import type { Thing } from "./frontDoor";
import { iconSvg } from "./glyph";
import { icons } from "./icons";
import { legendFor } from "./layers";
import { initial, matchViews, shelfOrder, stackable, viewGlyph } from "./viewStackModel";

const HOLD_MS = 450;

export function createViewStack(app: App, things: () => Thing[]): HTMLElement {
  const col = h("div", { class: "vs-col" });
  const addBtn = h("button", { class: "vs-add", "aria-label": "Add a view to the map", title: "Add a view", "aria-expanded": "false", html: plus }) as HTMLButtonElement;
  const sheet = h("div", { class: "vs-sheet", role: "dialog", "aria-label": "Add a view", hidden: true });
  const root = h("div", { class: "vs", role: "region", "aria-label": "Views on the map" }, col, addBtn, sheet);
  const els = new Map<string, HTMLElement>();
  let openCard: HTMLElement | null = null;

  const closeCard = () => { openCard?.classList.remove("open"); openCard = null; };
  const glyphOf = (emoji: string, name: string) => (emoji ? iconSvg(emoji, 18) : null) ?? `<span class="vs-initial">${emoji || initial(name)}</span>`;

  /** One bubble, with its card. */
  function bubble(id: string): HTMLElement {
    const bub = h("button", { class: "vs-bub" }) as HTMLButtonElement;
    const name = h("strong", {}), note = h("small", {});
    const eye = h("button", { class: "vs-act" }) as HTMLButtonElement;
    const pin = h("button", { class: "vs-act", html: icons.pin }) as HTMLButtonElement;
    const x = h("button", { class: "vs-act", "aria-label": "Take it off the map", title: "Take it off the map", html: icons.close });
    const extra = h("div", { class: "vs-extra" });
    const card = h("div", { class: "vs-card" }, h("div", { class: "vs-card-head" }, h("span", { class: "vs-card-text" }, name, note), eye, pin, x), extra);
    const item = h("div", { class: "vs-item vs-new", "data-id": id }, bub, card);
    item.addEventListener("animationend", () => item.classList.remove("vs-new"), { once: true });

    // Tap: hide or show. Hold (touch): open the card instead.
    let held = false, timer = 0;
    bub.addEventListener("pointerdown", (e) => {
      held = false;
      if (e.pointerType !== "mouse") timer = window.setTimeout(() => { held = true; closeCard(); item.classList.add("open"); openCard = item; navigator.vibrate?.(12); }, HOLD_MS);
    });
    const cancel = () => clearTimeout(timer);
    bub.addEventListener("pointerup", cancel);
    bub.addEventListener("pointerleave", cancel);
    bub.addEventListener("click", () => {
      if (held) { held = false; return; }
      const it = app.canvas.listed().find((i) => i.id === id);
      if (!it) return;
      app.canvas.setOff(id, !it.off);
      item.classList.add("flash");
      setTimeout(() => item.classList.remove("flash"), 1400);
    });
    bub.addEventListener("contextmenu", (e) => e.preventDefault());
    eye.addEventListener("click", () => { const it = app.canvas.listed().find((i) => i.id === id); if (it) app.canvas.setOff(id, !it.off); });
    pin.addEventListener("click", () => { const it = app.canvas.listed().find((i) => i.id === id); if (it) app.canvas.setPinned(id, !it.pinned); });
    x.addEventListener("click", () => { closeCard(); item.classList.add("vs-gone"); setTimeout(() => app.canvas.remove(id), 180); });

    // Analysis layers drawn by the globe: their opacity and legend live on the card.
    if (id.startsWith("globe:")) {
      const kind = id.slice(6) as OverlayKind, st = app.globe.state.overlays[kind];
      if (st) {
        const range = h("input", { type: "range", min: 0.1, max: 1, step: 0.05, value: st.opacity, "aria-label": "Opacity", oninput: (e: Event) => { st.opacity = Number((e.target as HTMLInputElement).value); app.globe.apply(); } });
        extra.append(h("label", { class: "vs-opacity" }, h("span", {}, "Opacity"), range));
        const legend = legendFor(kind, app.globe);
        if (legend) extra.append(legend);
      }
    }
    (item as HTMLElement & { update?: (it: ReturnType<typeof app.canvas.listed>[number]) => void }).update = (it) => {
      const g = viewGlyph(it.id, it.label);
      item.style.setProperty("--c", it.color);
      item.classList.toggle("off", it.off);
      item.classList.toggle("pinned", it.pinned);
      bub.innerHTML = glyphOf(g.emoji, g.name);
      bub.setAttribute("aria-pressed", String(!it.off));
      bub.setAttribute("aria-label", `${g.name}: ${it.off ? "hidden. Tap to show" : "on. Tap to hide"}`);
      bub.title = "";
      name.textContent = g.name;
      note.textContent = it.off ? "Hidden for now" : it.scope === "place" ? "About the chosen place" : it.pinned ? "Kept in every view" : "In this theme";
      eye.innerHTML = it.off ? icons.eye : eyeOff;
      eye.setAttribute("aria-label", it.off ? "Show" : "Hide");
      eye.title = it.off ? "Show" : "Hide for now";
      pin.setAttribute("aria-pressed", String(it.pinned));
      pin.setAttribute("aria-label", it.pinned ? "Unpin" : "Pin");
      pin.title = it.pinned ? "Pinned: kept in every theme and for every place" : "Pin: keep it in every theme and for every place";
    };
    return item;
  }

  /** Keeps the column in step with the canvas, element by element (so hover and animations survive). */
  function draw() {
    const items = app.canvas.listed();
    const ids = new Set(items.map((i) => i.id));
    for (const [id, el] of els) if (!ids.has(id)) { el.remove(); els.delete(id); }
    for (const it of items) {
      let el = els.get(it.id);
      if (!el) { el = bubble(it.id); els.set(it.id, el); }
      (el as HTMLElement & { update: (x: typeof it) => void }).update(it);
      col.append(el); // keeps canvas order
    }
    root.classList.toggle("empty", !items.length);
    if (!sheet.hidden) refreshRows();
  }

  // ---- Add a view ----
  const ask = h("input", { class: "vs-ask", type: "search", placeholder: "Wind, railways, volcanoes…", "aria-label": "Search views", enterkeyhint: "go" }) as HTMLInputElement;
  const list = h("div", { class: "vs-list" });
  sheet.append(
    h("header", { class: "vs-sheet-head" }, h("strong", {}, "Add a view"), h("small", {}, "Stack as many as you like. The globe stays where it is."),
      h("button", { class: "vs-x", "aria-label": "Close", html: icons.close, onclick: () => toggleSheet(false) })),
    h("div", { class: "vs-ask-wrap" }, h("span", { html: icons.search }), ask), list);
  let shelf: string | null = null;
  const rows = new Map<Thing, HTMLElement>();
  const row = (t: Thing) => {
    const sw = h("span", { class: "vs-switch", "aria-hidden": "true" });
    const r = h("button", { class: "vs-row", role: "switch" },
      h("span", { class: "vs-row-glyph", html: iconSvg(t.emoji, 18) ?? t.emoji }),
      h("span", { class: "vs-row-text" }, h("strong", {}, t.title), h("small", {}, t.detail)), sw);
    r.addEventListener("click", () => {
      const on = !!t.on?.();
      if (on) t.off?.(); else t.run();
      r.setAttribute("aria-checked", String(!on));
      setTimeout(refreshRows, 400);
    });
    rows.set(t, r);
    return r;
  };
  function refreshRows() { for (const [t, r] of rows) { r.setAttribute("aria-checked", String(!!t.on?.())); r.classList.toggle("locked", !!t.on?.() && !t.off); } }
  function fill() {
    rows.clear();
    const all = things(), q = ask.value.trim();
    if (q) {
      const hits = matchViews(all, q).slice(0, 12);
      list.replaceChildren(...(hits.length ? hits.map(row) : [h("p", { class: "vs-none" }, "No view by that name. Try “rain”, “ships” or “rocks”.")]));
    } else {
      const theme = app.theme?.label;
      const { first, more } = shelfOrder(all, theme);
      const shelves = shelf ? [shelf] : first;
      list.replaceChildren(
        ...(shelf ? [h("button", { class: "link-btn vs-back", onclick: () => { shelf = null; fill(); } }, "‹ All views")] : []),
        ...shelves.map((s) => h("section", { class: "vs-shelf" },
          h("h4", {}, s === theme && !shelf ? `${s}: this theme` : s),
          ...stackable(all).filter((t) => t.shelf === s).map(row))),
        ...(!shelf && more.length ? [h("section", { class: "vs-shelf" }, h("h4", {}, "More shelves"),
          h("div", { class: "vs-chips" }, ...more.map((s) => h("button", { class: "vs-chip", onclick: () => { shelf = s; fill(); list.scrollTop = 0; } }, s))))] : []));
    }
    refreshRows();
  }
  ask.addEventListener("input", () => { shelf = null; fill(); });
  ask.addEventListener("keydown", (e) => {
    if (e.key === "Enter") (list.querySelector(".vs-row") as HTMLElement | null)?.click();
    if (e.key === "Escape") toggleSheet(false);
  });
  function toggleSheet(open = sheet.hidden) {
    sheet.hidden = !open;
    addBtn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("adding", open);
    if (open) { ask.value = ""; shelf = null; fill(); requestAnimationFrame(() => ask.focus({ preventScroll: true })); }
  }
  addBtn.addEventListener("click", () => toggleSheet());
  // A tap anywhere else puts the sheet and any open card away.
  document.addEventListener("pointerdown", (e) => {
    if (root.contains(e.target as Node)) return;
    closeCard();
    if (!sheet.hidden) toggleSheet(false);
  });
  addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Escape") { closeCard(); if (!sheet.hidden) toggleSheet(false); } });
  // "Add a view" from elsewhere (the Layers popover).
  addEventListener("atlas:add-view", () => toggleSheet(true));

  app.canvas.subscribe(draw);
  draw();
  return root;
}

const plus = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
const eyeOff = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20L20 4"/></svg>`;
