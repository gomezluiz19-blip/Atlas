// One place to log anything, in plain words: the search box and the box under
// Today's brief both use this to send a line to Flock, Grow or Build.
import { parseSiteLog } from "../work/buildLog";
import { parseLog } from "../work/flockLog";
import { parseFieldLog } from "../work/growLog";

export interface LogPlan { tool: "Flock" | "Grow" | "Build"; summary: string; saves: string; run: () => Promise<string | null> }

const read = (key: string) => { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } };

/** What a line would log, if anything (without saving it). */
export function planLog(q: string): LogPlan | null {
  const flock = read("atlas.work.flock.v1");
  const animal = flock?.animals?.length ? parseLog(q, flock) : null;
  if (animal) return { tool: "Flock", summary: animal.summary, saves: "Saves it to the animal's record, with the date",
    run: () => import("../work/flock").then((m) => m.logText(q)?.summary ?? null) };
  const fields = read("atlas.work.fields.v1");
  const field = Array.isArray(fields) && fields.length ? parseFieldLog(q, fields) : null;
  if (field) return { tool: "Grow", summary: field.summary, saves: "Adds it to the field's diary, with the date",
    run: () => import("../work/grow").then((m) => m.logFieldText(q)?.summary ?? null) };
  const builds = read("atlas.work.build.v1");
  const site = Array.isArray(builds) && builds.length ? parseSiteLog(q, builds) : null;
  if (site) return { tool: "Build", summary: site.summary, saves: site.delivery ? "Adds it to the project's deliveries" : site.phase ? "Adds it to the site log and updates progress" : "Adds it to the project's site log, with the date",
    run: () => import("../work/build").then((m) => m.logSiteText(q)?.summary ?? null) };
  return null;
}
