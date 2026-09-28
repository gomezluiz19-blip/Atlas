import { describe, expect, it } from "vitest";
import { buildStack, depositedFraction, fitStructure, horizonElevation, layerIndexAt } from "../src/analysis/geosection";
import type { StratUnit } from "../src/data/macrostrat";

const unit = (id: number, t: number, b: number, thick: number): StratUnit => ({
  unit_id: id, col_id: 1, unit_name: `U${id}`, t_age: t, b_age: b, max_thick: thick, min_thick: thick, lith: [], color: "#ccc",
});

const units = [unit(1, 270, 275, 100), unit(2, 275, 280, 200), unit(3, 280, 300, 300)];

describe("geosection", () => {
  it("stacks units by thickness", () => {
    const s = buildStack(units);
    expect(s.map((l) => [l.depthTop, l.depthBottom])).toEqual([[0, 100], [100, 300], [300, 600]]);
  });

  it("fits elevation and dip to mapped outcrops", () => {
    const stack = buildStack(units);
    // True structure: top at 2000 m at x=0, rising 1 m per 100 m toward B.
    const truth = { top: 2000, slope: 0.01 };
    const obs = [0, 2000, 4000, 6000, 8000, 10000].map((x, i) => {
      const layer = stack[i % 3];
      const z = horizonElevation(truth, (layer.depthTop + layer.depthBottom) / 2, x);
      return { x, z, unitIds: [layer.unit.unit_id] };
    });
    const fit = fitStructure(stack, obs, 10000, 2500);
    expect(fit.method).toBe("fit");
    expect(fit.structure.top).toBeCloseTo(2000, 3);
    expect(fit.structure.slope).toBeCloseTo(0.01, 6);
  });

  it("falls back to a flat anchor, then to the highest ground", () => {
    const stack = buildStack(units);
    const one = fitStructure(stack, [{ x: 50, z: 1850, unitIds: [2] }], 1000, 2000);
    expect(one.method).toBe("anchor");
    expect(one.structure.top).toBe(1850 + 200);
    const none = fitStructure(stack, [{ x: 50, z: 1850, unitIds: [99] }], 1000, 2000);
    expect(none).toEqual({ structure: { top: 2000, slope: 0 }, method: "default", used: 0 });
  });

  it("finds the layer at a point", () => {
    const stack = buildStack(units);
    const s = { top: 1000, slope: 0 };
    expect(layerIndexAt(stack, s, 0, 1010)).toBe(-1);
    expect(layerIndexAt(stack, s, 0, 950)).toBe(0);
    expect(layerIndexAt(stack, s, 0, 750)).toBe(1);
    expect(layerIndexAt(stack, s, 0, 500)).toBe(2);
    expect(layerIndexAt(stack, s, 0, 300)).toBe(3);
  });

  it("deposits layers over time", () => {
    const u = unit(1, 270, 280, 10);
    expect(depositedFraction(u, 290)).toBe(0);
    expect(depositedFraction(u, 275)).toBe(0.5);
    expect(depositedFraction(u, 100)).toBe(1);
  });
});

import { cleanRing } from "../src/data/countries";

describe("cleanRing", () => {
  it("drops polar points, duplicates and the closing point", () => {
    const ring: [number, number][] = [[0, 0], [0, 0], [10, 0], [10, 10], [-180, -90], [0, 0]];
    expect(cleanRing(ring)).toEqual([[0, 0], [10, 0], [10, 10]]);
  });
});
