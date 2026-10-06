import { describe, expect, it } from "vitest";
import { detailsFrom, hoursText, osmRef, venueOf, venueOfPlace } from "../src/place/venue";

describe("venues", () => {
  it("knows a school, and its level from its name", () => {
    expect(venueOf({ key: "amenity", value: "school" }, "Buchanan-Verplanck Elementary School")).toEqual({ kind: "school", label: "Elementary school" });
    expect(venueOf({ key: "amenity", value: "school" }, "Lincoln High School")?.label).toBe("High school");
    expect(venueOf({ key: "amenity", value: "university" }, "MIT")?.label).toBe("University");
  });
  it("knows shops, food, health, stations and addresses", () => {
    expect(venueOf({ key: "shop", value: "bakery" })).toEqual({ kind: "shop", label: "Bakery" });
    expect(venueOf({ key: "amenity", value: "fast_food" })?.label).toBe("Fast food");
    expect(venueOf({ key: "amenity", value: "pharmacy" })?.kind).toBe("health");
    expect(venueOf({ key: "railway", value: "station" })?.kind).toBe("transport");
    expect(venueOf({ key: "building", value: "yes", type: "house" })).toEqual({ kind: "address", label: "Address" });
    expect(venueOf({ key: "highway", value: "residential", type: "street" })?.kind).toBe("street");
  });
  it("leaves landforms, waters and regions to the planet's views", () => {
    expect(venueOf({ key: "natural", value: "peak" })).toBeNull();
    expect(venueOf({ key: "place", value: "city" })).toBeNull();
    expect(venueOf({ key: "boundary", value: "administrative" })).toBeNull();
    expect(venueOf({ key: "waterway", value: "river" })).toBeNull();
    expect(venueOf(undefined)).toBeNull();
  });
  it("reads a chosen place: from search, or a notable label's kind", () => {
    expect(venueOfPlace({ feature: { venue: { key: "amenity", value: "school" } }, name: { title: "Oak Primary School" } })?.label).toBe("Elementary school");
    expect(venueOfPlace({ feature: { source: "notable", notable: { kind: "transport", name: "Grand Central" } } })?.kind).toBe("transport");
    expect(venueOfPlace({ feature: { source: "notable", notable: { kind: "peak", name: "Fuji" } } })).toBeNull();
    expect(venueOfPlace({ feature: undefined })).toBeNull();
  });
  it("says opening hours plainly", () => {
    expect(hoursText("Mo-Fr 08:00-15:30; Sa off")).toBe("Mon–Fri 08:00–15:30 · Sat closed");
    expect(hoursText("24/7")).toBe("Open 24 hours");
  });
  it("picks the details worth showing, most useful first", () => {
    const d = detailsFrom({ opening_hours: "Mo-Fr 08:30-15:00", "isced:level": "0;1", phone: "+1 845-555-0100", website: "https://www.example.org/", wheelchair: "yes", foo: "bar" });
    expect(d.map((x) => x.label)).toEqual(["Hours", "Grades", "Phone", "Website", "Wheelchair"]);
    expect(d[1].value).toBe("Preschool, Elementary");
    expect(d[2].href).toBe("tel:+18455550100");
    expect(d[3]).toEqual({ label: "Website", value: "example.org", href: "https://www.example.org/" });
    expect(detailsFrom({})).toEqual([]);
  });
  it("makes a lookup id from Photon's or Nominatim's OSM type", () => {
    expect(osmRef("W", 123)).toBe("W123");
    expect(osmRef("way", 9)).toBe("W9");
    expect(osmRef(undefined, 1)).toBeUndefined();
  });
});
