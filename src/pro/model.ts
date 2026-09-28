// Atlas Pro: the operations model for a building. Reservations (from a CRM or
// property-management system) become room states at any moment, which roll up
// into floors and the whole building: how full it is, who's arriving and
// leaving, and the days ahead. Pure functions; no guest names are kept.

export type RoomState = "occupied" | "arriving" | "departing" | "reserved" | "vacant" | "cleaning" | "out_of_order";

export interface Room {
  id: string;
  floor: number;
  capacity?: number;
}

export interface Reservation {
  room?: string;
  /** Local date-times as epoch ms. */
  start: number;
  end: number;
  guests?: number;
  status?: string;
}

/** A live override from the feed (e.g. housekeeping), newer than the bookings. */
export interface RoomUpdate {
  room: string;
  state: RoomState;
  guests?: number;
}

export interface Snapshot {
  at: number;
  rooms: { room: Room; state: RoomState; guests: number }[];
}

export const STATE_INFO: Record<RoomState, { label: string; color: string; counts: boolean }> = {
  occupied: { label: "Occupied", color: "#ff453a", counts: true },
  arriving: { label: "Arriving today", color: "#ff9f0a", counts: true },
  departing: { label: "Leaving today", color: "#ffd60a", counts: true },
  reserved: { label: "Booked later", color: "#5e5ce6", counts: false },
  vacant: { label: "Free", color: "#30d158", counts: false },
  cleaning: { label: "Being cleaned", color: "#64d2ff", counts: false },
  out_of_order: { label: "Out of order", color: "#8e8e93", counts: false },
};

// ---- Reading exports -------------------------------------------------------

/** Minimal CSV/TSV/semicolon parser with quotes. */
export function parseTable(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(field.trim()); field = ""; }
    else if (c === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows.filter((r) => r.some((x) => x));
}

const COLUMNS: Record<"room" | "start" | "end" | "guests" | "status", RegExp> = {
  room: /^(room|room ?(no|number|#)|unit|habitaci[oó]n|hab\.?|cuarto|apartment|space)$/i,
  start: /^(check.?in|arrival|arrive|start|from|llegada|entrada|fecha de (llegada|entrada)|check.?in date)$/i,
  end: /^(check.?out|departure|depart|end|to|until|salida|fecha de salida|check.?out date)$/i,
  guests: /^(guests?|pax|adults|people|persons|occupants|hu[eé]spedes|personas|adultos)$/i,
  status: /^(status|state|estado|booking status)$/i,
};

export interface ColumnMap { room?: number; start: number; end: number; guests?: number; status?: number }

/** Finds the columns a reservations export uses (English or Spanish headers). */
export function detectColumns(header: string[]): ColumnMap | null {
  const find = (re: RegExp) => { const i = header.findIndex((h) => re.test(h.trim())); return i >= 0 ? i : undefined; };
  const start = find(COLUMNS.start), end = find(COLUMNS.end);
  if (start === undefined || end === undefined) return null;
  return { room: find(COLUMNS.room), start, end, guests: find(COLUMNS.guests), status: find(COLUMNS.status) };
}

/**
 * Dates as exports write them: 2025-06-01, 2025-06-01 15:00, 01/06/2025
 * (day first, as in most of the world), 6/1/2025 (US, when day-first is
 * impossible). Date-only check-ins count from 15:00 and check-outs until 11:00.
 */
export function parseDate(s: string, kind: "start" | "end"): number | null {
  const t = s.trim();
  let y: number, mo: number, d: number, hh = kind === "start" ? 15 : 11, mm = 0;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; if (m[4]) { hh = +m[4]; mm = +m[5]; } }
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/))) {
    let a = +m[1], b = +m[2];
    if (b > 12 && a <= 12) [a, b] = [b, a]; // US month/day
    d = a; mo = b; y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (m[4]) { hh = +m[4]; mm = +m[5]; }
  } else return null;
  const v = new Date(y, mo - 1, d, hh, mm).getTime();
  return Number.isFinite(v) && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? v : null;
}

const CANCELLED = /cancel|no.?show|anulad|void/i;

export function reservationsFromTable(rows: string[][]): { reservations: Reservation[]; skipped: number; columns: ColumnMap | null } {
  const [header, ...body] = rows;
  const columns = header ? detectColumns(header) : null;
  if (!columns) return { reservations: [], skipped: body.length, columns: null };
  const out: Reservation[] = [];
  let skipped = 0;
  for (const r of body) {
    const start = parseDate(r[columns.start] ?? "", "start"), end = parseDate(r[columns.end] ?? "", "end");
    const status = columns.status !== undefined ? r[columns.status] : undefined;
    if (start === null || end === null || end <= start || (status && CANCELLED.test(status))) { skipped++; continue; }
    const g = columns.guests !== undefined ? parseInt(r[columns.guests], 10) : NaN;
    out.push({ room: columns.room !== undefined ? r[columns.room] || undefined : undefined, start, end, guests: Number.isFinite(g) ? g : undefined, status });
  }
  return { reservations: out, skipped, columns };
}

