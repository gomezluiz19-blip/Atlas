// Pure helpers for recording the map: output shapes, cropping, file types.
export const SHAPES = {
  wide: { label: "Widescreen 16:9 (YouTube, slides)", w: 1920, h: 1080 },
  square: { label: "Square 1:1 (posts)", w: 1080, h: 1080 },
  tall: { label: "Vertical 9:16 (stories, shorts)", w: 1080, h: 1920 },
  screen: { label: "Same as the screen", w: 0, h: 0 },
} as const;
export type Shape = keyof typeof SHAPES;

/** Output size for a shape, never larger than `maxLong` on its long side. */
export function outputSize(shape: Shape, screenW: number, screenH: number, maxLong = 1920): { w: number; h: number } {
  const s = SHAPES[shape];
  let w: number = s.w || screenW, hgt: number = s.h || screenH;
  const k = Math.min(1, maxLong / Math.max(w, hgt));
  w = Math.round((w * k) / 2) * 2;
  hgt = Math.round((hgt * k) / 2) * 2;
  return { w, h: hgt };
}

/** The part of the source to draw so it fills the output without stretching (centre crop). */
export function coverCrop(srcW: number, srcH: number, outW: number, outH: number) {
  const scale = Math.max(outW / srcW, outH / srcH);
  const sw = outW / scale, sh = outH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

/** The first recording format this browser supports. */
export function pickMime(supported: (t: string) => boolean): { mime: string; ext: string } | null {
  for (const [mime, ext] of [
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm;codecs=vp8,opus", "webm"],
    ["video/webm", "webm"],
    ["video/mp4;codecs=avc1,mp4a", "mp4"],
    ["video/mp4", "mp4"],
  ] as const)
    if (supported(mime)) return { mime, ext };
  return null;
}

export const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Splits text into lines that fit `maxWidth`, measured by `measure`. */
export function wrap(text: string, maxWidth: number, measure: (s: string) => number, maxLines = 4): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}
