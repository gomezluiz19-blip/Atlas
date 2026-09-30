import { describe, expect, it } from "vitest";
import { advance, pathAhead, readAdsb, readAisMessage, readDigitraffic, readOpenSky, shipGroup, type Track } from "../src/live/traffic";
import { altitudeColor } from "../src/live/tracks";

describe("live traffic", () => {
  it("reads ADS-B aircraft into tracks", () => {
    const [a, g] = readAdsb({ now: 1_000_000, ac: [
      { hex: "a1b2c3", flight: "AAL123  ", r: "N123AA", t: "B738", category: "A3", lat: 40.6, lon: -73.8, alt_baro: 35000, gs: 450, track: 90, baro_rate: -1500, seen_pos: 2 },
      { hex: "ffff01", lat: 40.64, lon: -73.78, alt_baro: "ground", gs: 12, track: 180 },
    ] });
    expect(a).toMatchObject({ id: "p:a1b2c3", label: "AAL123", operator: "American Airlines", typeName: "Boeing 737-800", group: "Airliner", t: 998_000, ground: false });
    expect(a.alt).toBeCloseTo(10_668, 0);
    expect(a.speed).toBeCloseTo(231.5, 0);
    expect(a.climb).toBeCloseTo(-7.62, 1);
    expect(g).toMatchObject({ ground: true, alt: 0, group: "On the ground", label: "FFFF01" });
  });

  it("reads OpenSky states", () => {
    const [t] = readOpenSky({ time: 1000, states: [["abc123", "DLH400 ", "Germany", 999, 1000, 8.5, 50.03, 3000, false, 150, 270, 5, null, 3100, "1000", false, 0]] });
    expect(t).toMatchObject({ lon: 8.5, lat: 50.03, alt: 3100, heading: 270, operator: "Lufthansa", t: 999_000 });
  });

  it("moves a craft on along its heading, and not while it's still", () => {
    const t: Track = { id: "x", kind: "plane", lon: 0, lat: 0, alt: 1000, speed: 111.32, heading: 90, climb: 2, t: 0, ground: false, label: "X", group: "Aircraft" };
    const p = advance(t, 10_000);
    expect(p.lon).toBeCloseTo(0.01, 4);
    expect(p.lat).toBeCloseTo(0, 6);
    expect(p.alt).toBe(1020);
    expect(advance({ ...t, heading: 0 }, 10_000).lat).toBeCloseTo(0.01, 4);
    expect(advance(t, 10 * 60_000).lon).toBeCloseTo(0.09, 3); // capped at 90 s for planes
    expect(advance({ ...t, ground: true }, 10_000)).toEqual({ lon: 0, lat: 0, alt: 1000 });
    expect(pathAhead(t, 0, 60, 30)).toHaveLength(3);
  });

  it("reads ships from Digitraffic and AISStream", () => {
    const [s] = readDigitraffic([{ mmsi: 230145000, geometry: { coordinates: [24.9, 60.1] }, properties: { sog: 12, cog: 45, heading: 511, navStat: 0, timestampExternal: 5000 } }],
      new Map([[230145000, { mmsi: 230145000, name: "VIKING GRACE ", shipType: 60, destination: "TURKU" }]]));
    expect(s).toMatchObject({ label: "VIKING GRACE", group: "Passenger", heading: 45, destination: "TURKU", status: "Under way" });
    const known = new Map();
    expect(readAisMessage({ MessageType: "ShipStaticData", MetaData: { MMSI: 1, latitude: 0, longitude: 0 }, Message: { ShipStaticData: { Name: "EVER GIVEN", Type: 70, Destination: "ROTTERDAM", Dimension: { A: 300, B: 100 } } } }, known)).toBeNull();
    const t = readAisMessage({ MessageType: "PositionReport", MetaData: { MMSI: 1, latitude: 30, longitude: 32.5 }, Message: { PositionReport: { Cog: 170, Sog: 10, TrueHeading: 172, NavigationalStatus: 0, Latitude: 30, Longitude: 32.5 } } }, known, 42);
    expect(t).toMatchObject({ label: "EVER GIVEN", group: "Cargo", heading: 172, length: 400, destination: "ROTTERDAM" });
    expect(shipGroup(84)).toBe("Tanker");
  });

  it("colours planes by height", () => {
    expect(altitudeColor(0)).toBe("rgb(255,214,10)");
    expect(altitudeColor(12_000)).toBe("rgb(229,246,255)");
  });
});
