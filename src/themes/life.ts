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
      records ??= tileLayer(app.globe.viewer, gbifTiles(opts.gbifKey), { maximumLevel: 14, credit: "Species records: GBIF.org", alpha: 0.75 });
      records.show = true;
    },
    leave() {
      if (records) records.show = false;
    },
  };
}

export const plantsTheme = () =>
  lifeTheme({ id: "plants", label: "Plants", icon: icons.leaf, color: "#34c759", intro: "Trees, flowers and fungi, and where they grow.", noun: "plants", groups: PLANT_GROUPS, gbifKey: 6 });

export const animalsTheme = () =>
  lifeTheme({ id: "animals", label: "Animals", icon: icons.paw, color: "#ff6b3d", intro: "Birds, mammals, reptiles and more, and which are at risk.", noun: "animals", groups: ANIMAL_GROUPS, gbifKey: 1 });
