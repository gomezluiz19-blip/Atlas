// The Today card at the top of My Place: the brief for your main place.
import { farmWeather, hourlyHumid, siteWeather } from "../data/openmeteo";
import { flystrikeDays, huttonPeriods } from "./risks";
import { areaM2 } from "../work/geo";
import { cropById, mergeDays, season } from "../work/growModel";
import { h } from "../ui/dom";
import type { MyPlace } from "./store";
import { localRecords, todayItems, type FieldLite, type FieldSeason, type TodayItem } from "./today";

/** Each field's season (up to four fields, near this place), for the brief. */
async function seasonsFor(fields: FieldLite[], place: MyPlace, today: string): Promise<FieldSeason[]> {
  const near = fields.filter((f) => f.pts && f.pts.length >= 3).map((f) => {
    const lon = f.pts!.reduce((t, p) => t + p[0], 0) / f.pts!.length, lat = f.pts!.reduce((t, p) => t + p[1], 0) / f.pts!.length;
    return { f, lon, lat, d: Math.hypot(lon - place.lon, lat - place.lat) };
  }).filter((x) => x.d < 0.5).sort((a, b) => a.d - b.d).slice(0, 4);
  const out = await Promise.allSettled(near.map(async ({ f, lon, lat }) => {
    const w = await farmWeather(lon, lat, f.planted);
    const s = season(cropById(f.crop), f.planted, mergeDays(w.older, w.recent), today);
    return { id: f.id, name: f.name, stage: s.stage.name, harvest: s.harvest, irrigate7: s.irrigate7, m2: areaM2(f.pts!), frost: s.frost.length > 0 } satisfies FieldSeason;
  }));
  return out.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const cache = new Map<string, { at: number; days: Awaited<ReturnType<typeof siteWeather>> }>();

/** Blight and flystrike weather, fetched only when there are potatoes, tomatoes or sheep to worry about. */
async function risksFor(place: MyPlace, records: ReturnType<typeof localRecords>) {
  const need = records.fields.some((f) => f.crop === "potato" || f.crop === "tomato") || !!records.flock?.animals.some((a) => a.species === "sheep");
  if (!need) return undefined;
  const hours = await hourlyHumid(place.lon, place.lat).catch(() => null);
  return hours ? { hutton: huttonPeriods(hours), flystrike: flystrikeDays(hours) } : undefined;
}

/** Today's items for a place (for Atlas AI and anything else that wants them as data). */
export async function briefFor(place: MyPlace): Promise<TodayItem[]> {
  const days = await siteWeather(place.lon, place.lat).catch(() => null);
  const records = localRecords();
  const [seasons, risks] = await Promise.all([seasonsFor(records.fields, place, localDate()).catch(() => []), risksFor(place, records)]);
  return todayItems({ today: localDate(), weather: days, ...records, seasons, risks });
}

export function todayCard(place: MyPlace, openTool: (t: NonNullable<TodayItem["tool"]>, ref?: string) => void): HTMLElement {
  const body = h("div", { class: "today-list" }, h("p", { class: "muted small" }, "Checking the forecast and your records…"));
  const when = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const card = h("section", { class: "today-card" },
    h("div", { class: "today-head" }, h("strong", {}, `Today at ${place.name}`), h("span", {}, when)),
    body);
  const key = `${place.lon.toFixed(2)},${place.lat.toFixed(2)}`;
  const hit = cache.get(key);
  const weather = hit && Date.now() - hit.at < 30 * 60_000 ? Promise.resolve(hit.days) : siteWeather(place.lon, place.lat).then((days) => { cache.set(key, { at: Date.now(), days }); return days; });
  const records = localRecords();
  const seasons = seasonsFor(records.fields, place, localDate()).catch(() => []);
  void Promise.all([weather.catch(() => null), seasons, risksFor(place, records)]).then(([days, seasons, risks]) => {
    const items = todayItems({ today: localDate(), weather: days, ...records, seasons, risks });
    const rows = items.slice(0, 6).map((it) =>
      h(it.tool ? "button" : "div", { class: `today-item ${it.urgency}`, ...(it.tool ? { onclick: () => openTool(it.tool!, it.ref) } : {}) },
        h("span", { class: "today-icon" }, it.icon),
        h("span", { class: "today-text" }, h("strong", {}, it.title), h("span", {}, it.detail))));
    body.replaceChildren(
      ...(rows.length ? rows : [h("p", { class: "muted small" }, "Nothing pressing today.")]),
      days ? "" : h("p", { class: "muted small" }, "The forecast didn't load; showing your records only."),
      items.length > 6 ? h("p", { class: "muted small" }, `And ${items.length - 6} more.`) : "");
  });
  return card;
}
