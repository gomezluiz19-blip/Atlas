// Plants and Animals: what's been seen around a place, where it lives, and what's at risk.
import type { ImageryLayer } from "cesium";
import type { App, Theme } from "../app";
import { toolSubtab } from "../app";
import { ANIMAL_GROUPS, gbifTiles, PLANT_GROUPS } from "../data/inaturalist";
import { LifeTool, lifeState } from "../tools/life";
import { icons } from "../ui/icons";
import { tileLayer } from "./common";

function lifeTheme(opts: { id: string; label: string; icon: string; color: string; intro: string; noun: string; groups: typeof PLANT_GROUPS; gbifKey: number }): Theme {
  const state = lifeState(opts.groups, opts.color, opts.noun);
  let records: ImageryLayer | null = null;
  let declined = false;
  return {
    id: opts.id,
    label: opts.label,
    icon: opts.icon,
    color: opts.color,
    intro: opts.intro,
    subtabs: [
      toolSubtab("species", "Species", new LifeTool(`${opts.id}-species`, state, "species"), "point"),
      toolSubtab("zones", "Life zones", new LifeTool(`${opts.id}-zones`, state, "zones"), "point"),
      toolSubtab("threatened", "At risk", new LifeTool(`${opts.id}-threatened`, state, "threatened"), "point"),
    ],
    enter(app: App) {
      if (declined) return;
      records ??= tileLayer(app.globe.viewer, gbifTiles(opts.gbifKey), { maximumLevel: 14, credit: "Species records: GBIF.org", alpha: 0.75 });
      // The theme's own layer: shown here, and everywhere if pinned from the tray.
      app.canvas.put({
        id: `${opts.id}:records`, label: `${opts.label} records`, color: opts.color, theme: opts.id, scope: "world", pinned: false,
        show: (v) => { if (records) records.show = v; },
        remove: () => { declined = true; },
      });
    },
  };
}

export const plantsTheme = () =>
  lifeTheme({ id: "plants", label: "Plants", icon: icons.leaf, color: "#5b9467", intro: "Trees, flowers and fungi, and where they grow.", noun: "plants", groups: PLANT_GROUPS, gbifKey: 6 });

export const animalsTheme = () =>
  lifeTheme({ id: "animals", label: "Animals", icon: icons.paw, color: "#c4513a", intro: "Birds, mammals, reptiles and more, and which are at risk.", noun: "animals", groups: ANIMAL_GROUPS, gbifKey: 1 });

/**
 * Nature: plants and animals on one tab. It shares the Plants and Animals themes' own views (they stay
 * whole, under More), and shows where both have been recorded.
 */
export function natureTheme(plants: Theme, animals: Theme): Theme {
  const [pSpecies, pZones] = plants.subtabs, [aSpecies, , aRisk] = animals.subtabs;
  const layers: ImageryLayer[] = [];
  let declined = false;
  return {
    id: "nature",
    label: "Nature",
    icon: icons.leaf,
    color: "#3f8a57",
    intro: "The plants and animals around any place, where they live, and what's at risk.",
    subtabs: [
      { ...pSpecies, id: "plants", label: "Plants" },
      { ...aSpecies, id: "animals", label: "Animals" },
      { ...pZones, id: "zones", label: "Life zones" },
      { ...aRisk, id: "risk", label: "At risk" },
    ],
    enter(app: App) {
      if (declined) return;
      if (!layers.length) for (const key of [6, 1]) layers.push(tileLayer(app.globe.viewer, gbifTiles(key), { maximumLevel: 14, credit: "Species records: GBIF.org", alpha: 0.6 }));
      app.canvas.put({
        id: "nature:records", label: "Plant and animal records", color: "#3f8a57", theme: "nature", scope: "world", pinned: false,
        show: (v) => layers.forEach((l) => (l.show = v)),
        remove: () => { declined = true; },
      });
    },
  };
}