/** "203" → floor 2; "12" → floor 1; "B-4" → 1. */
export function floorOf(room: string): number {
  const n = room.match(/\d+/)?.[0];
  if (!n) return 1;
  const v = parseInt(n, 10);
  return n.length >= 3 ? Math.max(1, Math.floor(v / 100)) : 1;
}

export function roomsFrom(reservations: Reservation[], known: Room[] = []): Room[] {
  const map = new Map(known.map((r) => [r.id, r]));
  for (const r of reservations) if (r.room && !map.has(r.room)) map.set(r.room, { id: r.room, floor: floorOf(r.room) });
  return [...map.values()].sort((a, b) => a.floor - b.floor || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

// ---- State at a moment -------------------------------------------------------

const dayOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export function snapshot(rooms: Room[], reservations: Reservation[], at: number, updates: RoomUpdate[] = []): Snapshot {
  const byRoom = new Map<string, Reservation[]>();
  for (const r of reservations) if (r.room) (byRoom.get(r.room) ?? byRoom.set(r.room, []).get(r.room)!).push(r);
  const live = new Map(updates.map((u) => [u.room, u]));
  const today = dayOf(at);
  return {
    at,
    rooms: rooms.map((room) => {
      const u = live.get(room.id);
      if (u) return { room, state: u.state, guests: u.guests ?? (STATE_INFO[u.state].counts ? 1 : 0) };
      const rs = byRoom.get(room.id) ?? [];
      const cur = rs.find((r) => r.start <= at && at < r.end);
      if (cur) {
        const state: RoomState = dayOf(cur.end) === today ? "departing" : "occupied";
        return { room, state, guests: cur.guests ?? 1 };
      }
      const later = rs.filter((r) => r.start > at).sort((a, b) => a.start - b.start)[0];
      if (later && dayOf(later.start) === today) return { room, state: "arriving" as const, guests: 0 };
      return { room, state: later ? "reserved" as const : "vacant" as const, guests: 0 };
    }),
  };
}

export interface Summary {
  rooms: number;
  inUse: number;
  /** Share of sellable rooms (not out of order) that are taken. */
  occupancy: number;
  guests: number;
  arrivals: number;
  departures: number;
  byState: Record<RoomState, number>;
  floors: { floor: number; rooms: number; inUse: number; occupancy: number }[];
}

export function summarize(s: Snapshot, reservations: Reservation[] = []): Summary {
  const byState = Object.fromEntries(Object.keys(STATE_INFO).map((k) => [k, 0])) as Record<RoomState, number>;
  const floors = new Map<number, { rooms: number; inUse: number }>();
  let inUse = 0, guests = 0, sellable = 0;
  for (const r of s.rooms) {
    byState[r.state]++;
    const taken = r.state === "occupied" || r.state === "departing";
    if (taken) inUse++;
    guests += r.guests;
    if (r.state !== "out_of_order") sellable++;
    const f = floors.get(r.room.floor) ?? { rooms: 0, inUse: 0 };
    f.rooms++;
    if (taken) f.inUse++;
    floors.set(r.room.floor, f);
  }
  const today = dayOf(s.at);
  return {
    rooms: s.rooms.length, inUse, guests,
    occupancy: sellable ? inUse / sellable : 0,
    arrivals: reservations.filter((r) => dayOf(r.start) === today).length,
    departures: reservations.filter((r) => dayOf(r.end) === today).length,
    byState,
    floors: [...floors.entries()].sort((a, b) => a[0] - b[0]).map(([floor, f]) => ({ floor, ...f, occupancy: f.rooms ? f.inUse / f.rooms : 0 })),
  };
}

/** Occupancy each night for the next `days` nights (measured at 22:00). */
export function forecast(rooms: Room[], reservations: Reservation[], from: number, days = 14): { night: number; occupancy: number }[] {
  const out: { night: number; occupancy: number }[] = [];
  const d0 = new Date(from);
  for (let i = 0; i < days; i++) {
    const t = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i, 22).getTime();
    out.push({ night: t, occupancy: summarize(snapshot(rooms, reservations, t)).occupancy });
  }
  return out;
}

/** Colour for an occupancy share: calm green when empty, through amber, to red when full. */
export function occupancyColor(v: number): string {
  const stops: [number, [number, number, number]][] = [[0, [48, 209, 88]], [0.5, [255, 214, 10]], [0.8, [255, 159, 10]], [1, [255, 69, 58]]];
  for (let i = 1; i < stops.length; i++) {
    const [b, cb] = stops[i], [a, ca] = stops[i - 1];
    if (v <= b) {
      const t = (v - a) / (b - a);
      return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * t)).join(",")})`;
    }
  }
  return "rgb(255,69,58)";
}
