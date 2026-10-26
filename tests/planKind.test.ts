import { describe, expect, it } from "vitest";
import { planKindFor, planNameFrom, PLAN_TYPES } from "../src/work/planModel";

describe("planning anything", () => {
  it("reads the kind of plan from how people say it", () => {
    expect(planKindFor("A week in Lisbon")).toBe("general");
    expect(planKindFor("road trip to the coast")).toBe("trip");
    expect(planKindFor("Ana's 30th")).toBe("event");
    expect(planKindFor("our wedding")).toBe("event");
    expect(planKindFor("where to open a new café")).toBe("business");
    expect(planKindFor("a new bike lane on Mill St")).toBe("infrastructure");
    expect(planKindFor("our delivery area")).toBe("policy");
    expect(planKindFor("moving house in March")).toBe("general");
  });
  it("names the plan with the person's words", () => {
    expect(planNameFrom("  planning a   surprise for Sam ")).toBe("Surprise for Sam");
    expect(planNameFrom("ana's 30th")).toBe("Ana's 30th");
    expect(planNameFrom("")).toBe("");
  });
  it("offers every kind in plain words, ending with anything else", () => {
    const kinds = Object.keys(PLAN_TYPES);
    expect(kinds[kinds.length - 1]).toBe("general");
    for (const k of kinds) expect(PLAN_TYPES[k as keyof typeof PLAN_TYPES].label).not.toMatch(/^(Policy|Infrastructure|Business)$/);
  });
});
