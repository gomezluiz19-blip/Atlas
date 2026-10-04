// Work › Teach › Quizzes: write questions (multiple choice, true or false,
// find it on the map, each optionally showing a view of the globe), host them
// on the class screen with teams and a timer, or send students a link to take
// the quiz on their own device. Results come back as a code or a file and
// fill a gradebook. Nothing leaves the browser.
import { Cartesian3 } from "cesium";
import type { App } from "../app";
import { yearLabel } from "../data/history";
import { h } from "../ui/dom";
import { csvCell } from "../util/csv";
import { CAPITALS, LANDMARKS } from "./gameData";
import { fmtDist } from "./geo";
import type { WorkCtx } from "./hub";
import { WorkLayer } from "./layer";
import { borders, captureView, flyToView, showYear } from "./present";
import { overhead } from "./presentModel";
import { gradebook, mark, markAll, pack, unpack, validQuiz, type Answer, type Question, type QuestionView, type Quiz, type Result } from "./quizModel";
import { ListStore, download, newId } from "./store";

const quizzes = new ListStore<Quiz>("atlas.work.quizzes.v1");
const results = new ListStore<Result & { id: string }>("atlas.work.results.v1");
const LETTERS = ["A", "B", "C", "D", "E", "F"];
// Answer colours; green is kept for "right".
const TILE = ["#ff375f", "#0a84ff", "#ffd60a", "#bf5af2", "#ff9f0a", "#64d2ff"];
let marker: WorkLayer | null = null;

const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ---- Ready-made quizzes -------------------------------------------------------------------------

function capitalsQuiz(): Quiz {
  return { id: newId(), title: "Find the capital", created: Date.now(), seconds: 30,
    questions: shuffle(CAPITALS).slice(0, 10).map((c) => ({ id: newId(), kind: "map" as const, prompt: `Find ${c.name}, the ${c.hint}.`, place: c.name, lon: c.lon, lat: c.lat, tolerance: 300 })) };
}
function landmarksQuiz(): Quiz {
  return { id: newId(), title: "Wonders of the world", created: Date.now(), seconds: 30,
    questions: shuffle(LANDMARKS).slice(0, 8).map((c) => ({ id: newId(), kind: "map" as const, prompt: `Where is ${c.name}? (${c.hint})`, place: c.name, lon: c.lon, lat: c.lat, tolerance: 400 })) };
}
function earthQuiz(): Quiz {
  const q = (prompt: string, options: string[], answer: number, explain: string, view?: QuestionView): Question => ({ id: newId(), kind: "choice", prompt, options, answer, explain, view });
  return { id: newId(), title: "Our planet", created: Date.now(), seconds: 25, questions: [
    q("Which is the largest ocean?", ["Atlantic", "Indian", "Pacific", "Arctic"], 2, "The Pacific covers about a third of Earth's surface.", { camera: overhead(-160, 0, 20_000_000) }),
    q("Which continent has the most countries?", ["Asia", "Africa", "Europe", "South America"], 1, "Africa has 54 countries.", { camera: overhead(20, 2, 11_000_000) }),
    { id: newId(), kind: "truefalse", prompt: "The Amazon rainforest is mostly in Brazil.", answer: true, explain: "About 60% of it is in Brazil.", view: { camera: overhead(-62, -4, 5_000_000) } },
    q("What is the highest mountain above sea level?", ["K2", "Kilimanjaro", "Denali", "Mount Everest"], 3, "Everest reaches 8,849 m.", { camera: overhead(86.9, 27.5, 400_000, 45) }),
    { id: newId(), kind: "truefalse", prompt: "In 1914, Austria-Hungary was one country.", answer: true, explain: "It split up after World War I.", view: { camera: overhead(17, 47, 3_000_000), year: 1914 } },
    q("Which river is the longest in Africa?", ["Congo", "Niger", "Nile", "Zambezi"], 2, "The Nile runs about 6,650 km to the Mediterranean.", { camera: overhead(31, 18, 6_000_000) }),
  ] };
}

// ---- Screens -------------------------------------------------------------------------------------

