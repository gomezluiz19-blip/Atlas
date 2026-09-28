// Each theme sees the planet its own way: Earth in relief, Water by depth,
// Climate as today's clouds, Plants by greenness, Animals where life is
// recorded, Built at night, Countries as a political map, Space from orbit
// with the night side lit by cities. A small legend says what you're seeing,
// and one tap goes back to the plain satellite view.
import { Color, ImageryLayer, UrlTemplateImageryProvider } from "cesium";
import { countryShapes } from "../data/countries";
import { gbifTiles } from "../data/inaturalist";
import { h } from "../ui/dom";
import { createAnalyticLayer, DEPTH_RAMP, LAND_RAMP } from "./analyticLayers";
import { vectorLayer } from "./vectorLayer";
import { canvasLayer } from "./networkLayer";
import { populationPoints, type PopPoint } from "../data/people";
import type { Globe } from "./viewer";

interface Tint { brightness?: number; saturation?: number; contrast?: number; gamma?: number; hue?: number }
interface LookLayer { layer: ImageryLayer; alpha: number; /** Lit side / night side only (with lighting on). */ day?: number; night?: number }

export interface Look {
  id: string;
  /** Name shown on the legend: "Relief", "Depths"… */
  name: string;
  emoji: string;
  about: string;
  legend?: { stops: string[]; from: string; to: string };
  /** How the satellite imagery is tinted underneath. */
  tint?: Tint;
  layers?: () => LookLayer[];
  /** A layer that needs data first (swapped in when it arrives). */
  late?: () => Promise<ImageryLayer>;
  lateAlpha?: number;
  /** Day and night: the sun where it really is now. */
  lighting?: boolean;
  /** Close in, the look eases back to the plain imagery (km above ground where it's gone). */
  fadeKm?: [number, number];
  source?: string;
}

