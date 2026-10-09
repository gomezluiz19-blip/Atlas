// My people on screen: a box of family and others (their time, their weather, how far), a short form to
// add someone, and their pins on the globe. See ./mine.ts for the model; everything stays on this device.
import { ArcType, Cartesian2, Cartesian3, Color, CustomDataSource, HeightReference, LabelStyle, PolylineGlowMaterialProperty, VerticalOrigin } from "cesium";
import type { App } from "../app";
import { weatherText } from "../analysis/climate";
import { forecast } from "../data/openmeteo";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { flyToPlace, geocode } from "../ui/search";
import {
  addPerson, colorOf, farText, grouped, initials, kmBetween, loadPeople, newPerson, onPeople, partOfDay, RELATIONS, removePerson, timeThere, updatePerson,
  type Circle, type Person,
} from "./mine";

type Spot = { lon: number; lat: number };

/** The saved home in My Place, if any: distances are measured from there. */
function home(): (Spot & { name: string }) | null {
  try {
    const all = JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]") as { kind?: string; name: string; lon: number; lat: number }[];
    const h0 = all.find((p) => p.kind === "home");
    return h0 && Number.isFinite(h0.lon) ? h0 : null;
  } catch { return null; }
}

/** Weather and time zone per place, fetched once a session. */
const wxCache = new Map<string, Promise<{ tz: string; temp: number; text: string } | null>>();
export function weatherAt(p: Spot) {
  const key = `${p.lon.toFixed(2)},${p.lat.toFixed(2)}`;
  if (!wxCache.has(key)) wxCache.set(key, forecast(p.lon, p.lat).then((f) => ({ tz: f.timezone, temp: Math.round(f.current.temperature_2m), text: weatherText(f.current.weather_code).text })).catch(() => null));
  return wxCache.get(key)!;
}

const avatar = (p: Person, size = 36) =>
  h("span", { class: "ppl-avatar", style: `--c:${colorOf(p)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px` }, initials(p.name));

/** Opens a person's place: the map flies there and the card shows it. */
function focus(app: App, p: Person) {
  void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: 3000 });
  app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.relation ? `${p.name} · ${p.relation}` : p.name, context: p.where });
}

/** One person: who, where, their time and weather, how far. */
function row(app: App, p: Person, from: Spot | null, managing: boolean, redraw: () => void): HTMLElement {
  const time = h("span", { class: "ppl-time" });
  const wx = h("span", { class: "ppl-wx" });
  const paint = (tz?: string) => {
    const t = tz ? timeThere(tz, new Date()) : null;
    if (!t) return;
    const d = partOfDay(t.hour);
    time.replaceChildren(h("strong", {}, t.clock), h("small", { class: d.awake ? "" : "asleep" }, `${d.word}${t.diff === "same time" ? "" : ` · ${t.diff}`}`));
  };
  paint(p.tz);
  void weatherAt(p).then((w) => {
    if (!w) return;
    wx.textContent = `${w.temp}° ${w.text}`;
    if (!p.tz) { paint(w.tz); updatePerson(p.id, { tz: w.tz }); }
  });
  const far = from ? farText(kmBetween(from, p)) : "";
  return h("div", { class: "ppl-row" },
    h("button", { class: "ppl-main", onclick: () => focus(app, p), title: `Open ${p.name}'s place` },
      avatar(p),
      h("span", { class: "ppl-text" },
        h("span", { class: "ppl-name" }, p.name, p.relation ? h("small", {}, ` · ${p.relation}`) : ""),
        h("span", { class: "ppl-sub" }, [p.where.split(",").slice(0, 2).join(","), far && far !== "Here" ? `${far} away` : far].filter(Boolean).join(" · ")),
        wx),
      time),
    managing ? h("button", { class: "ppl-remove", "aria-label": `Remove ${p.name}`, title: "Remove", html: icons.close, onclick: () => { removePerson(p.id); redraw(); } }) : "");
}

/**
 * The My people box: family, then others, each with their time and weather. `compact` is the Overview's
 * version (a few at a glance); the People tab shows everyone and the form.
 */
