// Built: the large things people have made: transport, energy and water systems.
import type { App, Theme } from "../app";
import { toolSubtab } from "../app";
import { InfrastructureTool } from "../tools/infrastructure";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import type { Overlays } from "../globe/overlays";

export function builtTheme(app: App, overlays: Overlays): Theme {
  app.home("infra", "built", "overview");
  const lightsToggle = () =>
    h("label", { class: "switch-row" },
      h("span", {}, h("strong", {}, "Earth at night"), h("span", { class: "muted" }, "City lights seen from space (NASA). Zoom out to see where people live.")),
      h("input", {
        type: "checkbox", class: "switch", checked: overlays.isOn("lights"),
        onchange: (e: Event) => void overlays.set("lights", (e.target as HTMLInputElement).checked),
      }));
  return {
    id: "built",
    label: "Built",
    icon: icons.building,
    color: "#5e5ce6",
    intro: "Roads, railways, power, pipelines, dams and airports.",
    subtabs: [
      toolSubtab("overview", "Overview", new InfrastructureTool(undefined, "infra"), "point", lightsToggle),
      toolSubtab("transport", "Transport", new InfrastructureTool(["roads", "rail", "transport"], "infra-transport"), "point"),
      toolSubtab("energy", "Energy", new InfrastructureTool(["power", "pipelines", "telecom"], "infra-energy"), "point"),
      toolSubtab("water", "Water", new InfrastructureTool(["water"], "infra-water"), "point"),
    ],
  };
}
