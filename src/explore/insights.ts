// "Worth knowing here": facts about the place in view that most people
// wouldn't think to look up: aurora, midnight sun, plate boundaries, recent
// earthquakes, World Heritage sites, the tropics.
import { auroraZone, daylightHours, distanceKm, magneticLatitude, nearestOnLines, skyState, sunAltitude } from "../analysis/insights";
import { recentQuakes } from "../data/quakes";
import { auroraAt, auroraForecast, kpMeaning, latestKp } from "../data/space";
import type { Notable } from "../data/wikidata";
import { boundaryName, plates } from "../data/worldData";
import type { OverlayId } from "../globe/overlays";

export interface Insight {
  id: string;
  icon: "aurora" | "sun" | "moon" | "plates" | "quake" | "heritage" | "globe";
  title: string;
  detail: string;
  /** An overlay that shows this on the map. */
  overlay?: OverlayId;
  /** Higher sorts first. */
  weight: number;
}

const hm = (h: number) => `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`;

/** Facts for the whole planet, when zoomed right out. */
async function globalInsights(): Promise<Insight[]> {
  const out: Insight[] = [];
  const [kp, quakes] = await Promise.all([latestKp().catch(() => null), recentQuakes().catch(() => null)]);
  if (kp && Number.isFinite(kp.kp)) {
    out.push({
      id: "aurora", icon: "aurora", overlay: "aurora", weight: 90,
      title: `Space weather: Kp ${kp.kp.toFixed(1)}`,
      detail: `Earth's magnetic field is ${kpMeaning(kp.kp)}. Zoom toward Scandinavia, Iceland, Alaska or Canada to see tonight's chances.`,
    });
  }
  if (quakes?.length) {
    const big = quakes.reduce((a, b) => (b.mag > a.mag ? b : a));
    const strong = quakes.filter((q) => q.mag >= 5).length;
    out.push({
      id: "quakes", icon: "quake", overlay: "quakes", weight: 80,
      title: `${quakes.length.toLocaleString()} earthquakes this week`,
      detail: `Magnitude 2.5 and up, worldwide. ${strong} reached magnitude 5 or more; the largest was M${big.mag.toFixed(1)}, ${big.place}. Most follow the edges of tectonic plates.`,
    });
  }
  out.push({
    id: "plates", icon: "plates", overlay: "plates", weight: 40,
    title: "A planet of moving plates",
    detail: "Earth's outer shell is broken into about 50 plates that drift a few centimetres a year. Turn on Plates to see where they meet.",
  });
  return out;
}

