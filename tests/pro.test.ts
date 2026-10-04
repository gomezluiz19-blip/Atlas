import { describe, expect, it } from "vitest";
import { detectColumns, floorOf, forecast, occupancyColor, parseDate, parseTable, reservationsFromTable, roomsFrom, snapshot, summarize } from "../src/pro/model";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("Terreno Pro model", () => {
  it("reads CSV exports in English or Spanish, with quotes and semicolons", () => {
    expect(parseTable('Room,Arrival,Departure\n101,"2025-06-01",2025-06-03\n')).toEqual([["Room", "Arrival", "Departure"], ["101", "2025-06-01", "2025-06-03"]]);
    expect(parseTable("Habitación;Llegada;Salida\n201;01/06/2025;03/06/2025")[1]).toEqual(["201", "01/06/2025", "03/06/2025"]);
    expect(detectColumns(["Habitación", "Llegada", "Salida", "Huéspedes", "Estado"])).toEqual({ room: 0, start: 1, end: 2, guests: 3, status: 4 });
    expect(detectColumns(["Name", "Email"])).toBeNull();
  });

  it("understands common date formats", () => {
    expect(parseDate("2025-06-01", "start")).toBe(new Date(2025, 5, 1, 15).getTime());
    expect(parseDate("2025-06-03", "end")).toBe(new Date(2025, 5, 3, 11).getTime());
    expect(parseDate("01/06/2025", "start")).toBe(new Date(2025, 5, 1, 15).getTime()); // day first
    expect(parseDate("6/13/2025", "start")).toBe(new Date(2025, 5, 13, 15).getTime()); // US, day > 12
    expect(parseDate("2025-06-01 09:30", "start")).toBe(new Date(2025, 5, 1, 9, 30).getTime());
    expect(parseDate("soon", "start")).toBeNull();
  });

  it("skips cancelled and broken rows", () => {
    const rows = parseTable("Room,Check-in,Check-out,Guests,Status\n101,2025-06-01,2025-06-03,2,Confirmed\n102,2025-06-01,2025-06-02,1,Cancelled\n103,x,y,1,\n");
    const { reservations, skipped } = reservationsFromTable(rows);
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({ room: "101", guests: 2 });
    expect(skipped).toBe(2);
  });

  it("works out floors from room numbers", () => {
    expect(floorOf("203")).toBe(2);
    expect(floorOf("12")).toBe(1);
    expect(floorOf("1105")).toBe(11);
    expect(floorOf("Suite")).toBe(1);
  });

  it("rolls reservations up into room states, floors and the building", () => {
    const res = reservationsFromTable(parseTable(
      "Room,Arrival,Departure,Guests\n101,2025-06-01,2025-06-05,2\n102,2025-06-03,2025-06-04,1\n201,2025-06-02,2025-06-03,3\n202,2025-06-10,2025-06-12,2\n",
    )).reservations;
    const rooms = roomsFrom(res, [{ id: "203", floor: 2 }]);
    expect(rooms.map((r) => r.id)).toEqual(["101", "102", "201", "202", "203"]);
    const s = snapshot(rooms, res, at(2025, 6, 3, 9));
    const state = Object.fromEntries(s.rooms.map((r) => [r.room.id, r.state]));
    expect(state).toEqual({ "101": "occupied", "102": "arriving", "201": "departing", "202": "reserved", "203": "vacant" });
    const sum = summarize(s, res);
    expect(sum.inUse).toBe(2);
    expect(sum.guests).toBe(5);
    expect(sum.occupancy).toBeCloseTo(2 / 5);
    expect(sum.arrivals).toBe(1);
    expect(sum.departures).toBe(1);
    expect(sum.floors).toEqual([{ floor: 1, rooms: 2, inUse: 1, occupancy: 0.5 }, { floor: 2, rooms: 3, inUse: 1, occupancy: 1 / 3 }]);
    // Live updates (housekeeping) override the bookings.
    const live = snapshot(rooms, res, at(2025, 6, 3, 9), [{ room: "203", state: "cleaning" }]);
    expect(live.rooms.find((r) => r.room.id === "203")?.state).toBe("cleaning");
    const f = forecast(rooms, res, at(2025, 6, 1), 3);
    expect(f.map((x) => Math.round(x.occupancy * 100))).toEqual([20, 40, 40]);
  });

  it("colours occupancy from green to red", () => {
    expect(occupancyColor(0)).toBe("rgb(48,209,88)");
    expect(occupancyColor(1)).toBe("rgb(255,69,58)");
  });
});

import { demoData, parseFeedJson } from "../src/pro/sources";

describe("Terreno Pro sources", () => {
  it("reads a connector's JSON leniently", () => {
    const f = parseFeedJson({
      rooms: [{ id: 101, floor: 1 }, { number: "202" }],
      reservations: [
        { room: "101", checkIn: "2025-06-01", checkOut: "2025-06-03", guests: "2" },
        { room: "202", start: "2025-06-01T14:00:00Z", end: "2025-06-02T10:00:00Z", status: "cancelled" },
      ],
      status: [{ room: "202", status: "Limpieza" }, { room: "101", status: "who knows" }],
    });
    expect(f.rooms.map((r) => r.id)).toEqual(["101", "202"]);
    expect(f.reservations).toHaveLength(1);
    expect(f.reservations[0]).toMatchObject({ room: "101", guests: 2, start: new Date(2025, 5, 1, 15).getTime() });
    expect(f.updates).toEqual([{ room: "202", state: "cleaning", guests: undefined }]);
  });

  it("makes a believable demo hotel", () => {
    const now = new Date(2025, 5, 1, 12).getTime();
    const { rooms, reservations } = demoData(3, 8, now);
    expect(rooms).toHaveLength(24);
    expect(rooms[0].id).toBe("101");
    const occ = summarize(snapshot(rooms, reservations, now), reservations).occupancy;
    expect(occ).toBeGreaterThan(0.2);
    expect(occ).toBeLessThan(1);
  });
});
