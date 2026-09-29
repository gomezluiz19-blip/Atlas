// "Show me something amazing": one tap to somewhere unexpected, and why it's
// worth seeing. Draws from Atlas's curated wonders (rivers, peaks, volcanoes,
// craters, deeps, forests, deserts), its hand-picked sites and the great
// wildlife places, never the same one twice in a row, and not one you've
// seen lately.
import type { App } from "../app";
import { FEATURES } from "../content/features";
import { SITES } from "../content/sites";
import { WILD_PLACES } from "../content/wildlife";
import { findNamed } from "../place/places";
import { arrive } from "./arrive";
import { firstSentence } from "../place/headline";

export interface Wonder { name: string; kicker: string; why: string; lon: number; lat: number; radius: number; curated: boolean }

const WORD: Record<string, string> = { river: "River", peak: "Mountain", volcano: "Volcano", crater: "Impact crater", deep: "Ocean deep", forest: "Forest", metro: "Metro", lake: "Lake", waterfall: "Waterfall", canyon: "Canyon", desert: "Desert" };

export function wonders(): Wonder[] {
  const out: Wonder[] = [];
  for (const f of FEATURES) if (f.blurb && f.kind !== "metro")
    out.push({ name: f.name, kicker: WORD[f.kind] ?? f.kind, why: firstSentence(f.blurb), lon: f.lon, lat: f.lat, radius: f.kind === "river" ? 900_000 : f.kind === "desert" || f.kind === "forest" ? 700_000 : f.kind === "deep" || f.kind === "lake" ? 120_000 : 15_000, curated: true });
  for (const s of Object.values(SITES).flat().flatMap((c) => c.sites)) out.push({ name: s.name, kicker: s.where, why: s.why, lon: s.lon, lat: s.lat, radius: Math.max(3000, s.radius), curated: false });
  for (const w of WILD_PLACES) out.push({ name: w.name, kicker: "Wildlife", why: w.what, lon: w.lon, lat: w.lat, radius: 60_000, curated: false });
  const seen = new Set<string>();
  return out.filter((w) => (seen.has(w.name) ? false : (seen.add(w.name), true)));
}

const KEY = "atlas.surprise.seen";
/** A wonder not seen lately (pure, given what's been seen and a random number). */
export function pickWonder(list: Wonder[], recent: string[], r: number): Wonder {
  const fresh = list.filter((w) => !recent.includes(w.name));
  const pool = fresh.length ? fresh : list;
  return pool[Math.floor(r * pool.length) % pool.length];
}

export async function surprise(app: App) {
  let recent: string[] = [];
  try { recent = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { /* fine */ }
  const w = pickWonder(wonders(), recent, Math.random());
  try { localStorage.setItem(KEY, JSON.stringify([w.name, ...recent].slice(0, 80))); } catch { /* fine */ }
  // Places with a page open it; the rest arrive as themselves.
  const known = await findNamed(w.name, w.lon, w.lat, 60).catch(() => null);
  if (known) { app.actions.get("place:open")?.run(known.slug); return; }
  app.setTheme("explore");
  app.select({ lon: w.lon, lat: w.lat, height: 0 }, { title: w.name, context: w.kicker });
  void arrive(app, { name: w.name, kicker: w.kicker, lon: w.lon, lat: w.lat, radius: w.radius, fact: w.why });
}
