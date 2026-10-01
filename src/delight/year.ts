// The year breathes: spin a dial through the year and watch the planet
// change with it. The sun where it really is on that day (polar night
// spreading over the Arctic in December, the midnight sun in June), and the
// satellite greenness of that week (NASA MODIS, 8-day composites of last
// year): the spring wave climbing north, the Sahel greening with the
// monsoon, the southern summer. Play loops it; the planet breathes.
import { wake } from "../globe/motion";
import { Cartesian3, ImageryLayer, JulianDate, UrlTemplateImageryProvider } from "cesium";
import type { App } from "../app";
import { h } from "../ui/dom";
import { hoursText, sunDay, sunDayStart } from "./sun";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** What the planet is doing, month by month. */
export const SEASON_NOTES = [
  "Southern summer. Polar night over the Arctic; the wet season greens the Amazon, southern Africa and northern Australia.",
  "Deep northern winter: snow over Canada, Russia and northern China, while summer rains keep southern Africa green.",
  "The March equinox: day and night nearly equal everywhere. Spring starts to green the northern mid-latitudes.",
  "Spring's green wave climbs north across the United States, Europe and China; the sun returns to the Arctic.",
  "Northern forests come into leaf; India heats up before the monsoon; autumn browns southern Australia.",
  "The June solstice: the midnight sun over the Arctic, polar night over Antarctica. The monsoon reaches India.",
  "Peak northern green: the boreal forests and the farm belts in full leaf. The West African monsoon greens the Sahel.",
  "The monsoon keeps India and the Sahel green; the northern summer is at its warmest; Arctic sea ice nears its low.",
  "The September equinox. The Sahel is at its greenest; the northern forests begin to turn.",
  "Autumn across the north; southern spring greens the pampas of Argentina and south-eastern Australia.",
  "Snow returns across the north and the Arctic slides into polar night; the southern wet season begins.",
  "The December solstice: the midnight sun over Antarctica, the shortest days of the northern year.",
];

/** MODIS 8-day composites start on day 1, 9, 17… of the year. */
export const compositeDays = () => Array.from({ length: 46 }, (_, k) => 1 + 8 * k);
const dateOf = (year: number, doy: number) => new Date(Date.UTC(year, 0, doy)).toISOString().slice(0, 10);

let open: { close(): void } | null = null;

