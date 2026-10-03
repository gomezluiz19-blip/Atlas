// Matchday: sun, shade and heat at a stadium, for the people who schedule and
// run matches. A bowl of stands rises around the pitch in 3D at the venue and
// casts real shadows as the clock runs through the match; beside it, how much
// of the pitch is in shade minute by minute, the kickoff times with the most
// even light, the weather at kickoff, and how many fans live within reach.
import { BoundingSphere, Cartesian2, Cartesian3, Color, CustomDataSource, HeadingPitchRange, HeightReference, JulianDate, Math as CesiumMath, PolygonHierarchy, ShadowMode } from "cesium";
import type { App } from "../app";
import { getJson } from "../data/http";
import { peopleNear, populationPoints } from "../data/people";
import { wake } from "../globe/motion";
import { introsTagged } from "../intros/places";
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import { DEFAULT_BOWL, heatFlag, kickoffs, matchShade, shadeFraction, type Bowl, type MatchMinute } from "./matchModel";

interface Venue { name: string; lon: number; lat: number }
const STADIUMS: Venue[] = introsTagged("stadium").map((p) => ({ name: p.name, lon: p.lon, lat: p.lat })).sort((a, b) => a.name.localeCompare(b.name));
const compass = (d: number) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
const nextSaturday = () => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); };
const hhmm = (h24: number) => `${Math.floor(h24)}:${String(Math.round((h24 % 1) * 60)).padStart(2, "0")}`;

/** Corners of a rectangle `l` × `w` metres around a point, turned to `bearing` (degrees). */
function rect(lon: number, lat: number, l: number, w: number, bearing: number): Cartesian3[] {
  const b = (bearing * Math.PI) / 180, mLat = 111_320, mLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
    const x = (sx * l) / 2, y = (sy * w) / 2; // x along the pitch, y across
    const east = x * Math.sin(b) + y * Math.cos(b), north = x * Math.cos(b) - y * Math.sin(b);
    return Cartesian3.fromDegrees(lon + east / mLon, lat + north / mLat);
  });
}

let ds: CustomDataSource | null = null;
let restore: (() => void) | null = null;

