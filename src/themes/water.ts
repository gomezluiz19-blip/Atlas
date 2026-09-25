// Water: rivers, lakes, springs and wells nearby, where rain goes, and the
// land that drains to a point.
import type { CustomDataSource } from "cesium";
import type { App, Place, Subtab, Theme } from "../app";
import { toolSubtab } from "../app";
import { haversine } from "../data/mercator";
import { elementPoint, osmUrl, overpass, type OsmElement } from "../data/overpass";
import { layer, marker } from "../globe/draw";
import { WaterFlowTool } from "../tools/waterFlow";
import { WatershedTool } from "../tools/watershed";
import { flyToPlace } from "../ui/search";
import { formatDistance, h } from "../ui/dom";
import { icons } from "../ui/icons";
import { action, asyncBlock, bearing, compass, hero, note, section } from "./common";

type Kind = "river" | "stream" | "lake" | "reservoir" | "wetland" | "spring" | "well" | "glacier" | "dam" | "canal";

interface WaterFeature {
  el: OsmElement;
  kind: Kind;
  name: string;
  lon: number;
  lat: number;
  distance: number;
  bearing: number;
}

const KIND: Record<Kind, { label: string; plural: string; color: string }> = {
  river: { label: "River", plural: "Rivers", color: "#0a84ff" },
  stream: { label: "Stream", plural: "Streams", color: "#64d2ff" },
  canal: { label: "Canal", plural: "Canals", color: "#5ac8fa" },
  lake: { label: "Lake or pond", plural: "Lakes & ponds", color: "#007aff" },
  reservoir: { label: "Reservoir", plural: "Reservoirs", color: "#5856d6" },
  wetland: { label: "Wetland", plural: "Wetlands", color: "#30b0c7" },
  spring: { label: "Spring", plural: "Springs", color: "#34c759" },
  well: { label: "Well", plural: "Wells", color: "#a2845e" },
  glacier: { label: "Glacier", plural: "Glaciers", color: "#d1e9ff" },
  dam: { label: "Dam", plural: "Dams", color: "#8e8e93" },
};
const ORDER: Kind[] = ["river", "lake", "reservoir", "stream", "canal", "spring", "well", "wetland", "glacier", "dam"];

function kindOf(t: Record<string, string>): Kind | null {
  if (t.waterway === "river") return "river";
  if (t.waterway === "stream") return "stream";
  if (t.waterway === "canal") return "canal";
  if (t.waterway === "dam") return "dam";
  if (t.natural === "spring") return "spring";
  if (t.man_made === "water_well") return "well";
  if (t.natural === "glacier") return "glacier";
  if (t.natural === "wetland") return "wetland";
  if (t.natural === "water") return t.water === "reservoir" || t.landuse === "reservoir" ? "reservoir" : "lake";
  if (t.landuse === "reservoir") return "reservoir";
  return null;
}

const RADIUS_KM = 10;

