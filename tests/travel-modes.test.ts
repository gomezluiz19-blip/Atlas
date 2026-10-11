import { beforeEach, describe, expect, it } from "vitest";
import { rideLinks } from "../src/place/around";
import { lastTravel, MAIN, MORE, rememberTravel, TRAVEL } from "../src/ui/travelModes";

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };

describe("how you're going", () => {
  beforeEach(() => store.clear());
  it("leads with walk, drive, train and taxi; the rest under More", () => {
    expect(MAIN).toEqual(["walk", "drive", "train", "taxi"]);
    expect(MORE).toEqual(["bike", "fly", "guide"]);
    for (const c of [...MAIN, ...MORE]) expect(TRAVEL[c].icon).toMatch(/^<svg/);
  });
  it("walks by default and remembers a way of going, but not a one-off", () => {
    expect(lastTravel()).toBe("walk");
    rememberTravel("taxi");
    expect(lastTravel()).toBe("taxi");
    rememberTravel("fly");
    expect(lastTravel()).toBe("taxi");
  });
  it("routes what Terreno can route itself", () => {
    expect(TRAVEL.walk.route).toBe("walk");
    expect(TRAVEL.taxi.route).toBe("drive");
    expect(TRAVEL.train.route).toBeUndefined();
  });
  it("books a ride with the drop-off filled in", () => {
    const [uber, lyft] = rideLinks({ lon: -74.0035, lat: 40.736 }, "Casa Nopal");
    expect(uber.href).toContain("dropoff[latitude]=40.736000");
    expect(uber.href).toContain("dropoff[nickname]=Casa%20Nopal");
    expect(lyft.href).toContain("destination[longitude]=-74.003500");
  });
});
