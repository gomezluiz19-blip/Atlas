// Lenses anyone can make. A lens is a recipe of building blocks (what's
// been seen here lately, named places of a kind nearby, the weather that
// matters, the swell, the night sky, the sun, the ground, a tip from the
// person who made it), and a verdict: is now a good time for this, here?
// Recipes are small JSON, so they travel in a link and remix freely.
import { Cartesian3, Color, HeightReference, LabelStyle, VerticalOrigin, type Entity } from "cesium";
import type { App } from "../app";
import { getJson } from "../data/http";
import { elementPoint, overpass } from "../data/overpass";
import { sunPosition } from "../delight/sun";
import { latestKp } from "../data/space";
import { magneticLatitude } from "../analysis/insights";
import { h } from "../ui/dom";
import { canvasUrl } from "../ui/canvasUrl";
import type { Lens, LensHost, Subject, SubjectKind } from "./types";

// ---- The recipe ----------------------------------------------------------------------------------

export const SPECIES_GROUPS: Record<string, { label: string; query: string; emoji: string }> = {
  birds: { label: "Birds", query: "iconic_taxa=Aves", emoji: "🐦" },
  mammals: { label: "Mammals", query: "iconic_taxa=Mammalia", emoji: "🦊" },
  whales: { label: "Whales and dolphins", query: "taxon_id=152871", emoji: "🐋" },
  butterflies: { label: "Butterflies", query: "taxon_id=47224", emoji: "🦋" },
  insects: { label: "Insects", query: "iconic_taxa=Insecta", emoji: "🐝" },
  reptiles: { label: "Reptiles", query: "iconic_taxa=Reptilia", emoji: "🦎" },
  amphibians: { label: "Frogs and newts", query: "iconic_taxa=Amphibia", emoji: "🐸" },
  fish: { label: "Fish", query: "iconic_taxa=Actinopterygii", emoji: "🐟" },
  flowers: { label: "Wildflowers", query: "taxon_id=47125", emoji: "🌸" },
  plants: { label: "Plants", query: "iconic_taxa=Plantae", emoji: "🌿" },
  fungi: { label: "Fungi", query: "iconic_taxa=Fungi", emoji: "🍄" },
  all: { label: "Wildlife", query: "", emoji: "🔭" },
};

export type Block =
  | { type: "species"; group: string; days?: number; title?: string }
  | { type: "places"; tags: string[]; title: string; emoji?: string; radiusKm?: number }
  | { type: "weather"; title?: string; good?: { windMax?: number; rainMax?: number; cloudMax?: number; cloudMin?: number; tempMin?: number; tempMax?: number }; when?: "day" | "night" | "any" }
  | { type: "marine"; good?: { waveMin?: number; waveMax?: number; periodMin?: number } }
  | { type: "sky" }
  | { type: "aurora" }
  | { type: "sun" }
  | { type: "ground" }
  | { type: "tip"; text: string };

export const BLOCK_INFO: Record<Block["type"], { label: string; emoji: string; about: string }> = {
  species: { label: "Seen here lately", emoji: "🔭", about: "Wildlife recorded nearby (iNaturalist)" },
  places: { label: "Places nearby", emoji: "📍", about: "Named places of a kind (OpenStreetMap)" },
  weather: { label: "The weather that matters", emoji: "🌤️", about: "The next hours, and the best window" },
  marine: { label: "The swell", emoji: "🌊", about: "Wave height, period and sea temperature" },
  sky: { label: "Tonight's sky", emoji: "🌌", about: "Darkness, the moon and cloud" },
  aurora: { label: "The aurora", emoji: "🟩", about: "Geomagnetic activity now, and what it takes to reach here" },
  sun: { label: "The light", emoji: "🌅", about: "Sunrise, sunset and golden hour" },
  ground: { label: "The ground", emoji: "⛰️", about: "Height and relief" },
  tip: { label: "A tip", emoji: "💬", about: "Advice from whoever made the lens" },
};

export interface LensDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  blurb: string;
  /** Handle of whoever made it. */
  author?: string;
  /** Kinds of feature it suits best (empty: anywhere). */
  for?: SubjectKind[];
  /** How far around the place to look, km. */
  radiusKm: number;
  blocks: Block[];
  /** Where to try it when nothing's chosen. */
  home?: { name: string; lon: number; lat: number };
  /** Made from another lens (its id). */
  from?: string;
}

const KINDS: SubjectKind[] = ["peak", "volcano", "range", "crater", "canyon", "river", "lake", "sea", "coast", "glacier", "forest", "desert", "island", "city", "land"];
const TAG = /^[a-z_:]+(=[a-zA-Z0-9_ :;.-]+)?$/;

