// "Right now on Earth": a few live lines for the opening. The day's biggest
// story, the biggest recent earthquake, the aurora when it's out, and the next rocket launch; whatever
// answers in time, in plain words.
import { recentQuakes, type Quake } from "../data/quakes";
import { latestKp } from "../data/space";
import { upcoming, type Launch } from "../space/launches";
import { worldStories, type Story } from "../live/news";

export interface PulseLine { text: string; lon?: number; lat?: number; kind: "news" | "quake" | "aurora" | "launch" }

const ago = (ms: number) => {
  const h = Math.round(ms / 3_600_000);
  return h < 1 ? "within the hour" : h < 24 ? `${h} hour${h === 1 ? "" : "s"} ago` : `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? "" : "s"} ago`;
};
const until = (ms: number) => {
  const h = Math.round(ms / 3_600_000);
  return h < 1 ? "within the hour" : h < 48 ? `in ${h} hours` : `in ${Math.round(h / 24)} days`;
};
/** "95 km E of Ishinomaki, Japan" → "off Ishinomaki, Japan" when it's at sea-ish, else as given. */
const where = (place: string) => place.replace(/^\d+\s*km\s+[NSEW]{1,3}\s+of\s+/i, "near ");

/** The lines, strongest first (pure: data in, words out). */
export function pulseLines(d: { quakes?: Quake[]; kp?: number | null; launches?: Launch[]; story?: Story | null }, now = Date.now()): PulseLine[] {
  const out: PulseLine[] = [];
  // The biggest story in the world today leads.
  if (d.story) out.push({ kind: "news", text: d.story.text.length > 110 ? `${d.story.text.slice(0, 108).replace(/\s+\S*$/, "")}…` : d.story.text, lon: d.story.lon, lat: d.story.lat });
  const week = (d.quakes ?? []).filter((q) => now - q.time < 7 * 86_400_000);
  const big = [...week].sort((a, b) => b.mag - a.mag)[0];
  if (big && big.mag >= 5) out.push({ kind: "quake", text: `A magnitude ${big.mag.toFixed(1)} earthquake ${where(big.place)}, ${ago(now - big.time)}`, lon: big.lon, lat: big.lat });
  else if (week.length) out.push({ kind: "quake", text: `${week.length} earthquake${week.length === 1 ? "" : "s"} this week, none strong` });
  if (d.kp !== undefined && d.kp !== null && d.kp >= 5) out.push({ kind: "aurora", text: d.kp >= 7 ? "A strong geomagnetic storm: the aurora may be seen far from the poles tonight" : "The aurora is out tonight over the far north and south" });
  const next = (d.launches ?? []).filter((l) => l.net > now).sort((a, b) => a.net - b.net)[0];
  if (next && next.net - now < 7 * 86_400_000) out.push({ kind: "launch", text: `${next.rocket} launches from ${next.location.split(",")[0]} ${until(next.net - now)}`, lon: next.lon, lat: next.lat });
  return out;
}

/** Whatever answers within a few seconds. */
export async function earthNow(timeoutMs = 4000): Promise<PulseLine[]> {
  const soon = <T,>(p: Promise<T>) => Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), timeoutMs))]);
  const [quakes, kp, launches, feed] = await Promise.all([soon(recentQuakes()), soon(latestKp()), soon(upcoming()), soon(worldStories())]);
  return pulseLines({ quakes: quakes ?? [], kp: kp?.kp ?? null, launches: launches ?? [], story: feed?.stories[0] ?? null });
}
