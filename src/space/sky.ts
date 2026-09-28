// Tonight's sky at a place: the Moon's phase and the planets above the horizon.
import { h } from "../ui/dom";
import { PLANETS, compass, moonPhase, planetSky, sunAltAz } from "./astro";

export function skyCard(lon: number, lat: number): HTMLElement {
  const p = { lon, lat }, now = Date.now();
  const moon = moonPhase(now);
  // Look at the sky tonight at 21:00 local time (or now, if it's already dark).
  const t = new Date(); t.setHours(21, 0, 0, 0);
  const at = sunAltAz(p.lon, p.lat, now).alt < -12 ? now : t.getTime();
  const up = PLANETS.filter((x) => x.id !== "earth").map((x) => ({ x, ...planetSky(x, p.lon, p.lat, at) })).filter((x) => x.alt > 5).sort((a, b) => b.alt - a.alt);
  const bright = new Set(["venus", "jupiter", "mars", "saturn"]);
  return h("div", { class: "space-sky" },
    h("div", { class: "space-moon" }, h("span", { class: "space-emoji big" }, moon.emoji), h("div", {}, h("strong", {}, moon.name), h("span", { class: "muted small" }, `${Math.round(moon.lit * 100)}% lit`))),
    up.length ? h("div", { class: "list" }, ...up.map((x) => h("div", { class: "list-row static" },
      h("span", { class: "dot big", style: `background:${x.x.color}` }),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, x.x.name, bright.has(x.x.id) ? h("span", { class: "muted small" }, " · easy to see") : ""),
        h("span", { class: "list-sub" }, `${compass(x.az)}, ${Math.round(x.alt)}° above the horizon${x.x.id === "uranus" || x.x.id === "neptune" ? " · needs a telescope" : ""}`)))))
      : h("p", { class: "muted small" }, "No planets above the horizon then."),
    h("p", { class: "muted small" }, at === now ? "The sky now." : "The sky tonight at 9 pm."));
}
