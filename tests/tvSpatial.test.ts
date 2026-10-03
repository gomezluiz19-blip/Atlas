import { describe, expect, it } from "vitest";
import { nearest } from "../src/tv/spatial";

const r = (x: number, y: number, w = 40, h = 20) => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y }) as DOMRect;

describe("spatial navigation", () => {
  // A row of three buttons, and one below the middle one.
  const from = r(100, 100);
  const others = [r(20, 100), r(180, 100), r(100, 160), r(260, 100)];
  it("goes to the nearest thing that way", () => {
    expect(nearest(from, others, "right")).toBe(1);
    expect(nearest(from, others, "left")).toBe(0);
    expect(nearest(from, others, "down")).toBe(2);
  });
  it("finds nothing past the edge", () => expect(nearest(from, others, "up")).toBe(-1));
  it("prefers straight ahead over a closer diagonal", () => {
    expect(nearest(r(0, 0), [r(60, 50), r(0, 90)], "down")).toBe(1);
  });
});
