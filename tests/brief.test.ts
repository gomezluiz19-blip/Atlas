import { describe, expect, it } from "vitest";
import { aheadLede, aheadNotes, countryOfWords, dayNote, hoursLede, peopleLede, peopleSummary, tempColor, type DayWx } from "../src/brief/model";

const now = new Date("2026-10-09T12:00:00Z");
const day = (o: Partial<DayWx>): DayWx => ({ date: "2026-10-11", code: 1, max: 20, min: 10, rain: 0, chance: 10, gust: 20, snow: 0, ...o });

describe("people front", () => {
  const home = { lon: -73.92, lat: 41.29 };
  const people = [
    { name: "Grandma Rose", where: "Lisbon, Portugal", lon: -9.14, lat: 38.72, tz: "Europe/Lisbon" },
    { name: "Sam Rivera", where: "Los Angeles, California, United States", lon: -118.24, lat: 34.05, tz: "America/Los_Angeles" },
    { name: "Priya Nair", where: "New York, NY, United States", lon: -73.99, lat: 40.73, tz: "America/New_York" },
    { name: "Kenji", where: "Tokyo, Japan", lon: 139.69, lat: 35.69, tz: "Asia/Tokyo" },
  ];
  it("sums up where they are", () => {
    const s = peopleSummary(people, home, now);
    expect(s).toMatchObject({ count: 4, countries: 3, zones: 4, known: 4 });
    expect(s.farthest?.p.name).toBe("Kenji");
    // 12:00 UTC: Lisbon 13, LA 5, New York 8, Tokyo 21.
    expect(s.awake).toBe(3);
  });
  it("says it in a sentence", () => {
    const l = peopleLede(peopleSummary(people, home, now));
    expect(l.title).toBe("Your 4 people span 3 countries and 4 time zones.");
    expect(l.line).toContain("3 are likely awake now.");
    expect(l.line).toContain("Kenji is farthest, 10,");
    expect(peopleLede(peopleSummary([], home, now)).title).toBe("Who are your people?");
    expect(countryOfWords("Lisbon, Portugal")).toBe("Portugal");
  });
});

describe("weather on the days that matter", () => {
  it("reads a day for being out in it", () => {
    expect(dayNote(day({ code: 95 })).tone).toBe("storm");
    expect(dayNote(day({ chance: 80, rain: 12 }))).toMatchObject({ tone: "rain", advice: "A wet one: waterproofs, not just an umbrella." });
    expect(dayNote(day({ max: 34 })).words).toBe("Very hot, 34°");
    expect(dayNote(day({ min: -3 })).tone).toBe("cold");
    expect(dayNote(day({ snow: 4, code: 73 })).words).toContain("about 4 cm");
    expect(dayNote(day({})).tone).toBe("fine");
  });
  it("puts the forecast on your plans, once per trip and day, within reach", () => {
    const plans = [
      { id: "a", title: "Lisbon", sub: "Trip", date: "2026-10-11", lon: -9.1, lat: 38.7, group: "t" },
      { id: "b", title: "Lisbon, second stop", sub: "Trip", date: "2026-10-11", lon: -9.1, lat: 38.7, group: "t" },
      { id: "c", title: "Hike", sub: "Plan", date: "2026-10-13", lon: -74, lat: 41.4 },
      { id: "d", title: "Far off", sub: "Plan", date: "2026-11-30", lon: 0, lat: 0 },
    ];
    const notes = aheadNotes(plans, (p) => (p.id === "c" ? [day({ date: "2026-10-13", chance: 70, rain: 5 })] : [day({ max: 31 })]), "2026-10-09");
    expect(notes.map((n) => [n.plan.title, n.tone, n.inDays])).toEqual([["Lisbon", "hot", 2], ["Hike", "rain", 4]]);
    expect(aheadLede(notes)).toBe("2 of your plans meet rough weather, starting in 2 days with heat.");
    expect(aheadLede(aheadNotes(plans.slice(2, 3), () => [day({ date: "2026-10-13" })], "2026-10-09"))).toBe("Your plan ahead looks dry and settled.");
  });
  it("says what the next hours hold", () => {
    const hrs = (temps: number[], chances: number[] = []) => temps.map((t, i) => ({ time: `2026-10-09T${String(9 + i).padStart(2, "0")}:00`, temp: t, chance: chances[i] ?? 0 }));
    expect(hoursLede(hrs([14, 15, 16, 17], [0, 10, 60, 80]), 14)).toBe("Rain likely from 11 am (60%).");
    expect(hoursLede(hrs([12, 14, 16, 18]), 12)).toBe("Dry, warming to 18° by 12 pm.");
    expect(hoursLede(hrs([15, 15, 15]), 15)).toBe("Dry and steady for the next twelve hours.");
  });
  it("colours a temperature in the pigments", () => {
    expect(tempColor(-20)).toBe("rgb(163,191,212)");
    expect(tempColor(20)).toBe("rgb(209,154,46)");
    expect(tempColor(50)).toBe("rgb(184,73,106)");
  });
});
