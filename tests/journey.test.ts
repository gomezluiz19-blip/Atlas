import { describe, expect, it } from "vitest";
import { guessMode, parseDate, parseSteps, timeline, whereAfter, type Journey } from "../src/work/journeyModel";

const spot = (name: string, lon: number, lat: number) => ({ name, lon, lat });
const DC = spot("Washington", -77.04, 38.9), MNL = spot("Manila", 120.98, 14.6), HOTEL = spot("The Peninsula", 121.02, 14.555), BAG = spot("Baguio", 120.59, 16.41);

describe("parseSteps", () => {
  it("reads a whole trip in one line", () => {
    const d = parseSteps("From Washington DC on 12 Oct, fly to Manila, taxi to the Peninsula Manila, stay 3 nights, train to Baguio then stay 2 nights");
    expect(d.map((x) => x.kind)).toEqual(["origin", "move", "move", "stay", "move", "stay"]);
    expect(d[0]).toMatchObject({ query: "Washington DC" });
    expect(d[0].kind === "origin" && d[0].date?.endsWith("-10-12")).toBe(true);
    expect(d[1]).toMatchObject({ mode: "fly", query: "Manila" });
    expect(d[2]).toMatchObject({ mode: "taxi", query: "Peninsula Manila" });
    expect(d[3]).toMatchObject({ nights: 3 });
    expect(d[4]).toMatchObject({ mode: "train", query: "Baguio" });
  });
  it("understands other ways of saying it", () => {
    expect(parseSteps("to Baguio by bus")[0]).toMatchObject({ kind: "move", mode: "bus", query: "Baguio" });
    expect(parseSteps("take the train to Kyoto at 8am")[0]).toMatchObject({ mode: "train", query: "Kyoto", at: "08:00" });
    expect(parseSteps("spend two days in Cebu")[0]).toMatchObject({ kind: "stay", nights: 2, query: "Cebu" });
    expect(parseSteps("stay at the Hilton for 4 nights")[0]).toMatchObject({ kind: "stay", nights: 4, query: "Hilton" });
    expect(parseSteps("visit Intramuros on day 2")[0]).toMatchObject({ kind: "visit", query: "Intramuros", day: 1 });
    expect(parseSteps("fly home")[0]).toMatchObject({ kind: "move", mode: "fly", home: true });
    expect(parseSteps("bus back to school")[0]).toMatchObject({ kind: "move", mode: "bus", home: true });
    expect(parseSteps("go to Cebu")[0]).toMatchObject({ kind: "move", mode: null, query: "Cebu" });
    expect(parseSteps("stay 3 hours")[0]).toMatchObject({ kind: "stay", hours: 3 });
    expect(parseSteps("Paris, Texas")).toEqual([]);
  });
  it("keeps commas inside place names", () => {
    expect(parseSteps("fly to Portland, Oregon")[0]).toMatchObject({ query: "Portland, Oregon" });
  });
});

describe("parseDate", () => {
  it("reads common forms, rolling into next year when past", () => {
    expect(parseDate("12 Oct", "2026-09-28")).toBe("2026-10-12");
    expect(parseDate("Oct 12th", "2026-09-28")).toBe("2026-10-12");
    expect(parseDate("3 Jan", "2026-09-28")).toBe("2027-01-03");
    expect(parseDate("nonsense")).toBeUndefined();
  });
});

describe("timeline", () => {
  const j: Journey = { id: "j", name: "Philippines", start: "2026-10-12", time: "09:00", origin: DC, created: 0, steps: [
    { id: "1", kind: "move", mode: "fly", to: MNL },
    { id: "2", kind: "move", mode: "taxi", to: HOTEL },
    { id: "3", kind: "stay", place: HOTEL, nights: 3, visits: [] },
    { id: "4", kind: "move", mode: "train", to: BAG, at: "08:00" },
  ] };
  it("chains steps in time with each leg's own mode", () => {
    const t = timeline(j);
    const [fly, taxi, stay, train] = t.rows as any[];
    expect(fly.km).toBeGreaterThan(13_000);
    expect(fly.hours).toBeGreaterThan(18);
    expect(taxi.start).toBe(fly.end);
    expect(taxi.hours).toBeLessThan(1);
    expect(stay.days).toHaveLength(4);
    // Checks out at ten; the 8 o'clock train is the next morning after that.
    expect(new Date(stay.end * 60000).toISOString().slice(11, 16)).toBe("10:00");
    expect(train.start - stay.end).toBe(22 * 60);
    expect(t.nights).toBe(3);
    expect(t.byMode.fly?.n).toBe(1);
  });
  it("knows where you are after each step", () => {
    expect(whereAfter(j, 0)).toBe(DC);
    expect(whereAfter(j, 4)).toBe(BAG);
  });
  it("guesses a sensible mode by distance", () => {
    expect(guessMode(9000)).toBe("fly");
    expect(guessMode(200)).toBe("drive");
    expect(guessMode(5)).toBe("taxi");
    expect(guessMode(0.8)).toBe("walk");
  });
});
