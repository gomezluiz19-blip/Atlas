// Each tab's front page: one sentence worth reading, worked out from your people, plans and places, over one
// visual that earns its place (a plate of your people on the planet, a ribbon of the coming hours, a mosaic of
// what's alive near you). Tools and the planet's deeper views come after, never first.
import type { App } from "../app";
import { Cartesian2 } from "cesium";
import { weatherText } from "../analysis/climate";
import { countryAt } from "../data/countries";
import { speciesCounts, taxonPageUrl, type SpeciesCount } from "../data/inaturalist";
import { forecast, hours48, outlook, type Outlook } from "../data/openmeteo";
import { iso3 } from "../data/people";
import { gatherAll } from "../plans/gather";
import { colorOf, initials, loadPeople, timeThere, partOfDay } from "../people/mine";
import { weatherAt } from "../people/mineUi";
import { footprint } from "../social/footprint";
import { faceWithStatus, openFriend, statusEditor, statusLine } from "../social/friends";
import { findProfile, following, me, onAccount } from "../social/store";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { aheadLede, aheadNotes, dayAt, hoursLede, peopleLede, peopleSummary, tempColor, TONES, type AheadNote, type DayWx, type Someone } from "./model";

type Spot = { lon: number; lat: number };
type Named = Spot & { name: string };

/** Where "here" is for you: your saved home, else your first saved place, else the middle of the map. */
export function anchor(app: App): Named | null {
  try {
    const all = JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]") as { kind?: string; name: string; lon: number; lat: number }[];
    const p = all.find((x) => x.kind === "home") ?? all[0];
    if (p && Number.isFinite(p.lon)) return { name: p.name, lon: p.lon, lat: p.lat };
  } catch { /* private mode */ }
  const cv = app.globe.viewer.canvas;
  if (app.globe.viewer.camera.positionCartographic.height > 3_000_000) return null;
  const c = app.globe.pick(new Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2));
  return c ? { name: "the map's centre", lon: c.lon, lat: c.lat } : null;
}

/** The sentence at the top of a front page. */
export function lede(kicker: string, title: string, line = ""): HTMLElement {
  return h("header", { class: "bf-lede" }, h("p", { class: "bf-kicker" }, kicker), h("h2", { class: "bf-title" }, title), line ? h("p", { class: "bf-line" }, line) : "");
}

/** A dark plate framed by registration marks, for the one visual a page leads with. */
const plate = (...content: (Node | string)[]) => h("div", { class: "bf-plate" }, ...content, h("span", { class: "bf-reg reg", "aria-hidden": "true" }));

const dayWord = (date: string, inDays: number) => inDays === 0 ? "Today" : inDays === 1 ? "Tomorrow" : new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

// ---- You ---------------------------------------------------------------------------------------------

/** You, first: your tile and status, your page, and setting what you're up to. Or the way to make a page. */
export function youCard(app: App): HTMLElement {
  const box = h("section", { class: "bf-you" });
  const draw = () => {
    const p = me();
    if (!p) {
      box.replaceChildren(h("div", { class: "bf-you-cta" },
        h("span", {}, h("strong", {}, "Your page on Terreno"), h("small", {}, "The places you love, what you're up to, and the people you keep up with.")),
        h("button", { class: "primary-btn", onclick: () => app.actions.get("account:signin")?.run() }, "Make your page")));
      return;
    }
    const slot = h("div", { class: "bf-you-slot" });
    box.replaceChildren(
      h("div", { class: "bf-you-row" },
        h("button", { class: "bf-you-face", "aria-label": "Your page", onclick: () => app.actions.get("profile:me")?.run() }, faceWithStatus(p, 52)),
        h("div", { class: "bf-you-text" }, h("strong", {}, p.name), statusLine(p) || h("p", { class: "fr-status none" }, "No status set")),
        h("div", { class: "bf-you-acts" },
          h("button", { class: "pill-btn", onclick: () => slot.replaceChildren(statusEditor(p, () => { slot.replaceChildren(); draw(); })) }, p.status ? "Update" : "Set status"),
          h("button", { class: "pill-btn", onclick: () => app.actions.get("profile:me")?.run() }, "My page"))),
      slot);
  };
  draw();
  const off = onAccount(() => (box.isConnected ? draw() : off()));
  return box;
}