/** Checks a recipe from a link, storage or an AI (anything odd is dropped or clamped). */
export function lensFromJson(v: unknown): LensDef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown, max = 200) => (typeof x === "string" ? x.trim().slice(0, max) : "");
  const num = (x: unknown, lo: number, hi: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : undefined);
  const name = str(o.name, 40);
  if (!name) return null;
  const blocks: Block[] = (Array.isArray(o.blocks) ? o.blocks : []).slice(0, 10).flatMap((b: Record<string, unknown>): Block[] => {
    if (!b || typeof b !== "object") return [];
    switch (b.type) {
      case "species": return [{ type: "species", group: str(b.group) in SPECIES_GROUPS ? str(b.group) : "all", days: num(b.days, 1, 365) ?? 30, title: str(b.title, 50) || undefined }];
      case "places": {
        const tags = (Array.isArray(b.tags) ? b.tags : []).map((t) => str(t, 60)).filter((t) => TAG.test(t)).slice(0, 6);
        return tags.length ? [{ type: "places", tags, title: str(b.title, 50) || "Nearby", emoji: str(b.emoji, 8) || "📍", radiusKm: num(b.radiusKm, 0.2, 25) }] : [];
      }
      case "weather": {
        const g = (b.good ?? {}) as Record<string, unknown>;
        return [{ type: "weather", title: str(b.title, 50) || undefined, when: (["day", "night", "any"].includes(str(b.when)) ? str(b.when) : "day") as "day" | "night" | "any",
          good: { windMax: num(g.windMax, 0, 150), rainMax: num(g.rainMax, 0, 50), cloudMax: num(g.cloudMax, 0, 100), cloudMin: num(g.cloudMin, 0, 100), tempMin: num(g.tempMin, -60, 60), tempMax: num(g.tempMax, -60, 60) } }];
      }
      case "marine": { const g = (b.good ?? {}) as Record<string, unknown>; return [{ type: "marine", good: { waveMin: num(g.waveMin, 0, 30), waveMax: num(g.waveMax, 0, 30), periodMin: num(g.periodMin, 0, 25) } }]; }
      case "sky": case "sun": case "ground": case "aurora": return [{ type: b.type }];
      case "tip": return str(b.text) ? [{ type: "tip", text: str(b.text, 400) }] : [];
      default: return [];
    }
  });
  if (!blocks.length) return null;
  const home = o.home as Record<string, unknown> | undefined;
  return {
    id: str(o.id, 60) || `lens-${Math.random().toString(36).slice(2, 9)}`,
    name, icon: str(o.icon, 8) || "✨", color: /^#[0-9a-f]{6}$/i.test(str(o.color)) ? str(o.color) : "#0a84ff",
    blurb: str(o.blurb, 140) || blocks.map((b) => BLOCK_INFO[b.type].label).join(", "),
    author: str(o.author, 40) || undefined,
    for: (Array.isArray(o.for) ? o.for : []).filter((k): k is SubjectKind => KINDS.includes(k as SubjectKind)),
    radiusKm: num(o.radiusKm, 0.3, 30) ?? 3,
    blocks,
    home: home && typeof home.lon === "number" && typeof home.lat === "number" ? { name: str(home.name, 80), lon: home.lon, lat: home.lat } : undefined,
    from: str(o.from, 60) || undefined,
  };
}

// ---- Reading the world ----------------------------------------------------------------------------

