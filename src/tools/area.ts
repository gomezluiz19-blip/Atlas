// Helpers for tools that survey a circular area around a clicked point.
import { Cartesian3, Color, type CustomDataSource } from "cesium";
import { h } from "../ui/dom";

export const RADII_KM = [1, 2, 5, 10, 20, 50];

/** A sensible survey radius for the current camera height. */
export function radiusForCamera(heightM: number, max = 50): number {
  const target = heightM / 3000;
  return RADII_KM.filter((r) => r <= max).reduce((best, r) => (Math.abs(Math.log(r / target)) < Math.abs(Math.log(best / target)) ? r : best), 1);
}

export function drawArea(ds: CustomDataSource, lon: number, lat: number, radiusKm: number, color: string) {
  const c = Color.fromCssColorString(color);
  const pts: number[] = [];
  const R = 6371.0088;
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * 2 * Math.PI;
    const dLat = ((radiusKm / R) * Math.cos(a) * 180) / Math.PI;
    const dLon = ((radiusKm / R) * Math.sin(a) * 180) / Math.PI / Math.cos((lat * Math.PI) / 180);
    pts.push(lon + dLon, lat + dLat);
  }
  ds.entities.add({ polygon: { hierarchy: Cartesian3.fromDegreesArray(pts), material: c.withAlpha(0.08) } });
  ds.entities.add({ polyline: { positions: Cartesian3.fromDegreesArray(pts), clampToGround: true, width: 2, material: c.withAlpha(0.9) } });
}

/** A row of radius chips; calls back with the chosen radius. */
export function radiusChips(current: number, onPick: (r: number) => void, max = 50): HTMLElement {
  return h(
    "div",
    { class: "chips wrap", role: "radiogroup", "aria-label": "Survey radius" },
    h("span", { class: "chips-label" }, "Radius"),
    ...RADII_KM.filter((r) => r <= max).map((r) =>
      h("button", { class: "chip", role: "radio", "aria-checked": String(r === current), onclick: () => onPick(r) }, `${r} km`),
    ),
  );
}