// ---- People -----------------------------------------------------------------------------------------

/** Where your people are: on the planet, in a sentence, and as faces with their time. */
export function peopleFront(app: App): HTMLElement {
  const home = anchor(app);
  const mine = loadPeople();
  const followed = following().flatMap((hd) => { const p = findProfile(hd); return p?.home ? [p] : []; });
  const everyone: (Someone & { open: () => void; face: () => HTMLElement })[] = [
    ...mine.map((p) => ({ name: p.name, where: p.where, lon: p.lon, lat: p.lat, tz: p.tz,
      open: () => { void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: 3000 }); app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.relation ? `${p.name} · ${p.relation}` : p.name, context: p.where }); },
      face: () => h("span", { class: "ppl-avatar", style: `--c:${colorOf(p)};width:44px;height:44px;font-size:16px` }, initials(p.name)) })),
    ...followed.map((p) => ({ name: p.name, where: p.home!.name, lon: p.home!.lon, lat: p.home!.lat,
      open: () => openFriend(app, p.handle), face: () => faceWithStatus(p, 44) })),
  ];
  const box = h("section", { class: "bf bf-people" });
  const title = h("div");
  const faces = h("div", { class: "bf-faces" });
  const drawLede = () => {
    const l = peopleLede(peopleSummary(everyone, home, new Date()));
    title.replaceChildren(lede(everyone.length ? "Your people" : "People", l.title, l.line));
  };
  drawLede();
  if (!everyone.length) {
    box.append(title, h("button", { class: "primary-btn", onclick: () => box.parentElement?.querySelector<HTMLButtonElement>(".ppl-box .primary-btn")?.click() }, "Add someone"));
    return box;
  }
  const near = home ? [...everyone].sort((a, b) => Math.hypot(a.lon - home.lon, a.lat - home.lat) - Math.hypot(b.lon - home.lon, b.lat - home.lat)) : everyone;
  faces.append(...near.map((p) => {
    const time = h("small", { class: "bf-mono" }, "·");
    const tile = h("button", { class: "bf-face", onclick: p.open, title: `${p.name} · ${p.where}` }, p.face(), h("span", {}, p.name.split(" ")[0]), time);
    void weatherAt(p).then((w) => {
      if (!w) return;
      p.tz = w.tz;
      const t = timeThere(w.tz, new Date());
      if (t) { time.textContent = t.clock; tile.classList.toggle("asleep", !partOfDay(t.hour).awake); }
      drawLede();
    });
    return tile;
  }));
  box.append(
    plate(footprint({ places: everyone, home: home ?? undefined, accent: "#e1b843", height: 220 }),
      h("span", { class: "bf-plate-note bf-mono" }, `${everyone.length} ${everyone.length === 1 ? "person" : "people"}${home ? ` · from ${home.name.split(",")[0]}` : ""}`)),
    title, faces);
  return box;
}

// ---- Climate ----------------------------------------------------------------------------------------

