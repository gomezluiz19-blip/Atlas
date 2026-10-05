// "About this place": what Terreno can tell you about the ground you're on,
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
import { sowingTasks, upcoming, type SowTask } from "./calendar";
import type { MyPlace } from "./store";

const made = new Map<string, HTMLElement>();

function row(label: string, value: Node | string, sub?: string): HTMLElement {
  return h("div", { class: "report-row" }, h("span", { class: "report-label" }, label), h("span", { class: "report-value" }, value, sub ? h("small", {}, sub) : ""));
}

/** What to sow and plant out in the next six weeks, from this place's frost dates, and the whole year on request. */
function sowingView(lastSpring: number | null, firstAutumn: number | null): HTMLElement | string {
  const tasks = sowingTasks(lastSpring, firstAutumn);
  if (!tasks.length) return "";
  const now = new Date(), today = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 1)) / 86_400_000) + 1;
  const soon = upcoming(tasks, today, 6);
  const line = (t: SowTask, when: string) => h("div", { class: "sow-row" }, h("span", {}, t.emoji), h("span", {}, h("strong", {}, t.crop), h("small", {}, `${t.what} · ${when}${t.note ? ` · ${t.note}` : ""}`)));
  const all = h("div", { class: "sow-all", hidden: true }, ...[...tasks].sort((a, b) => a.from - b.from).map((t) => line(t, `${dayLabel(t.from)} – ${dayLabel(t.to)}`)));
  return h("section", { class: "sowing" },
    h("h3", { class: "lens-sub" }, "Sowing and planting, from your frost dates"),
    soon.length ? h("div", {}, ...soon.map((t) => line(t, t.now ? `now, until ${dayLabel(t.to)}` : `in ${t.inDays} days (${dayLabel(t.from)} – ${dayLabel(t.to)})`))) : h("p", { class: "muted small" }, "Nothing to sow in the next six weeks."),
    h("button", { class: "link-btn", onclick: (e: Event) => { all.hidden = !all.hidden; (e.currentTarget as HTMLElement).textContent = all.hidden ? "The whole year" : "Hide the year"; } }, "The whole year"),
    all,
    h("p", { class: "muted small" }, "Rules of thumb, in weeks from your average last frost; a cold spring or a sheltered spot shifts them."));
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A clean one-page version of the report to print or save as a PDF, with a link back to Terreno. */
function printReport(p: MyPlace, el: HTMLElement) {
  const rows = [...el.querySelectorAll(".report-row")].map((r) => {
    const label = r.querySelector(".report-label")?.textContent ?? "", value = r.querySelector(".report-value");
    const main = value?.firstChild?.textContent ?? "", sub = value?.querySelector("small")?.textContent ?? "";
    return `<tr><th>${esc(label)}</th><td><b>${esc(main)}</b>${sub ? `<br><span>${esc(sub)}</span>` : ""}</td></tr>`;
  }).join("");
  const sow = [...el.querySelectorAll(".sowing > div:first-of-type .sow-row")].map((r) => `<li><b>${esc(r.querySelector("strong")?.textContent ?? "")}</b>: ${esc(r.querySelector("small")?.textContent ?? "")}</li>`).join("");
  const link = `${location.origin}${location.pathname}`;
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups for Terreno to print the report."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.name)} · About this place</title><style>
body{font:14px/1.45 -apple-system,system-ui,sans-serif;color:#1d1d1f;max-width:720px;margin:32px auto;padding:0 20px}
h1{font-size:26px;margin:0}p.sub{color:#6e6e73;margin:4px 0 20px}table{width:100%;border-collapse:collapse}
th{text-align:left;color:#6e6e73;font-weight:500;width:150px;vertical-align:top;padding:9px 0;border-bottom:1px solid #e5e5ea}
td{padding:9px 0;border-bottom:1px solid #e5e5ea}td span{color:#6e6e73;font-size:13px}h2{font-size:17px;margin:24px 0 6px}
ul{padding-left:18px}li{margin:3px 0}footer{margin-top:28px;color:#6e6e73;font-size:12px}a{color:#2f58c8}
@media print{body{margin:0}a{color:inherit}}</style></head><body>
<h1>${esc(p.name)}</h1><p class="sub">${esc([p.address, `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`, new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })].filter(Boolean).join(" · "))}</p>
<table>${rows}</table>${sow ? `<h2>Sowing and planting in the next six weeks</h2><ul>${sow}</ul>` : ""}
<footer>Made with Terreno: <a href="${esc(link)}">${esc(link)}</a>. Weather: ERA5 via Open-Meteo (CC BY 4.0). Geology: Macrostrat (CC BY 4.0). Terrain: Terrain Tiles on AWS. Estimates, not a survey.</footer>
<script>setTimeout(()=>print(),400)</script></body></html>`);
  w.document.close();
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
  const sowing = h("div", {});
  const go = (action: string) => () => { app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: "My place" }); setTimeout(() => app.actions.get(action)?.run(), 300); };
  const el = h("section", { class: "group report" },
    h("h2", { class: "group-title" }, "About this place"),
    h("div", { class: "report-rows" }, ground, rock, season, water),
    sowing,
    h("div", { class: "chips wrap" },
      h("button", { class: "chip", onclick: go("lens:trace") }, "〰️ Where the rain goes"),
      h("button", { class: "chip", onclick: go("lens:slice") }, "🔪 Slice the ground"),
      h("button", { class: "chip", onclick: go("lens:rewind") }, "⏪ Then and now"),
      h("button", { class: "chip", onclick: go("lens:block") }, "🧊 Lift it out in 3D")),
    h("p", { class: "muted small" }, "Weather from ten years of ERA5 records; rock from Macrostrat's geologic maps; heights from the global terrain model."),
    h("button", { class: "pill-btn", onclick: () => printReport(p, el) }, "Print or save as PDF"));
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
    sowing.replaceChildren(sowingView(f.lastSpring, f.firstAutumn));
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
