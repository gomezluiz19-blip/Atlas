// Small helpers for drawing analysis results on the globe.
import {
  Cartesian2,
  Cartesian3,
  Color,
  CustomDataSource,
  HeightReference,
  LabelStyle,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
  VerticalOrigin,
  type Entity,
  type Viewer,
} from "cesium";

export function layer(viewer: Viewer, name: string): CustomDataSource {
  const ds = new CustomDataSource(name);
  viewer.dataSources.add(ds);
  return ds;
}

export function groundLine(
  ds: CustomDataSource,
  coords: [number, number][],
  opts: { color: string; width?: number; dashed?: boolean; glow?: boolean },
): Entity {
  const color = Color.fromCssColorString(opts.color);
  return ds.entities.add({
    polyline: {
      positions: Cartesian3.fromDegreesArray(coords.flat()),
      clampToGround: true,
      width: opts.width ?? 3,
      material: opts.dashed
        ? new PolylineDashMaterialProperty({ color, dashLength: 12 })
        : opts.glow
          ? new PolylineGlowMaterialProperty({ color, glowPower: 0.25 })
          : color,
    },
  });
}

export function marker(ds: CustomDataSource, lon: number, lat: number, opts: { color: string; label?: string; size?: number }): Entity {
  return ds.entities.add({
    position: Cartesian3.fromDegrees(lon, lat),
    point: {
      pixelSize: opts.size ?? 11,
      color: Color.fromCssColorString(opts.color),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: opts.label
      ? {
          text: opts.label,
          font: "600 14px system-ui, sans-serif",
          style: LabelStyle.FILL_AND_OUTLINE,
          fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString("#0b1320"),
          outlineWidth: 4,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -12),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
      : undefined,
  });
}

/** Thins a long coordinate list to at most `max` points (keeping both ends). */
export function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}

export function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
