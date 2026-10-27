import { describe, expect, it } from "vitest";
import { googleLocale, looksLikeMap, PAPER_STYLES, sampleTile, SLATE_STYLES } from "../src/globe/basemap";

describe("the basemap", () => {
  it("asks Google for names in the reader's language and region", () => {
    expect(googleLocale("en-GB")).toEqual({ language: "en-GB", region: "GB" });
    expect(googleLocale("fr")).toEqual({ language: "fr", region: "US" });
    expect(googleLocale("pt_br")).toEqual({ language: "pt-BR", region: "BR" });
    expect(googleLocale("")).toEqual({ language: "en-US", region: "US" });
  });
  it("checks a real tile address", () => {
    expect(sampleTile("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png", "abcd")).toBe("https://a.basemaps.cartocdn.com/rastertiles/voyager/15/9650/12318@2x.png");
    expect(sampleTile("https://example.com/{dark}/{z}/{y}/{x}")).toBe("https://example.com/light/15/12318/9650");
  });
  it("tells a map from a provider's blank message picture", () => {
    const px = (f: (i: number) => [number, number, number]) => { const a = new Uint8ClampedArray(32 * 32 * 4); for (let i = 0; i < 1024; i++) { const [r, g, b] = f(i); a.set([r, g, b, 255], i * 4); } return a; };
    expect(looksLikeMap(px((i) => (i % 40 === 0 ? [60, 60, 60] : [250, 250, 250])))).toBe(false); // white with a line of text
    expect(looksLikeMap(px((i) => (i % 7 === 0 ? [255, 255, 255] : i % 3 ? [236, 232, 225] : [200, 214, 190])))).toBe(true); // streets and parks
    expect(looksLikeMap(px(() => [30, 33, 38]))).toBe(true); // a dark map is still a map
  });
  it("styles day and night in the house colours", () => {
    expect(PAPER_STYLES[0]).toEqual({ elementType: "geometry", stylers: [{ color: "#ece8e1" }] });
    expect(SLATE_STYLES[0]).toEqual({ elementType: "geometry", stylers: [{ color: "#151a20" }] });
  });
});
