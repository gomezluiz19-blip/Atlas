// Camera analytics that run on this device: what a detector sees in each frame
// becomes counts (people, vehicles, bikes), tracks that follow each one from
// frame to frame, entries and exits across a line drawn on the picture, a
// minute-by-minute history, and rough positions on the map. Only counts and
// anonymous tracks; no faces, no identities, no frames stored.
import type { Device } from "../../myplaces/store";

export type Kind = "person" | "vehicle" | "bike";

export interface Detection {
  kind: Kind;
  score: number;
  /** Normalised box: x, y (top-left), width, height, each 0..1. */
  box: [number, number, number, number];
}

const KINDS: Record<string, Kind> = { person: "person", car: "vehicle", truck: "vehicle", bus: "vehicle", motorcycle: "vehicle", bicycle: "bike" };

/** Keeps the classes that matter for a building, normalising boxes. */
export function fromCoco(preds: { class: string; score: number; bbox: [number, number, number, number] }[], width: number, height: number, minScore = 0.45): Detection[] {
  return preds.flatMap((p) => {
    const kind = KINDS[p.class];
    if (!kind || p.score < minScore || !width || !height) return [];
    const [x, y, w, h] = p.bbox;
    return [{ kind, score: p.score, box: [x / width, y / height, w / width, h / height] as [number, number, number, number] }];
  });
}

export interface Track {
  id: number;
  kind: Kind;
  /** Where the feet (bottom centre of the box) are, normalised. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  firstSeen: number;
  lastSeen: number;
  counted: boolean;
}

/** A counting line on the picture, from a to b; crossing it left-to-right is "in". */
export interface CountLine { a: [number, number]; b: [number, number] }

const side = (l: CountLine, x: number, y: number) => Math.sign((l.b[0] - l.a[0]) * (y - l.a[1]) - (l.b[1] - l.a[1]) * (x - l.a[0]));

/** Do segments p→q and the counting line intersect? */
function crosses(l: CountLine, px: number, py: number, qx: number, qy: number): boolean {
  const s1 = side(l, px, py), s2 = side(l, qx, qy);
  if (s1 === 0 || s2 === 0 || s1 === s2) return false;
  const line = { a: [px, py] as [number, number], b: [qx, qy] as [number, number] };
  return side(line, ...l.a) !== side(line, ...l.b);
}

export interface Tick {
  at: number;
  counts: Record<Kind, number>;
  entered: number;
  exited: number;
}

export class Analyzer {
  tracks: Track[] = [];
  line: CountLine | null = null;
  entered = 0;
  exited = 0;
  /** Busiest count of people and vehicles in each minute, for the last `keepMinutes`. */
  history: { minute: number; people: number; vehicles: number }[] = [];
  private nextId = 1;

  constructor(private opts = { maxJump: 0.18, forgetMs: 3000, keepMinutes: 60 }) {}

  update(dets: Detection[], at: number): Tick {
    const feet = dets.map((d) => ({ d, x: d.box[0] + d.box[2] / 2, y: d.box[1] + d.box[3] }));
    const used = new Set<number>();
    // Greedy nearest match per track, same kind only.
    for (const t of this.tracks) {
      let best = -1, bestD = this.opts.maxJump;
      feet.forEach((f, i) => {
        if (used.has(i) || f.d.kind !== t.kind) return;
        const dist = Math.hypot(f.x - t.x, f.y - t.y);
        if (dist < bestD) { bestD = dist; best = i; }
      });
      if (best >= 0) {
        used.add(best);
        t.prevX = t.x; t.prevY = t.y;
        t.x = feet[best].x; t.y = feet[best].y;
        t.lastSeen = at;
        if (this.line && t.kind === "person" && crosses(this.line, t.prevX, t.prevY, t.x, t.y)) {
          if (side(this.line, t.x, t.y) > 0) this.entered++;
          else this.exited++;
        }
      }
    }
    feet.forEach((f, i) => {
      if (!used.has(i)) this.tracks.push({ id: this.nextId++, kind: f.d.kind, x: f.x, y: f.y, prevX: f.x, prevY: f.y, firstSeen: at, lastSeen: at, counted: false });
    });
    this.tracks = this.tracks.filter((t) => at - t.lastSeen <= this.opts.forgetMs);
    const counts: Record<Kind, number> = { person: 0, vehicle: 0, bike: 0 };
    for (const d of dets) counts[d.kind]++;
    const minute = Math.floor(at / 60_000);
    const last = this.history[this.history.length - 1];
    if (last?.minute === minute) {
      last.people = Math.max(last.people, counts.person);
      last.vehicles = Math.max(last.vehicles, counts.vehicle);
    } else this.history.push({ minute, people: counts.person, vehicles: counts.vehicle });
    this.history = this.history.filter((hh) => hh.minute > minute - this.opts.keepMinutes);
    return { at, counts, entered: this.entered, exited: this.exited };
  }

  setLine(line: CountLine | null) {
    this.line = line;
    this.entered = this.exited = 0;
  }
}

/**
 * Roughly where a point on the picture is on the ground, from the camera's
 * position, direction, field of view and range (as placed in My Place).
 * Assumes a level camera looking along the ground: the bottom of the picture is
 * about 2 m away and the upper third is the far edge of its range.
 */
export function groundPoint(cam: Pick<Device, "lon" | "lat" | "heading" | "fov" | "range">, x: number, y: number): [number, number] {
  const heading = cam.heading ?? 0, fov = cam.fov ?? 90, range = cam.range ?? 25, near = 2, horizon = 0.33;
  const bearing = ((heading + (x - 0.5) * fov) * Math.PI) / 180;
  const t = Math.max(0, Math.min(1, (1 - y) / (1 - horizon)));
  const dist = near + (range - near) * t * t; // perspective: distances stretch toward the horizon
  const kx = 111_320 * Math.cos((cam.lat * Math.PI) / 180), ky = 110_540;
  return [cam.lon + (Math.sin(bearing) * dist) / kx, cam.lat + (Math.cos(bearing) * dist) / ky];
}
