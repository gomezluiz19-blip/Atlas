// The tour: a minute that shows what Terreno can do by doing it. Each step
// lights up one part and makes it happen live: a question typed into the
// search, a mountain's page, the mountain cut open, the mountain as a
// hologram, the planet's wind and planes moving, the world of 1914, the tools
// for twenty industries, and your own place. What a step turns on, it turns
// off again on the way out. Finish or skip and it never comes back on its own;
// it can be replayed from the menu or by typing "tour" in the search box.
import { Cartesian3 } from "cesium";
import type { App } from "../app";
import { h } from "../ui/dom";
import { introsOff, setIntrosOff } from "../intros/places";
import { closeSpace } from "./spaces";

const KEY = "atlas.tour";
export const tourDone = () => { try { return localStorage.getItem(KEY) === "done"; } catch { return true; } };
const markDone = () => { try { localStorage.setItem(KEY, "done"); localStorage.setItem("atlas.welcomed", "1"); } catch { /* private mode */ } };

interface Step {
  /** What to light up (none: a card in the middle). */
  target?: string;
  /** A small label above the title: what kind of power this is. */
  kicker?: string;
  title: string;
  text: string;
  /** Make it happen before the step appears. */
  before?: (app: App) => void | Promise<void>;
  /** Undo it on the way out. */
  after?: (app: App) => void;
  /** Extra buttons for the last step. */
  finale?: boolean;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const run = (app: App, id: string, arg?: string) => app.actions.get(id)?.run(arg);
const fly = (app: App, lon: number, lat: number, height: number, seconds = 2.2) => new Promise<void>((done) =>
  app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(lon, lat, height), duration: seconds, complete: done, cancel: done }));

/** Types into the search box as if someone were, so its suggestions come up. */
async function typeInSearch(text: string) {
  const input = document.querySelector<HTMLInputElement>(".search input");
  if (!input) return;
  input.focus();
  input.value = "";
  for (const ch of text) { input.value += ch; input.dispatchEvent(new Event("input", { bubbles: true })); await wait(38); }
}
function clearSearch() {
  const input = document.querySelector<HTMLInputElement>(".search input");
  if (!input) return;
  input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); input.blur();
}

let windOn = false;

const STEPS: Step[] = [
  { title: "The whole Earth, live", text: "And your own corner of it. In the next minute Terreno will show you what it can do, for real, on the real planet. Leave any time." },
  { target: ".search", kicker: "Ask", title: "One box understands anything", text: "A place, an address, coordinates, a year, something to show, or a question across every layer at once. This one finds flat land near an airport that stays warm in winter.",
    before: () => typeInSearch("flat land near an airport, warm in winter"), after: () => clearSearch() },
  { target: ".sheet", kicker: "Know", title: "Every place, every layer", text: "Its ground, climate, water, people, hazards and past, in one page with an address you can share. Here's Mount Fuji.",
    before: async (app) => { run(app, "place:open", "mount-fuji"); await wait(2600); } },
  { target: ".lens-strip", kicker: "See inside", title: "Cut a mountain open", text: "Lenses work on anything: slice through to the rock, lift out a 3D block, trace where the rain goes, or watch a day's real shadows pass over it.",
    before: async (app) => { run(app, "lens:slice"); await wait(2400); }, after: (app) => run(app, "lens:close") },
  { kicker: "Boot it", title: "Any place, as a hologram", text: "From a volcano to your own home: the ground in 3D, every building, the water and the trees, with what's going on there now around it.",
    before: async (app) => { run(app, "space:boot"); await wait(2600); }, after: () => closeSpace() },
  { kicker: "Live", title: "The planet, moving", text: "Wind streaming across the globe, every plane in the sky, ships, storms, quakes and the aurora, live and refreshed as they happen.",
    before: async (app) => { run(app, "place:clear"); await fly(app, -30, 48, 6_500_000); run(app, "live:planes"); if (!windOn) { run(app, "wind:toggle"); windOn = true; } await wait(1800); },
    after: (app) => { app.actions.get("live:planes")?.stop?.(); if (windOn) { run(app, "wind:toggle"); windOn = false; } } },
  { target: "#time-btn", kicker: "Rewind", title: "Any year", text: "The borders of 1914, the Earth from space on a day in any year since 2000, and the climate to 2050. Here's Europe on the eve of the First World War.",
    before: async (app) => { run(app, "time:go", "1914@15,50"); await wait(2400); }, after: (app) => run(app, "time:close") },
  { target: ".work-panel:not([hidden])", kicker: "Work", title: "Pick your field", text: "Builders, miners, chefs, shippers, bankers, aid workers and more. Each field has its tools on three rungs: Everyday for anyone, Pro for the people who do the work, and Services for the companies that serve them.",
    before: async (app) => { run(app, "mode:work"); await wait(1200); } },
  { target: ".work-panel:not([hidden])", kicker: "Yours", title: "Your place, every day", text: "Save your home, farm or business for a morning brief (frost, storms, deliveries), your cameras, how long to get anywhere, trips, and a hologram of your lot with its trees and water.",
    before: async (app) => { run(app, "mode:place"); await wait(1200); } },
  { title: "That's Terreno", text: "Start with your own place, plan somewhere to go, or let Terreno surprise you.", finale: true },
];

