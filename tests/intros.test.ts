import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { INTROS, introFor, type Form } from "../src/intros/places";
import { formGeometry, formReach } from "../src/intros/intro";

describe("landmark intros: the places", () => {
  it("has about a hundred, each with a unique id, a point, a size, lines and facts", () => {
    expect(INTROS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(INTROS.map((p) => p.id)).size).toBe(INTROS.length);
    for (const p of INTROS) {
      expect(Math.abs(p.lon), p.id).toBeLessThanOrEqual(180);
      expect(Math.abs(p.lat), p.id).toBeLessThanOrEqual(90);
      expect(p.size, p.id).toBeGreaterThan(50);
      expect(p.lines.length, p.id).toBeGreaterThan(0);
      expect(p.lines.length, p.id).toBeLessThanOrEqual(4);
      for (const l of p.lines) expect(l.length, p.id).toBeLessThan(140);
    }
  });

  it("spreads across the world, not just Europe and North America", () => {
    const south = INTROS.filter((p) => p.lat < 23.5 || (p.lon > 25 && p.lon < 150 && p.lat < 40) || (p.lon < -30 && p.lat < 30));
    expect(south.length / INTROS.length).toBeGreaterThan(0.4);
    const africa = INTROS.filter((p) => p.lon > -20 && p.lon < 52 && p.lat < 33 && p.lat > -36);
    expect(africa.length).toBeGreaterThanOrEqual(12);
  });

  it("keeps every callout and form inside its diorama", () => {
    for (const p of INTROS) {
      for (const part of p.parts ?? []) expect(Math.max(Math.abs(part.dx ?? 0), Math.abs(part.dy ?? 0)), `${p.id}: ${part.label}`).toBeLessThan(p.size / 2);
      for (const f of p.forms ?? []) expect(Math.max(Math.abs(f.dx ?? 0), Math.abs(f.dy ?? 0)), p.id).toBeLessThan(p.size / 2);
    }
  });

  it("finds a place by its name, another name, or a point near it", () => {
    expect(introFor("Statue of Liberty")?.id).toBe("statue-of-liberty");
    expect(introFor("statue of liberty ")?.id).toBe("statue-of-liberty");
    expect(introFor("Somewhere else", -74.0447, 40.6893)?.id).toBe("statue-of-liberty");
    expect(introFor("Nowhere in particular", 10, 10)).toBeNull();
    expect(introFor(undefined)).toBeNull();
    for (const p of INTROS) expect(introFor(p.name)?.id, p.name).toBe(p.id);
    for (const p of INTROS) for (const a of p.also ?? []) expect(introFor(a)?.id, a).toBe(p.id);
  });
});

describe("landmark intros: the massing forms", () => {
  const top = (f: Form) => { const g = formGeometry(f); g.computeBoundingBox(); return g.boundingBox!; };
  it("stands each kind of form on its base, at its height", () => {
    const kinds: [Form, number][] = [
      [{ f: "box", w: 10, d: 20, h: 30 }, 30], [{ f: "frustum", w: 20, top: 10, h: 40, z: 5 }, 45], [{ f: "cyl", r: 3, h: 12 }, 12],
      [{ f: "cone", r: 3, h: 9 }, 9], [{ f: "dome", r: 10, h: 6 }, 6], [{ f: "sphere", r: 2, z: 10 }, 14], [{ f: "pyramid", w: 230, h: 139 }, 139],
      [{ f: "steps", w: 40, top: 10, h: 20, n: 4 }, 20], [{ f: "ring", rx: 94, ry: 78, ix: 43, iy: 27, h: 48 }, 48],
      [{ f: "stones", r: 16, n: 30, w: 2, d: 1, h: 4 }, 4], [{ f: "shell", rx: 20, ry: 12, h: 50, z: 8 }, 58],
    ];
    for (const [f, want] of kinds) {
      const b = top(f);
      expect(b.max.y, f.f).toBeCloseTo(want, 0);
      expect(b.min.y, f.f).toBeGreaterThanOrEqual(("z" in f ? f.z ?? 0 : 0) - 0.01);
    }
    const arch = top({ f: "arch", span: 192, h: 192, t: 9 });
    expect(arch.max.y).toBeGreaterThan(190);
    expect(arch.max.x - arch.min.x).toBeGreaterThan(190);
  });

  it("puts north up the screen and east to the right", () => {
    const b = top({ f: "box", w: 2, d: 2, h: 2, dx: 100, dy: 50 });
    const c = b.getCenter(new THREE.Vector3());
    expect(c.x).toBeCloseTo(100);
    expect(c.z).toBeCloseTo(-50);
  });

  it("builds every form in the list, and knows how far out they reach", () => {
    for (const p of INTROS) for (const f of p.forms ?? []) expect(formGeometry(f).attributes.position.count, p.id).toBeGreaterThan(0);
    expect(formReach([{ f: "box", w: 10, d: 10, h: 5, dx: 20 }])).toBeGreaterThan(24);
  });
});

describe("notable places: a fairer bar", () => {
  it("lowers the sitelink bar where a view comes back thin, and stops at 3", async () => {
    const { lowerBar } = await import("../src/data/wikidata");
    expect(lowerBar(30, 4, 160)).toBe(15);
    expect(lowerBar(30, 80, 160)).toBeNull();
    expect(lowerBar(5, 2, 160)).toBe(3);
    expect(lowerBar(3, 0, 160)).toBeNull();
  });
});
