// World networks for the Built theme: railways, roads, shipping lanes, ports,
// airports, power plants and undersea cables, each a toggleable map layer.
import { ImageryLayer, UrlTemplateImageryProvider, type Viewer } from "cesium";
import { airports, cables, fuelOf, landingPoints, ports, powerPlants, railways, roads, shippingLanes } from "../data/infra";
import type { Canvas } from "../canvas";
import { canvasLayer, drawDots, drawLines, type TileView } from "./networkLayer";

export type NetworkId = "rail" | "roads" | "shipping" | "ports" | "airports" | "power" | "cables";

export const NETWORKS: { id: NetworkId; label: string; about: string; color: string; source: string }[] = [
  { id: "rail", label: "Railways", about: "Main lines worldwide; every track and station when zoomed in", color: "#ff6961", source: "Natural Earth; OpenRailwayMap (detail)" },
  { id: "roads", label: "Highways", about: "Major and secondary highways, and ferry routes", color: "#ffd60a", source: "Natural Earth" },
  { id: "shipping", label: "Shipping lanes", about: "The world's main sea routes, by importance", color: "#5ac8fa", source: "Benden (2022), after the CIA Map of the World's Oceans" },
  { id: "ports", label: "Ports", about: "Over a thousand seaports, bigger dots for bigger ports", color: "#0a84ff", source: "Natural Earth" },
  { id: "airports", label: "Airports", about: "Major and mid-size airports", color: "#5e5ce6", source: "Natural Earth" },
  { id: "power", label: "Power plants", about: "35,000 plants coloured by fuel, sized by capacity", color: "#ff9f0a", source: "WRI Global Power Plant Database" },
  { id: "cables", label: "Undersea cables", about: "The fibre-optic cables that carry the internet between continents", color: "#64d2ff", source: "TeleGeography Submarine Cable Map" },
];

const railMaxRank = (l: number) => (l <= 1 ? 5 : l === 2 ? 6 : l === 3 ? 8 : 10);
const roadMaxRank = (l: number) => (l <= 1 ? 3 : l >= 6 ? 10 : l + 2);
const powerMin = (l: number) => (l <= 1 ? 2500 : l === 2 ? 1500 : l === 3 ? 600 : l === 4 ? 250 : l === 5 ? 60 : l === 6 ? 15 : 0);
const grow = (l: number) => Math.min(1.8, 0.8 + l * 0.12);

async function build(id: NetworkId): Promise<ImageryLayer[]> {
  switch (id) {
    case "rail": {
      const lines = await railways();
      const base = canvasLayer((ctx, t) =>
        drawLines(ctx, t, lines, (l, lv) => {
          if ((l.attrs[0] as number) > railMaxRank(lv)) return null;
          return { color: "#ff6961", width: lv < 3 ? 0.9 : lv < 5 ? 1.3 : 1.8, casing: lv >= 4 ? "rgba(0,0,0,0.35)" : undefined };
        }), { maximumLevel: 10, credit: "Railways: Natural Earth" });
      // Every track, station and yard from OpenStreetMap once you're zoomed in.
      const detail = new ImageryLayer(
        new UrlTemplateImageryProvider({
          url: "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
          subdomains: ["a", "b", "c"],
          maximumLevel: 18,
          credit: "Rail detail: © OpenRailwayMap (CC-BY-SA), data © OpenStreetMap contributors",
        }),
        // Only once zoomed in. (A provider minimumLevel would stall the whole globe's imagery.)
        { alpha: 0.9, minimumTerrainLevel: 8 },
      );
      return [base, detail];
    }
    case "roads": {
      const lines = await roads();
      return [canvasLayer((ctx, t) =>
        drawLines(ctx, t, lines, (l, lv) => {
          const [kind, rank] = l.attrs as [string, number];
          if (rank > roadMaxRank(lv)) return null;
          const g = grow(lv);
          if (kind === "M") return { color: "#ffd60a", width: 1.3 * g, casing: lv >= 5 ? "rgba(0,0,0,0.3)" : undefined };
          if (kind === "S") return { color: "rgba(255,255,255,0.85)", width: 0.9 * g };
          if (kind === "F") return { color: "#64d2ff", width: 0.9 * g, dash: [4, 3] };
          return { color: "rgba(255,255,255,0.6)", width: 0.7 * g };
        }), { maximumLevel: 10, credit: "Roads: Natural Earth" })];
    }
    case "shipping": {
      const lines = await shippingLanes();
      return [canvasLayer((ctx, t) =>
        drawLines(ctx, t, lines, (l, lv) => {
          const imp = l.attrs[0] as number;
          if (imp === 3 && lv < 3) return null;
          const g = grow(lv);
          return imp === 1
            ? { color: "rgba(90,200,250,0.85)", width: 1.7 * g }
            : imp === 2 ? { color: "rgba(90,200,250,0.6)", width: 1.1 * g } : { color: "rgba(90,200,250,0.45)", width: 0.8 * g, dash: [3, 3] };
        }), { maximumLevel: 8, credit: "Shipping lanes: Benden (2022), CC BY 4.0" })];
    }
    case "ports": {
      const list = await ports();
      return [canvasLayer((ctx, t) =>
        drawDots(ctx, t, list, (p, lv) => (p.rank > lv + 4 ? null : { color: "#0a84ff", radius: (3 + Math.max(0, 8 - p.rank) * 0.35) * grow(lv), glyph: "anchor" })),
        { maximumLevel: 12, credit: "Ports: Natural Earth" })];
    }
    case "airports": {
      const list = await airports();
      const tier = (type: string) => (/major/.test(type) ? 0 : /mid/.test(type) ? 1 : 2);
      return [canvasLayer((ctx, t) =>
        drawDots(ctx, t, list, (a, lv) => {
          const tr = tier(a.type);
          if ((tr === 1 && lv < 3) || (tr === 2 && lv < 5)) return null;
          return { color: "#5e5ce6", radius: (tr === 0 ? 5 : tr === 1 ? 3.8 : 3) * grow(lv), glyph: "plane" };
        }), { maximumLevel: 12, credit: "Airports: Natural Earth" })];
    }
    case "power": {
      const list = await powerPlants();
      return [canvasLayer((ctx, t) =>
        drawDots(ctx, t, list, (p, lv) => {
          if (p.mw < powerMin(lv)) return null;
          const r = Math.max(1.6, Math.min(7, 1.4 + Math.sqrt(p.mw) / 16)) * Math.min(1.25, 0.6 + lv * 0.07);
          return { color: fuelOf(p.fuel).color, radius: r, stroke: "rgba(0,0,0,0.45)" };
        }), { maximumLevel: 12, credit: "Power plants: WRI Global Power Plant Database (CC BY 4.0)" })];
    }
    case "cables": {
      const [list, landings] = await Promise.all([cables(), landingPoints().catch(() => [])]);
      const lines = list.flatMap((c) => c.lines.map((l) => ({ ...l, attrs: [c.color] })));
      return [canvasLayer((ctx, t: TileView) => {
        drawLines(ctx, t, lines, (l, lv) => ({ color: l.attrs[0] as string, width: lv < 3 ? 1 : lv < 6 ? 1.5 : 2 }));
        if (t.level >= 2) drawDots(ctx, t, landings, (_p, lv) => ({ color: "#ffffff", radius: lv < 4 ? 1.8 : 2.8, stroke: "rgba(0,0,0,0.6)" }));
      }, { maximumLevel: 9, credit: "Undersea cables: TeleGeography Submarine Cable Map (CC BY-NC-SA 3.0)" })];
    }
  }
}