export function startTour(app: App) {
  document.querySelector(".tour")?.remove();
  // The opening's "Right now" line would sit under the tour.
  document.querySelector(".pulse")?.remove();
  let i = 0;
  const hole = h("div", { class: "tour-hole" });
  const kicker = h("span", { class: "tour-kicker" }), title = h("strong", { class: "tour-title" }), text = h("p", { class: "tour-text" });
  const dots = h("div", { class: "tour-dots" }, ...STEPS.map(() => h("i")));
  const back = h("button", { class: "link-btn tour-back" }, "Back") as HTMLButtonElement;
  const next = h("button", { class: "primary-btn tour-next" }, "Next") as HTMLButtonElement;
  const skip = h("button", { class: "tour-skip", "aria-label": "Skip the tour" }, "Skip");
  const extra = h("div", { class: "tour-extra" });
  const bubble = h("div", { class: "tour-bubble", role: "dialog", "aria-live": "polite" }, skip, kicker, title, text, extra, h("div", { class: "tour-foot" }, dots, h("div", { class: "tour-buttons" }, back, next)));
  const root = h("div", { class: "tour" }, hole, bubble);
  document.body.append(root);

  // Landmark intros wait until the tour is over (they'd cover the steps).
  const introsWere = introsOff();
  setIntrosOff(true);
  const finish = () => { STEPS[i].after?.(app); setIntrosOff(introsWere); markDone(); root.classList.add("out"); removeEventListener("resize", place); removeEventListener("keydown", keys); setTimeout(() => root.remove(), 350); };
  const keys = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); if (e.key === "ArrowRight") void go(i + 1); if (e.key === "ArrowLeft") void go(i - 1); };

  /** Puts the spotlight on the target and the card beside it. */
  function place() {
    const s = STEPS[i];
    const el = s.target ? document.querySelector(s.target) : null;
    const r = el && (el as HTMLElement).offsetParent !== null ? el.getBoundingClientRect() : null;
    const pad = 8, W = innerWidth, H = innerHeight;
    if (r && r.width && r.height) {
      Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, opacity: "1" });
      root.classList.remove("centred");
      const bw = Math.min(340, W - 32), bh = bubble.offsetHeight || 180;
      // Beside it if there's room, else below, else above.
      let left: number, top: number;
      if (r.right + 16 + bw < W) { left = r.right + 16; top = Math.min(Math.max(16, r.top), H - bh - 16); }
      else if (r.left - 16 - bw > 0) { left = r.left - 16 - bw; top = Math.min(Math.max(16, r.top), H - bh - 16); }
      else if (r.bottom + 16 + bh < H) { left = Math.min(Math.max(16, r.left + r.width / 2 - bw / 2), W - bw - 16); top = r.bottom + 16; }
      else { left = Math.min(Math.max(16, r.left + r.width / 2 - bw / 2), W - bw - 16); top = Math.max(16, r.top - 16 - bh); }
      Object.assign(bubble.style, { left: `${left}px`, top: `${top}px`, width: `${bw}px` });
    } else {
      // A spotlight of no size: the whole page dims behind the card.
      Object.assign(hole.style, { left: `${W / 2}px`, top: `${H / 2}px`, width: "0px", height: "0px", opacity: "1" });
      root.classList.add("centred");
      Object.assign(bubble.style, { left: "", top: "", width: "" });
    }
  }

  async function go(k: number) {
    if (k < 0 || k >= STEPS.length) return;
    STEPS[i].after?.(app);
    i = k;
    const s = STEPS[i];
    bubble.classList.add("busy");
    if (s.before) await s.before(app);
    kicker.textContent = s.kicker ?? "";
    title.textContent = s.title;
    text.textContent = s.text;
    dots.querySelectorAll("i").forEach((d, n) => d.classList.toggle("on", n === i));
    back.hidden = i === 0;
    next.textContent = s.finale ? "Explore" : i === 0 ? "Show me" : "Next";
    extra.replaceChildren(...(s.finale ? [
      h("button", { class: "primary-btn", onclick: () => { finish(); run(app, "mode:place"); } }, "🏠 Save my place"),
      h("button", { class: "pill-btn", onclick: () => { finish(); run(app, "work:travel"); } }, "✈ Plan a trip"),
      h("button", { class: "pill-btn", onclick: () => { finish(); run(app, "surprise"); } }, "✨ Surprise me"),
    ] : []));
    bubble.classList.remove("busy");
    place();
  }

  next.addEventListener("click", () => (STEPS[i].finale ? finish() : void go(i + 1)));
  back.addEventListener("click", () => void go(i - 1));
  skip.addEventListener("click", finish);
  addEventListener("resize", place);
  addEventListener("keydown", keys);
  void go(0);
}
