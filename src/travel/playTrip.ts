// A trip, played: the route drawn on the globe, then the camera flies it leg
// by leg (the plane or car travelling each one), resting at each stay, with a
// caption for every step. On a TV the captions are the big titles; elsewhere
// they're toasts.
import type { App } from "../app";
import { fmtHours } from "../work/geo";
import { journeyFeatures, playJourney, stopPlaying } from "../work/journey";
import { MODES, timeline, type Journey } from "../work/journeyModel";
import { WorkLayer } from "../work/layer";

let layer: WorkLayer | null = null;

/** Says something about the trip, big on a TV (TV mode listens for it), else as a toast. */
export function caption(app: App, title: string, sub = "") {
  const heard = !window.dispatchEvent(new CustomEvent("atlas:caption", { detail: { title, sub }, cancelable: true }));
  if (!heard) app.toast(sub ? `${title}: ${sub}` : title, 4000);
}

/** The caption for a step of the trip (pure). */
export function stepCaption(j: Journey, i: number): { title: string; sub: string } {
  const t = timeline(j);
  if (i === -1) return { title: `Leaving ${j.origin?.name ?? "home"}`, sub: j.name };
  if (i === -2) return { title: j.name, sub: `${Math.round(t.km).toLocaleString()} km · ${t.nights} night${t.nights === 1 ? "" : "s"} · the whole trip` };
  const r = t.rows[i];
  if (r.step.kind === "move") { const m = MODES[r.step.mode], row = r as { km: number; hours: number }; return { title: `${m.emoji} ${m.verb} to ${r.step.to.name}`, sub: `${Math.round(row.km).toLocaleString()} km · about ${fmtHours(row.hours)}` }; }
  const n = r.step.nights ?? 0;
  return { title: r.step.place.name, sub: n ? `${n} night${n === 1 ? "" : "s"}${r.step.visits.length ? ` · ${r.step.visits.map((v) => v.name).join(", ")}` : ""}` : "A stop on the way" };
}

/** Draws the trip and flies it, captioning each step. */
export async function playTrip(app: App, j: Journey) {
  stopPlaying();
  layer ??= new WorkLayer(app, "trip-play", "Trip", "#3563d6");
  layer.set(journeyFeatures(j), j.name);
  await playJourney(app, j, (i) => { const c = stepCaption(j, i); caption(app, c.title, c.sub); });
}

/** Stops a playing trip and takes its line off the globe. */
export function clearTrip() {
  stopPlaying();
  layer?.set([]);
}
