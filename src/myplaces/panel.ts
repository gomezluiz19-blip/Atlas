// The My Place panel: a list of saved places, and for each one a dashboard:
// a 3D view of the buildings, its energy (solar, battery), water (source, tank,
// rain off the roof) and security (cameras with their field of view, gates,
// alarms, lights). Separate from the place card, so it's always one tap away.
import { brand } from "../pro/vision/connect";
import type { App } from "../app";
import { reverseGeocode } from "../data/geocode";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { placeReport } from "./report";
import { createCameraSection } from "../pro/vision/cameras";
import { roofHarvestLitres, solarByMonth, sunAndRain, type SunAndRain } from "./estimates";
import { footprintM2, type PlaceScene } from "./scene";
import { blankPlace, DEVICES, KIND_LABEL, newId, type Device, type DeviceType, type MyPlace, type PlaceKind, type PlaceStore } from "./store";

const MONTHS = "JFMAMJJASOND".split("");

/** Only web links (no javascript: or data: URLs) are kept as camera feeds. */
function safeUrl(v: string): string | undefined {
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}
const fmt = (n: number, unit: string) => `${n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1)} ${unit}`;

function monthBars(values: number[], color: string, label: (v: number) => string): HTMLElement {
  const max = Math.max(...values, 1e-9);
  return h("div", { class: "month-bars", role: "img", "aria-label": values.map((v, i) => `${MONTHS[i]} ${label(v)}`).join(", ") },
    ...values.map((v, i) => h("div", { class: "month-bar", title: label(v) },
      h("span", { class: "month-fill", style: `height:${(v / max) * 100}%;background:${color}` }),
      h("span", { class: "month-label" }, MONTHS[i]))));
}

function numberField(label: string, unit: string, value: number | undefined, onChange: (v: number | undefined) => void, hint?: string): HTMLElement {
  const input = h("input", {
    type: "number", min: 0, step: "any", inputmode: "decimal", value: value ?? "", placeholder: "—",
    onchange: (e: Event) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      onChange(Number.isFinite(v) && v >= 0 ? v : undefined);
    },
  });
  return h("label", { class: "mp-field", title: hint }, h("span", {}, label), h("span", { class: "mp-input" }, input, h("span", { class: "mp-unit" }, unit)));
}

export interface MyPlacesUi {
  button: HTMLButtonElement;
  panel: HTMLElement;
  open(id?: string): void;
  close(): void;
  /** Redraws the list (e.g. when the selected spot changes). */
  refresh(): void;
  /** The saved places and the save/locate actions, for embedding in the My Place home. */
  listBody(): (Node | string)[];
  /** Opens the save form for a spot. */
  add(lon: number, lat: number, name?: string): void;
}

