// A list of map layers with a colour swatch, a description and a switch.
import { h } from "./dom";

export interface LayerItem {
  id: string;
  label: string;
  about: string;
  color: string;
}

export function layerList(
  items: LayerItem[],
  api: { isOn(id: string): boolean; isLoading?(id: string): boolean; set(id: string, on: boolean): void; subscribe(fn: () => void): () => void },
): HTMLElement {
  const box = h("div", { class: "net-list" });
  const draw = () =>
    box.replaceChildren(
      ...items.map((it) => {
        const on = api.isOn(it.id), loading = api.isLoading?.(it.id) ?? false;
        return h("label", { class: "net-row" },
          h("span", { class: "net-swatch", style: `--c:${it.color}` }),
          h("span", { class: "net-text" },
            h("span", { class: "net-name" }, it.label, loading ? h("span", { class: "net-loading" }, "Loading…") : ""),
            h("span", { class: "net-about" }, it.about)),
          h("input", { type: "checkbox", class: "switch", checked: on, onchange: (e: Event) => api.set(it.id, (e.target as HTMLInputElement).checked) }));
      }),
    );
  draw();
  const off = api.subscribe(() => (box.isConnected ? draw() : off()));
  return box;
}

/** A single stacked bar with a legend underneath. */
export function stackedBar(parts: { label: string; value: number; color: string }[], format: (v: number) => string): HTMLElement {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const shown = parts.filter((p) => p.value / total >= 0.005);
  return h("div", { class: "stack" },
    h("div", { class: "stack-bar", role: "img", "aria-label": shown.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ") },
      ...shown.map((p) => h("span", { style: `flex:${p.value};background:${p.color}`, title: `${p.label}: ${format(p.value)}` }))),
    h("div", { class: "stack-legend" },
      ...shown.map((p) => h("span", { class: "stack-key" },
        h("span", { class: "dot", style: `background:${p.color}` }),
        `${p.label} ${Math.round((p.value / total) * 100)}%`))));
}
