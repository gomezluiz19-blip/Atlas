import { describe, expect, it } from "vitest";
import { arrival, bookingLinks, forecastReaches, jetLag, pickAirports, rankStays, shiftText, splitStays, sweetSpot, waysThere, weatherLine, wxEmoji } from "../src/travel/trip";

const nyc = { name: "New York", lon: -74.0, lat: 40.71 }, lis = { name: "Lisbon", lon: -9.14, lat: 38.72 }, phl = { name: "Philadelphia", lon: -75.16, lat: 39.95 };
const AP = [
  { name: "LaGuardia", iata: "LGA", lon: -73.872, lat: 40.775, type: "major", rank: 6 },
  { name: "JFK", iata: "JFK", lon: -73.786, lat: 40.646, type: "major", rank: 5 },
  { name: "Newark", iata: "EWR", lon: -74.177, lat: 40.69, type: "major", rank: 2 },
  { name: "Base", iata: "XXX", lon: -74.0, lat: 40.7, type: "military major", rank: 1 },
];

describe("trip", () => {
  it("picks big airports near the start, skipping military fields", () => {
    const p = pickAirports(AP, nyc);
    expect(p[0].iata).toBe("EWR");
    expect(p.map((a) => a.iata)).not.toContain("XXX");
    expect(pickAirports(AP, lis)).toEqual([]);
  });
  it("offers flying far and the ground close, fastest first", () => {
    expect(waysThere(nyc, lis).map((w) => w.way)).toEqual(["fly"]);
    const near = waysThere(nyc, phl, 2);
    expect(near.map((w) => w.way)).toContain("train");
    expect(near.map((w) => w.way)).not.toContain("fly");
    const car1 = waysThere(nyc, phl, 1).find((w) => w.way === "drive")!, car4 = waysThere(nyc, phl, 4).find((w) => w.way === "drive")!;
    expect(car4.co2Kg).toBeCloseTo(car1.co2Kg / 4, 5);
  });
  it("lands in local time across the time change", () => {
    expect(shiftText(-4 * 3600, 3600)).toBe("+5 h");
    expect(shiftText(5.5 * 3600, 0)).toBe("−5 h 30");
    expect(shiftText(0, 0)).toBe("same time");
    expect(arrival("19:00", 7, -4 * 3600, 3600)).toEqual({ time: "07:00", dayShift: 1 });
    expect(arrival("09:00", 2, 0, 0)).toEqual({ time: "11:00", dayShift: 0 });
    expect(jetLag(0, 0)).toMatch(/No jet lag/);
    expect(jetLag(-4 * 3600, 3600)).toMatch(/east/);
  });
  it("reads the weather", () => {
    expect(wxEmoji(0)).toBe("☀️");
    expect(wxEmoji(63)).toBe("🌧️");
    expect(wxEmoji(95)).toBe("⛈️");
    expect(weatherLine([{ max: 30, min: 20, rain: 0 }, { max: 28, min: 19, rain: 4 }], true)).toMatch(/^Forecast: highs around 29°.*rain on 1 of 2 days.*sun cream and an umbrella/);
    expect(forecastReaches("2026-10-10", "2026-10-01")).toBe(true);
    expect(forecastReaches("2026-12-10", "2026-10-01")).toBe(false);
  });
  it("ranks stays by the sights within a 15-minute walk, and finds the sweet spot", () => {
    const { stays, sights } = splitStays([
      { lat: 38.711, lon: -9.137, tags: { tourism: "hotel", name: "Central", stars: "4" } },
      { lat: 38.75, lon: -9.2, tags: { tourism: "hostel", name: "Far" } },
      { lat: 38.712, lon: -9.136, tags: { tourism: "museum", name: "A" } },
      { center: { lat: 38.713, lon: -9.138 }, tags: { historic: "castle", name: "B" } },
      { lat: 38.71, lon: -9.135, tags: { tourism: "viewpoint", name: "C" } },
      { lat: 38.71, lon: -9.135, tags: { tourism: "viewpoint" } },
    ]);
    expect(stays.length).toBe(2);
    expect(sights.length).toBe(3);
    const r = rankStays(stays, sights);
    expect(r[0].name).toBe("Central");
    expect(r[0].near).toBe(3);
    expect(r[1].near).toBe(0);
    expect(sweetSpot(sights)!.n).toBe(3);
  });
  it("builds booking links already searched for the trip", () => {
    const l = bookingLinks({ from: nyc, to: lis, fromIata: "EWR", toIata: "LIS", depart: "2026-10-15", back: "2026-10-20", people: 2, ways: ["fly"] });
    expect(l.find((x) => x.label === "Skyscanner")!.url).toBe("https://www.skyscanner.net/transport/flights/ewr/lis/261015/261020/?adultsv2=2");
    expect(l.find((x) => x.label === "Booking.com")!.url).toContain("checkin=2026-10-15&checkout=2026-10-20&group_adults=2");
    expect(l.some((x) => x.what === "trains")).toBe(false);
    const g = bookingLinks({ from: nyc, to: phl, depart: "2026-10-15", back: "2026-10-16", people: 1, ways: ["train", "drive"] });
    expect(g.some((x) => x.what === "flights")).toBe(false);
    expect(g.some((x) => x.what === "route")).toBe(true);
  });
});
