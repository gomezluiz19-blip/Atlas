// How someone is getting there, the first thing Navigate asks: big tiles for walking, driving, the train and a
// taxi, and More for a bike, a flight or being guided on foot. Walking is the default. Terreno routes walking,
// cycling and driving itself; the train hands over to a transit planner and a taxi to a ride app, each with the
// journey on Terreno's map alongside.
import type { ReachMode } from "../travel/reach";
import { loadJson, saveJson } from "../util/storage";

export type TravelChoice = "walk" | "drive" | "train" | "taxi" | "bike" | "fly" | "guide";

const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const TRAVEL: Record<TravelChoice, { label: string; doing: string; color: string; icon: string; route?: ReachMode }> = {
  walk: { label: "Walk", doing: "walking", color: "var(--sage)", route: "walk", icon: svg('<circle cx="13" cy="4" r="2"/><path d="m9 21 2.5-6.5L14 17v4M7 12l2-4.5 4 1 2.5 3.5 2.5 1M11.5 14.5 10 8.5"/>') },
  drive: { label: "Drive", doing: "driving", color: "var(--cobalt)", route: "drive", icon: svg('<path d="M5 17h14M6.5 17v2M17.5 17v2M4 13l1.8-5.2A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.3L20 13v4H4z"/><path d="M4 13h16"/><circle cx="7.5" cy="15" r=".6"/><circle cx="16.5" cy="15" r=".6"/>') },
  train: { label: "Train", doing: "by train and bus", color: "var(--teal)", icon: svg('<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>') },
  taxi: { label: "Taxi", doing: "by taxi", color: "var(--ochre)", route: "drive", icon: svg('<path d="M9.5 4h5l.8 2.5M5 17h14M6.5 17v2M17.5 17v2M4 13l1.8-5.2A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.3L20 13v4H4z"/><path d="M4 13h16"/>') },
  bike: { label: "Bike", doing: "by bike", color: "var(--terra)", route: "bike", icon: svg('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16 9.5 9h6l2.5 7M9.5 9 12 16h-1M14 5.5h2.5"/>') },
  fly: { label: "Fly", doing: "flying", color: "#2f6e8f", icon: svg('<path d="M10.5 13.5 4 11l1.5-1.5 7 .5 4-4a1.8 1.8 0 0 1 2.5 2.5l-4 4 .5 7L14 21l-2.5-6.5-3 3V20L7 21l-1-3-3-1 1-1.5h2.5z"/>') },
  guide: { label: "Guide me", doing: "with Terreno guiding", color: "var(--ink)", icon: svg('<path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="m12 7 3.5 8.5L12 14l-3.5 1.5z"/>') },
};

/** The four big tiles, then what's under More. */
export const MAIN: TravelChoice[] = ["walk", "drive", "train", "taxi"];
export const MORE: TravelChoice[] = ["bike", "fly", "guide"];

const KEY = "atlas.nav.mode";
/** The way chosen last time; walking until someone picks another. */
export const lastTravel = (): TravelChoice => {
  const v = loadJson<string>(KEY, "walk");
  return v in TRAVEL && v !== "fly" && v !== "guide" ? (v as TravelChoice) : "walk";
};
export const rememberTravel = (c: TravelChoice) => { if (c !== "fly" && c !== "guide") saveJson(KEY, c); };
