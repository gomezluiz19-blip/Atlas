import { describe, expect, it } from "vitest";
import { HERITAGE_INTROS } from "../src/intros/heritage";
import { INTROS, introFor, introForAsync, loadWorldHeritage, worldHeritageCount, type IntroPlace } from "../src/intros/places";
import { countriesOf, joinFor, listingIntro, worldHeritage } from "../src/intros/unesco";
import { WHC } from "../src/intros/whcList";

const row = (id: number) => WHC.find((r) => r[0] === id)!;
const copy = () => INTROS.map((p) => ({ ...p, also: p.also && [...p.also], facts: [...p.facts], tags: p.tags && [...p.tags] })) as IntroPlace[];

describe("the World Heritage List", () => {
  it("has all 1,273 sites, each with a name, a year and a point", () => {
    expect(WHC.length).toBe(1273);
    expect(new Set(WHC.map((r) => r[0])).size).toBe(1273);
    for (const [, name, , cat, year, lon, lat] of WHC) {
      expect(name.length).toBeGreaterThan(2);
      expect(["c", "n", "m"]).toContain(cat);
      expect(year).toBeGreaterThanOrEqual(1978);
      expect(Math.abs(lon) <= 180 && Math.abs(lat) <= 90).toBe(true);
    }
  });
  it("shortens UN country names", () => {
    expect(countriesOf("United Kingdom of Great Britain and Northern Ireland,France")).toEqual(["United Kingdom", "France"]);
  });
  it("makes a plain intro from a listing", () => {
    const p = listingIntro(row(1));
    expect(p).toMatchObject({ id: "whc-1", whc: 1, name: "Galápagos Islands", where: "Ecuador", size: 15000 });
    expect(p.facts).toContainEqual(["World Heritage since", "1978"]);
    expect(p.lines[0]).toMatch(/natural value/);
    const many = listingIntro(row(1133));
    expect(many.where).toMatch(/and \d+ more countries/);
  });
  it("joins listings onto the intros Atlas already has, by place or by name", () => {
    expect(joinFor(row(274), INTROS)?.id).toBe("machu-picchu");
    expect(joinFor(row(166), INTROS)?.id).toBe("sydney-opera-house");
    expect(joinFor(row(488), INTROS)?.id).toBe("tower-of-london");
  });
  it("leaves the rest as listings, and joining adds the UNESCO name and year", () => {
    const intros = copy();
    const rest = worldHeritage(intros);
    expect(rest.length).toBeGreaterThan(1000);
    expect(rest.length + new Set(intros.filter((p) => p.whc).map((p) => p.whc)).size).toBeLessThanOrEqual(1273);
    const mp = intros.find((p) => p.id === "machu-picchu")!;
    expect(mp.also).toContain("Historic Sanctuary of Machu Picchu");
    expect(mp.facts).toContainEqual(["World Heritage since", "1983"]);
    // Explicit claims: Karnak and Luxor Temple are both Ancient Thebes; separate places nearby stay apart.
    expect(intros.find((p) => p.id === "karnak")!.whc).toBe(87);
    expect(intros.find((p) => p.id === "luxor-temple")!.whc).toBe(87);
    expect(rest.some((p) => p.whc === 1426)).toBe(true);
    expect(intros.find((p) => p.id === "pont-du-gard")!.also).not.toContain("Decorated Cave of Pont d’Arc, known as Grotte Chauvet-Pont d’Arc, Ardèche");
  });
  it("finds a listed site by name once the List is loaded", async () => {
    expect(await introForAsync("Rock Islands Southern Lagoon")).toMatchObject({ whc: 1386 });
    expect(worldHeritageCount()).toBeGreaterThan(1000);
    expect(introFor("Historic Sanctuary of Machu Picchu")?.id).toBe("machu-picchu");
    expect(introFor("Mount Fuji")?.id).toBe("mount-fuji");
    await loadWorldHeritage();
  });
  it("has hand-written intros for the most visited sites, each tagged heritage", () => {
    expect(HERITAGE_INTROS.length).toBeGreaterThan(150);
    for (const p of HERITAGE_INTROS) { expect(p.tags).toContain("heritage"); expect(p.lines.length).toBeGreaterThanOrEqual(1); }
  });
});

