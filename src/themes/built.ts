// Built: the large things people have made: transport, energy and water systems.
import type { ImageryLayer } from "cesium";
import type { App, Theme } from "../app";
import { toolSubtab } from "../app";
import { InfrastructureTool } from "../tools/infrastructure";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { tileLayer } from "./common";

const NIGHT_LIGHTS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png";

export function builtTheme(app: App): Theme {
  app.home("infra", "built", "overview");
  let lights: ImageryLayer | null = null;
  let lightsOn = false;
  const lightsToggle = () =>
    h("label", { class: "switch-row" },
      h("span", {}, h("strong", {}, "Earth at night"), h("span", { class: "muted" }, "City lights seen from space (NASA). Zoom out to see where people live.")),
      h("input", {
        type: "checkbox", class: "switch", checked: lightsOn,
        onchange: (e: Event) => {
          lightsOn = (e.target as HTMLInputElement).checked;
          lights ??= tileLayer(app.globe.viewer, NIGHT_LIGHTS, { maximumLevel: 8, credit: "Earth at night: NASA Black Marble", alpha: 0.9 });
          lights.show = lightsOn;
        },
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
    leave() {
      if (lights) lights.show = false;
    },
    enter() {
      if (lights) lights.show = lightsOn;
    },
  };
}
