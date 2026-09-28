import { describe, expect, it } from "vitest";
import { addDays, defaultSchedule, massing, overall, plannedPct, status, weatherRisks, PHASES } from "../src/work/buildModel";
import { age, dueDate, dueList, gain, grazing, thi, type Animal } from "../src/work/flockModel";
import { gradebook, mark, markAll, pack, unpack, validQuiz, type Quiz } from "../src/work/quizModel";
import { ACTIONS, newGame, pairKey, resolveTurn, wellbeing } from "../src/work/simModel";
import { tripNumbers, type FieldTrip } from "../src/work/tripModel";
import { guessPoints, yearPoints } from "../src/work/games";

describe("build", () => {
  const phases = defaultSchedule("2026-01-01", 6, 3000);
  it("makes a schedule in phase order that grows with floors", () => {
    expect(phases.map((p) => p.id)).toEqual(PHASES.map((p) => p.id));
    for (const p of phases) expect(p.end > p.start).toBe(true);
    const tall = defaultSchedule("2026-01-01", 20, 3000);
    expect(tall[tall.length - 1].end > phases[phases.length - 1].end).toBe(true);
    // Envelope overlaps the structure.
    expect(phases[3].start < phases[2].end).toBe(true);
  });
  it("tracks planned against actual", () => {
    expect(plannedPct(phases[0], "2025-12-01")).toBe(0);
    expect(plannedPct(phases[0], "2030-01-01")).toBe(100);
    expect(overall(phases, () => 100)).toBeCloseTo(100);
    const mid = phases[2].start;
    const behind = status(phases.map((p) => ({ ...p, done: p.id === "site" ? 100 : 0 })), mid);
    expect(behind.behindDays).toBeGreaterThan(10);
    expect(behind.finish > phases[phases.length - 1].end).toBe(true);
    expect(behind.current).toBe("foundations");
    const done = status(phases.map((p) => ({ ...p, done: 100 })), mid);
    expect(done.actual).toBeCloseTo(100);
    expect(done.current).toBeNull();
  });
  it("turns progress into a building", () => {
    const m = massing(10, (id) => ({ site: 100, foundations: 100, structure: 55, envelope: 20, services: 0, interiors: 0, handover: 0 })[id]);
    expect(m.framed).toBeCloseTo(5.5);
    expect(m.closed).toBe(2);
    expect(m.crane).toBe(true);
    expect(m.complete).toBe(false);
  });
  it("flags days the weather stops work", () => {
    const r = weatherRisks([
      { date: "a", rain: 0, rainChance: 0, windMax: 10, gustMax: 20, tmin: 8, tmax: 20 },
      { date: "b", rain: 12, rainChance: 90, windMax: 45, gustMax: 75, tmin: -1, tmax: 5 },
    ]);
    expect(r[0].ok).toBe(true);
    expect(r[1]).toMatchObject({ ok: false, crane: false, pour: false });
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });
});

describe("flock", () => {
  const cow = (w: [string, number][], extra: Partial<Animal> = {}): Animal => ({ id: "1", species: "cattle", name: "Daisy", status: "Active", weights: w.map(([date, kg]) => ({ date, kg })), health: [], ...extra });
  it("gives ages in words", () => {
    expect(age("2026-01-01", "2026-01-13")).toBe("12 days");
    expect(age("2025-01-01", "2026-01-01")).toBe("12 mo");
    expect(age("2023-01-01", "2026-03-15")).toBe("3 yr 2 mo");
  });
  it("works out daily gain", () => {
    const g = gain([["2026-01-01", 300], ["2026-02-01", 331], ["2026-03-03", 361]].map(([d, k]) => ({ date: d as string, kg: k as number })));
    expect(g.last).toBeCloseTo(1);
    expect(g.overall).toBeCloseTo(61 / 61);
  });
  it("lists what's due, overdue first", () => {
    const a = cow([], { health: [{ id: "h", date: "2026-01-01", kind: "vaccination", text: "Booster", due: "2026-03-01" }], bred: "2025-06-01" });
    expect(dueDate("cattle", "2025-06-01")).toBe("2026-03-11");
    const list = dueList([a], "2026-03-05");
    expect(list.map((d) => [d.what, d.overdue])).toEqual([["Booster", true], ["Due to give birth", false]]);
  });
  it("estimates grazing and heat stress", () => {
    const g = grazing(2, 2000, [cow([["2026-01-01", 500]]), cow([])]);
    expect(g.au).toBe(2);
    expect(g.intake).toBeCloseTo(500 * 0.025 + 550 * 0.025);
    expect(g.days).toBeCloseTo((2 * 2000 * 0.5) / g.intake);
    expect(thi(20, 50).level).toBe("none");
    expect(thi(30, 65).level).toBe("danger");
    expect(thi(32, 70).level).toBe("emergency");
  });
});

