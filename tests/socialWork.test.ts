import { describe, expect, it } from "vitest";
import { checkInText, classify, due, gaps, helpLines, inUS, nearestFirst, needsFor, needsQuery, newPractice, planDay, referralSheet, referralsFor, safeLabel, toResources, type Client, type Resource } from "../src/pro/social/model";

const base = { lon: -73.92, lat: 41.29 };
const client = (id: string, lon: number, lat: number, extra: Partial<Client> = {}): Client =>
  ({ id, label: id.toUpperCase(), area: "Northside", lon, lat, contact: "home", priority: "routine", needs: ["food"], minutes: 45, ...extra });

describe("social work: places and needs", () => {
  it("knows what a mapped place offers, the most specific first", () => {
    expect(classify({ amenity: "food_bank" })).toBe("food");
    expect(classify({ amenity: "social_facility", social_facility: "shelter" })).toBe("shelter");
    expect(classify({ amenity: "social_facility", social_facility: "nursing_home" })).toBe("older");
    expect(classify({ amenity: "community_centre", "community_centre:for": "senior" })).toBe("older");
    expect(classify({ amenity: "community_centre" })).toBe("community");
    expect(classify({ healthcare: "psychotherapist" })).toBe("mental");
    expect(classify({ amenity: "school" })).toBe("school");
    expect(classify({ leisure: "playground" })).toBe("parks");
    expect(classify({ shop: "bakery" })).toBeNull();
  });
  it("asks Overpass for just the needs wanted, around a point", () => {
    const q = needsQuery({ lon: -73.9, lat: 41.3 }, 2000, ["food", "parks"]);
    expect(q).toContain('nwr["amenity"="food_bank"](around:2000,41.30000,-73.90000);');
    expect(q).toContain('["social_facility"~"^(food_bank|soup_kitchen)$"]');
    expect(q).toContain('["leisure"~"^(park|playground)$"]');
    expect(q).not.toContain("school");
  });
  it("turns mapped places into named resources, and sorts the asked-for first", () => {
    const rs = toResources([
      { type: "node", id: 1, lat: 41.3, lon: -73.9, tags: { amenity: "food_bank", name: "Peekskill Food Pantry", "addr:street": "Main St", "addr:housenumber": "12", phone: "+1 914 555 0100" } },
      { type: "way", id: 2, center: { lat: 41.291, lon: -73.921 }, tags: { leisure: "park" } },
      { type: "node", id: 3, lat: 41.3, lon: -73.9, tags: { amenity: "clinic" } }, // unnamed clinic: left out
    ]);
    expect(rs.map((r) => [r.id, r.name, r.need])).toEqual([["n1", "Peekskill Food Pantry", "food"], ["w2", "Park", "parks"]]);
    expect(rs[0].address).toBe("12 Main St");
    expect(nearestFirst(rs, base).map((r) => r.need)).toEqual(["parks", "food"]);
    expect(nearestFirst(rs, base, ["food"]).map((r) => r.need)).toEqual(["food", "parks"]);
  });
  it("gives the right lines to call where someone is", () => {
    expect(inUS(base)).toBe(true);
    const us = helpLines(base);
    expect(us[0].href).toBe("tel:911");
    expect(us.some((l) => l.href === "tel:988")).toBe(true);
    expect(helpLines({ lon: -0.12, lat: 51.5 })[0].href).toBe("tel:999");
    expect(helpLines({ lon: -79.38, lat: 43.65 })[0].label).toBe("In danger now"); // Toronto
    expect(helpLines({ lon: 2.35, lat: 48.85 })[0].href).toBe("tel:112");
  });
});

