import { describe, expect, it } from "vitest";
import { assignSlugs, parseSlug, slugify, spotSlug, wikidataSlug, type PlaceEntry } from "../src/place/slug";
import { pagesFor, renderPage, sitemap, type LabelRow } from "../src/place/prerender";
import { likeThis } from "../src/place/measure";
import { FEATURES } from "../src/content/features";

const e = (name: string, lon: number, lat: number, source: PlaceEntry["source"], rank: number, detail?: string, i = 0): PlaceEntry => ({ name, lon, lat, kind: "city", rank, detail, source, i });

describe("place addresses", () => {
  it("makes readable slugs", () => {
    expect(slugify("São Tomé & Príncipe")).toBe("sao-tome-and-principe");
    expect(slugify("Mount Everest")).toBe("mount-everest");
    expect(slugify("Côte d’Ivoire")).toBe("cote-divoire");
  });

  it("gives the plain name to the bigger place and the area to namesakes", () => {
    const m = assignSlugs([e("Trinidad", -56.9, -33.5, "detail", 116, "Flores, Uruguay"), e("Trinidad", -61.3, 10.4, "world", 200, "island")]);
    expect(m.get("trinidad")?.lon).toBe(-61.3);
    expect(m.get("trinidad-flores-uruguay")?.lon).toBe(-56.9);
  });

  it("keeps one address for the same place listed twice", () => {
    const m = assignSlugs([e("Mount Everest", 86.925, 27.988, "feature", 1000), e("Mount Everest", 86.93, 27.99, "world", 300)]);
    expect([...m.keys()]).toEqual(["mount-everest"]);
    expect(m.get("mount-everest")?.source).toBe("feature");
  });

  it("is stable whatever order the places come in", () => {
    const list = [e("A", 1, 1, "world", 5, "x"), e("A", 50, 1, "world", 5, "y"), e("A", 90, 1, "detail", 9, "z")];
    const one = [...assignSlugs(list)].map(([s, v]) => `${s}:${v.lon}`).sort();
    const two = [...assignSlugs([...list].reverse())].map(([s, v]) => `${s}:${v.lon}`).sort();
    expect(one).toEqual(two);
  });

  it("reads every kind of address", () => {
    expect(parseSlug("nile")).toEqual({ kind: "named", slug: "nile" });
    expect(parseSlug(spotSlug(138.7274, 35.3606))).toEqual({ kind: "spot", lon: 138.7274, lat: 35.3606 });
    expect(parseSlug(wikidataSlug("Eiffel Tower", "Q243"))).toEqual({ kind: "wikidata", qid: "Q243" });
    expect(parseSlug("@95,10")).toBeNull();
    expect(parseSlug("<script>")).toBeNull();
  });
});

describe("place pages", () => {
  const world: LabelRow[] = [["Lyon", 4.835, 45.76, "city", 5, 200, "Rhône, France"], ["Villeurbanne", 4.88, 45.77, "city", 7, 120, "Rhône, France"]];
  const pages = pagesFor(FEATURES.slice(0, 3), world, []);
  const lyon = pages.find((p) => p.slug === "lyon")!;

  it("describes each place and links its neighbours", () => {
    expect(lyon.description).toBe("Lyon is a town or city in Rhône, France.");
    expect(lyon.nearby.map((n) => n.slug)).toContain("villeurbanne");
    expect(pages.find((p) => p.slug === "nile")?.facts.length).toBeGreaterThan(1);
  });

  it("writes the app's page with the place's own head and content", () => {
    const app = `<!doctype html><html><head><meta charset="UTF-8" /><meta name="description" content="Terreno" /><title>Terreno</title></head><body><div id="ui"></div></body></html>`;
    const html = renderPage(app, lyon, "https://x.io/atlas/");
    expect(html).toContain("<title>Lyon: town or city · Terreno</title>");
    expect(html).toContain('<base href="../../" />');
    expect(html).toContain('window.ATLAS_PAGE="lyon"');
    expect(html).toContain('<link rel="canonical" href="https://x.io/atlas/p/lyon/" />');
    expect(html).toContain('"@type":"City"');
    expect(html).toContain('<a href="./p/villeurbanne/">Villeurbanne</a>');
    expect(html).toContain('<div id="ui"></div>');
    expect(renderPage(app, { ...lyon, name: "<b>" }, "")).not.toContain("<b>");
  });

  it("lists every page in the sitemap", () => {
    expect(sitemap("https://x.io/", ["a", "b"])).toContain("<loc>https://x.io/p/b/</loc>");
  });
});

describe("places like this", () => {
  it("describes a place by bands around its own figures", () => {
    const c = likeThis({ elev: 300, slope: 1, temp: 12, rain: 800, coast: 5, crowd: 20_000 });
    const elev = c.filter((x) => x.key === "elev");
    expect(elev.map((x) => x.op).sort()).toEqual(["gt", "lt"]);
    expect(elev.find((x) => x.op === "gt")!.value).toBeLessThan(300);
    expect(c).toContainEqual({ key: "coast", op: "lt", value: 20 });
    expect(c).toContainEqual({ key: "crowd", op: "lt", value: 100_000 });
    expect(c.find((x) => x.key === "slope")).toEqual({ key: "slope", op: "lt", value: 4 });
    expect(likeThis({ crowd: 1_400_000, slope: 8 })).toEqual([{ key: "city", op: "lt", value: 30 }]);
  });

  it("skips what isn't known", () => {
    expect(likeThis({ elev: NaN, temp: 10 }).every((x) => x.key === "temp")).toBe(true);
  });
});
