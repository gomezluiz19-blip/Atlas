import { describe, expect, it } from "vitest";
import { FEATURED } from "../src/content/stories";
import { creditLine, packStory, remixOf, search, storyFromDeck, storyFromJson, toCard, unpackStory } from "../src/stories/model";

let n = 0;
const id = () => `id${++n}`;
const stories = FEATURED.map((s) => storyFromJson({ ...s, featured: true }, id)!);

describe("featured stories", () => {
  it("all load, and every link points to a story that exists", () => {
    expect(stories.every(Boolean)).toBe(true);
    const ids = new Set(stories.map((s) => s.id));
    for (const s of stories) for (const l of s.links) expect(ids.has(l.id)).toBe(true);
  });
  it("the Nile set connects both ways", () => {
    const nile = stories.find((s) => s.id === "atlas-nile")!;
    expect(nile.links.length).toBeGreaterThanOrEqual(3);
    for (const l of nile.links) expect(stories.find((s) => s.id === l.id)!.links.some((x) => x.id === nile.id)).toBe(true);
  });
});

describe("remix", () => {
  it("credits the source and its sources, nearest first", () => {
    const nile = stories.find((s) => s.id === "atlas-nile")!;
    const r1 = remixOf(nile, id);
    const mine = storyFromDeck(r1.deck, { author: { name: "Ms Adeyemi" }, lineage: r1.lineage, title: "The Nile for Year 5" });
    const r2 = remixOf({ ...mine, id: "s2" }, id);
    expect(r2.lineage.map((x) => x.id)).toEqual(["s2", "atlas-nile"]);
    expect(creditLine(r2.lineage)).toBe("Remixed from “The Nile for Year 5” by Ms Adeyemi, from “The Nile, from source to sea” by Atlas");
    expect(r1.deck.slides[0].id).not.toBe(nile.slides[0].id);
  });
});

describe("search", () => {
  const cards = stories.map((s) => ({ ...toCard(s), slides: s.slides }));
  it("finds by title first, then words inside the slides", () => {
    expect(search(cards, { text: "nile" })[0].id).toBe("atlas-nile");
    expect(search(cards, { text: "Tutankhamun" }).map((s) => s.id)).toEqual(["atlas-egypt"]);
    expect(search(cards, { text: "zzzz" })).toEqual([]);
  });
  it("filters by topic and by the part of the map in view", () => {
    expect(search(cards, { tag: "Earth and rocks" }).map((s) => s.id)).toEqual(["atlas-rift"]);
    const brazil = search(cards, { bbox: [-70, -10, -45, 5] }).map((s) => s.id);
    expect(brazil).toContain("atlas-amazon");
    expect(brazil).not.toContain("atlas-aswan");
  });
});

describe("share links", () => {
  it("carry a whole story and come back the same", async () => {
    const s = stories.find((x) => x.id === "atlas-aswan")!;
    const packed = await packStory(s);
    expect(packed.length).toBeLessThan(2500);
    const back = await unpackStory(packed, id);
    expect(back?.title).toBe(s.title);
    expect(back?.slides.map((x) => x.title)).toEqual(s.slides.map((x) => x.title));
    expect(back?.links).toEqual(s.links);
  });
  it("reject garbage", async () => {
    expect(await unpackStory("zAAAA", id)).toBeNull();
    expect(storyFromJson({ title: "x", slides: [] }, id)).toBeNull();
  });
});
