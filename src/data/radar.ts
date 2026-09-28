// Live precipitation radar mosaics from RainViewer (https://www.rainviewer.com/api.html).
import { getJson } from "./http";

/** Tile URL template for the most recent radar frame. */
export async function latestRadarTiles(): Promise<{ url: string; time: Date }> {
  const body = await getJson<{ host: string; radar: { past: { time: number; path: string }[] } }>(
    "RainViewer",
    `https://api.rainviewer.com/public/weather-maps.json?t=${Math.floor(Date.now() / 300_000)}`,
  );
  const frame = body.radar.past[body.radar.past.length - 1];
  return { url: `${body.host}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`, time: new Date(frame.time * 1000) };
}
