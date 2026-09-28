// "On the map": a strip of chips for everything on the shared canvas, from
// any theme. Pin to keep it across themes and places; x to take it off.
import type { App } from "../app";
import { h } from "./dom";
import { icons } from "./icons";

export function createCanvasTray(app: App): HTMLElement {
  const tray = h("div", { class: "canvas-tray", role: "region", "aria-label": "On the map", hidden: true });
  const draw = () => {
    const items = app.canvas.visible();
    tray.hidden = items.length === 0;
    tray.replaceChildren(
      h("span", { class: "tray-title" }, "On the map"),
      ...items.map((it) =>
        h("span", { class: `tray-chip${it.pinned ? " pinned" : ""}`, style: `--c:${it.color}`, title: it.scope === "place" ? "About the chosen place" : "A map layer" },
          h("span", { class: "tray-dot" }),
          h("span", { class: "tray-label" }, it.label),
          h("button", {
            class: "tray-btn", "aria-pressed": String(it.pinned),
            "aria-label": it.pinned ? `Unpin ${it.label}` : `Pin ${it.label}`,
            title: it.pinned ? "Pinned: stays on in every theme and for every place" : "Pin: keep it on in every theme and for every place",
            html: icons.pin,
            onclick: () => app.canvas.setPinned(it.id, !it.pinned),
          }),
          h("button", { class: "tray-btn", "aria-label": `Remove ${it.label}`, title: "Take it off the map", html: icons.close, onclick: () => app.canvas.remove(it.id) }))),
      items.length > 1 ? h("button", { class: "tray-clear", onclick: () => app.canvas.clear() }, "Clear") : "",
    );
  };
  app.canvas.subscribe(draw);
  draw();
  return tray;
}
