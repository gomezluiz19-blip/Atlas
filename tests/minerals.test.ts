import { describe, expect, it } from "vitest";
import { COMMODITIES, COUNTRY_CODES, countryRanks, MINERALS, MINES, ROCKS, rockProfile } from "../src/content/minerals";

describe("minerals content", () => {
  it("has sane producer shares with known countries", () => {
    for (const c of COMMODITIES) {
      const total = c.producers.reduce((s, [, v]) => s + v, 0);
      expect(total, c.id).toBeLessThanOrEqual(100);
      for (let i = 1; i < c.producers.length; i++) expect(c.producers[i][1], c.id).toBeLessThanOrEqual(c.producers[i - 1][1]);
      for (const [name] of c.producers) expect(COUNTRY_CODES[name], `${c.id}: ${name}`).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("points every mine at valid coordinates and known commodities", () => {
    const ids = new Set(COMMODITIES.map((c) => c.id));
    const names = new Set<string>();
    for (const m of MINES) {
      expect(Math.abs(m.lat), m.name).toBeLessThanOrEqual(90);
      expect(Math.abs(m.lon), m.name).toBeLessThanOrEqual(180);
      for (const g of m.goods) expect(ids.has(g), `${m.name}: ${g}`).toBe(true);
      expect(names.has(m.name), m.name).toBe(false);
      names.add(m.name);
    }
    // Every commodity should have at least one landmark mine to show.
    for (const c of COMMODITIES) expect(MINES.some((m) => m.goods.includes(c.id)), c.id).toBe(true);
  });

  it("links rocks to minerals that exist", () => {
    const ids = new Set(COMMODITIES.map((c) => c.id));
    for (const [, p] of ROCKS) {
      for (const k of p.minerals) expect(MINERALS[k], `${p.label}: ${k}`).toBeDefined();
      for (const g of p.goods) expect(ids.has(g), `${p.label}: ${g}`).toBe(true);
    }
    for (const mn of Object.values(MINERALS)) if (mn.ore) expect(ids.has(mn.ore), mn.name).toBe(true);
  });

  it("recognises rock types in bedrock descriptions", () => {
    expect(rockProfile("Major:{granite},Minor:{pegmatite}")?.label).toBe("Pegmatite");
    expect(rockProfile("Coconino Sandstone")?.label).toBe("Sandstone");
    expect(rockProfile("Redwall Limestone")?.label).toBe("Limestone");
    expect(rockProfile("Vishnu Schist")?.label).toBe("Schist or gneiss");
    expect(rockProfile("Columbia River Basalt Group")?.label).toBe("Basalt");
    expect(rockProfile("Something undescribed")).toBeNull();
  });

  it("ranks countries among producers", () => {
    const cl = countryRanks("CL");
    expect(cl[0]).toMatchObject({ rank: 1 });
    expect(cl.map((r) => r.c.id)).toContain("copper");
    expect(countryRanks("CD").find((r) => r.c.id === "cobalt")?.share).toBeGreaterThan(50);
    expect(countryRanks("FR")).toEqual([]);
  });
});