interface Hourly { time: number[]; temp: number[]; rain: number[]; rainChance: (number | null)[]; cloud: number[]; wind: number[]; gust: number[]; day: number[]; offset: number }
async function hourly(lon: number, lat: number): Promise<Hourly> {
  const r = await getJson<{ utc_offset_seconds: number; hourly: Record<string, (number | null)[]> & { time: number[] } }>("Open-Meteo",
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=temperature_2m,precipitation,precipitation_probability,cloud_cover,wind_speed_10m,wind_gusts_10m,is_day&forecast_days=3&timeformat=unixtime&timezone=auto`);
  if (!r?.hourly?.time?.length) throw new Error("no forecast for this spot");
  const x = r.hourly, n = (a: (number | null)[] | undefined) => (a ?? []).map((v) => v ?? 0);
  return { time: x.time.map((t) => t * 1000), temp: n(x.temperature_2m), rain: n(x.precipitation), rainChance: x.precipitation_probability ?? [], cloud: n(x.cloud_cover), wind: n(x.wind_speed_10m), gust: n(x.wind_gusts_10m), day: n(x.is_day), offset: r.utc_offset_seconds ?? 0 };
}
const cachedHourly = new Map<string, Promise<Hourly>>();
const hourlyAt = (lon: number, lat: number) => {
  const k = `${lon.toFixed(2)},${lat.toFixed(2)}`;
  if (!cachedHourly.has(k)) { const p = hourly(lon, lat); cachedHourly.set(k, p); p.catch(() => cachedHourly.delete(k)); }
  return cachedHourly.get(k)!;
};
const local = (ms: number, offset: number) => new Date(ms + offset * 1000).toISOString().slice(11, 16).replace(/^0/, "");
const dayName = (ms: number, offset: number) => new Date(ms + offset * 1000).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });

/** The moon: phase (0 new … 0.5 full … 1) and how much of it is lit. */
export function moon(t: number): { phase: number; lit: number; name: string; emoji: string } {
  const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
  const phase = ((((t - ref) / 86_400_000) % syn) + syn) % syn / syn;
  const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const names: [number, string, string][] = [[0.03, "New moon", "🌑"], [0.22, "Waxing crescent", "🌒"], [0.28, "First quarter", "🌓"], [0.47, "Waxing gibbous", "🌔"], [0.53, "Full moon", "🌕"], [0.72, "Waning gibbous", "🌖"], [0.78, "Last quarter", "🌗"], [0.97, "Waning crescent", "🌘"], [1.01, "New moon", "🌑"]];
  const [, name, emoji] = names.find(([edge]) => phase < edge)!;
  return { phase, lit, name, emoji };
}

/** Tonight's full darkness (sun 18° below the horizon), from now over the next day. */
export function darkness(now: number, lat: number, lon: number): { from: number; to: number } | null {
  let from: number | null = null;
  for (let m = 0; m <= 26 * 60; m += 5) {
    const t = now + m * 60_000, dark = sunPosition(t, lat, lon).alt < -18;
    if (dark && from === null) from = t;
    if (!dark && from !== null) return { from, to: t };
  }
  return from !== null ? { from, to: now + 26 * 3_600_000 } : null;
}

interface Verdict { score: number; why: string }

// ---- Showing it -----------------------------------------------------------------------------------

type Ctx = { app: App; s: Subject; def: LensDef; pins: Entity[]; verdicts: Verdict[]; paintVerdict(): void; headless?: boolean; closed?: boolean };

const pinFor = (emoji: string, color: string) => canvasUrl(`lens|${emoji}|${color}`, () => {
  const c = document.createElement("canvas");
  c.width = 44; c.height = 44;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.beginPath(); g.arc(22, 22, 19, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  g.lineWidth = 3; g.strokeStyle = "#fff"; g.stroke();
  g.font = "20px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(emoji, 22, 23);
  return c;
});
function pin(ctx: Ctx, lon: number, lat: number, emoji: string, name?: string) {
  if (ctx.headless) return;
  void pinFor(emoji, ctx.def.color).then((image) => { if (!ctx.closed) { addPin(ctx, lon, lat, image, name); ctx.app.globe.viewer.scene.requestRender(); } });
}
function addPin(ctx: Ctx, lon: number, lat: number, image: string, name?: string) {
  ctx.pins.push(ctx.app.globe.viewer.entities.add({
    position: Cartesian3.fromDegrees(lon, lat),
    billboard: { image, heightReference: HeightReference.CLAMP_TO_GROUND, verticalOrigin: VerticalOrigin.CENTER, scale: 0.55, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: name ? { text: name, font: "600 11px Inter, system-ui, sans-serif", fillColor: Color.WHITE, outlineColor: Color.BLACK.withAlpha(0.7), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.TOP, pixelOffset: { x: 0, y: 14 } as never, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY, distanceDisplayCondition: { near: 0, far: 30_000 } as never } : undefined,
  }));
}
const km = (lon1: number, lat1: number, lon2: number, lat2: number) => {
  const r = Math.PI / 180, a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};
const fmtKm = (d: number) => (d < 1 ? `${Math.round(d * 1000 / 10) * 10} m` : `${d.toFixed(d < 10 ? 1 : 0)} km`);
const card = (title: string, emoji: string, ...kids: (Node | string)[]) => h("section", { class: "cl-block" }, h("h3", {}, h("span", {}, emoji), title), ...kids);
const pending = (text: string) => h("p", { class: "cl-wait" }, h("span", { class: "spinner small" }), text);

async function species(ctx: Ctx, b: Extract<Block, { type: "species" }>, el: HTMLElement) {
  const g = SPECIES_GROUPS[b.group] ?? SPECIES_GROUPS.all;
  const r = Math.max(ctx.def.radiusKm, 1), days = b.days ?? 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const area = `lat=${ctx.s.lat.toFixed(4)}&lng=${ctx.s.lon.toFixed(4)}&radius=${r}${g.query ? `&${g.query}` : ""}&quality_grade=research`;
  type Count = { count: number; taxon: { id: number; name: string; preferred_common_name?: string; default_photo?: { square_url?: string } } };
  let recent = true;
  let res = await getJson<{ total_results: number; results: Count[] }>("iNaturalist", `https://api.inaturalist.org/v1/observations/species_counts?${area}&d1=${since}&per_page=12`);
  if (!res.results?.length) { recent = false; res = await getJson("iNaturalist", `https://api.inaturalist.org/v1/observations/species_counts?${area}&per_page=12`); }
  const list = res.results ?? [];
  if (!list.length) { el.replaceChildren(h("p", { class: "cl-none" }, `No ${g.label.toLowerCase()} recorded within ${r} km yet. You could be the first: iNaturalist takes a photo and does the rest.`)); ctx.verdicts.push({ score: 0.3, why: `Few ${g.label.toLowerCase()} recorded here` }); ctx.paintVerdict(); return; }
  el.replaceChildren(
    h("p", { class: "cl-sub" }, recent ? `${res.total_results} kinds seen within ${r} km in the last ${days} days. The most seen:` : `Nothing logged in the last ${days} days. Seen here over the years:`),
    h("div", { class: "cl-species" }, ...list.map((c) => h("a", { class: "cl-sp", href: `https://www.inaturalist.org/taxa/${c.taxon.id}`, target: "_blank", rel: "noopener" },
      c.taxon.default_photo?.square_url ? h("img", { src: c.taxon.default_photo.square_url, alt: "", loading: "lazy" }) : h("span", { class: "cl-sp-ph" }, g.emoji),
      h("strong", {}, c.taxon.preferred_common_name ? c.taxon.preferred_common_name.replace(/^\w/, (x) => x.toUpperCase()) : c.taxon.name),
      h("small", {}, `${c.count}×`)))));
  ctx.verdicts.push(recent && res.total_results >= 15 ? { score: 1, why: `${res.total_results} kinds of ${g.label.toLowerCase()} seen lately` } : recent ? { score: 0.7, why: `${res.total_results} kinds of ${g.label.toLowerCase()} seen lately` } : { score: 0.4, why: `Quiet lately for ${g.label.toLowerCase()}` });
  ctx.paintVerdict();
  // Where they were seen, as dots on the map.
  void getJson<{ results: { geojson?: { coordinates: [number, number] }; taxon?: { preferred_common_name?: string } }[] }>("iNaturalist", `https://api.inaturalist.org/v1/observations?${area}${recent ? `&d1=${since}` : ""}&geo=true&per_page=60&order_by=observed_on`)
    .then((o) => { for (const x of o.results ?? []) if (x.geojson) pin(ctx, x.geojson.coordinates[0], x.geojson.coordinates[1], g.emoji); ctx.app.globe.viewer.scene.requestRender(); })
    .catch(() => {});
}

async function places(ctx: Ctx, b: Extract<Block, { type: "places" }>, el: HTMLElement) {
  const r = (b.radiusKm ?? ctx.def.radiusKm) * 1000;
  const parts = b.tags.map((t) => { const [k, v] = t.split("="); return `nwr(around:${Math.round(r)},${ctx.s.lat},${ctx.s.lon})[${JSON.stringify(k)}${v ? `=${JSON.stringify(v)}` : ""}]`; });
  const els = await overpass(`[out:json][timeout:25];(${parts.join(";")};);out center 80;`);
  const items = els.flatMap((e) => { const p = elementPoint(e); return p ? [{ name: e.tags?.name, lon: p[0], lat: p[1], d: km(ctx.s.lon, ctx.s.lat, p[0], p[1]) }] : []; }).sort((a, b2) => a.d - b2.d);
  const named = items.filter((i) => i.name);
  for (const i of items.slice(0, 60)) pin(ctx, i.lon, i.lat, b.emoji ?? "📍", i.name);
  ctx.app.globe.viewer.scene.requestRender();
  if (!items.length) { el.replaceChildren(h("p", { class: "cl-none" }, `None mapped within ${fmtKm(r / 1000)} on OpenStreetMap.`)); return; }
  el.replaceChildren(
    h("p", { class: "cl-sub" }, `${items.length} within ${fmtKm(r / 1000)}${items.length > named.length ? ` (${named.length} with names)` : ""}, shown on the map.`),
    h("div", { class: "cl-list" }, ...(named.length ? named : items).slice(0, 8).map((i) => h("button", { class: "cl-item", onclick: () => ctx.app.globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(i.lon, i.lat, 900), duration: 1.4 }) },
      h("span", {}, b.emoji ?? "📍"), h("strong", {}, i.name ?? "Unnamed"), h("small", {}, fmtKm(i.d))))));
}

