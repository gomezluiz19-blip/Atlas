// Site potential: what a piece of land could make from the sun and the wind.
// Over the site, in 3D: the sun's paths on the longest day, the equinox and the
// shortest day arch across the sky (with today's sun travelling along its own),
// and a wind rose rises from the ground, a petal per direction, taller for the
// winds that blow most and coloured by how hard. Beside it, a year of hourly
// weather turned into kWh per kWp of solar and MWh from one modern turbine,
// month by month, and what a calmer year or a different power price would do.
import { BoundingSphere, CallbackProperty, Cartesian2, Cartesian3, Color, CustomDataSource, HeadingPitchRange, Math as CesiumMath, Matrix4, PolygonHierarchy, Transforms } from "cesium";
import type { App } from "../app";
import { elevation } from "../data/elevation";
import { getJson } from "../data/http";
import { wake } from "../globe/motion";
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import { potential, sunPath, windIfChanged, type YearHours } from "./siteModel";

const R = Math.PI / 180;
let ds: CustomDataSource | null = null;

/** A point `dist` metres from the site at a bearing and height (ENU). */
function local(frame: Matrix4, east: number, north: number, up: number) { return Matrix4.multiplyByPoint(frame, new Cartesian3(east, north, up), new Cartesian3()); }
const skyPoint = (frame: Matrix4, alt: number, az: number, r: number) => local(frame, r * Math.cos(alt * R) * Math.sin(az * R), r * Math.cos(alt * R) * Math.cos(az * R), r * Math.sin(alt * R));
const speedColor = (v: number) => Color.fromCssColorString(v < 4 ? "#4c9ac9" : v < 6 ? "#5b9467" : v < 8 ? "#e1b843" : v < 10 ? "#d19a2e" : "#c4513a");

