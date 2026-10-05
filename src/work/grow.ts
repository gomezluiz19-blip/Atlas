// Work › Grow: fields drawn on the satellite map, each with its crop and
// planting date. Terreno follows the season from the weather there: heat units
// (growing degree days) and the growth stage, when the harvest should come,
// how much water the crop is using against the rain, how much to irrigate this
// week, and frost or heat ahead. Plant health from space (NDVI) as a layer.
import { ImageryLayer, UrlTemplateImageryProvider } from "cesium";
import type { App } from "../app";
import { farmWeather } from "../data/openmeteo";
import { inlineChart, stats } from "../themes/common";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { drawOnMap } from "./draw";
import { areaM2, fmtArea, pathLength, type LonLat } from "./geo";
import type { WorkCtx } from "./hub";
import { WorkLayer } from "./layer";
import { CROP_GROUPS, CROPS, cropById, litres, mergeDays, season, type Season } from "./growModel";
import { ListStore, download, newId } from "./store";
import { parseFieldLog, type FieldLogEntry } from "./growLog";
import { watchFor, type Watch } from "./cropWatch";
import { seasonPlan, type Planting } from "./planWords";

interface Field {
  id: string;
  name: string;
  crop: string;
  /** Planting (or, for coffee and cacao, flowering) date, YYYY-MM-DD. */
  planted: string;
  pts: LonLat[];
  diary: { date: string; text: string }[];
  /** What follows in this field, in order ("then cabbages, then winter wheat"). */
  next?: Planting[];
}

/** When the next crop's planting day comes, it becomes the field's crop (and the diary says so). */
function rollOn(f: Field): boolean {
  let moved = false;
  while (f.next?.length && f.next[0].planted <= today()) {
    const n = f.next.shift()!;
    f.diary.unshift({ date: n.planted, text: `${cropById(f.crop).label} done; ${cropById(n.crop).label.toLowerCase()} planted` });
    f.crop = n.crop; f.planted = n.planted;
    moved = true;
  }
  return moved;
}