async function weather(ctx: Ctx, b: Extract<Block, { type: "weather" }>, el: HTMLElement) {
  const w = await hourlyAt(ctx.s.lon, ctx.s.lat);
  const now = Date.now();
  const start = Math.max(0, w.time.findIndex((t) => t > now - 3_600_000));
  const g = b.good ?? {};
  const want = b.when ?? "day";
  const ok = (i: number) => (g.windMax === undefined || w.wind[i] <= g.windMax) && (g.rainMax === undefined || w.rain[i] <= g.rainMax) && (g.cloudMax === undefined || w.cloud[i] <= g.cloudMax) && (g.cloudMin === undefined || w.cloud[i] >= g.cloudMin) && (g.tempMin === undefined || w.temp[i] >= g.tempMin) && (g.tempMax === undefined || w.temp[i] <= g.tempMax);
  const inWhen = (i: number) => want === "any" || (want === "day" ? w.day[i] === 1 : w.day[i] === 0);
  // The best window: the first run of good hours (at the right time of day) in the next 36.
  let best: [number, number] | null = null;
  for (let i = start, run = -1; i < Math.min(w.time.length, start + 36); i++) {
    const good = inWhen(i) && ok(i);
    if (good && run < 0) run = i;
    if ((!good || i === Math.min(w.time.length, start + 36) - 1) && run >= 0) { const end = good ? i + 1 : i; if (end - run >= 2) { best = [run, end]; break; } run = -1; }
  }
  const hours = Array.from({ length: 8 }, (_, k) => start + k * 3).filter((i) => i < w.time.length);
  const rules = [g.windMax !== undefined && `wind under ${g.windMax} km/h`, g.rainMax !== undefined && (g.rainMax === 0 ? "dry" : `under ${g.rainMax} mm of rain`), g.cloudMax !== undefined && `under ${g.cloudMax}% cloud`, g.cloudMin !== undefined && `some cloud (${g.cloudMin}%+)`, g.tempMin !== undefined && `at least ${g.tempMin}°`, g.tempMax !== undefined && `below ${g.tempMax}°`].filter(Boolean) as string[];
  const nowOk = ok(start) && inWhen(start);
  el.replaceChildren(
    h("div", { class: "cl-hours" }, ...hours.map((i) => h("div", { class: "cl-hour" + (ok(i) && inWhen(i) ? " good" : "") },
      h("small", {}, i === start ? "Now" : local(w.time[i], w.offset)),
      h("strong", {}, `${Math.round(w.temp[i])}°`),
      h("span", {}, w.rain[i] > 0.1 ? `💧${w.rain[i].toFixed(1)}` : w.cloud[i] > 70 ? "☁️" : w.day[i] ? (w.cloud[i] > 30 ? "⛅" : "☀️") : (w.cloud[i] > 50 ? "☁️" : "✨")),
      h("small", {}, `${Math.round(w.wind[i])} km/h`)))),
    rules.length ? h("p", { class: "cl-sub" }, best
      ? `Best window: ${dayName(w.time[best[0]], w.offset)} ${local(w.time[best[0]], w.offset)}–${local(w.time[best[1] - 1] + 3_600_000, w.offset)} (${rules.join(", ")}).`
      : `No good window in the next day and a half (looking for ${rules.join(", ")}).`) : "");
  if (rules.length) ctx.verdicts.push(nowOk ? { score: 1, why: `The weather's right now: ${rules.join(", ")}` } : best && w.time[best[0]] - now < 12 * 3_600_000 ? { score: 0.6, why: `Better from ${local(w.time[best[0]], w.offset)}` } : { score: 0.15, why: "The weather's against it" });
  ctx.paintVerdict();
}

