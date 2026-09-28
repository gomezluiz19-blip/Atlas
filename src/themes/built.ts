// Built: the large things people have made. The world view shows the networks
// that tie places together (rail, highways, shipping lanes, ports, airports,
// power plants, undersea cables); a chosen place shows its connections, the
// power around it, its link to the internet, and everything mapped nearby.
import type { App, Place, Subtab, Theme } from "../app";
import { toolSubtab } from "../app";
import { SITES, type Site } from "../content/sites";
import {
  airports, cableDetail, fuelMix, fuelOf, formatMw, FUELS, landingDetail, landingPoints, nearby, nearestLine, ports, powerCountries,
  powerPlants, railways, roads, shippingLanes, type PowerPlant,
} from "../data/infra";
import type { Overlays } from "../globe/overlays";
import { NETWORKS, Networks, type NetworkId } from "../globe/networks";
import { InfrastructureTool } from "../tools/infrastructure";
import { formatDistance, h } from "../ui/dom";
import { icons } from "../ui/icons";
import { layerList, stackedBar } from "../ui/layerList";
import { flyToPlace } from "../ui/search";
import { siteBrowser } from "../ui/sites";
import { asyncBlock, hero, note, section, stats } from "./common";

const dist = (km: number) => formatDistance(km * 1000);

/** How far from a tap a dot on the map still counts as "tapped", from the camera height. */
function tapKm(app: App): number {
  return Math.max(0.2, Math.min(25, (app.globe.cameraHeight() / 1000) * 0.006));
}

const plantRow = (app: App, p: PowerPlant & { km?: number }) =>
  h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: 2500 }) },
    h("span", { class: "dot big", style: `background:${fuelOf(p.fuel).color}` }),
    h("span", { class: "list-text" },
      h("span", { class: "list-title" }, p.name),
      h("span", { class: "list-sub" }, [fuelOf(p.fuel).label, formatMw(p.mw), p.year ? `since ${p.year}` : "", p.km !== undefined ? dist(p.km) : ""].filter(Boolean).join(" · "))),
    h("span", { class: "chev", html: "&rsaquo;" }));

const mixBar = (plants: PowerPlant[]) =>
  stackedBar(fuelMix(plants).map((m) => ({ label: m.fuel.label, value: m.mw, color: m.fuel.color })), formatMw);

/** A card for a map dot the user tapped (power plant, port or airport). */
async function tappedCard(app: App, place: Place, on: (id: NetworkId) => boolean): Promise<HTMLElement | null> {
  const r = tapKm(app);
  const [plant] = on("power") ? nearby(await powerPlants(), place.lon, place.lat, r, 1) : [];
  if (plant) {
    const [all, names] = await Promise.all([powerPlants(), powerCountries()]);
    const national = all.filter((p) => p.country === plant.country);
    const total = national.reduce((s, p) => s + p.mw, 0);
    const rank = national.findIndex((p) => p.name === plant.name) + 1;
    return h("div", { class: "feature-card" },
      h("div", { class: "feature-kicker" }, h("span", { class: "dot", style: `background:${fuelOf(plant.fuel).color}` }), `${fuelOf(plant.fuel).label} power plant`),
      h("div", { class: "feature-title" }, plant.name),
      stats(
        ["Capacity", formatMw(plant.mw)],
        plant.year ? ["In service since", String(plant.year)] : null,
        ["Country", names[plant.country] ?? plant.country],
        total ? ["Share of national capacity", `${((plant.mw / total) * 100).toFixed(plant.mw / total < 0.01 ? 2 : 1)}%`, "Of the plants in the database"] : null,
        rank ? ["Rank in the country", `#${rank} of ${national.length}`] : null,
      ));
  }
  const [port] = on("ports") ? nearby(await ports(), place.lon, place.lat, r, 1) : [];
  if (port) return h("div", { class: "feature-card" }, h("div", { class: "feature-kicker" }, "Seaport"), h("div", { class: "feature-title" }, port.name));
  const [ap] = on("airports") ? nearby(await airports(), place.lon, place.lat, r, 1) : [];
  if (ap) return h("div", { class: "feature-card" }, h("div", { class: "feature-kicker" }, `${/major/.test(ap.type) ? "Major" : "Regional"} airport`), h("div", { class: "feature-title" }, ap.name, ap.iata ? h("span", { class: "pill" }, ap.iata) : ""));
  return null;
}