describe("quizzes", () => {
  const quiz: Quiz = { id: "q", title: "T", created: 0, questions: [
    { id: "1", kind: "choice", prompt: "?", options: ["a", "b"], answer: 1 },
    { id: "2", kind: "truefalse", prompt: "?", answer: false },
    { id: "3", kind: "map", prompt: "Paris", place: "Paris", lon: 2.35, lat: 48.86, tolerance: 100 },
  ] };
  it("marks answers, with partial marks for near misses on the map", () => {
    expect(mark(quiz.questions[0], 1)).toBe(1);
    expect(mark(quiz.questions[1], true)).toBe(0);
    expect(mark(quiz.questions[2], [2.4, 48.9])).toBe(1);
    const near = mark(quiz.questions[2], [4.84, 45.76]); // Lyon, ~390 km
    expect(near).toBeGreaterThan(0.2);
    expect(near).toBeLessThan(0.4);
    expect(mark(quiz.questions[2], [139.7, 35.7])).toBe(0);
    expect(markAll(quiz, [1, false, null]).score).toBe(2);
  });
  it("packs a quiz into a link and back", async () => {
    const code = await pack(quiz);
    expect(code).toMatch(/^[\w-]+$/);
    expect(await unpack(code)).toEqual(quiz);
    expect(validQuiz(quiz)).toBe(true);
    expect(validQuiz({ title: "x", questions: [{ kind: "map", prompt: "?" }] })).toBe(false);
  });
  it("keeps each student's latest attempt", () => {
    const book = gradebook(quiz, [
      { quiz: "q", title: "T", student: "Ana", answers: [0, false, null], score: 1, total: 3, at: 1 },
      { quiz: "q", title: "T", student: "ana ", answers: [1, false, [2.35, 48.86]], score: 3, total: 3, at: 2 },
      { quiz: "q", title: "T", student: "Ben", answers: [1, true, null], score: 1, total: 3, at: 1 },
      { quiz: "other", title: "X", student: "Cy", answers: [], score: 0, total: 0, at: 1 },
    ]);
    expect(book.rows.map((r) => [r.student.trim(), r.score])).toEqual([["ana", 3], ["Ben", 1]]);
    expect(book.perQuestion).toEqual([1, 0.5, 0.5]);
  });
});

describe("World Summit", () => {
  const teams = [
    { team: "Red", name: "Brazil", color: "#f00", lon: -47.9, lat: -15.8 },
    { team: "Blue", name: "Japan", color: "#00f", lon: 139.7, lat: 35.7 },
    { team: "Green", name: "Kenya", color: "#0f0", lon: 36.8, lat: -1.3 },
  ];
  it("is deterministic for a seed", () => {
    const g = newGame("g", "Test", teams, 6, 42);
    expect(resolveTurn(g, {})).toEqual(resolveTurn(g, {}));
    expect(resolveTurn(g, {}).turn).toBe(2);
    expect(g.turn).toBe(1); // pure
  });
  it("applies trade, alliances and sanctions", () => {
    const g = newGame("g", "Test", teams, 6, 7);
    g.relations[pairKey("n0", "n1")] = 50;
    const after = resolveTurn(g, { n0: [{ action: "trade", target: "n1" }, { action: "alliance", target: "n1" }], n2: [{ action: "sanction", target: "n0" }] });
    expect(after.trade).toContain(pairKey("n0", "n1"));
    expect(after.alliances).toContain(pairKey("n0", "n1"));
    expect(after.sanctions).toContain("n2>n0");
    expect(after.nations[0].treasury).toBeLessThan(g.nations[0].treasury - ACTIONS.trade.cost - ACTIONS.alliance.cost + 30);
    for (const n of after.nations) for (const k of ["economy", "security", "stability", "environment"] as const) { expect(n[k]).toBeGreaterThanOrEqual(0); expect(n[k]).toBeLessThanOrEqual(100); }
    expect(after.news.some((x) => x.text.includes("sign a trade deal"))).toBe(true);
  });
  it("refuses an alliance without trust, and what you can't afford", () => {
    const g = newGame("g", "Test", teams, 6, 3);
    g.relations[pairKey("n0", "n2")] = -50;
    g.nations[1].treasury = 0;
    const after = resolveTurn(g, { n0: [{ action: "alliance", target: "n2" }], n1: [{ action: "invest" }] });
    expect(after.alliances).toEqual([]);
    expect(after.news.some((x) => x.text.includes("can't afford"))).toBe(true);
    expect(wellbeing(after.nations[0])).toBeGreaterThan(0);
  });
});

describe("field trips and games", () => {
  it("works out buses, adults, times and costs", () => {
    const t: FieldTrip = { id: "t", title: "", school: { name: "S", lon: 0, lat: 51 }, dest: { name: "D", lon: 0, lat: 51.45 }, date: "2026-05-01", depart: "08:30", hours: 3, students: 58, grade: "35", ratio: 8, seats: 50, busPerKm: 3, fee: 5, notes: "", checklist: [] };
    const n = tripNumbers(t);
    expect(n.straight).toBeCloseTo(50, 0);
    expect(n.adults).toBe(8);
    expect(n.buses).toBe(2);
    expect(n.times.leave).toBe("08:30");
    expect(n.times.arrive).toBe("10:12"); // 65 km at 45 km/h + 15 min loading
    expect(n.total).toBeCloseTo(2 * n.km * 2 * 3 + 58 * 5);
  });
  it("scores guesses", () => {
    expect(guessPoints(0)).toBe(1000);
    expect(guessPoints(700)).toBeGreaterThan(450);
    expect(guessPoints(5000)).toBeLessThan(10);
    expect(yearPoints(1914, 1914)).toBe(1000);
    expect(yearPoints(1920, 1914)).toBe(750);
    expect(yearPoints(-500, 1914)).toBe(0);
  });
});