export function openQuizzes(ctx: WorkCtx, back: () => void) {
  const add = (q: Quiz) => { quizzes.save(q); openQuiz(ctx, q.id, back); };
  const importIn = h("input", { class: "pro-url", placeholder: "Paste a quiz link from another teacher" }) as HTMLInputElement;
  ctx.show("Quizzes and tests", back,
    h("p", { class: "mp-intro" }, "Write a quiz with questions on the globe, then host it on the class screen with teams, or send students a link to take it themselves."),
    h("div", { class: "chips wrap" }, h("button", { class: "chip", onclick: () => add({ id: newId(), title: "New quiz", created: Date.now(), questions: [], seconds: 30 }) }, "+ New quiz")),
    quizzes.all().length ? h("section", { class: "group" }, h("h2", { class: "group-title" }, "Your quizzes"),
      h("div", { class: "list" }, ...quizzes.all().map((q) => {
        const n = results.all().filter((r) => r.quiz === q.id).length;
        return h("button", { class: "list-row", onclick: () => openQuiz(ctx, q.id, back) },
          h("span", { class: "work-badge", style: "background:#ff375f" }, "?"),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, q.title), h("span", { class: "list-sub" }, `${q.questions.length} questions${n ? ` · ${n} result${n === 1 ? "" : "s"}` : ""}`)),
          h("span", { class: "chev", html: "&rsaquo;" }));
      }))) : "",
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Ready to use"),
      h("div", { class: "work-types" },
        h("button", { class: "work-type", style: "--c:#0a84ff", onclick: () => add(capitalsQuiz()) }, h("strong", {}, "Find the capital"), h("span", {}, "10 capitals to find on the globe")),
        h("button", { class: "work-type", style: "--c:#30d158", onclick: () => add(landmarksQuiz()) }, h("strong", {}, "Wonders of the world"), h("span", {}, "8 famous places to find")),
        h("button", { class: "work-type", style: "--c:#ff9f0a", onclick: () => add(earthQuiz()) }, h("strong", {}, "Our planet"), h("span", {}, "Oceans, continents, rivers and a map from 1914")))),
    h("div", { class: "pro-url-row" }, importIn, h("button", { class: "primary-btn", onclick: async () => {
      const m = /quiz=([\w-]+)/.exec(importIn.value);
      try {
        const q = await unpack<Quiz>(m ? m[1] : importIn.value);
        if (!validQuiz(q)) throw new Error();
        add({ ...q, id: newId(), created: Date.now() });
      } catch { ctx.app.toast("That isn't a quiz link.", 4000); }
    } }, "Add")),
  );
}