/** Named water features around a place, nearest first. */
export async function waterNearby(place: Place): Promise<WaterFeature[]> {
  const at = `around:${RADIUS_KM * 1000},${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
  const els = await overpass(`[out:json][timeout:40];
(
  way(${at})["waterway"~"^(river|stream|canal)$"]["name"];
  nwr(${at})["natural"="water"];
  nwr(${at})["landuse"="reservoir"];
  nwr(${at})["natural"~"^(wetland|glacier)$"];
  node(${at})["natural"="spring"];
  node(${at})["man_made"="water_well"];
  nwr(${at})["waterway"="dam"];
);
out tags center 600;`);
  const seen = new Set<string>();
  const out: WaterFeature[] = [];
  for (const el of els) {
    const t = el.tags ?? {};
    const kind = kindOf(t);
    const pt = elementPoint(el);
    if (!kind || !pt) continue;
    const name = t.name ?? "";
    // Rivers come back as many segments; keep the nearest per name.
    const key = name ? `${kind}:${name}` : `${el.type}${el.id}`;
    const distance = haversine(place.lon, place.lat, pt[0], pt[1]);
    if (seen.has(key)) {
      const prev = out.find((f) => `${f.kind}:${f.name}` === key);
      if (prev && distance < prev.distance) Object.assign(prev, { el, lon: pt[0], lat: pt[1], distance, bearing: bearing(place.lon, place.lat, pt[0], pt[1]) });
      continue;
    }
    seen.add(key);
    out.push({ el, kind, name, lon: pt[0], lat: pt[1], distance, bearing: bearing(place.lon, place.lat, pt[0], pt[1]) });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

function where(f: WaterFeature): string {
  return f.distance < 150 ? "Right here" : `${formatDistance(f.distance)} ${compass(f.bearing)}`;
}

export function waterTheme(app: App): Theme {
  const flow = new WaterFlowTool();
  const shed = new WatershedTool();
  app.home("flow", "water", "rain");
  app.home("watershed", "water", "watershed");
  let ds: CustomDataSource | null = null;

  const overview: Subtab = {
    id: "overview",
    label: "Overview",
    render({ app, place, body }) {
      asyncBlock(app, body, "Looking for water nearby…", async () => {
        const all = await waterNearby(place);
        const nearest = (k: Kind[]) => all.find((f) => k.includes(f.kind) && f.name);
        const river = nearest(["river", "stream"]);
        const lake = nearest(["lake", "reservoir"]);
        const count = (k: Kind) => all.filter((f) => f.kind === k).length;
        const springs = count("spring"), wells = count("well");
        const headline = river ?? lake;
        return [
          headline
            ? hero(headline.name, `Nearest ${KIND[headline.kind].label.toLowerCase()}`, where(headline))
            : hero("No named water", `within ${RADIUS_KM} km`, "Rain here soaks in or flows away in dry channels."),
          section("Nearby",
            h("div", { class: "tiles" },
              tile(icons.drop, river?.name ?? "None named", river ? `River or stream · ${where(river)}` : `No named river within ${RADIUS_KM} km`),
              tile(icons.drop, lake?.name ?? "None named", lake ? `${KIND[lake.kind].label} · ${where(lake)}` : `No named lake within ${RADIUS_KM} km`),
              tile(icons.target, `${springs} spring${springs === 1 ? "" : "s"} · ${wells} well${wells === 1 ? "" : "s"}`, `Places where groundwater reaches the surface or is drawn up, within ${RADIUS_KM} km`))),
          section("Follow the water",
            action("See all water nearby", () => app.setSubtab("nearby"), icons.drop),
            action("Where does rain falling here go?", () => app.setSubtab("rain"), icons.flow),
            action("What land drains to here?", () => app.setSubtab("watershed"), icons.watershed)),
          note("Water features from OpenStreetMap. Springs and wells are the easiest window onto groundwater, but many are unmapped."),
        ];
      });
    },
  };

  const nearby: Subtab = {
    id: "nearby",
    label: "Nearby",
    render({ app, place, body }) {
      ds ??= layer(app.globe.viewer, "water-nearby");
      ds.show = true;
      ds.entities.removeAll();
      asyncBlock(app, body, "Finding rivers, lakes, springs and wells…", async () => {
        const all = await waterNearby(place);
        for (const f of all) marker(ds!, f.lon, f.lat, { color: KIND[f.kind].color, size: f.name ? 10 : 7 });
        const groups = ORDER.map((k) => [k, all.filter((f) => f.kind === k)] as const).filter(([, list]) => list.length);
        if (!groups.length) return [h("p", { class: "muted" }, `No mapped water within ${RADIUS_KM} km.`)];
        return [
          ...groups.map(([k, list]) =>
            section(`${KIND[k].plural} · ${list.length}`,
              h("div", { class: "list" },
                ...list.slice(0, 12).map((f) =>
                  h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: f.name, lon: f.lon, lat: f.lat, radius: 1500 }) },
                    h("span", { class: "dot", style: `background:${KIND[k].color}` }),
                    h("span", { class: "list-text" }, h("span", { class: "list-title" }, f.name || KIND[k].label), h("span", { class: "list-sub" }, where(f))),
                    h("a", { class: "list-link", href: osmUrl(f.el), target: "_blank", rel: "noopener", onclick: (e: Event) => e.stopPropagation(), title: "Open in OpenStreetMap" }, "↗"))),
                list.length > 12 ? h("p", { class: "fineprint" }, `And ${list.length - 12} more.`) : ""))),
          note(`Everything mapped within ${RADIUS_KM} km, nearest first. Tap a row to fly there.`),
        ];
      });
    },
    leave() {
      if (ds) ds.show = false;
    },
  };

  return {
    id: "water",
    label: "Water",
    icon: icons.drop,
    color: "#0a84ff",
    intro: "Rivers, lakes, springs, and where the rain goes.",
    subtabs: [
      overview,
      nearby,
      toolSubtab("rain", "Rain path", flow, "point"),
      toolSubtab("watershed", "Watershed", shed, "point"),
    ],
  };
}

function tile(icon: string, title: string, sub: string): HTMLElement {
  return h("div", { class: "tile" }, h("span", { class: "tile-icon", html: icon }), h("span", { class: "tile-text" }, h("span", { class: "tile-title" }, title), h("span", { class: "tile-sub" }, sub)));
}
