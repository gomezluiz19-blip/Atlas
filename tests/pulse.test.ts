import { beforeEach, describe, expect, it } from "vitest";
import { arcPts, bearing, between, fracAt, SPAN, tAt, worldAt } from "../src/pulse/model";
import { ortho } from "../src/social/footprint";
import { demoDesk } from "../src/pro/shipping/demo";
import { demoNetwork } from "../src/pro/relief/demo";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
});
const DAY = 86_400_000;

describe("pulse: motion and time", () => {
  it("places something in transit between its two ends", () => {
    expect(between([0, 0], [10, 0], 0, 10, -1)).toBeNull();
    expect(between([0, 0], [10, 0], 0, 10, 11)).toBeNull();
    const mid = between([0, 0], [10, 0], 0, 10, 5)!;
    expect(mid.f).toBe(0.5);
    expect(mid.p[0]).toBeCloseTo(5, 3);
  });
  it("knows which way it's heading", () => {
    expect(bearing([0, 0], [0, 10])).toBeCloseTo(0, 5);
    expect(bearing([0, 0], [10, 0])).toBeCloseTo(90, 5);
    expect(arcPts([0, 0], [10, 0], 4)).toHaveLength(5);
  });
  it("maps the scrub to a month back and a quarter ahead", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(tAt(now, 0)).toBe(now - SPAN.back * DAY);
    expect(tAt(now, 1)).toBe(now + SPAN.ahead * DAY);
    expect(fracAt(now, tAt(now, 0.37))).toBeCloseTo(0.37, 9);
  });
});

describe("pulse: the world at a time", () => {
  it("moves ships along their lanes as time passes, and arrives them", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    store.set("atlas.pro.shipping.v1", JSON.stringify([demoDesk(now)]));
    const a = worldAt(now), b = worldAt(now + 10 * DAY), c = worldAt(now + 80 * DAY);
    const ship = (w: typeof a) => w.movers.find((m) => m.label.includes("MF-24101"));
    expect(ship(a)).toBeTruthy();
    expect(Math.abs(ship(a)!.lon - ship(b)!.lon) + Math.abs(ship(a)!.lat - ship(b)!.lat)).toBeGreaterThan(5);
    expect(ship(c)).toBeUndefined();
    expect(a.counts.freight).toBeGreaterThan(10);
  });
  it("closing a chokepoint changes the lanes that used it", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    store.set("atlas.pro.shipping.v1", JSON.stringify([demoDesk(now)]));
    const lane = (w: ReturnType<typeof worldAt>) => w.lanes.find((l) => l.id.startsWith("fl") && l.pts.some(([x, y]) => x > 32 && x < 44 && y > 12 && y < 30));
    expect(lane(worldAt(now))).toBeTruthy();
    expect(lane(worldAt(now, ["redsea"]))).toBeUndefined();
  });
  it("moves relief loads only while they're on the road", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    store.set("atlas.pro.relief.v1", JSON.stringify([demoNetwork(now)]));
    expect(worldAt(now).movers.filter((m) => m.layer === "relief").length).toBeGreaterThan(0);
    expect(worldAt(now + 60 * DAY).movers.filter((m) => m.layer === "relief")).toHaveLength(0);
  });
});

describe("the footprint globe", () => {
  it("projects the centre to the middle and hides the far side", () => {
    const c = ortho(10, 20, 10, 20);
    expect(c.front).toBe(true);
    expect(Math.abs(c.x) + Math.abs(c.y)).toBeLessThan(1e-9);
    expect(ortho(-170, -20, 10, 20).front).toBe(false);
  });
});