/** The field's year: the crop in the ground and what follows, on one strip. */
function yearStrip(f: Field, onChange: () => void): HTMLElement {
  const items = [{ crop: f.crop, planted: f.planted, now: true }, ...(f.next ?? []).map((x) => ({ ...x, now: false }))];
  const from = Date.parse(items[0].planted.slice(0, 7) + "-01"), ends = items.map((x) => Date.parse(x.planted) + cropById(x.crop).days * 86_400_000);
  const to = Math.max(from + 365 * 86_400_000, ...ends) + 20 * 86_400_000, span = to - from;
  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - from) / span) * 100)).toFixed(2)}%`;
  const months: HTMLElement[] = [];
  for (let d = new Date(from); d.getTime() < to; d.setUTCMonth(d.getUTCMonth() + 1))
    months.push(h("span", { style: `left:${pct(d.getTime())}` }, d.toLocaleDateString(undefined, { month: "narrow" })));
  const input = h("input", { class: "pro-url", placeholder: "Then: cabbages after harvest, winter wheat 15 October", "aria-label": "What comes next in this field" }) as HTMLInputElement;
  const add = () => {
    const last = items[items.length - 1];
    const plan = seasonPlan(input.value, today(), new Date(Date.parse(last.planted) + cropById(last.crop).days * 86_400_000).toISOString().slice(0, 10));
    if (!plan.length) { input.setCustomValidity("Name a crop: “cabbages after harvest”, “winter wheat 15 October”."); input.reportValidity(); return; }
    f.next = [...(f.next ?? []), ...plan];
    onChange();
  };
  input.addEventListener("keydown", (e) => { input.setCustomValidity(""); if (e.key === "Enter") add(); });
  return h("section", { class: "group" }, h("h2", { class: "group-title" }, "The field's year"),
    h("div", { class: "year-strip" },
      h("div", { class: "year-months" }, ...months),
      ...items.map((x, i) => {
        const c = cropById(x.crop), start = Date.parse(x.planted), end = start + c.days * 86_400_000;
        return h("div", { class: `year-bar${x.now ? " now" : ""}`, style: `left:${pct(start)};width:calc(${pct(end)} - ${pct(start)});--c:${CROP_COLOR[c.id] ?? "#5b9467"}`, title: `${c.label}: ${fmtDate(x.planted)} to about ${fmtDate(new Date(end).toISOString().slice(0, 10))}` },
          h("span", {}, c.label.replace(/\s*\(.*\)/, "")),
          i ? h("button", { class: "year-x", "aria-label": `Remove ${c.label}`, onclick: () => { f.next!.splice(i - 1, 1); onChange(); } }, "✕") : "");
      }),
      h("i", { class: "year-today", style: `left:${pct(Date.now())}` })),
    h("div", { class: "pro-url-row" }, input, h("button", { class: "pill-btn", onclick: add }, "Add")),
    h("p", { class: "muted small" }, "Harvest ends are typical season lengths; the season above uses this year's warmth. When a next crop's day comes, it becomes the field's crop."));
}

const store = new ListStore<Field>("atlas.work.fields.v1");
let layer: WorkLayer | null = null;
const CROP_COLOR: Record<string, string> = { maize: "#e1b843", rice: "#4c9ac9", wheat: "#c9a256", beans: "#d19a2e", soybean: "#a8e05f", tomato: "#c4513a", potato: "#bf8a5a", coffee: "#b0703c", cacao: "#8e5a3c", banana: "#5b9467", ...Object.fromEntries(CROPS.filter((c) => c.color).map((c) => [c.id, c.color!])) };
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
const n0 = (v: number) => Math.round(v).toLocaleString();

function drawFields(app: App, stages: Map<string, string> = new Map()) {
  layer ??= new WorkLayer(app, "work:grow", "Fields", "#5b9467");
  layer.set(store.all().map((f) => ({ id: f.id, kind: "area" as const, pts: f.pts, color: CROP_COLOR[f.crop] ?? "#5b9467", fill: 0.18, label: stages.get(f.id) ? `${f.name} · ${stages.get(f.id)}` : f.name })), "Fields");
}

// ---- Plant health from space ---------------------------------------------------------

let ndvi: ImageryLayer | null = null;
function setNdvi(app: App, on: boolean) {
  const viewer = app.globe.viewer;
  if (on && !ndvi) {
    ndvi = new ImageryLayer(new UrlTemplateImageryProvider({
      url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png",
      maximumLevel: 9,
      credit: "Vegetation (NDVI): NASA EOSDIS GIBS, MODIS Terra 8-day",
    }), { alpha: 0.7 });
    viewer.imageryLayers.add(ndvi);
    app.canvas.put({ id: "work:ndvi", label: "Plant health (NDVI)", color: "#5b9467", scope: "world", pinned: true, show: (v) => { if (ndvi) ndvi.show = v; }, remove: () => setNdvi(app, false) }, true);
  } else if (!on && ndvi) {
    viewer.imageryLayers.remove(ndvi, true);
    ndvi = null;
    app.canvas.drop("work:ndvi");
  }
}
/** The NDVI switch as a named action, so presentations can bring it back. */
export const ndviAction = (app: App) => ({ label: "Plant health (NDVI)", run: () => setNdvi(app, true), isOn: () => !!ndvi });

// ---- Screens -------------------------------------------------------------------------------

/** Writes one plain-words line ("sprayed Top field with glyphosate") to a field's diary; null if unclear. */
export function logFieldText(text: string): FieldLogEntry | null {
  store.reload();
  const e = parseFieldLog(text, store.all());
  if (!e) return null;
  const f = store.get(e.field.id)!;
  f.diary.unshift({ date: today(), text: e.text });
  if (e.patch) Object.assign(f, e.patch);
  store.save(f);
  return e;
}

export function openGrow(ctx: WorkCtx) {
  const { app } = ctx;
  store.reload();
  for (const f of store.all()) if (rollOn(f)) store.save(f);
  drawFields(app);
  const addField = async () => {
    ctx.hide();
    const pts = await drawOnMap(app, "area", "#5b9467", "Zoom in on the satellite view and tap around the edge of the field");
    ctx.unhide();
    if (!pts) return openGrow(ctx);
    const f: Field = { id: newId(), name: `Field ${store.all().length + 1}`, crop: "maize", planted: today(), pts, diary: [] };
    store.save(f);
    openField(ctx, f.id);
  };
  const total = store.all().reduce((s, f) => s + areaM2(f.pts), 0);
  ctx.show("Grow", ctx.home,
    h("p", { class: "mp-intro" }, "Draw your fields on the satellite map and say what's planted. Terreno follows each crop's season from the local weather: growth stage, harvest date, water use and irrigation, and frost or heat on the way."),
    h("div", { class: "chips wrap" },
      h("button", { class: "chip", onclick: () => void addField() }, "+ Draw a field"),
      h("button", { class: "chip" + (ndvi ? " on" : ""), "aria-pressed": String(!!ndvi), onclick: () => { setNdvi(app, !ndvi); openGrow(ctx); } }, ndvi ? "Plant health: on" : "Plant health from space")),
    ndvi ? h("div", { class: "grow-legend" }, h("span", {}, "Bare"), h("span", { class: "grow-ramp" }), h("span", {}, "Lush"),
      h("p", { class: "muted small" }, "NDVI from NASA's MODIS satellite, 8-day composite, about 250 m per pixel: good for a farm's big picture, not single rows.")) : "",
    store.all().length ? h("section", { class: "group" }, h("h2", { class: "group-title" }, `Your fields · ${fmtArea(total)}`),
      h("div", { class: "list" }, ...store.all().map((f) =>
        h("button", { class: "list-row", onclick: () => openField(ctx, f.id) },
          h("span", { class: "dot big", style: `background:${CROP_COLOR[f.crop] ?? "#5b9467"}` }),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, f.name), h("span", { class: "list-sub" }, `${cropById(f.crop).label} · ${fmtArea(areaM2(f.pts))} · since ${fmtDate(f.planted)}`)),
          h("span", { class: "chev", html: "&rsaquo;" }))))) : h("p", { class: "muted small" }, "No fields yet."),
  );
}

/** Pests and diseases to look out for at this stage, and next. */
function watchSection(cropId: string, stage: number, stages: number): HTMLElement | string {
  const { now, next } = watchFor(cropId, stage, stages);
  if (!now.length && !next.length) return "";
  const row = (x: Watch) => h("div", { class: "sow-row" }, h("span", {}, "🔎"), h("span", {}, h("strong", {}, x.name), h("small", {}, x.sign)));
  return h("section", { class: "group" }, h("h2", { class: "group-title" }, "Watch for"),
    ...now.map(row),
    next.length ? h("p", { class: "muted small" }, `Coming up: ${next.map((x) => x.name.toLowerCase()).join("; ")}.`) : "",
    h("p", { class: "muted small" }, "Common problems at this stage; your local adviser knows what's about this year."));
}

function seasonView(f: Field, s: Season, m2: number): (Node | string)[] {
  const crop = cropById(f.crop);
  const pct = Math.min(100, Math.round(s.f * 100));
  const ha = m2 / 1e4;
  return [
    h("div", { class: "grow-stages", style: `--c:${CROP_COLOR[f.crop] ?? "#5b9467"}` },
      h("div", { class: "grow-bar" }, h("span", { style: `width:${pct}%` })),
      h("ol", {}, ...crop.stages.map((name, i) => h("li", { class: i < s.stage.index ? "past" : i === s.stage.index ? "now" : "" }, name)))),
    stats(
      ["Stage", s.stage.name],
      ["Days since " + (crop.perennial && crop.id !== "banana" ? "flowering" : "planting"), String(s.daysSince)],
      crop.gdd ? ["Heat units so far", `${n0(s.gdd)} of ~${n0(crop.gdd[0])}–${n0(crop.gdd[1])} GDD`, `Growing degree days above ${crop.base} °C; the target is typical and varies by variety`] : null,
      s.harvest ? ["Harvest", s.harvest[0] === s.harvest[1] ? (s.harvest[0] === today() ? "Now" : fmtDate(s.harvest[0])) : `${fmtDate(s.harvest[0])} – ${fmtDate(s.harvest[1])}`, "Projected from recent and forecast temperatures"] : null,
    ),
    s.harvest && crop.gdd && Date.parse(s.harvest[0]) - Date.now() > 45 * 86_400_000 && s.f > 0.5
      ? h("p", { class: "muted small" }, "Growth is slowing as the weather cools, so this is a long projection. In cool climates crops are often harvested before the full target, or a shorter variety is used.")
      : "",
    watchSection(f.crop, s.stage.index, crop.stages.length),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Water"),
      stats(
        ["Crop used, last 7 days", `${s.used7.toFixed(0)} mm`, `Reference evapotranspiration × crop coefficient (Kc ${s.kc.toFixed(2)}, FAO-56)`],
        ["Useful rain, last 7 days", `${s.rain7.toFixed(0)} mm`, "Showers under 5 mm are counted as evaporating before they reach the roots"],
        ["Season so far", `${n0(s.used)} mm used · ${n0(s.rain)} mm rain`],
        ["Next 7 days", `${s.need7.toFixed(0)} mm needed · ${s.rainNext7.toFixed(0)} mm rain expected`],
      ),
      s.irrigate7 > 0.5
        ? h("div", { class: "grow-irrigate need" }, h("strong", {}, `Irrigate about ${s.irrigate7.toFixed(0)} mm this week.`), h("span", {}, ` That's ${n0(litres(s.irrigate7, m2))} litres for this field (${n0(s.irrigate7 * 10)} m³ per hectare), before losses in the system.`))
        : h("div", { class: "grow-irrigate" }, h("strong", {}, "No irrigation needed this week."), h("span", {}, !crop.perennial && s.f >= 0.85 ? " The crop is ripening: let it dry down." : " Rain is expected to cover what the crop uses."))),
    s.frost.length || s.heat.length
      ? h("section", { class: "group" }, h("h2", { class: "group-title" }, "Watch out"),
          ...s.frost.map((x) => h("p", { class: "pro-warn" }, `${x.tmin <= 0 ? "Frost" : "Possible frost"} ${fmtDate(x.date)}: down to ${x.tmin.toFixed(0)} °C. Cover young plants or irrigate the evening before.`)),
          ...s.heat.map((x) => h("p", { class: "pro-warn" }, `Heat ${fmtDate(x.date)}: up to ${x.tmax.toFixed(0)} °C. ${s.stage.index === 2 ? "Flowering crops are most sensitive; water early in the day." : "Water early in the day."}`)))
      : h("p", { class: "muted small" }, "No frost or extreme heat in the week ahead."),
    crop.gdd && s.curve.length > 2
      ? inlineChart({ x: s.curve.map((c) => Date.parse(c.date)), y: s.curve.map((c) => c.gdd) }, { xLabel: "Date", yLabel: "Heat units (GDD)", xFormat: (v) => new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" }), yFormat: (v) => n0(v) }, 140)
      : "",
    crop.note ? h("p", { class: "muted small" }, crop.note) : "",
    h("p", { class: "muted small" }, `${fmtArea(m2)} (${ha.toFixed(2)} ha). Weather: Open-Meteo (forecast models and ERA5). Targets and coefficients are typical values; your seed supplier's figures for the variety are better.`),
  ];
}

