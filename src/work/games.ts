// Work › Teach › Games: short geography and history games on the globe.
//   Where in the world? — tap where a city or wonder is; points by distance.
//   Time traveller — the world's borders from some year: guess which.
import type { App } from "../app";
import { YEARS, yearLabel } from "../data/history";
import { h } from "../ui/dom";
import { CAPITALS, HISTORY_VIEWS, LANDMARKS, type GamePlace } from "./gameData";
import { fmtDist } from "./geo";
import type { WorkCtx } from "./hub";
import { flyToView, showYear } from "./present";
import { overhead } from "./presentModel";
import { confetti, distanceKm, revealMap, stage } from "./quiz";
import { award, loadPassport, savePassport } from "./passport";

/** Game badges for the learner's passport. */
function badge(app: App, id: string, label: string) {
  const p = loadPassport();
  if (award(p, id)) { savePassport(p); app.toast(`New badge: ${label}!`, 4000); }
}

const ROUNDS = 5;
const best = (k: string) => { try { return Number(localStorage.getItem(`atlas.game.${k}`) ?? 0); } catch { return 0; } };
const setBest = (k: string, v: number) => { try { localStorage.setItem(`atlas.game.${k}`, String(v)); } catch { /* fine */ } };
const pick = <T,>(a: T[], n: number) => [...a].sort(() => Math.random() - 0.5).slice(0, n);

/** Points for a guess: 1,000 on the spot, half at ~700 km, next to nothing past 5,000 km. */
export const guessPoints = (km: number) => Math.round(1000 * Math.exp(-km / 1000));

/** Points for a year guess: full marks for the right map, fewer the further off. */
export const yearPoints = (guess: number, answer: number) => {
  const gi = YEARS.indexOf(guess), ai = YEARS.indexOf(answer);
  return Math.max(0, 1000 - Math.abs(gi - ai) * 250);
};

export function openGames(ctx: WorkCtx, back: () => void) {
  const card = (title: string, about: string, color: string, key: string, go: () => void) =>
    h("button", { class: "work-type game-card", style: `--c:${color}`, onclick: () => { ctx.close(); go(); } },
      h("strong", {}, title), h("span", {}, about), best(key) ? h("span", { class: "game-best" }, `Best: ${best(key).toLocaleString()}`) : "");
  ctx.show("Games", back,
    h("p", { class: "mp-intro" }, "Quick games for the start or end of a lesson, one player or the whole class calling out answers."),
    h("div", { class: "work-types" },
      card("Where in the world? · Capitals", "Tap where each capital city is", "#3563d6", "where-capitals", () => where(ctx.app, CAPITALS, "where-capitals", "capitals")),
      card("Where in the world? · Wonders", "Mountains, ruins, reefs and falls", "#5b9467", "where-wonders", () => where(ctx.app, LANDMARKS, "where-wonders", "wonders")),
      card("Time traveller", "Here's the world's map. What year is it?", "#c9a256", "time", () => timeTraveller(ctx.app)),
    ),
    h("p", { class: "muted small" }, "Long-running games for a whole unit are in World Summit."),
  );
}

