// Travel: say where and when, and the trip comes together as a boarding pass:
// the two airports (or cities) with the plane crossing between them, when you
// leave and when you land in local time, the time change and how the body will
// take it, and a strip of the day you land showing whether it's dark or light.
// The way there is drawn on the globe with drops flowing along it. Then the
// weather on each day you're there, every way there door to door (time and
// carbon), where to stay for what you came to see (the sweet spot, and each
// stay scored by the sights within a 15-minute walk), and where to book each
// part. One tap saves it to your trips, where it plays on the globe.
import type { App } from "../app";
import { getJson } from "../data/http";
import { airports } from "../data/infra";
import { overpass } from "../data/overpass";
import { arcFlow, frame, OpsMap, title } from "../pro/kit/ui";
import { h } from "../ui/dom";
import { flyToPlace, geocode } from "../ui/search";
import type { WorkCtx } from "../work/hub";
import type { Journey } from "../work/journeyModel";
import type { WorkFeature } from "../work/layer";
import { ListStore, newId } from "../work/store";
import {
  addDays, arrival, bookingLinks, datesBetween, flightHours, forecastReaches, jetLag, km, nightsBetween, pickAirports, rankStays, shiftText,
  splitStays, stayLink, staysQuery, sweetSpot, WAYS, waysThere, weatherLine, wxEmoji, type Pt, type Stay, type WayEstimate,
} from "./trip";

