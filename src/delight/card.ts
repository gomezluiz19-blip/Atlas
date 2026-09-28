// Things worth sending: any place, answer or moment becomes a picture card in
// one tap. The globe as it is on screen, the name set large, the one striking
// fact, and the link back, made for Messages and Instagram (1080 × 1350).
import type { App } from "../app";
import { h } from "../ui/dom";
import { chime } from "./sound";

export interface CardText {
  kicker?: string;
  title: string;
  fact?: string;
  link: string;
}

const W = 1080, H = 1350;

/** The globe's current frame (read in the frame it was drawn). */
function grabGlobe(app: App): Promise<HTMLCanvasElement> {
  const scene = app.globe.viewer.scene;
  return new Promise((resolve) => {
    const off = scene.postRender.addEventListener(() => {
      off();
      const src = scene.canvas, out = document.createElement("canvas");
      out.width = src.width; out.height = src.height;
      out.getContext("2d")!.drawImage(src, 0, 0);
      resolve(out);
    });
    scene.requestRender();
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/), lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "…"); }
  return lines;
}

/** Draws the card (pure drawing, given the globe picture). */
export function drawCard(ctx: CanvasRenderingContext2D, globe: CanvasImageSource & { width: number; height: number }, t: CardText) {
  // The globe, cropped to fill.
  const s = Math.max(W / globe.width, H / globe.height), gw = globe.width * s, gh = globe.height * s;
  ctx.fillStyle = "#05070b";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(globe, (W - gw) / 2, (H - gh) / 2, gw, gh);
  // A dusk gradient so the words read over any ground.
  const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
  g.addColorStop(0, "rgba(5,7,11,0)");
  g.addColorStop(0.55, "rgba(5,7,11,0.72)");
  g.addColorStop(1, "rgba(5,7,11,0.94)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const x = 84, font = (w: number, px: number) => `${w} ${px}px Inter, -apple-system, "Segoe UI", sans-serif`;
  let y = H - 150;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  // From the bottom up: link, fact, title, kicker.
  ctx.font = font(500, 28);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  const link = t.link.replace(/^https?:\/\//, "").replace(/\/$/, "");
  ctx.fillText(link.length > 56 ? `${link.slice(0, 55)}…` : link, x, H - 72);
  ctx.font = font(700, 28);
  ctx.fillStyle = "#fff";
  const brand = "ATLAS";
  ctx.fillText(brand, W - x - ctx.measureText(brand).width, H - 72);
  if (t.fact) {
    ctx.font = font(450, 42);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    const lines = wrap(ctx, t.fact, W - x * 2, 3);
    y -= (lines.length - 1) * 56;
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * 56));
    y -= 84;
  }
  ctx.font = font(700, 104);
  ctx.fillStyle = "#fff";
  const title = wrap(ctx, t.title, W - x * 2, 2);
  y -= (title.length - 1) * 108;
  title.forEach((l, i) => ctx.fillText(l, x, y + i * 108));
  if (t.kicker) {
    ctx.font = font(600, 28);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const k = t.kicker.toUpperCase().split("").join(String.fromCharCode(8202));
    ctx.fillText(k, x, y - 100);
  }
}

/** Makes the card and offers it: share (phones), download, or copy the link. */
export async function shareCard(app: App, t: CardText) {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  try { await document.fonts?.ready; } catch { /* fine */ }
  drawCard(canvas.getContext("2d")!, await grabGlobe(app), t);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) { app.toast("Couldn't make the card.", 3000); return; }
  chime("surprise");
  const file = new File([blob], `${t.title.replace(/[^\w-]+/g, "-").toLowerCase() || "atlas"}.png`, { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const close = () => { sheet.remove(); URL.revokeObjectURL(url); };
  const canShare = !!navigator.canShare?.({ files: [file] });
  const sheet = h("div", { class: "card-sheet", role: "dialog", "aria-label": "Share card", onclick: (e: Event) => { if (e.target === sheet) close(); } },
    h("div", { class: "card-box" },
      h("img", { class: "card-img", src: url, alt: `${t.title}: ${t.fact ?? ""}` }),
      h("div", { class: "card-actions" },
        canShare ? h("button", { class: "primary-btn", onclick: () => void navigator.share({ files: [file], title: t.title, text: t.fact, url: t.link }).catch(() => {}) }, "Share") : "",
        h("a", { class: canShare ? "pill-btn" : "primary-btn", href: url, download: file.name }, "Download"),
        h("button", { class: "pill-btn", onclick: async () => { try { await navigator.clipboard.writeText(t.link); app.toast("Link copied", 2000); } catch { /* denied */ } } }, "Copy link"),
        h("button", { class: "link-btn", onclick: close }, "Close"))));
  document.body.append(sheet);
}