export function where(app: App, places: GamePlace[], key: string, what: string) {
  const s = stage(app);
  const rounds = pick(places, ROUNDS);
  let r = 0, total = 0;
  const round = async () => {
    const p = rounds[r];
    s.card.replaceChildren(h("span", { class: "stage-num" }, `Round ${r + 1} of ${ROUNDS} · ${total.toLocaleString()} points`), h("h2", {}, `Where is ${p.name}?`), h("p", { class: "muted" }, p.hint));
    s.answers.replaceChildren(h("div", { class: "stage-hint" }, "Tap the globe. You can spin and zoom it first."));
    s.bar.replaceChildren(h("button", { class: "present-btn", "aria-label": "Quit", onclick: () => s.close() }, "✕"));
    await flyToView(app, overhead(0, 20, 22_000_000), 1.5);
    app.pickOnce(null, (g) => {
      const km = distanceKm([g.lon, g.lat], [p.lon, p.lat]);
      const pts = guessPoints(km);
      total += pts;
      revealMap(app, { id: "", kind: "map", prompt: "", place: p.name, lon: p.lon, lat: p.lat, tolerance: 0 }, [{ pt: [g.lon, g.lat], color: "#3563d6", label: "Your guess" }]);
      s.answers.replaceChildren(h("div", { class: "stage-tile small " + (pts > 700 ? "right" : pts < 100 ? "wrong" : "") }, h("b", {}, `+${pts}`), h("span", {}, km < 25 ? "Spot on!" : `${fmtDist(km * 1000)} away`)));
      s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => { r++; if (r < ROUNDS) void round(); else end(); } }, r + 1 < ROUNDS ? "Next" : "See score"));
    });
  };
  const end = () => {
    const record = total > best(key);
    if (record) setBest(key, total);
    if (total >= 3500) badge(app, "where", "Sharp eye 🎯");
    s.card.replaceChildren(h("span", { class: "stage-num" }, `Where in the world? · ${what}`), h("h2", {}, `${total.toLocaleString()} points`), h("p", {}, record ? "A new best score! 🎉" : `Best so far: ${best(key).toLocaleString()}`));
    s.answers.replaceChildren();
    s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => { s.close(); where(app, places, key, what); } }, "Play again"), h("button", { class: "present-btn", "aria-label": "Close", onclick: () => s.close() }, "✕"));
    if (record) confetti(s.root);
  };
  void round();
}

export function timeTraveller(app: App) {
  const s = stage(app);
  // Recorded history, where the maps have the most detail.
  const years = YEARS.filter((y) => y >= -500);
  let r = 0, total = 0;
  const round = async () => {
    const answer = years[Math.floor(Math.random() * years.length)];
    const view = HISTORY_VIEWS[Math.floor(Math.random() * HISTORY_VIEWS.length)];
    const near = years.filter((y) => y !== answer).sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer)).slice(0, 6);
    const options = [answer, ...pick(near, 3)].sort((a, b) => a - b);
    s.card.replaceChildren(h("span", { class: "stage-num" }, `Round ${r + 1} of ${ROUNDS} · ${total.toLocaleString()} points`), h("h2", {}, `${view.name}: what year is this map?`), h("p", { class: "muted" }, "Look at the empires and borders. Labels name who ruled."));
    s.answers.replaceChildren(h("div", { class: "stage-hint" }, "Loading the map…"));
    s.bar.replaceChildren(h("button", { class: "present-btn", "aria-label": "Quit", onclick: () => { void showYear(app, null); s.close(); } }, "✕"));
    await Promise.all([flyToView(app, overhead(view.lon, view.lat, view.height), 2), showYear(app, answer).catch(() => [])]);
    s.answers.replaceChildren(...options.map((y, j) => h("button", { class: "stage-tile", style: `--c:${["#b8496a", "#3563d6", "#e1b843", "#8b5fa8"][j]}`, onclick: () => {
      const pts = yearPoints(y, answer);
      total += pts;
      [...s.answers.children].forEach((el, k) => { (el as HTMLButtonElement).disabled = true; el.classList.add(options[k] === answer ? "right" : options[k] === y ? "wrong" : "dim"); });
      s.card.append(h("p", { class: "stage-explain" }, y === answer ? `Yes! ${yearLabel(answer)}. +${pts}` : `It was ${yearLabel(answer)}. +${pts}`));
      s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => { r++; if (r < ROUNDS) void round(); else end(); } }, r + 1 < ROUNDS ? "Next" : "See score"));
    } }, h("b", {}, String.fromCharCode(65 + j)), h("span", {}, yearLabel(y)))));
  };
  const end = () => {
    const record = total > best("time");
    if (record) setBest("time", total);
    if (total >= 3000) badge(app, "time", "Time traveller ⏳");
    s.card.replaceChildren(h("span", { class: "stage-num" }, "Time traveller"), h("h2", {}, `${total.toLocaleString()} points`), h("p", {}, record ? "A new best score! 🎉" : `Best so far: ${best("time").toLocaleString()}`));
    s.answers.replaceChildren();
    s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => { s.close(); timeTraveller(app); } }, "Play again"), h("button", { class: "present-btn", "aria-label": "Close", onclick: () => { void showYear(app, null); s.close(); } }, "✕"));
    if (record) confetti(s.root);
  };
  void round();
}
