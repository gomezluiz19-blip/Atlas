// Atlas Pro: live operations for a saved building. Connect a reservations
// source (demo feed, a CRM/PMS export, or a live link) and see how full the
// place is: the building in 3D floor by floor, the key numbers, every room,
// the next two weeks, and a time slider to watch it fill up.
import type { App } from "../app";
import type { MyPlace, PlaceStore } from "../myplaces/store";
import type { PlaceScene } from "../myplaces/scene";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import {
  floorOf, forecast, occupancyColor, parseTable, reservationsFromTable, roomsFrom, snapshot, STATE_INFO, summarize,
  type Room, type RoomState,
} from "./model";
import { demoData, demoUpdates, fetchFeed, loadConfigs, saveConfig, type Feed, type ProConfig } from "./sources";
import { createCameraSection } from "./vision/cameras";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function ring(value: number): SVGElement {
  const r = 44, c = 2 * Math.PI * r;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 110 110");
  svg.setAttribute("class", "pro-ring");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${pct(value)} occupied`);
  svg.innerHTML = `<circle cx="55" cy="55" r="${r}" fill="none" stroke="var(--fill-strong)" stroke-width="12"/>` +
    `<circle cx="55" cy="55" r="${r}" fill="none" stroke="${occupancyColor(value)}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c * value} ${c}" transform="rotate(-90 55 55)"/>` +
    `<text x="55" y="61" text-anchor="middle" font-size="24" font-weight="700" fill="currentColor">${pct(value)}</text>`;
  return svg;
}

export interface ProUi {
  panel: HTMLElement;
  open(placeId: string): void;
  close(): void;
}

export function createPro(app: App, store: PlaceStore, scene: PlaceScene, showPlace: (id: string) => void): ProUi {
  const panel = h("div", { class: "popover pro-panel", hidden: true, role: "dialog", "aria-label": "Atlas Pro" });
  let placeId: string | null = null;
  let feed: Feed | null = null;
  let error = "";
  let offset = 0; // hours from now shown by the time slider
  let timer = 0;
  const cameras = createCameraSection(app, scene, store);

  const place = () => (placeId ? store.get(placeId) : undefined);
  const config = () => (placeId ? loadConfigs()[placeId] : undefined);

  const head = (p: MyPlace, live: boolean) =>
    h("div", { class: "mp-head" },
      h("div", { class: "pro-title" },
        h("span", { class: "pro-badge" }, "PRO"),
        h("span", {}, h("strong", {}, p.name), h("span", { class: "pro-live" + (live ? " on" : "") }, live ? (offset ? `Showing ${when(Date.now() + offset * 3_600_000)}` : `Live · updated ${ago(feed?.at)}`) : "Not connected"))),
      h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => ui.close() }));

  const ago = (t?: number) => {
    if (!t) return "—";
    const s = Math.round((Date.now() - t) / 1000);
    return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
  };
  const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // ---- Connecting ------------------------------------------------------------------

  const connect = (cfg: ProConfig) => {
    saveConfig(placeId!, cfg);
    feed = null;
    error = "";
    offset = 0;
    void refresh(true);
    schedule();
  };

  const connectScreen = (p: MyPlace) => {
    const floorsGuess = Math.max(1, Math.min(12, Math.round((scene.own?.height ?? 9) / 3)));
    const file = h("input", { type: "file", accept: ".csv,.tsv,.txt,text/csv", hidden: true, onchange: async (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      const { reservations, skipped, columns } = reservationsFromTable(parseTable(await f.text()));
      if (!columns) { app.toast("That file needs arrival and departure (check-in and check-out) columns"); return; }
      app.toast(`Read ${reservations.length} bookings${skipped ? `, skipped ${skipped} cancelled or unreadable rows` : ""}`, 5000);
      connect({ source: { kind: "csv", name: f.name, reservations }, rooms: [] });
    } });
    const url = h("input", { type: "url", placeholder: "https://… (JSON or CSV)", class: "pro-url" }) as HTMLInputElement;
    panel.replaceChildren(
      head(p, false),
      h("p", { class: "mp-intro" }, "Connect your bookings to see, live, how full the building is: floor by floor in 3D, every room, and the next two weeks. Data stays in this browser; guest names are never read."),
      h("div", { class: "pro-options" },
        h("button", { class: "pro-option", onclick: () => connect({ source: { kind: "demo", floors: floorsGuess, perFloor: 8 }, rooms: [] }) },
          h("strong", {}, "Try it with a demo feed"), h("span", {}, `A simulated ${floorsGuess}-floor hotel on your building, with live check-ins and housekeeping.`)),
        h("button", { class: "pro-option", onclick: () => file.click() },
          h("strong", {}, "Import a reservations export"), h("span", {}, "A CSV from your CRM or booking system (Cloudbeds, Mews, Little Hotelier, a spreadsheet…) with room, arrival and departure columns. Spanish headers work too."), file),
        h("div", { class: "pro-option" },
          h("strong", {}, "Connect a live link"), h("span", {}, "A link that returns bookings or room status, checked every 30 seconds: a Google Sheet published as CSV that Zapier or Make keeps in sync, or a connector service."),
          h("div", { class: "pro-url-row" }, url, h("button", { class: "primary-btn", onclick: () => {
            const v = url.value.trim();
            if (!/^https:\/\//.test(v)) { app.toast("Use an https:// link"); return; }
            connect({ source: { kind: "url", url: v, everySec: 30 }, rooms: [] });
          } }, "Connect")))),
      h("p", { class: "fineprint" }, "Direct connections to booking systems and CRMs need their secret keys kept on a server. The format a connector should serve is in docs/pro-connectors.md in the Atlas repository."),
      cameras.el(p),
    );
  };

  // ---- Data --------------------------------------------------------------------------

  const refresh = async (first = false) => {
    const cfg = config();
    if (!cfg || !placeId) return;
    const now = Date.now();
    try {
      if (cfg.source.kind === "demo") {
        const d = feed && !first ? { rooms: feed.rooms, reservations: feed.reservations } : demoData(cfg.source.floors, cfg.source.perFloor, now);
        feed = { ...d, updates: demoUpdates(d.rooms, Math.floor(now / 6000)), at: now, note: "Demo feed (simulated)" };
      } else if (cfg.source.kind === "csv") {
        feed = { rooms: roomsFrom(cfg.source.reservations, cfg.rooms), reservations: cfg.source.reservations, updates: [], at: now, note: `From ${cfg.source.name}` };
      } else {
        const f = await fetchFeed(cfg.source.url);
        const rooms = roomsFrom(f.reservations, [...cfg.rooms, ...f.rooms.map((r) => ({ ...r, floor: Number.isFinite(r.floor) ? r.floor : floorOf(r.id) }))]);
        for (const u of f.updates) if (!rooms.some((r) => r.id === u.room)) rooms.push({ id: u.room, floor: floorOf(u.room) });
        feed = { rooms, reservations: f.reservations, updates: f.updates, at: now, note: "Live link" };
      }
      error = "";
    } catch (e) {
      error = `Couldn't read the live link: ${(e as Error).message}. ${/fetch/i.test((e as Error).message) ? "The link may not allow other sites to read it (CORS)." : ""}`;
    }
    render();
  };

  const schedule = () => {
    clearInterval(timer);
    const cfg = config();
    if (!cfg || panel.hidden) return;
    const every = cfg.source.kind === "demo" ? 6 : cfg.source.kind === "url" ? Math.max(15, cfg.source.everySec) : 60;
    timer = window.setInterval(() => void refresh(), every * 1000);
  };

  // ---- Views ----------------------------------------------------------------------------

  const liveView = (p: MyPlace, f: Feed) => {
    const at = Date.now() + offset * 3_600_000;
    const updates = offset ? [] : f.updates;
    const snap = snapshot(f.rooms, f.reservations, at, updates);
    const s = summarize(snap, f.reservations);
    const nights = forecast(f.rooms, f.reservations, Date.now(), 14);

    // The building in 3D, floor by floor.
    scene.setFloors(p, s.floors.map((fl) => ({ floor: fl.floor, color: occupancyColor(fl.occupancy), label: `Floor ${fl.floor} · ${fl.inUse}/${fl.rooms}` })));

    const floorsByNumber = new Map<number, { room: Room; state: RoomState; guests: number }[]>();
    for (const r of snap.rooms) (floorsByNumber.get(r.room.floor) ?? floorsByNumber.set(r.room.floor, []).get(r.room.floor)!).push(r);
    const slider = h("input", { type: "range", min: 0, max: 14 * 24, step: 6, value: offset, "aria-label": "Look ahead", oninput: (e: Event) => { offset = Number((e.target as HTMLInputElement).value); render(); } });
    const cfg = config()!;

    panel.replaceChildren(
      head(p, true),
      error ? h("p", { class: "error" }, error) : "",
      h("div", { class: "pro-hero" },
        ring(s.occupancy),
        h("div", { class: "pro-hero-text" },
          h("strong", {}, `${s.inUse} of ${s.rooms} rooms taken`),
          h("span", {}, `${s.guests} guest${s.guests === 1 ? "" : "s"} in the building`),
          h("span", {}, offset ? when(at) : "Right now"))),
      h("div", { class: "pro-stats" },
        stat(String(s.arrivals), "arriving today", STATE_INFO.arriving.color),
        stat(String(s.departures), "leaving today", STATE_INFO.departing.color),
        stat(String(s.byState.cleaning), "being cleaned", STATE_INFO.cleaning.color),
        stat(String(s.byState.vacant + s.byState.reserved), "free tonight", STATE_INFO.vacant.color)),
      cameras.el(p),
      h("section", { class: "group" }, h("h2", { class: "group-title" }, "Look ahead"),
        h("div", { class: "pro-slider" }, slider, h("span", {}, offset ? `+${offset >= 24 ? `${Math.round(offset / 24)} day${offset >= 48 ? "s" : ""}` : `${offset} h`}` : "Now")),
        h("div", { class: "pro-nights", role: "img", "aria-label": nights.map((n) => `${new Date(n.night).toDateString()}: ${pct(n.occupancy)}`).join(", ") },
          ...nights.map((n, i) => h("button", { class: "pro-night", title: `${new Date(n.night).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}: ${pct(n.occupancy)}`,
            onclick: () => { offset = Math.round((n.night - Date.now()) / 3_600_000 / 6) * 6; if (offset < 0) offset = 0; render(); } },
            h("span", { class: "pro-night-fill", style: `height:${Math.max(3, n.occupancy * 100)}%;background:${occupancyColor(n.occupancy)}` }),
            h("span", { class: "pro-night-label" }, i === 0 ? "Tn" : new Date(n.night).toLocaleDateString(undefined, { weekday: "narrow" })))))),
      h("section", { class: "group" }, h("h2", { class: "group-title" }, "Floors"),
        h("div", { class: "pro-floors" }, ...[...s.floors].reverse().map((fl) =>
          h("div", { class: "pro-floor" },
            h("span", { class: "pro-floor-name" }, `Floor ${fl.floor}`),
            h("span", { class: "share-track" }, h("span", { class: "share-fill", style: `width:${fl.occupancy * 100}%;background:${occupancyColor(fl.occupancy)}` })),
            h("span", { class: "share-value" }, `${fl.inUse}/${fl.rooms}`))))),
      h("section", { class: "group" }, h("h2", { class: "group-title" }, "Rooms"),
        h("div", { class: "pro-rooms" }, ...[...floorsByNumber.entries()].sort((a, b) => b[0] - a[0]).map(([fl, rs]) =>
          h("div", { class: "pro-room-row" }, h("span", { class: "pro-floor-name" }, `F${fl}`),
            h("div", { class: "pro-room-cells" }, ...rs.map((r) => h("span", { class: "pro-room", title: `Room ${r.room.id}: ${STATE_INFO[r.state].label}${r.guests ? `, ${r.guests} guest${r.guests === 1 ? "" : "s"}` : ""}`, style: `background:${STATE_INFO[r.state].color}` }, r.room.id)))))),
        h("div", { class: "stack-legend" }, ...(Object.keys(STATE_INFO) as RoomState[]).filter((k) => s.byState[k]).map((k) => h("span", { class: "stack-key" }, h("span", { class: "dot", style: `background:${STATE_INFO[k].color}` }), `${STATE_INFO[k].label} ${s.byState[k]}`)))),
      h("div", { class: "mp-foot" },
        h("span", {}, f.note ?? ""),
        h("button", { class: "link-btn", onclick: () => { void refresh(true); } }, "Refresh"),
        h("button", { class: "link-btn", onclick: () => { saveConfig(placeId!, null); feed = null; scene.setFloors(p, null); render(); } }, "Disconnect")),
      cfg.source.kind === "demo" ? h("p", { class: "fineprint" }, "Simulated data. Connect your own bookings to see the real building.") : "",
    );
  };

  const stat = (value: string, label: string, color: string) =>
    h("div", { class: "pro-stat", style: `--c:${color}` }, h("strong", {}, value), h("span", {}, label));

  const render = () => {
    const p = place();
    if (!p || panel.hidden) return;
    const cfg = config();
    if (!cfg) { scene.setFloors(p, null); connectScreen(p); return; }
    if (!feed) {
      panel.replaceChildren(head(p, false), error ? h("p", { class: "error" }, error) : h("div", { class: "loading" }, h("div", { class: "spinner" }), "Reading your bookings…"));
      return;
    }
    liveView(p, feed);
  };

  const ui: ProUi = {
    panel,
    open(id: string) {
      if (placeId !== id) { feed = null; error = ""; offset = 0; }
      placeId = id;
      showPlace(id);
      panel.hidden = false;
      render();
      if (!feed) void refresh(true);
      schedule();
    },
    close() {
      panel.hidden = true;
      clearInterval(timer);
      // Stop analysing video when nobody's looking (battery, and it's the respectful default).
      cameras.stopAll();
    },
  };
  return ui;
}