export function myPeopleBox(app: App, opts: { compact?: boolean } = {}): HTMLElement {
  const box = h("section", { class: `group ppl-box${opts.compact ? " compact" : ""}` });
  let tab: Circle | "all" = "all";
  let managing = false;
  let adding = false;
  const draw = () => {
    const people = loadPeople();
    const from = home();
    const g = grouped(people, from);
    const head = h("div", { class: "ppl-head" },
      h("h2", { class: "group-title" }, "My people"),
      people.length ? h("div", { class: "ppl-seg", role: "tablist" },
        ...(["all", "family", "others"] as const).map((t) => h("button", { class: tab === t ? "on" : "", role: "tab", "aria-selected": String(tab === t), onclick: () => { tab = t; draw(); } },
          t === "all" ? "All" : t === "family" ? `Family ${g.family.length}` : `Others ${g.others.length}`))) : "");
    if (adding) { box.replaceChildren(head, addForm(app, () => { adding = false; draw(); })); return; }
    if (!people.length) {
      box.replaceChildren(head, h("div", { class: "ppl-empty" },
        h("p", {}, "Add family and the people you keep close. See their time, their weather and how far they are, at a glance."),
        h("button", { class: "primary-btn", onclick: () => { adding = true; draw(); } }, "Add someone"),
        h("p", { class: "fineprint" }, "Kept on this device only. Terreno doesn't track anyone's location: you choose where each person is shown.")));
      return;
    }
    const lists: [string, Person[]][] = tab === "all" ? [["Family", g.family], ["Others", g.others]] : tab === "family" ? [["Family", g.family]] : [["Others", g.others]];
    const limit = opts.compact ? 4 : Infinity;
    let shown = 0;
    const blocks = lists.filter(([, xs]) => xs.length).map(([label, xs]) => {
      const take = xs.slice(0, Math.max(0, limit - shown));
      shown += take.length;
      return take.length ? h("div", { class: "ppl-circle" }, tab === "all" ? h("p", { class: "ppl-circle-label" }, label) : "", ...take.map((p) => row(app, p, from, managing, draw))) : "";
    });
    const hidden = people.length - shown;
    box.replaceChildren(head, ...blocks,
      h("div", { class: "ppl-actions" },
        opts.compact
          ? (hidden > 0 ? h("button", { class: "link-btn", onclick: () => app.setTheme("people") }, `All ${people.length} people ›`) : h("button", { class: "link-btn", onclick: () => app.setTheme("people") }, "My people on the map ›"))
          : h("button", { class: "pill-btn", onclick: () => { managing = !managing; draw(); } }, managing ? "Done" : "Edit"),
        h("button", { class: "pill-btn primary", onclick: () => { adding = true; draw(); } }, "＋ Add someone")),
      !from && !opts.compact ? h("p", { class: "fineprint" }, "Save your home in My Place to see how far each person is.") : "");
  };
  draw();
  const off = onPeople(() => (box.isConnected ? (adding ? undefined : draw()) : off()));
  return box;
}

