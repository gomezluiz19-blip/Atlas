import { describe, expect, it } from "vitest";
import { classify, cuisines, kmBetween, sportsPlayed, tally, toSpots, within } from "../src/topics/street";
import { rateText } from "../src/topics/rates";

describe("topics: what's on the street", () => {
  it("sorts OpenStreetMap features into topics", () => {
    expect(classify({ shop: "boutique", name: "Flor Boutique" })).toEqual({ topic: "fashion", kind: "Boutique" });
    expect(classify({ amenity: "restaurant", cuisine: "dominican" })?.topic).toBe("food");
    expect(classify({ shop: "bakery" })?.topic).toBe("food");
    expect(classify({ leisure: "pitch", sport: "baseball" })).toEqual({ topic: "sports", kind: "Baseball pitch" });
    expect(classify({ tourism: "museum" })?.topic).toBe("arts");
    expect(classify({ amenity: "bank" })).toEqual({ topic: "money", kind: "Bank" });
    expect(classify({ shop: "mall" })).toEqual({ topic: "money", kind: "Shopping centre" });
    expect(classify({ shop: "car_parts" })).toEqual({ topic: "money", kind: "Car parts" });
    expect(classify({ highway: "bus_stop" })).toBeNull();
    expect(classify({ tourism: "hotel", name: "Hotel Yaluma" })).toEqual({ topic: "tourism", kind: "Hotel" });
    expect(classify({ amenity: "university" })).toEqual({ topic: "education", kind: "University" });
    expect(classify({ amenity: "pharmacy" })).toEqual({ topic: "health", kind: "Pharmacy" });
    expect(classify({ amenity: "hospital", emergency: "yes" })?.topic).toBe("health");
  });

  it("counts cuisines and sports, most common first", () => {
    const spots = toSpots([
      { type: "node", id: 1, lon: 0, lat: 0, tags: { amenity: "restaurant", cuisine: "pizza;italian" } },
      { type: "node", id: 2, lon: 0, lat: 0, tags: { amenity: "restaurant", cuisine: "italian" } },
      { type: "way", id: 3, center: { lon: 1, lat: 1 }, tags: { leisure: "pitch", sport: "soccer;basketball" } },
      { type: "node", id: 4, lon: 0, lat: 0, tags: { leisure: "pitch", sport: "soccer" } },
      { type: "node", id: 5, tags: { amenity: "cafe" } },
    ]);
    expect(spots).toHaveLength(4);
    expect(cuisines(spots)[0]).toEqual({ label: "Italian", n: 2 });
    expect(sportsPlayed(spots)).toEqual([{ label: "Football", n: 2 }, { label: "Basketball", n: 1 }]);
    expect(tally(["a", "b", "a", undefined])).toEqual([{ label: "a", n: 2 }, { label: "b", n: 1 }]);
  });

  it("says distances and rates plainly", () => {
    expect(kmBetween({ lon: -69.93, lat: 18.49 }, { lon: -70.7, lat: 19.45 })).toBeCloseTo(134, -1); // Santo Domingo to Santiago
    expect(within(1500)).toBe("within 1.5 km");
    expect(within(800)).toBe("within 800 m");
    expect(rateText(58.9123)).toBe("58.91");
    expect(rateText(1480.4)).toBe("1,480");
    expect(rateText(0.0123)).toBe("0.012");
    expect(rateText(2)).toBe("2");
  });
});
