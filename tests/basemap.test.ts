import { describe, expect, it } from "vitest";
import { googleLocale, PAPER_STYLES, sampleTile, SLATE_STYLES } from "../src/globe/basemap";

describe("the basemap", () => {
  it("asks Google for names in the reader's language and region", () => {
    expect(googleLocale("en-GB")).toEqual({ language: "en-GB", region: "GB" });
    expect(googleLocale("fr")).toEqual({ language: "fr", region: "US" });
    expect(googleLocale("pt_br")).toEqual({ language: "pt-BR", region: "BR" });
    expect(googleLocale("")).toEqual({ language: "en-US", region: "US" });
  });
  it("checks a real tile address", () => {
    expect(sampleTile("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png", "abcd")).toBe("https://a.basemaps.cartocdn.com/rastertiles/voyager/2/2/1@2x.png");
    expect(sampleTile("https://example.com/{dark}/{z}/{y}/{x}")).toBe("https://example.com/light/2/1/2");
  });
  it("styles day and night in the house colours", () => {
    expect(PAPER_STYLES[0]).toEqual({ elementType: "geometry", stylers: [{ color: "#ece8e1" }] });
    expect(SLATE_STYLES[0]).toEqual({ elementType: "geometry", stylers: [{ color: "#151a20" }] });
  });
});
