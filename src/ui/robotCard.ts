// The task robot's progress card: what it understood, and each step as it runs.
import type { App } from "../app";
import type { Plan } from "../robot/plan";
import { runPlan, type Resolver, type RunStep } from "../robot/run";
import { askAi, type AiDeps } from "../robot/llm";
import { h } from "./dom";
import { icons } from "./icons";

export function createRobot(app: App, resolver: Resolver, ai?: Omit<AiDeps, "resolver"> & { settings(): void }) {
  const el = h("div", { class: "robot-card", role: "status", "aria-live": "polite", hidden: true });
  let hideTimer = 0;
  let job = 0;

  const draw = (request: string, steps: RunStep[], unknown: string[], finished: boolean, answer = "", byAi = false) => {
    const failed = steps.some((s) => s.status === "failed");
    el.replaceChildren(
      h("div", { class: "robot-head" },
        h("span", { class: "robot-icon", html: icons.sparkle }),
        h("span", { class: "robot-title" }, finished ? (failed ? "Done, with a problem" : "Done") : "Working on it"),
        h("button", { class: "icon-btn robot-close", "aria-label": "Close", html: icons.close, onclick: () => (el.hidden = true) })),
      h("div", { class: "robot-request" }, `“${request}”`),
      h("ol", { class: "robot-steps" },
        ...steps.map((s) =>
          h("li", { class: `robot-step ${s.status}` },
            h("span", { class: "robot-mark", "aria-hidden": "true" }, s.status === "done" ? "✓" : s.status === "failed" ? "!" : s.status === "running" ? "" : ""),
            h("span", { class: "robot-text" }, s.label, s.note ? h("span", { class: "robot-note" }, s.note) : "")))),
      answer ? h("p", { class: "robot-answer" }, answer) : "",
      unknown.length ? h("div", { class: "robot-unknown" }, `Didn't understand: ${unknown.join(", ")}`) : "",
      finished && !failed ? h("div", { class: "robot-foot" }, byAi ? "Answered by Claude. Everything it added is under On the map." : "Everything it added is listed under On the map.",
        !byAi && ai ? h("button", { class: "link-btn", onclick: () => ai.settings() }, " Connect Claude for any question") : "") : "",
    );
  };

  return {
    el,
    /** Sends a request to Claude; falls back to the rule-based plan if it can't be reached. */
    async ask(request: string, fallback: Plan | null) {
      if (!ai) return fallback ? this.run(request, fallback) : undefined;
      const my = ++job;
      clearTimeout(hideTimer);
      el.hidden = false;
      let last: RunStep[] = [];
      try {
        const answer = await askAi(app, { ...ai, resolver }, request, (steps) => {
          if (my !== job) return;
          last = steps;
          draw(request, steps, [], false, "", true);
        });
        if (my !== job) return;
        draw(request, last, [], true, answer, true);
        hideTimer = window.setTimeout(() => (el.hidden = true), 20000);
      } catch (e) {
        if (my !== job) return;
        app.toast(`Atlas AI: ${(e as Error).message}${fallback ? " Using the built-in planner." : ""}`, 6000);
        if (fallback) await this.run(request, fallback);
        else draw(request, [{ label: "Ask Claude", status: "failed", note: (e as Error).message }], [], true);
      }
    },
    async run(request: string, plan: Plan) {
      const my = ++job;
      clearTimeout(hideTimer);
      el.hidden = false;
      let last: RunStep[] = [];
      await runPlan(app, plan, resolver, (steps) => {
        if (my !== job) return;
        last = steps;
        draw(request, steps, plan.unknown, false);
      });
      if (my !== job) return;
      draw(request, last, plan.unknown, true);
      if (!last.some((s) => s.status === "failed")) hideTimer = window.setTimeout(() => (el.hidden = true), 9000);
    },
  };
}
