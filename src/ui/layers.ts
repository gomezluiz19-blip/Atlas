// The Layers popover: base map, analytical overlays with legends, terrain settings.
import { contourInterval, LAND_RAMP, SEA_RAMP, SLOPE_RAMP, type Ramp } from "../globe/analyticLayers";
import type { Globe, OverlayKind } from "../globe/viewer";
import { setQuality } from "../globe/motion";
import { currentQuality, pinQuality, qualityFor, readSignals, type Tier } from "../globe/quality";
import { h } from "./dom";

const OVERLAYS: { kind: OverlayKind; label: string; about: string }[] = [
  { kind: "geology", label: "Geologic map", about: "Bedrock at the surface, coloured by rock unit and age (Macrostrat)." },
  { kind: "species", label: "Species records", about: "Where plants and animals have been recorded; brighter means more records (GBIF)." },
  { kind: "hillshade", label: "Relief shading", about: "Shadows from a sun in the north-west bring out landforms." },
  { kind: "elevation", label: "Elevation colours", about: "Height above sea level, and depth below it." },
  { kind: "slope", label: "Slope", about: "Steepness of the ground in degrees." },
  { kind: "contours", label: "Contour lines", about: "Lines of equal elevation. Bold lines every 5th interval." },
];

function gradientBar(ramp: Ramp, labels: string[]): HTMLElement {
  return h(
    "div",
    { class: "legend" },
    h("div", { class: "legend-bar", style: `background: linear-gradient(to right, ${ramp.stops.join(", ")})` }),
    h("div", { class: "legend-labels" }, ...labels.map((l) => h("span", {}, l))),
  );
}

function legendFor(kind: OverlayKind, globe: Globe): HTMLElement | null {
  if (kind === "geology") return h("div", { class: "legend-note" }, "Each colour is a mapped rock unit; colours come from the source maps and broadly follow rock age. Click with Rock column for the details.");
  if (kind === "species") return h("div", { class: "legend-note" }, "Record density, not abundance: it also reflects where people look.");
  if (kind === "elevation")
    return h(
      "div",
      { class: "legend-pair" },
      gradientBar(SEA_RAMP, ["−7 km", "0"]),
      gradientBar(LAND_RAMP, ["0", "3 km", "6 km+"]),
    );
  if (kind === "slope") return gradientBar(SLOPE_RAMP, ["0°", "30°", "60°+"]);
  if (kind === "contours") {
    const note = h("div", { class: "legend-note" });
    const update = () => {
      const z = Math.round(Math.log2(40_000_000 / Math.max(1, globe.cameraHeight())));
      note.textContent = `Interval now: ${contourInterval(Math.max(0, Math.min(15, z)))} m (finer as you zoom in)`;
    };
    update();
    globe.viewer.camera.moveEnd.addEventListener(update);
    return note;
  }
  return null;
}

/** A live layer switch (planes, ships) shown first in the popover. */
export interface LiveSwitch { label: string; about: string; on(): boolean; set(v: boolean): void; status?(): string }

