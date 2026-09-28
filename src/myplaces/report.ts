// "About this place": what Atlas can tell you about the ground you're on,
// the moment you save it. The slope and the way it faces, the rock below,
// frost dates and the growing season, rain, and the nearest river.
import type { App } from "../app";
import { climateDays } from "../data/openmeteo";
import { elevation } from "../data/elevation";
import { fetchMapUnit, formatAge } from "../data/macrostrat";
import { riversIn } from "../data/worldData";
import { haversine } from "../data/mercator";
import { h } from "../ui/dom";
import { dayLabel, frostSeason, slopeAspect, yearly } from "./reportModel";
import type { MyPlace } from "./store";

const made = new Map<string, HTMLElement>();

function row(label: string, value: Node | string, sub?: string): HTMLElement {
  return h("div", { class: "report-row" }, h("span", { class: "report-label" }, label), h("span", { class: "report-value" }, value, sub ? h("small", {}, sub) : ""));
}

/** The report for a saved place (built once per place, then reused). */
export function placeReport(app: App, p: MyPlace): HTMLElement {
  const key = `${p.id}:${p.lon.toFixed(5)},${p.lat.toFixed(5)}`;
  const had = made.get(key);
  if (had) return had;
  const ground = h("div", {}, row("Ground", "…"));
  const rock = h("div", {}, row("Rock below", "…"));
  const season = h("div", {}, row("Frost", "…"));
  const water = h("div", {}, row("Nearest river", "…"));
  const go = (action: string) => () => { app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: "My place" }); setTimeout(() => app.actions.get(action)?.run(), 300); };
  const el = h("section", { class: "group report" },
    h("h2", { class: "group-title" }, "About this place"),
    h("div", { class: "report-rows" }, ground, rock, season, water),
    h("div", { class: "chips wrap" },
      h("button", { class: "chip", onclick: go("lens:trace") }, "〰️ Where the rain goes"),
      h("button", { class: "chip", onclick: go("lens:slice") }, "🔪 Slice the ground"),
      h("button", { class: "chip", onclick: go("lens:rewind") }, "⏪ Then and now"),
      h("button", { class: "chip", onclick: go("lens:block") }, "🧊 Lift it out in 3D")),
    h("p", { class: "muted small" }, "Weather from ten years of ERA5 records; rock from Macrostrat's geologic maps; heights from the global terrain model."));
  made.set(key, el);

  // Ground: slope and aspect from a 3×3 grid, 30 m apart.
  const cell = 30, dLat = cell / 110_540, dLon = cell / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  const pts: [number, number][] = [];
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) pts.push([p.lon + i * dLon, p.lat - j * dLat]);
  void elevation.sample(pts, 14).then((z) => {
    const { slope, faces } = slopeAspect(z, cell);
    const lean = faces === "flat" ? "flat ground" : `${slope < 5 ? "gentle" : slope < 15 ? "moderate" : "steep"} slope facing ${faces}`;
    const sun = faces === "flat" || slope < 5 ? "" : (p.lat >= 0 ? /south/.test(faces) : /north/.test(faces)) ? "sunny side" : (p.lat >= 0 ? /north/.test(faces) : /south/.test(faces)) ? "shady side" : "";
    ground.replaceChildren(row("Ground", `${Math.round(z[4]).toLocaleString()} m above sea level`, `${lean[0].toUpperCase()}${lean.slice(1)} (${slope.toFixed(0)}°)${sun ? `, the ${sun}` : ""}`));
  }).catch(() => ground.replaceChildren(row("Ground", "Couldn't load the terrain")));

  void fetchMapUnit(p.lon, p.lat).then(({ unit }) => {
    if (!unit) { rock.replaceChildren(row("Rock below", "Not on the geologic maps here")); return; }
    const age = unit.b_age !== undefined ? formatAge(unit.t_age !== undefined ? (unit.b_age + unit.t_age) / 2 : unit.b_age) : "";
    rock.replaceChildren(row("Rock below", unit.name || unit.strat_name || "Mapped unit", [unit.lith?.split(/[,;]/).slice(0, 2).join(", "), age ? `about ${age} old` : ""].filter(Boolean).join(" · ")));
  }).catch(() => rock.replaceChildren(row("Rock below", "Couldn't reach the geologic map")));

  void climateDays(p.lon, p.lat).then((days) => {
    const f = frostSeason(days, p.lat), y = yearly(days);
    const frost = f.lastSpring === null && f.firstAutumn === null
      ? row("Frost", f.frostDays ? "Rare" : "None in ten years", "Tender plants can grow all year")
      : row("Frost", `Last in spring about ${f.lastSpring !== null ? dayLabel(f.lastSpring) : "—"}; first in autumn about ${f.firstAutumn !== null ? dayLabel(f.firstAutumn) : "—"}`, `About ${f.freeDays} frost-free days a year · ${f.frostDays} frosty nights`);
    season.replaceChildren(frost,
      row("Growing heat", `${y.gdd.toLocaleString()} degree days a year (base 10 °C)`, y.gdd >= 2500 ? "Enough for maize, cotton and warm-season crops" : y.gdd >= 1400 ? "Suits maize, beans and most vegetables" : y.gdd >= 800 ? "Cool: suits wheat, barley, potatoes and brassicas" : "Short and cool: hardy crops and grass"),
      row("Rain", `${y.rain.toLocaleString()} mm a year`, y.hotDays ? `${y.hotDays} days a year above 30 °C` : undefined));
  }).catch(() => season.replaceChildren(row("Climate", "Couldn't reach the weather records")));

  void riversIn(p.lon - 0.6, p.lat - 0.4, p.lon + 0.6, p.lat + 0.4, 4).then((lines) => {
    let best = "", d = Infinity;
    for (const l of lines) for (let i = 0; i < l.pts.length; i += 2) {
      const k = haversine(p.lon, p.lat, l.pts[i], l.pts[i + 1]);
      if (k < d) { d = k; best = l.name; }
    }
    water.replaceChildren(best ? row("Nearest river", best, `${d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`} away (main rivers only)`) : row("Nearest river", "None of the main rivers within about 40 km"));
  }).catch(() => water.replaceChildren(row("Nearest river", "—")));
  return el;
}
