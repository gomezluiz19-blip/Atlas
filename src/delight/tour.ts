// The tour: a step-by-step introduction, once. Each step lights up one part
// of Atlas and says what it's for in a sentence, and some steps show it
// working (a place's page opens, a lens appears). Finish or skip and it
// never comes back on its own; it can be replayed from About or by typing
// "tour" in the search box.
import type { App } from "../app";
import { h } from "../ui/dom";

const KEY = "atlas.tour";
export const tourDone = () => { try { return localStorage.getItem(KEY) === "done"; } catch { return true; } };
const markDone = () => { try { localStorage.setItem(KEY, "done"); localStorage.setItem("atlas.welcomed", "1"); } catch { /* private mode */ } };

interface Step {
  /** What to light up (none: a card in the middle). */
  target?: string;
  title: string;
  text: string;
  /** Show it working before the step appears. */
  before?: (app: App) => void | Promise<void>;
  /** Extra buttons for the last step. */
  finale?: boolean;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STEPS: Step[] = [
  { title: "Welcome to Atlas", text: "All things Earth, in one place. This tour takes about a minute; you can leave it any time." },
  { target: ".search", title: "One box for everything", text: "Search any place or address. Ask a question (“flat land near an airport”). Type a year (“1914”). Or say what to show (“night lights”, “railways”)." },
  { target: ".sheet", title: "Every place has a page", text: "Its ground, climate, people and past, all at once, at an address you can share. Here's Mount Fuji.",
    before: async (app) => { app.actions.get("place:open")?.run("mount-fuji"); await wait(2600); } },
  { target: ".lens-strip", title: "Look through a lens", text: "Slice a mountain open, lift it out as a block, trace where the rain goes, or watch a day pass over it, with its real shadows." },
  { target: ".tabbar", title: "See the planet a different way", text: "Each theme shows the whole Earth its own way: the ground, water, climate, plants and animals, what we've built, people, countries and space." },
  { target: "#time-btn", title: "Travel in time", text: "The borders of any age, the Earth from space on a day in any year since 2000, and where we're heading." },
  { target: ".account-btn", title: "Your page, and lenses you make", text: "Make a page of the places you love: your Top 8, the restaurants and trails you swear by, a journal. Then describe a lens (“birdwatching”, “a coffee crawl”) and Atlas builds it, to use anywhere and share." },
  { target: ".mode-bar", title: "Look, Make, My Place", text: "Look further: ask the map, watch the year breathe. Make: trips, stories, videos and lessons. My Place: your home, farm or site, with a daily brief." },
  { title: "That's Atlas", text: "Tap anything to start, or let Atlas pick somewhere for you.", finale: true },
];

export function startTour(app: App) {
  document.querySelector(".tour")?.remove();
  // The opening's "Right now" line would sit under the tour.
  document.querySelector(".pulse")?.remove();
  let i = 0;
  const hole = h("div", { class: "tour-hole" });
  const title = h("strong", { class: "tour-title" }), text = h("p", { class: "tour-text" });
  const dots = h("div", { class: "tour-dots" }, ...STEPS.map(() => h("i")));
  const back = h("button", { class: "link-btn tour-back" }, "Back") as HTMLButtonElement;
  const next = h("button", { class: "primary-btn tour-next" }, "Next") as HTMLButtonElement;
  const skip = h("button", { class: "tour-skip", "aria-label": "Skip the tour" }, "Skip");
  const extra = h("div", { class: "tour-extra" });
  const bubble = h("div", { class: "tour-bubble", role: "dialog", "aria-live": "polite" }, skip, title, text, extra, h("div", { class: "tour-foot" }, dots, h("div", { class: "tour-buttons" }, back, next)));
  const root = h("div", { class: "tour" }, hole, bubble);
  document.body.append(root);

  const finish = () => { markDone(); root.classList.add("out"); removeEventListener("resize", place); removeEventListener("keydown", keys); setTimeout(() => root.remove(), 350); };
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
    i = k;
    const s = STEPS[i];
    bubble.classList.add("busy");
    if (s.before) await s.before(app);
    title.textContent = s.title;
    text.textContent = s.text;
    dots.querySelectorAll("i").forEach((d, n) => d.classList.toggle("on", n === i));
    back.hidden = i === 0;
    next.textContent = s.finale ? "Finished" : i === 0 ? "Start the tour" : "Next";
    extra.replaceChildren(...(s.finale ? [h("button", { class: "pill-btn", onclick: () => { finish(); app.actions.get("surprise")?.run(); } }, "Show me something amazing")] : []));
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
