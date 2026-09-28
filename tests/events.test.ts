import { describe, expect, it } from "vitest";
import { dedupe, inPeriod, kindOf, type EventItem } from "../src/data/events";

const ev = (name: string, date: string, time = "19:00", source: EventItem["source"] = "Ticketmaster"): EventItem => ({ id: name + source, name, date, time, kind: "other", source });

describe("events", () => {
  it("sorts listings into kinds", () => {
    expect(kindOf("Music Rock Foo Fighters")).toBe("music");
    expect(kindOf("Sports Basketball Wizards vs Celtics")).toBe("sports");
    expect(kindOf("Arts & Theatre Musical Hamilton")).toBe("arts");
    expect(kindOf("Music Classical Mahler")).toBe("music");
    expect(kindOf("Farmers market and tasting")).toBe("food");
    expect(kindOf("Something else")).toBe("other");
  });
  it("counts an event listed by two services once, soonest first", () => {
    const list = dedupe([ev("Hamilton", "2026-10-03", "19:30", "SeatGeek"), ev("HAMILTON!", "2026-10-03"), ev("Early show", "2026-10-01")]);
    expect(list.map((e) => e.name)).toEqual(["Early show", "Hamilton"]);
  });
  it("knows today, this weekend, this week", () => {
    const wed = "2026-09-30"; // a Wednesday
    expect(inPeriod("2026-09-30", "today", wed)).toBe(true);
    expect(inPeriod("2026-10-02", "weekend", wed)).toBe(true);  // Friday
    expect(inPeriod("2026-10-04", "weekend", wed)).toBe(true);  // Sunday
    expect(inPeriod("2026-10-01", "weekend", wed)).toBe(false); // Thursday
    expect(inPeriod("2026-10-06", "week", wed)).toBe(true);
    expect(inPeriod("2026-10-07", "week", wed)).toBe(false);
    expect(inPeriod("2026-09-29", "month", wed)).toBe(false);
    const sat = "2026-10-03";
    expect(inPeriod("2026-10-03", "weekend", sat)).toBe(true);
    expect(inPeriod("2026-10-04", "weekend", sat)).toBe(true);
    expect(inPeriod("2026-10-05", "weekend", sat)).toBe(false);
  });
});