async function marine(ctx: Ctx, b: Extract<Block, { type: "marine" }>, el: HTMLElement) {
  const r = await getJson<{ utc_offset_seconds: number; hourly: { time: number[]; wave_height: (number | null)[]; wave_period: (number | null)[]; wave_direction: (number | null)[]; sea_surface_temperature?: (number | null)[] }; daily: { time: number[]; wave_height_max: (number | null)[] } }>("Open-Meteo",
    `https://marine-api.open-meteo.com/v1/marine?latitude=${ctx.s.lat.toFixed(3)}&longitude=${ctx.s.lon.toFixed(3)}&hourly=wave_height,wave_period,wave_direction,sea_surface_temperature&daily=wave_height_max&forecast_days=4&timeformat=unixtime&timezone=auto`);
  const i = Math.max(0, r.hourly.time.findIndex((t) => t * 1000 > Date.now() - 3_600_000));
  const hgt = r.hourly.wave_height[i], per = r.hourly.wave_period[i], dir = r.hourly.wave_direction[i], sst = r.hourly.sea_surface_temperature?.[i];
  if (hgt == null) { el.replaceChildren(h("p", { class: "cl-none" }, "No sea forecast here. Try a spot right on the coast.")); return; }
  const g = { waveMin: 0.6, waveMax: 2.5, periodMin: 9, ...Object.fromEntries(Object.entries(b.good ?? {}).filter(([, v]) => v !== undefined)) };
  const good = hgt >= g.waveMin && hgt <= g.waveMax && (per ?? 0) >= g.periodMin;
  const from = dir == null ? "" : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(dir / 45) % 8];
  el.replaceChildren(
    h("div", { class: "cl-stats" },
      h("div", {}, h("strong", {}, `${hgt.toFixed(1)} m`), h("small", {}, "waves now")),
      h("div", {}, h("strong", {}, per ? `${Math.round(per)} s` : "—"), h("small", {}, "period")),
      h("div", {}, h("strong", {}, from ? `from ${from}` : "—"), h("small", {}, "swell")),
      sst != null ? h("div", {}, h("strong", {}, `${Math.round(sst)}°`), h("small", {}, "sea")) : ""),
    h("div", { class: "cl-days" }, ...r.daily.time.map((t, k) => { const m = r.daily.wave_height_max[k]; return h("div", {}, h("small", {}, k === 0 ? "Today" : dayName(t * 1000, 0)), h("i", { style: `height:${Math.min(100, ((m ?? 0) / 4) * 100)}%` }), h("strong", {}, m == null ? "—" : `${m.toFixed(1)} m`)); })),
    h("p", { class: "cl-sub" }, per && per >= 12 ? "A long period: ground swell from a distant storm, the clean kind." : per && per < 8 ? "A short period: local wind chop, usually messy." : "A middling period: rideable, with some texture."));
  ctx.verdicts.push(good ? { score: 1, why: `${hgt.toFixed(1)} m at ${Math.round(per ?? 0)} s` } : { score: hgt < g.waveMin ? 0.2 : 0.35, why: hgt < g.waveMin ? "Too small right now" : hgt > g.waveMax ? "Too big for most people" : "Short, choppy waves" });
  ctx.paintVerdict();
}

