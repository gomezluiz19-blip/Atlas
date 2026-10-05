// Crowd flow (Events): how a crowd leaves a venue. The stations within a walk
// come from OpenStreetMap; the crowd going by transit splits between them by
// how much each carries and how far it is, streams of people flow out along
// arcs, and each station's queue rises and falls in 3D as the minutes after
// the final whistle play out. What-ifs: close a station, a bigger crowd, more
// people on transit, extra trains.
import { CallbackProperty, Cartesian2, Cartesian3, Color, CustomDataSource, LabelStyle, VerticalOrigin } from "cesium";
import type { App } from "../app";
import { overpass } from "../data/overpass";
import { FlowOverlay } from "../globe/flow";
import { wake } from "../globe/motion";
import { introsTagged } from "../intros/places";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import type { WorkCtx } from "../work/hub";
import { arc } from "../work/journey";
import { clearance, disperse, kindOf, type Station } from "./crowdModel";

interface Venue { name: string; lon: number; lat: number; capacity: number }
const VENUES: Venue[] = introsTagged("stadium", "arena").map((p) => ({ name: p.name, lon: p.lon, lat: p.lat, capacity: p.tags?.includes("arena") ? 19_000 : 60_000 })).sort((a, b) => a.name.localeCompare(b.name));
const KIND_COLOR = { rail: "#3563d6", subway: "#d19a2e", tram: "#5b9467", bus: "#8b5fa8" } as const;
const km = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.hypot((a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 110.57);

let ds: CustomDataSource | null = null, flow: FlowOverlay | null = null;

async function stationsNear(v: { lon: number; lat: number }): Promise<Station[]> {
  const q = `[out:json][timeout:25];(node[railway~"^(station|halt|tram_stop)$"](around:1800,${v.lat},${v.lon});node[public_transport=station](around:1800,${v.lat},${v.lon});node[highway=bus_stop](around:600,${v.lat},${v.lon}););out tags 120;`;
  const els = await overpass(q);
  const out: Station[] = [];
  for (const e of els) {
    const tags = (e.tags ?? {}) as Record<string, string>, kind = kindOf(tags);
    if (!kind || e.lon == null || e.lat == null) continue;
    const name = tags.name ?? (kind === "bus" ? "Bus stop" : "Station");
    const s = { id: String(e.id), name, kind, lon: e.lon, lat: e.lat, km: Math.round(km(v, { lon: e.lon, lat: e.lat }) * 100) / 100 };
    // One per name and kind (a station's many nodes), and only the nearest few bus stops.
    if (out.some((o) => o.name === s.name && o.kind === s.kind)) continue;
    out.push(s);
  }
  const bus = out.filter((s) => s.kind === "bus").sort((a, b) => a.km - b.km).slice(0, 4);
  return [...out.filter((s) => s.kind !== "bus"), ...bus].sort((a, b) => a.km - b.km).slice(0, 10);
}

export function openCrowd(ctx: WorkCtx, app: App) {
  const viewer = app.globe.viewer;
  ds ??= new CustomDataSource("crowd");
  if (!viewer.dataSources.contains(ds)) void viewer.dataSources.add(ds);
  flow ??= new FlowOverlay(viewer, { maxHeight: 30_000, maxDrops: 3000, fade: 0.12 });
  const cv = viewer.canvas, mid = app.globe.pick(new Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2));
  let venue: Venue = VENUES.find((v) => v.name === "Madison Square Garden") ?? VENUES[0];
  let crowd = venue.capacity, share = 0.6, boost = 1, minute = 0, stations: Station[] = [], timer = 0;
  const EGRESS = 18; // minutes for the venue to empty

  const sel = h("select", { class: "pro-url", "aria-label": "Venue" }, ...VENUES.map((v) => h("option", { value: v.name, selected: v.name === venue.name }, v.name)), mid ? h("option", { value: "__mid" }, "The middle of the map") : "") as HTMLSelectElement;
  const head = h("div", { class: "md-head" });
  const list = h("div", { class: "cr-list" });
  const clock = h("input", { type: "range", min: 0, max: 90, step: 1, value: 0, "aria-label": "Minutes after the end" }) as HTMLInputElement;
  const clockOut = h("output", {}, "0 min");
  const play = h("button", { class: "primary-btn md-play" }, "▶ Play the exit") as HTMLButtonElement;
  const status = h("p", { class: "muted small" }, "Finding stations…");

  const queueAt = (people: number, perMin: number, walk: number, t: number) => {
    const arrived = people * Math.max(0, Math.min(1, (t - walk) / EGRESS));
    return Math.max(0, arrived - perMin * Math.max(0, t - walk));
  };

  function draw() {
    const splits = disperse(crowd, share, stations, boost), { minutes, worst } = clearance(splits);
    ds!.entities.removeAll();
    ds!.entities.add({ position: Cartesian3.fromDegrees(venue.lon, venue.lat, 40), point: { pixelSize: 18, color: Color.fromCssColorString("#b8496a"), outlineColor: Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: venue.name, font: "800 14px -apple-system, system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 4, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -14), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    const maxQ = Math.max(1, ...splits.map((s) => s.people));
    for (const sp of splits) {
      const col = Color.fromCssColorString(KIND_COLOR[sp.s.kind]);
      const height = () => 20 + (queueAt(sp.people, sp.perMin, sp.walk, minute) / maxQ) * 600;
      ds!.entities.add({
        position: new CallbackProperty(() => Cartesian3.fromDegrees(sp.s.lon, sp.s.lat, height() / 2), false) as unknown as Cartesian3,
        cylinder: { length: new CallbackProperty(height, false), topRadius: 28, bottomRadius: 34, material: col.withAlpha(0.85), outline: false },
        label: { text: new CallbackProperty(() => { const q = Math.round(queueAt(sp.people, sp.perMin, sp.walk, minute)); return `${sp.s.name}${q ? ` · ${q.toLocaleString()} waiting` : ""}`; }, false) as unknown as string,
          font: "700 12px -apple-system, system-ui, sans-serif", style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 4, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -10), disableDepthTestDistance: Number.POSITIVE_INFINITY,
          eyeOffset: new CallbackProperty(() => new Cartesian3(0, 0, -height()), false) as unknown as Cartesian3 },
      });
    }
    // Streams of people: busier for the stations taking more of the crowd.
    flow!.set(splits.filter((s) => s.people > 0).map((s) => {
      const pts = arc([venue.lon, venue.lat], [s.s.lon, s.s.lat], 24).flat() as [number, number][];
      return { pts, color: KIND_COLOR[s.s.kind], speed: 60, density: 0.02 + (s.people / maxQ) * 0.25, size: 1.4 + (s.people / maxQ) * 2.4 };
    }));
    flow!.show(true);
    app.canvas.put({ id: "view:crowd", label: `🚇 Crowd flow · ${venue.name}`, color: "#b8496a", scope: "world", pinned: true, show: (v) => { ds!.show = v; flow!.show(v); }, remove: () => { ds?.entities.removeAll(); flow?.set([]); } }, true);
    wake(1000);
    const driving = Math.round(crowd * (1 - share));
    head.replaceChildren(
      h("div", { class: "md-stat" }, h("small", {}, "On transit"), h("strong", {}, Math.round(crowd * share).toLocaleString()), h("span", {}, `${driving.toLocaleString()} walk or drive`)),
      h("div", { class: "md-stat" }, h("small", {}, "Clear in"), h("strong", {}, `${minutes} min`), h("span", {}, worst ? `last at ${worst.s.name}` : "")),
      h("div", { class: "md-stat" }, h("small", {}, "Stations"), h("strong", {}, String(splits.length)), h("span", {}, `${stations.filter((s) => s.closed).length} closed`)));
    list.replaceChildren(...stations.map((s) => {
      const sp = splits.find((x) => x.s.id === s.id);
      return h("button", { class: `cr-row ${s.closed ? "closed" : ""}`, style: `--c:${KIND_COLOR[s.kind]}`, onclick: () => { s.closed = !s.closed; draw(); } },
        h("i", {}), h("span", { class: "cr-name" }, h("strong", {}, s.name), h("small", {}, `${s.kind} · ${Math.round(s.km * 1000)} m walk${s.closed ? " · closed (tap to reopen)" : ""}`)),
        sp ? h("span", { class: "cr-num" }, h("strong", {}, sp.people.toLocaleString()), h("small", {}, `clear +${sp.clear} min`)) : h("span", { class: "cr-num" }, "—"));
    }));
  }

  async function load() {
    status.textContent = "Finding stations…";
    try { stations = await stationsNear(venue); status.textContent = stations.length ? "Tap a station to close it." : "No stations found within a walk: everyone drives?"; }
    catch { stations = []; status.textContent = "OpenStreetMap didn't answer; try again in a moment."; }
    draw();
    void flyToPlace(app.globe, { name: venue.name, lon: venue.lon, lat: venue.lat, radius: 1600 });
  }
  sel.addEventListener("change", () => {
    if (sel.value === "__mid" && mid) venue = { name: "The middle of the map", lon: mid.lon, lat: mid.lat, capacity: 20_000 };
    else venue = VENUES.find((v) => v.name === sel.value) ?? venue;
    crowd = venue.capacity; crowdIn.value = String(crowd); crowdOut.textContent = crowd.toLocaleString();
    void load();
  });
  const crowdIn = h("input", { type: "range", min: 2000, max: 110000, step: 1000, value: crowd, "aria-label": "Crowd" }) as HTMLInputElement, crowdOut = h("output", {}, crowd.toLocaleString());
  const shareIn = h("input", { type: "range", min: 0.1, max: 0.95, step: 0.05, value: share, "aria-label": "By transit" }) as HTMLInputElement, shareOut = h("output", {}, "60%");
  const boostIn = h("input", { type: "range", min: 1, max: 2, step: 0.25, value: 1, "aria-label": "Extra service" }) as HTMLInputElement, boostOut = h("output", {}, "normal");
  crowdIn.addEventListener("input", () => { crowd = Number(crowdIn.value); crowdOut.textContent = crowd.toLocaleString(); draw(); });
  shareIn.addEventListener("input", () => { share = Number(shareIn.value); shareOut.textContent = `${Math.round(share * 100)}%`; draw(); });
  boostIn.addEventListener("input", () => { boost = Number(boostIn.value); boostOut.textContent = boost === 1 ? "normal" : `×${boost} trains`; draw(); });
  clock.addEventListener("input", () => { minute = Number(clock.value); clockOut.textContent = `${minute} min`; wake(500); });
  play.addEventListener("click", () => {
    clearInterval(timer);
    if (play.classList.toggle("on")) {
      play.textContent = "❚❚ Pause"; if (minute >= 90) minute = 0;
      timer = window.setInterval(() => { if (!play.isConnected || minute >= 90) { clearInterval(timer); play.classList.remove("on"); play.textContent = "▶ Play the exit"; return; } minute++; clock.value = String(minute); clockOut.textContent = `${minute} min`; wake(300); }, 160);
    } else play.textContent = "▶ Play the exit";
  });
  ctx.show("Crowd flow", () => { clearInterval(timer); ds?.entities.removeAll(); flow?.set([]); app.canvas.drop("view:crowd"); ctx.home(); },
    h("p", { class: "mp-intro" }, "How a crowd leaves a venue: which stations it heads for, how long each takes to clear, and what changes if one closes or extra trains run."),
    sel, head,
    h("div", { class: "md-side" }, play, h("label", { class: "wi-sev" }, h("span", {}, "After the end"), clock, clockOut)),
    status, list,
    h("section", { class: "wi on" }, h("header", {}, h("strong", {}, "What if…")),
      h("label", { class: "wi-sev" }, h("span", {}, "Crowd"), crowdIn, crowdOut),
      h("label", { class: "wi-sev" }, h("span", {}, "By transit"), shareIn, shareOut),
      h("label", { class: "wi-sev" }, h("span", {}, "Service"), boostIn, boostOut)),
    h("p", { class: "fineprint" }, "Stations from OpenStreetMap. Throughputs are planning rules of thumb (rail 450, subway 320, tram 140, bus 60 people a minute); use the venue's own figures for operations."));
  void load();
}