export function createLayersPanel(globe: Globe, live: LiveSwitch[] = []): HTMLElement {
  const s = globe.state;
  const apply = () => globe.apply();

  const base = h(
    "div",
    { class: "segmented", role: "radiogroup", "aria-label": "Base map" },
    ...(["satellite", "plain"] as const).map((b) => {
      const btn = h(
        "button",
        {
          role: "radio",
          "aria-checked": String(s.base === b),
          onclick: () => {
            s.base = b;
            base.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === btn)));
            apply();
          },
        },
        b === "satellite" ? "Satellite" : "Plain",
      );
      return btn;
    }),
  );

  const overlays = OVERLAYS.map(({ kind, label, about }) => {
    const o = s.overlays[kind];
    const legend = legendFor(kind, globe);
    const opacity = h("input", {
      type: "range",
      min: 0.1,
      max: 1,
      step: 0.05,
      value: o.opacity,
      "aria-label": `${label} opacity`,
      oninput: (e: Event) => {
        o.opacity = Number((e.target as HTMLInputElement).value);
        apply();
      },
    });
    const details = h("div", { class: "layer-details", hidden: !o.on }, opacity, legend);
    const check = h("input", {
      type: "checkbox",
      checked: o.on,
      onchange: (e: Event) => {
        o.on = (e.target as HTMLInputElement).checked;
        details.hidden = !o.on;
        apply();
      },
    });
    return h("div", { class: "layer" }, h("label", { class: "layer-row", title: about }, check, h("span", {}, label)), details);
  });

  const streets = h("label", { class: "layer-row", title: "Road names, highway shields and place names over the imagery, once you zoom in" },
    h("input", { type: "checkbox", checked: s.streets, onchange: (e: Event) => { s.streets = (e.target as HTMLInputElement).checked; apply(); } }),
    h("span", {}, "Street and place names"));

  const veValue = h("span", { class: "value" }, `${s.exaggeration}×`);
  const ve = h("input", {
    type: "range",
    min: 1,
    max: 5,
    step: 0.5,
    value: s.exaggeration,
    "aria-label": "Vertical exaggeration",
    oninput: (e: Event) => {
      s.exaggeration = Number((e.target as HTMLInputElement).value);
      veValue.textContent = `${s.exaggeration}×`;
      apply();
    },
  });
  const bathy = h("input", {
    type: "checkbox",
    checked: s.bathymetry,
    onchange: (e: Event) => {
      s.bathymetry = (e.target as HTMLInputElement).checked;
      apply();
    },
  });
  const photoreal = globe.hasPhotoreal
    ? h(
        "label",
        { class: "layer-row" },
        h("input", {
          type: "checkbox",
          checked: s.photorealistic,
          onchange: (e: Event) => {
            s.photorealistic = (e.target as HTMLInputElement).checked;
            apply();
          },
        }),
        h("span", {}, "Photorealistic 3D (Google)"),
      )
    : h("p", { class: "fineprint" }, "Add a Google Maps API key to unlock photorealistic 3D cities and terrain. See the README.");

  const liveRows = live.map((l) => {
    const status = h("span", { class: "layer-status" }, l.on() ? l.status?.() ?? "" : "");
    return h("label", { class: "layer-row", title: l.about },
      h("input", { type: "checkbox", checked: l.on(), onchange: (e: Event) => { const v = (e.target as HTMLInputElement).checked; l.set(v); status.textContent = v && l.status ? "finding…" : ""; } }),
      h("span", {}, l.label), status);
  });

  return h(
    "div",
    { class: "popover layers-panel", hidden: true },
    ...(liveRows.length ? [h("h3", { class: "panel-sub" }, h("span", { class: "pulse-dot" }), " Live"), ...liveRows] : []),
    h("h3", { class: "panel-sub" }, "Base map"),
    base,
    streets,
    photoreal,
    h("h3", { class: "panel-sub" }, "Analysis layers"),
    ...overlays,
    h("h3", { class: "panel-sub" }, "Terrain"),
    h("label", { class: "slider-row" }, h("span", {}, "Vertical exaggeration"), veValue),
    ve,
    h("label", { class: "layer-row", title: "Show the ocean floor instead of a flat sea surface" }, bathy, h("span", {}, "Show seafloor")),
    h("h3", { class: "panel-sub" }, "Detail"),
    detailControl(),
  );
}

/** Auto fits the globe to the device; the others pin it (lighter saves battery and data). */
function detailControl(): HTMLElement {
  let pinned: Tier | "auto" = (() => { try { return (JSON.parse(localStorage.getItem("atlas.quality") ?? "{}") as { pinned?: boolean; tier?: Tier }).pinned ? currentQuality().tier : "auto"; } catch { return "auto"; } })();
  const note = h("p", { class: "muted small" });
  const say = () => { note.textContent = `Now: ${({ low: "light", mid: "balanced", high: "sharp" } as const)[currentQuality().tier]}${pinned === "auto" ? ", chosen for this device" : ""}.`; };
  const opts: [Tier | "auto", string][] = [["auto", "Auto"], ["low", "Light"], ["mid", "Balanced"], ["high", "Sharp"]];
  const seg = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Globe detail" },
    ...opts.map(([t, label]) => {
      const btn = h("button", { role: "radio", "aria-checked": String(pinned === t), onclick: () => {
        pinQuality(t === "auto" ? null : t);
        pinned = t;
        setQuality(t === "auto" ? currentQuality() : qualityFor(t, readSignals()));
        seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === btn)));
        say();
      } }, label);
      return btn;
    }));
  say();
  return h("div", {}, seg, note);
}
