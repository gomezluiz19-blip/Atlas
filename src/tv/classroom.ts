// The classroom on a TV: what a teacher at the front of a room needs from a globe on the wall.
//   Class quiz: one question at a time, big enough for the back row, lettered answers, a countdown bar; the
//     answer stays on the teacher's phone until they reveal it, then the globe flies to the place.
//   Where in the world?: a clue and a spinning Earth, ten seconds to call it out, then the reveal. It plays by
//     itself between lessons, a starter that needs no setting up.
//   Time machine: the world's borders in any year from 123,000 BC to today, stepped with the remote.
import { Cartesian3 } from "cesium";
import type { App } from "../app";
import { YEARS, yearLabel } from "../data/history";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { CAPITALS, LANDMARKS } from "../work/gameData";
import type { SlideCamera } from "../work/presentModel";
import type { Question, Quiz } from "../work/quizModel";
import { placeQuiz, stepYear } from "./rooms";

/** A question as the room sees it: the prompt, any lettered options, and where to fly when it's revealed. */
export interface HostQ { prompt: string; options: string[]; answer: number; answerText: string; place?: { lon: number; lat: number; name: string }; view?: SlideCamera; year?: number; explain?: string }

/** Turns a saved quiz's questions into ones to host (pure). */
export function hostable(q: Question): HostQ {
  if (q.kind === "choice") return { prompt: q.prompt, options: q.options, answer: q.answer, answerText: q.options[q.answer] ?? "", view: q.view?.camera, year: q.view?.year, explain: q.explain };
  if (q.kind === "truefalse") return { prompt: q.prompt, options: ["True", "False"], answer: q.answer ? 0 : 1, answerText: q.answer ? "True" : "False", view: q.view?.camera, year: q.view?.year, explain: q.explain };
  return { prompt: q.prompt, options: [], answer: -1, answerText: q.place, place: { lon: q.lon, lat: q.lat, name: q.place }, explain: q.explain };
}

/** A ready-made quiz for a teacher with nothing prepared: capitals and famous places. */
export function starterQuiz(rnd: () => number = Math.random): { title: string; questions: HostQ[]; seconds: number } {
  // Capitals are asked among capitals, famous places among famous places, so every choice is a fair guess.
  const ask = (pool: typeof CAPITALS, n: number) => placeQuiz(pool, n, rnd).map((q): HostQ => ({
    prompt: `Which is ${/^capital of/.test(q.prompt) ? "the " : ""}${q.prompt}?`, options: q.options, answer: q.answer, answerText: q.options[q.answer], place: q.place,
  }));
  const caps = ask(CAPITALS, 4), marks = ask(LANDMARKS, 4);
  return { title: "Capitals and famous places", questions: caps.flatMap((c, i) => [c, marks[i]]).filter(Boolean), seconds: 20 };
}
export const fromQuiz = (quiz: Quiz) => ({ title: quiz.title, questions: quiz.questions.map(hostable), seconds: quiz.seconds ?? 0 });

export interface QuizHost { el: HTMLElement; reveal(): void; go(dir: 1 | -1): void; press(): void; close(): void; readonly state: { title: string; i: number; n: number; prompt: string; answer: string; revealed: boolean; ends: number } }

