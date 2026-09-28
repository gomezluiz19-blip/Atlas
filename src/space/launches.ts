// Rocket launches from The Space Devs' Launch Library 2 (free tier: about
// 15 requests an hour, so results are cached for 10 minutes).
export interface Launch {
  id: string;
  name: string;
  net: number;
  status: string;
  statusName: string;
  rocket: string;
  provider: string;
  mission?: string;
  orbit?: string;
  pad: string;
  location: string;
  lon: number;
  lat: number;
  image?: string;
  url?: string;
}

interface LL2 {
  results: {
    id: string; name: string; net: string; status?: { abbrev?: string; name?: string };
    rocket?: { configuration?: { full_name?: string; name?: string } };
    launch_service_provider?: { name?: string };
    mission?: { description?: string; orbit?: { abbrev?: string } } | null;
    pad?: { name?: string; latitude?: string | number; longitude?: string | number; location?: { name?: string } };
    image?: string | null; slug?: string;
  }[];
}

const BASE = "https://ll.thespacedevs.com/2.2.0/launch";

export function parseLaunches(data: LL2): Launch[] {
  return (data.results ?? []).flatMap((r) => {
    const lat = Number(r.pad?.latitude), lon = Number(r.pad?.longitude), net = Date.parse(r.net);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(net)) return [];
    return [{
      id: r.id, name: r.name, net, status: r.status?.abbrev ?? "TBD", statusName: r.status?.name ?? "",
      rocket: r.rocket?.configuration?.full_name ?? r.rocket?.configuration?.name ?? "Rocket",
      provider: r.launch_service_provider?.name ?? "", mission: r.mission?.description ?? undefined, orbit: r.mission?.orbit?.abbrev ?? undefined,
      pad: r.pad?.name ?? "", location: r.pad?.location?.name ?? "", lon, lat, image: r.image ?? undefined,
      url: r.slug ? `https://www.spacelaunchschedule.com/launch/${r.slug}/` : undefined,
    }];
  });
}

async function cached(kind: "upcoming" | "previous"): Promise<Launch[]> {
  const key = `atlas.launches.${kind}`;
  try {
    const hit = JSON.parse(localStorage.getItem(key) ?? "null");
    if (hit && Date.now() - hit.at < 600_000) return hit.list;
  } catch { /* refetch */ }
  const res = await fetch(`${BASE}/${kind}/?limit=12&mode=normal`);
  if (!res.ok) throw new Error(res.status === 429 ? "The launch service is busy; try again in a few minutes." : `Launch Library answered ${res.status}`);
  const list = parseLaunches(await res.json());
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), list })); } catch { /* fine */ }
  return list;
}

export const upcoming = () => cached("upcoming");
export const previous = () => cached("previous");

/** A launch in the air now: marked in flight, or lifted off in the last 15 minutes without a result yet. */
export const inFlight = (l: Launch, now = Date.now()) =>
  l.status === "In Flight" || (l.net <= now && now - l.net < 15 * 60_000 && !/Success|Failure|Partial/i.test(l.status));

/**
 * An illustrative ascent: where a rocket roughly is `t` seconds after liftoff.
 * Heads east from most pads (to use Earth's spin), south from polar sites.
 * Not tracking data: a picture of a typical climb to orbit.
 */
export function ascent(l: Launch, t: number): { lon: number; lat: number; alt: number } {
  const polar = /SSO|PO|Polar/i.test(l.orbit ?? "") || (l.lon < -115 && l.lat > 30 && l.lat < 36);
  const az = (polar ? 190 : l.lat > 40 ? 60 : 90) * (Math.PI / 180);
  const s = Math.max(0, t);
  const alt = 210_000 * (1 - Math.exp(-s / 220)); // metres, levelling off near 200 km
  // Downrange distance (km): slow at first, about 1,800 km at engine cut-off after 8 minutes, then orbital speed.
  const down = s < 480 ? 0.008 * s * s : 1843 + (s - 480) * 7.6;
  const d = down / 6371;
  const φ1 = (l.lat * Math.PI) / 180, λ1 = (l.lon * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(az));
  const λ2 = λ1 + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return { lon: (((λ2 * 180) / Math.PI + 540) % 360) - 180, lat: (φ2 * 180) / Math.PI, alt };
}

export function countdown(ms: number, now = Date.now()): string {
  const d = ms - now, a = Math.abs(d);
  const days = Math.floor(a / 86_400_000), h = Math.floor((a % 86_400_000) / 3_600_000), m = Math.floor((a % 3_600_000) / 60_000), s = Math.floor((a % 60_000) / 1000);
  const body = days ? `${days}d ${h}h` : h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s).padStart(2, "0")}s`;
  return d >= 0 ? `T−${body}` : `T+${body}`;
}
