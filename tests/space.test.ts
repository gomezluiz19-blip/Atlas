import { describe, expect, it } from "vitest";
import { PLANETS, altAz, heliocentric, moonPhase, planetSky, sunDirection, compass } from "../src/space/astro";
import { parseTle, passes, stateAt, orbitInfo, sunlit } from "../src/space/orbits";
import { ascent, countdown, inFlight, parseLaunches, type Launch } from "../src/space/launches";

const EARTH = PLANETS.find((p) => p.id === "earth")!;
const dist = (v: number[]) => Math.hypot(...v);

describe("astronomy", () => {
  it("puts the planets at the right distances", () => {
    for (const t of [Date.UTC(2024, 0, 3), Date.UTC(2024, 6, 5)]) expect(dist(heliocentric(EARTH, t))).toBeGreaterThan(0.982);
    expect(dist(heliocentric(EARTH, Date.UTC(2024, 0, 3)))).toBeLessThan(0.985); // perihelion in early January
    expect(dist(heliocentric(EARTH, Date.UTC(2024, 6, 5)))).toBeGreaterThan(1.015); // aphelion in July
    const mars = dist(heliocentric(PLANETS.find((p) => p.id === "mars")!, Date.UTC(2026, 3, 1)));
    expect(mars).toBeGreaterThan(1.38);
    expect(mars).toBeLessThan(1.67);
  });
  it("finds Jupiter near opposition (closest to Earth) on 3 November 2023 (about 595 million km)", () => {
    const j = PLANETS.find((p) => p.id === "jupiter")!;
    const near = planetSky(j, 0, 0, Date.UTC(2023, 10, 3)).distance;
    expect(near).toBeLessThan(planetSky(j, 0, 0, Date.UTC(2024, 4, 18)).distance);
    expect(near).toBeCloseTo(3.97, 1);
  });
  it("tilts the Sun north in June and south in December", () => {
    expect(sunDirection(Date.UTC(2025, 5, 21, 12))[2]).toBeCloseTo(Math.sin((23.44 * Math.PI) / 180), 2);
    expect(sunDirection(Date.UTC(2025, 11, 21, 12))[2]).toBeCloseTo(-Math.sin((23.44 * Math.PI) / 180), 2);
  });
  it("puts the noon Sun high over the tropic in June", () => {
    // Local noon at Greenwich on the June solstice, on the Tropic of Cancer.
    const s = altAz(sunDirection(Date.UTC(2025, 5, 21, 12, 2)), 0, 23.44, Date.UTC(2025, 5, 21, 12, 2));
    expect(s.alt).toBeGreaterThan(88);
  });
  it("knows the Moon's phase", () => {
    expect(moonPhase(Date.UTC(2024, 0, 25, 17, 54)).name).toBe("Full moon");
    expect(moonPhase(Date.UTC(2024, 0, 25, 17, 54)).lit).toBeGreaterThan(0.98);
    expect(moonPhase(Date.UTC(2024, 1, 9, 22, 59)).lit).toBeLessThan(0.02);
    expect(compass(92)).toBe("E");
  });
});

// A real ISS element set (epoch 2024-01-01).
const ISS = `ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00016717  00000-0  30208-3 0  9993
2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49986436432123`;

describe("satellites", () => {
  const [iss] = parseTle(ISS, "stations");
  const t0 = Date.UTC(2024, 0, 1, 12);
  it("reads element sets and finds the ISS about 420 km up", () => {
    expect(iss.name).toBe("ISS (ZARYA)");
    expect(iss.id).toBe(25544);
    const st = stateAt(iss, t0)!;
    expect(st.alt).toBeGreaterThan(380);
    expect(st.alt).toBeLessThan(460);
    expect(st.speed).toBeCloseTo(7.66, 1);
    expect(Math.abs(st.lat)).toBeLessThanOrEqual(51.7);
    expect(orbitInfo(iss).period).toBeCloseTo(92.9, 0);
  });
  it("predicts passes over a mid-latitude city, some of them visible", () => {
    const list = passes(iss, -0.13, 51.5, t0, 96);
    expect(list.length).toBeGreaterThan(4);
    for (const p of list) { expect(p.maxAlt).toBeGreaterThanOrEqual(10); expect(p.end - p.start).toBeLessThan(15 * 60_000); }
  });
  it("knows when a satellite is in Earth's shadow", () => {
    const sun = sunDirection(t0);
    expect(sunlit([sun[0] * 7000, sun[1] * 7000, sun[2] * 7000], t0)).toBe(true);
    expect(sunlit([-sun[0] * 7000, -sun[1] * 7000, -sun[2] * 7000], t0)).toBe(false);
  });
});

describe("launches", () => {
  const l: Launch = { id: "x", name: "Test", net: Date.UTC(2026, 0, 1, 12), status: "Go", statusName: "", rocket: "R", provider: "P", pad: "", location: "", lon: -80.577, lat: 28.56 };
  it("parses Launch Library results", () => {
    const [p] = parseLaunches({ results: [{ id: "1", name: "A", net: "2026-01-01T12:00:00Z", status: { abbrev: "Go" }, pad: { latitude: "28.5", longitude: "-80.6", location: { name: "Cape" } } }, { id: "2", name: "No pad", net: "2026-01-01T12:00:00Z" }] });
    expect(p).toMatchObject({ name: "A", lat: 28.5, lon: -80.6, location: "Cape" });
  });
  it("knows a rocket in flight and counts down", () => {
    expect(inFlight(l, l.net + 5 * 60_000)).toBe(true);
    expect(inFlight(l, l.net + 60 * 60_000)).toBe(false);
    expect(inFlight({ ...l, status: "Success" }, l.net + 60_000)).toBe(false);
    expect(countdown(l.net, l.net - 90 * 60_000)).toBe("T−1h 30m");
    expect(countdown(l.net, l.net + 65_000)).toBe("T+1m 05s");
  });
  it("draws a climb that goes up and east", () => {
    const a = ascent(l, 60), b = ascent(l, 600);
    expect(b.alt).toBeGreaterThan(a.alt);
    expect(b.alt).toBeLessThan(215_000);
    expect(b.lon).toBeGreaterThan(a.lon);
    const polar = ascent({ ...l, lon: -120.6, lat: 34.6, orbit: "SSO" }, 600);
    expect(polar.lat).toBeLessThan(34.6);
  });
});