/** Name, family or not, how they're related, and where they live. */
function addForm(app: App, done: () => void): HTMLElement {
  let circle: Circle = "family";
  let relation = "";
  let spot: (Spot & { where: string }) | null = null;
  const name = h("input", { class: "po-input", placeholder: "Their name", autocomplete: "off", maxlength: "60" }) as HTMLInputElement;
  const rels = h("div", { class: "chips wrap" });
  const seg = h("div", { class: "ppl-seg" });
  const drawCircle = () => {
    seg.replaceChildren(...(["family", "others"] as const).map((c) => h("button", { class: circle === c ? "on" : "", onclick: () => { circle = c; relation = ""; drawCircle(); } }, c === "family" ? "Family" : "Others")));
    rels.replaceChildren(...RELATIONS[circle].map((r) => h("button", { class: `chip${relation === r ? " on" : ""}`, onclick: () => { relation = relation === r ? "" : r; drawCircle(); } }, r)));
  };
  drawCircle();
  const where = h("input", { class: "po-input", placeholder: "Town or address", autocomplete: "off" }) as HTMLInputElement;
  const hits = h("div", { class: "list ppl-hits" });
  const chosen = h("p", { class: "ppl-chosen small" });
  const pick = (s: Spot & { where: string }) => { spot = s; hits.replaceChildren(); where.value = s.where; chosen.replaceChildren(h("span", { html: icons.pin }), ` ${s.where}`); save.disabled = !name.value.trim(); };
  let t = 0;
  where.oninput = () => {
    clearTimeout(t);
    spot = null; save.disabled = true; chosen.replaceChildren();
    const q = where.value.trim();
    if (q.length < 3) { hits.replaceChildren(); return; }
    t = window.setTimeout(() => void geocode(q).then((rs) => hits.replaceChildren(...rs.slice(0, 5).map((r) =>
      h("button", { class: "list-row", onclick: () => pick({ lon: r.lon, lat: r.lat, where: [r.name, r.detail].filter(Boolean).join(", ") }) },
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, r.name), h("span", { class: "list-sub" }, r.detail ?? "")))))).catch(() => hits.replaceChildren()), 350);
  };
  const open = app.place;
  const quick = h("div", { class: "chips wrap" },
    open ? h("button", { class: "chip", onclick: () => pick({ lon: open.lon, lat: open.lat, where: [open.name?.title, open.name?.context].filter(Boolean).join(", ") || "The place I have open" }) }, "The place I have open") : "",
    h("button", { class: "chip", onclick: () => navigator.geolocation.getCurrentPosition((p) => pick({ lon: p.coords.longitude, lat: p.coords.latitude, where: "Where I am now" }), () => app.toast("Couldn't get your location. Type a town instead.", 3500), { timeout: 8000 }) }, "Where I am"));
  const save = h("button", { class: "primary-btn", disabled: true, onclick: () => {
    if (!spot || !name.value.trim()) return;
    addPerson(newPerson({ name: name.value, circle, relation: relation || undefined, lon: spot.lon, lat: spot.lat, where: spot.where }));
    app.toast(`${name.value.trim()} added`, 2000);
    done();
  } }, "Add") as HTMLButtonElement;
  name.oninput = () => { save.disabled = !spot || !name.value.trim(); };
  setTimeout(() => name.focus(), 50);
  return h("div", { class: "ppl-form" },
    name,
    seg,
    rels,
    h("label", { class: "ppl-label" }, "Where they live"),
    where, hits, quick, chosen,
    h("div", { class: "ppl-actions" }, h("button", { class: "pill-btn", onclick: done }, "Cancel"), save),
    h("p", { class: "fineprint" }, "Kept on this device only. Terreno doesn't track anyone's location."));
}

// ---- On the globe --------------------------------------------------------------------------------

const faces = new Map<string, HTMLCanvasElement>();
function face(p: Person): HTMLCanvasElement {
  const key = `${initials(p.name)}${colorOf(p)}`;
  let c = faces.get(key);
  if (c) return c;
  const r = 2, size = 34 * r;
  c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  // A tessera, like every face in Terreno: a rounded square in their pigment, edged in white.
  g.beginPath(); g.roundRect(2.5 * r, 2.5 * r, size - 5 * r, size - 5 * r, 8 * r);
  g.fillStyle = colorOf(p); g.fill(); g.lineWidth = 2.5 * r; g.strokeStyle = "#fff"; g.stroke();
  g.fillStyle = "#fff"; g.font = `700 ${13 * r}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(initials(p.name), size / 2, size / 2 + r);
  faces.set(key, c);
  return c;
}

/**
 * My people on the globe while Overview or People is open: a face for each, and a line from home to
 * each of them. Call `sync` with the theme id whenever the theme changes.
 */
export function peopleOnMap(app: App): { sync(themeId: string): void } {
  const viewer = app.globe.viewer;
  const ds = new CustomDataSource("people:mine");
  void viewer.dataSources.add(ds);
  let theme = "";
  const draw = () => {
    ds.entities.removeAll();
    const people = loadPeople();
    ds.show = (theme === "explore" || theme === "people") && people.length > 0;
    if (!ds.show) { viewer.scene.requestRender(); return; }
    const from = home();
    for (const p of people) {
      ds.entities.add({
        position: Cartesian3.fromDegrees(p.lon, p.lat),
        billboard: { image: face(p), width: 34, height: 34, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: p.name.split(" ")[0], font: "600 12px system-ui, sans-serif", fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#1b1d1a"), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.TOP, pixelOffset: new Cartesian2(0, 20), heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
      if (from && kmBetween(from, p) > 1) ds.entities.add({
        polyline: { positions: Cartesian3.fromDegreesArray([from.lon, from.lat, p.lon, p.lat]), arcType: ArcType.GEODESIC, width: 5, material: new PolylineGlowMaterialProperty({ glowPower: 0.25, color: Color.fromCssColorString(colorOf(p)).withAlpha(0.85) }) },
      });
    }
    viewer.scene.requestRender();
  };
  onPeople(draw);
  return { sync(id) { theme = id; draw(); } };
}