/** Nearest hubs and lines: the place's links to the rest of the world. */
async function connections(place: Place): Promise<HTMLElement> {
  const { lon, lat } = place;
  const [aps, pts, rail, rds, lanes] = await Promise.all([airports(), ports(), railways(), roads(), shippingLanes()]);
  const ap = nearby(aps, lon, lat, 1500, 1)[0];
  const majorAp = nearby(aps.filter((a) => /major/.test(a.type)), lon, lat, 3000, 1)[0];
  const port = nearby(pts, lon, lat, 2000, 1)[0];
  const rl = nearestLine(rail, lon, lat, 400);
  const hw = nearestLine(rds, lon, lat, 400, (l) => l.attrs[0] === "M");
  const lane = nearestLine(lanes, lon, lat, 800, (l) => l.attrs[0] === 1);
  return section("Connections",
    stats(
      ap ? ["Nearest airport", `${ap.name}${ap.iata ? ` (${ap.iata})` : ""} · ${dist(ap.km)}`] : ["Nearest airport", "Over 1,500 km away"],
      majorAp && majorAp.name !== ap?.name ? ["Nearest major airport", `${majorAp.name} · ${dist(majorAp.km)}`] : null,
      port ? ["Nearest seaport", `${port.name} · ${dist(port.km)}`] : ["Nearest seaport", "Over 2,000 km away"],
      ["Nearest main railway", rl ? (rl.km < 1 ? "Right here" : dist(rl.km)) : "None within 400 km", "Main lines only (Natural Earth); zoom in with Railways on for every track"],
      ["Nearest major highway", hw ? (hw.km < 1 ? "Right here" : dist(hw.km)) : "None within 400 km"],
      lane ? ["Nearest major shipping lane", lane.km < 5 ? "Right here" : dist(lane.km)] : null,
    ));
}

async function powerAround(app: App, place: Place, radiusKm: number, list = 8): Promise<(Node | string)[]> {
  const all = await powerPlants();
  const near = nearby(all, place.lon, place.lat, radiusKm);
  if (!near.length) return [section("Power plants", h("p", { class: "muted" }, `No power plants of note within ${radiusKm} km.`))];
  const total = near.reduce((s, p) => s + p.mw, 0);
  const low = near.filter((p) => fuelOf(p.fuel).low).reduce((s, p) => s + p.mw, 0);
  return [
    hero(formatMw(total), `of generating capacity within ${radiusKm} km`, `${near.length} plant${near.length === 1 ? "" : "s"} · ${Math.round((low / total) * 100)}% low-carbon (nuclear, hydro, wind, solar, geothermal, biomass)`),
    section("Power mix", mixBar(near)),
    section(`Nearest plants`, h("div", { class: "list" }, ...near.slice(0, list).map((p) => plantRow(app, p)))),
  ];
}

async function nationalPower(place: Place): Promise<(Node | string)[]> {
  const [all, names] = await Promise.all([powerPlants(), powerCountries()]);
  const [closest] = nearby(all, place.lon, place.lat, 300, 1);
  if (!closest) return [];
  const national = all.filter((p) => p.country === closest.country);
  const total = national.reduce((s, p) => s + p.mw, 0);
  return [section(`${names[closest.country] ?? closest.country}: installed capacity`,
    h("p", { class: "muted small" }, `${formatMw(total)} across ${national.length.toLocaleString()} plants`),
    mixBar(national))];
}

