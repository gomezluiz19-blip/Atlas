// The Terreno mark: a dome of tesserae. Half the Earth seen at the horizon, laid as a mosaic in the four
// pigments (cobalt sky and sea, sage land, ochre and terracotta earth), with the horizon arc of the wordmark
// above it and registration marks at the corners, the way a printer frames a plate. One generator makes
// every size: the app's mark, the favicon, the home-screen icon and the share card (pure, so a build script
// can call it too).

export const PIGMENTS = { cobalt: "#2f58c8", ochre: "#c4922b", sage: "#56705a", terra: "#a9502f", ink: "#1b1d1a", paper: "#f5f2eb", cerulean: "#4c9ac9" } as const;

/** An annular sector (a mosaic tile in the dome), centre (cx, cy), radii r0..r1, angles a0..a1 in degrees (0 = east, 180 = west, counter-clockwise up). */
export function tile(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => { const t = (a * Math.PI) / 180; return `${(cx + r * Math.cos(t)).toFixed(2)},${(cy - r * Math.sin(t)).toFixed(2)}`; };
  return `M${p(r1, a0)} A${r1},${r1} 0 0 0 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 1 ${p(r0, a0)} Z`;
}

/** The dome's tiles: an outer ring of five, an inner ring of three, a keystone (pure). */
export function domeTiles(cx: number, cy: number, r: number): { d: string; fill: string }[] {
  const P = PIGMENTS, out: { d: string; fill: string }[] = [];
  const outer = [P.sage, P.ochre, P.cobalt, P.cerulean, P.terra];
  outer.forEach((fill, i) => out.push({ d: tile(cx, cy, r * 0.58, r, i * 36, (i + 1) * 36), fill }));
  const inner = [P.terra, P.sage, P.cobalt];
  inner.forEach((fill, i) => out.push({ d: tile(cx, cy, r * 0.22, r * 0.58, i * 60, (i + 1) * 60), fill }));
  out.push({ d: tile(cx, cy, 0, r * 0.22, 0, 180), fill: P.ochre });
  return out;
}

export interface MarkOptions { size?: number; background?: string | null; ticks?: boolean; arc?: boolean; grout?: string; /** Small sizes: a bigger dome, no arc or marks. */ compact?: boolean }

/** The mark as an SVG string (pure). */
export function markSvg(o: MarkOptions = {}): string {
  const size = o.size ?? 64, bg = o.background === undefined ? PIGMENTS.ink : o.background, grout = o.grout ?? (bg ?? PIGMENTS.paper);
  const line = bg === PIGMENTS.ink || bg === null ? PIGMENTS.paper : PIGMENTS.ink;
  const compact = !!o.compact;
  const cx = 32, cy = compact ? 47 : 43, r = compact ? 26 : 19;
  const tiles = domeTiles(cx, cy, r).map((t) => `<path d="${t.d}" fill="${t.fill}" stroke="${grout}" stroke-width="${compact ? 2 : 1.4}" stroke-linejoin="round"/>`).join("");
  const arc = o.arc === false || compact ? "" : `<path d="M${cx - r - 5},${cy - 2} A${r + 5},${r + 5} 0 0 1 ${cx + r + 5},${cy - 2}" fill="none" stroke="${line}" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>`;
  const base = `<path d="M${cx - r - (compact ? 3 : 7)},${cy + 1.2} H${cx + r + (compact ? 3 : 7)}" stroke="${line}" stroke-width="${compact ? 2.6 : 1.6}" stroke-linecap="round"/>`;
  const t = 4.5, m = 7.5, e = 64 - m;
  const ticks = o.ticks === false || compact ? "" : `<g stroke="${line}" stroke-width="1.3" stroke-linecap="round" opacity=".55">` +
    [[m, m, 1, 1], [e, m, -1, 1], [m, e, 1, -1], [e, e, -1, -1]].map(([x, y, dx, dy]) => `<path d="M${x},${y + dy * t} V${y} H${x + dx * t}"/>`).join("") + "</g>";
  const rect = bg ? `<rect width="64" height="64" rx="14" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="Terreno">${rect}${ticks}${arc}${tiles}${base}</svg>`;
}

/** The wordmark: the mark beside TERRENO set wide, as in the brand board (pure). */
export function wordmarkHtml(size = 26): string {
  return `<span class="brand-mark" aria-hidden="true">${markSvg({ size, background: null, ticks: false })}</span><span class="brand-word">TERRENO</span>`;
}