describe("social work: the worksite", () => {
  it("sets up a practice from the answers, sized to how they work", () => {
    const p = newPractice({ name: " ", mode: "visits", focus: ["older-adults"] }, "x", 0);
    expect(p).toMatchObject({ id: "x", name: "My practice", areaKm: 15, clients: [], referrals: [] });
    expect(newPractice({ name: "Clinic", mode: "site", focus: [] }, "y", 0).areaKm).toBe(5);
    expect(needsFor(["older-adults", "housing"])).toEqual(["older", "health", "community", "food", "shelter", "benefits"]);
  });
  it("never stores a full name", () => {
    expect(safeLabel("Jane Doe")).toBe("JD");
    expect(safeLabel("maría  de la cruz")).toBe("MDLC");
    expect(safeLabel("JD")).toBe("JD");
    expect(safeLabel("Case 1042")).toBe("Case 1042");
  });
  it("plans a visit day: urgent first, then nearest, timed, and back to base", () => {
    const plan = planDay(base, [
      client("a", -73.90, 41.29),
      client("b", -73.95, 41.30, { priority: "urgent", minutes: 60 }),
      client("c", -73.93, 41.29),
    ], "09:00");
    expect(plan.stops.map((s) => s.client.id)).toEqual(["b", "c", "a"]);
    expect(plan.stops[0].arrive > "09:00").toBe(true);
    expect(plan.visitMin).toBe(150);
    expect(plan.back > plan.stops[2].leave).toBe(true);
    expect(planDay(base, []).stops).toEqual([]);
  });
  it("writes a check-in with areas and times, never addresses", () => {
    const plan = planDay(base, [client("jd", -73.9, 41.29)], "10:00");
    const t = checkInText(plan, "Sam", "2026-10-07");
    expect(t).toContain("Visits on 2026-10-07 (Sam):");
    expect(t).toContain("JD · Northside");
    expect(t).toContain(`Back by ${plan.back}`);
    expect(t).not.toMatch(/-73|41\./);
  });
  it("refers a client to the nearest place for each need, saved ones first", () => {
    const saved: Resource[] = [{ id: "s", name: "Saved pantry", need: "food", lon: -73.80, lat: 41.29 }];
    const all: Resource[] = [{ id: "n", name: "Near pantry", need: "food", lon: -73.901, lat: 41.29 }];
    const c = client("a", -73.90, 41.29, { needs: ["food", "shelter"] });
    const refs = referralsFor(c, saved, all);
    expect(refs[0].r?.name).toBe("Saved pantry");
    expect(refs[1].r).toBeNull();
    const sheet = referralSheet(c, refs, "Sam");
    expect(sheet).toContain("Referrals for A · from Sam");
    expect(sheet).toContain("Housing and shelter: nothing mapped nearby yet");
  });
  it("finds the gaps: clients far from what they need", () => {
    const cs = [client("a", -73.90, 41.29), client("b", -74.30, 41.29), client("c", -73.90, 41.29, { needs: ["mental"] })];
    const rs: Resource[] = [{ id: "f", name: "Pantry", need: "food", lon: -73.901, lat: 41.29 }];
    expect(gaps(cs, rs, 3)).toEqual([{ need: "mental", far: 1, of: 1 }, { need: "food", far: 1, of: 2 }]);
  });
  it("lists who's due, soonest and most urgent first", () => {
    const cs = [client("a", 0, 0, { next: "2026-10-09" }), client("b", 0, 0, { next: "2026-10-08", priority: "urgent" }), client("c", 0, 0, { next: "2026-10-08" }), client("d", 0, 0)];
    expect(due(cs, "2026-10-09").map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
});

import { LINES, rank, tierOf } from "../src/work/workLines";
describe("social work on the Work map", () => {
  it("is a field with an everyday rung and a pro rung", () => {
    const line = LINES.find((l) => l.id === "social")!;
    expect(line.stations.map((s) => [s.id, tierOf(s)])).toEqual([["social-find", "everyday"], ["social-pro", "pro"], ["social-agency", "pro"]]);
  });
  it("is found by what people say", () => {
    expect(rank("I'm a social worker doing home visits")[0].station.id).toBe("social-pro");
    expect(rank("food bank near me")[0].station.id).toBe("social-find");
    expect(rank("school social worker caseload")[0].station.id).toBe("social-pro");
  });
});

import { areaOf } from "../src/pro/social/model";
describe("social work: areas, not addresses", () => {
  it("names the neighbourhood or town, skipping streets, numbers and states", () => {
    expect(areaOf("Oak Hill Road", "Oak Hill, Peekskill, New York, United States")).toBe("Oak Hill");
    expect(areaOf("Verplanck", "New York, United States")).toBe("Verplanck");
    expect(areaOf("12 Main Street", "Downtown, Peekskill")).toBe("Downtown");
    expect(areaOf("Main St", "New York, United States")).toBe("New York");
  });
});
