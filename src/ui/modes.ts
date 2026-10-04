// The three things Terreno is for, as one switch at the top:
//   Explore: the whole Earth (and space) through themes and lenses;
//   Create: plans, stories, videos and lessons made from the map;
//   Work: pro tools for the work you do, drawn as industry lines;
//   My Place: your home, farm or business, and what's going on there.
import { h } from "./dom";
import { icons } from "./icons";

export type Mode = "place" | "look" | "make" | "work";

const MODES: { id: Mode; label: string; icon: string; title: string }[] = [
  { id: "look", label: "Explore", icon: icons.compass, title: "Explore the Earth and space: tap anything, flip through the themes, look through a lens" },
  { id: "make", label: "Create", icon: icons.pencil, title: "Create from the map: trips, stories, videos and lessons" },
  { id: "work", label: "Work", icon: icons.briefcase, title: "Work: tools for the work you do, from building sites and mines to freight, aid and sport" },
  { id: "place", label: "My Place", icon: icons.home, title: "My Place: your home, farm or business, brought up as a model, with what's going on there" },
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
