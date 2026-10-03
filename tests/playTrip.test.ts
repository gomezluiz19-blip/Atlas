import { describe, expect, it } from "vitest";
import { stepCaption } from "../src/travel/playTrip";
import type { Journey } from "../src/work/journeyModel";

const lisbon = { name: "Lisbon", lon: -9.14, lat: 38.72 };
const j: Journey = {
  id: "t", name: "Lisbon in October", start: "2026-10-24", time: "09:00", created: 0,
  origin: { name: "London", lon: -0.13, lat: 51.51 },
  steps: [
    { id: "a", kind: "move", mode: "fly", to: lisbon },
    { id: "b", kind: "stay", place: lisbon, nights: 5, visits: [{ id: "v", name: "Belém", day: 1 }] },
  ],
};

describe("trip captions", () => {
  it("captions leaving, the flight and the stay", () => {
    expect(stepCaption(j, -1)).toEqual({ title: "Leaving London", sub: "Lisbon in October" });
    const fly = stepCaption(j, 0);
    expect(fly.title).toBe("✈️ Fly to Lisbon");
    expect(fly.sub).toMatch(/km · about/);
    expect(stepCaption(j, 1)).toEqual({ title: "Lisbon", sub: "5 nights · Belém" });
  });
  it("sums up the whole trip", () => expect(stepCaption(j, -2).sub).toMatch(/5 nights · the whole trip$/));
});
