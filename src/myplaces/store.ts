// "My Place": places people care about (home, a family hotel, a farm), with
// what's installed there (solar, batteries, tanks, cameras…). Kept in this
// browser only, with export and import for backup.

export type PlaceKind = "home" | "hotel" | "business" | "farm" | "school" | "other";

export type DeviceType = "camera" | "solar" | "battery" | "generator" | "tank" | "well" | "gate" | "alarm" | "light" | "sensor";

export interface Device {
  id: string;
  type: DeviceType;
  lon: number;
  lat: number;
  label?: string;
  /** Cameras: direction faced (degrees from north), field of view, range in metres. */
  heading?: number;
  fov?: number;
  range?: number;
  /** Cameras: a link to the live feed, if the owner has one. */
  url?: string;
  /** Cameras: the maker (ring, nest, reolink…), for how to connect it. */
  brand?: string;
  /** Cameras: a counting line across the picture (e.g. a doorway), and named zones (normalised 0..1). */
  line?: { a: [number, number]; b: [number, number] };
  zones?: { name: string; box: [number, number, number, number] }[];
}

export interface MyPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  lon: number;
  lat: number;
  address?: string;
  notes?: string;
  created: number;
  energy: { solarKw?: number; batteryKwh?: number; generatorKw?: number; dailyUseKwh?: number };
  water: { source?: "mains" | "well" | "cistern" | "rain" | "truck"; tankLitres?: number; dailyUseLitres?: number; roofM2?: number };
  devices: Device[];
  /** The building's outline, traced by hand when it isn't mapped (lon, lat). */
  footprint?: [number, number][];
  storeys?: number;
  /** Your pool outlines and trees (lon, lat), when the map doesn't have them. */
  land?: { pools?: [number, number][][]; trees?: [number, number][] };
}

export const KIND_LABEL: Record<PlaceKind, string> = { home: "Home", hotel: "Hotel", business: "Business", farm: "Farm", school: "School", other: "Place" };

export const DEVICES: Record<DeviceType, { label: string; color: string; group: "energy" | "water" | "security" }> = {
  solar: { label: "Solar panels", color: "#e1b843", group: "energy" },
  battery: { label: "Battery", color: "#5b9467", group: "energy" },
  generator: { label: "Generator", color: "#d19a2e", group: "energy" },
  tank: { label: "Water tank", color: "#3563d6", group: "water" },
  well: { label: "Well", color: "#4c9ac9", group: "water" },
  camera: { label: "Camera", color: "#b8496a", group: "security" },
  gate: { label: "Gate", color: "#8b5fa8", group: "security" },
  alarm: { label: "Alarm", color: "#c4513a", group: "security" },
  light: { label: "Security light", color: "#ffcc66", group: "security" },
  sensor: { label: "Sensor", color: "#98989d", group: "security" },
};

const KEY = "atlas.myplaces.v1";

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function blankPlace(name: string, lon: number, lat: number, kind: PlaceKind = "home"): MyPlace {
  return { id: newId(), name, kind, lon, lat, created: Date.now(), energy: {}, water: {}, devices: [] };
}

const unit = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
function cleanLine(v: unknown): Device["line"] {
  const l = v as { a?: unknown[]; b?: unknown[] } | undefined;
  return l && Array.isArray(l.a) && Array.isArray(l.b) && [...l.a, ...l.b].length === 4 && [...l.a, ...l.b].every(unit) ? { a: [l.a[0] as number, l.a[1] as number], b: [l.b[0] as number, l.b[1] as number] } : undefined;
}
function cleanZones(v: unknown): Device["zones"] {
  if (!Array.isArray(v)) return undefined;
  const zs = v.flatMap((z: { name?: unknown; box?: unknown[] }) => z && typeof z.name === "string" && Array.isArray(z.box) && z.box.length === 4 && z.box.every(unit) ? [{ name: z.name.slice(0, 40), box: z.box as [number, number, number, number] }] : []);
  return zs.length ? zs.slice(0, 12) : undefined;
}

/** Checks and tidies places read from storage or an import file. */
/** A list of [lon, lat] pairs, or undefined (pure). */
const cleanPts = (v: unknown, max = 2000): [number, number][] | undefined =>
  Array.isArray(v) ? (v as unknown[]).filter((q): q is [number, number] => Array.isArray(q) && q.length >= 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]) && Math.abs(q[1] as number) <= 90 && Math.abs(q[0] as number) <= 180).map((q) => [q[0], q[1]] as [number, number]).slice(0, max) : undefined;

