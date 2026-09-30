import { describe, expect, it } from "vitest";
import { ago, gdeltTime, plain, readEonet, readFeatured, readHeadlines } from "../src/live/news";

describe("world news", () => {
  it("reads Wikipedia's stories, placing each where one of its articles is", () => {
    const f = readFeatured({
      news: [{ story: "<!--Sep 29--> A <a href=\"./M\">magnitude 7.1 earthquake</a> strikes <b>Chile</b>, killing at least 12&nbsp;people.", links: [
        { title: "2026_Chile_earthquake", titles: { normalized: "2026 Chile earthquake" }, description: "earthquake" },
        { title: "Chile", description: "Country in South America", coordinates: { lat: -33.45, lon: -70.67 }, thumbnail: { source: "flag.png" } },
      ] }],
      mostread: { articles: [{ title: "Main_Page", views: 9e6 }, { title: "Chile", views: 120000, description: "country" }] },
      onthisday: [{ year: 1962, text: "The <i>Alouette 1</i> satellite is launched.", pages: [{ title: "Alouette_1" }] }],
    });
    expect(f.stories[0].text).toBe("A magnitude 7.1 earthquake strikes Chile, killing at least 12 people.");
    expect([f.stories[0].lon, f.stories[0].lat]).toEqual([-70.67, -33.45]);
    expect(f.stories[0].image).toBe("flag.png");
    expect(f.reading.map((r) => r.title)).toEqual(["Chile"]);
    expect(f.onThisDay[0]).toMatchObject({ year: 1962, text: "The Alouette 1 satellite is launched." });
    expect(plain("R&amp;D &#39;now&#39;")).toBe("R&D 'now'");
  });

  it("keeps one headline per story, newest first", () => {
    const a = (title: string, t: string, domain = "reuters.com") => ({ url: `https://${domain}/${title.length}${t}`, title, seendate: t, domain });
    const list = readHeadlines([a("Storm hits coast", "20260929T100000Z"), a("Storm hits coast", "20260929T110000Z", "apnews.com"), a("Talks resume in Geneva", "20260929T120000Z")]);
    expect(list.map((x) => x.title)).toEqual(["Talks resume in Geneva", "Storm hits coast"]);
    expect(gdeltTime("20260929T120000Z")).toBe(Date.UTC(2026, 8, 29, 12));
  });

  it("reads natural events at their latest position", () => {
    const ev = readEonet([
      { id: "E1", title: "Hurricane Kiko", categories: [{ id: "severeStorms" }], geometry: [
        { date: "2026-09-27T00:00:00Z", type: "Point", coordinates: [-140, 15], magnitudeValue: 90, magnitudeUnit: "kts" },
        { date: "2026-09-28T00:00:00Z", type: "Point", coordinates: [-142, 16], magnitudeValue: 115, magnitudeUnit: "kts" }] },
      { id: "E2", title: "Creek Fire", categories: [{ id: "wildfires" }], geometry: [{ date: "2026-09-26T00:00:00Z", type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] }] },
    ]);
    expect(ev[0]).toMatchObject({ id: "E1", kind: "severeStorms", lon: -142, lat: 16, size: "115 knots" });
    expect(ev[1]).toMatchObject({ kind: "wildfires", lon: 1, lat: 1 });
    expect(ago(Date.now() - 3 * 3_600_000)).toBe("3 h ago");
  });
});

describe("balanced headlines", () => {
  it("caps each outlet so regional services get a look-in", async () => {
    const { balanced } = await import("../src/live/news");
    const l = [..."aaaabbbcd"].map((source, i) => ({ source, i }));
    expect(balanced(l, 12).map((h) => h.source).join("")).toBe("aabbcd");
    expect(balanced(l, 3).length).toBe(3);
  });
});
