import { describe, expect, it } from "vitest";
import { Canvas, type CanvasItem } from "../src/canvas";

function item(id: string, over: Partial<CanvasItem> = {}) {
  const log: string[] = [];
  const it: CanvasItem = { id, label: id, color: "#000", scope: "world", pinned: false, show: (v) => log.push(v ? "show" : "hide"), remove: () => log.push("remove"), ...over };
  return { it, log };
}

describe("canvas", () => {
  it("keeps user layers on in every theme", () => {
    const c = new Canvas();
    c.setTheme("water");
    const { it, log } = item("net:rail");
    c.put(it);
    c.setTheme("built");
    c.setTheme("plants");
    expect(log).toEqual(["show"]);
    expect(c.visible().map((i) => i.id)).toEqual(["net:rail"]);
  });

  it("shows a theme's suggested layers only in that theme, unless pinned", () => {
    const c = new Canvas();
    c.setTheme("built");
    const { it, log } = item("net:ports", { theme: "built" });
    c.put(it);
    c.setTheme("water");
    expect(c.visible()).toHaveLength(0);
    c.setTheme("built");
    expect(log).toEqual(["show", "hide", "show"]);
    c.setPinned("net:ports", true);
    c.setTheme("water");
    expect(c.visible().map((i) => i.id)).toEqual(["net:ports"]);
  });

  it("keeps place results across themes and clears them for a new place", () => {
    const c = new Canvas();
    c.setTheme("water");
    const a = item("tool:flow", { scope: "place", theme: "water" });
    const b = item("tool:shed", { scope: "place", theme: "water" });
    c.put(a.it, true);
    c.put(b.it, true);
    c.setPinned("tool:shed", true);
    c.setTheme("built");
    expect(c.visible()).toHaveLength(2);
    c.newPlace();
    expect(a.log).toEqual(["hide", "remove"]);
    expect(c.visible().map((i) => i.id)).toEqual(["tool:shed"]);
  });

  it("removes and clears", () => {
    const c = new Canvas();
    const a = item("x"), b = item("y");
    c.put(a.it);
    c.put(b.it);
    c.remove("x");
    expect(a.log).toEqual(["show", "hide", "remove"]);
    c.clear();
    expect(c.visible()).toHaveLength(0);
    expect(b.log).toContain("remove");
  });

  it("hides a view for now without losing it, and brings it back", () => {
    const c = new Canvas();
    const { it, log } = item("wind");
    c.put(it);
    c.setOff("wind", true);
    expect(c.visible()).toHaveLength(0);
    expect(c.listed().map((i) => [i.id, i.off])).toEqual([["wind", true]]);
    c.setTheme("water");
    expect(log).toEqual(["show", "hide"]);
    c.setOff("wind", false);
    expect(log).toEqual(["show", "hide", "show"]);
    expect(c.listed()[0].off).toBe(false);
  });

  it("keeps a view hidden when its owner redraws it", () => {
    const c = new Canvas();
    c.put(item("globe:geology").it);
    c.setOff("globe:geology", true);
    const again = item("globe:geology");
    c.put(again.it);
    expect(c.listed()[0].off).toBe(true);
    expect(again.log).toEqual([]);
  });

  it("lists another theme's own layers only in that theme", () => {
    const c = new Canvas();
    c.setTheme("built");
    c.put(item("net:ports", { theme: "built" }).it);
    c.setTheme("water");
    expect(c.listed()).toHaveLength(0);
  });
});
