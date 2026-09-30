import { describe, expect, it } from "vitest";
import { agencyStats, inviteList, mailStats, merge, messagesFromRows, type Message } from "../src/pro/office/mail";
import { demoOffice } from "../src/pro/office/demo";
import { districtFromGeoJson } from "../src/politics/us";

const T = "2026-10-01";
const d = (n: number) => new Date(Date.parse(T) - n * 86_400_000).toISOString().slice(0, 10);
const m = (topic: string, position: Message["position"], ago: number, replied?: number): Message => ({ id: String(Math.random()), name: "A B", topic, position, channel: "Email", received: d(ago), replied: replied === undefined ? undefined : d(replied) });

describe("the mailbag", () => {
  it("counts topics, positions, what's rising and the reply queue", () => {
    const ms = [m("Housing", "support", 1), m("Housing", "support", 2), m("Housing", "oppose", 3), m("Housing", "neutral", 4), m("Roads", "question", 9), m("Roads", "question", 20, 5), m("Roads", "question", 30, 25)];
    const s = mailStats(ms, T);
    expect(s.topics[0]).toMatchObject({ topic: "Housing", n: 4, support: 2, oppose: 1, thisWeek: 4, rising: true });
    expect(s.queue[0].topic).toBe("Roads");
    expect(s.overdue).toBe(0);
    expect(s.medianReply).toBe(10);
    expect(s.onTime).toBe(0.5);
    expect(s.byWeek[s.byWeek.length - 1]).toBe(4);
  });
  it("merges form letters per person", () => {
    expect(merge("Dear {first}, thanks for writing about {topic}. — to {name}", { name: "Dr. Ana Lopez", topic: "housing" })).toBe("Dear Ana, thanks for writing about housing. — to Dr. Ana Lopez");
  });
  it("reads a mail system's export", () => {
    const x = messagesFromRows([{ "first name": "Sam", "last name": "Lee", "subject": "Re: Water rates", "position": "Oppose", "date": "2026-09-20" }, { "name": "" }], () => "id");
    expect(x).toEqual([{ id: "id", name: "Sam Lee", email: undefined, topic: "Water rates", position: "oppose", channel: "Email", received: "2026-09-20" }]);
  });
  it("gives the demo office a busy, realistic mailbag", () => {
    const s = mailStats(demoOffice().messages!, new Date().toISOString().slice(0, 10));
    expect(s.topics.find((t) => t.topic === "Broadband")?.rising).toBe(true);
    expect(s.queue.length).toBeGreaterThan(5);
  });
});

describe("casework, invites and districts", () => {
  it("shows turnaround by agency and missing privacy releases", () => {
    const st = agencyStats([
      { id: "1", subject: "a", agency: "VA", status: "open", opened: d(40), updated: d(10) },
      { id: "2", subject: "b", agency: "VA", status: "open", opened: d(20), updated: d(5), release: true },
      { id: "3", subject: "c", agency: "SSA", status: "closed", opened: d(50), updated: d(10), closed: d(20) },
    ], T);
    expect(st[0]).toMatchObject({ agency: "VA", open: 2, medianOpen: 30, noRelease: 1 });
    expect(st[1]).toMatchObject({ agency: "SSA", closed: 1, medianToClose: 30 });
  });
  it("builds an invite list by distance and interest", () => {
    const o = demoOffice();
    const lib = { lon: -105.283, lat: 40.0138 };
    const all = inviteList(o.contacts, lib, 10), bb = inviteList(o.contacts, lib, 10, "Broadband");
    expect(all.length).toBeGreaterThan(bb.length);
    expect(bb.every((x) => x.c.topics.includes("Broadband"))).toBe(true);
    expect(all.every((x, i) => i === 0 || x.km >= all[i - 1].km)).toBe(true);
    expect(all.some((x) => x.c.kind === "press")).toBe(false);
  });
  it("reads a council ward from GeoJSON", () => {
    const d = districtFromGeoJson(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "Ward 3" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }] }));
    expect(d?.name).toBe("Ward 3");
    expect(d?.rings[0].length).toBe(4);
    expect(districtFromGeoJson("not json")).toBeNull();
  });
});
