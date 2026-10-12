// A stage: how each of the dock's buttons opens. The whole map bubble becomes a sheet of paper with a small mark
// at the top, four big playful icons composed across the middle (Bauhaus shapes, no tiles), and a small field at
// the bottom. The person picks what they want first; the details come after. See docs/design.md › The frame.
import { ART } from "./bauhaus";
import { h } from "./dom";

export interface StageItem { id: string; label: string; art: string; run(): void }

/** The four icons, laid out as a composition (CSS places each slot), the chosen one marked. */
export function stageArt(items: StageItem[], chosen?: string | null): HTMLElement {
  return h("div", { class: "stage-art", role: "group" }, ...items.slice(0, 4).map((it, i) =>
    h("button", { class: "bh", "data-id": it.id, "aria-pressed": chosen === undefined ? undefined : String(chosen === it.id), style: `--i:${i}`, onclick: () => it.run() },
      h("span", { class: "bh-art", html: ART[it.art] ?? ART.more }), h("span", { class: "bh-label" }, it.label))));
}

/** Marks which icon is chosen, without redrawing. */
export function choose(art: HTMLElement, id: string) {
  art.querySelectorAll<HTMLElement>(".bh").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
}

/** A whole stage: the small mark on top, the icons, anything extra, and the field at the bottom. */
export function stageView(o: { mark: string; title: string; art: HTMLElement; extra?: (HTMLElement | "")[]; field?: HTMLElement; close(): void }): (HTMLElement | "")[] {
  return [
    h("div", { class: "stage-top" },
      h("button", { class: "stage-close", "aria-label": "Close", html: "&times;", onclick: () => o.close() }),
      h("div", { class: "stage-mark" }, h("span", { class: "stage-mark-art", html: ART[o.mark] ?? ART.more }), h("span", {}, o.title))),
    o.art,
    h("div", { class: "stage-extra" }, ...(o.extra ?? [])),
    o.field ? h("div", { class: "stage-field" }, o.field) : "",
  ];
}

/** A small text-only row of more choices ("Bike · Fly · Guide me"). */
export function stageMore(items: { label: string; run(): void; on?: boolean }[]): HTMLElement {
  return h("div", { class: "stage-more" }, ...items.map((x) => h("button", { class: "stage-more-btn", "aria-pressed": x.on === undefined ? undefined : String(x.on), onclick: () => x.run() }, x.label)));
}