function openQuiz(ctx: WorkCtx, id: string, back: () => void) {
  const q = quizzes.get(id);
  if (!q) return openQuizzes(ctx, back);
  const { app } = ctx;
  const save = () => quizzes.save(q);
  const again = () => openQuiz(ctx, id, back);
  const addChoice = async (kind: "choice" | "truefalse") => {
    q.questions.push(kind === "choice"
      ? { id: newId(), kind, prompt: "", options: ["", "", "", ""], answer: 0 }
      : { id: newId(), kind, prompt: "", answer: true });
    save();
    again();
  };
  const addMap = async () => {
    ctx.hide();
    app.pickOnce("Tap the right answer on the globe", (p) => {
      ctx.unhide();
      const place = prompt("What's the place called?", "") ?? "";
      q.questions.push({ id: newId(), kind: "map", prompt: place ? `Find ${place}.` : "Find this place.", place: place || "the place", lon: p.lon, lat: p.lat, tolerance: 200 });
      save();
      again();
    }, () => { ctx.unhide(); });
  };

  const row = (x: Question, k: number) => {
    const head = h("div", { class: "quiz-q-head" },
      h("span", { class: "work-badge", style: "background:#ff375f" }, String(k + 1)),
      h("span", { class: "muted small" }, x.kind === "choice" ? "Multiple choice" : x.kind === "truefalse" ? "True or false" : "Find on the map"),
      k > 0 ? h("button", { class: "link-btn", onclick: () => { [q.questions[k - 1], q.questions[k]] = [q.questions[k], q.questions[k - 1]]; save(); again(); } }, "Move up") : "",
      h("button", { class: "link-btn danger", onclick: () => { q.questions.splice(k, 1); save(); again(); } }, "Delete"));
    const promptIn = h("input", { class: "mp-label", value: x.prompt, placeholder: "Question", onchange: (e: Event) => { x.prompt = (e.target as HTMLInputElement).value; save(); } });
    let body: HTMLElement;
    if (x.kind === "choice")
      body = h("div", { class: "quiz-options" }, ...x.options.map((o, j) =>
        h("label", { class: "quiz-opt" + (x.answer === j ? " right" : "") },
          h("input", { type: "radio", name: `a-${x.id}`, checked: x.answer === j, title: "Correct answer", onchange: () => { x.answer = j; save(); again(); } }),
          h("span", { class: "quiz-letter", style: `background:${TILE[j]}` }, LETTERS[j]),
          h("input", { value: o, placeholder: `Answer ${LETTERS[j]}`, onchange: (e: Event) => { x.options[j] = (e.target as HTMLInputElement).value; save(); } }))));
    else if (x.kind === "truefalse")
      body = h("div", { class: "chips" }, ...[true, false].map((v) => h("button", { class: "chip" + (x.answer === v ? " on" : ""), onclick: () => { x.answer = v; save(); again(); } }, v ? "True" : "False")));
    else
      body = h("div", { class: "quiz-map" },
        h("span", { class: "muted small" }, `${x.place} · ${x.lat.toFixed(2)}, ${x.lon.toFixed(2)}`),
        h("label", { class: "present-check" }, "Full marks within",
          h("select", { onchange: (e: Event) => { (x as { tolerance: number }).tolerance = Number((e.target as HTMLSelectElement).value); save(); } },
            ...[25, 50, 100, 200, 300, 500, 1000].map((v) => h("option", { value: v, selected: x.tolerance === v }, `${v} km`)))));
    const view = x.kind !== "map" ? h("div", { class: "present-actions" },
      x.view ? h("span", { class: "muted small" }, `Shows a view of the globe${x.view.year !== undefined ? `, borders ${yearLabel(x.view.year)}` : ""}`) : "",
      h("button", { class: "link-btn", onclick: async () => { const v = await captureView(app); (x as { view?: unknown }).view = { camera: v.camera, year: borders(app).year ?? undefined }; save(); again(); } }, x.view ? "Use current view instead" : "Show the current view with it"),
      x.view ? h("button", { class: "link-btn", onclick: () => { (x as { view?: unknown }).view = undefined; save(); again(); } }, "No view") : "") : "";
    const explain = h("input", { class: "pro-url", value: x.explain ?? "", placeholder: "Explanation shown after answering (optional)", onchange: (e: Event) => { x.explain = (e.target as HTMLInputElement).value || undefined; save(); } });
    return h("div", { class: "quiz-q" }, head, promptIn, body, view, explain);
  };

  const mine = results.all().filter((r) => r.quiz === q.id);
  ctx.show("Quiz", () => openQuizzes(ctx, back),
    h("input", { class: "mp-name", value: q.title, "aria-label": "Quiz title", onchange: (e: Event) => { q.title = (e.target as HTMLInputElement).value || q.title; save(); } }),
    h("label", { class: "mp-field" }, h("span", {}, "Time per question (in class)"),
      h("select", { onchange: (e: Event) => { q.seconds = Number((e.target as HTMLSelectElement).value); save(); } },
        ...[0, 10, 20, 30, 45, 60, 90].map((v) => h("option", { value: v, selected: (q.seconds ?? 0) === v }, v ? `${v} seconds` : "No timer")))),
    q.questions.length ? h("div", { class: "quiz-list" }, ...q.questions.map(row)) : h("p", { class: "muted small" }, "No questions yet."),
    h("div", { class: "chips wrap" },
      h("button", { class: "chip", onclick: () => void addChoice("choice") }, "+ Multiple choice"),
      h("button", { class: "chip", onclick: () => void addChoice("truefalse") }, "+ True or false"),
      h("button", { class: "chip", onclick: () => void addMap() }, "+ Find on the map")),
    q.questions.length ? h("div", { class: "pro-actions" },
      h("button", { class: "primary-btn", onclick: () => { ctx.close(); host(app, q); } }, "Host in class"),
      h("button", { class: "pill-btn", onclick: async () => {
        const link = `${location.origin}${location.pathname}#quiz=${await pack(q)}`;
        try { await navigator.clipboard.writeText(link); app.toast("Student link copied. Share it in your class chat or LMS.", 5000); }
        catch { prompt("Copy this link for your students:", link); }
      } }, "Copy student link"),
      h("button", { class: "pill-btn", onclick: () => { ctx.close(); take(app, q, ctx); } }, "Try it")) : "",
    h("section", { class: "group" }, h("h2", { class: "group-title" }, `Results${mine.length ? ` · ${mine.length}` : ""}`),
      resultsView(ctx, q, again)),
    h("div", { class: "pro-actions" },
      h("button", { class: "link-btn", onclick: () => download(`${q.title}.terreno-quiz.json`, JSON.stringify(q)) }, "Save as a file"),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Delete "${q.title}"?`)) { quizzes.remove(q.id); openQuizzes(ctx, back); } } }, "Delete quiz")),
  );
}

function resultsView(ctx: WorkCtx, q: Quiz, again: () => void): HTMLElement {
  const code = h("input", { class: "pro-url", placeholder: "Paste a student's result code" }) as HTMLInputElement;
  const files = h("input", { type: "file", accept: ".json", multiple: true, hidden: true }) as HTMLInputElement;
  const addResult = (r: Result) => {
    if (r.quiz !== q.id) { ctx.app.toast(`That result is for "${r.title}", not this quiz.`, 5000); return false; }
    results.save({ ...r, id: newId() });
    return true;
  };
  files.addEventListener("change", async () => {
    let n = 0;
    for (const f of Array.from(files.files ?? [])) { try { if (addResult(JSON.parse(await f.text()))) n++; } catch { /* skip */ } }
    ctx.app.toast(`Added ${n} result${n === 1 ? "" : "s"}.`, 3000);
    again();
  });
  const book = gradebook(q, results.all());
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return h("div", { class: "work-analysis" },
    h("div", { class: "pro-url-row" }, code, h("button", { class: "primary-btn", onclick: async () => {
      try { if (addResult(await unpack<Result>(code.value))) again(); } catch { ctx.app.toast("That code didn't work. Ask the student to copy it again.", 4000); }
    } }, "Add")),
    h("button", { class: "link-btn", onclick: () => files.click() }, "Or add result files…"), files,
    book.rows.length ? h("div", { class: "work-table-wrap" },
      h("table", { class: "work-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Student"), h("th", {}, "Score"), ...q.questions.map((_, i) => h("th", {}, `Q${i + 1}`)))),
        h("tbody", {},
          ...book.rows.map((r) => h("tr", {}, h("td", {}, r.student), h("td", {}, `${r.score}/${r.total}`), ...r.each.map((v) => h("td", { class: v >= 1 ? "best" : v > 0 ? "" : "miss" }, v >= 1 ? "✓" : v > 0 ? v.toFixed(1) : "✗")))),
          h("tr", { class: "quiz-avg" }, h("td", {}, "Class"), h("td", {}, pct(book.average)), ...book.perQuestion.map((v) => h("td", { class: v < 0.5 ? "miss" : "" }, pct(v))))))) : h("p", { class: "muted small" }, "No results yet. Students send you a code (or a file) when they finish."),
    book.rows.length ? h("div", { class: "pro-actions" },
      h("button", { class: "link-btn", onclick: () => download(`${q.title} results.csv`, [["student", "score", "total", ...q.questions.map((_, i) => `q${i + 1}`)], ...book.rows.map((r) => [r.student, r.score, r.total, ...r.each.map((v) => v.toFixed(2))])].map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv") }, "Export (CSV)"),
      book.perQuestion.some((v) => v < 0.5) ? h("span", { class: "muted small" }, `Worth revisiting: ${book.perQuestion.map((v, i) => (v < 0.5 ? `Q${i + 1}` : "")).filter(Boolean).join(", ")}`) : "") : "",
  );
}

// ---- The stage: hosting and taking a quiz over the globe ---------------------------------------------

export function stage(app: App) {
  const card = h("div", { class: "stage-card" });
  const answers = h("div", { class: "stage-answers" });
  const side = h("div", { class: "stage-side" });
  const bar = h("div", { class: "present-bar" });
  const root = h("div", { class: "present stage" }, card, answers, side, bar);
  document.body.classList.add("presenting");
  document.body.append(root);
  marker ??= new WorkLayer(app, "work:quiz", "Quiz answers", "#ff375f", false);
  marker.clear();
  return { root, card, answers, side, bar, close() { root.remove(); document.body.classList.remove("presenting"); marker?.clear(); app.cancelPick(); } };
}

async function showView(app: App, x: Question) {
  if (x.kind === "map") { void showYear(app, null); return; }
  if (x.view) {
    void showYear(app, x.view.year ?? null).catch(() => {});
    await flyToView(app, x.view.camera, 2);
  }
}

export function revealMap(app: App, x: Extract<Question, { kind: "map" }>, guesses: { pt: [number, number]; color: string; label: string }[]) {
  marker!.set([
    ...guesses.map((g, i) => ({ id: `l${i}`, kind: "line" as const, pts: [g.pt, [x.lon, x.lat] as [number, number]], color: g.color, dashed: true })),
    ...guesses.map((g, i) => ({ id: `g${i}`, kind: "point" as const, pts: [g.pt], color: g.color, label: g.label })),
    { id: "answer", kind: "point", pts: [[x.lon, x.lat]], color: "#30d158", label: x.place },
  ]);
  app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(x.lon, x.lat, 3_500_000), duration: 1.8 });
}

/** On the class screen: one question at a time, a timer, teams and a scoreboard. */
function host(app: App, q: Quiz) {
  const teamsIn = prompt("Team names, separated by commas (or leave empty for no teams)", "Red, Blue, Yellow, Green");
  const teams = (teamsIn ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6).map((name, i) => ({ name, color: TILE[i], score: 0 }));
  const s = stage(app);
  let i = 0, timer = 0, revealed = false;
  const scoreboard = () => s.side.replaceChildren(...(teams.length ? [h("strong", {}, "Scores"), ...[...teams].sort((a, b) => b.score - a.score).map((t) =>
    h("div", { class: "stage-team", style: `--c:${t.color}` }, h("span", {}, t.name), h("b", {}, String(t.score))))] : []));
  const show = async () => {
    const x = q.questions[i];
    revealed = false;
    clearInterval(timer);
    marker!.clear();
    const clock = h("span", { class: "stage-clock" });
    s.card.replaceChildren(h("span", { class: "stage-num" }, `Question ${i + 1} of ${q.questions.length}`), h("h2", {}, x.prompt || "…"), q.seconds ? clock : "");
    s.answers.replaceChildren(...(x.kind === "choice" ? x.options.map((o, j) => h("div", { class: "stage-tile", style: `--c:${TILE[j]}` }, h("b", {}, LETTERS[j]), h("span", {}, o)))
      : x.kind === "truefalse" ? [h("div", { class: "stage-tile", style: `--c:${TILE[1]}` }, h("b", {}, "✓"), h("span", {}, "True")), h("div", { class: "stage-tile", style: `--c:${TILE[0]}` }, h("b", {}, "✗"), h("span", {}, "False"))]
      : [h("div", { class: "stage-hint" }, teams.length ? "Each team: come up and tap the globe, or call out a place." : "Point to it on the globe!")]));
    s.bar.replaceChildren(
      h("button", { class: "present-btn wide", onclick: () => reveal() }, "Reveal"),
      h("button", { class: "present-btn", "aria-label": "Next question", onclick: () => next() }, "›"),
      h("button", { class: "present-btn", "aria-label": "End quiz", onclick: () => end() }, "✕"));
    scoreboard();
    if (x.kind === "map" && teams.length) collectMapGuesses(x);
    await showView(app, x);
    if (q.seconds) {
      let left = q.seconds;
      clock.textContent = String(left);
      timer = window.setInterval(() => { left--; clock.textContent = String(Math.max(0, left)); clock.classList.toggle("low", left <= 5); if (left <= 0) { clearInterval(timer); reveal(); } }, 1000);
    }
  };
  let guesses: { pt: [number, number]; color: string; label: string; team: number }[] = [];
  const collectMapGuesses = (x: Extract<Question, { kind: "map" }>) => {
    guesses = [];
    const nextTeam = () => {
      const k = guesses.length;
      if (k >= teams.length || revealed) return;
      s.card.querySelector(".stage-turn")?.remove();
      s.card.append(h("p", { class: "stage-turn", style: `color:${teams[k].color}` }, `${teams[k].name}: tap the globe`));
      app.pickOnce(null, (p) => {
        guesses.push({ pt: [p.lon, p.lat], color: teams[k].color, label: teams[k].name, team: k });
        marker!.set(guesses.map((g, n) => ({ id: `g${n}`, kind: "point" as const, pts: [g.pt], color: g.color, label: g.label })));
        nextTeam();
      });
    };
    nextTeam();
    void x;
  };
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    clearInterval(timer);
    app.cancelPick();
    s.card.querySelector(".stage-turn")?.remove();
    const x = q.questions[i];
    if (x.kind === "map") {
      revealMap(app, x, guesses);
      // Points by distance, for each team that guessed.
      const lines = guesses.map((g) => {
        const pts = Math.round(mark(x, g.pt) * 100);
        teams[g.team].score += pts;
        return h("div", { class: "stage-tile small", style: `--c:${g.color}` }, h("b", {}, `+${pts}`), h("span", {}, `${g.label}: ${fmtDist(distanceKm(g.pt, [x.lon, x.lat]) * 1000)} away`));
      });
      s.answers.replaceChildren(...lines, h("div", { class: "stage-tile small right" }, h("b", {}, "✓"), h("span", {}, x.place)));
    } else {
      const right = x.kind === "choice" ? x.answer : x.answer ? 0 : 1;
      [...s.answers.children].forEach((el, j) => el.classList.add(j === right ? "right" : "dim"));
      // Teams that got it right: the teacher taps them.
      if (teams.length) s.answers.append(h("div", { class: "stage-award" }, h("span", {}, "Who got it?"), ...teams.map((t) => {
        const b = h("button", { class: "stage-award-btn", style: `--c:${t.color}`, onclick: () => { if (b.classList.contains("on")) return; b.classList.add("on"); t.score += 100; scoreboard(); } }, t.name);
        return b;
      })));
    }
    if (x.explain) s.card.append(h("p", { class: "stage-explain" }, x.explain));
    scoreboard();
    s.bar.replaceChildren(
      h("button", { class: "present-btn wide", onclick: () => next() }, i + 1 >= q.questions.length ? "Final scores" : "Next question"),
      h("button", { class: "present-btn", "aria-label": "End quiz", onclick: () => { s.card.dataset.done = "1"; end(); } }, "✕"));
  };
  const next = () => { if (!revealed) return reveal(); if (i + 1 >= q.questions.length) return end(); i++; void show(); };
  const end = () => {
    clearInterval(timer);
    if (!teams.length || s.card.dataset.done) { s.close(); removeEventListener("keydown", onKey); return; }
    s.card.dataset.done = "1";
    const ranked = [...teams].sort((a, b) => b.score - a.score);
    s.card.replaceChildren(h("span", { class: "stage-num" }, "Final scores"), h("h2", {}, `🏆 ${ranked[0].name} wins!`));
    s.answers.replaceChildren(...ranked.map((t, k) => h("div", { class: "stage-tile podium", style: `--c:${t.color};--k:${k}` }, h("b", {}, String(t.score)), h("span", {}, t.name))));
    s.side.replaceChildren();
    s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => end() }, "Close"));
    confetti(s.root);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { s.card.dataset.done = "1"; end(); } else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); } };
  addEventListener("keydown", onKey);
  void show();
}

export const distanceKm = (a: [number, number], b: [number, number]) => {
  const R = 6371, rad = Math.PI / 180, dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/** A burst of confetti (skipped for reduced motion). */
export function confetti(host: HTMLElement) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = h("div", { class: "confetti", "aria-hidden": "true" });
  for (let k = 0; k < 80; k++)
    box.append(h("i", { style: `left:${Math.random() * 100}%;background:${TILE[k % TILE.length]};animation-delay:${Math.random() * 0.6}s;animation-duration:${2 + Math.random() * 1.5}s;transform:rotate(${Math.random() * 360}deg)` }));
  host.append(box);
  setTimeout(() => box.remove(), 4000);
}

/** A student taking the quiz on their own device. */
export function take(app: App, q: Quiz, ctx?: WorkCtx) {
  const s = stage(app);
  const answers: Answer[] = [];
  let i = -1;
  let student = "";
  const start = () => {
    const name = h("input", { class: "stage-name", placeholder: "Your name", "aria-label": "Your name" }) as HTMLInputElement;
    s.card.replaceChildren(h("span", { class: "stage-num" }, `${q.questions.length} questions`), h("h2", {}, q.title), name);
    s.answers.replaceChildren();
    s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => { student = name.value.trim() || "Student"; next(); } }, "Start"), h("button", { class: "present-btn", "aria-label": "Close", onclick: () => s.close() }, "✕"));
    name.focus();
  };
  const next = async () => {
    i++;
    if (i >= q.questions.length) return finish();
    const x = q.questions[i];
    marker!.clear();
    s.card.replaceChildren(h("span", { class: "stage-num" }, `Question ${i + 1} of ${q.questions.length}`), h("h2", {}, x.prompt));
    const choose = (a: Answer) => { answers[i] = a; feedback(a); };
    if (x.kind === "choice") s.answers.replaceChildren(...x.options.map((o, j) => h("button", { class: "stage-tile", style: `--c:${TILE[j]}`, onclick: () => choose(j) }, h("b", {}, LETTERS[j]), h("span", {}, o))));
    else if (x.kind === "truefalse") s.answers.replaceChildren(h("button", { class: "stage-tile", style: `--c:${TILE[1]}`, onclick: () => choose(true) }, h("b", {}, "✓"), h("span", {}, "True")), h("button", { class: "stage-tile", style: `--c:${TILE[0]}`, onclick: () => choose(false) }, h("b", {}, "✗"), h("span", {}, "False")));
    else {
      s.answers.replaceChildren(h("div", { class: "stage-hint" }, "Tap the globe where you think it is. Zoom and turn it first if you need to."));
      app.pickOnce(null, (p) => choose([p.lon, p.lat]));
    }
    s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => { if (answers[i] === undefined) { answers[i] = null; app.cancelPick(); } void next(); } }, "Skip"), h("button", { class: "present-btn", "aria-label": "Close", onclick: () => s.close() }, "✕"));
    await showView(app, x);
  };
  const feedback = (a: Answer) => {
    const x = q.questions[i];
    const m = mark(x, a);
    if (x.kind === "map") {
      revealMap(app, x, [{ pt: a as [number, number], color: "#0a84ff", label: "You" }]);
      s.answers.replaceChildren(h("div", { class: "stage-tile small " + (m >= 1 ? "right" : m > 0 ? "" : "wrong") }, h("b", {}, m >= 1 ? "✓" : `${Math.round(m * 100)}%`), h("span", {}, `${fmtDist(distanceKm(a as [number, number], [x.lon, x.lat]) * 1000)} from ${x.place}`)));
    } else {
      const right = x.kind === "choice" ? x.answer : x.answer ? 0 : 1;
      const picked = x.kind === "choice" ? (a as number) : a ? 0 : 1;
      [...s.answers.children].forEach((el, j) => { (el as HTMLButtonElement).disabled = true; el.classList.add(j === right ? "right" : j === picked ? "wrong" : "dim"); });
    }
    if (x.explain) s.card.append(h("p", { class: "stage-explain" }, x.explain));
    s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => void next() }, i + 1 >= q.questions.length ? "Finish" : "Next"));
  };
  const finish = async () => {
    marker!.clear();
    const { score, total } = markAll(q, answers);
    const result: Result = { quiz: q.id, title: q.title, student, answers, score, total, at: Date.now() };
    const code = await pack(result);
    s.card.replaceChildren(h("span", { class: "stage-num" }, q.title), h("h2", {}, `${student}: ${score} out of ${total}`),
      h("p", {}, score / total >= 0.8 ? "Brilliant work! 🌍" : score / total >= 0.5 ? "Good effort. Look again at the ones you missed." : "Keep exploring the globe and try again!"));
    s.answers.replaceChildren(
      h("div", { class: "stage-code" }, h("span", {}, "Send this code to your teacher:"), h("textarea", { readonly: true, rows: 3, onclick: (e: Event) => (e.target as HTMLTextAreaElement).select() }, code)));
    s.bar.replaceChildren(
      h("button", { class: "present-btn wide", onclick: async () => { try { await navigator.clipboard.writeText(code); app.toast("Copied.", 2000); } catch { /* select the box instead */ } } }, "Copy code"),
      h("button", { class: "present-btn wide", onclick: () => download(`${q.title} - ${student}.json`, JSON.stringify(result)) }, "Save file"),
      h("button", { class: "present-btn", "aria-label": "Close", onclick: () => { s.close(); ctx?.unhide(); } }, "✕"));
    if (score / total >= 0.8) confetti(s.root);
  };
  start();
}

/** Opening a student link: #quiz=… */
export async function openQuizLink(app: App, code: string) {
  try {
    const q = await unpack<Quiz>(code);
    if (!validQuiz(q)) throw new Error();
    take(app, q);
  } catch {
    app.toast("That quiz link is incomplete. Ask your teacher to send it again.", 6000);
  }
}
