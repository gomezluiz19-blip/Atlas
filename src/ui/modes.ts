// The three things Atlas is for, as one switch at the top:
//   My Place: your home, farm, site or business, and the tools to run it;
//   Look: the whole Earth (and space) through themes and lenses;
//   Make: plans, presentations, videos and lessons made from the map.
import { h } from "./dom";
import { icons } from "./icons";

export type Mode = "place" | "look" | "make";

const MODES: { id: Mode; label: string; icon: string; title: string }[] = [
  { id: "place", label: "My Place", icon: icons.home, title: "My Place: your home, farm or site, today and the tools to run it" },
  { id: "look", label: "Look", icon: icons.eye, title: "Look: explore the Earth and space through themes and lenses" },
  { id: "make", label: "Make", icon: icons.pencil, title: "Make: plans, presentations, videos and lessons" },
];

export function createModeBar(onPick: (m: Mode) => void) {
  const buttons = new Map<Mode, HTMLButtonElement>();
  const el = h("nav", { class: "mode-bar", "aria-label": "Mode" },
    ...MODES.map((m) => {
      const b = h("button", { class: "mode-btn", title: m.title, "aria-pressed": String(m.id === "look"), onclick: () => onPick(m.id) },
        h("span", { class: "mode-icon", html: m.icon }), h("span", { class: "mode-label" }, m.label)) as HTMLButtonElement;
      buttons.set(m.id, b);
      return b;
    }));
  let mode: Mode = "look";
  return {
    el,
    get mode() { return mode; },
    /** Shows a mode as current (without acting on it). */
    set(m: Mode) {
      mode = m;
      for (const [id, b] of buttons) b.setAttribute("aria-pressed", String(id === m));
    },
  };
}