export async function insightsFor(lon: number, lat: number, radiusKm: number, notable: Notable[], now = new Date()): Promise<Insight[]> {
  if (radiusKm > 4000) return globalInsights();
  const out: Insight[] = [];
  const tasks: Promise<void>[] = [];

  // Aurora.
  const mlat = magneticLatitude(lat, lon);
  let zone = auroraZone(mlat);
  if (zone === "rare") {
    // Only worth mentioning far from the pole when a strong storm is actually under way.
    const kp = await latestKp().catch(() => null);
    if (!kp || !(kp.kp >= 6.5)) zone = "none";
  }
  if (zone !== "none") {
    const north = lat >= 0;
    const name = north ? "Northern lights" : "Southern lights";
    const base: Insight = {
      id: "aurora",
      icon: "aurora",
      title: zone === "oval" ? `${name} zone` : zone === "storms" ? `${name} during storms` : `${name}, rarely`,
      detail: zone === "oval"
        ? `You're under the auroral oval (magnetic latitude ${Math.abs(mlat).toFixed(0)}°), one of the best places on Earth to see the ${name.toLowerCase()} on dark, clear nights.`
        : zone === "storms"
          ? `The ${name.toLowerCase()} reach here when geomagnetic activity is up (Kp ${Math.max(3, Math.ceil((66.5 - Math.abs(mlat)) / 2))} or more).`
          : `Only strong geomagnetic storms (Kp 7+) push the ${name.toLowerCase()} this far from the pole.`,
      overlay: "aurora",
      weight: zone === "oval" ? 100 : zone === "storms" ? 70 : 30,
    };
    out.push(base);
    tasks.push((async () => {
      const [f, kp] = await Promise.all([auroraForecast().catch(() => null), latestKp().catch(() => null)]);
      const sky = skyState(sunAltitude(lat, lon, now));
      const bits: string[] = [];
      if (f) {
        let p = 0;
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) p = Math.max(p, auroraAt(f, lon + dx, lat + dy));
        bits.push(`Chance of aurora overhead right now: ${p}%.`);
        if (p >= 30) base.weight = 150;
      }
      if (kp && Number.isFinite(kp.kp)) bits.push(`Kp ${kp.kp.toFixed(1)}: ${kpMeaning(kp.kp)}.`);
      bits.push(sky === "dark" ? "It's dark here now." : sky === "twilight" ? "It's twilight here now." : "It's daytime here now, so any aurora is washed out.");
      base.detail += ` ${bits.join(" ")}`;
    })());
  }

  // Daylight at high latitudes.
  if (Math.abs(lat) >= 55) {
    const today = daylightHours(lat, now);
    const polar = Math.abs(lat) >= 66.56;
    out.push({
      id: "daylight",
      icon: today === 24 ? "sun" : today === 0 ? "moon" : "sun",
      title: today === 24 ? "Midnight sun today" : today === 0 ? "Polar night today" : `${hm(today)} of daylight today`,
      detail: polar
        ? "North of the polar circle the sun never sets for part of summer and never rises for part of winter."
        : `Days here swing from about ${hm(daylightHours(lat, new Date(Date.UTC(now.getUTCFullYear(), lat >= 0 ? 11 : 5, 21))))} in midwinter to ${hm(daylightHours(lat, new Date(Date.UTC(now.getUTCFullYear(), lat >= 0 ? 5 : 11, 21))))} in midsummer.`,
      weight: today === 24 || today === 0 ? 90 : 40,
    });
  } else if (Math.abs(lat) <= 23.44) {
    out.push({
      id: "tropics",
      icon: "sun",
      title: Math.abs(lat) < 1 ? "On the equator" : "In the tropics",
      detail: Math.abs(lat) < 1
        ? "Day and night are close to 12 hours all year, and the sun passes straight overhead at the equinoxes."
        : "The sun passes directly overhead twice a year here, and days stay close to 12 hours long.",
      weight: 20,
    });
  }

  // Plate boundaries and earthquakes.
  tasks.push((async () => {
    const p = await plates().catch(() => null);
    if (!p) return;
    const lines = p.boundaries.flatMap(([, , ls]) => ls);
    const owners = p.boundaries.flatMap(([code, , ls]) => ls.map(() => code));
    const near = nearestOnLines(lon, lat, lines);
    const limit = Math.min(600, Math.max(150, radiusKm));
    if (near.line >= 0 && near.km <= limit) {
      out.push({
        id: "plates",
        icon: "plates",
        title: near.km < 30 ? "On a plate boundary" : "Near a plate boundary",
        detail: `The boundary between the ${boundaryName(owners[near.line], p.plates)} runs ${near.km < 5 ? "right here" : `about ${Math.round(near.km)} km away`}. Earthquakes, volcanoes and mountain building concentrate along these seams.`,
        overlay: "plates",
        weight: near.km < 30 ? 80 : 50,
      });
    }
  })());
  tasks.push((async () => {
    const quakes = await recentQuakes().catch(() => null);
    if (!quakes) return;
    const r = Math.min(1500, Math.max(150, radiusKm * 1.2));
    const nearby = quakes.filter((q) => distanceKm(lon, lat, q.lon, q.lat) <= r);
    if (!nearby.length) return;
    const big = nearby.reduce((a, b) => (b.mag > a.mag ? b : a));
    const days = Math.max(0, Math.round((now.getTime() - big.time) / 86_400_000));
    out.push({
      id: "quakes",
      icon: "quake",
      title: `${nearby.length} earthquake${nearby.length === 1 ? "" : "s"} this week`,
      detail: `Within ${Math.round(r)} km in the past 7 days (magnitude 2.5+). The largest was M${big.mag.toFixed(1)}, ${big.place}, ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.`,
      overlay: "quakes",
      weight: 45 + Math.min(40, nearby.length) + big.mag * 5,
    });
  })());

  // World Heritage in view.
  const heritage = notable.filter((n) => n.heritage);
  if (heritage.length) {
    out.push({
      id: "heritage",
      icon: "heritage",
      title: `${heritage.length} UNESCO World Heritage site${heritage.length === 1 ? "" : "s"} in view`,
      detail: heritage.slice(0, 4).map((h) => h.name).join(", ") + (heritage.length > 4 ? ", and more." : "."),
      weight: 60 + heritage.length,
    });
  }

  await Promise.all(tasks);
  return out.sort((a, b) => b.weight - a.weight);
}