/** The weather where you are, the hours ahead as a ribbon, the weather on your plans, and the news. */
export function climateFront(app: App): HTMLElement {
  const here = anchor(app);
  const box = h("section", { class: "bf bf-climate" });
  const today = h("div", {}, h("div", { class: "bf-wait" }));
  const ahead = h("div");
  const news = h("div");
  box.append(today, ahead, news);
  if (!here) {
    today.replaceChildren(lede("Weather", "Where's home?", "Save your home in My Place, or zoom into a town, and the weather there leads this page."));
  } else {
    void Promise.all([forecast(here.lon, here.lat), hours48(here.lon, here.lat)]).then(([f, hrs]) => {
      const sky = weatherText(f.current.weather_code).text;
      const now = Date.parse(f.current.time);
      const hours = hrs.hourly.time.map((t, i) => ({ time: t, temp: hrs.hourly.temperature_2m[i], chance: hrs.hourly.precipitation_probability[i] ?? 0 }))
        .filter((x) => Date.parse(x.time) >= now - 3_600_000).slice(0, 24);
      const place = here.name.split(",")[0];
      const d0 = f.daily;
      today.replaceChildren(
        lede(`Weather · ${place}`, `${Math.round(f.current.temperature_2m)}° and ${sky.toLowerCase()}.`, `${hoursLede(hours, f.current.temperature_2m)} Today ${Math.round(d0.temperature_2m_min[0])}° to ${Math.round(d0.temperature_2m_max[0])}°.`),
        ribbon(hours));
    }).catch(() => today.replaceChildren(lede("Weather", "The forecast didn't load.", "Try again in a moment.")));
  }

  // The weather on what you've planned (and where your people are, today).
  const plans = gatherAll().filter((p) => { const d = (Date.parse(p.date) - Date.now()) / 86_400_000; return d > -1 && d < 16; }).slice(0, 12);
  const people = loadPeople().slice(0, 8);
  if (!plans.length && !people.length) {
    ahead.replaceChildren(h("div", { class: "bf-empty" }, h("p", {}, "Plan a trip or an outing, and its weather shows here: rain on the day, a heatwave on the way."),
      h("button", { class: "pill-btn", onclick: () => app.actions.get("travel:plan")?.run() }, "Plan a trip")));
  } else {
    ahead.replaceChildren(h("div", { class: "bf-wait" }));
    const cache = new Map<string, Promise<Outlook | null>>();
    const get = (p: Spot) => { const k = `${p.lon.toFixed(1)},${p.lat.toFixed(1)}`; if (!cache.has(k)) cache.set(k, outlook(p.lon, p.lat).catch(() => null)); return cache.get(k)!; };
    void Promise.all([...plans, ...people].map((p) => get(p))).then(async () => {
      const days = new Map<string, DayWx[]>();
      for (const [k, v] of cache) { const o = await v; if (o) days.set(k, o.daily.time.map((_, i) => dayAt(o.daily, i))); }
      const key = (p: Spot) => `${p.lon.toFixed(1)},${p.lat.toFixed(1)}`;
      const todayIso = new Date().toISOString().slice(0, 10);
      const notes = aheadNotes(plans, (p) => days.get(key(p)), todayIso);
      const theirs = people.flatMap((p) => { const d = days.get(key(p))?.[0]; if (!d) return []; const n = aheadNotes([{ id: p.id, title: p.name, sub: p.where, date: d.date, lon: p.lon, lat: p.lat }], () => [d], d.date); return n.filter((x) => x.tone !== "fine").map((x) => ({ ...x, who: p.name.split(" ")[0], place: p.where.split(",")[0] })); });
      ahead.replaceChildren(
        notes.length ? h("div", { class: "bf-sec" }, h("p", { class: "bf-kicker" }, "Ahead of you"), h("p", { class: "bf-say" }, aheadLede(notes)), ...notes.map((n) => moment(n, () => go(app, n.plan)))) : "",
        theirs.length ? h("div", { class: "bf-sec" }, h("p", { class: "bf-kicker" }, "Where your people are, today"), ...theirs.map((n) => moment({ ...n, plan: { ...n.plan, title: `${n.who} in ${n.place}` } }, () => go(app, n.plan)))) : "",
        !notes.length && !theirs.length ? h("p", { class: "bf-say" }, plans.length ? "Your plans fall beyond the forecast's two weeks; their weather shows here as they come into range." : "Calm weather wherever your people are today.") : "");
    });
  }

  // What the climate is doing: open natural events near home or your people, and the week's climate news.
  void (async () => {
    const [{ naturalEvents, newsAbout, EVENT_LOOK }] = await Promise.all([import("../live/news")]);
    const spots = [...(here ? [here] : []), ...people];
    const [events, heads] = await Promise.all([naturalEvents().catch(() => []), newsAbout("climate").catch(() => [])]);
    const near = events.map((e) => ({ e, km: Math.min(...spots.map((s) => Math.hypot((e.lon - s.lon) * Math.cos((s.lat * Math.PI) / 180), e.lat - s.lat) * 111)) }))
      .filter((x) => spots.length && x.km < 800).sort((a, b) => a.km - b.km).slice(0, 3);
    if (!near.length && !heads.length) return;
    news.replaceChildren(h("div", { class: "bf-sec" }, h("p", { class: "bf-kicker" }, "The climate this week"),
      ...near.map(({ e, km }) => h("button", { class: "bf-moment", style: `--c:${EVENT_LOOK[e.kind].color}`, onclick: () => void flyToPlace(app.globe, { name: e.title, lon: e.lon, lat: e.lat, radius: 200_000 }) },
        h("i"), h("span", {}, h("strong", {}, e.title), h("small", {}, `${EVENT_LOOK[e.kind].label} · about ${Math.round(km / 10) * 10} km from ${here && km < 9999 ? "you" : "your people"}`)))),
      ...heads.slice(0, 3).map((x) => h("a", { class: "bf-story", href: x.url, target: "_blank", rel: "noopener" }, x.image ? h("img", { src: x.image, alt: "", loading: "lazy" }) : "", h("span", {}, h("strong", {}, x.title), h("small", {}, x.source))))));
  })();
  return box;
}