async function sky(ctx: Ctx, el: HTMLElement) {
  const now = Date.now();
  const dark = darkness(now, ctx.s.lat, ctx.s.lon);
  const m = moon(dark?.from ?? now);
  const w = await hourlyAt(ctx.s.lon, ctx.s.lat).catch(() => null);
  let cloud: number | null = null;
  if (w && dark) {
    const hrs = w.time.map((t, i) => [t, i] as const).filter(([t]) => t >= dark.from - 1_800_000 && t <= dark.to);
    if (hrs.length) cloud = hrs.reduce((a, [, i]) => a + w.cloud[i], 0) / hrs.length;
  }
  const off = w?.offset ?? Math.round(ctx.s.lon / 15) * 3600;
  el.replaceChildren(
    h("div", { class: "cl-stats" },
      h("div", {}, h("strong", {}, dark ? `${local(dark.from, off)}–${local(dark.to, off)}` : "Never"), h("small", {}, dark ? "fully dark" : "fully dark tonight")),
      h("div", {}, h("strong", {}, `${m.emoji} ${Math.round(m.lit * 100)}%`), h("small", {}, m.name.toLowerCase())),
      h("div", {}, h("strong", {}, cloud === null ? "—" : `${Math.round(cloud)}%`), h("small", {}, "cloud in the dark"))),
    h("p", { class: "cl-sub" }, !dark ? "The sun doesn't sink far enough below the horizon tonight for a truly dark sky (it happens near midsummer at high latitudes)."
      : m.lit > 0.6 ? "A bright moon washes out faint stars and the Milky Way. Planets and the moon itself are the show tonight."
        : "A dark moon: the best nights for the Milky Way and faint galaxies."));
  const score = !dark ? 0.15 : (cloud ?? 50) > 60 ? 0.1 : (cloud ?? 50) > 30 ? 0.45 : m.lit > 0.6 ? 0.55 : 1;
  ctx.verdicts.push({ score, why: !dark ? "No full darkness tonight" : (cloud ?? 0) > 60 ? "Cloudy after dark" : m.lit > 0.6 ? "Bright moon" : `Dark and ${cloud !== null && cloud < 30 ? "clear" : "mostly clear"}` });
  ctx.paintVerdict();
}