export function yearBreathes(app: App) {
  open?.close();
  const { viewer } = app.globe, g = viewer.scene.globe, clk = viewer.clock;
  const year = new Date().getUTCFullYear() - 1;
  const days = compositeDays();
  // Start at this week of the year.
  let i = Math.max(0, days.findIndex((d) => d >= Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 86_400_000)));
  let playing = false, timer = 0;
  const saved = { lighting: g.enableLighting, time: JulianDate.clone(clk.currentTime), fades: [g.lightingFadeOutDistance, g.lightingFadeInDistance, g.nightFadeOutDistance, g.nightFadeInDistance] };
  app.looks?.preview("space");
  Object.assign(g, { lightingFadeOutDistance: 1e6, lightingFadeInDistance: 3e6, nightFadeOutDistance: 1e6, nightFadeInDistance: 3e6 });

  // Greenness layers, cross-faded as the year turns.
  let green: ImageryLayer | null = null;
  const showGreen = (doy: number) => {
    const next = new ImageryLayer(new UrlTemplateImageryProvider({
      url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/${dateOf(year, doy)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
      maximumLevel: 9, credit: `Vegetation: NASA MODIS NDVI, 8 days from ${dateOf(year, doy)} (GIBS)`,
    }), { alpha: 0 });
    app.globe.addUnder(next);
    const old = green;
    green = next;
    const t0 = performance.now();
    const fade = (now: number) => {
      const f = Math.min(1, (now - t0) / 700);
      next.alpha = 0.72 * f;
      if (old) old.alpha = 0.72 * (1 - f);
      wake(200);
      if (f < 1) requestAnimationFrame(fade);
      else if (old) viewer.imageryLayers.remove(old, true);
    };
    requestAnimationFrame(fade);
  };

  // The dial: a ring of months with a hand for the week.
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ring.setAttribute("viewBox", "0 0 120 120");
  ring.setAttribute("class", "yr-ring");
  ring.innerHTML = `<circle cx="60" cy="60" r="46" class="yr-track"/>` +
    MONTHS.map((m, k) => { const a = ((k + 0.5) / 12) * 2 * Math.PI - Math.PI / 2; return `<text x="${60 + 54 * Math.cos(a)}" y="${60 + 54 * Math.sin(a) + 3}" text-anchor="middle" class="yr-m">${m[0]}</text>`; }).join("") +
    `<path class="yr-arc" fill="none" stroke-width="7" stroke-linecap="round"/><circle class="yr-knob" r="7"/>`;
  const arc = ring.querySelector(".yr-arc")!, knob = ring.querySelector(".yr-knob")!;
  const month = h("strong", { class: "yr-month" }), notes = h("p", { class: "yr-note" }), daylen = h("p", { class: "yr-daylen" });
  const playBtn = h("button", { class: "tb-btn tb-play", "aria-label": "Play the year" }) as HTMLButtonElement;
  const card = h("div", { class: "yr-card", role: "group", "aria-label": "The year" },
    ring, h("div", { class: "yr-text" }, h("span", { class: "yr-kicker" }, "The year breathes"), month, notes, daylen),
    h("div", { class: "yr-controls" }, playBtn, h("button", { class: "tb-btn", "aria-label": "Close", html: "✕", onclick: () => close() })));
  (document.getElementById("ui") ?? document.body).append(card);
  document.body.classList.add("year-open");

  const render = () => {
    const doy = days[i];
    const frac = (doy - 1) / 365, a = frac * 2 * Math.PI - Math.PI / 2;
    const x = 60 + 46 * Math.cos(a), y = 60 + 46 * Math.sin(a);
    arc.setAttribute("d", frac < 0.002 ? "" : `M 60 14 A 46 46 0 ${frac > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`);
    knob.setAttribute("cx", x.toFixed(2)); knob.setAttribute("cy", y.toFixed(2));
    const d = new Date(Date.UTC(year, 0, doy + 3));
    month.textContent = `${MONTHS[d.getUTCMonth()]}, week ${Math.ceil(d.getUTCDate() / 7)}`;
    notes.textContent = SEASON_NOTES[d.getUTCMonth()];
    // The sun on that day, and the day's length at the middle of the view.
    const c = viewer.camera.positionCartographic, lon = (c.longitude * 180) / Math.PI, lat = (c.latitude * 180) / Math.PI;
    // Mid-afternoon for the middle of the view, so the day-night line shows on the eastern limb and its tilt
    // (the Arctic dark in December, lit in June) shows the season.
    const t = Date.UTC(new Date().getUTCFullYear(), 0, doy + 3) + (15.5 - lon / 15) * 3_600_000;
    clk.currentTime = JulianDate.fromDate(new Date(t));
    const sd = sunDay(sunDayStart(t, lon), lat, lon);
    daylen.textContent = sd.kind === "polar-day" ? `At ${Math.abs(lat).toFixed(0)}°${lat >= 0 ? "N" : "S"} (the middle of the view): the sun never sets.` : sd.kind === "polar-night" ? `At ${Math.abs(lat).toFixed(0)}°${lat >= 0 ? "N" : "S"} (the middle of the view): the sun never rises.` : `Daylight at ${Math.abs(lat).toFixed(0)}°${lat >= 0 ? "N" : "S"} (the middle of the view): ${hoursText(sd.length)}`;
    showGreen(doy);
  };
  const setPlay = (on: boolean) => {
    playing = on;
    playBtn.innerHTML = on ? "❚❚" : "▶";
    clearInterval(timer);
    if (on) timer = window.setInterval(() => { i = (i + 1) % days.length; render(); }, 1100);
  };
  playBtn.addEventListener("click", () => setPlay(!playing));
  // Drag or tap the ring to set the week.
  const pickAt = (e: PointerEvent) => {
    const r = ring.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const frac = ((Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
    const k = Math.round(frac * 46) % 46;
    if (k !== i) { i = k; render(); }
  };
  ring.addEventListener("pointerdown", (e) => { setPlay(false); ring.setPointerCapture(e.pointerId); pickAt(e); });
  ring.addEventListener("pointermove", (e) => { if (ring.hasPointerCapture(e.pointerId)) pickAt(e); });
  const close = () => {
    setPlay(false);
    card.remove();
    document.body.classList.remove("year-open");
    if (green) viewer.imageryLayers.remove(green, true);
    green = null;
    [g.lightingFadeOutDistance, g.lightingFadeInDistance, g.nightFadeOutDistance, g.nightFadeInDistance] = saved.fades;
    g.enableLighting = saved.lighting;
    clk.currentTime = saved.time;
    app.looks?.restore();
    app.canvas.drop("year");
    open = null;
  };
  open = { close };
  app.canvas.put({ id: "year", label: "The year breathes", color: "#30d158", scope: "world", pinned: true, show: (v) => { if (green) green.show = v; }, remove: close }, true);
  // Seen from far enough out to watch whole continents change.
  const c = viewer.camera.positionCartographic;
  if (c.height < 9_000_000) viewer.camera.flyTo({ destination: Cartesian3.fromRadians(c.longitude, c.latitude, 16_000_000), duration: 2 });
  render();
  setPlay(true);
}
