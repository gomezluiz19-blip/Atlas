import { describe, expect, it } from "vitest";
import { addressLine, appleDirections, commonsNearUrl, googleDirections, mediaFrom, NEARBY, nearbyFrom, nearbyQuery, openNow, streetView } from "../src/place/around";

// 2026-10-06 is a Tuesday.
const at = (day: number, hh: number, mm = 0) => new Date(2026, 9, 4 + day, hh, mm);

describe("openNow", () => {
  const school = "Mo-Fr 08:00-15:30";
  it("is open in hours and says when it closes", () => expect(openNow(school, at(2, 10))).toEqual({ open: true, next: "Closes 15:30" }));
  it("says when it opens later today", () => expect(openNow(school, at(2, 7, 15))).toEqual({ open: false, next: "Opens 08:00" }));
  it("says tomorrow after closing", () => expect(openNow(school, at(2, 16))).toEqual({ open: false, next: "Opens tomorrow 08:00" }));
  it("skips to Monday over the weekend", () => expect(openNow(school, at(6, 12))).toEqual({ open: false, next: "Opens Mon 08:00" }));
  it("handles split hours and a day off", () => {
    const oh = "Mo,We 10:00-12:00,13:00-17:00; Tu off";
    expect(openNow(oh, at(1, 12, 30))?.next).toBe("Opens 13:00");
    expect(openNow(oh, at(1, 14))?.open).toBe(true);
    expect(openNow(oh, at(2, 11))?.open).toBe(false);
  });
  it("handles hours past midnight", () => {
    expect(openNow("Fr-Sa 18:00-02:00", at(6, 1))).toEqual({ open: true, next: "Closes 02:00" });
    expect(openNow("Fr-Sa 18:00-02:00", at(5, 23))?.open).toBe(true);
  });
  it("knows 24/7 and a bare range", () => {
    expect(openNow("24/7", at(0, 3))?.open).toBe(true);
    expect(openNow("08:00-20:00", at(0, 21))?.next).toBe("Opens tomorrow 08:00");
  });
  it("declines what it can't read", () => {
    expect(openNow("Mo-Fr 08:00-16:00; PH off", at(1, 9))).toBeNull();
    expect(openNow("sunrise-sunset", at(1, 9))).toBeNull();
  });
});

describe("addressLine", () => {
  it("builds a street address", () =>
    expect(addressLine({ house_number: "2290", road: "Albany Post Road", village: "Buchanan", state: "New York", "ISO3166-2-lvl4": "US-NY", postcode: "10511" })).toBe("2290 Albany Post Road, Buchanan, NY 10511"));
  it("copes with missing parts", () => {
    expect(addressLine({ road: "High Street", city: "Oxford", postcode: "OX1 4AU" })).toBe("High Street, Oxford, OX1 4AU");
    expect(addressLine(null)).toBe("");
  });
});

describe("nearby", () => {
  const coffee = NEARBY.find((k) => k.id === "coffee")!;
  const transit = NEARBY.find((k) => k.id === "transit")!;
  it("queries named places of a kind around a spot", () => {
    const q = nearbyQuery({ lon: -73.94, lat: 41.26 }, transit, 1500);
    expect(q).toContain('nwr(around:1500,41.26000,-73.94000)["highway"~"^(bus_stop)$"]["name"]');
    expect(q).toContain('["railway"~"^(station|halt|tram_stop)$"]');
  });
  it("lists them nearest first without the venue itself or repeats", () => {
    const from = { lon: -73.94, lat: 41.26 };
    const out = nearbyFrom([
      { type: "node", id: 1, lat: 41.27, lon: -73.94, tags: { amenity: "cafe", name: "Far Cafe" } },
      { type: "way", id: 2, center: { lat: 41.261, lon: -73.94 }, tags: { amenity: "cafe", name: "Near Cafe" } },
      { type: "node", id: 3, lat: 41.2611, lon: -73.94, tags: { amenity: "cafe", name: "near cafe" } },
      { type: "node", id: 4, lat: 41.26, lon: -73.94, tags: { amenity: "cafe", name: "The Venue" } },
      { type: "node", id: 5, lat: 41.26, lon: -73.94, tags: { amenity: "cafe" } },
    ], coffee, from, "The Venue");
    expect(out.map((n) => n.name)).toEqual(["Near Cafe", "Far Cafe"]);
    expect(out[0]).toMatchObject({ key: "amenity", value: "cafe", osm: "W2" });
    expect(out[0].km).toBeCloseTo(0.111, 2);
  });
});

describe("media", () => {
  it("asks Commons for files around a spot", () => {
    const u = commonsNearUrl({ lon: -73.94, lat: 41.26 }, 700);
    expect(u).toContain("generator=geosearch");
    expect(u).toContain("ggscoord=41.26000%7C-73.94000");
    expect(u).toContain("ggsradius=700");
  });
  it("keeps photos and videos, nearest first, and drops maps and documents", () => {
    const page = (title: string, mime: string, lat: number) => ({ title, coordinates: [{ lat, lon: -73.94 }], imageinfo: [{ url: `https://u/${title}`, thumburl: `https://t/${title}`, descriptionurl: `https://d/${title}`, mime, extmetadata: { Artist: { value: '<a href="x">Ann</a>' } } }] });
    const out = mediaFrom({ query: { pages: {
      a: page("File:School front.jpg", "image/jpeg", 41.262),
      b: page("File:Parade.webm", "video/webm", 41.2601),
      c: page("File:Town map.png", "image/png", 41.26),
      d: page("File:Minutes.pdf", "application/pdf", 41.26),
    } } }, { lon: -73.94, lat: 41.26 });
    expect(out.map((m) => [m.title, m.video])).toEqual([["Parade", true], ["School front", false]]);
    expect(out[0].by).toBe("Ann");
  });
});

describe("links out", () => {
  const to = { lon: -73.94, lat: 41.26 };
  it("builds directions and Street View links", () => {
    expect(googleDirections(to, "walk")).toBe("https://www.google.com/maps/dir/?api=1&destination=41.260000,-73.940000&travelmode=walking");
    expect(appleDirections(to, "A school", "transit")).toContain("daddr=41.260000,-73.940000&q=A%20school&dirflg=r");
    expect(streetView(to)).toContain("viewpoint=41.260000,-73.940000");
  });
});
