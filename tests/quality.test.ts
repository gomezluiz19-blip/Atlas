import { describe, expect, it } from "vitest";
import { qualityFor, stepDown, tierFor } from "../src/globe/quality";

describe("device quality", () => {
  it("goes light on data saver, slow networks, weak devices and a flat battery", () => {
    expect(tierFor({ dpr: 2, coarse: true, saveData: true, memory: 8, cores: 8 })).toBe("low");
    expect(tierFor({ dpr: 1, coarse: false, net: "2g" })).toBe("low");
    expect(tierFor({ dpr: 3, coarse: true, memory: 2, cores: 8 })).toBe("low");
    expect(tierFor({ dpr: 2, coarse: false, memory: 8, cores: 8, battery: { level: 0.1, charging: false } })).toBe("low");
  });
  it("goes sharp on strong devices and balanced in between", () => {
    expect(tierFor({ dpr: 2, coarse: false, memory: 8, cores: 10, net: "4g" })).toBe("high");
    expect(tierFor({ dpr: 3, coarse: true, memory: 4, cores: 6 })).toBe("mid");
    expect(tierFor({ dpr: 2, coarse: false, memory: 8, cores: 8, net: "3g" })).toBe("mid");
  });
  it("caps pixels, coarsens terrain and stops prefetching as tiers drop", () => {
    const hi = qualityFor("high", { dpr: 3 }), lo = qualityFor("low", { dpr: 3 });
    expect(hi.pixelRatio).toBe(2);
    expect(lo.pixelRatio).toBe(1);
    expect(lo.sse).toBeGreaterThan(hi.sse);
    expect(lo.tileCache).toBeLessThan(hi.tileCache);
    expect(lo.prefetch).toBe(false);
    expect(qualityFor("high", { dpr: 2, saveData: true }).prefetch).toBe(false);
    expect(qualityFor("mid", { dpr: 1 }).pixelRatio).toBe(1);
  });
  it("steps down one tier at a time, never below light", () => {
    expect(stepDown("high")).toBe("mid");
    expect(stepDown("low")).toBe("low");
  });
});
