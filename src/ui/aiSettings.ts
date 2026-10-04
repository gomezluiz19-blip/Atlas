// Terreno AI settings: connect the task robot to Claude with your own key or a proxy.
import { MODELS, loadAi, saveAi, testAi, type AiConfig, type AiMode } from "../robot/llm";
import { h } from "./dom";
import { icons } from "./icons";

export function createAiSettings() {
  const panel = h("div", { class: "popover ai-panel", hidden: true, role: "dialog", "aria-label": "Terreno AI" });
  const render = () => {
    const c: AiConfig = loadAi();
    const status = h("p", { class: "muted small" });
    const key = h("input", { type: "password", class: "pro-url", value: c.key ?? "", placeholder: "sk-ant-…", autocomplete: "off", "aria-label": "Anthropic API key" }) as HTMLInputElement;
    const proxy = h("input", { type: "url", class: "pro-url", value: c.proxy ?? "", placeholder: "https://atlas-ai.you.workers.dev", "aria-label": "Proxy URL" }) as HTMLInputElement;
    const model = h("select", { "aria-label": "Model" }, ...MODELS.map((m) => h("option", { value: m.id, selected: m.id === c.model }, m.label))) as HTMLSelectElement;
    let mode: AiMode = c.mode;
    const modes: [AiMode, string, string][] = [
      ["off", "Off", "The built-in planner handles requests (no AI, works offline)."],
      ["key", "My Anthropic API key", "Stored only in this browser and sent only to Anthropic. Not for shared computers."],
      ["proxy", "A proxy URL", "A small server that holds the key, so nobody needs their own (docs/ai-proxy.md)."],
    ];
    const current = (): AiConfig => ({ mode, key: key.value.trim() || undefined, proxy: proxy.value.trim() || undefined, model: model.value });
    const body = h("div", { class: "ai-fields" });
    const fields = () => body.replaceChildren(
      mode === "key" ? key : mode === "proxy" ? proxy : "",
      mode !== "off" ? h("label", { class: "mp-field" }, h("span", {}, "Model"), model) : "");
    panel.replaceChildren(
      h("div", { class: "mp-head" }, h("h2", {}, "Terreno AI"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => (panel.hidden = true) })),
      h("p", { class: "mp-intro" }, "Connect the search box's task robot to Claude. It understands any request or question, acts on the globe (places, layers, views, history, tools) and answers in a sentence or two."),
      h("div", { class: "ai-modes" }, ...modes.map(([m, label, about]) =>
        h("label", { class: "ai-mode" }, h("input", { type: "radio", name: "ai-mode", checked: mode === m, onchange: () => { mode = m; fields(); } }), h("span", {}, h("strong", {}, label), h("span", { class: "muted small" }, about))))),
      body,
      h("div", { class: "pro-actions" },
        h("button", { class: "primary-btn", onclick: () => { saveAi(current()); status.textContent = "Saved."; } }, "Save"),
        h("button", { class: "pill-btn", onclick: async () => {
          const cfg = current();
          if (cfg.mode === "off") { status.textContent = "Choose a key or a proxy first."; return; }
          status.textContent = "Testing…";
          try { status.textContent = `✓ ${await testAi(cfg)}`; saveAi(cfg); } catch (e) { status.textContent = `✗ ${(e as Error).message}`; }
        } }, "Test")),
      status,
      h("p", { class: "muted small" }, "Try: “What's the tallest mountain in Africa?”, “Show me the Roman Empire at its height”, “Where could I watch a rocket launch this week?”"));
    fields();
  };
  return {
    panel,
    open() { render(); panel.hidden = false; },
    close() { panel.hidden = true; },
  };
}
