import { describe, expect, it } from "vitest";
import { PATTERNS } from "../src/ui/haptics";

describe("haptics", () => {
  it("keeps every feel short, and the light ones lighter than the firm ones", () => {
    for (const p of Object.values(PATTERNS)) expect(p.reduce((a, b) => a + b, 0)).toBeLessThan(200);
    expect(PATTERNS.tick[0]).toBeLessThan(PATTERNS.tap[0]);
    expect(PATTERNS.tap[0]).toBeLessThan(PATTERNS.heavy[0]);
    expect(PATTERNS.success.length).toBeGreaterThan(PATTERNS.confirm.length);
  });
});
