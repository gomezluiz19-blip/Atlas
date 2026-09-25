import { describe, expect, it } from "vitest";
import {
  buildFlowModel,
  fillDepressions,
  snapToStream,
  touchesEdge,
  traceDownstream,
  watershedMask,
} from "../src/analysis/hydrology";

function grid(width: number, height: number, f: (x: number, y: number) => number, cell = 30) {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = f(x, y);
  return { width, height, data, rowCellSize: new Float64Array(height).fill(cell) };
}

describe("fillDepressions", () => {
  it("fills a pit up to its spill point", () => {
    // 5x5 bowl: rim at 10, interior 5, one notch in the rim at 7.
    const g = grid(5, 5, (x, y) => (x === 0 || y === 0 || x === 4 || y === 4 ? 10 : 5));
    g.data[2] = 7; // notch at top edge (x=2, y=0)
    const filled = fillDepressions(g);
    const centre = filled[2 * 5 + 2];
    expect(centre).toBeGreaterThanOrEqual(7);
    expect(centre).toBeLessThan(7.01);
  });
});

describe("buildFlowModel", () => {
  it("routes a tilted plane straight downhill and accumulates area", () => {
    // Elevation falls toward x = 0.
    const g = grid(10, 5, (x) => x * 2);
    const m = buildFlowModel(g);
    const start = 2 * 10 + 8;
    const path = traceDownstream(m, start);
    const xs = path.map((i) => i % 10);
    expect(xs).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 0]);
    // Every interior cell has a receiver.
    for (let y = 1; y < 4; y++) for (let x = 1; x < 9; x++) expect(m.receiver[y * 10 + x]).toBeGreaterThanOrEqual(0);
    // Area at the outlet of a row is at least the row's upstream cells.
    expect(m.area[2 * 10 + 1]).toBeGreaterThanOrEqual(8 * 30 * 30);
  });

  it("drains a closed basin through its lowest rim cell", () => {
    const g = grid(7, 7, (x, y) => (x === 0 || y === 0 || x === 6 || y === 6 ? 20 : 5 + Math.abs(x - 3) + Math.abs(y - 3)));
    g.data[3 * 7 + 6] = 12; // outlet on the east edge
    const m = buildFlowModel(g);
    const path = traceDownstream(m, 3 * 7 + 3);
    expect(path[path.length - 1]).toBe(3 * 7 + 6);
  });
});

describe("watershed", () => {
  it("delineates the two halves of a ridge", () => {
    // A ridge along x = 10 splits water to the west and east edges; valley floors along y = 5.
    const g = grid(21, 11, (x, y) => 100 - Math.abs(x - 10) * 3 + Math.abs(y - 5) * 6);
    const m = buildFlowModel(g);
    const westOutlet = snapToStream(m, 5 * 21 + 1, 2);
    const mask = watershedMask(m, westOutlet);
    // Cells west of the ridge drain west; cells east of it do not.
    expect(mask[5 * 21 + 5]).toBe(1);
    expect(mask[5 * 21 + 15]).toBe(0);
    expect(touchesEdge(mask, 21, 11)).toBe(true);
  });
});