export function sanitize(raw: unknown): MyPlace[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return raw.flatMap((p): MyPlace[] => {
    if (!p || typeof p !== "object") return [];
    const o = p as Record<string, unknown>;
    const lon = num(o.lon), lat = num(o.lat);
    if (lon === undefined || lat === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
    const devices = Array.isArray(o.devices)
      ? (o.devices as Record<string, unknown>[]).filter((d) => d && typeof d.type === "string" && d.type in DEVICES && num(d.lon) !== undefined && num(d.lat) !== undefined)
          .map((d) => ({ id: String(d.id ?? newId()), type: d.type as DeviceType, lon: d.lon as number, lat: d.lat as number, label: typeof d.label === "string" ? d.label : undefined, heading: num(d.heading), fov: num(d.fov), range: num(d.range), url: typeof d.url === "string" && /^https?:\/\//.test(d.url) ? d.url : undefined, line: cleanLine(d.line), zones: cleanZones(d.zones) }))
      : [];
    const kind = typeof o.kind === "string" && o.kind in KIND_LABEL ? (o.kind as PlaceKind) : "other";
    return [{
      id: String(o.id ?? newId()), name: String(o.name ?? "My place").slice(0, 80), kind, lon, lat,
      address: typeof o.address === "string" ? o.address : undefined, notes: typeof o.notes === "string" ? o.notes : undefined,
      created: num(o.created) ?? Date.now(),
      energy: (o.energy && typeof o.energy === "object" ? o.energy : {}) as MyPlace["energy"],
      water: (o.water && typeof o.water === "object" ? o.water : {}) as MyPlace["water"],
      devices,
      footprint: (() => { const f = cleanPts(o.footprint, 400); return f && f.length > 2 ? f : undefined; })(),
      storeys: num(o.storeys) !== undefined ? Math.max(1, Math.min(200, Math.round(o.storeys as number))) : undefined,
      land: o.land && typeof o.land === "object" ? (() => {
        const l = o.land as Record<string, unknown>;
        const pools = Array.isArray(l.pools) ? (l.pools as unknown[]).map((r) => cleanPts(r, 200)).filter((r): r is [number, number][] => !!r && r.length > 2).slice(0, 20) : [];
        const trees = cleanPts(l.trees, 2000) ?? [];
        return pools.length || trees.length ? { pools, trees } : undefined;
      })() : undefined,
    }];
  });
}

export class PlaceStore {
  private places: MyPlace[] = [];
  private listeners = new Set<() => void>();

  constructor() {
    try {
      this.places = sanitize(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {
      this.places = [];
    }
  }

  all(): MyPlace[] {
    return this.places;
  }

  get(id: string): MyPlace | undefined {
    return this.places.find((p) => p.id === id);
  }

  /** Finds a saved place by name ("my hotel", "Hotel Yaluma", "home"). */
  find(text: string): MyPlace | undefined {
    const t = text.toLowerCase().replace(/^(my|our|the)\s+/, "").trim();
    return this.places.find((p) => p.name.toLowerCase() === t)
      ?? this.places.find((p) => p.name.toLowerCase().includes(t) || t.includes(p.name.toLowerCase()))
      ?? this.places.find((p) => p.kind === t || KIND_LABEL[p.kind].toLowerCase() === t);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  save(p: MyPlace) {
    const i = this.places.findIndex((x) => x.id === p.id);
    if (i >= 0) this.places[i] = p;
    else this.places.push(p);
    this.persist();
  }

  remove(id: string) {
    this.places = this.places.filter((p) => p.id !== id);
    this.persist();
  }

  exportJson(): string {
    return JSON.stringify({ app: "atlas", version: 1, places: this.places }, null, 2);
  }

  /** Adds places from an export file; returns how many were added. */
  importJson(text: string): number {
    const data = JSON.parse(text);
    const incoming = sanitize(Array.isArray(data) ? data : data?.places);
    for (const p of incoming) if (!this.get(p.id)) this.places.push(p);
    this.persist();
    return incoming.length;
  }

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.places));
    } catch {
      /* private mode or full: keep going in memory */
    }
    this.listeners.forEach((fn) => fn());
  }
}
