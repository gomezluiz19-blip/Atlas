// The weather where you're looking, as one small bubble at the top of the map: a symbol and the temperature,
// nothing else. It follows the middle of the view (once you're close enough for "here" to mean somewhere), and
// tapping it opens the climate view for that spot. Open-Meteo, refreshed when the view moves on or every 15 minutes.
import { Cartesian2, Math as CesiumMath, type Viewer } from "cesium";
import { weatherText } from "../analysis/climate";
import { getJson } from "../data/http";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";

interface Now { current: { temperature_2m: number; weather_code: number; is_day: number } }

/** Whether this person reads temperatures in Fahrenheit (pure: the US and a few others). */
export const usesFahrenheit = (lang = typeof navigator === "undefined" ? "en-GB" : navigator.language) => /-(US|LR|MM|BS|BZ|KY|PW|FM|MH)$/i.test(lang);

/** A temperature as the person reads it (pure). */
export const tempText = (c: number, f = usesFahrenheit()) => `${Math.round(f ? c * 9 / 5 + 32 : c)}°`;

const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';

export function weatherBubble(viewer: Viewer, open: (at: { lon: number; lat: number }) => void): HTMLElement {
  const sym = h("span", { class: "wx-sym" }), temp = h("strong", { class: "wx-temp" });
  let at: { lon: number; lat: number } | null = null, fetchedAt = 0, job = 0;
  const el = h("button", { class: "wx-bubble", hidden: true, onclick: () => { if (at) open(at); } }, sym, temp) as HTMLButtonElement;

  const centre = (): { lon: number; lat: number } | null => {
    const c = viewer.canvas, ray = viewer.camera.getPickRay(new Cartesian2(c.clientWidth / 2, c.clientHeight / 2));
    const hit = ray && viewer.scene.globe.pick(ray, viewer.scene);
    if (!hit) return null;
    const g = viewer.scene.globe.ellipsoid.cartesianToCartographic(hit);
    return { lon: CesiumMath.toDegrees(g.longitude), lat: CesiumMath.toDegrees(g.latitude) };
  };
  const farApart = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.abs(a.lat - b.lat) > 0.25 || Math.abs(a.lon - b.lon) > 0.25;

  const update = async () => {
    // From orbit there's no one "here": the bubble steps away until you come down.
    if (viewer.camera.positionCartographic.height > 2_500_000) { el.hidden = true; return; }
    const c = centre();
    if (!c) return;
    if (at && !farApart(c, at) && Date.now() - fetchedAt < 15 * 60_000) { el.hidden = false; return; }
    const my = ++job;
    const r = await getJson<Now>("Open-Meteo", `https://api.open-meteo.com/v1/forecast?latitude=${c.lat.toFixed(2)}&longitude=${c.lon.toFixed(2)}&current=temperature_2m,weather_code,is_day&timezone=auto`).catch(() => null);
    if (my !== job || !r?.current) return;
    at = c; fetchedAt = Date.now();
    const w = weatherText(r.current.weather_code);
    const night = !r.current.is_day && (w.icon === "sun" || w.icon === "partly");
    sym.innerHTML = night ? MOON : w.icon === "partly" ? icons.cloud : (icons as Record<string, string>)[w.icon] ?? icons.cloud;
    temp.textContent = tempText(r.current.temperature_2m);
    el.title = `${w.text}, ${tempText(r.current.temperature_2m)} here now. Tap for the weather.`;
    el.setAttribute("aria-label", el.title);
    el.hidden = false;
  };
  let t = 0;
  viewer.camera.moveEnd.addEventListener(() => { clearTimeout(t); t = window.setTimeout(() => void update(), 900); });
  setInterval(() => void update(), 15 * 60_000);
  setTimeout(() => void update(), 2500);
  return el;
}
