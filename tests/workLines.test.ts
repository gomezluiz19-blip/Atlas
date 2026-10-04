import { describe, expect, it } from "vitest";
import { FAMILIES, fit, LINES, LOOKS, rank, tierOf } from "../src/work/workLines";

const top = (q: string) => rank(q)[0]?.station.id;

describe("the Work map", () => {
  it("puts each pro tool on an industry line, specialists after the tool they serve", () => {
    const ids = (l: string) => LINES.find((x) => x.id === l)!.stations.map((s) => s.id);
    expect(ids("build")).toEqual(["build", "buildpro", "con-pro", "con-union", "con-supply", "fn-construction"]);
    expect(ids("mine")).toEqual(["explore-mine", "desk-mine", "mining", "fn-mining"]);
    expect(LINES.flatMap((l) => l.stations).filter((s) => s.tool.startsWith("services:")).map((s) => s.tool.slice(9)).sort()).toEqual(["agriculture", "architecture", "art", "construction", "energy", "fashion", "food", "gaming", "medical", "mining", "realestate", "retail", "sports", "tech", "telecom"]);
  });
  it("runs each new industry from the everyday look round, to the pro's scout, to the companies that serve them", () => {
    for (const id of ["food", "retail", "fashion", "art", "gaming", "realestate", "architecture", "tech"]) {
      const tools = LINES.find((x) => x.id === id)!.stations.map((s) => s.tool);
      const made = ["food", "fashion", "architecture", "art"].includes(id) ? [`source:${id}`] : [];
      const view = id === "realestate" ? ["view:sun"] : id === "art" ? ["view:crowd"] : [];
      expect(tools).toEqual([`explore:${id}`, `scout:${id}`, ...view, ...made, `services:${id}`]);
    }
    expect(LINES.find((x) => x.id === "sport")!.stations[0].tool).toBe("explore:sport");
  });
  it("matches what people say they do", () => {
    expect(top("we hire out cranes")).toBe("fn-construction");
    expect(top("I'm a general contractor")).toBe("buildpro");
    expect(top("freight forwarder")).toBe("shipping");
    expect(top("we service wind turbines")).toBe("fn-energy");
    expect(top("tractor dealer")).toBe("fn-agriculture");
    expect(top("humanitarian logistics")).toBe("relief");
    expect(top("city councillor")).toBe("office");
    expect(top("we sell drill rigs to mines")).toBe("fn-mining");
    expect(top("I want to open a restaurant")).toBe("scout-food");
    expect(top("we service walk-in coolers in restaurants")).toBe("fn-food");
    expect(top("I'm a fashion designer")).toBe("scout-fashion");
    expect(top("gallerist")).toBe("scout-art");
    expect(top("real estate agent")).toBe("scout-realestate");
    expect(top("laser scanning surveyor")).toBe("fn-architecture");
    expect(top("startup founder")).toBe("scout-tech");
    expect(top("arcade operator")).toBe("scout-gaming");
    expect(top("chef looking for local produce")).toBe("source-food");
  });
  it("ignores filler words", () => {
    expect(rank("we run our company")).toEqual([]);
    expect(fit(LINES[0].stations[0], LINES[0], "")).toBe(0);
  });
  it("puts every field's tools on the three rungs, in order", () => {
    const rungs = (l: string) => LINES.find((x) => x.id === l)!.stations.map(tierOf);
    expect(rungs("mine")).toEqual(["everyday", "pro", "pro", "services"]);
    expect(rungs("build")).toEqual(["everyday", "pro", "pro", "pro", "pro", "services"]);
    expect(rungs("food")).toEqual(["everyday", "pro", "pro", "services"]);
    expect(rungs("finance")).toEqual(["everyday", "pro", "everyday", "everyday", "pro"]);
    expect(rungs("commod")).toEqual(["everyday", "pro", "pro"]);
    for (const line of LINES) expect(line.stations.filter((s) => s.tool.startsWith("services:")).every((s) => tierOf(s) === "services")).toBe(true);
  });
  it("gives every field a look and a group", () => {
    const groups = new Set<string>(FAMILIES.map((f) => f.id));
    for (const line of LINES) {
      expect(LOOKS[line.id], line.id).toBeTruthy();
      expect(groups.has(LOOKS[line.id].family)).toBe(true);
      expect(line.stations.length).toBeGreaterThan(0);
    }
  });
});
