import { describe, expect, it } from "vitest";
import { findThings, scoreThing, type Thing } from "../src/ui/frontDoor";

const t = (title: string, detail: string, group: Thing["group"] = "Show on the map", words = ""): Thing => ({ title, detail, words, emoji: "✨", group, run: () => {} });
const THINGS = [
  t("Railways", "Main lines worldwide", "Show on the map", "rail"),
  t("Night lights", "Cities seen from space at night"),
  t("Homeowners", "Homes owned by the people living in them, country by country", "Show on the map", "people Homes"),
  t("Plan", "Trips told step by step", "Open", "trip travel itinerary"),
  t("Video", "A studio: the globe on a monitor", "Open", "record film"),
  t("The Nile, from source to sea", "Follow the world's longest river", "Stories", "story Rivers and water"),
  t("Earthquakes", "This week's earthquakes"),
];

describe("the front door", () => {
  it("finds what's asked for in everyday words", () => {
    expect(findThings(THINGS, "show me the railways")[0].title).toBe("Railways");
    expect(findThings(THINGS, "railway")[0].title).toBe("Railways");
    expect(findThings(THINGS, "night lights on the map")[0].title).toBe("Night lights");
    expect(findThings(THINGS, "plan a trip")[0].title).toBe("Plan");
    expect(findThings(THINGS, "record a film")[0].title).toBe("Video");
    expect(findThings(THINGS, "nile story")[0].group).toBe("Stories");
    expect(findThings(THINGS, "homeowner")[0].title).toBe("Homeowners");
  });

  it("needs every meaningful word to match", () => {
    expect(scoreThing(THINGS[0], "railways in japan")).toBe(0);
    expect(findThings(THINGS, "the map")).toEqual([]);
    expect(findThings(THINGS, "paris")).toEqual([]);
  });
});
