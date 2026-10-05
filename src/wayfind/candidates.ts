// Where you might be going, from what Terreno knows about you on this device: home and your saved places,
// what you searched for lately, and anything you've planned for today or the next few days.
import { gatherAll } from "../plans/gather";
import type { Candidate } from "./model";

const read = <T>(k: string): T[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

/** Plans dated from yesterday to `days` ahead, as candidates (pure given `today`). */
export function soonPlans(plans: { id: string; title: string; date: string; lon: number; lat: number }[], today: string, days = 3): Candidate[] {
  const t0 = Date.parse(today);
  return plans.filter((p) => { const d = (Date.parse(p.date) - t0) / 864e5; return d >= -1 && d <= days; })
    .map((p) => ({ id: `plan:${p.id}`, name: p.title, lon: p.lon, lat: p.lat, why: "plan" as const, weight: 2.5 }));
}

export function myCandidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const p of read<{ id: string; name: string; kind: string; lon: number; lat: number }>("atlas.myplaces.v1"))
    if (Number.isFinite(p.lon) && Number.isFinite(p.lat)) out.push({ id: `my:${p.id}`, name: p.name, lon: p.lon, lat: p.lat, why: p.kind === "home" ? "home" : "saved", weight: p.kind === "home" ? 3 : 2 });
  for (const r of read<{ name: string; lon: number; lat: number }>("atlas.recent-searches").slice(0, 6))
    if (Number.isFinite(r.lon) && Number.isFinite(r.lat)) out.push({ id: `recent:${r.name}`, name: r.name, lon: r.lon, lat: r.lat, why: "recent", weight: 1.5 });
  try { out.push(...soonPlans(gatherAll(), new Date().toISOString().slice(0, 10))); } catch { /* plans unreadable */ }
  return out;
}