export function openMatchday(ctx: WorkCtx, app: App) {
  const viewer = app.globe.viewer;
  ds ??= new CustomDataSource("matchday");
  if (!viewer.dataSources.contains(ds)) void viewer.dataSources.add(ds);
  // The clock and shadows are borrowed for the match, and given back on the way out.
  if (!restore) {
    const was = { t: viewer.clock.currentTime.clone(), anim: viewer.clock.shouldAnimate, mult: viewer.clock.multiplier, shadows: viewer.shadows };
    restore = () => { viewer.clock.currentTime = was.t; viewer.clock.shouldAnimate = was.anim; viewer.clock.multiplier = was.mult; viewer.shadows = was.shadows; ds?.entities.removeAll(); app.canvas.drop("view:matchday"); restore = null; };
  }
  const cv = viewer.canvas, mid = app.globe.pick(new Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2));
  let venue: Venue = app.place && !STADIUMS.length ? { name: "Here", lon: app.place.lon, lat: app.place.lat } : STADIUMS.find((s) => s.name === "Wembley Stadium") ?? STADIUMS[0];
  let bowl: Bowl = { ...DEFAULT_BOWL };
  let day = nextSaturday(), kick = 15, minute = 0, offsetH = Math.round(venue.lon / 15), ms: MatchMinute[] = [], timer = 0;

  const venueSel = h("select", { class: "pro-url", "aria-label": "Venue" },
    ...STADIUMS.map((s) => h("option", { value: s.name, selected: s.name === venue.name }, s.name)),
    mid ? h("option", { value: "__mid" }, "The middle of the map") : "") as HTMLSelectElement;
  const dayIn = h("input", { class: "pro-url", type: "date", value: day, "aria-label": "Match day" }) as HTMLInputElement;
  const kickIn = h("input", { class: "pro-url", type: "time", value: hhmm(kick).padStart(5, "0"), step: 900, "aria-label": "Kickoff (local)" }) as HTMLInputElement;
  const bearingIn = h("input", { type: "range", min: 0, max: 175, step: 5, value: 0, "aria-label": "Which way the pitch runs" }) as HTMLInputElement;
  const rimIn = h("input", { type: "range", min: 12, max: 55, step: 1, value: bowl.rimHeight, "aria-label": "How tall the stands are" }) as HTMLInputElement;
  const bearingOut = h("output", {}), rimOut = h("output", {});
  const headline = h("div", { class: "md-head" });
  const timeline = h("div", { class: "md-timeline" });
  const pitch = h("div", { class: "md-pitch" });
  const best = h("div", { class: "md-best" });
  const weather = h("div", { class: "md-weather" });
  const fans = h("div", { class: "md-fans" });
  const play = h("button", { class: "primary-btn md-play" }, "▶ Play the match") as HTMLButtonElement;

  const kickoffUtc = () => Date.parse(`${day}T00:00:00Z`) + (kick - offsetH) * 3_600_000;

  function build() {
    ds!.entities.removeAll();
    const { lon, lat } = venue;
    const pitchColor = Color.fromCssColorString("#2f8f3a"), stripe = Color.fromCssColorString("#38a344");
    // The pitch in mown stripes, then the stands as a ring rising to the rim.
    for (let i = 0; i < 10; i++) {
      const l = bowl.length / 10, offset = -bowl.length / 2 + l * (i + 0.5), b = (bowl.bearing * Math.PI) / 180;
      const cLon = lon + (offset * Math.sin(b)) / (111_320 * Math.cos((lat * Math.PI) / 180)), cLat = lat + (offset * Math.cos(b)) / 111_320;
      ds!.entities.add({ polygon: { hierarchy: new PolygonHierarchy(rect(cLon, cLat, l, bowl.width, bowl.bearing)), material: i % 2 ? pitchColor : stripe, height: 0.4, heightReference: HeightReference.RELATIVE_TO_GROUND, shadows: ShadowMode.RECEIVE_ONLY } });
    }
    const inner = rect(lon, lat, bowl.length + 2 * bowl.setback, bowl.width + 2 * bowl.setback, bowl.bearing);
    const outer = rect(lon, lat, bowl.length + 2 * bowl.setback + 70, bowl.width + 2 * bowl.setback + 70, bowl.bearing);
    ds!.entities.add({ polygon: { hierarchy: new PolygonHierarchy(outer, [new PolygonHierarchy(inner)]), height: 0, extrudedHeight: bowl.rimHeight, heightReference: HeightReference.RELATIVE_TO_GROUND, extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
      material: Color.fromCssColorString("#d9dde3"), outline: false, shadows: ShadowMode.ENABLED } });
    app.canvas.put({ id: "view:matchday", label: `🏟️ Matchday · ${venue.name}`, color: "#bf5af2", scope: "world", pinned: true, show: (v) => { ds!.show = v; }, remove: () => { restore?.(); } }, true);
    viewer.shadows = true;
  }

  function setMinute(m: number) {
    minute = m;
    const t = kickoffUtc() + m * 60_000;
    if (Number.isFinite(t)) viewer.clock.currentTime = JulianDate.fromDate(new Date(t));
    wake(800);
    const at = ms.reduce((a, x) => (Math.abs(x.minute - m) < Math.abs(a.minute - m) ? x : a), ms[0]);
    if (at) drawPitch(at);
    timeline.querySelector(".md-cursor")?.setAttribute("x1", String(xOf(m)));
    timeline.querySelector(".md-cursor")?.setAttribute("x2", String(xOf(m)));
  }
  const W = 340, H = 120, xOf = (m: number) => 26 + (m / 110) * (W - 34);

  function drawTimeline() {
    const y = (f: number) => 10 + (1 - f) * (H - 30);
    const shade = ms.map((x, i) => `${i ? "L" : "M"}${xOf(x.minute).toFixed(1)},${y(x.shade).toFixed(1)}`).join("");
    const sun = ms.map((x, i) => `${i ? "L" : "M"}${xOf(x.minute).toFixed(1)},${y(Math.max(0, x.alt) / 70).toFixed(1)}`).join("");
    timeline.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="md-svg">
      <rect x="${xOf(45)}" y="6" width="${xOf(60) - xOf(45)}" height="${H - 26}" class="md-ht"/><text x="${(xOf(45) + xOf(60)) / 2}" y="${H - 10}" class="md-ax" text-anchor="middle">HT</text>
      ${[0, 0.5, 1].map((f) => `<line x1="26" x2="${W - 8}" y1="${y(f)}" y2="${y(f)}" class="md-grid"/><text x="22" y="${y(f) + 3}" class="md-ax" text-anchor="end">${Math.round(f * 100)}%</text>`).join("")}
      <path d="${shade}L${xOf(110)},${y(0)}L${xOf(0)},${y(0)}Z" class="md-shade"/><path d="${shade}" class="md-shade-line"/>
      <path d="${sun}" class="md-sun"/>
      ${[0, 45, 90].map((m) => `<text x="${xOf(m === 90 ? 105 : m)}" y="${H - 10}" class="md-ax" text-anchor="middle">${m === 0 ? "KO" : m === 45 ? "" : "FT"}</text>`).join("")}
      <line class="md-cursor" x1="${xOf(minute)}" x2="${xOf(minute)}" y1="4" y2="${H - 22}"/></svg>`;
    timeline.querySelector("svg")!.addEventListener("pointerdown", (e) => {
      const svg = e.currentTarget as SVGSVGElement, r = svg.getBoundingClientRect();
      const move = (ev: PointerEvent) => setMinute(Math.max(0, Math.min(110, Math.round((((ev.clientX - r.left) / r.width) * W - 26) / (W - 34) * 110))));
      move(e); svg.setPointerCapture(e.pointerId); svg.onpointermove = move; svg.onpointerup = () => { svg.onpointermove = null; };
    });
  }

  function drawPitch(at: MatchMinute) {
    const { grid } = shadeFraction(bowl, at.alt, at.az, 24);
    const cw = 10, ch = 10, pw = grid[0].length * cw, ph = grid.length * ch;
    const a = ((at.az - bowl.bearing - 90) * Math.PI) / 180;
    pitch.innerHTML = `<svg viewBox="-14 -14 ${pw + 28} ${ph + 28}" class="md-pitch-svg"><rect x="0" y="0" width="${pw}" height="${ph}" rx="3" class="md-grass"/>
      ${grid.map((row, j) => row.map((s, i) => (s ? `<rect x="${i * cw}" y="${(grid.length - 1 - j) * ch}" width="${cw}" height="${ch}" class="md-dark"/>` : "")).join("")).join("")}
      <line x1="${pw / 2}" y1="0" x2="${pw / 2}" y2="${ph}" class="md-line"/><circle cx="${pw / 2}" cy="${ph / 2}" r="${ph * 0.13}" class="md-line"/>
      <rect x="0" y="${ph * 0.2}" width="${pw * 0.16}" height="${ph * 0.6}" class="md-line"/><rect x="${pw * 0.84}" y="${ph * 0.2}" width="${pw * 0.16}" height="${ph * 0.6}" class="md-line"/>
      ${at.alt > 0 ? `<g transform="translate(${pw / 2 + Math.cos(a) * (pw / 2 + 4)},${ph / 2 + Math.sin(a) * (ph / 2 + 4)})"><circle r="6" class="md-sunball"/></g>` : ""}</svg>
      <p class="md-pitch-note">${at.minute}': ${Math.round(at.shade * 100)}% in shade · sun ${Math.max(0, Math.round(at.alt))}° high in the ${compass(at.az)}</p>`;
  }

  async function loadWeather() {
    weather.replaceChildren(h("p", { class: "muted small" }, "Weather at kickoff…"));
    const daysAway = (Date.parse(day) - Date.now()) / 86_400_000;
    const near = daysAway >= -1 && daysAway <= 15;
    const url = near
      ? `https://api.open-meteo.com/v1/forecast?latitude=${venue.lat}&longitude=${venue.lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,wind_gusts_10m&timezone=auto&start_date=${day}&end_date=${day}`
      : `https://archive-api.open-meteo.com/v1/archive?latitude=${venue.lat}&longitude=${venue.lon}&hourly=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m&timezone=auto&start_date=${Number(day.slice(0, 4)) - 1}${day.slice(4)}&end_date=${Number(day.slice(0, 4)) - 1}${day.slice(4)}`;
    try {
      const r = await getJson<{ utc_offset_seconds: number; hourly: Record<string, (number | null)[]> }>("Open-Meteo", url);
      if (Number.isFinite(r.utc_offset_seconds)) offsetH = Math.round(r.utc_offset_seconds / 3600);
      const i = Math.min(23, Math.floor(kick));
      const t = r.hourly.temperature_2m?.[i], feels = r.hourly.apparent_temperature?.[i], wind = r.hourly.wind_speed_10m?.[i], gust = r.hourly.wind_gusts_10m?.[i];
      const rain = near ? r.hourly.precipitation_probability?.[i] : r.hourly.precipitation?.[i];
      const flag = heatFlag(feels);
      weather.replaceChildren(
        h("small", {}, near ? "Forecast at kickoff" : `Too far ahead to forecast: the same day last year`),
        h("div", { class: "md-wx" },
          h("span", {}, h("strong", {}, t != null ? `${Math.round(t)}°` : "–"), h("small", {}, feels != null ? `feels ${Math.round(feels)}°` : "")),
          h("span", {}, h("strong", {}, wind != null ? `${Math.round(wind)}` : "–"), h("small", {}, gust != null ? `km/h, gusts ${Math.round(gust)}` : "km/h")),
          h("span", {}, h("strong", {}, rain != null ? (near ? `${rain}%` : `${rain} mm`) : "–"), h("small", {}, near ? "chance of rain" : "rain that hour"))),
        flag.text ? h("p", { class: `md-flag l${flag.level}` }, flag.text) : "");
      refresh(false);
    } catch { weather.replaceChildren(h("p", { class: "muted small" }, "The weather didn't load; the sun and shade don't need it.")); }
  }

  async function loadFans() {
    try {
      const near = peopleNear(await populationPoints(), venue.lon, venue.lat);
      const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
      fans.replaceChildren(h("small", {}, "Fans within reach (people living within)"),
        h("div", { class: "md-wx" }, ...near.rings.map((r) => h("span", {}, h("strong", {}, fmt(r.people)), h("small", {}, `${r.km} km`)))));
    } catch { fans.replaceChildren(); }
  }

  function refresh(fly = true) {
    ms = matchShade(bowl, kickoffUtc(), venue.lat, venue.lon);
    const first = ms[0], last = ms[ms.length - 1], half = ms.find((x) => x.minute >= 45)!;
    headline.replaceChildren(
      h("div", { class: "md-stat" }, h("small", {}, "Kickoff"), h("strong", {}, `${Math.round(first.shade * 100)}%`), h("span", {}, "of the pitch in shade")),
      h("div", { class: "md-stat" }, h("small", {}, "Half time"), h("strong", {}, `${Math.round(half.shade * 100)}%`), h("span", {}, half.alt > 0 ? `sun ${Math.round(half.alt)}° ${compass(half.az)}` : "after sunset")),
      h("div", { class: "md-stat" }, h("small", {}, "Full time"), h("strong", {}, `${Math.round(last.shade * 100)}%`), h("span", {}, last.alt > 0 ? `sun ${Math.round(last.alt)}°` : "floodlights")));
    drawTimeline();
    setMinute(minute);
    const ks = kickoffs(bowl, day, offsetH, venue.lat, venue.lon);
    const good = ks.slice(0, 3), bad = ks[ks.length - 1];
    best.replaceChildren(h("small", {}, "Kickoffs with the most even light"),
      h("div", { class: "md-kos" }, ...good.map((k) => h("button", { class: "md-ko", onclick: () => { kick = k.hour; kickIn.value = hhmm(kick).padStart(5, "0"); refresh(false); } }, h("strong", {}, hhmm(k.hour)), h("small", {}, k.sun > 0.9 ? "all sun" : k.sun < 0.1 ? "all shade" : `${Math.round(k.patchy * 100)}% split`))),
        h("span", { class: "md-ko bad" }, h("strong", {}, hhmm(bad.hour)), h("small", {}, "worst: half and half"))));
    if (fly) viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(venue.lon, venue.lat, 0), 1), { offset: new HeadingPitchRange(CesiumMath.toRadians(200), CesiumMath.toRadians(-32), 420), duration: 2.2 });
  }

  const setVenue = () => {
    if (venueSel.value === "__mid" && mid) venue = { name: "The middle of the map", lon: mid.lon, lat: mid.lat };
    else venue = STADIUMS.find((s) => s.name === venueSel.value) ?? venue;
    offsetH = Math.round(venue.lon / 15);
    build(); refresh(); void loadWeather(); void loadFans();
  };
  venueSel.addEventListener("change", setVenue);
  dayIn.addEventListener("change", () => { day = dayIn.value || day; refresh(false); void loadWeather(); });
  kickIn.addEventListener("change", () => { const [a, b] = kickIn.value.split(":").map(Number); kick = a + (b || 0) / 60; refresh(false); void loadWeather(); });
  const bearingText = () => { bearingOut.textContent = `${compass(bowl.bearing)}–${compass(bowl.bearing + 180)}`; rimOut.textContent = `${bowl.rimHeight} m`; };
  bearingIn.addEventListener("input", () => { bowl = { ...bowl, bearing: Number(bearingIn.value) }; bearingText(); build(); refresh(false); });
  rimIn.addEventListener("input", () => { bowl = { ...bowl, rimHeight: Number(rimIn.value) }; bearingText(); build(); refresh(false); });
  play.addEventListener("click", () => {
    clearInterval(timer);
    if (play.classList.toggle("on")) {
      play.textContent = "❚❚ Pause";
      if (minute >= 110) setMinute(0);
      timer = window.setInterval(() => { if (!play.isConnected) { clearInterval(timer); return; } if (minute >= 110) { clearInterval(timer); play.classList.remove("on"); play.textContent = "▶ Play the match"; return; } setMinute(minute + 1); }, 110);
    } else play.textContent = "▶ Play the match";
  });
  bearingText();
  build();
  ctx.show("Matchday", () => { clearInterval(timer); restore?.(); ctx.home(); },
    h("p", { class: "mp-intro" }, "Sun, shade and heat on match day. The stands cast real shadows across the pitch as the match plays out; drag the timeline or press play."),
    h("div", { class: "md-form" }, venueSel, h("div", { class: "md-two" }, dayIn, kickIn)),
    headline, timeline, h("div", { class: "md-row" }, pitch, h("div", { class: "md-side" }, play, best)),
    h("details", { class: "md-adjust" }, h("summary", {}, "The stadium"),
      h("label", { class: "wi-sev" }, h("span", {}, "Pitch runs"), bearingIn, bearingOut),
      h("label", { class: "wi-sev" }, h("span", {}, "Stands"), rimIn, rimOut),
      h("p", { class: "fineprint" }, "A simple bowl: stands all round, 12 m back from the lines. Turn the pitch to match the real one.")),
    weather, fans,
    h("p", { class: "fineprint" }, "Sun position computed for the venue; weather from Open-Meteo; population from GeoNames towns."));
  refresh(); void loadWeather(); void loadFans();
}
