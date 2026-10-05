import { describe, expect, it } from "vitest";
import { allSites, clockText, frameSites, joiner, localTime, menuFor, mergeSites, placeQuiz, quakeReachKm, quakesNear, ROOMS, roomOf, sitesIn, splitText, stepYear, TOOLS, workingHours } from "../src/tv/rooms";
import { hostable, starterQuiz } from "../src/tv/classroom";
import { CAPITALS } from "../src/work/gameData";

describe("rooms", () => {
  it("falls back to Home and gives every room tools that exist", () => {
    expect(roomOf(null).id).toBe("home");
    expect(roomOf("nope").id).toBe("home");
    for (const r of ROOMS) {
      for (const t of r.tools) expect(TOOLS[t], `${r.id}: ${t}`).toBeTruthy();
      expect(r.scenes.length).toBeGreaterThan(0);
    }
  });
  it("keeps Home's views, and gives teachers their tools", () => {
    expect(roomOf("home").scenes).toEqual(["live", "places", "markets", "home"]);
    expect(roomOf("home").tools).toEqual(expect.arrayContaining(["trip", "trips", "myplace", "scene:places", "scene:markets"]));
    expect(roomOf("classroom").tools).toEqual(expect.arrayContaining(["lesson", "quiz", "pointer", "spotlight", "pen", "timer", "timemachine"]));
  });
  it("puts the room's tools first, then change-room and exit", () => {
    const rows = menuFor(roomOf("ops"));
    expect(rows[0][0].id).toBe("sites");
    expect(rows[1].map((t) => t.id)).toEqual(["room", "exit"]);
  });
});

describe("sites from Pro workspaces", () => {
  it("finds named places in any shape, a few levels deep", () => {
    const data = [{ id: "a", name: "Acme", sites: [{ name: "Pit 3", lon: 120.5, lat: -23.2 }, { title: "Port", lng: 118.6, latitude: -20.3 }, { name: "Nowhere", lon: 0, lat: 0 }, { name: "Bad", lon: 500, lat: 2 }] }];
    const s = sitesIn(data, "Mining");
    expect(s.map((x) => x.name)).toEqual(["Pit 3", "Port"]);
    expect(s[0].tool).toBe("Mining");
  });
  it("reads every tool's storage and drops repeats", () => {
    const store: Record<string, string> = {
      "atlas.pro.mines.v1": JSON.stringify([{ name: "Mine", sites: [{ name: "Pit", lon: 10, lat: 10 }] }]),
      "atlas.pro.shipping.v1": JSON.stringify([{ ports: [{ name: "Pit again", lon: 10, lat: 10 }, { name: "Rotterdam", lon: 4.4, lat: 51.9 }] }]),
      "atlas.pro.build.v1": "not json",
    };
    const s = allSites((k) => store[k] ?? null);
    expect(s.map((x) => x.name)).toEqual(["Pit again", "Rotterdam"]);
    expect(mergeSites(s, [{ name: "R2", lon: 4.4, lat: 51.9, tool: "x" }, { name: "New", lon: 1, lat: 1, tool: "x" }]).length).toBe(3);
  });
  it("frames a fleet that crosses the date line from the short side", () => {
    const f = frameSites([{ lon: 179, lat: 0 }, { lon: -179, lat: 0 }]);
    expect(Math.abs(Math.abs(f.lon) - 180)).toBeLessThan(0.01);
    expect(f.height).toBeLessThan(2_000_000);
  });
});

describe("hazards", () => {
  it("reaches further for bigger quakes", () => {
    expect(quakeReachKm(3)).toBeLessThan(quakeReachKm(5));
    expect(quakeReachKm(9)).toBeLessThanOrEqual(1500);
  });
  it("finds quakes within reach of a site, biggest first", () => {
    const site = { name: "Mine", lon: 140, lat: 36, tool: "Mining" };
    const near = quakesNear([{ lon: 140.3, lat: 36.1, mag: 4.1 }, { lon: 141, lat: 37, mag: 6.2 }, { lon: -70, lat: -30, mag: 7 }], [site]);
    expect(near.map((n) => n.quake.mag)).toEqual([6.2, 4.1]);
    expect(near[1].km).toBeLessThan(40);
  });
});

describe("clocks and classroom", () => {
  it("tells the time in a zone and who's working", () => {
    const t = localTime("Asia/Tokyo", new Date("2026-03-02T01:30:00Z"));
    expect(t).toEqual({ time: "10:30", hour: 10, day: "Mon" });
    expect(workingHours(10, "Mon")).toBe(true);
    expect(workingHours(10, "Sat")).toBe(false);
    expect(workingHours(19, "Tue")).toBe(false);
    expect(localTime("Not/AZone").time).toBe("--:--");
  });
  it("counts down", () => {
    expect(clockText(245)).toBe("4:05");
    expect(clockText(8.2)).toBe("0:09");
    expect(clockText(-3)).toBe("0:00");
  });
  it("steps through the years borders exist for", () => {
    const ys = [-500, 1, 400, 1492, 1914];
    expect(stepYear(ys, 1492, 1)).toBe(1914);
    expect(stepYear(ys, 1492, -1)).toBe(400);
    expect(stepYear(ys, 1000, 1)).toBe(1492);
    expect(stepYear(ys, 1000, -1)).toBe(400);
    expect(stepYear(ys, 1914, 1)).toBe(1914);
    expect(stepYear(ys, -500, -1)).toBe(-500);
  });
  it("makes a fair quiz: four choices, the answer among them", () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const places = Array.from({ length: 10 }, (_, i) => ({ name: `P${i}`, hint: `hint ${i}`, lon: i, lat: i }));
    for (const q of placeQuiz(places, 6, rnd)) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.answer]).toBe(q.place.name);
    }
    const s = starterQuiz(rnd);
    expect(s.questions).toHaveLength(8);
    expect(s.questions.every((q) => q.options[q.answer] === q.answerText)).toBe(true);
    // Capitals are asked among capitals, in plain English.
    const capitals = new Set(CAPITALS.map((c) => c.name));
    const capQs = s.questions.filter((q) => q.prompt.startsWith("Which is the capital of"));
    expect(capQs).toHaveLength(4);
    for (const q of capQs) expect(q.options.every((o) => capitals.has(o))).toBe(true);
  });
  it("hosts every kind of saved question", () => {
    expect(hostable({ id: "1", kind: "truefalse", prompt: "Nile is longest?", answer: false })).toMatchObject({ options: ["True", "False"], answer: 1, answerText: "False" });
    expect(hostable({ id: "2", kind: "map", prompt: "Find Paris", place: "Paris", lon: 2.35, lat: 48.86, tolerance: 50 })).toMatchObject({ options: [], answerText: "Paris", place: { name: "Paris" } });
    expect(hostable({ id: "3", kind: "choice", prompt: "?", options: ["a", "b"], answer: 1 }).answerText).toBe("b");
  });
});

describe("long messages through the relay", () => {
  it("splits and joins in any order", () => {
    const text = "x".repeat(7000) + "end";
    const parts = splitText(text, 2800);
    expect(parts).toHaveLength(3);
    const join = joiner();
    expect(join("k", 2, 3, parts[2])).toBeNull();
    expect(join("k", 0, 3, parts[0])).toBeNull();
    expect(join("k", 1, 3, parts[1])).toBe(text);
    expect(joiner()("one", 0, 1, "")).toBe("");
  });
});
