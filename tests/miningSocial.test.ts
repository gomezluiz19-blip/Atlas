import { describe, expect, it } from "vitest";
import { addDays } from "../src/pro/kit/ops";
import { reportHtml, toCsv } from "../src/pro/kit/report";
import { advance, commitmentStatus, downstream, flowPath, gistmClass, goingCold, grievanceKpis, sla, stageOf, type Grievance } from "../src/pro/mining/social";
import { demoMine } from "../src/pro/mining/demo";

const T = "2026-10-01";
const g = (opened: number, extra: Partial<Grievance> = {}): Grievance => ({ id: String(Math.random()), title: "x", opened: addDays(T, opened), updated: addDays(T, opened), status: "open", severity: 2, ...extra });

describe("grievance mechanism", () => {
  it("stamps dates as a grievance moves through its stages", () => {
    let x = g(-10);
    expect(stageOf(x)).toBe("received");
    x = advance(x, "acknowledged", addDays(T, -8));
    expect(x.acknowledged).toBe(addDays(T, -8));
    x = advance(x, "closed", T, "fixed");
    expect([x.status, x.responded, x.closed]).toEqual(["closed", T, T]);
    expect(x.history?.map((h) => h.text)).toEqual(["Acknowledged", "Closed: fixed"]);
    x = advance(x, "appealed", T);
    expect([x.status, x.closed]).toEqual(["open", undefined]);
  });
  it("flags late acknowledgements and responses", () => {
    expect(sla(g(-9), T).lateAck).toBe(true);
    expect(sla(g(-9, { acknowledged: addDays(T, -8) }), T).lateAck).toBe(false);
    expect(sla(g(-31, { acknowledged: addDays(T, -30) }), T).lateResponse).toBe(true);
  });
  it("measures the mechanism the way a board asks", () => {
    const gs = [
      g(-40, { acknowledged: addDays(T, -38), responded: addDays(T, -20), closed: addDays(T, -10), satisfied: true, stage: "closed", status: "closed", party: "a", category: "Water" }),
      g(-60, { acknowledged: addDays(T, -45), responded: addDays(T, -20), closed: addDays(T, -20), satisfied: false, stage: "closed", status: "closed", party: "a", category: "Water" }),
      g(-5, { party: "a", category: "Dust and noise" }),
      g(-12, { party: "b" }),
    ];
    const k = grievanceKpis(gs, T);
    expect(k.ackOnTime).toBe(0.5);
    expect(k.respondOnTime).toBe(0.5);
    expect(k.medianDaysToClose).toBe(35);
    expect(k.satisfaction).toBe(0.5);
    expect(k.lateAck).toBe(1);
    expect(k.repeat).toEqual([{ party: "a", n: 3 }]);
    expect(k.byCategory[0]).toEqual({ cat: "Water", n: 2 });
    expect(k.months.length).toBe(12);
  });
  it("tracks commitments and who has gone quiet", () => {
    const s = commitmentStatus([
      { id: "1", text: "a", made: T, due: addDays(T, -2), status: "open" }, { id: "2", text: "b", made: T, due: addDays(T, 10), status: "open" },
      { id: "3", text: "c", made: T, due: addDays(T, 5), status: "done", done: addDays(T, 1) },
    ], T);
    expect([s.overdue.length, s.soon.length, s.kept, s.keptOnTime]).toEqual([1, 1, 1, 1]);
    const cold = goingCold([{ id: "a", name: "A", kind: "x", mood: "neutral", log: [{ at: addDays(T, -100), text: "" }] }, { id: "b", name: "B", kind: "x", mood: "neutral", log: [] }, { id: "c", name: "C", kind: "x", mood: "neutral", log: [{ at: addDays(T, -3), text: "" }] }], T);
    expect(cold.map((c) => c.p.name)).toEqual(["B", "A"]);
  });
  it("gives the demo a working register", () => {
    const k = grievanceKpis(demoMine().issues, T);
    expect(k.total).toBeGreaterThan(5);
    expect(k.satisfaction).not.toBeNull();
  });
});

describe("tailings flow path and GISTM class", () => {
  it("runs downhill across a tilted grid to the low edge", () => {
    const n = 11, hs = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hs[j * n + i] = 100 - i * 5 + Math.abs(j - 5); // falls east, valley along the middle row
    const p = flowPath(hs, n, [5, 5]);
    expect(p[p.length - 1][0]).toBe(n - 1);
    expect(p.every(([, j]) => j === 5)).toBe(true);
  });
  it("finds places near the path in order down it", () => {
    const path: [number, number][] = [[0, 0], [0.1, 0], [0.2, 0]];
    const d = downstream([{ lon: 0.15, lat: 0.005 }, { lon: 0.05, lat: 0.01 }, { lon: 0.1, lat: 0.2 }], path, 2);
    expect(d.map((x) => x.p.lon)).toEqual([0.05, 0.15]);
    expect(d[1].along).toBeGreaterThan(d[0].along);
  });
  it("classes consequence by population at risk", () => {
    expect([0, 5, 50, 500, 5000].map((p) => gistmClass(p).label)).toEqual(["Low", "Significant", "High", "Very high", "Extreme"]);
  });
});

describe("reports", () => {
  it("quotes CSV cells that need it and builds a printable page", () => {
    expect(toCsv(["a", "b"], [["x, y", 'say "hi"'], [1, undefined]])).toBe('a,b\n"x, y","say ""hi"""\n1,');
    const html = reportHtml("Title <x>", "sub", [{ heading: "K", kpis: [["1", "one"]] }, { heading: "L", lines: ["a"] }, { heading: "T", table: { head: ["h"], rows: [["v"]] } }]);
    expect(html).toContain("Title &lt;x&gt;");
    expect(html).toContain("<td>v</td>");
  });
});
