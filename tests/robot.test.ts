import { describe, expect, it } from "vitest";
import { plan } from "../src/robot/plan";

const ids = (q: string) => plan(q).steps.map((s) => (s.kind === "view" ? `${s.theme}/${s.subtab}` : s.kind === "layer" ? s.action : `commodity:${s.id}`));
const place = (q: string) => {
  const p = plan(q).place;
  return p?.kind === "query" ? p.text : p?.kind ?? null;
};

describe("task robot planner", () => {
  it("finds the place", () => {
    expect(place("where does rain go in downtown Chicago and show the storm drains")).toBe("downtown chicago");
    expect(place("show storm drains in the City of London")).toBe("city of london");
    expect(place("lithium mines in Chile")).toBe("chile");
    expect(place("geology of Iceland")).toBe("iceland");
    expect(place("weather at Mount Everest")).toBe("mount everest");
    expect(place("Tokyo earthquakes")).toBe("tokyo");
    expect(place("railways and power plants near Munich")).toBe("munich");
    expect(place("what's here")).toBe("here");
    expect(place("rivers and lakes in Salt Lake City")).toBe("salt lake city");
    expect(place("show earthquakes")).toBeNull();
  });

  it("plans the user's example: rain and water through a city", () => {
    expect(ids("where does the rain go in downtown Chicago, and show the storm drains and railways")).toEqual(["net:rail", "water/rain", "water/city"]);
    const london = ids("how does water flow through the city of London");
    expect(london).toContain("water/rain");
    expect(london).toContain("water/city");
  });

  it("adds layers and opens a related view when no view is named", () => {
    expect(ids("railways and power plants near Munich")).toEqual(["net:rail", "net:power", "built/transport"]);
    expect(ids("Tokyo earthquakes")).toEqual(["overlay:quakes"]);
    expect(ids("show earthquakes and tectonic plates")).toEqual(["overlay:quakes", "overlay:plates"]);
  });

  it("handles commodities", () => {
    expect(ids("lithium mines in Chile")).toEqual(["commodity:lithium", "minerals/mines", "minerals/commodities"]);
    expect(ids("where does copper come from")).toEqual(["commodity:copper", "minerals/commodities"]);
  });

  it("covers the other themes", () => {
    expect(ids("weather at Mount Everest")).toEqual(["climate/now"]);
    expect(ids("geology of Iceland")).toEqual(["globe:geology", "land/rocks"]);
    expect(ids("endangered animals in Madagascar")).toEqual(["animals/threatened", "animals/species"]);
    expect(ids("what's the energy mix in France")).toEqual(["built/energy"]);
    expect(ids("population of Nigeria")).toEqual(["countries/people"]);
    expect(ids("cross section of the Grand Canyon")).toEqual(["land/profile"]);
    expect(ids("Paris")).toEqual([]);
  });

  it("treats unknown words as a place to look up, or reports them", () => {
    expect(place("show earthquakes and blorps")).toBe("blorps");
    expect(plan("earthquakes here and blorps").unknown).toEqual([]);
  });
});
