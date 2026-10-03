import { describe, expect, it } from "vitest";
import type { Thing } from "../src/ui/frontDoor";
import { initial, matchViews, shelfOrder, viewGlyph } from "../src/ui/viewStackModel";

const t = (title: string, shelf?: string, words = ""): Thing => ({ title, detail: "", emoji: "✨", group: "Show on the map", words, shelf, run: () => {} });
const THINGS = [t("Live planes", "Live", "flights"), t("Wind", "Live", "breeze"), t("Volcanoes", "Earth"), t("Railways", "Networks", "trains"), t("Geologic map", "Analysis", "rocks"), t("Rivers", "Water"), t("Grow", undefined, "farm")];

describe("the stack of views", () => {
  it("takes a bubble's emoji from its name, or from what it is", () => {
    expect(viewGlyph("land:volcanoes", "🌋 Volcanoes")).toEqual({ emoji: "🌋", name: "Volcanoes" });
    expect(viewGlyph("overlay:quakes", "Earthquakes")).toEqual({ emoji: "〽️", name: "Earthquakes" });
    expect(viewGlyph("something", "Plant health")).toEqual({ emoji: "", name: "Plant health" });
    expect(initial("Plant health")).toBe("P");
  });
  it("finds views by name, words or shelf, and only views", () => {
    expect(matchViews(THINGS, "wind").map((x) => x.title)).toEqual(["Wind"]);
    expect(matchViews(THINGS, "trains")[0].title).toBe("Railways");
    expect(matchViews(THINGS, "rocks")[0].title).toBe("Geologic map");
    expect(matchViews(THINGS, "farm")).toEqual([]);
    expect(matchViews(THINGS, "live planes").map((x) => x.title)).toEqual(["Live planes"]);
  });
  it("puts what's live and the theme you're in first", () => {
    expect(shelfOrder(THINGS, "Water")).toEqual({ first: ["Live", "Water", "Networks", "Analysis"], more: ["Earth"] });
    expect(shelfOrder(THINGS).first).toEqual(["Live", "Networks", "Analysis"]);
  });
});