export function openSite(ctx: WorkCtx, app: App) {
  const viewer = app.globe.viewer;
  ds ??= new CustomDataSource("site");
  if (!viewer.dataSources.contains(ds)) void viewer.dataSources.add(ds);
  ds.entities.removeAll();
  const cv = viewer.canvas, mid = app.globe.pick(new Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2));
  const at = app.place ? { lon: app.place.lon, lat: app.place.lat, name: app.place.name?.title ?? "this place" } : mid ? { lon: mid.lon, lat: mid.lat, name: "the middle of the map" } : { lon: -101.9, lat: 35.2, name: "the Texas Panhandle" };
  // Everything stands on the real ground: its height first (the site may be a high plain).
  let frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(at.lon, at.lat, 0));
  const dome = 420;
  const year = new Date().getUTCFullYear();
  const ground = elevation.sample([[at.lon, at.lat]], 11).then((z) => (Number.isFinite(z[0]) ? z[0] : 0)).catch(() => 0);
  const site = ds;
  const draw3d = () => {
  // The sun's paths: longest day (warm), equinox, shortest day (cool), with the hours marked.
  for (const [date, color, label] of [[`${year}-06-21`, "#d19a2e", "21 June"], [`${year}-03-20`, "#e1b843", "Equinox"], [`${year}-12-21`, "#4c9ac9", "21 December"]] as const) {
    const path = sunPath(at.lat, at.lon, Date.parse(`${date}T00:00:00Z`));
    if (path.length < 2) continue;
    site.entities.add({ polyline: { positions: path.map((p) => skyPoint(frame, p.alt, p.az, dome)), width: 3, material: Color.fromCssColorString(color).withAlpha(0.9) } });
    const noon = path.reduce((a, p) => (p.alt > a.alt ? p : a), path[0]);
    site.entities.add({ position: skyPoint(frame, noon.alt, noon.az, dome + 25), label: { text: `${label} · ${Math.round(noon.alt)}°`, font: "700 12px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif", fillColor: Color.fromCssColorString(color), outlineColor: Color.BLACK, outlineWidth: 3, style: 2 } });
  }
  // Today's sun, travelling its arc once every 12 seconds.
  const today = sunPath(at.lat, at.lon, Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`));
  if (today.length > 1) {
    const t0 = performance.now();
    site.entities.add({ position: new CallbackProperty(() => { const f = ((performance.now() - t0) / 12000) % 1, i = f * (today.length - 1), a = today[Math.floor(i)], b = today[Math.min(today.length - 1, Math.floor(i) + 1)], k = i % 1; return skyPoint(frame, a.alt + (b.alt - a.alt) * k, a.az + (((b.az - a.az + 540) % 360) - 180) * k, dome); }, false) as unknown as Cartesian3,
      point: { pixelSize: 22, color: Color.fromCssColorString("#ffcc33"), outlineColor: Color.fromCssColorString("#fff3c4"), outlineWidth: 4 } });
  }
  // The compass ring on the ground.
  site.entities.add({ polyline: { positions: Array.from({ length: 73 }, (_, i) => local(frame, dome * Math.sin(i * 5 * R), dome * Math.cos(i * 5 * R), 2)), width: 2, material: Color.WHITE.withAlpha(0.6) } });
  for (const [d, n] of [[0, "N"], [90, "E"], [180, "S"], [270, "W"]] as const)
    site.entities.add({ position: local(frame, (dome + 30) * Math.sin(d * R), (dome + 30) * Math.cos(d * R), 4), label: { text: n, font: "800 15px 'Terreno Sans', 'Plus Jakarta Sans', system-ui, sans-serif", fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3, style: 2 } });
  };
  const stopAnim = (() => { let on = true; const tick = () => { if (!on) return; wake(400); setTimeout(tick, 300); }; tick(); return () => { on = false; }; })();
  app.canvas.put({ id: "view:site", label: `⚡ Site potential · ${at.name}`, color: "#e1b843", scope: "world", pinned: true, show: (v) => { ds!.show = v; }, remove: () => { stopAnim(); ds?.entities.removeAll(); } }, true);
  void ground.then((z) => {
    frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(at.lon, at.lat, z + 3));
    draw3d();
    viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(at.lon, at.lat, z), dome), { offset: new HeadingPitchRange(CesiumMath.toRadians(20), CesiumMath.toRadians(-24), dome * 4.2), duration: 2.2 });
  });

  const kpis = h("div", { class: "st-kpis" }, h("p", { class: "muted small" }, "Reading a year of sun and wind…"));
  const months = h("div", { class: "st-months" });
  const wi = h("div", {});
  ctx.show("Site potential", () => { stopAnim(); ds?.entities.removeAll(); app.canvas.drop("view:site"); ctx.home(); },
    h("p", { class: "mp-intro" }, `What ${at.name} could make from the sun and the wind. The arcs are the sun's paths over the year; the petals on the ground, the winds that blew last year.`),
    kpis, months, wi,
    h("p", { class: "fineprint" }, "Last year's hourly weather from Open-Meteo (ERA5 reanalysis, CC BY 4.0). Solar: 80% performance ratio, panels tilted to the latitude. Wind: a generic 3.6 MW turbine at 100 m. Estimates for comparing sites, not bankable yield studies."));

  void (async () => {
    const y = year - 1;
    try {
      const r = await getJson<{ hourly: { time: string[]; shortwave_radiation: number[]; wind_speed_100m: number[]; wind_direction_100m: number[] } }>("Open-Meteo",
        `https://archive-api.open-meteo.com/v1/archive?latitude=${at.lat}&longitude=${at.lon}&start_date=${y}-01-01&end_date=${y}-12-31&hourly=shortwave_radiation,wind_speed_100m,wind_direction_100m&timezone=UTC`, undefined, 40_000);
      const hours: YearHours = { time: r.hourly.time, ghi: r.hourly.shortwave_radiation, wind: r.hourly.wind_speed_100m, dir: r.hourly.wind_direction_100m };
      const p = potential(hours, at.lat);
      await ground;
      // The wind rose: a petal per direction, on the ground inside the compass ring.
      const maxShare = Math.max(1, ...p.wind.rose.map((s) => s.share));
      for (const s of p.wind.rose) {
        if (!s.share) continue;
        const r0 = 30, r1 = r0 + (s.share / maxShare) * (dome * 0.8), a0 = (s.dir - 10) * R, a1 = (s.dir + 10) * R;
        const pts = [local(frame, r0 * Math.sin(a0), r0 * Math.cos(a0), 0), ...Array.from({ length: 6 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / 5; return local(frame, r1 * Math.sin(a), r1 * Math.cos(a), 0); }), local(frame, r0 * Math.sin(a1), r0 * Math.cos(a1), 0)];
        ds!.entities.add({ polygon: { hierarchy: new PolygonHierarchy(pts), perPositionHeight: true, extrudedHeight: 6 + s.mean * 9, material: speedColor(s.mean).withAlpha(0.85), outline: false } });
      }
      wake(1500);
      const best = p.wind.rose.reduce((a, s) => (s.share > a.share ? s : a), p.wind.rose[0]);
      const dirName = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(best.dir / 22.5) % 16];
      kpis.replaceChildren(
        h("div", { class: "st-kpi sun" }, h("small", {}, "Solar"), h("strong", {}, `${p.solar.kwhPerKwp.toLocaleString()}`), h("span", {}, `kWh per kWp a year · ${p.solar.cf}% capacity factor`)),
        h("div", { class: "st-kpi wind" }, h("small", {}, "Wind at 100 m"), h("strong", {}, `${p.wind.mean} m/s`), h("span", {}, `mostly from the ${dirName}`)),
        h("div", { class: "st-kpi wind" }, h("small", {}, "One 3.6 MW turbine"), h("strong", {}, `${p.wind.mwh.toLocaleString()} MWh`), h("span", {}, `a year · ${p.wind.cf}% capacity factor`)),
        h("div", { class: "st-kpi" }, h("small", {}, "Verdict"), h("strong", {}, p.wind.cf >= 35 ? "Wind site" : p.solar.kwhPerKwp >= 1500 ? "Solar site" : p.wind.cf >= 25 || p.solar.kwhPerKwp >= 1100 ? "Workable" : "Marginal"),
          h("span", {}, p.wind.cf >= 35 && p.solar.kwhPerKwp >= 1400 ? "both are strong: a hybrid would share the grid connection" : p.solar.monthly[6] > p.solar.monthly[0] * 2 && p.wind.monthly[0] > p.wind.monthly[6] ? "sun in summer, wind in winter: they complement" : "")));
      const maxS = Math.max(...p.solar.monthly), maxW = Math.max(...p.wind.monthly);
      months.replaceChildren(h("h3", { class: "group-title" }, "Month by month"),
        h("div", { class: "st-bars" }, ...p.solar.monthly.map((s, i) => h("div", { class: "st-month" },
          h("i", { class: "s", style: `height:${(s / maxS) * 100}%`, title: `${s} kWh/kWp` }), h("i", { class: "w", style: `height:${(p.wind.monthly[i] / maxW) * 100}%`, title: `${p.wind.monthly[i]} MWh` }),
          h("small", {}, "JFMAMJJASOND"[i])))),
        h("p", { class: "ec-legend" }, h("i", { class: "st-key s" }), " solar  ", h("i", { class: "st-key w" }), " wind"));
      // What if: a calmer or windier year, and the price of power.
      const windIn = h("input", { type: "range", min: -20, max: 20, step: 5, value: 0, "aria-label": "Wind change" }) as HTMLInputElement;
      const priceIn = h("input", { type: "range", min: 20, max: 160, step: 5, value: 60, "aria-label": "Power price" }) as HTMLInputElement;
      const outs = [h("output", {}), h("output", {})];
      const out = h("div", { class: "sl-wi-out" });
      const say = () => {
        const dw = Number(windIn.value), price = Number(priceIn.value), mwh = dw ? windIfChanged(hours, dw) : p.wind.mwh;
        outs[0].textContent = `${dw > 0 ? "+" : ""}${dw}%`; outs[1].textContent = `$${price}/MWh`;
        const solarMwh = p.solar.kwhPerKwp; // 1 MWp makes kWh/kWp MWh
        out.replaceChildren(
          h("p", {}, h("strong", {}, `${dw ? `A ${dw < 0 ? "calmer" : "windier"} year (${dw > 0 ? "+" : ""}${dw}% wind)` : "A year like last year"}`), `: one turbine makes ${mwh.toLocaleString()} MWh${dw ? ` (${mwh >= p.wind.mwh ? "+" : "−"}${Math.abs(Math.round((mwh / p.wind.mwh - 1) * 100))}%: output follows roughly the cube of the wind)` : ""}, worth about $${Math.round((mwh * price) / 1000).toLocaleString()}k a year.`),
          h("p", {}, h("strong", {}, "1 MW of solar"), ` makes about ${solarMwh.toLocaleString()} MWh, worth $${Math.round((solarMwh * price) / 1000).toLocaleString()}k a year at $${price}/MWh.`));
      };
      for (const el of [windIn, priceIn]) el.addEventListener("input", say);
      wi.replaceChildren(h("section", { class: "wi on" }, h("header", {}, h("strong", {}, "What if…")),
        h("label", { class: "wi-sev" }, h("span", {}, "Wind"), windIn, outs[0]), h("label", { class: "wi-sev" }, h("span", {}, "Power price"), priceIn, outs[1]), out));
      say();
    } catch {
      kpis.replaceChildren(h("p", { class: "muted" }, "The weather archive didn't answer; the sun's paths above don't need it."));
    }
  })();
}