async function sun(ctx: Ctx, el: HTMLElement) {
  const w = await hourlyAt(ctx.s.lon, ctx.s.lat).catch(() => null);
  const off = w?.offset ?? Math.round(ctx.s.lon / 15) * 3600;
  const now = Date.now();
  // Scan ahead: next sunrise, sunset and golden hours (sun between −4° and 6°).
  const ev: { t: number; what: string }[] = [];
  let prev = sunPosition(now, ctx.s.lat, ctx.s.lon).alt, goldFrom: number | null = prev > -4 && prev < 6 ? now : null;
  for (let m = 2; m <= 36 * 60 && ev.length < 6; m += 2) {
    const t = now + m * 60_000, a = sunPosition(t, ctx.s.lat, ctx.s.lon).alt;
    if (prev < -0.833 && a >= -0.833) ev.push({ t, what: "Sunrise" });
    if (prev >= -0.833 && a < -0.833) ev.push({ t, what: "Sunset" });
    const g = a > -4 && a < 6;
    if (g && goldFrom === null) goldFrom = t;
    if (!g && goldFrom !== null) { ev.push({ t: goldFrom, what: `Golden hour until ${local(t, off)}` }); goldFrom = null; }
    prev = a;
  }
  ev.sort((a, b) => a.t - b.t);
  const nextGold = ev.find((e) => e.what.startsWith("Golden"));
  const inGold = nextGold && nextGold.t <= now + 60_000;
  el.replaceChildren(h("div", { class: "cl-list" }, ...ev.slice(0, 5).map((e) => h("div", { class: "cl-item static" }, h("span", {}, e.what.startsWith("Golden") ? "✨" : e.what === "Sunrise" ? "🌅" : "🌇"), h("strong", {}, e.what), h("small", {}, `${dayName(e.t, off)} ${local(e.t, off)}`)))));
  if (nextGold) {
    const mins = Math.round((nextGold.t - now) / 60_000);
    ctx.verdicts.push(inGold ? { score: 1, why: "It's golden hour now" } : { score: mins < 120 ? 0.7 : 0.4, why: `Golden hour in ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}` });
    ctx.paintVerdict();
  }
}

async function aurora(ctx: Ctx, el: HTMLElement) {
  const kp = await latestKp();
  const mlat = Math.abs(magneticLatitude(ctx.s.lat, ctx.s.lon));
  // Roughly: the oval sits near 67° magnetic latitude when quiet and moves ~2° towards the equator per Kp step.
  const need = mlat >= 62 && mlat <= 76 ? 1 : mlat > 76 ? 2 : Math.max(3, Math.min(9, Math.ceil((66.5 - mlat) / 2)));
  const now = kp ? Math.round(kp.kp * 10) / 10 : null;
  const dark = darkness(Date.now(), ctx.s.lat, ctx.s.lon);
  el.replaceChildren(
    h("div", { class: "cl-stats" },
      h("div", {}, h("strong", {}, now === null ? "—" : `Kp ${now}`), h("small", {}, "activity now")),
      h("div", {}, h("strong", {}, need >= 9 ? "Kp 9" : `Kp ${need}+`), h("small", {}, "to reach here")),
      h("div", {}, h("strong", {}, `${mlat.toFixed(0)}°`), h("small", {}, "magnetic latitude"))),
    h("p", { class: "cl-sub" }, mlat < 40 ? "Too far from the magnetic poles: only the rarest, greatest storms (like May 2024's) bring the aurora this far."
      : now !== null && now >= need ? "Activity is high enough to reach here right now. Look towards the pole, away from city lights."
        : "Not enough activity to reach here right now. Storms can build within hours of a solar eruption."));
  const up = now !== null && now >= need;
  ctx.verdicts.push(mlat < 40 ? { score: 0.05, why: "Too far from the poles" } : up ? { score: dark ? 1 : 0.5, why: dark ? `Kp ${now} is enough here, and it's dark` : `Kp ${now} is enough here; wait for dark` } : { score: now !== null && now >= need - 1 ? 0.35 : 0.1, why: now === null ? "Activity unknown" : `Kp ${now}; needs ${need}+ here` });
  ctx.paintVerdict();
}

// ---- The lens ---------------------------------------------------------------------------------------

export function customLens(def: LensDef): Lens {
  return {
    id: def.id, label: def.name, icon: def.icon, blurb: def.blurb,
    score: (s) => (def.for?.length ? (def.for.includes(s.kind) ? 0.62 : 0.12) : 0.45),
    open: (host, s) => { void renderLens(host, s, def); },
  };
}

export interface Judgement { score: number; label: string; face: string; why: string[]; at: number }
const JUDGED = ["weather", "marine", "sky", "species", "sun", "aurora"];
const judge = (vs: Verdict[]): Omit<Judgement, "at"> | null => {
  if (!vs.length) return null;
  const score = vs.reduce((a, v) => a + v.score, 0) / vs.length, worst = Math.min(...vs.map((v) => v.score));
  const final = worst < 0.2 ? Math.min(score, 0.3) : score;
  const [label, face] = final >= 0.75 ? ["Good time for it", "✅"] : final >= 0.45 ? ["Worth a go", "🤞"] : ["Not today", "💤"];
  return { score: final, label, face, why: vs.map((v) => v.why) };
};
/** Whether a lens gives a verdict at all (some are only a view of a place). */
export const lensJudges = (def: LensDef) => def.blocks.some((b) => JUDGED.includes(b.type) && (b.type !== "weather" || (!!b.good && Object.values(b.good).some((v) => v !== undefined))));

