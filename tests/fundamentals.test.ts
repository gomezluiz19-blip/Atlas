import { afterEach, describe, expect, it, vi } from "vitest";
import { csvCell, csvText } from "../src/util/csv";
import { loadJson, saveJson, STORAGE_FULL } from "../src/util/storage";

describe("CSV export", () => {
  it("neutralises text a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-cmd")).toBe("'-cmd");
  });
  it("leaves numbers, negative ones included, and plain text alone", () => {
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell("-12.5")).toBe("-12.5");
    expect(csvCell("Engine 54")).toBe("Engine 54");
    expect(csvCell(null)).toBe("");
    expect(csvText([["a", "b, c"], [1, "x\"y"]])).toBe("a,\"b, c\"\n1,\"x\"\"y\"");
  });
});

describe("Saving to the browser", () => {
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  afterEach(() => { store.clear(); delete g.localStorage; vi.restoreAllMocks(); });
  it("round-trips and validates", () => {
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(saveJson("atlas.t", { a: 1 })).toBe(true);
    expect(loadJson("atlas.t", null)).toEqual({ a: 1 });
    expect(loadJson("atlas.t", "no", (v) => Array.isArray(v))).toBe("no");
    expect(loadJson("atlas.missing", 7)).toBe(7);
  });
  it("raises a warning instead of failing silently when storage is full", () => {
    g.localStorage = { getItem: () => null, setItem: () => { throw new DOMException("full", "QuotaExceededError"); } };
    const seen: unknown[] = [];
    const target = new EventTarget();
    g.dispatchEvent = (e: Event) => target.dispatchEvent(e);
    target.addEventListener(STORAGE_FULL, (e) => seen.push((e as CustomEvent).detail));
    expect(saveJson("atlas.big", { x: 1 })).toBe(false);
    expect(seen).toEqual([{ key: "atlas.big", full: true }]);
    delete g.dispatchEvent;
  });
});

import { imagery, imageryTile } from "../src/globe/imagery";
import { isStaleChunk } from "../src/ui/warm";
describe("Imagery provider", () => {
  it("is Esri by default, with Esri's row/column order", () => {
    expect(imageryTile(3, 4, 5, imagery({}))).toBe("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/5/4");
  });
  it("switches to MapTiler or Mapbox when chosen and keyed, and not otherwise", () => {
    expect(imageryTile(3, 4, 5, imagery({ imagery: "maptiler", maptilerKey: "k" }))).toBe("https://api.maptiler.com/tiles/satellite-v2/3/4/5.jpg?key=k");
    expect(imagery({ imagery: "mapbox", mapboxToken: "t" }).id).toBe("mapbox");
    expect(imagery({ imagery: "maptiler" }).id).toBe("esri");
  });
});
describe("reloading onto a new deploy", () => {
  it("reloads for a missing file, never for a data source that didn't answer", () => {
    expect(isStaleChunk(new TypeError("Failed to fetch dynamically imported module: https://terreno.site/assets/tv-abc.js"))).toBe(true);
    expect(isStaleChunk(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunk(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isStaleChunk(new Error("Unable to preload CSS for /assets/studio-x.css"))).toBe(true);
    expect(isStaleChunk(new Error("Wikipedia: could not be reached"))).toBe(false);
    expect(isStaleChunk(new TypeError("Failed to fetch"))).toBe(false);
    expect(isStaleChunk(undefined)).toBe(false);
  });
});
