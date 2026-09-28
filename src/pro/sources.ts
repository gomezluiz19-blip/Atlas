// Where Atlas Pro's data comes from. All three run in the browser:
//   - demo:  a simulated hotel, so the live views can be tried at once;
//   - csv:   a reservations export from any CRM or property-management system;
//   - url:   a live link polled every few seconds, e.g. a Google Sheet published
//            as CSV that Zapier/Make keeps in sync, or a small connector
//            service that turns a CRM's API into the format below.
// Direct connections to vendors (Cloudbeds, Mews, HubSpot…) need their secret
// keys kept on a server; see docs/pro-connectors.md for the format to serve.
import { parseTable, reservationsFromTable, type Reservation, type Room, type RoomState, type RoomUpdate } from "./model";

export type SourceConfig =
  | { kind: "demo"; floors: number; perFloor: number }
  | { kind: "csv"; name: string; reservations: Reservation[] }
  | { kind: "url"; url: string; everySec: number };

export interface ProConfig {
  source: SourceConfig;
  /** Rooms the owner has listed (otherwise taken from the bookings). */
  rooms: Room[];
}

export interface Feed {
  rooms: Room[];
  reservations: Reservation[];
  updates: RoomUpdate[];
  /** When the data was last refreshed. */
  at: number;
  note?: string;
}

// ---- Settings, per saved place ------------------------------------------------

const KEY = "atlas.pro.v1";

export function loadConfigs(): Record<string, ProConfig> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function saveConfig(placeId: string, cfg: ProConfig | null) {
  const all = loadConfigs();
  if (cfg) all[placeId] = cfg;
  else delete all[placeId];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: works for this session only */
  }
}

// ---- Demo: a believable small hotel ---------------------------------------------

/** Deterministic pseudo-random numbers, so the demo looks the same each visit. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function demoData(floors: number, perFloor: number, now = Date.now()): { rooms: Room[]; reservations: Reservation[] } {
  const rooms: Room[] = [];
  for (let f = 1; f <= floors; f++) for (let i = 1; i <= perFloor; i++) rooms.push({ id: `${f}${String(i).padStart(2, "0")}`, floor: f, capacity: i % 3 ? 2 : 4 });
  const r = rng(20250601);
  const d0 = new Date(now);
  const day = (n: number, h: number) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + n, h).getTime();
  const reservations: Reservation[] = [];
  for (const room of rooms) {
    // Higher floors are a little more popular; weekends fill up.
    let n = -6 + Math.floor(r() * 3);
    while (n < 21) {
      const gap = r() < 0.25 + room.floor * 0.05 ? 0 : Math.floor(r() * 3) + 1;
      n += gap;
      const len = 1 + Math.floor(r() * 4);
      reservations.push({ room: room.id, start: day(n, 15), end: day(n + len, 11), guests: 1 + Math.floor(r() * (room.capacity ?? 2)) });
      n += len;
    }
  }
  return { rooms, reservations };
}

/** Live housekeeping and early check-ins, changing every few seconds. */
export function demoUpdates(rooms: Room[], tick: number): RoomUpdate[] {
  const r = rng(tick * 7919 + 17);
  const out: RoomUpdate[] = [];
  const pick = () => rooms[Math.floor(r() * rooms.length)];
  const cleaning = 1 + Math.floor(r() * Math.max(1, rooms.length / 10));
  for (let i = 0; i < cleaning; i++) out.push({ room: pick().id, state: "cleaning" });
  if (r() < 0.3) out.push({ room: pick().id, state: "out_of_order" });
  return out;
}

// ---- Live link -------------------------------------------------------------------

const STATES: Record<string, RoomState> = {
  occupied: "occupied", "in house": "occupied", "in-house": "occupied", checked_in: "occupied", ocupada: "occupied", ocupado: "occupied",
  vacant: "vacant", free: "vacant", available: "vacant", libre: "vacant", disponible: "vacant",
  cleaning: "cleaning", dirty: "cleaning", housekeeping: "cleaning", limpieza: "cleaning", sucia: "cleaning",
  out_of_order: "out_of_order", "out of order": "out_of_order", ooo: "out_of_order", maintenance: "out_of_order", mantenimiento: "out_of_order",
  arriving: "arriving", departing: "departing", reserved: "reserved",
};

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);
const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
const time = (v: unknown, kind: "start" | "end") => {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (typeof v !== "string") return null;
  const iso = Date.parse(v);
  if (/T\d/.test(v) && Number.isFinite(iso)) return iso;
  const rows = reservationsFromTable([["arrival", "departure"], kind === "start" ? [v, "2999-01-01"] : ["1970-01-02", v]]).reservations[0];
  return rows ? (kind === "start" ? rows.start : rows.end) : Number.isFinite(iso) ? iso : null;
};

/** Reads the JSON a connector serves (see docs/pro-connectors.md), leniently. */
export function parseFeedJson(data: unknown): Omit<Feed, "at"> {
  const o = (data ?? {}) as Record<string, unknown>;
  const rooms: Room[] = Array.isArray(o.rooms)
    ? (o.rooms as Record<string, unknown>[]).flatMap((r) => {
        const id = str(r.id ?? r.room ?? r.number);
        if (!id) return [];
        const floor = num(r.floor);
        return [{ id, floor: Number.isFinite(floor) ? floor : NaN, capacity: Number.isFinite(num(r.capacity)) ? num(r.capacity) : undefined }];
      })
    : [];
  const reservations: Reservation[] = Array.isArray(o.reservations)
    ? (o.reservations as Record<string, unknown>[]).flatMap((r) => {
        const start = time(r.start ?? r.checkIn ?? r.check_in ?? r.arrival, "start"), end = time(r.end ?? r.checkOut ?? r.check_out ?? r.departure, "end");
        const status = str(r.status);
        if (start === null || end === null || end <= start || (status && /cancel|no.?show/i.test(status))) return [];
        const g = num(r.guests ?? r.pax);
        return [{ room: str(r.room ?? r.unit), start, end, guests: Number.isFinite(g) ? g : undefined, status }];
      })
    : [];
  const statusList = (o.status ?? o.roomStatus ?? o.live) as Record<string, unknown>[] | undefined;
  const updates: RoomUpdate[] = Array.isArray(statusList)
    ? statusList.flatMap((u) => {
        const room = str(u.room ?? u.id), state = STATES[String(u.state ?? u.status ?? "").toLowerCase().trim()];
        const g = num(u.guests);
        return room && state ? [{ room, state, guests: Number.isFinite(g) ? g : undefined }] : [];
      })
    : [];
  return { rooms, reservations, updates };
}

export async function fetchFeed(url: string): Promise<Omit<Feed, "at">> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`the link answered HTTP ${res.status}`);
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const data = JSON.parse(trimmed);
    return parseFeedJson(Array.isArray(data) ? { reservations: data } : data);
  }
  const { reservations, columns } = reservationsFromTable(parseTable(text));
  if (!columns) throw new Error("the link didn't return reservations Atlas recognises (it needs arrival and departure columns)");
  return { rooms: [], reservations, updates: [] };
}
