// Drawing on the map: tap to add points to a line or area (or one point), with
// Undo / Done / Cancel in a small floating bar and a live preview.
import type { App } from "../app";
import { h } from "../ui/dom";
import type { LonLat } from "./geo";
import { WorkLayer } from "./layer";

/** Taps on the map: one point, a line, an area, or "points" (many separate spots, like trees). */
export function drawOnMap(app: App, kind: "point" | "points" | "line" | "area", color: string, prompt: string): Promise<LonLat[] | null> {
  return new Promise((resolve) => {
    const pts: LonLat[] = [];
    const preview = new WorkLayer(app, "work:preview", "Drawing", color, false);
    const min = kind === "point" || kind === "points" ? 1 : kind === "line" ? 2 : 3;
    const count = h("span", { class: "draw-count" });
    const done = h("button", { class: "primary-btn", onclick: () => finish(true) }, "Done") as HTMLButtonElement;
    const bar = h("div", { class: "draw-bar", role: "toolbar" },
      h("span", { class: "draw-prompt" }, prompt), count,
      kind === "point" ? "" : h("button", { class: "pill-btn", onclick: () => { pts.pop(); refresh(); } }, "Undo"),
      kind === "point" ? "" : done,
      h("button", { class: "pill-btn", onclick: () => finish(false) }, "Cancel"));
    document.getElementById("ui")!.append(bar);

    const refresh = () => {
      preview.set(pts.length ? [
        ...(kind !== "point" && kind !== "points" && pts.length > 1 ? [{ id: "shape", kind: kind === "area" && pts.length > 2 ? "area" as const : "line" as const, pts, color, fill: 0.2 }] : []),
        { id: "pts", kind: "point" as const, pts, color },
      ] : []);
      count.textContent = kind === "point" ? "" : `${pts.length} point${pts.length === 1 ? "" : "s"}`;
      done.disabled = pts.length < min;
    };
    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      app.cancelPick();
      bar.remove();
      preview.clear();
      resolve(ok && pts.length >= min ? pts : null);
    };
    const next = () => {
      if (finished) return;
      app.pickOnce(null, (p) => {
        pts.push([p.lon, p.lat]);
        refresh();
        if (kind === "point") finish(true);
        else next();
      }, () => finish(false));
    };
    refresh();
    next();
  });
}
