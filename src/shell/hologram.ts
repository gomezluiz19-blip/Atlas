// My Place, booted: your place as a hologram, with a dock of what you do there, and the tools to trace what the
// map doesn't have (your building, your pool, your trees) over the satellite view.
import { Cartesian3, Math as CesiumMath } from "cesium";
import type { App } from "../app";
import { activeSpace, adopt, closeSpace } from "../delight/spaces";
import { stopArriving } from "../delight/arrive";
import { forecast } from "../data/openmeteo";
import type { DockItem } from "../myplaces/holo";
import { packageSummary, readPackages } from "../myplaces/packages";
import type { createMyPlaces } from "../myplaces/panel";
import type { MyPlace, PlaceStore } from "../myplaces/store";
import { localRecords, type TodayItem } from "../myplaces/today";
import { briefFor } from "../myplaces/todayUi";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { flyToPlace } from "../ui/search";
import type { createWork, WorkTool } from "../work/hub";

export interface HologramDeps {
  app: App;
  store: PlaceStore;
  placeHub: ReturnType<typeof createWork>;
  myPlaces: ReturnType<typeof createMyPlaces>;
  placeTools: WorkTool[];
  closePanels(keep?: HTMLElement): void;
  /** The saved place at (or nearest to) the chosen spot, else home, else the first one. */
  savedPlaceHere(): MyPlace | undefined;
}

