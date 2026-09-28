// The Space tab: the globe from orbit (day and night where they really are),
// with the Space panel's satellites, ISS and launches, and tonight's sky over
// the chosen place.
import type { Theme } from "../app";
import { action, section } from "../themes/common";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { skyCard } from "./sky";

export function spaceTheme(space: { open(): void; close(): void; toSolar(): void }): Theme {
  const actions = () => [
    action("Satellites, the ISS and launches", () => space.open(), icons.saturn),
    action("Fly out to the solar system", () => space.toSolar(), icons.sun),
  ];
  return {
    id: "space",
    label: "Space",
    icon: icons.saturn,
    color: "#5e5ce6",
    intro: "The planet from orbit: day and night, satellites, launches and tonight's sky.",
    subtabs: [{
      id: "sky",
      label: "Sky here",
      render({ place, body }) {
        body.append(section("Tonight's sky here", skyCard(place.lon, place.lat)), section("Above the planet", ...actions()));
      },
    }],
    enter() { space.open(); },
    leave() { space.close(); },
    renderEmpty(_app, body) {
      body.append(
        h("div", { class: "empty-hint" }, h("span", { class: "empty-icon", html: icons.moon }), h("span", {}, h("strong", {}, "Day and night, as they are now"), h("span", {}, "The dark side glows with its cities. Tap anywhere to see its sky tonight."))),
        section("Above the planet", ...actions()));
    },
  };
}