/** The verdict alone, without showing anything (for watches). */
export async function judgeLens(app: App, s: Subject, def: LensDef): Promise<Judgement | null> {
  const host: LensHost = { app, body: document.createElement("div"), title: () => {}, onClose: () => {}, close: () => {} };
  const v = await renderLens(host, s, def, { headless: true });
  return v ? { ...v, at: Date.now() } : null;
}

export function renderLens(host: LensHost, s: Subject, def: LensDef, opts: { author?: HTMLElement; headless?: boolean } = {}): Promise<Omit<Judgement, "at"> | null> {
  const ctx: Ctx = { app: host.app, s, def, pins: [], verdicts: [], paintVerdict: () => {}, headless: opts.headless };
  host.onClose(() => { ctx.closed = true; for (const e of ctx.pins) host.app.globe.viewer.entities.remove(e); host.app.globe.viewer.scene.requestRender(); });
  const verdict = h("div", { class: "cl-verdict wait", style: `--lc:${def.color}` }, h("span", { class: "spinner small" }), h("span", {}, `Reading ${s.name} for ${def.name.toLowerCase()}…`));
  const judged = lensJudges(def);
  let settled = 0;
  const total = def.blocks.filter((b) => JUDGED.includes(b.type)).length;
  const watchBtn = h("button", { class: "cl-watch", title: "Terreno checks for you and tells you when it's a good time here", onclick: () => host.app.actions.get("watch:add")?.run(JSON.stringify({ lens: def.id, subject: s })) }, "🔔 Tell me when");
  ctx.paintVerdict = () => {
    const j = judge(ctx.verdicts);
    if (!j) return;
    verdict.className = `cl-verdict ${j.score >= 0.75 ? "good" : j.score >= 0.45 ? "fair" : "poor"}`;
    verdict.replaceChildren(h("span", { class: "cl-face" }, j.face), h("span", {}, h("strong", {}, `${j.label}${settled < total ? "…" : ""}`), h("small", {}, j.why.join(" · "))), watchBtn);
  };
  const body: HTMLElement[] = [];
  const runs: Promise<unknown>[] = [];
  for (const b of def.blocks) {
    const info = BLOCK_INFO[b.type];
    const slot = h("div", {}, pending("Reading…"));
    const title = b.type === "species" ? b.title ?? `${SPECIES_GROUPS[b.group]?.label ?? "Wildlife"} seen here` : b.type === "places" ? b.title : b.type === "weather" ? b.title ?? info.label : info.label;
    const emoji = b.type === "species" ? SPECIES_GROUPS[b.group]?.emoji ?? info.emoji : b.type === "places" ? b.emoji ?? info.emoji : info.emoji;
    if (b.type === "tip") { body.push(h("section", { class: "cl-tip" }, opts.author ?? h("span", { class: "cl-tip-q" }, "“"), h("p", {}, b.text))); continue; }
    if (b.type === "ground") { body.push(card(info.label, info.emoji, h("div", { class: "cl-stats" }, h("div", {}, h("strong", {}, `${Math.round(s.elevation).toLocaleString()} m`), h("small", {}, s.elevation < 0 ? "below sea level" : "above sea level")), h("div", {}, h("strong", {}, `${Math.round(s.relief).toLocaleString()} m`), h("small", {}, "from lowest to highest nearby"))))); continue; }
    // Watches only need the blocks that judge.
    if (opts.headless && (!JUDGED.includes(b.type) || b.type === "sun" && def.blocks.some((x) => x.type === "weather"))) continue;
    body.push(card(title, emoji, slot));
    const run = b.type === "species" ? species(ctx, b, slot) : b.type === "places" ? places(ctx, b, slot) : b.type === "weather" ? weather(ctx, b, slot) : b.type === "marine" ? marine(ctx, b, slot) : b.type === "sky" ? sky(ctx, slot) : b.type === "aurora" ? aurora(ctx, slot) : sun(ctx, slot);
    runs.push(run.catch((e) => slot.replaceChildren(h("p", { class: "cl-none" }, `Couldn't read this just now (${(e as Error).message}).`)))
      .finally(() => { if (JUDGED.includes(b.type)) { settled++; ctx.paintVerdict(); } }));
  }
  if (!opts.headless) {
    host.title(def.name, s.name);
    host.body.replaceChildren(...(judged ? [verdict] : []), ...body, h("p", { class: "fineprint" }, `A lens${def.author ? ` by @${def.author}` : ""} made in Lens Studio. Sightings: iNaturalist. Places: OpenStreetMap. Weather and sea: Open-Meteo. Aurora: NOAA SWPC.`));
  }
  return Promise.all(runs).then(() => (judged ? judge(ctx.verdicts) : null));
}
