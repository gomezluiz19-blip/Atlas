// The globe's own analysis layers (geology, elevation colours, slope, contours, species records) live on the
// shared canvas too, so they show in the stack of views and can be rested, pinned or taken off from there.
import type { App } from "../app";
import type { OverlayKind } from "../globe/viewer";

export function globeLayersOnCanvas(app: App) {
  const globe = app.globe;
  const GLOBE_LAYERS: { kind: OverlayKind; label: string; color: string }[] = [
    { kind: "geology", label: "🪨 Geologic map", color: "#9a7552" },
    { kind: "elevation", label: "⛰️ Elevation colours", color: "#5b9467" },
    { kind: "slope", label: "📐 Slope", color: "#d19a2e" },
    { kind: "contours", label: "〰️ Contour lines", color: "#d1d1d6" },
    { kind: "species", label: "🔬 Species records", color: "#5b9467" },
  ];
  // Hidden for now from the stack of views: off on the globe, but still listed.
  const resting = new Set<OverlayKind>();
  globe.onApply = () => {
    for (const { kind, label, color } of GLOBE_LAYERS) {
      const key = `globe:${kind}`, on = globe.state.overlays[kind].on;
      if (on && !app.canvas.has(key))
        app.canvas.put({
          id: key, label, color, scope: "world", pinned: false,
          show: (v) => {
            if (v === globe.state.overlays[kind].on) return;
            if (v) resting.delete(kind); else resting.add(kind);
            globe.state.overlays[kind].on = v;
            globe.apply();
          },
          remove: () => {
            resting.delete(kind);
            globe.state.overlays[kind].on = false;
            globe.apply();
          },
        }, true);
      else if (on && resting.has(kind)) { resting.delete(kind); app.canvas.setOff(key, false); }
      else if (!on && !resting.has(kind) && app.canvas.has(key)) app.canvas.drop(key);
    }
  };
}
