// The Today card at the top of My Place: the brief for your main place.
import { siteWeather } from "../data/openmeteo";
import { h } from "../ui/dom";
import type { MyPlace } from "./store";
import { localRecords, todayItems, type TodayItem } from "./today";

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const cache = new Map<string, { at: number; days: Awaited<ReturnType<typeof siteWeather>> }>();

export function todayCard(place: MyPlace, openTool: (t: NonNullable<TodayItem["tool"]>) => void): HTMLElement {
  const body = h("div", { class: "today-list" }, h("p", { class: "muted small" }, "Checking the forecast and your records…"));
  const when = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const card = h("section", { class: "today-card" },
    h("div", { class: "today-head" }, h("strong", {}, `Today at ${place.name}`), h("span", {}, when)),
    body);
  const key = `${place.lon.toFixed(2)},${place.lat.toFixed(2)}`;
  const hit = cache.get(key);
  const weather = hit && Date.now() - hit.at < 30 * 60_000 ? Promise.resolve(hit.days) : siteWeather(place.lon, place.lat).then((days) => { cache.set(key, { at: Date.now(), days }); return days; });
  void weather.catch(() => null).then((days) => {
    const items = todayItems({ today: localDate(), weather: days, ...localRecords() });
    const rows = items.slice(0, 6).map((it) =>
      h(it.tool ? "button" : "div", { class: `today-item ${it.urgency}`, ...(it.tool ? { onclick: () => openTool(it.tool!) } : {}) },
        h("span", { class: "today-icon" }, it.icon),
        h("span", { class: "today-text" }, h("strong", {}, it.title), h("span", {}, it.detail))));
    body.replaceChildren(
      ...(rows.length ? rows : [h("p", { class: "muted small" }, "Nothing pressing today.")]),
      days ? "" : h("p", { class: "muted small" }, "The forecast didn't load; showing your records only."),
      items.length > 6 ? h("p", { class: "muted small" }, `And ${items.length - 6} more.`) : "");
  });
  return card;
}
