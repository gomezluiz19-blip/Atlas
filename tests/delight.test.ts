import { describe, expect, it } from "vitest";
import { firstSentence, headline } from "../src/place/headline";
import { pulseLines } from "../src/delight/pulse";
import { pickWonder, type Wonder } from "../src/delight/surprise";
import type { Quake } from "../src/data/quakes";
import type { Launch } from "../src/space/launches";

describe("the one fact worth knowing", () => {
  it("picks what's most remarkable", () => {
    expect(headline({ elev: 3715, temp: 7, rain: 1200, crowd: 1000, city: 53 })).toBe("Stands 3,715 m above the sea.");
    expect(headline({ elev: 40, rain: 60, temp: 24 })).toBe("Barely 60 mm of rain a year.");
    expect(headline({ elev: 30, crowd: 6_200_000, city: 3 })).toBe("6.2 million people live within 25 km.");
    expect(headline({ elev: 900, faults: 12 })).toBe("Sits 12 km from the edge of a tectonic plate.");
  });
  it("says nothing when nothing stands out, and doesn't tell a volcano it's near a volcano", () => {
    expect(headline({ elev: 235, temp: 11, rain: 800, crowd: 400_000 })).toBeNull();
    expect(headline({ elev: 1200, volcano: 2 }, "volcano")).toBeNull();
  });
  it("takes a blurb's first sentence", () => {
    expect(firstSentence("Last erupted in 1707. Japan's highest.")).toBe("Last erupted in 1707.");
  });
});

describe("right now on Earth", () => {
  const now = Date.UTC(2026, 8, 28, 22);
  const q = (mag: number, hoursAgo: number, place = "95 km E of Ishinomaki, Japan"): Quake => ({ id: String(mag), lon: 142, lat: 38, depthKm: 10, mag, place, time: now - hoursAgo * 3_600_000, url: "" });
  const launch = { id: "1", name: "x", net: now + 2 * 3_600_000, status: "Go", statusName: "Go", rocket: "Falcon 9", provider: "SpaceX", pad: "SLC-40", location: "Cape Canaveral SFS, FL, USA", lon: -80.6, lat: 28.5 } as Launch;
  it("leads with the strongest news, in plain words", () => {
    const lines = pulseLines({ quakes: [q(4.5, 3), q(6.1, 30)], kp: 6, launches: [launch] }, now);
    expect(lines.map((l) => l.kind)).toEqual(["quake", "aurora", "launch"]);
    expect(lines[0].text).toBe("A magnitude 6.1 earthquake near Ishinomaki, Japan, 1 day ago");
    expect(lines[2].text).toBe("Falcon 9 launches from Cape Canaveral SFS in 2 hours");
  });
  it("stays quiet about what isn't news", () => {
    expect(pulseLines({ quakes: [q(3.1, 5)], kp: 3, launches: [] }, now).map((l) => l.text)).toEqual(["1 earthquake this week, none strong"]);
    expect(pulseLines({}, now)).toEqual([]);
  });
});

describe("something amazing", () => {
  const w = (name: string): Wonder => ({ name, kicker: "", why: "", lon: 0, lat: 0, radius: 1, curated: true });
  it("never repeats one seen lately while there are others", () => {
    const list = [w("A"), w("B"), w("C")];
    for (let r = 0; r < 1; r += 0.1) expect(pickWonder(list, ["A", "B"], r).name).toBe("C");
    expect(["A", "B", "C"]).toContain(pickWonder(list, ["A", "B", "C"], 0.5).name);
  });
});