export function myPlaceHologram(d: HologramDeps) {
  const { app, placeHub, myPlaces, closePanels, savedPlaceHere } = d;
  const globe = app.globe, myStore = d.store, PLACE_TOOLS = d.placeTools;
  // The live hologram (your place, or any other place or site) is kept by spaces.ts, one at a time.
  let holo: import("../myplaces/holo").Holo | null = null;
  const closeHolo = () => { closeSpace(); holo = null; };
  function dockFor(place: MyPlace, brief?: TodayItem[]): DockItem[] {
    const rec = localRecords(), pk = packageSummary(readPackages(), new Date().toISOString().slice(0, 10));
    const cams = place.devices.filter((d) => d.type === "camera").length;
    const urgent = brief?.filter((b) => b.urgency !== "fyi").length ?? 0;
    const n = (x: number) => (x ? String(x) : undefined);
    return [
      { id: "today", label: "Today", icon: icons.sun, color: "#e1b843", badge: n(urgent), alert: !!brief?.some((b) => b.urgency === "now") },
      { id: "packages", label: "Packages", icon: icons.suitcase, color: "#8b5fa8", badge: n(pk.coming), alert: pk.today > 0 || pk.problems > 0 },
      { id: "cameras", label: "Cameras", icon: icons.video, color: "#b8496a", badge: n(cams) },
      { id: "events", label: "What's on", icon: icons.music, color: "#d19a2e" },
      { id: "myplans", label: "Plans", icon: icons.flag, color: "#3563d6" },
      { id: "grow", label: "Grow", icon: icons.sprout, color: "#5b9467", badge: n(rec.fields.length) },
      { id: "flock", label: "Flock", icon: icons.paw, color: "#8faa5a", badge: n(rec.flock?.animals.length ?? 0) },
      { id: "build", label: "Build", icon: icons.crane, color: "#d19a2e", badge: n(rec.builds.length) },
      { id: "energy", label: "Energy & water", icon: icons.pylon, color: "#4c9ac9" },
    ];
  }
  function pickDock(place: MyPlace, id: string) {
    holo?.minimize();
    const ctx = placeHub.ctx;
    const inHub = (f: () => void) => { closePanels(placeHub.panel); ctx.open(); f(); };
    if (id === "today") inHub(() => ctx.home());
    else if (id === "packages") inHub(() => void import("../myplaces/packagesUi").then((m) => m.openPackages(ctx)));
    else if (id === "events") inHub(() => void import("../myplaces/eventsHere").then((m) => m.openEventsHere(ctx, place)));
    else if (id === "cameras" || id === "energy") {
      closePanels(myPlaces.panel);
      myPlaces.open(place.id);
      const want = id === "cameras" ? /Cameras/ : /Energy/;
      setTimeout(() => [...myPlaces.panel.querySelectorAll(".group-title")].find((e) => want.test(e.textContent ?? ""))?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
    } else inHub(() => PLACE_TOOLS.find((t) => t.id === id)?.open(ctx));
  }
  async function bootMyPlace(id?: string) {
    const all = myStore.all(), place = id ? all.find((x) => x.id === id) : savedPlaceHere();
    if (!place) { closeHolo(); placeHub.ctx.open(); placeHub.ctx.home(); return; }
    closeHolo();
    closePanels();
    const m = await import("../myplaces/holo");
    const h0 = m.bootPlace({
      place, places: all, dock: dockFor(place),
      onPick: (d) => pickDock(place, d),
      onSwitch: (x) => void bootMyPlace(x),
      onGlobe: () => { closeHolo(); void flyToPlace(globe, { name: place.name, lon: place.lon, lat: place.lat, radius: 600 }); },
      onClose: () => closeHolo(),
      onAdd: () => { holo?.minimize(); closePanels(placeHub.panel); placeHub.ctx.open(); placeHub.ctx.home(); app.toast("Search for the address, or tap the spot on the map, then Save.", 5000); },
      onTrace: () => void traceMyBuilding(place),
      onLand: () => void addMyLand(place),
    });
    holo = h0;
    adopt(h0);
    // What's going on there now: the weather, the light, and the day's most pressing thing.
    void forecast(place.lon, place.lat).then((f) => {
      if (holo !== h0) return;
      const c = f.current, sunset = f.daily.sunset?.[0]?.slice(11, 16), sunrise = f.daily.sunrise?.[0]?.slice(11, 16);
      const local = new Date().toLocaleTimeString(undefined, { timeZone: f.timezone, hour: "2-digit", minute: "2-digit" });
      h0.setHud([
        { k: "Local time", v: local },
        { k: "Now", v: `${Math.round(c.temperature_2m)}° · feels ${Math.round(c.apparent_temperature)}°` },
        { k: "Wind", v: `${Math.round(c.wind_speed_10m)} km/h` },
        { k: "Today", v: `${Math.round(f.daily.temperature_2m_min[0])}° to ${Math.round(f.daily.temperature_2m_max[0])}°${f.daily.precipitation_sum[0] ? `, ${f.daily.precipitation_sum[0]} mm` : ""}` },
        ...(sunrise && sunset ? [{ k: c.is_day ? "Sunset" : "Sunrise", v: c.is_day ? sunset : sunrise }] : []),
      ]);
    }).catch(() => {});
    void briefFor(place).then((b) => { if (holo !== h0) return; h0.setDock(dockFor(place, b)); const top = b[0]; if (top) h0.setHud([...h0.el.querySelectorAll(".holo-hud div")].map((d) => ({ k: d.querySelector("dt")?.textContent ?? "", v: d.querySelector("dd")?.textContent ?? "" })), `${top.icon} ${top.title}`); }).catch(() => {});
  }
  /** Keeps the camera looking straight down (no automatic tilt) while tracing. */
  let holdTilt = false;
  /** How many storeys: a row of choices over the map. */
  function askStoreys(now: number): Promise<number> {
    return new Promise((resolve) => {
      const pick = (n: number) => { bar.remove(); resolve(n); };
      const bar = h("div", { class: "draw-bar", role: "toolbar" }, h("span", { class: "draw-prompt" }, "How many storeys?"),
        ...[1, 2, 3, 4, 6, 10].map((n) => h("button", { class: n === now ? "primary-btn" : "pill-btn", onclick: () => pick(n) }, n === 10 ? "10+" : String(n))));
      document.getElementById("ui")!.append(bar);
    });
  }
  /** Looks straight down at a place, 160 m above its ground, for tracing. */
  async function lookDown(place: MyPlace) {
    closeHolo();
    closePanels();
    stopArriving();
    holdTilt = true;
    const { elevation } = await import("../data/elevation");
    const ground = await Promise.race([elevation.sample([[place.lon, place.lat]], 15).then((v) => v[0] ?? 0).catch(() => 0), new Promise<number>((r) => setTimeout(() => r(0), 2500))]);
    await new Promise<void>((done) => globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(place.lon, place.lat, Math.max(0, ground) + 200), orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 }, duration: 1.6, complete: done, cancel: done }));
  }
  /** A row of choices over the map. */
  function askChoice(prompt: string, options: string[]): Promise<number> {
    return new Promise((resolve) => {
      const bar = h("div", { class: "draw-bar", role: "toolbar" }, h("span", { class: "draw-prompt" }, prompt),
        ...options.map((o, i) => h("button", { class: i === 0 ? "primary-btn" : "pill-btn", onclick: () => { bar.remove(); resolve(i); } }, o)));
      document.getElementById("ui")!.append(bar);
    });
  }
  /** Add what the map doesn't have: your pool, your trees. */
  async function addMyLand(place: MyPlace) {
    await lookDown(place);
    const { drawOnMap } = await import("../work/draw");
    const land = { pools: [...(place.land?.pools ?? [])], trees: [...(place.land?.trees ?? [])] };
    try {
      for (;;) {
        const pick = await askChoice("Add to your place:", ["🏊 Trace the pool", "🌳 Tap trees", land.pools.length || land.trees.length ? "Clear mine" : "", "Done"].filter(Boolean));
        const label = ["🏊 Trace the pool", "🌳 Tap trees", land.pools.length || land.trees.length ? "Clear mine" : "", "Done"].filter(Boolean)[pick];
        if (label === "Done") break;
        if (label === "Clear mine") { land.pools = []; land.trees = []; continue; }
        if (label.includes("pool")) { const ring = await drawOnMap(app, "area", "#6ff7ff", "Tap each corner of the pool, then Done"); if (ring && ring.length > 2) land.pools.push(ring); }
        else { const pts = await drawOnMap(app, "points", "#5dffa8", "Tap each tree (the middle of its crown), then Done"); if (pts) land.trees.push(...pts); }
      }
    } finally { holdTilt = false; }
    myStore.save({ ...(myStore.get(place.id) ?? place), land });
    app.toast(`Saved: ${land.pools.length} pool${land.pools.length === 1 ? "" : "s"} and ${land.trees.length} tree${land.trees.length === 1 ? "" : "s"} of yours. The hologram shows them with what's mapped around.`, 5000);
    void bootMyPlace(place.id);
  }
  /** Trace your own building over the satellite view, when the map doesn't have it (or has it wrong). */
  async function traceMyBuilding(place: MyPlace) {
    // Straight down, still (no circling or tilting), from just above the ground (not sea level: the ground may be higher).
    await lookDown(place);
    const { drawOnMap } = await import("../work/draw");
    const ring = await drawOnMap(app, "area", "#ffc46b", "Tap each corner of your building, then Done").finally(() => { holdTilt = false; });
    if (!ring || ring.length < 3) { void bootMyPlace(place.id); return; }
    const storeys = await askStoreys(place.storeys ?? (place.kind === "home" ? 2 : 1));
    myStore.save({ ...(myStore.get(place.id) ?? place), footprint: ring, storeys });
    app.toast("Saved: your building as you traced it. The hologram uses it from now on.", 5000);
    void bootMyPlace(place.id);
  }
  return {
    boot: bootMyPlace,
    close: closeHolo,
    /** The hologram showing now, if it's this one (another place's may have replaced it). */
    get current() { if (activeSpace() !== holo) holo = null; return holo; },
    /** True while tracing: the camera stays looking straight down. */
    get holdTilt() { return holdTilt; },
  };
}
