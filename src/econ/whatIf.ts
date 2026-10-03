// The What if bar: pick one or more scenarios and how hard they hit; whatever
// it sits in (a portfolio, the commodity desk, a field view) redraws with the
// shock. The same scenarios everywhere (econ/scenarios.ts).
import { h } from "../ui/dom";
import { combine, scaled, SCENARIOS, type Scenario, type Shock } from "./scenarios";

export interface WhatIfState { picked: Scenario[]; severity: number; shock: Shock | null }

export function whatIfBar(opts: { only?: (s: Scenario) => boolean; onChange: (st: WhatIfState) => void; title?: string; openLab?: () => void }): HTMLElement {
  const list = SCENARIOS.filter(opts.only ?? (() => true));
  const picked = new Set<string>();
  let severity = 1;
  const label = h("span", { class: "wi-sev-label" }, "As described");
  const sev = h("input", { type: "range", min: 0.25, max: 1.75, step: 0.25, value: 1, "aria-label": "How hard it hits" }) as HTMLInputElement;
  const fire = () => {
    const chosen = list.filter((s) => picked.has(s.id));
    opts.onChange({ picked: chosen, severity, shock: chosen.length ? combine(chosen.map((s) => scaled(s.shock, severity))) : null });
  };
  sev.addEventListener("input", () => {
    severity = Number(sev.value);
    label.textContent = severity < 0.75 ? "Milder" : severity > 1.25 ? "Worse" : "As described";
    fire();
  });
  const chips = list.map((s) => {
    const b = h("button", { class: "wi-chip", "aria-pressed": "false", title: s.about }, h("span", {}, s.emoji), s.name) as HTMLButtonElement;
    b.addEventListener("click", () => {
      if (picked.has(s.id)) picked.delete(s.id); else picked.add(s.id);
      b.setAttribute("aria-pressed", String(picked.has(s.id)));
      root.classList.toggle("on", picked.size > 0);
      fire();
    });
    return b;
  });
  const root = h("section", { class: "wi" },
    h("header", {}, h("strong", {}, opts.title ?? "What if…"), opts.openLab ? h("button", { class: "link-btn", onclick: opts.openLab }, "Open the lab ›") : ""),
    h("div", { class: "wi-chips" }, ...chips),
    h("label", { class: "wi-sev" }, h("span", {}, "How hard"), sev, label));
  return root;
}
