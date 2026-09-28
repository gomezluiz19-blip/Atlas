// Carries out a plan, one step at a time, reporting progress. Views run in
// turn and, because the map is a shared canvas, their results pile up: the
// rain path is still drawn when the city's drains appear on top of it.
import type { App } from "../app";
import type { Plan, Step } from "./plan";

export type StepStatus = "waiting" | "running" | "done" | "failed";

export interface RunStep {
  label: string;
  status: StepStatus;
  note?: string;
}

export interface Resolver {
  /** Looks a place name up; null if nothing matches. */
  find(text: string): Promise<{ name: string; detail?: string; lon: number; lat: number; radius: number } | null>;
  /** Flies there and selects it. */
  go(p: { name: string; detail?: string; lon: number; lat: number; radius: number }): Promise<void>;
  /** The point under the middle of the view, for "here" without a chosen place. */
  centre(): { lon: number; lat: number } | null;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function describe(plan: Plan): string[] {
  const out: string[] = [];
  if (plan.place?.kind === "query") out.push(`Find ${titleCase(plan.place.text)}`);
  if (plan.place?.kind === "here") out.push("Use this place");
  for (const s of plan.steps) out.push(s.label);
  return out;
}

export async function runPlan(app: App, plan: Plan, resolver: Resolver, onUpdate: (steps: RunStep[]) => void): Promise<boolean> {
  const labels = describe(plan);
  const steps: RunStep[] = labels.map((label) => ({ label, status: "waiting" }));
  const set = (i: number, status: StepStatus, note?: string) => {
    steps[i] = { ...steps[i], status, note };
    onUpdate([...steps]);
  };
  onUpdate([...steps]);
  let i = 0;

  // 1. The place.
  if (plan.place) {
    set(i, "running");
    if (plan.place.kind === "query") {
      const found = await resolver.find(plan.place.text).catch(() => null);
      if (!found) {
        set(i, "failed", `Couldn't find "${plan.place.text}". Try adding a town or country.`);
        for (let k = i + 1; k < steps.length; k++) steps[k].status = "failed";
        onUpdate([...steps]);
        return false;
      }
      // History maps are read at the scale of countries and empires.
      const wide = plan.steps.some((s) => s.kind === "layer" && s.action.startsWith("work:borders:"));
      await resolver.go(wide ? { ...found, radius: Math.max(found.radius, 900_000) } : found);
      set(i, "done", found.detail ? `${found.name}, ${found.detail}` : found.name);
    } else {
      if (!app.place) {
        const c = resolver.centre();
        if (c) app.select({ lon: c.lon, lat: c.lat, height: 0 });
      }
      set(i, app.place ? "done" : "failed", app.place ? undefined : "Tap a place first, or name one");
    }
    i++;
  }

  // 2. Layers, commodities and views, in order.
  // Every view needs a place except the world commodity explorer.
  const needsPlace = (s: Step) => s.kind === "view" && !(s.theme === "minerals" && s.subtab === "commodities");
  for (const s of plan.steps) {
    set(i, "running");
    try {
      if (s.kind === "layer" || s.kind === "commodity") {
        const act = app.actions.get(s.kind === "layer" ? s.action : `commodity:${s.id}`);
        if (!act) throw new Error("not available");
        act.run();
      } else {
        if (!app.place && needsPlace(s)) {
          const c = resolver.centre();
          if (c) app.select({ lon: c.lon, lat: c.lat, height: 0 });
        }
        app.setTheme(s.theme, s.subtab);
        // Give each view a moment to start its work before moving on (it keeps
        // running, and its results stay on the map).
        await pause(900);
      }
      set(i, "done");
    } catch (err) {
      set(i, "failed", (err as Error).message);
    }
    i++;
  }
  return true;
}

export function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Of|The|And|In|De|La|Du)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
}
