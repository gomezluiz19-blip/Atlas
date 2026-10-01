import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FOOTHOLD_INTROS } from "../src/intros/footholds";
import { isNight, makeFx } from "../src/intros/fx";
import { NATURE_INTROS } from "../src/intros/nature";
import { introFor } from "../src/intros/places";

describe("footholds and feats of nature", () => {
  it("are found by the names people search", () => {
    for (const [q, id] of [["Northern lights", "aurora-borealis"], ["Lion", "african-lion"], ["Adirondacks", "adirondacks"], ["Himalayas", "himalaya"], ["Rockies", "rocky-mountains"], ["Amazon", "amazon"], ["Wildebeest migration", "great-migration"],
      ["Disney World", "magic-kingdom"], ["Daytona 500", "daytona"], ["Noma", "noma"], ["Chanel", "chanel-rue-cambon"], ["Boeing Everett", "boeing-everett"], ["Bingham Canyon", "bingham-canyon"], ["Custer State Park", "custer-state-park"], ["Zion National Park", "zion"]] as const)
      expect(introFor(q)?.id, q).toBe(id);
  });
  it("tag every kind, so lines and lenses can find their own", () => {
    const tags = new Set(FOOTHOLD_INTROS.flatMap((p) => p.tags ?? []));
    for (const t of ["park", "attraction", "amusement", "racing", "food", "fashion", "factory", "mining"]) expect(tags.has(t), t).toBe(true);
    expect(NATURE_INTROS.every((p) => p.tags?.includes("nature"))).toBe(true);
  });
});

describe("intro effects", () => {
  const opts = (model: THREE.Group) => ({ model, size: 6000, ground: () => 0, top: 10, ex: 1 });
  it("knows which need the night", () => {
    expect(isNight([{ fx: "aurora" }])).toBe(true);
    expect(isNight([{ fx: "clouds" }])).toBe(false);
    expect(isNight(undefined)).toBe(false);
  });
  it("builds each effect, moves it over time, and cleans up", () => {
    const model = new THREE.Group();
    const fx = makeFx(NATURE_INTROS.find((p) => p.id === "great-migration")!.fx!, opts(model));
    expect(model.children.length).toBe(2);
    const herd = model.children.find((c) => c instanceof THREE.InstancedMesh && c.count > 100) as THREE.InstancedMesh;
    const at = (t: number) => { fx.update(t); const m = new THREE.Matrix4(); herd.getMatrixAt(0, m); return new THREE.Vector3().setFromMatrixPosition(m); };
    const a = at(0), b = at(3);
    expect(b.distanceTo(a)).toBeGreaterThan(50);
    fx.dispose();
    expect(model.children.length).toBe(0);
    for (const f of [{ fx: "aurora" as const }, { fx: "clouds" as const }, { fx: "glow" as const, n: 10, color: "#fff", spread: 100 }]) {
      const s = makeFx([f], opts(model)); s.update(1); s.dispose();
    }
    expect(model.children.length).toBe(0);
  });
});