/** The next 24 hours as a ribbon: each hour its temperature's pigment, rain as a veil from the top. */
function ribbon(hours: { time: string; temp: number; chance: number }[]): HTMLElement {
  const hi = Math.max(...hours.map((x) => x.temp)), lo = Math.min(...hours.map((x) => x.temp));
  return plate(h("div", { class: "bf-ribbon", role: "img", "aria-label": `The next ${hours.length} hours: ${Math.round(lo)}° to ${Math.round(hi)}°` },
    ...hours.map((x, i) => {
      const hr = Number(x.time.slice(11, 13));
      return h("span", { class: "bf-hour", style: `--t:${tempColor(x.temp)};--r:${Math.min(1, x.chance / 100)}`, title: `${x.time.slice(11, 16)} · ${Math.round(x.temp)}° · rain ${x.chance}%` },
        h("i"), i === 0 || hr % 6 === 0 ? h("small", { class: "bf-mono" }, i === 0 ? "Now" : `${String(hr).padStart(2, "0")}`) : "",
        x.temp === hi || x.temp === lo ? h("b", { class: "bf-mono" }, `${Math.round(x.temp)}°`) : "");
    })));
}

function moment(n: AheadNote, open: () => void): HTMLElement {
  return h("button", { class: `bf-moment${n.tone === "fine" ? " fine" : ""}`, style: `--c:${TONES[n.tone].color}`, onclick: open },
    h("i"), h("span", {}, h("small", { class: "bf-mono" }, dayWord(n.plan.date, n.inDays)), h("strong", {}, n.plan.title), h("small", {}, `${n.words}${n.advice ? `. ${n.advice}` : ""}`)));
}

const go = (app: App, p: { title: string; lon: number; lat: number; sub?: string }) => {
  void flyToPlace(app.globe, { name: p.title, lon: p.lon, lat: p.lat, radius: 8000 });
  app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.title, context: p.sub ?? "" });
};

// ---- Nature -----------------------------------------------------------------------------------------

