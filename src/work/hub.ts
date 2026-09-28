// Work mode: tools for doing things with the map, open to everyone. Plan (trips,
// events, business, policy, infrastructure), Present (slides and tours),
// Video (record the map with captions and narration) and Grow (fields and crops).
import type { App } from "../app";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";

export interface WorkCtx {
  app: App;
  /** Replaces the panel with a titled screen; `back` returns to the previous one. */
  show(title: string, back: (() => void) | null, ...content: (Node | string)[]): void;
  home(): void;
  /** Tucks the panel away while drawing on the map, and brings it back. */
  hide(): void;
  unhide(): void;
  /** Opens the panel (as it is) if closed. */
  open(): void;
  close(): void;
}

export interface WorkTool {
  id: string;
  label: string;
  about: string;
  color: string;
  icon: string;
  open(ctx: WorkCtx): void;
}

export interface HubOptions {
  /** The hub's name, shown on its home screen. */
  title?: string;
  intro?: string;
  /** Extra content above the tools on the home screen (rebuilt each time). */
  top?: () => (Node | string)[];
  /** Extra content below the tools. */
  bottom?: () => (Node | string)[];
  /** Called whenever the panel closes. */
  onClose?: () => void;
}

export function createWork(app: App, tools: WorkTool[], opts: HubOptions = {}) {
  const title = opts.title ?? "Work";
  const button = h("button", { id: `${title.toLowerCase().replace(/\W+/g, "-")}-btn`, class: "round-btn", "aria-label": title, title, "aria-expanded": "false", html: icons.briefcase }) as HTMLButtonElement;
  const panel = h("div", { class: "popover work-panel", hidden: true, role: "dialog", "aria-label": title });

  const ctx: WorkCtx = {
    app,
    show(title, back, ...content) {
      panel.replaceChildren(
        h("div", { class: "mp-head" },
          back ? h("button", { class: "link-btn", onclick: back }, "‹ Back") : h("h2", {}, title),
          h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => ctx.close() })),
        back ? h("h2", { class: "work-title" }, title) : "",
        ...content);
      panel.scrollTop = 0;
    },
    home() {
      ctx.show(title, null,
        h("p", { class: "mp-intro" }, opts.intro ?? "Put the map to work: plan a trip or a new road, present a place's story, record a video, or look after a field."),
        ...(opts.top?.() ?? []),
        h("div", { class: "work-tools" }, ...tools.map((t) =>
          h("button", { class: "work-tool", style: `--c:${t.color}`, onclick: () => t.open(ctx) },
            h("span", { class: "work-tool-icon", html: t.icon }),
            h("span", { class: "work-tool-text" }, h("strong", {}, t.label), h("span", {}, t.about))))),
        ...(opts.bottom?.() ?? []));
    },
    hide() { panel.classList.add("tucked"); },
    unhide() { panel.classList.remove("tucked"); },
    open() {
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      if (!panel.childElementCount) ctx.home();
      button.dispatchEvent(new Event("work:opened"));
    },
    close() {
      const was = !panel.hidden;
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      if (was) opts.onClose?.();
    },
  };
  button.addEventListener("click", () => {
    if (panel.hidden) ctx.open();
    else ctx.close();
  });
  return { button, panel, ctx };
}