const gibs = (layer: string, level: number, ext: "png" | "jpg", date = "default", credit = "NASA GIBS") =>
  new ImageryLayer(new UrlTemplateImageryProvider({
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`,
    maximumLevel: level, credit,
  }));
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

/** A calm political palette; neighbours usually differ because ids are scattered. */
const PALETTE = ["#f4a261", "#e9c46a", "#8ab17d", "#2a9d8f", "#90be6d", "#f28482", "#b8c0ff", "#ffd6a5", "#cdb4db", "#a3c4f3", "#f7b267", "#9bf6ff"];
const colorOf = (id: string) => { let x = 0; for (const c of id) x = (x * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[x % PALETTE.length]; };

export const LOOKS: Record<string, Look> = {
  land: {
    id: "land", name: "Relief", emoji: "⛰️", about: "Height above and below sea level, lit from the north-west",
    legend: { stops: LAND_RAMP.stops.slice(1, 8), from: "Sea level", to: "6,000 m" },
    tint: { saturation: 0.35, brightness: 0.9, contrast: 1.1 },
    layers: () => [{ layer: createAnalyticLayer("elevation"), alpha: 0.5 }, { layer: createAnalyticLayer("hillshade"), alpha: 0.9 }],
    fadeKm: [40, 3], source: "Terrain Tiles on AWS",
  },
  water: {
    id: "water", name: "Depths", emoji: "🌊", about: "The ocean floor by depth; the land dimmed so the water stands out",
    legend: { stops: [...DEPTH_RAMP.stops].reverse(), from: "Shore", to: "8,000 m deep" },
    tint: { saturation: 0.25, brightness: 0.6 },
    layers: () => [{ layer: createAnalyticLayer("depth"), alpha: 0.85 }],
    fadeKm: [30, 2], source: "GEBCO via Terrain Tiles on AWS",
  },
  climate: {
    id: "climate", name: "Clouds yesterday", emoji: "☁️", about: "The whole planet as NASA's VIIRS satellite photographed it in the last day",
    layers: () => [{ layer: gibs("VIIRS_SNPP_CorrectedReflectance_TrueColor", 9, "jpg", yesterday(), "Imagery: NASA VIIRS (GIBS)"), alpha: 1 }],
    fadeKm: [600, 150], source: "NASA VIIRS via GIBS",
  },
  plants: {
    id: "plants", name: "Greenness", emoji: "🌿", about: "How green the land is this week (NDVI from NASA's MODIS)",
    legend: { stops: ["#a0522d", "#d2b48c", "#e8e38c", "#8fc55d", "#2e8b3d", "#0b4f1c"], from: "Bare", to: "Lush" },
    tint: { saturation: 0.1, brightness: 0.55 },
    layers: () => [{ layer: gibs("MODIS_Terra_NDVI_8Day", 9, "png", "default", "Vegetation: NASA MODIS NDVI (GIBS)"), alpha: 0.85 }],
    fadeKm: [60, 8], source: "NASA MODIS via GIBS",
  },
  animals: {
    id: "animals", name: "Where life is recorded", emoji: "🐾", about: "Every glowing point is animals seen and recorded there (GBIF)",
    legend: { stops: ["#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"], from: "A few records", to: "Millions" },
    tint: { saturation: 0.05, brightness: 0.35 },
    layers: () => [{ layer: new ImageryLayer(new UrlTemplateImageryProvider({ url: gbifTiles(1, "purpleYellow.point"), maximumLevel: 14, credit: "Species records: GBIF.org" })), alpha: 1 }],
    fadeKm: [40, 5], source: "GBIF.org",
  },
  built: {
    id: "built", name: "At night", emoji: "🌃", about: "The planet's lights after dark: where people have built",
    legend: { stops: ["#000000", "#3a2a0a", "#a8741a", "#ffd479", "#fff6d6"], from: "Dark", to: "Brightest" },
    tint: { brightness: 0.22, saturation: 0.3 },
    layers: () => [{ layer: gibs("VIIRS_Black_Marble", 8, "png", "2016-01-01", "Night lights: NASA Black Marble"), alpha: 1 }],
    fadeKm: [60, 10], source: "NASA Black Marble",
  },
  countries: {
    id: "countries", name: "Political", emoji: "🗺️", about: "Every country in its own colour",
    tint: { saturation: 0.4, brightness: 0.85 },
    late: () => countryShapes().then((shapes) => vectorLayer(shapes, { stroke: "rgba(0,0,0,0)", width: 0, fillOf: (s) => colorOf((s as unknown as { id: string }).id) })),
    lateAlpha: 0.5,
    fadeKm: [300, 40], source: "Natural Earth",
  },
  people: {
    id: "people", name: "Where people live", emoji: "👥", about: "Every town and city glowing by how many live there",
    legend: { stops: ["#1a0f05", "#7a2e0b", "#e0641a", "#ffb347", "#fff4d6"], from: "Few", to: "Millions" },
    tint: { brightness: 0.28, saturation: 0.15 },
    late: () => populationPoints().then(heatLayer),
    lateAlpha: 1,
    fadeKm: [40, 6], source: "Natural Earth populated places",
  },
  space: {
    id: "space", name: "Day and night", emoji: "🌗", about: "Sunlight where the sun is now; the night side lit by its cities",
    lighting: true,
    layers: () => [{ layer: gibs("VIIRS_Black_Marble", 8, "png", "2016-01-01", "Night lights: NASA Black Marble"), alpha: 1, day: 0, night: 1 }],
    source: "NASA Black Marble",
  },
};

const placeholder = () => new ImageryLayer(new UrlTemplateImageryProvider({ url: "about:blank?{z}/{x}/{y}", maximumLevel: 0 }), { show: false });

/** Every town and city as a glow, bigger and brighter for more people. */
export function heatLayer(points: PopPoint[]): ImageryLayer {
  const withBox = points.map(([lon, lat, pop]) => {
    const rKm = 4 + Math.sqrt(pop) / 55;
    const dLat = rKm / 111, dLon = dLat / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
    return { lon, lat, pop, rKm, box: [lon - dLon, lat - dLat, lon + dLon, lat + dLat] as [number, number, number, number] };
  });
  return canvasLayer((ctx, t) => {
    ctx.globalCompositeOperation = "lighter";
    const kmPx = (() => { const [x0] = t.project(t.west, (t.south + t.north) / 2), [x1] = t.project(t.east, (t.south + t.north) / 2); return (x1 - x0) / ((t.east - t.west) * 111 * Math.cos((((t.south + t.north) / 2) * Math.PI) / 180)); })();
    for (const p of withBox) {
      if (!t.touches(p.box, 40)) continue;
      const [x, y] = t.project(p.lon, p.lat);
      // Seen from far away every town still glows; close in, glows stay city-sized, not screen-sized.
      const lg = Math.log10(Math.max(1000, p.pop));
      const r = Math.max((lg - 2.6) * 3.2, Math.min(90, p.rKm * kmPx));
      const a = Math.min(0.95, 0.22 + (lg - 3) / 5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255, 236, 190, ${a})`);
      g.addColorStop(0.25, `rgba(255, 150, 60, ${a * 0.8})`);
      g.addColorStop(0.6, `rgba(200, 70, 20, ${a * 0.35})`);
      g.addColorStop(1, "rgba(120, 30, 10, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { maximumLevel: 10, credit: "Population: Natural Earth populated places" });
}

export class Looks {
  private made = new Map<string, LookLayer[]>();
  private current: Look | null = null;
  private themeId = "";
  private legend = h("div", { class: "look-legend", hidden: true, role: "status" });
  private natural = new Set<string>();
  private raf = 0;
  private fade = 1;

  constructor(private globe: Globe, host: HTMLElement) {
    host.append(this.legend);
    try { for (const id of JSON.parse(localStorage.getItem("atlas.looks.natural") ?? "[]") as string[]) this.natural.add(id); } catch { /* storage unavailable */ }
    const cam = globe.viewer.camera;
    cam.percentageChanged = 0.05;
    cam.changed.addEventListener(() => this.onZoom());
  }

  /** Switches to a theme's look (or the plain imagery if it has none, or the viewer chose natural). */
  set(themeId: string) {
    this.themeId = themeId;
    const next = this.natural.has(themeId) ? null : LOOKS[themeId] ?? null;
    if (next !== this.current) this.apply(next);
    this.renderLegend();
  }

  toggle() {
    if (this.natural.has(this.themeId)) this.natural.delete(this.themeId);
    else this.natural.add(this.themeId);
    try { localStorage.setItem("atlas.looks.natural", JSON.stringify([...this.natural])); } catch { /* storage unavailable */ }
    this.set(this.themeId);
  }

  /** A theme's own legend in place of its look's (People's views: mobile phones, homeowners…). */
  private customLegend: { theme: string; emoji: string; name: string; stops: string[]; from: string; to: string } | null = null;
  setLegend(l: { emoji: string; name: string; stops: string[]; from: string; to: string } | null) {
    this.customLegend = l ? { ...l, theme: this.themeId } : null;
    this.renderLegend();
  }

  /** Shows one look regardless of theme (the video studio); null for the satellite photo. */
  preview(id: string | null) {
    const next = id ? LOOKS[id] ?? null : null;
    if (next !== this.current) this.apply(next);
  }

  /** Back to the current theme's look. */
  restore() {
    this.set(this.themeId);
  }

  get active(): Look | null {
    return this.current;
  }

  private layersOf(look: Look): LookLayer[] {
    let got = this.made.get(look.id);
    if (!got) {
      got = look.layers?.() ?? [];
      for (const l of got) { l.layer.alpha = 0; this.globe.addUnder(l.layer); }
      this.made.set(look.id, got);
      if (look.late) void this.loadLate(look, got);
    }
    return got;
  }

  private async loadLate(look: Look, got: LookLayer[]) {
    const holder = { layer: placeholder(), alpha: look.lateAlpha ?? 1 };
    got.push(holder);
    const layer = await look.late!().catch(() => null);
    if (!layer) return;
    holder.layer = layer;
    layer.alpha = 0;
    this.globe.addUnder(layer);
    if (this.current?.id === look.id) this.tween(look);
  }

  private apply(next: Look | null) {
    const prev = this.current;
    this.current = next;
    const scene = this.globe.viewer.scene;
    scene.globe.enableLighting = !!next?.lighting;
    // Fade the old layers out and the new ones in, with the tint easing between.
    if (prev) for (const l of this.made.get(prev.id) ?? []) if (!next || next.id !== prev.id) this.animate(l.layer, 0, () => { l.layer.show = false; });
    if (next) for (const l of this.layersOf(next)) {
      l.layer.show = true;
      if (l.day !== undefined) l.layer.dayAlpha = l.day;
      if (l.night !== undefined) l.layer.nightAlpha = l.night;
    }
    this.onZoom(true);
  }

  /** Eases a layer's alpha toward a target. */
  private animate(layer: ImageryLayer, to: number, done?: () => void) {
    const from = layer.alpha, t0 = performance.now(), dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;
    const step = (t: number) => {
      const f = dur ? Math.min(1, (t - t0) / dur) : 1, e = f * f * (3 - 2 * f);
      layer.alpha = from + (to - from) * e;
      this.globe.viewer.scene.requestRender();
      if (f < 1) requestAnimationFrame(step); else done?.();
    };
    requestAnimationFrame(step);
  }

  /** How much of the look shows at this height (1 far away, 0 close in). */
  private strength(look: Look): number {
    if (!look.fadeKm) return 1;
    const km = this.globe.viewer.camera.positionCartographic.height / 1000;
    const [far, near] = look.fadeKm;
    const t = Math.max(0, Math.min(1, (km - near) / (far - near)));
    return t * t * (3 - 2 * t);
  }

  private onZoom(force = false) {
    const look = this.current;
    const f = look ? this.strength(look) : 0;
    if (!force && Math.abs(f - this.fade) < 0.02) return;
    this.fade = f;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.tween(look, force));
    this.legend.classList.toggle("faded", !!look && f < 0.15);
  }

  private tween(look: Look | null, animated = true) {
    const f = look ? this.strength(look) : 0;
    const t = look?.tint ?? {};
    const mix = (key: keyof Tint, base: number) => base + ((t[key] ?? base) - base) * f;
    for (const sat of this.globe.baseLayers()) {
      sat.brightness = mix("brightness", 1);
      sat.saturation = mix("saturation", 1);
      sat.contrast = mix("contrast", 1);
      sat.gamma = mix("gamma", 1);
      sat.hue = mix("hue", 0);
    }
    if (look) for (const l of this.made.get(look.id) ?? []) { if (animated) this.animate(l.layer, l.alpha * f); else l.layer.alpha = l.alpha * f; }
    this.globe.viewer.scene.requestRender();
    this.globe.viewer.scene.globe.baseColor = look?.id === "built" || look?.id === "animals" ? Color.fromCssColorString("#03070f") : Color.fromCssColorString("#0b1d33");
  }

  private renderLegend() {
    const c = this.customLegend?.theme === this.themeId ? this.customLegend : null;
    if (c) {
      this.legend.hidden = false;
      this.legend.replaceChildren(
        h("span", { class: "look-emoji", "aria-hidden": "true" }, c.emoji),
        h("span", { class: "look-text" }, h("strong", {}, c.name), h("span", { class: "look-ramp" }, h("small", {}, c.from), h("i", { style: `background:linear-gradient(90deg,${c.stops.join(",")})` }), h("small", {}, c.to))));
      return;
    }
    const look = LOOKS[this.themeId];
    if (!look) { this.legend.hidden = true; return; }
    const on = this.current === look;
    this.legend.hidden = false;
    this.legend.replaceChildren(
      h("span", { class: "look-emoji", "aria-hidden": "true" }, on ? look.emoji : "🛰️"),
      h("span", { class: "look-text" },
        h("strong", {}, on ? look.name : "Satellite"),
        on && look.legend ? h("span", { class: "look-ramp" },
          h("small", {}, look.legend.from),
          h("i", { style: `background:linear-gradient(90deg,${look.legend.stops.join(",")})` }),
          h("small", {}, look.legend.to)) : h("small", { class: "look-about" }, on ? look.about : "The plain photo of the planet")),
      h("button", { class: "look-switch", title: on ? look.about : `Back to the ${look.name.toLowerCase()} view`, onclick: () => this.toggle() }, on ? "Satellite" : `${look.emoji} ${look.name}`));
  }
}
