import { describe, expect, it } from "vitest";
import { control, countdown, electionDay, hemicycle, nextUsElection, partyColor, postalOfFips, tally, usSummary } from "../src/politics/model";

describe("politics arithmetic", () => {
  it("knows Election Day", () => {
    expect(electionDay(2026)).toBe("2026-11-03");
    expect(electionDay(2028)).toBe("2028-11-07");
    expect(electionDay(2030)).toBe("2030-11-05");
    expect(nextUsElection("2026-09-28").date).toBe("2026-11-03");
    expect(nextUsElection("2026-11-04").date).toBe("2028-11-07");
    expect(nextUsElection("2026-11-04").what).toMatch(/^President/);
    expect(nextUsElection("2027-03-01").date).toBe("2028-11-07");
  });
  it("counts seats and control", () => {
    const b = tally([...Array(53).fill("Republican"), ...Array(45).fill("Democrat"), "Independent", "Independent"]);
    expect(b.map((x) => [x.party, x.seats])).toEqual([["Republican", 53], ["Democrat", 45], ["Independent", 2]]);
    expect(control(b, 51, { Independent: "Democrat" })).toBe("Republican");
    expect(control(tally([...Array(49).fill("Republican"), ...Array(49).fill("Democrat"), "Independent", "Independent"]), 51, { Independent: "Democrat" })).toBe("Democrat");
    expect(control(tally([...Array(50).fill("A"), ...Array(50).fill("B")]), 51)).toBeNull();
    expect(usSummary("Republican", "Republican", "Republican")).toBe("Republicans hold the White House, the Senate and the House.");
    expect(usSummary("Democrat", "Republican", "Democrat")).toBe("Democrats hold the White House and the House; Republicans hold the Senate.");
  });
  it("lays out every seat once", () => {
    for (const n of [9, 100, 435, 650]) {
      const s = hemicycle(n);
      expect(s).toHaveLength(n);
      for (const p of s) expect(p.y).toBeGreaterThanOrEqual(-1e-9);
    }
  });
  it("names parties and places", () => {
    expect(partyColor("Republican")).toBe("#e5484d");
    expect(partyColor("Democratic Party")).toBe("#3b82f6");
    expect(partyColor("Some New Party")).toBe(partyColor("Some New Party"));
    expect(postalOfFips("6")).toBe("CA");
    expect(countdown("2026-11-03", "2026-09-28")).toBe("in 36 days");
  });
});