export class Networks {
  private layers = new Map<NetworkId, ImageryLayer[]>();
  private pending = new Map<NetworkId, Promise<void>>();
  private shown = new Set<NetworkId>();
  /** Suggested layers the user switched off (not suggested again). */
  private declined = new Set<NetworkId>();
  private listeners = new Set<() => void>();

  constructor(private viewer: Viewer, private toast: (m: string) => void, private canvas: Canvas) {
    canvas.subscribe(() => this.emit());
  }

  isOn(id: NetworkId) {
    return this.canvas.has(`net:${id}`);
  }

  isLoading(id: NetworkId) {
    return this.pending.has(id);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  /**
   * Switches a network on or off. `theme` marks it as that theme's suggestion
   * (shown only there unless pinned); without it, it stays on everywhere.
   */
  set(id: NetworkId, on: boolean, theme?: string) {
    const key = `net:${id}`;
    if (!on) {
      this.declined.add(id);
      this.canvas.remove(key);
      return;
    }
    const n = NETWORKS.find((x) => x.id === id)!;
    this.canvas.put({
      id: key, label: n.label, color: n.color, theme, scope: "world", pinned: false,
      show: (v) => {
        if (v) this.shown.add(id);
        else this.shown.delete(id);
        if (v) void this.ensure(id);
        this.sync();
      },
      remove: () => {
        this.shown.delete(id);
        this.sync();
      },
    });
  }

  /** Switches on a theme's suggested networks, except ones the user turned off. */
  suggest(ids: NetworkId[], theme: string) {
    for (const id of ids) if (!this.declined.has(id) && !this.isOn(id)) this.set(id, true, theme);
  }

  private ensure(id: NetworkId): Promise<void> {
    if (this.layers.has(id)) return Promise.resolve();
    let p = this.pending.get(id);
    if (!p) {
      p = build(id)
        .then((ls) => {
          this.layers.set(id, ls);
          for (const l of ls) this.viewer.imageryLayers.add(l);
          this.sync();
        })
        .catch((err) => {
          this.canvas.remove(`net:${id}`);
          const name = NETWORKS.find((n) => n.id === id)!.label;
          this.toast(`${name} couldn't be loaded right now (${(err as Error).message}).`);
        })
        .finally(() => {
          this.pending.delete(id);
          this.emit();
        });
      this.pending.set(id, p);
      this.emit();
    }
    return p;
  }

  private sync() {
    for (const [id, ls] of this.layers) for (const l of ls) l.show = this.shown.has(id);
  }
}
