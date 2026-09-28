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

describe("task robot and Pro", () => {
  it("asks for live occupancy", () => {
    expect(ids("how full is my hotel")).toEqual(["pro:occupancy"]);
    expect(place("how full is my hotel")).toBe("hotel"); // finds the saved hotel by its kind
    expect(ids("vacancies tonight")).toContain("pro:occupancy");
  });
});

describe("history and work requests", () => {
  it("reads a year and a place", () => {
    const p = plan("Europe in 1914");
    expect(p.place).toEqual({ kind: "query", text: "europe" });
    expect(p.steps[0]).toMatchObject({ kind: "layer", action: "work:borders:1914" });
  });
  it("reads BC years and named empires", () => {
    expect(plan("empires of 500 BC in the Mediterranean").steps[0]).toMatchObject({ action: "work:borders:-500" });
    const r = plan("the Roman Empire in 100 AD");
    expect(r.steps[0]).toMatchObject({ action: "work:borders:100" });
    expect(r.place).toEqual({ kind: "query", text: "rome" });
  });
  it("snaps to the nearest map", () => {
    expect(plan("borders in 1916").steps[0]).toMatchObject({ action: "work:borders:1914" });
  });
  it("leaves addresses alone", () => {
    expect(plan("350 Fifth Avenue New York").steps).toEqual([]);
  });
  it("opens Work tools", () => {
    expect(plan("plan a trip to Lisbon").steps[0]).toMatchObject({ action: "work:plan" });
    expect(plan("make a presentation").steps[0]).toMatchObject({ action: "work:present" });
    expect(plan("plant health in Iowa").steps[0]).toMatchObject({ action: "work:ndvi" });
  });
});

describe("build, flock and teach requests", () => {
  it("opens the right tool", () => {
    const trip = plan("plan a field trip to the Science Museum");
    expect(trip.steps[0]).toMatchObject({ action: "work:teach" });
    expect(trip.place).toEqual({ kind: "query", text: "science museum" });
    expect(plan("check on my cattle").steps[0]).toMatchObject({ action: "work:flock" });
    expect(plan("pet adoption").steps[0]).toMatchObject({ action: "work:flock" });
    expect(plan("construction site progress").steps[0]).toMatchObject({ action: "work:build" });
    expect(plan("make a quiz for my class").steps[0]).toMatchObject({ action: "work:teach" });
  });
});

describe("lens phrases", () => {
  const acts = (t: string) => plan(t).steps.map((s) => (s.kind === "layer" ? s.action : s.kind === "view" ? `${s.theme}/${s.subtab}` : s.id));
  it("maps requests about a feature to lenses", () => {
    expect(acts("slice open Mount Rainier")).toContain("lens:slice");
    expect(acts("drain the ocean around Britain")).toContain("lens:sealevel");
    expect(acts("true size of Greenland")).toContain("lens:size");
    expect(acts("subway map of Tokyo")).toContain("lens:transit");
    expect(acts("ocean currents in the Atlantic")).toContain("lens:trace");
    expect(acts("3d block of the Grand Canyon")).toContain("lens:block");
    expect(acts("where was London during pangaea")).toContain("lens:rewind");
  });
  it("still finds the place", () => {
    const p = plan("slice open Mount Rainier");
    expect(p.place).toEqual({ kind: "query", text: expect.stringMatching(/mount rainier/i) });
  });
});

describe("my place phrases", () => {
  it("opens My Place for a person's own place", () => {
    const acts = (t: string) => plan(t).steps.map((s) => (s.kind === "layer" ? s.action : ""));
    expect(acts("frost at my farm")).toContain("mode:place");
    expect(acts("what's due today at my farm")).toContain("mode:place");
    expect(acts("my daily brief")).toContain("mode:place");
    expect(acts("my cattle")).toContain("work:flock");
    expect(plan("frost at my farm").place).toBeNull();
    expect(plan("my daily brief").place).toBeNull();
  });
});
