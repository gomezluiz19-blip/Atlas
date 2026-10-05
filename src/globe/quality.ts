// How hard the globe works, fitted to the device it's on. A new flagship phone
// on fibre and a five-year-old tablet on a train shouldn't get the same globe:
// the first can take sharp terrain, a big tile cache and full-density pixels;
// the second wants fewer pixels, a smaller cache and coarser terrain, so it
// stays smooth and the battery lasts. The first guess comes from what the
// browser says about the device (memory, cores, screen, data saver, connection,
// battery); after that it learns: a device that keeps dropping frames while
// the map moves steps down a tier, remembered for next time. All pure except
// the reading of signals and the memory, so the choices can be tested.

export type Tier = "low" | "mid" | "high";

export interface Signals {
  /** GB, as navigator.deviceMemory reports it (rounded, capped at 8). */
  memory?: number;
  cores?: number;
  dpr: number;
  /** A touch-first device (usually a phone or tablet). */
  coarse: boolean;
  saveData?: boolean;
  /** "slow-2g" | "2g" | "3g" | "4g" */
  net?: string;
  /** Battery level 0–1 and whether it's charging, when known. */
  battery?: { level: number; charging: boolean };
}

export interface Quality {
  tier: Tier;
  /** Device pixels per CSS pixel to render at (≤ the screen's). */
  pixelRatio: number;
  /** Terrain detail: Cesium's maximumScreenSpaceError (higher = coarser, faster). */
  sse: number;
  tileCache: number;
  fxaa: boolean;
  /** Multisample anti-aliasing (WebGL 2): crisp coastlines, limbs and lines without FXAA's softness. */
  msaa: number;
  /** Extra coarseness while the camera is moving. */
  movingSse: number;
  /** Resolution while moving on a slow frame run, as a share of the settled one. */
  movingScale: number;
  /** Milliseconds between idle redraws. */
  heartbeat: number;
  /** Fetch likely-next screens ahead of time when idle. */
  prefetch: boolean;
}

const ORDER: Tier[] = ["low", "mid", "high"];

/** The tier the signals point to (pure). */
export function tierFor(s: Signals): Tier {
  if (s.saveData || s.net === "slow-2g" || s.net === "2g") return "low";
  if (s.battery && !s.battery.charging && s.battery.level < 0.2) return "low";
  const mem = s.memory ?? (s.coarse ? 4 : 8), cores = s.cores ?? 4;
  if (mem <= 2 || cores <= 2) return "low";
  if (mem >= 8 && cores >= 8 && s.net !== "3g") return "high";
  if (!s.coarse && mem >= 4 && cores >= 6 && s.net !== "3g") return "high";
  return "mid";
}

/** The settings for a tier on a screen (pure). */
export function qualityFor(tier: Tier, s: Pick<Signals, "dpr" | "saveData" | "net">): Quality {
  const cap = tier === "high" ? 2 : tier === "mid" ? 1.5 : 1;
  const slowNet = s.saveData || s.net === "slow-2g" || s.net === "2g" || s.net === "3g";
  return {
    tier,
    pixelRatio: Math.min(s.dpr || 1, cap),
    sse: tier === "high" ? 1.5 : tier === "mid" ? 2.25 : 4,
    tileCache: tier === "high" ? 600 : tier === "mid" ? 350 : 150,
    fxaa: tier === "mid",
    msaa: tier === "high" ? 4 : 1,
    movingSse: tier === "low" ? 2 : 1.5,
    movingScale: tier === "low" ? 0.6 : 0.75,
    heartbeat: tier === "low" ? 600 : 300,
    prefetch: tier !== "low" && !slowNet,
  };
}

/** One tier down (pure). */
export const stepDown = (t: Tier): Tier => ORDER[Math.max(0, ORDER.indexOf(t) - 1)];

const KEY = "atlas.quality";
type Memory = { tier?: Tier; pinned?: boolean };
const recall = (): Memory => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Memory; } catch { return {}; } };
const remember = (m: Memory) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private mode */ } };

/** What the browser says about this device, now. */
export function readSignals(): Signals {
  const n = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  const mm = (q: string) => typeof matchMedia !== "undefined" && matchMedia(q).matches;
  return {
    memory: n.deviceMemory,
    cores: n.hardwareConcurrency,
    dpr: typeof devicePixelRatio === "number" ? devicePixelRatio : 1,
    coarse: mm("(pointer: coarse)"),
    saveData: n.connection?.saveData || mm("(prefers-reduced-data: reduce)"),
    net: n.connection?.effectiveType,
  };
}

/** The settings for this device: a tier it learned or was set to, or the browser's signals. */
export function currentQuality(signals = readSignals()): Quality {
  const m = recall();
  const guess = tierFor(signals);
  // A learned step down sticks; a pinned choice always wins.
  const tier = m.pinned && m.tier ? m.tier : m.tier && ORDER.indexOf(m.tier) < ORDER.indexOf(guess) ? m.tier : guess;
  return qualityFor(tier, signals);
}

/** Sets the tier by hand (null: back to automatic). */
export function pinQuality(tier: Tier | null) { remember(tier ? { tier, pinned: true } : {}); }

/** Learns that this device struggles: the next visit starts a tier lower. */
export function learnSlow(now: Tier): Tier {
  const m = recall();
  if (m.pinned) return now;
  const t = stepDown(now);
  remember({ tier: t });
  return t;
}