export function createMyPlaces(app: App, store: PlaceStore, scene: PlaceScene, opts: { onPro?: (id: string) => void; /** The My Place home to return to, if there is one. */ home?: () => void; /** Called when the panel is shown. */ onShow?: () => void } = {}): MyPlacesUi {
  const button = h("button", { id: "myplaces-btn", class: "round-btn", "aria-label": "My Place", "aria-expanded": "false", title: "My Place", html: icons.home }) as HTMLButtonElement;
  const panel = h("div", { class: "popover myplaces", hidden: true, role: "dialog", "aria-label": "My Place" });
  let current: string | null = null;
  const climate = new Map<string, Promise<SunAndRain>>();
  const sun = (p: MyPlace) => {
    const key = `${p.lon.toFixed(2)},${p.lat.toFixed(2)}`;
    let c = climate.get(key);
    if (!c) {
      c = sunAndRain(p.lon, p.lat);
      c.catch(() => climate.delete(key));
      climate.set(key, c);
    }
    return c;
  };

  const save = (p: MyPlace) => {
    store.save(p);
    if (current === p.id) scene.draw(p);
  };

  // ---- List ---------------------------------------------------------------

  const listBody = () => {
    const places = store.all();
    const sel = app.place;
    const fileInput = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      try {
        const n = store.importJson(await f.text());
        app.toast(n ? `Added ${n} place${n === 1 ? "" : "s"}` : "No places found in that file");
      } catch {
        app.toast("That file isn't a My Place export");
      }
      render();
    } });
    return [
      places.length
        ? h("div", { class: "list" }, ...places.map((p) =>
            h("button", { class: "list-row", onclick: () => ui.open(p.id) },
              h("span", { class: "mp-kind", html: icons.home }),
              h("span", { class: "list-text" }, h("span", { class: "list-title" }, p.name), h("span", { class: "list-sub" }, [KIND_LABEL[p.kind], p.address].filter(Boolean).join(" · "))),
              h("span", { class: "chev", html: "&rsaquo;" }))))
        : "",
      h("div", { class: "mp-actions" },
        h("button", { class: "action", disabled: !sel, onclick: () => sel && ui.add(sel.lon, sel.lat, sel.name?.title) },
          h("span", { class: "action-icon", html: icons.target }), h("span", {}, sel ? `Save ${sel.name?.title ?? "the selected spot"}` : "Tap a spot on the map, or search for it, to save it"), h("span", { class: "chev", html: "&rsaquo;" })),
        "geolocation" in navigator
          ? h("button", { class: "action", onclick: locate }, h("span", { class: "action-icon", html: icons.compass }), h("span", {}, "Start where I am"), h("span", { class: "chev", html: "&rsaquo;" }))
          : ""),
      h("div", { class: "mp-foot" },
        h("span", {}, "Saved only in this browser."),
        places.length ? h("button", { class: "link-btn", onclick: exportFile }, "Export") : "",
        h("button", { class: "link-btn", onclick: () => fileInput.click() }, "Import"),
        fileInput),
    ];
  };
  const list = () => {
    panel.replaceChildren(
      h("div", { class: "mp-head" }, h("h2", {}, "My Place"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => ui.close() })),
      h("p", { class: "mp-intro" }, "Save the places you care about, like home, a family hotel or a farm. See them in 3D, and keep track of their solar power, water and security."),
      ...listBody());
  };
  /** Back to the list, or to the My Place home when there is one. */
  const backHome = () => {
    current = null;
    if (opts.home) { ui.close(); opts.home(); } else render();
  };

  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([store.exportJson()], { type: "application/json" }));
    const a = h("a", { href: url, download: "my-places.json" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const locate = () => {
    app.toast("Finding where you are…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lon, latitude: lat } = pos.coords;
        app.select({ lon, lat, height: 0 });
        scene.frame({ lon, lat } as MyPlace, 600);
        ui.add(lon, lat);
      },
      () => app.toast("Couldn't get your location. Check that location access is allowed for this site."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  // ---- Add ------------------------------------------------------------------

  const addForm = (lon: number, lat: number, suggested?: string) => {
    const name = h("input", { type: "text", value: suggested ?? "", placeholder: "e.g. Hotel Yaluma", maxlength: 80 }) as HTMLInputElement;
    const kind = h("select", {}, ...(Object.keys(KIND_LABEL) as PlaceKind[]).map((k) => h("option", { value: k }, KIND_LABEL[k]))) as HTMLSelectElement;
    panel.replaceChildren(
      h("div", { class: "mp-head" }, h("button", { class: "link-btn", onclick: () => (current ? render() : backHome()) }, "‹ My Place"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => ui.close() })),
      h("h2", { class: "mp-title" }, "Save this place"),
      h("label", { class: "mp-field wide" }, h("span", {}, "Name"), name),
      h("label", { class: "mp-field wide" }, h("span", {}, "What is it?"), kind),
      h("p", { class: "fineprint" }, `${lat.toFixed(5)}, ${lon.toFixed(5)}. Tip: tap right on the building so Terreno can find its outline.`),
      h("button", { class: "primary-btn", onclick: async () => {
        const p = blankPlace(name.value.trim() || "My place", lon, lat, kind.value as PlaceKind);
        store.save(p);
        ui.open(p.id);
        const n = await reverseGeocode(lon, lat, 18).catch(() => null);
        if (n) save({ ...store.get(p.id)!, address: [n.title, n.context].filter(Boolean).join(", ") });
        if (current === p.id) render();
      } }, "Save"),
    );
    name.focus();
  };

  // ---- Dashboard -------------------------------------------------------------

  const placeDevice = (p: MyPlace, type: DeviceType) => {
    ui.close();
    app.pickOnce(`Tap where the ${DEVICES[type].label.toLowerCase()} ${type === "solar" ? "are" : "is"}`, (pt) => {
      const d: Device = { id: newId(), type, lon: pt.lon, lat: pt.lat };
      if (type !== "camera") {
        save({ ...store.get(p.id)!, devices: [...store.get(p.id)!.devices, d] });
        ui.open(p.id);
        return;
      }
      // Cameras: a second tap for what it looks at.
      app.pickOnce("Now tap the far edge of what the camera sees", (aim) => {
        const kx = 111_320 * Math.cos((pt.lat * Math.PI) / 180);
        const dx = (aim.lon - pt.lon) * kx, dy = (aim.lat - pt.lat) * 110_540;
        d.heading = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
        d.range = Math.max(5, Math.min(80, Math.hypot(dx, dy)));
        d.fov = 90;
        const cur = store.get(p.id)!;
        save({ ...cur, devices: [...cur.devices, { ...d, label: `Camera ${cur.devices.filter((x) => x.type === "camera").length + 1}` }] });
        ui.open(p.id);
      });
    });
  };

  const deviceRows = (p: MyPlace, group: "energy" | "water" | "security") => {
    const ds = p.devices.filter((d) => DEVICES[d.type].group === group);
    return ds.length
      ? h("div", { class: "list mp-devices" }, ...ds.map((d) =>
          h("div", { class: "list-row static" },
            h("span", { class: "dot big", style: `background:${DEVICES[d.type].color}` }),
            h("span", { class: "list-text" },
              h("input", { class: "mp-label", value: d.label ?? DEVICES[d.type].label, "aria-label": "Name", onchange: (e: Event) => save({ ...p, devices: p.devices.map((x) => (x.id === d.id ? { ...x, label: (e.target as HTMLInputElement).value } : x)) }) }),
              d.type === "camera"
                ? h("span", { class: "list-sub" }, `Faces ${Math.round(d.heading ?? 0)}° · sees about ${Math.round(d.range ?? 25)} m`,
                    h("input", { class: "mp-url", type: "url", placeholder: "Feed link (optional)", value: d.url ?? "",
                      onchange: (e: Event) => save({ ...p, devices: p.devices.map((x) => (x.id === d.id ? { ...x, url: safeUrl((e.target as HTMLInputElement).value) } : x)) }) }),
                    d.url ? h("a", { class: "link-btn", href: d.url, target: "_blank", rel: "noopener noreferrer" }, "Open feed ↗") : "",
                    brand(d.brand)?.web ? h("a", { class: "link-btn", href: brand(d.brand)!.web, target: "_blank", rel: "noopener noreferrer" }, `Open in ${brand(d.brand)!.name} ↗`) : "")
                : ""),
            h("button", { class: "icon-btn", "aria-label": `Remove ${d.label ?? DEVICES[d.type].label}`, html: icons.close, onclick: () => { save({ ...p, devices: p.devices.filter((x) => x.id !== d.id) }); render(); } }))))
      : "";
  };

  const addButtons = (p: MyPlace, types: DeviceType[]) =>
    h("div", { class: "chips wrap" }, ...types.map((t) => h("button", { class: "chip", onclick: () => placeDevice(p, t) }, `+ ${DEVICES[t].label}`)));

  const dashboard = (p: MyPlace) => {
    const set = (patch: Partial<MyPlace>) => { save({ ...store.get(p.id)!, ...patch }); render(); };
    const energyOut = h("div", { class: "mp-results" }, h("div", { class: "loading" }, h("div", { class: "spinner" }), "Reading five years of sunshine here…"));
    const waterOut = h("div", { class: "mp-results" });
    const buildingInfo = h("p", { class: "mp-building muted small" }, "Loading the buildings around it…");
    const roof = p.water.roofM2 ?? (scene.own ? Math.round(footprintM2(scene.own)) : undefined);

    sun(p).then((s) => {
      if (current !== p.id) return;
      const kw = p.energy.solarKw, use = p.energy.dailyUseKwh, batt = p.energy.batteryKwh;
      const pv = kw ? solarByMonth(kw, s) : null;
      const year = pv ? pv.reduce((a, b) => a + b, 0) : 0;
      const avgSun = s.sunKwhM2.reduce((a, b) => a + b, 0) / 12;
      energyOut.replaceChildren(
        h("div", { class: "mp-stat" }, h("strong", {}, `${avgSun.toFixed(1)} kWh/m²`), h("span", {}, `of sunshine a day on average (${s.years})`)),
        pv
          ? h("div", {},
              h("div", { class: "mp-stat" }, h("strong", {}, fmt(year, "kWh")), h("span", {}, `a year from ${kw} kW of panels (≈ ${fmt(year / 365, "kWh")} a day)`)),
              monthBars(pv, "#e1b843", (v) => fmt(v, "kWh")),
              use ? h("div", { class: "mp-stat" }, h("strong", {}, `${Math.min(999, Math.round((year / 365 / use) * 100))}%`), h("span", {}, `of your ${use} kWh a day, on average`)) : "")
          : h("p", { class: "muted small" }, "Add the size of your solar panels (in kW) to estimate what they make here, month by month."),
        batt && use ? h("div", { class: "mp-stat" }, h("strong", {}, `${((batt / use) * 24).toFixed(1)} h`), h("span", {}, `of backup from ${batt} kWh of battery at your average use`)) : "",
        h("p", { class: "fineprint" }, "Estimate: sunshine on a flat surface from ERA5 (Open-Meteo), 75% system efficiency. Panels tilted toward the equator usually do a little better."),
      );
      const annualRain = s.rainMm.reduce((a, b) => a + b, 0);
      const harvest = roof ? roofHarvestLitres(roof, s) : 0;
      const wUse = p.water.dailyUseLitres, tank = p.water.tankLitres;
      waterOut.replaceChildren(
        h("div", { class: "mp-stat" }, h("strong", {}, `${Math.round(annualRain).toLocaleString()} mm`), h("span", {}, `of rain in an average year (${s.years})`)),
        monthBars(s.rainMm, "#3563d6", (v) => `${Math.round(v)} mm`),
        roof ? h("div", { class: "mp-stat" }, h("strong", {}, fmt(harvest / 1000, "m³")), h("span", {}, `could be collected from ${roof} m² of roof a year (${Math.round(harvest).toLocaleString()} litres)`)) : "",
        roof && wUse ? h("div", { class: "mp-stat" }, h("strong", {}, `${Math.min(999, Math.round((harvest / 365 / wUse) * 100))}%`), h("span", {}, `of your ${wUse.toLocaleString()} litres a day could come from the roof`)) : "",
        tank && wUse ? h("div", { class: "mp-stat" }, h("strong", {}, `${(tank / wUse).toFixed(1)} days`), h("span", {}, `of water in a full ${tank.toLocaleString()} litre tank`)) : "",
      );
    }).catch(() => {
      energyOut.replaceChildren(h("p", { class: "muted small" }, "Sunshine and rain records are unavailable right now."));
    });

    const cams = p.devices.filter((d) => d.type === "camera");
    const watched = cams.reduce((a, d) => a + (Math.PI * (d.range ?? 25) ** 2 * (d.fov ?? 90)) / 360, 0);

    panel.replaceChildren(
      h("div", { class: "mp-head" }, h("button", { class: "link-btn", onclick: backHome }, "‹ My Place"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => ui.close() })),
      h("input", { class: "mp-name", value: p.name, "aria-label": "Place name", onchange: (e: Event) => set({ name: (e.target as HTMLInputElement).value.trim() || p.name }) }),
      h("div", { class: "mp-sub" },
        h("select", { "aria-label": "Kind of place", onchange: (e: Event) => set({ kind: (e.target as HTMLSelectElement).value as PlaceKind }) },
          ...(Object.keys(KIND_LABEL) as PlaceKind[]).map((k) => h("option", { value: k, selected: k === p.kind }, KIND_LABEL[k]))),
        p.address ? h("span", { class: "muted small" }, p.address) : ""),
      h("div", { class: "mp-buttons" },
        h("button", { class: "pill-btn", onclick: () => scene.frame(p) }, "3D view"),
        h("button", { class: "pill-btn", onclick: () => { scene.frame(p); setTimeout(() => scene.orbit(p, true), 2100); } }, "Orbit"),
        h("button", { class: "pill-btn", onclick: () => { ui.close(); app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: p.address ?? KIND_LABEL[p.kind] }); } }, "Explore it in the themes"),
        opts.onPro ? h("button", { class: "pill-btn pro-btn", onclick: () => opts.onPro!(p.id) }, h("span", { class: "pro-badge" }, "PRO"), "Live operations") : ""),
      buildingInfo,
      placeReport(app, p),

      h("section", { class: "group" }, h("h2", { class: "group-title" }, "Energy"),
        h("div", { class: "mp-fields" },
          numberField("Solar panels", "kW", p.energy.solarKw, (v) => set({ energy: { ...p.energy, solarKw: v } }), "Total panel rating, e.g. 12 panels × 400 W = 4.8 kW"),
          numberField("Battery", "kWh", p.energy.batteryKwh, (v) => set({ energy: { ...p.energy, batteryKwh: v } })),
          numberField("Daily use", "kWh", p.energy.dailyUseKwh, (v) => set({ energy: { ...p.energy, dailyUseKwh: v } }), "From your electricity bill: monthly kWh ÷ 30"),
          numberField("Generator", "kW", p.energy.generatorKw, (v) => set({ energy: { ...p.energy, generatorKw: v } }))),
        energyOut, deviceRows(p, "energy"), addButtons(p, ["solar", "battery", "generator"])),

      h("section", { class: "group" }, h("h2", { class: "group-title" }, "Water"),
        h("div", { class: "mp-fields" },
          h("label", { class: "mp-field" }, h("span", {}, "Main source"),
            h("select", { onchange: (e: Event) => set({ water: { ...p.water, source: ((e.target as HTMLSelectElement).value || undefined) as MyPlace["water"]["source"] } }) },
              h("option", { value: "" }, "—"),
              ...(["mains", "well", "cistern", "rain", "truck"] as const).map((s) => h("option", { value: s, selected: p.water.source === s }, { mains: "Mains supply", well: "Well", cistern: "Cistern", rain: "Rainwater", truck: "Delivered by truck" }[s])))),
          numberField("Tank", "litres", p.water.tankLitres, (v) => set({ water: { ...p.water, tankLitres: v } })),
          numberField("Daily use", "litres", p.water.dailyUseLitres, (v) => set({ water: { ...p.water, dailyUseLitres: v } }), "A hotel guest uses roughly 200–400 litres a day"),
          numberField("Roof area", "m²", roof, (v) => set({ water: { ...p.water, roofM2: v } }), "Filled in from the building outline when there is one")),
        waterOut, deviceRows(p, "water"), addButtons(p, ["tank", "well"]),
        h("div", { class: "chips wrap mp-links" },
          h("button", { class: "chip", onclick: () => { ui.close(); app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: p.address ?? "" }); app.setTheme("water", "rain"); } }, "Where rain from here flows"),
          h("button", { class: "chip", onclick: () => { ui.close(); app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: p.address ?? "" }); app.setTheme("water", "city"); } }, "Pipes, drains and rivers around it"))),

      h("section", { class: "group" }, h("h2", { class: "group-title" }, "Cameras & security"),
        cams.length ? h("p", { class: "muted small" }, `${cams.length} camera${cams.length === 1 ? "" : "s"} watching up to ${Math.round(watched).toLocaleString()} m² (overlaps counted twice). Their views are drawn on the ground in pink.`) : h("p", { class: "muted small" }, "Place cameras to see what they cover, and spot the gaps. Add a feed link to open a camera's live view."),
        deviceRows(p, "security"), addButtons(p, ["camera", "gate", "alarm", "light", "sensor"]),
        cams.length ? h("h3", { class: "mp-sub-title" }, "Live") : "",
        cams.length ? createCameraSection(app, scene, store).el(p) : ""),

      h("section", { class: "group" }, h("h2", { class: "group-title" }, "Notes"),
        h("textarea", { class: "mp-notes", rows: 3, placeholder: "Anything worth remembering: when the tank was cleaned, the inverter model…", onchange: (e: Event) => set({ notes: (e.target as HTMLTextAreaElement).value }) }, p.notes ?? "")),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${p.name} from My Place?`)) { store.remove(p.id); scene.clear(); app.canvas.drop("myplace"); backHome(); } } }, "Remove this place"),
    );

    const describeBuilding = () => {
      const b = scene.own;
      if (!scene.buildings.length) { buildingInfo.textContent = "No buildings are mapped here in OpenStreetMap yet, so the 3D view shows the ground only."; return; }
      if (!b) { buildingInfo.textContent = `${scene.buildings.length} buildings around it. None is right at this spot: move the pin onto the building to highlight it.`; return; }
      const how = b.heightSource === "mapped" ? "mapped height" : b.heightSource === "floors" ? "from its number of floors" : "estimated; no height is mapped";
      buildingInfo.textContent = `Your building (orange): about ${Math.round(footprintM2(b)).toLocaleString()} m² on the ground, ${Math.round(b.height)} m tall (${how}). ${scene.buildings.length} buildings within 250 m.`;
    };
    if (buildingsReady === p.id) describeBuilding();
    else if (buildingsFailed === p.id) buildingInfo.textContent = "Couldn't load the buildings around it right now.";
  };

  let loadedFor = "";
  let buildingsReady = "";
  let buildingsFailed = "";

  const render = () => {
    const p = current ? store.get(current) : undefined;
    if (p) dashboard(p);
    else list();
  };

  const ui: MyPlacesUi = {
    button,
    panel,
    open(id?: string) {
      if (panel.hidden) opts.onShow?.();
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      if (id && id !== current) {
        current = id;
        const p = store.get(id)!;
        if (loadedFor !== id) {
          loadedFor = id;
          scene.clear();
          buildingsReady = buildingsFailed = "";
          // Once, when the buildings arrive: describe them and fill in the roof area.
          scene.showBuildings(p)
            .then(() => { if (loadedFor === id) { buildingsReady = id; if (current === id && !panel.hidden) render(); } })
            .catch(() => { if (loadedFor === id) { buildingsFailed = id; if (current === id && !panel.hidden) render(); } });
          scene.frame(p);
          app.canvas.put({
            id: "myplace", label: `My Place · ${p.name}`, color: "#d19a2e", scope: "world", pinned: true,
            show: (v) => { scene.ds.show = v; scene.floorDs.show = v; },
            remove: () => { scene.clear(); loadedFor = ""; },
          });
        }
      }
      render();
    },
    listBody,
    add(lon, lat, name) {
      if (panel.hidden) opts.onShow?.();
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      addForm(lon, lat, name);
    },
    refresh() {
      if (!panel.hidden && !current) render();
    },
    close() {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    },
  };
  button.addEventListener("click", () => (panel.hidden ? ui.open() : ui.close()));
  store.subscribe(() => { if (!panel.hidden && !current) render(); });
  return ui;
}