/** What's alive near you this month: photos people took, as a mosaic of tiles. */
export function natureFront(app: App): HTMLElement {
  const here = anchor(app);
  const box = h("section", { class: "bf bf-nature" });
  if (!here) { box.append(lede("Nature", "What's alive near you?", "Save your home in My Place, or zoom into anywhere, to see what people have spotted there this month.")); return box; }
  box.append(h("div", { class: "bf-wait" }));
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const a = { lon: here.lon, lat: here.lat, radiusKm: 20 };
  void Promise.all([
    speciesCounts(a, `iconic_taxa=Plantae,Fungi&d1=${since}`, { perPage: 8 }).catch(() => ({ total: 0, results: [] as SpeciesCount[] })),
    speciesCounts(a, `iconic_taxa=Aves,Mammalia,Insecta,Reptilia,Amphibia&d1=${since}`, { perPage: 8 }).catch(() => ({ total: 0, results: [] as SpeciesCount[] })),
  ]).then(([plants, animals]) => {
    const place = here.name.split(",")[0];
    const total = plants.total + animals.total;
    if (!total) { box.replaceChildren(lede("Nature", `Quiet around ${place} this month.`, "No sightings recorded within 20 km in the last 30 days.")); return; }
    const mosaic = (rs: SpeciesCount[]) => h("div", { class: "bf-mosaic" }, ...rs.filter((r) => r.taxon.default_photo?.medium_url || r.taxon.default_photo?.square_url).slice(0, 8).map((r) =>
      h("a", { class: "bf-tessera", href: taxonPageUrl(r.taxon), target: "_blank", rel: "noopener", title: r.taxon.default_photo?.attribution ?? "" },
        h("img", { src: r.taxon.default_photo!.medium_url ?? r.taxon.default_photo!.square_url!, alt: r.taxon.preferred_common_name ?? r.taxon.name, loading: "lazy" }),
        h("span", {}, h("strong", {}, r.taxon.preferred_common_name ?? r.taxon.name), h("small", { class: "bf-mono" }, `${r.count}×`)))));
    const top = animals.results[0]?.taxon, topPlant = plants.results[0]?.taxon;
    const line = [top ? `Most seen: ${top.preferred_common_name ?? top.name}` : "", topPlant ? `${(topPlant.preferred_common_name ?? topPlant.name).toLowerCase()} among the plants` : ""].filter(Boolean).join("; ");
    box.replaceChildren(
      lede(`Nature · around ${place}`, `${total.toLocaleString("en-US")} kinds of life seen in the last 30 days.`, `${line}. Within 20 km, by people out walking.`),
      animals.results.length ? h("div", { class: "bf-sec" }, h("p", { class: "bf-kicker" }, `Out and about · ${animals.total}`), mosaic(animals.results)) : "",
      plants.results.length ? h("div", { class: "bf-sec" }, h("p", { class: "bf-kicker" }, `Growing and blooming · ${plants.total}`), mosaic(plants.results)) : "",
      h("p", { class: "fineprint" }, "Research-grade sightings on iNaturalist. Tap one to see it there."));
  });
  return box;
}

// ---- Countries --------------------------------------------------------------------------------------