async function internetAround(place: Place): Promise<(Node | string)[]> {
  const lps = await landingPoints();
  const near = nearby(lps, place.lon, place.lat, 3000, 3);
  if (!near.length) return [section("Internet", h("p", { class: "muted" }, "No undersea cable lands within 3,000 km."))];
  const first = near[0];
  const detail = await landingDetail(first.id).catch(() => null);
  const cablesHere = detail?.cables ?? [];
  const cableRows = await Promise.all(cablesHere.slice(0, 12).map(async (c) => {
    const d = await cableDetail(c.id).catch(() => null);
    return h("div", { class: "list-row static" },
      h("span", { class: "list-text" },
        h("span", { class: "list-title" }, c.name),
        h("span", { class: "list-sub" }, [d?.length, d?.rfs ? `ready ${d.rfs}` : "", d?.landing_points ? `${d.landing_points.length} landings` : ""].filter(Boolean).join(" · "))));
  }));
  return [
    hero(dist(first.km), `to the nearest undersea cable landing`, `${first.name}${cablesHere.length ? ` · ${cablesHere.length} cable${cablesHere.length === 1 ? "" : "s"} land here` : ""}`),
    cableRows.length ? section(`Cables landing at ${first.name.split(",")[0]}`, h("div", { class: "list" }, ...cableRows)) : "",
    near.length > 1 ? section("Other landing points nearby", stats(...near.slice(1).map((l) => [l.name, dist(l.km)] as [string, string]))) : "",
    note("About 99% of intercontinental internet traffic travels through undersea cables. Data: TeleGeography Submarine Cable Map."),
  ];
}

