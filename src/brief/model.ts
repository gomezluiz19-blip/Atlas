// What each tab says first: a sentence worth reading, worked out from your own people, plans and places.
// Pure: no DOM, no network.

type Spot = { lon: number; lat: number };

const kmBetween = (a: Spot, b: Spot) => {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
};

// ---- People --------------------------------------------------------------------------------------

export interface Someone extends Spot { name: string; where: string; tz?: string }

/** The country from a place's words ("Lisbon, Portugal" → "Portugal") (pure). */
export const countryOfWords = (where: string) => where.split(",").map((s) => s.trim()).filter(Boolean).pop() ?? "";

const hourIn = (tz: string, now: Date) => {
  try { return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now)); } catch { return NaN; }
};

/** Where your people are, in a sentence's worth of numbers (pure). */
export function peopleSummary(people: Someone[], home: Spot | null, now: Date) {
  const countries = new Set(people.map((p) => countryOfWords(p.where)).filter(Boolean));
  const zones = new Set(people.map((p) => p.tz).filter(Boolean));
  const hours = people.map((p) => (p.tz ? hourIn(p.tz, now) : NaN));
  const known = hours.filter((x) => Number.isFinite(x));
  const awake = known.filter((x) => x >= 7 && x < 23).length;
  const far = home ? people.map((p) => ({ p, km: kmBetween(home, p) })).sort((a, b) => b.km - a.km)[0] ?? null : null;
  const near = home ? people.filter((p) => kmBetween(home, p) < 50).length : 0;
  return { count: people.length, countries: countries.size, zones: zones.size, awake, asleep: known.length - awake, known: known.length, farthest: far, near };
}

/** The headline and its second line (pure). */
export function peopleLede(s: ReturnType<typeof peopleSummary>): { title: string; line: string } {
  if (!s.count) return { title: "Who are your people?", line: "Add family and friends, and see at a glance where they are, their time and their weather." };
  const n = s.count === 1 ? "Your one person is" : `Your ${s.count} people`;
  const span = s.count === 1 ? `${n} ${s.countries ? "in one country" : "on the map"}.`
    : `${n} span ${s.countries} ${s.countries === 1 ? "country" : "countries"}${s.zones > 1 ? ` and ${s.zones} time zones` : ""}.`;
  const bits: string[] = [];
  if (s.known) bits.push(s.awake === s.known ? "All are likely awake now." : s.awake === 0 ? "All are likely asleep now." : `${s.awake} ${s.awake === 1 ? "is" : "are"} likely awake now.`);
  if (s.near) bits.push(`${s.near} ${s.near === 1 ? "lives" : "live"} within 50 km of home.`);
  if (s.farthest && s.farthest.km > 50 && s.count > 1) bits.push(`${s.farthest.p.name.split(" ")[0]} is farthest, ${Math.round(s.farthest.km).toLocaleString("en-US")} km away.`);
  return { title: span, line: bits.join(" ") };
}

// ---- Weather on the days that matter -------------------------------------------------------------

export interface DayWx { date: string; code: number; max: number; min: number; rain: number; chance: number | null; gust: number; snow: number }

export type Tone = "storm" | "snow" | "rain" | "hot" | "cold" | "wind" | "fine";
export const TONES: Record<Tone, { color: string; label: string }> = {
  storm: { color: "#5160c2", label: "Storms" }, snow: { color: "#a3bfd4", label: "Snow" }, rain: { color: "#4c9ac9", label: "Rain" },
  hot: { color: "#c4513a", label: "Heat" }, cold: { color: "#8c8f87", label: "Frost" }, wind: { color: "#9a7552", label: "Wind" }, fine: { color: "#5b9467", label: "Fine" },
};

/** What a day's weather means for being out in it, and what to do about it (pure). */
export function dayNote(d: DayWx): { tone: Tone; words: string; advice: string } {
  const t = (x: number) => `${Math.round(x)}°`;
  if (d.code >= 95) return { tone: "storm", words: `Thunderstorms, ${t(d.max)}`, advice: "Have an indoor plan." };
  if (d.snow >= 1 || (d.code >= 71 && d.code <= 77) || d.code === 85 || d.code === 86) return { tone: "snow", words: `Snow${d.snow >= 1 ? `, about ${Math.round(d.snow)} cm` : ""}, ${t(d.max)}`, advice: "Allow extra time on the roads." };
  if ((d.chance ?? 0) >= 50 || d.rain >= 3) return { tone: "rain", words: `Rain likely${d.chance !== null ? `, ${d.chance}%` : ""}${d.rain >= 1 ? ` · ${Math.round(d.rain)} mm` : ""}`, advice: d.rain >= 10 ? "A wet one: waterproofs, not just an umbrella." : "Take a jacket." };
  if (d.max >= 32) return { tone: "hot", words: `Very hot, ${t(d.max)}`, advice: "Shade and water; go out early or late." };
  if (d.max >= 29) return { tone: "hot", words: `Hot, ${t(d.max)}`, advice: "Sunscreen and water." };
  if (d.min <= 0) return { tone: "cold", words: `Frost, down to ${t(d.min)}`, advice: "Layers, and watch for ice." };
  if (d.gust >= 60) return { tone: "wind", words: `Windy, gusts ${Math.round(d.gust)} km/h`, advice: "Secure anything loose." };
  return { tone: "fine", words: `Dry, ${t(d.min)}–${t(d.max)}`, advice: "" };
}