export function openField(ctx: WorkCtx, id: string) {
  const f = store.get(id);
  if (!f) return openGrow(ctx);
  const { app } = ctx;
  const save = () => store.save(f);
  const again = () => openField(ctx, id);
  const m2 = areaM2(f.pts);
  const lon = f.pts.reduce((s, p) => s + p[0], 0) / f.pts.length, lat = f.pts.reduce((s, p) => s + p[1], 0) / f.pts.length;
  const body = h("div", { class: "work-analysis" }, h("p", { class: "muted small" }, "Reading the season's weather…"));
  drawFields(app);
  if (rollOn(f)) save();
  const crop = cropById(f.crop);
  const diaryIn = h("input", { class: "pro-url", placeholder: "Add a note (sprayed, fertilised, rain gauge…) and press Enter", onkeydown: (e: Event) => {
    const v = (e.target as HTMLInputElement).value.trim();
    if ((e as KeyboardEvent).key === "Enter" && v) { f.diary.unshift({ date: today(), text: v }); save(); again(); }
  } });

  ctx.show("Field", () => openGrow(ctx),
    h("input", { class: "mp-name", value: f.name, "aria-label": "Field name", onchange: (e: Event) => { f.name = (e.target as HTMLInputElement).value || f.name; save(); drawFields(app); } }),
    h("label", { class: "mp-field" }, h("span", {}, "Crop"),
      h("select", { onchange: (e: Event) => { f.crop = (e.target as HTMLSelectElement).value; save(); again(); } },
        ...CROP_GROUPS.map((g) => h("optgroup", { label: g }, ...CROPS.filter((c) => c.group === g).map((c) => h("option", { value: c.id, selected: c.id === f.crop }, c.label)))))),
    h("label", { class: "mp-field" }, h("span", {}, crop.perennial && crop.id !== "banana" ? "Flowering date" : "Planting date"),
      h("input", { type: "date", value: f.planted, max: today(), onchange: (e: Event) => { const v = (e.target as HTMLInputElement).value; if (v) { f.planted = v; save(); again(); } } })),
    body,
    yearStrip(f, () => { save(); again(); }),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Field diary"),
      diaryIn,
      f.diary.length ? h("div", { class: "work-checklist" }, ...f.diary.map((d) => h("div", { class: "work-check" }, h("span", { class: "muted small" }, fmtDate(d.date)), h("span", {}, d.text)))) : ""),
    h("div", { class: "pro-actions" },
      h("button", { class: "link-btn", onclick: () => void flyToPlace(app.globe, { name: f.name, lon, lat, radius: Math.max(150, pathLength(f.pts) / 3) }) }, "Show on map"),
      h("button", { class: "link-btn", onclick: () => download(`${f.name}.geojson`, JSON.stringify({ type: "Feature", properties: { name: f.name, crop: f.crop, planted: f.planted, area_ha: +(m2 / 1e4).toFixed(3) }, geometry: { type: "Polygon", coordinates: [[...f.pts, f.pts[0]]] } }), "application/geo+json") }, "Export (GeoJSON)"),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Delete "${f.name}"?`)) { store.remove(f.id); openGrow(ctx); } } }, "Delete field")),
  );

  const planted = f.planted;
  farmWeather(lon, lat, planted)
    .then(({ recent, older }) => {
      if (store.get(id)?.planted !== planted || !body.isConnected) return;
      const s = season(crop, planted, mergeDays(older, recent), today());
      body.replaceChildren(...seasonView(f, s, m2));
      drawFields(app, new Map([[f.id, s.stage.name]]));
    })
    .catch(() => body.replaceChildren(h("p", { class: "pro-warn" }, "Couldn't reach the weather service. Check the connection and open the field again.")));
}