/** Your world: the countries your people live in and you're headed to, each with its time and its news. */
export function countriesFront(app: App): HTMLElement {
  const box = h("section", { class: "bf bf-countries" });
  const mine = loadPeople();
  const followed = following().flatMap((hd) => { const p = findProfile(hd); return p?.home ? [{ name: p.name, lon: p.home.lon, lat: p.home.lat }] : []; });
  const plans = gatherAll().filter((p) => { const d = (Date.parse(p.date) - Date.now()) / 86_400_000; return d > -1 && d < 90; });
  const home = anchor(app);
  const points: { why: "home" | "person" | "plan"; name: string; lon: number; lat: number; date?: string }[] = [
    ...(home && home.name !== "the map's centre" ? [{ why: "home" as const, name: home.name, lon: home.lon, lat: home.lat }] : []),
    ...mine.map((p) => ({ why: "person" as const, name: p.name, lon: p.lon, lat: p.lat })),
    ...followed.map((p) => ({ why: "person" as const, ...p })),
    ...plans.map((p) => ({ why: "plan" as const, name: p.title, lon: p.lon, lat: p.lat, date: p.date })),
  ];
  if (!points.length) {
    box.append(lede("Countries", "Your world, in countries.", "Add your people or plan a trip, and the countries in your life gather here with their time and their news. Or tap any country on the globe."));
    return box;
  }
  box.append(h("div", { class: "bf-wait" }));
  // Coastal cities can sit just off a simplified coastline: look a little inland before giving up.
  const findCountry = async (p: Spot) => {
    for (const [dx, dy] of [[0, 0], [0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3]]) {
      const c = await countryAt(p.lon + dx, p.lat + dy).catch(() => null);
      if (c) return c;
    }
    return null;
  };
  void Promise.all(points.map(async (p) => ({ p, c: await findCountry(p) }))).then((rows) => {
    const by = new Map<string, { name: string; id: string; pts: typeof points }>();
    for (const { p, c } of rows) { if (!c) continue; const g = by.get(c.id) ?? { name: c.name, id: c.id, pts: [] }; g.pts.push(p); by.set(c.id, g); }
    const list = [...by.values()].sort((a, b) => Number(b.pts.some((x) => x.why === "home")) - Number(a.pts.some((x) => x.why === "home")) || b.pts.length - a.pts.length);
    const peopleIn = list.filter((g) => g.pts.some((x) => x.why === "person")).length;
    const trips = list.filter((g) => g.pts.some((x) => x.why === "plan") && !g.pts.some((x) => x.why === "home"));
    box.replaceChildren(
      lede("Your world", `${list.length} ${list.length === 1 ? "country is" : "countries are"} part of your life.`, [peopleIn ? `Your people live in ${peopleIn}.` : "", trips.length ? `You're headed to ${trips.map((t) => t.name).join(" and ")}.` : ""].filter(Boolean).join(" ")),
      h("div", { class: "bf-countries-list" }, ...list.map((g) => countryCard(app, g))));
  });
  return box;
}

function countryCard(app: App, g: { name: string; id: string; pts: { why: string; name: string; lon: number; lat: number; date?: string }[] }): HTMLElement {
  const at = g.pts[0];
  const time = h("span", { class: "bf-mono" });
  const head = h("small", { class: "bf-headline" });
  const who = g.pts.filter((x) => x.why === "person").map((x) => x.name.split(" ")[0]);
  const plan = g.pts.filter((x) => x.why === "plan").sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0];
  void weatherAt(at).then((w) => { if (!w) return; const t = timeThere(w.tz, new Date()); time.textContent = `${t?.clock ?? ""} · ${w.temp}° ${w.text.toLowerCase()}`; });
  void import("../live/news").then((m) => m.newsAbout(g.name)).then((hs) => { if (hs[0]) head.textContent = hs[0].title; }).catch(() => {});
  return h("button", { class: "bf-country", onclick: () => { void flyToPlace(app.globe, { name: g.name, lon: at.lon, lat: at.lat, radius: 900_000 }); app.select({ lon: at.lon, lat: at.lat, height: 0 }, { title: g.name, context: "Country" }); } },
    h("span", { class: "bf-code bf-mono" }, iso3(g.id) ?? g.name.slice(0, 3).toUpperCase()),
    h("span", { class: "bf-country-text" },
      h("strong", {}, g.name, " ", time),
      h("small", {}, [g.pts.some((x) => x.why === "home") ? "Home" : "", who.length ? who.join(", ") : "", plan ? `${plan.name}, ${new Date(`${plan.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""].filter(Boolean).join(" · ")),
      head),
    h("span", { class: "chev", html: "&rsaquo;" }));
}