export interface Planned { id: string; title: string; sub: string; date: string; lon: number; lat: number; group?: string }
export interface AheadNote { plan: Planned; day: DayWx; tone: Tone; words: string; advice: string; inDays: number }

const dayMs = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / dayMs);

/** The weather on each plan in the forecast's reach (the next 16 days), one note per plan and day (pure). */
export function aheadNotes(plans: Planned[], forecastFor: (p: Planned) => DayWx[] | undefined, today: string): AheadNote[] {
  const seen = new Set<string>();
  const out: AheadNote[] = [];
  for (const p of plans) {
    const inDays = daysBetween(today, p.date);
    if (inDays < 0 || inDays > 15) continue;
    const key = `${p.group ?? p.id}|${p.date}`;
    if (seen.has(key)) continue;
    const day = forecastFor(p)?.find((d) => d.date === p.date);
    if (!day) continue;
    seen.add(key);
    out.push({ plan: p, day, inDays, ...dayNote(day) });
  }
  return out.sort((a, b) => a.plan.date.localeCompare(b.plan.date));
}

/** The headline over the notes (pure). */
export function aheadLede(notes: AheadNote[]): string {
  if (!notes.length) return "";
  const rough = notes.filter((n) => n.tone !== "fine");
  if (!rough.length) return notes.length === 1 ? "Your plan ahead looks dry and settled." : `All ${notes.length} of your plans in the next two weeks look dry and settled.`;
  const first = rough[0];
  const when = first.inDays === 0 ? "today" : first.inDays === 1 ? "tomorrow" : `in ${first.inDays} days`;
  const what = TONES[first.tone].label.toLowerCase();
  return rough.length === 1 ? `Watch for ${what} ${when}: ${first.plan.title}.` : `${rough.length} of your plans meet rough weather, starting ${when} with ${what}.`;
}

/** A day's weather from Open-Meteo's daily arrays, by index (pure). */
export function dayAt(d: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[]; precipitation_probability_max: (number | null)[]; wind_gusts_10m_max?: number[]; snowfall_sum?: number[] }, i: number): DayWx {
  return { date: d.time[i], code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_sum[i] ?? 0, chance: d.precipitation_probability_max[i] ?? null, gust: d.wind_gusts_10m_max?.[i] ?? 0, snow: d.snowfall_sum?.[i] ?? 0 };
}

// ---- The next hours, as a ribbon ----------------------------------------------------------------------

/** A temperature as a pigment, ice through cerulean, sage, ochre and terracotta to madder (pure). */
export function tempColor(c: number): string {
  const stops: [number, [number, number, number]][] = [[-10, [163, 191, 212]], [2, [76, 154, 201]], [12, [91, 148, 103]], [20, [209, 154, 46]], [28, [196, 81, 58]], [36, [184, 73, 106]]];
  if (c <= stops[0][0]) return `rgb(${stops[0][1].join(",")})`;
  for (let i = 1; i < stops.length; i++) {
    const [b, cb] = stops[i], [a, ca] = stops[i - 1];
    if (c <= b) { const f = (c - a) / (b - a); return `rgb(${ca.map((x, j) => Math.round(x + (cb[j] - x) * f)).join(",")})`; }
  }
  return `rgb(${stops[stops.length - 1][1].join(",")})`;
}

/** The sentence for the hours ahead: when rain arrives, or how warm it gets (pure). */
export function hoursLede(hours: { time: string; temp: number; chance: number }[], nowTemp: number): string {
  const wet = hours.findIndex((x) => x.chance >= 50);
  const at = (i: number) => { const hr = Number(hours[i].time.slice(11, 13)); return `${hr % 12 || 12} ${hr < 12 ? "am" : "pm"}`; };
  if (wet === 0) return `Rain about now (${hours[0].chance}%), easing later.`;
  if (wet > 0 && wet < 12) return `Rain likely from ${at(wet)} (${hours[wet].chance}%).`;
  const next12 = hours.slice(0, 12);
  const hi = next12.reduce((m, x, i) => (x.temp > next12[m].temp ? i : m), 0), lo = next12.reduce((m, x, i) => (x.temp < next12[m].temp ? i : m), 0);
  if (next12[hi].temp - nowTemp >= 3) return `Dry, warming to ${Math.round(next12[hi].temp)}° by ${at(hi)}.`;
  if (nowTemp - next12[lo].temp >= 3) return `Dry, cooling to ${Math.round(next12[lo].temp)}° by ${at(lo)}.`;
  return "Dry and steady for the next twelve hours.";
}