const NS = "http://www.w3.org/2000/svg";
const svgEl = <T extends keyof SVGElementTagNameMap>(t: T, a: Record<string, string | number> = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); return e; };
const DAY = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const hrs = (x: number) => { const m = Math.round(x * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };

let map: OpsMap | null = null;

interface Wx { utc_offset_seconds?: number; daily?: { time: string[]; weather_code?: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum?: number[]; sunrise?: string[]; sunset?: string[] } }

/** The weather on the dates (forecast, else last year's), and the place's UTC offset. */
async function weatherFor(p: Pt, from: string, to: string): Promise<{ wx: Wx; forecast: boolean }> {
  const daily = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset";
  if (forecastReaches(to)) {
    const today = new Date().toISOString().slice(0, 10);
    const a = from < today ? today : from;
    return { forecast: true, wx: await getJson<Wx>("Open-Meteo", `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=${daily}&timezone=auto&start_date=${a}&end_date=${to}`) };
  }
  const y = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
  return { forecast: false, wx: await getJson<Wx>("Open-Meteo", `https://archive-api.open-meteo.com/v1/archive?latitude=${p.lat}&longitude=${p.lon}&daily=${daily}&timezone=auto&start_date=${y(from)}&end_date=${y(to)}`) };
}
const offsetOf = (p: Pt) => getJson<Wx>("Open-Meteo", `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m&timezone=auto&forecast_days=1`).then((r) => r.utc_offset_seconds ?? 0);

/** The boarding pass: codes, the arc with the plane crossing, times, and the stub. */
function boardingPass(o: { from: Pt; to: Pt; fromCode: string; toCode: string; way: WayEstimate; depart: string; time: string; land: { time: string; dayShift: number }; shift: string; people: number; sun?: { rise: string; set: string } }): HTMLElement {
  const arcSvg = svgEl("svg", { viewBox: "0 0 300 70", class: "bp-arc", "aria-hidden": "true" });
  const path = "M14,58 Q150,-6 286,58";
  arcSvg.append(svgEl("path", { d: path, class: "bp-path" }));
  const plane = svgEl("text", { class: "bp-plane", "text-anchor": "middle", "dominant-baseline": "central" });
  plane.textContent = WAYS[o.way.way].emoji;
  const mot = svgEl("animateMotion", { dur: "6s", repeatCount: "indefinite", path, rotate: o.way.way === "fly" ? "auto" : "0" });
  plane.append(mot);
  arcSvg.append(plane, svgEl("circle", { cx: 14, cy: 58, r: 4, class: "bp-end" }), svgEl("circle", { cx: 286, cy: 58, r: 4, class: "bp-end" }));
  const landDate = addDays(o.depart, o.land.dayShift);
  return h("div", { class: "bpass" },
    h("div", { class: "bp-main" },
      h("div", { class: "bp-top" }, h("span", {}, "TERRENO · ", o.way.way === "fly" ? "BOARDING PASS" : "TRAVEL PASS"), h("span", {}, `${WAYS[o.way.way].emoji} ${hrs(o.way.way === "fly" ? flightHours(km(o.from, o.to)) : o.way.hours)}`)),
      h("div", { class: "bp-route" },
        h("div", { class: "bp-end-col" }, h("strong", { class: "bp-code" }, o.fromCode), h("small", {}, o.from.name)),
        arcSvg,
        h("div", { class: "bp-end-col right" }, h("strong", { class: "bp-code" }, o.toCode), h("small", {}, o.to.name))),
      h("div", { class: "bp-times" },
        h("div", {}, h("small", {}, "LEAVE"), h("strong", {}, o.time), h("small", {}, DAY(o.depart))),
        h("div", { class: "bp-shift" }, h("small", {}, "TIME"), h("strong", {}, o.shift)),
        h("div", { class: "right" }, h("small", {}, "ARRIVE"), h("strong", {}, o.land.time), h("small", {}, `${DAY(landDate)}${o.land.dayShift > 0 ? ` (+${o.land.dayShift})` : ""}`))),
      o.sun ? dayStrip(o.land.time, o.sun.rise, o.sun.set) : ""),
    h("div", { class: "bp-stub" },
      h("div", {}, h("small", {}, "DISTANCE"), h("strong", {}, `${Math.round(o.way.km).toLocaleString()} km`)),
      h("div", {}, h("small", {}, "CO₂ EACH"), h("strong", {}, `~${Math.round(o.way.co2Kg).toLocaleString()} kg`)),
      h("div", {}, h("small", {}, "TRAVELLERS"), h("strong", {}, String(o.people)))));
}

/** The day you land, as a strip of night and daylight with the landing marked. */
function dayStrip(land: string, rise: string, set: string): HTMLElement {
  const m = (t: string) => { const [a, b] = t.split(":").map(Number); return (a * 60 + b) / 1440 * 100; };
  const r = m(rise.slice(11, 16)), s = m(set.slice(11, 16)), l = m(land);
  const dark = l < r || l > s, dusk = Math.min(Math.abs(l - r), Math.abs(l - s)) < 3;
  return h("div", { class: "bp-day" },
    h("div", { class: "bp-day-bar", style: `--r:${r}%;--s:${s}%` }, h("i", { class: "bp-land", style: `left:${l}%` })),
    h("small", {}, `You land ${dusk ? "around " + (Math.abs(l - r) < Math.abs(l - s) ? "sunrise" : "sunset") : dark ? "in the dark" : "in daylight"} · sunrise ${rise.slice(11, 16)}, sunset ${set.slice(11, 16)}`));
}

export interface TravelPrefill { from?: Pt; depart?: string; back?: string; people?: number }

export function openTravel(ctx: WorkCtx, app: App, dest?: Pt, pre: TravelPrefill = {}) {
  map ??= new OpsMap(app, "travel", "#0a84ff");
  const today = new Date().toISOString().slice(0, 10);
  const home = (() => { try { const all = JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]") as (Pt & { kind?: string })[]; return all.find((p) => p.kind === "home") ?? all[0] ?? null; } catch { return null; } })();
  let from: Pt | null = home ? { name: home.name, lon: home.lon, lat: home.lat } : null;
  let to: Pt | null = dest ?? null;
  let depart = addDays(today, 14), back = addDays(today, 19), time = "09:00", people = 2;
  if (pre.from) from = pre.from;
  if (pre.depart && pre.depart >= today) depart = pre.depart;
  if (pre.back && pre.back > depart) back = pre.back; else if (pre.depart) back = addDays(depart, 5);
  if (pre.people) people = Math.max(1, Math.min(9, pre.people));

  const status = h("p", { class: "muted small" });
  const body = h("div", {});
  const fromBox = h("input", { class: "pro-url", placeholder: "From: your town or address", value: from?.name ?? "", "aria-label": "From" }) as HTMLInputElement;
  const toBox = h("input", { class: "pro-url", placeholder: "To: a city, island, park or address", value: to?.name ?? "", "aria-label": "To" }) as HTMLInputElement;
  const date = (v: string, set: (v: string) => void, label: string) => h("input", { type: "date", class: "pro-url tr-date", value: v, min: today, "aria-label": label, onchange: (e: Event) => set((e.target as HTMLInputElement).value) });
  const resolve = async (box: HTMLInputElement, cur: Pt | null, near: Pt | null): Promise<Pt | null> => {
    const v = box.value.trim();
    if (!v) return null;
    if (cur && v === cur.name) return cur;
    const r = (await geocode(v, near).catch(() => []))[0];
    return r ? { name: r.name, lon: r.lon, lat: r.lat } : null;
  };

  async function go() {
    status.textContent = "Putting the trip together…";
    from = await resolve(fromBox, from, null);
    to = await resolve(toBox, to, from);
    if (!from || !to) { status.textContent = !from ? "Where are you leaving from?" : "Where are you going?"; return; }
    if (back <= depart) back = addDays(depart, 3);
    fromBox.value = from.name; toBox.value = to.name;
    await build(from, to);
  }

  async function build(a: Pt, b: Pt) {
    const d = km(a, b);
    const [ports, offA, wxr] = await Promise.all([airports().catch(() => []), offsetOf(a).catch(() => 0), weatherFor(b, depart, back).catch(() => null)]);
    const offB = wxr?.wx.utc_offset_seconds ?? (await offsetOf(b).catch(() => 0));
    const apA = pickAirports(ports, a), apB = pickAirports(ports, b);
    const flyable = d > 300 && apA.length > 0 && apB.length > 0;
    const ways = waysThere(a, b, people).filter((w) => w.way !== "fly" || flyable);
    if (!ways.length) { status.textContent = "That's close: walk, bike or drive it (Getting around)."; return; }
    const best = ways.find((w) => w.way === "fly") && d > 900 ? ways.find((w) => w.way === "fly")! : ways[0];
    const fromCode = best.way === "fly" ? apA[0].iata : a.name.slice(0, 3).toUpperCase(), toCode = best.way === "fly" ? apB[0].iata : b.name.slice(0, 3).toUpperCase();
    // Leave at `time` from the airport (fly) or the door.
    const under = best.way === "fly" ? flightHours(km(apA[0], apB[0])) : best.hours;
    const land = arrival(time, under, offA, offB);
    const days = wxr?.wx.daily;
    const landDay = addDays(depart, land.dayShift);
    const di = days?.time.findIndex((t) => t.slice(5) === landDay.slice(5)) ?? -1;
    const sun = days && di >= 0 && days.sunrise?.[di] && days.sunset?.[di] ? { rise: days.sunrise[di], set: days.sunset[di] } : undefined;

    // The globe: the way there, with drops flowing to the destination.
    const ends = best.way === "fly" ? [apA[0], apB[0]] : [a, b];
    const f = arcFlow("way", ends[0], ends[1], WAYS[best.way].color, 0.8, best.way !== "fly");
    const pts: WorkFeature[] = [{ id: "a", kind: "point", pts: [[a.lon, a.lat]], color: "#ffffff", label: a.name }, { id: "b", kind: "point", pts: [[b.lon, b.lat]], color: "#ffd60a", label: b.name }];
    map!.draw(`Trip to ${b.name}`, [f.line, ...pts], [f.flow]);
    frame(app, b.name, [a, b], 20_000);

    status.textContent = "";
    const stayBox = h("div", {}, title(`Where to stay in ${b.name}`), h("p", { class: "muted small" }, "Finding stays near what there is to see…"));
    body.replaceChildren(
      boardingPass({ from: a, to: b, fromCode, toCode, way: best, depart, time, land, shift: shiftText(offA, offB), people, sun }),
      h("p", { class: "tr-lag" }, jetLag(offA, offB)),
      wxRibbon(wxr),
      title("Every way there"),
      waysBlock(ways),
      stayBox,
      bookBlock(a, b, apA[0]?.iata, apB[0]?.iata, ways),
      h("div", { class: "row-btns" },
        h("button", { class: "primary-btn", onclick: () => play(a, b, best, apB[0]?.name) }, "▶ Play the trip"),
        h("button", { class: "pill-btn", onclick: () => save(a, b, best, apB[0]?.name) }, "＋ Save to my trips"),
        h("button", { class: "pill-btn", onclick: () => void flyToPlace(app.globe, { name: b.name, lon: b.lon, lat: b.lat, radius: 4000 }) }, `Look around ${b.name}`)),
      h("p", { class: "fineprint" }, "Times and carbon are typical door-to-door estimates; prices and timetables are on the booking sites. Weather by Open-Meteo; stays and sights from OpenStreetMap."));
    void staysFor(b, stayBox, [f.line, ...pts], [f.flow]);
  }

  function wxRibbon(w: { wx: Wx; forecast: boolean } | null): HTMLElement {
    const d = w?.wx.daily;
    if (!d?.time.length) return h("div", {});
    const rows = d.time.map((t, i) => ({ t, code: d.weather_code?.[i] ?? 0, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_sum?.[i] ?? 0 }));
    const lo = Math.min(...rows.map((r) => r.min)), hi = Math.max(...rows.map((r) => r.max)), span = Math.max(1, hi - lo);
    return h("div", { class: "tr-wx" },
      h("div", { class: "tr-wx-row" }, ...rows.map((r, i) => h("div", { class: "tr-wx-day", style: `animation-delay:${i * 40}ms` },
        h("small", {}, DAY(w!.forecast ? r.t : `${Number(r.t.slice(0, 4)) + 1}${r.t.slice(4)}`).split(" ")[0].replace(",", "")),
        h("span", { class: "tr-wx-em" }, wxEmoji(r.code)),
        h("div", { class: "tr-wx-bar" }, h("i", { style: `bottom:${((r.min - lo) / span) * 100}%;height:${Math.max(6, ((r.max - r.min) / span) * 100)}%` })),
        h("strong", {}, `${Math.round(r.max)}°`), h("small", {}, `${Math.round(r.min)}°`),
        r.rain >= 1 ? h("small", { class: "tr-rain" }, `${Math.round(r.rain)} mm`) : h("small", { class: "tr-rain dry" }, "dry")))),
      h("p", { class: "muted small" }, weatherLine(rows, w!.forecast)));
  }

  function waysBlock(ways: WayEstimate[]): HTMLElement {
    const longest = Math.max(...ways.map((w) => w.hours)), dirtiest = Math.max(...ways.map((w) => w.co2Kg), 1);
    return h("div", { class: "tr-ways" }, ...ways.map((w, i) => h("div", { class: "tr-way" + (i === 0 ? " best" : ""), style: `--c:${WAYS[w.way].color}` },
      h("span", { class: "tr-way-name" }, `${WAYS[w.way].emoji} ${WAYS[w.way].label}`),
      h("span", { class: "tr-way-bar" }, h("i", { style: `width:${(w.hours / longest) * 100}%` })),
      h("strong", {}, hrs(w.hours)),
      h("span", { class: "tr-co2" }, h("i", { style: `width:${(w.co2Kg / dirtiest) * 100}%` })),
      h("small", { class: "muted" }, `door to door · ${Math.round(w.co2Kg)} kg CO₂ each${w.note ? ` · ${w.note}` : ""}`))));
  }

  async function staysFor(b: Pt, box: HTMLElement, base: WorkFeature[], flows: Parameters<OpsMap["draw"]>[2]) {
    try {
      const { stays, sights } = splitStays(await overpass(staysQuery(b.lon, b.lat)));
      const ranked = rankStays(stays, sights).slice(0, 12), spot = sweetSpot(sights);
      if (!stays.length) { box.replaceChildren(title(`Where to stay in ${b.name}`), h("p", { class: "muted small" }, "No stays mapped here on OpenStreetMap; the booking sites below will know more.")); return; }
      map!.draw(`Trip to ${b.name}`, [...base,
        ...sights.slice(0, 120).map((s, i): WorkFeature => ({ id: `s${i}`, kind: "point", pts: [[s.lon, s.lat]], color: "#ffd60a" })),
        ...ranked.slice(0, 8).map((s, i): WorkFeature => ({ id: `h${i}`, kind: "point", pts: [[s.lon, s.lat]], color: "#0a84ff", label: i < 3 ? s.name : undefined })),
      ], flows);
      const row = (s: Stay) => h("div", { class: "tr-stay" },
        h("button", { class: "tr-stay-main", onclick: () => void flyToPlace(app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: 900 }) },
          h("strong", {}, s.name), h("small", { class: "muted" }, `${s.kind.replace("_", " ")}${s.stars ? ` · ${"★".repeat(Math.min(5, s.stars))}` : ""} · ${Number.isFinite(s.nearestMin) ? `${Math.round(s.nearestMin)} min walk to the nearest sight` : "no sights mapped nearby"}`),
          h("span", { class: "tr-dots", title: `${s.near} sights within a 15-minute walk` }, ...Array.from({ length: Math.min(12, Math.max(s.near, 1)) }, (_, i) => h("i", { class: i < s.near ? "on" : "" })), h("small", {}, ` ${s.near} within 15 min`))),
        h("a", { class: "pill-btn", href: stayLink(s, b.name, depart, back, people), target: "_blank", rel: "noopener" }, "Book ↗"));
      box.replaceChildren(title(`Where to stay in ${b.name}`),
        spot && spot.n > 2 ? h("button", { class: "tr-sweet", onclick: () => void flyToPlace(app.globe, { name: spot.name, lon: spot.lon, lat: spot.lat, radius: 1500 }) }, h("span", {}, "◎"), h("span", {}, h("strong", {}, `The sweet spot: around ${spot.name}`), h("small", {}, ` ${spot.n} sights within a kilometre`))) : "",
        h("p", { class: "muted small" }, `${sights.length} sights and ${stays.length} stays mapped within 3 km. Stays are ranked by what's within a 15-minute walk (yellow on the map: sights; blue: the best stays).`),
        h("div", { class: "tr-stays" }, ...ranked.map(row)));
    } catch { box.replaceChildren(title(`Where to stay in ${b.name}`), h("p", { class: "muted small" }, "Couldn't reach OpenStreetMap just now.")); }
  }

  function bookBlock(a: Pt, b: Pt, ia: string | undefined, ib: string | undefined, ways: WayEstimate[]): HTMLElement {
    const links = bookingLinks({ from: a, to: b, fromIata: ia, toIata: ib, depart, back, people, ways: ways.map((w) => w.way) });
    const group = (what: string, label: string) => { const l = links.filter((x) => x.what === what); return l.length ? h("div", { class: "tr-book-group" }, h("small", {}, label), h("div", { class: "row-btns" }, ...l.map((x) => h("a", { class: "pill-btn", href: x.url, target: "_blank", rel: "noopener" }, `${x.label} ↗`)))) : ""; };
    return h("div", { class: "tr-book" }, title("Book it"), group("flights", "✈️ Flights"), group("trains", "🚆 Trains and buses"), group("stays", "🛏 Stays"), group("cars", "🚗 Cars"), group("route", "🧭 The drive"),
      h("p", { class: "fineprint" }, `Each opens already searched for ${nightsBetween(depart, back)} nights, ${people} ${people === 1 ? "traveller" : "travellers"}.`));
  }

  /** The trip as a journey: there, the stay, and home again. */
  function journeyOf(a: Pt, b: Pt, way: WayEstimate, airport?: string): Journey {
    const id = () => newId();
    const mode = way.way === "fly" ? "fly" : way.way === "train" ? "train" : way.way === "bus" ? "bus" : "drive";
    return {
      id: id(), name: `${b.name}, ${DAY(depart)}`, start: depart, time, origin: { name: a.name, lon: a.lon, lat: a.lat }, created: Date.now(),
      steps: [
        { id: id(), kind: "move", mode, to: { name: b.name, detail: airport, lon: b.lon, lat: b.lat } },
        { id: id(), kind: "stay", place: { name: b.name, lon: b.lon, lat: b.lat }, nights: nightsBetween(depart, back), visits: [] },
        { id: id(), kind: "move", mode, to: { name: a.name, lon: a.lon, lat: a.lat } },
      ],
      notes: `Dates: ${datesBetween(depart, back)[0]} to ${back}. ${people} travellers.`,
    };
  }
  function save(a: Pt, b: Pt, way: WayEstimate, airport?: string) {
    new ListStore<Journey>("atlas.work.journeys.v1").push(journeyOf(a, b, way, airport));
    app.toast(`Saved to your trips: Create › Plan › Trips, and My plans.`, 5000);
  }
  function play(a: Pt, b: Pt, way: WayEstimate, airport?: string) {
    void import("./playTrip").then((m) => m.playTrip(app, journeyOf(a, b, way, airport)));
  }

  const swap = () => { const t = fromBox.value; fromBox.value = toBox.value; toBox.value = t; [from, to] = [to, from]; };
  ctx.show("Travel", ctx.home,
    h("p", { class: "sc-lede" }, "Where to, and when? The way there, the time change, the weather, where to stay and where to book."),
    h("div", { class: "tr-form" },
      h("div", { class: "tr-ends" }, fromBox, h("button", { class: "round-btn tr-swap", "aria-label": "Swap from and to", onclick: swap }, "⇅"), toBox),
      h("div", { class: "tr-when" },
        h("label", {}, h("small", {}, "Leave"), date(depart, (v) => { depart = v; }, "Leave on")),
        h("label", {}, h("small", {}, "Come back"), date(back, (v) => { back = v; }, "Come back on")),
        h("label", {}, h("small", {}, "At"), h("input", { type: "time", class: "pro-url tr-date", value: time, "aria-label": "Leave at", onchange: (e: Event) => { time = (e.target as HTMLInputElement).value || "09:00"; } })),
        h("label", {}, h("small", {}, "People"), h("input", { type: "number", class: "pro-url tr-date", min: 1, max: 9, value: people, "aria-label": "Travellers", onchange: (e: Event) => { people = Math.max(1, Math.min(9, Number((e.target as HTMLInputElement).value) || 1)); } }))),
      h("button", { class: "primary-btn", onclick: () => void go() }, "✈ Plan the trip")),
    status, body);
  for (const b of [fromBox, toBox]) b.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void go(); });
  if (from && to) void go();
}

export const clearTravel = () => map?.clear();