export function builtTheme(app: App, overlays: Overlays, openSite: (s: Site) => void): Theme {
  app.home("infra", "built", "overview");
  const networks = new Networks(app.globe.viewer, (m) => app.toast(m, 5000), app.canvas);
  const SUGGESTED: NetworkId[] = ["rail", "shipping", "ports", "power"];
  for (const n of NETWORKS) {
    app.actions.set(`net:${n.id}`, { label: n.label, run: () => networks.set(n.id, true), isOn: () => networks.isOn(n.id), stop: () => networks.set(n.id, false) });
  }
  const netApi = {
    isOn: (id: string) => (id === "lights" ? overlays.isOn("lights") : networks.isOn(id as NetworkId)),
    isLoading: (id: string) => id !== "lights" && networks.isLoading(id as NetworkId),
    set: (id: string, on: boolean) => void (id === "lights" ? overlays.set("lights", on) : networks.set(id as NetworkId, on)),
    subscribe: (fn: () => void) => {
      const a = networks.subscribe(fn), b = overlays.subscribe(fn);
      return () => { a(); b(); };
    },
  };
  const layerItems = [...NETWORKS, { id: "lights", label: "Earth at night", about: "City lights from space (NASA): where people and power are", color: "#ffcc66", source: "NASA Black Marble" }];

  const fuelLegend = () => h("div", { class: "stack-legend" }, ...FUELS.map((f) => h("span", { class: "stack-key" }, h("span", { class: "dot", style: `background:${f.color}` }), f.label)));

  const renderEmpty = (app: App, body: HTMLElement) => {
    body.append(
      h("div", { class: "empty-hint compact" }, h("span", { class: "empty-icon", html: icons.target }),
        h("span", {}, h("strong", {}, "Tap anywhere, or any dot"), h("span", {}, "to see how a place connects to the world: transport, power and the internet."))),
      section("World networks", layerList(layerItems, netApi), h("div", { class: "legend-box" }, h("div", { class: "legend-head" }, "Power plants by fuel"), fuelLegend())),
    );
    asyncBlock(app, body, "Tallying the world's power plants…", async () => {
      const all = await powerPlants();
      const total = all.reduce((s, p) => s + p.mw, 0);
      return [
        section("The world's power plants",
          h("p", { class: "muted small" }, `${formatMw(total)} of capacity in ${all.length.toLocaleString()} plants`),
          mixBar(all),
          h("h3", { class: "sub-title" }, "The largest"),
          h("div", { class: "list" }, ...all.slice(0, 8).map((p) => plantRow(app, p)))),
      ];
    });
    body.append(
      siteBrowser(SITES.built, openSite, { color: "#5e5ce6" }),
      note("Railways, highways, ports and airports: Natural Earth. Shipping lanes: Benden (2022). Power plants: WRI Global Power Plant Database (2021). Undersea cables: TeleGeography. Detail near you: OpenStreetMap."),
    );
  };

  const infraAll = hosted(new InfrastructureTool(undefined, "infra"));
  const infraTransport = hosted(new InfrastructureTool(["roads", "rail", "transport"], "infra-transport"));
  const infraEnergy = hosted(new InfrastructureTool(["power", "pipelines"], "infra-energy"));
  const infraTelecom = hosted(new InfrastructureTool(["telecom"], "infra-telecom"));

  const overview: Subtab = {
    id: "overview",
    label: "Overview",
    render({ app, place, body }) {
      asyncBlock(app, body, "Finding connections…", async () => {
        const [tapped, conn] = await Promise.all([tappedCard(app, place, (id) => networks.isOn(id)).catch(() => null), connections(place)]);
        const power = await powerAround(app, place, 50, 4);
        return [tapped ?? "", conn, ...power.slice(0, 2)];
      });
      body.append(section("Mapped around here", infraAll.el(app, body, place)));
    },
    leave: (app) => app.releaseTool(infraAll.tool),
  };

  const transport: Subtab = {
    id: "transport",
    label: "Transport",
    render({ app, place, body }) {
      asyncBlock(app, body, "Finding airports, ports and lines…", async () => {
        const [aps, pts] = await Promise.all([airports(), ports()]);
        const nearAps = nearby(aps, place.lon, place.lat, 600, 5);
        const nearPorts = nearby(pts, place.lon, place.lat, 600, 5);
        const row = (name: string, sub: string, lon: number, lat: number) =>
          h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name, lon, lat, radius: 4000 }) },
            h("span", { class: "list-text" }, h("span", { class: "list-title" }, name), h("span", { class: "list-sub" }, sub)), h("span", { class: "chev", html: "&rsaquo;" }));
        return [
          await connections(place),
          nearAps.length ? section("Airports within 600 km", h("div", { class: "list" }, ...nearAps.map((a) => row(a.name, [a.iata, /major/.test(a.type) ? "major" : "regional", dist(a.km)].filter(Boolean).join(" · "), a.lon, a.lat)))) : "",
          nearPorts.length ? section("Seaports within 600 km", h("div", { class: "list" }, ...nearPorts.map((p) => row(p.name, dist(p.km), p.lon, p.lat)))) : "",
        ];
      });
      body.append(section("Roads, rail and stations nearby", infraTransport.el(app, body, place)));
    },
    leave: (app) => app.releaseTool(infraTransport.tool),
  };

  const energy: Subtab = {
    id: "energy",
    label: "Energy",
    render({ app, place, body }) {
      asyncBlock(app, body, "Finding power plants…", async () => [...(await powerAround(app, place, 150)), ...(await nationalPower(place))]);
      body.append(section("Power lines, substations and pipelines nearby", infraEnergy.el(app, body, place)));
    },
    leave: (app) => app.releaseTool(infraEnergy.tool),
  };

  const internet: Subtab = {
    id: "internet",
    label: "Internet",
    render({ app, place, body }) {
      asyncBlock(app, body, "Finding undersea cables…", async () => {
        if (!networks.isOn("cables")) networks.set("cables", true, "built");
        return internetAround(place);
      });
      body.append(section("Masts and towers nearby", infraTelecom.el(app, body, place)));
    },
    leave: (app) => app.releaseTool(infraTelecom.tool),
  };

  return {
    id: "built",
    label: "Built",
    icon: icons.building,
    color: "#5e5ce6",
    intro: "Rail, roads, shipping, power and the internet.",
    subtabs: [overview, transport, energy, internet, toolSubtab("water", "Water", new InfrastructureTool(["water"], "infra-water"), "point")],
    enter: () => networks.suggest(SUGGESTED, "built"),
    renderEmpty,
  };
}

/** Hosts an OpenStreetMap infrastructure tool in its own box inside a subtab. */
function hosted(tool: InfrastructureTool) {
  return {
    tool,
    el(app: App, _body: HTMLElement, place: Place) {
      const host = h("div", { class: "hosted-tool" });
      queueMicrotask(() => app.hostTool(tool, host, place, "point"));
      return host;
    },
  };
}
