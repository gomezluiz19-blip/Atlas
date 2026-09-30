import { describe, expect, it } from "vitest";
import { farmSystem, leagueTravel, moveRoutes, parseIcs, readBaseball, readLeague, readMatchup, readMoves, readSchedule } from "../src/pro/sports/leagues";
import { scheduleShape, type Club } from "../src/pro/sports/model";
import { demoClub } from "../src/pro/sports/demo";

const venue = (id: number, name: string, lon: number, lat: number) => ({ id, name, location: { defaultCoordinates: { latitude: lat, longitude: lon } } });
const teams = [
  { id: 147, name: "New York Yankees", sport: { id: 1 }, league: { name: "American League" }, venue: venue(3313, "Yankee Stadium", -73.926, 40.829) },
  { id: 531, name: "Scranton/Wilkes-Barre RailRiders", sport: { id: 11 }, parentOrgId: 147, league: { name: "International League" }, venue: venue(2536, "PNC Field", -75.665, 41.36) },
  { id: 1956, name: "Somerset Patriots", sport: { id: 12 }, parentOrgId: 147, league: { name: "Eastern League" }, venue: venue(2860, "TD Bank Ballpark", -74.558, 40.556) },
  { id: 9, name: "No ballpark", sport: { id: 14 }, parentOrgId: 147 },
];

describe("baseball from the Stats API", () => {
  it("reads clubs with level, league, parent and ballpark, skipping ones without a location", () => {
    const t = readBaseball(teams);
    expect(t.length).toBe(3);
    expect(t[1]).toMatchObject({ id: "mlb:531", level: "Triple-A", league: "International League", parent: "mlb:147", lat: 41.36 });
  });
  it("builds a farm system ordered by level with distances", () => {
    const t = readBaseball(teams);
    const f = farmSystem(t[0], t);
    expect(f.map((x) => x.t.level)).toEqual(["Triple-A", "Double-A"]);
    expect(f[0].km).toBeGreaterThan(100);
  });
  it("reads a schedule from the club's side, doubleheaders once", () => {
    const g = (home: number, away: number, v: number) => ({ teams: { home: { team: { id: home, name: `T${home}` } }, away: { team: { id: away, name: `T${away}` } } }, venue: { id: v, name: `V${v}` } });
    const s = readSchedule([{ date: "2026-05-01", games: [g(531, 2, 10), g(531, 2, 10)] }, { date: "2026-05-02", games: [g(3, 531, 20)] }], 531);
    expect(s).toEqual([{ date: "2026-05-01", home: true, opponent: "T2", venue: "V10", venueId: 10 }, { date: "2026-05-02", home: false, opponent: "T3", venue: "V20", venueId: 20 }]);
  });
  it("keeps only moves inside the organisation, once each, and groups them by route", () => {
    const m = readMoves([
      { date: "2026-06-01", person: { fullName: "A" }, fromTeam: { id: 531 }, toTeam: { id: 147 }, typeDesc: "Recalled" },
      { date: "2026-06-01", person: { fullName: "A" }, fromTeam: { id: 531 }, toTeam: { id: 147 }, typeDesc: "Recalled" },
      { date: "2026-06-03", person: { fullName: "B" }, fromTeam: { id: 147 }, toTeam: { id: 531 }, typeDesc: "Optioned" },
      { date: "2026-06-04", person: { fullName: "C" }, fromTeam: { id: 999 }, toTeam: { id: 147 }, typeDesc: "Claimed" },
    ], new Set([147, 531, 1956]));
    expect(m.map((x) => x.player)).toEqual(["B", "A"]);
    const t = readBaseball(teams);
    const r = moveRoutes(m, new Map(t.map((x) => [x.id, x])));
    expect(r.length).toBe(2);
    expect(r[0].km).toBeGreaterThan(100);
  });
});

describe("any league from Wikidata", () => {
  it("reads one ground per club and ranks league travel", () => {
    const row = (q: string, name: string, lon: number, lat: number) => ({ team: { value: `http://www.wikidata.org/entity/${q}` }, teamLabel: { value: name }, venueLabel: { value: `${name} Ground` }, coord: { value: `Point(${lon} ${lat})` } });
    const t = readLeague([row("Q1", "Lagos FC", 3.39, 6.45), row("Q1", "Lagos FC", 3.4, 6.46), row("Q2", "Kano FC", 8.52, 12.0), row("Q3", "Enugu FC", 7.5, 6.45), row("Q4", "Q4", 0, 0)]);
    expect(t.map((x) => x.name)).toEqual(["Enugu FC", "Kano FC", "Lagos FC"]);
    const lt = leagueTravel(t);
    expect(lt.rows[0].t.name).toBe("Kano FC");
    expect(lt.rows[0].km).toBeGreaterThan(lt.rows[2].km);
  });
});

describe("calendars and schedule shape", () => {
  it("reads games from an iCalendar file and who is home", () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261004T190000Z\r\nSUMMARY:Rivals at Harbour City\r\nLOCATION:Harbour Park\\, Harbour City\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261001\r\nSUMMARY:Harbour City @ Mountain Town\r\nLOCATION:x\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const g = parseIcs(ics);
    expect(g.map((x) => x.date)).toEqual(["2026-10-01", "2026-10-04"]);
    expect(g[1].location).toBe("Harbour Park, Harbour City");
    expect(readMatchup(g[1].summary, "Harbour City")).toEqual({ home: true, opponent: "Rivals" });
    expect(readMatchup(g[0].summary, "Harbour City")).toEqual({ home: false, opponent: "Mountain Town" });
    expect(readMatchup("Harbour City vs Rivals", "Harbour City")).toEqual({ home: true, opponent: "Rivals" });
  });
  it("finds road trips, back-to-backs and clock changes", () => {
    const c: Club = demoClub();
    const sh = scheduleShape(c);
    expect(sh.trips.length).toBeGreaterThan(2);
    expect(sh.longestTrip).toBeGreaterThanOrEqual(2);
    expect(sh.east + sh.west).toBeGreaterThan(0);
  });
});
