import { describe, expect, it } from "vitest";
import { decodePlusCode, formatDms, formatHash, parseHash, parseLocation, recoverPlusCode } from "../src/data/locationParse";

const pt = (s: string) => {
  const p = parseLocation(s);
  if (p.kind !== "point") throw new Error(`not a point: ${s} -> ${JSON.stringify(p)}`);
  return p;
};

describe("parseLocation", () => {
  it("reads decimal coordinates in common forms", () => {
    expect(pt("40.7484, -73.9857")).toMatchObject({ lat: 40.7484, lon: -73.9857 });
    expect(pt("40.7484 -73.9857")).toMatchObject({ lat: 40.7484, lon: -73.9857 });
    expect(pt("40.7484° N, 73.9857° W")).toMatchObject({ lat: 40.7484, lon: -73.9857 });
    expect(pt("N40.7484 W73.9857")).toMatchObject({ lat: 40.7484, lon: -73.9857 });
    expect(pt("(51.5007, -0.1246)")).toMatchObject({ lat: 51.5007, lon: -0.1246 });
    // lon,lat order is swapped when only that reading is valid
    expect(pt("-122.4194, 37.7749")).toMatchObject({ lat: 37.7749, lon: -122.4194 });
  });

  it("reads degrees, minutes and seconds", () => {
    const p = pt(`40°44'54.3"N 73°59'08.5"W`);
    expect(p.lat).toBeCloseTo(40.74842, 4);
    expect(p.lon).toBeCloseTo(-73.98569, 4);
    expect(pt("40°44′54.3″N, 73°59′08.5″W").lat).toBeCloseTo(40.74842, 4);
    expect(pt("40 44 54.3 N 73 59 8.5 W").lon).toBeCloseTo(-73.98569, 4);
    expect(pt("40°44.905'N 73°59.142'W").lat).toBeCloseTo(40.74842, 4);
    expect(pt("33°51′S 151°13′E")).toMatchObject({ lat: expect.closeTo(-33.85, 2), lon: expect.closeTo(151.2167, 3) });
  });

  it("reads map links", () => {
    expect(pt("https://www.google.com/maps/@40.7484405,-73.9856644,17z")).toMatchObject({ lat: 40.7484405, zoom: 17, source: "google" });
    expect(pt("https://www.google.com/maps/place/Empire+State+Building/@40.7484405,-73.9878531,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d40.7484405!4d-73.9856644"))
      .toMatchObject({ lat: 40.7484405, lon: -73.9856644, label: "Empire State Building" });
    expect(pt("https://maps.google.com/?q=51.5007,-0.1246")).toMatchObject({ lat: 51.5007, lon: -0.1246 });
    expect(pt("https://maps.apple.com/?ll=48.8584,2.2945&q=Eiffel%20Tower")).toMatchObject({ lat: 48.8584, lon: 2.2945, label: "Eiffel Tower", source: "apple" });
    expect(pt("https://www.openstreetmap.org/#map=16/51.5007/-0.1246")).toMatchObject({ lat: 51.5007, lon: -0.1246, zoom: 16, source: "osm" });
    expect(pt("https://www.openstreetmap.org/?mlat=51.5&mlon=-0.12#map=15/51.5/-0.12")).toMatchObject({ lat: 51.5, lon: -0.12 });
    expect(pt("https://www.bing.com/maps?cp=47.6062~-122.3321&lvl=11")).toMatchObject({ lat: 47.6062, lon: -122.3321, zoom: 11 });
    expect(parseLocation("https://maps.apple.com/?address=1600%20Pennsylvania%20Ave%20NW%2C%20Washington")).toEqual({ kind: "query", text: "1600 Pennsylvania Ave NW, Washington" });
  });

  it("reads geo: URIs", () => {
    expect(pt("geo:37.786971,-122.399677?z=19")).toMatchObject({ lat: 37.786971, zoom: 19, source: "geo" });
    expect(parseLocation("geo:0,0?q=1600 Amphitheatre Parkway")).toEqual({ kind: "query", text: "1600 Amphitheatre Parkway" });
  });

  it("reads plus codes", () => {
    const p = pt("8FVC9G8F+6X");
    expect(p.lat).toBeCloseTo(47.365562, 4);
    expect(p.lon).toBeCloseTo(8.5249375, 6); // centre of the 14 m cell (worked by hand from the OLC spec)
    expect(parseLocation("9G8F+6X Zurich")).toEqual({ kind: "query", text: "Zurich", shortCode: "9G8F+6X" });
    expect(recoverPlusCode("9G8F+6X", 47.4, 8.6)).toBe("8FVC9G8F+6X");
    expect(decodePlusCode("8FVC9G8F+6X").size).toBeLessThan(20);
  });

  it("treats everything else as an address", () => {
    expect(parseLocation("350 Fifth Avenue\nNew York, NY 10118")).toEqual({ kind: "query", text: "350 Fifth Avenue, New York, NY 10118" });
    expect(parseLocation("Big Ben")).toEqual({ kind: "query", text: "Big Ben" });
    expect(parseLocation("10 Downing St")).toEqual({ kind: "query", text: "10 Downing St" });
  });
});

describe("share links", () => {
  it("round-trips state through the URL hash", () => {
    const s = { place: { lat: 40.74844, lon: -73.98566 }, theme: "water", camera: { lat: 40.7, lon: -74, height: 9000, heading: 20, pitch: -45 } };
    expect(parseHash(formatHash(s))).toEqual(s);
    expect(parseHash("#p=999,1")).toEqual({});
  });
  it("formats DMS", () => {
    expect(formatDms(40.748417, -73.985667)).toBe("40°44′54.3″N 73°59′08.4″W");
  });
});
