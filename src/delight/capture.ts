// Stills and short films of anything Terreno draws in WebGL (the globe, a
// hologram), framed like a title card: the name large, a line under it, the
// date, and a quiet Terreno mark. A still is one frame; a film records a few
// seconds while the view moves, for a board deck, an update or a post.
import { coverCrop, pickMime } from "../work/videoModel";

export interface Frame { title: string; sub?: string; accent?: string }

/** Draws the title card over a frame (pure drawing; no state). */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, f: Frame, t = 1) {
  const s = Math.max(0.6, Math.min(w, h) / 900);
  const pad = 56 * s;
  // A soft fall-off at the bottom so the words read on anything.
  const grad = g.createLinearGradient(0, h * 0.55, 0, h);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.62)");
  g.fillStyle = grad;
  g.fillRect(0, h * 0.55, w, h * 0.45);
  g.save();
  g.globalAlpha = Math.min(1, t);
  const accent = f.accent ?? "#5ad8ff";
  g.fillStyle = accent;
  g.fillRect(pad, h - pad - 112 * s, 44 * s, 3 * s);
  g.fillStyle = "#fff";
  g.font = `700 ${Math.round(54 * s)}px Geist, -apple-system, system-ui, sans-serif`;
  g.textBaseline = "alphabetic";
  g.fillText(f.title, pad, h - pad - 50 * s, w - pad * 2);
  if (f.sub) {
    g.fillStyle = "rgba(255,255,255,0.78)";
    g.font = `500 ${Math.round(22 * s)}px Geist, -apple-system, system-ui, sans-serif`;
    g.fillText(f.sub, pad, h - pad - 14 * s, w - pad * 2);
  }
  // The mark and the date, top right, small.
  g.font = `600 ${Math.round(15 * s)}px Geist, -apple-system, system-ui, sans-serif`;
  g.textAlign = "right";
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillText("TERRENO", w - pad, pad + 4 * s);
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.fillText(new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }), w - pad, pad + 26 * s);
  g.restore();
}

const save = (blob: Blob, name: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
};
const fileName = (title: string, ext: string) => `${title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "terreno"}-${new Date().toISOString().slice(0, 10)}.${ext}`;

/**
 * Takes a still. `onNextFrame` must call its callback right after the source
 * has drawn (WebGL canvases are only readable then, unless they keep their buffer).
 */
export function still(source: HTMLCanvasElement, onNextFrame: (cb: () => void) => void, f: Frame): Promise<void> {
  return new Promise((resolve) => onNextFrame(() => {
    const out = document.createElement("canvas");
    out.width = source.width; out.height = source.height;
    const g = out.getContext("2d")!;
    g.drawImage(source, 0, 0);
    drawCard(g, out.width, out.height, f);
    out.toBlob((b) => { if (b) save(b, fileName(f.title, "png")); resolve(); }, "image/png");
  }));
}

/**
 * Records a short film. `subscribe` registers a per-frame callback that runs
 * right after the source draws, and returns an unsubscribe. `during` runs once
 * when recording starts (to set the camera moving) and its result is called at the end.
 */
export async function film(source: HTMLCanvasElement, subscribe: (cb: () => void) => () => void, f: Frame, seconds = 8, during?: () => (() => void) | void): Promise<boolean> {
  const fmt = pickMime((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  if (!fmt) return false;
  const long = 1920, k = Math.min(1, long / Math.max(source.width, source.height));
  const out = document.createElement("canvas");
  out.width = Math.round(source.width * k / 2) * 2; out.height = Math.round(source.height * k / 2) * 2;
  const g = out.getContext("2d")!;
  const t0 = performance.now();
  const off = subscribe(() => {
    const c = coverCrop(source.width, source.height, out.width, out.height);
    g.drawImage(source, c.sx, c.sy, c.sw, c.sh, 0, 0, out.width, out.height);
    // The card fades in over the first second and a half.
    drawCard(g, out.width, out.height, f, (performance.now() - t0) / 1500);
  });
  const rec = new MediaRecorder(out.captureStream(30), { mimeType: fmt.mime, videoBitsPerSecond: 10_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stop = during?.();
  const done = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start(250);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  rec.stop();
  await done;
  off();
  if (typeof stop === "function") stop();
  save(new Blob(chunks, { type: fmt.mime }), fileName(f.title, fmt.ext));
  return true;
}