export function hostQuiz(app: App, quiz: { title: string; questions: HostQ[]; seconds: number }, deps: {
  fly(v: SlideCamera): void; year(y: number | null): void; onChange(): void; onEnd(): void;
}): QuizHost {
  let i = 0, revealed = false, ends = 0, timer = 0, closed = false;
  const el = h("div", { class: "tv-quiz", role: "region", "aria-label": quiz.title });
  const scores = h("div", { class: "tv-quiz-bar" });
  const draw = () => {
    const q = quiz.questions[i];
    clearInterval(timer);
    el.replaceChildren(
      h("div", { class: "tv-quiz-head" }, h("span", {}, quiz.title), h("span", {}, `Question ${i + 1} of ${quiz.questions.length}`)),
      h("h2", { class: "tv-quiz-q" }, q.prompt),
      q.options.length ? h("div", { class: "tv-quiz-options" + (q.options.length === 2 ? " two" : "") }, ...q.options.map((o, k) =>
        h("div", { class: "tv-quiz-opt" + (revealed ? (k === q.answer ? " right" : " wrong") : "") }, h("b", {}, "ABCDEFGH"[k]), h("span", {}, o))))
        : h("p", { class: "tv-quiz-find" }, revealed ? `📍 ${q.answerText}` : "Find it on the globe"),
      revealed && q.explain ? h("p", { class: "tv-quiz-explain" }, q.explain) : "",
      scores);
    scores.replaceChildren(h("i", {}));
    if (!revealed && quiz.seconds > 0) {
      ends = Date.now() + quiz.seconds * 1000;
      const fill = scores.firstElementChild as HTMLElement;
      const tick = () => {
        const left = Math.max(0, ends - Date.now()) / (quiz.seconds * 1000);
        fill.style.width = `${left * 100}%`;
        el.classList.toggle("hurry", left < 0.25);
        if (left <= 0) { clearInterval(timer); reveal(); }
      };
      tick(); timer = window.setInterval(tick, 100);
    } else ends = 0;
    el.classList.toggle("revealed", revealed);
    el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
    deps.onChange();
  };
  const ask = () => {
    const q = quiz.questions[i];
    revealed = false;
    deps.year(q.year ?? null);
    if (q.view) deps.fly(q.view);
    else app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(q.place ? q.place.lon + 70 : 10, 20, 20_000_000), duration: 2 });
    draw();
  };
  function reveal() {
    if (revealed || closed) return;
    revealed = true;
    const q = quiz.questions[i];
    if (q.place) void flyToPlace(app.globe, { name: q.place.name, lon: q.place.lon, lat: q.place.lat, radius: 30_000 });
    draw();
  }
  const go = (dir: 1 | -1) => {
    const n = i + dir;
    if (n >= quiz.questions.length) { finish(); return; }
    if (n < 0) return;
    i = n; ask();
  };
  function finish() {
    clearInterval(timer);
    el.replaceChildren(h("div", { class: "tv-quiz-end" }, h("span", {}, "🎉"), h("h2", {}, "That's the quiz!"), h("p", {}, `${quiz.questions.length} questions · ${quiz.title}`)));
    window.setTimeout(close, 6000);
  }
  function close() {
    if (closed) return;
    closed = true; clearInterval(timer); el.remove(); deps.year(null); deps.onEnd();
  }
  ask();
  return {
    el, reveal, go, close,
    /** Select: reveal, then move on. */
    press: () => (revealed ? go(1) : reveal()),
    get state() { const q = quiz.questions[i]; return { title: quiz.title, i, n: quiz.questions.length, prompt: q?.prompt ?? "", answer: q?.answerText ?? "", revealed, ends }; },
  };
}

/** Where in the world?: a clue, ten seconds, the reveal. Returns a function that stops it. */
export function whereIn(app: App, say: (t: string, s?: string) => void, seconds = 10): () => void {
  const pool = [...CAPITALS, ...LANDMARKS];
  const p = pool[Math.floor(Math.random() * pool.length)];
  let left = seconds, stopped = false;
  const cam = app.globe.viewer.camera;
  cam.flyTo({ destination: Cartesian3.fromDegrees(p.lon + 60 + Math.random() * 60, 15, 21_000_000), duration: 2.5 });
  const clue = () => say("Where in the world?", `It's ${p.hint}  ·  ${left}`);
  clue();
  const t = window.setInterval(() => {
    if (stopped) return;
    left--;
    if (left > 0) { clue(); return; }
    clearInterval(t);
    void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: 25_000 });
    say(p.name, `${p.hint[0].toUpperCase()}${p.hint.slice(1)}`);
  }, 1000);
  return () => { stopped = true; clearInterval(t); };
}

/** The time machine: borders by year, stepped with the remote. */
export function timeMachine(say: (t: string, s?: string) => void, show: (y: number | null) => Promise<unknown>, start = 1492) {
  let year = YEARS.includes(start) ? start : stepYear(YEARS, start, 1);
  const draw = () => {
    say(yearLabel(year), "◀ ▶ on the remote moves through time");
    void show(year).catch(() => say(yearLabel(year), "Couldn't load the borders for that year. Check the connection."));
  };
  draw();
  return {
    get year() { return year; },
    step(dir: 1 | -1) { const y = stepYear(YEARS, year, dir); if (y !== year) { year = y; draw(); } },
    close() { void show(null); },
  };
}
