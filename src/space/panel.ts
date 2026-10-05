// The Space button: satellites and the ISS live over the globe, when the ISS
// passes over your place, rocket launches (with countdowns, and a climb drawn
// for rockets in the air), tonight's sky, and the way out to the solar system.
import { Cartesian3, Math as CesiumMath } from "cesium";
import type { App } from "../app";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { compass } from "./astro";
import { skyCard } from "./sky";
import { SpaceLayer } from "./layer";
import { countdown, inFlight, previous, upcoming, type Launch } from "./launches";
import { GROUPS, loadGroup, orbitInfo, passes, stateAt, type Sat } from "./orbits";
import { SolarSystem } from "./solar";

const fmtTime = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

export function createSpace(app: App) {
  const button = h("button", { id: "space-btn", class: "round-btn", "aria-label": "Space", title: "Space: satellites, the ISS, launches and the solar system", "aria-expanded": "false", html: icons.saturn }) as HTMLButtonElement;
  const panel = h("div", { class: "popover space-panel", hidden: true, role: "dialog", "aria-label": "Space" });
  let layer: SpaceLayer | null = null;
  const on = new Set<string>();
  const counts = new Map<string, string>();
  let launches: Launch[] = [];
  let recent: Launch[] = [];
  let launchErr = "";
  let ticker = 0;
  const viewer = app.globe.viewer;

  const ensure = () => {
    if (layer) return layer;
    layer = new SpaceLayer(viewer);
    layer.onPick = (s) => { if (!panel.hidden) showSat(s); };
    layer.onLaunchPick = (l) => { open(); showLaunch(l); };
    app.canvas.put({ id: "space:sats", label: "Satellites", color: "#e1b843", scope: "world", pinned: true, show: (v) => layer?.setVisible(v), remove: () => { for (const g of [...on]) toggle(g, false); layer?.setVisible(false); } }, true);
    return layer;
  };

  const toggle = async (group: string, want = !on.has(group)) => {
    const l = ensure();
    l.setVisible(true);
    if (!want) { on.delete(group); l.setGroup(group, null); render(); return; }
    on.add(group);
    counts.set(group, "…");
    render();
    try {
      const sats = await loadGroup(group);
      if (!on.has(group)) return;
      l.setGroup(group, sats);
      counts.set(group, l.count(group).toLocaleString());
    } catch {
      counts.set(group, "offline");
      app.toast("Couldn't reach CelesTrak for satellite positions. Try again in a moment.", 5000);
    }
    render();
  };

  const loadLaunches = async () => {
    try {
      [launches, recent] = await Promise.all([upcoming(), previous().catch(() => [])]);
      // A launch that just lifted off shows in "previous" too.
      const flying = recent.filter((l) => inFlight(l));
      ensure().setLaunches([...flying, ...launches]);
      launchErr = "";
    } catch (e) {
      launchErr = (e as Error).message;
    }
    render();
  };

  // ---- Views ----------------------------------------------------------------------------

  const issBox = h("div", { class: "space-iss" });
  const issLine = () => {
    const st = layer?.issState();
    if (!st) { issBox.replaceChildren(h("span", { class: "muted small" }, on.has("stations") ? "Finding the ISS…" : "")); return; }
    issBox.replaceChildren(
      h("div", { class: "space-iss-head" }, h("span", { class: "space-emoji" }, "🛰️"), h("div", {}, h("strong", {}, "International Space Station"),
        h("span", { class: "muted small" }, `${Math.abs(st.lat).toFixed(1)}°${st.lat >= 0 ? "N" : "S"}, ${Math.abs(st.lon).toFixed(1)}°${st.lon >= 0 ? "E" : "W"} · ${Math.round(st.alt)} km up · ${(st.speed * 3600).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/h`))),
      h("div", { class: "pro-actions" },
        h("button", { class: "pill-btn", onclick: () => { layer?.follow(false); viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(st.lon, st.lat, 4_500_000), duration: 2 }); } }, "Go to it"),
        h("button", { class: "pill-btn" + (layer?.isFollowing ? " on" : ""), onclick: () => { layer?.follow(!layer.isFollowing); render(); } }, layer?.isFollowing ? "Stop riding" : "Ride along")));
  };

  const where = () => app.place ?? (() => {
    const c = viewer.camera.positionCartographic;
    return { lon: CesiumMath.toDegrees(c.longitude), lat: CesiumMath.toDegrees(c.latitude) };
  })();

  const passesBox = h("div", {});
  const showPasses = () => {
    const iss = layer?.issSat;
    if (!iss) { passesBox.replaceChildren(h("p", { class: "muted small" }, "Turn on Space stations to predict ISS passes.")); return; }
    const p = where();
    passesBox.replaceChildren(h("p", { class: "muted small" }, "Working out the passes…"));
    setTimeout(() => {
      const list = passes(iss, p.lon, p.lat, Date.now(), 96).filter((x) => x.visible).slice(0, 5);
      passesBox.replaceChildren(
        h("p", { class: "muted small" }, `Over ${app.place ? "the chosen place" : "the middle of the map"} (${p.lat.toFixed(1)}, ${p.lon.toFixed(1)}), next 4 days. Look for a bright, steady star gliding across the sky.`),
        list.length ? h("div", { class: "list" }, ...list.map((x) => h("div", { class: "list-row static" },
          h("span", { class: "space-pass-alt", style: `--a:${Math.min(1, x.maxAlt / 90)}` }, `${Math.round(x.maxAlt)}°`),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, fmtTime(x.start)),
            h("span", { class: "list-sub" }, `${Math.max(1, Math.round((x.end - x.start) / 60_000))} min · from the ${compass(x.startAz)} to the ${compass(x.endAz)}, up to ${Math.round(x.maxAlt)}° high`)))))
          : h("p", { class: "muted small" }, "No visible passes in the next 4 days here (it may pass in daylight, or too low)."));
    }, 30);
  };

  const skyBox = () => { const p = where(); return skyCard(p.lon, p.lat); };

  const launchRow = (l: Launch) => {
    const t = h("span", { class: "space-count" + (inFlight(l) ? " live" : "") }, inFlight(l) ? "In flight" : countdown(l.net));
    return h("button", { class: "list-row", onclick: () => showLaunch(l) },
      h("span", { class: "space-emoji" }, "🚀"),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, l.name),
        h("span", { class: "list-sub" }, `${l.provider} · ${l.location.split(",")[0]} · ${new Date(l.net).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`)),
      t);
  };

  const detail = h("div", { class: "space-detail", hidden: true });
  const showSat = (s: Sat) => {
    const st = stateAt(s, Date.now()), o = orbitInfo(s);
    detail.hidden = false;
    detail.replaceChildren(
      h("div", { class: "mp-head" }, h("strong", {}, s.name), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => (detail.hidden = true) })),
      h("p", { class: "muted small" }, `${GROUPS.find((g) => g.id === s.group)?.label ?? ""} · NORAD ${s.id}`),
      st ? h("dl", { class: "stat-list" },
        h("div", { class: "stat-row" }, h("dt", {}, "Height"), h("dd", {}, `${Math.round(st.alt).toLocaleString()} km`)),
        h("div", { class: "stat-row" }, h("dt", {}, "Speed"), h("dd", {}, `${(st.speed * 3600).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/h`)),
        h("div", { class: "stat-row" }, h("dt", {}, "Once round Earth"), h("dd", {}, o.period > 1400 ? `${(o.period / 60).toFixed(1)} h (keeps pace with Earth's spin)` : `${Math.round(o.period)} min`)),
        h("div", { class: "stat-row" }, h("dt", {}, "Orbit tilt"), h("dd", {}, `${o.inclination.toFixed(1)}°`))) : "");
    detail.scrollIntoView({ block: "nearest" });
  };
  const showLaunch = (l: Launch) => {
    detail.hidden = false;
    detail.replaceChildren(
      h("div", { class: "mp-head" }, h("strong", {}, l.name), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => (detail.hidden = true) })),
      l.image ? h("img", { class: "space-launch-img", src: l.image, alt: "" }) : "",
      h("p", {}, h("strong", {}, inFlight(l) ? "In flight now" : countdown(l.net)), ` · ${new Date(l.net).toLocaleString()}`),
      h("p", { class: "muted small" }, `${l.rocket} · ${l.provider} · ${l.pad}, ${l.location}${l.orbit ? ` · to ${l.orbit}` : ""} · status: ${l.statusName || l.status}`),
      l.mission ? h("p", { class: "small" }, l.mission) : "",
      inFlight(l) ? h("p", { class: "pro-warn" }, "The climb drawn on the globe is illustrative (a typical ascent from this pad), not live tracking.") : "",
      h("div", { class: "pro-actions" },
        h("button", { class: "pill-btn", onclick: () => viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(l.lon, l.lat, inFlight(l) ? 2_500_000 : 60_000), duration: 2 }) }, "Go to the pad"),
        l.url ? h("a", { class: "link-btn", href: l.url, target: "_blank", rel: "noopener" }, "Details and webcast") : ""));
  };

  // ---- Solar system ----------------------------------------------------------------------------------

  const toSolar = () => {
    close();
    const c = viewer.camera, from = { pos: c.positionWC.clone(), heading: c.heading, pitch: c.pitch, roll: c.roll };
    layer?.follow(false);
    document.body.classList.add("presenting");
    const go = () => {
      const s = new SolarSystem();
      s.onExit = () => {
        document.body.classList.remove("presenting");
        c.setView({ destination: Cartesian3.fromDegrees(0, 20, 60_000_000) });
        c.flyTo({ destination: from.pos, orientation: { heading: from.heading, pitch: from.pitch, roll: from.roll }, duration: 2.5 });
      };
      s.open(document.body);
    };
    // Pull away from Earth first, then hand over to the solar system.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) go();
    else c.flyTo({ destination: Cartesian3.fromDegrees(CesiumMath.toDegrees(c.positionCartographic.longitude), 10, 90_000_000), duration: 2.2, complete: go, cancel: go });
  };

  // ---- Panel ----------------------------------------------------------------------------------------------

  let showRecent = false;
  const render = () => {
    const flying = [...recent, ...launches].filter((l) => inFlight(l));
    panel.replaceChildren(
      h("div", { class: "mp-head" }, h("h2", {}, "Space"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => close() })),
      h("button", { class: "space-solar", onclick: toSolar },
        h("span", { class: "space-solar-art", "aria-hidden": "true" }, h("i", {}), h("i", {}), h("i", {})),
        h("span", {}, h("strong", {}, "Explore the solar system"), h("span", {}, "Fly out past the Moon to the planets, in their real places today"))),
      issBox,
      detail,
      h("section", { class: "group" }, h("h2", { class: "group-title" }, "Satellites"),
        h("div", { class: "space-groups" }, ...GROUPS.map((g) =>
          h("button", { class: "space-group" + (on.has(g.id) ? " on" : ""), style: `--c:${g.color}`, title: g.about, "aria-pressed": String(on.has(g.id)), onclick: () => void toggle(g.id) },
            h("i", {}), h("span", {}, g.label), on.has(g.id) ? h("small", {}, counts.get(g.id) ?? "") : ""))),
        h("p", { class: "muted small" }, "Positions computed live from CelesTrak's orbital data. Tap a dot for its details.")),
      h("section", { class: "group" }, h("h2", { class: "group-title" }, "When to see the ISS"), passesBox,
        h("button", { class: "link-btn", onclick: showPasses }, "Work out passes here")),
      h("section", { class: "group" }, h("h2", { class: "group-title" }, flying.length ? "Rockets in flight" : "Rocket launches"),
        launchErr ? h("p", { class: "muted small" }, `Couldn't load launches: ${launchErr}`) : "",
        flying.length ? h("div", { class: "list" }, ...flying.map(launchRow)) : "",
        launches.length ? h("div", { class: "list" }, ...launches.filter((l) => !inFlight(l)).slice(0, 6).map(launchRow)) : launchErr ? "" : h("p", { class: "muted small" }, "Loading launches…"),
        recent.length ? h("button", { class: "link-btn", onclick: () => { showRecent = !showRecent; render(); } }, showRecent ? "Hide recent launches" : "Recent launches") : "",
        showRecent ? h("div", { class: "list" }, ...recent.filter((l) => !inFlight(l)).slice(0, 6).map((l) => h("button", { class: "list-row", onclick: () => showLaunch(l) },
          h("span", { class: "space-emoji" }, /Success/i.test(l.status) ? "✅" : /Fail/i.test(l.status) ? "❌" : "🚀"),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, l.name), h("span", { class: "list-sub" }, `${l.statusName || l.status} · ${new Date(l.net).toLocaleDateString()}`))))) : "",
        h("p", { class: "muted small" }, "From The Space Devs' Launch Library.")),
      h("section", { class: "group" }, h("h2", { class: "group-title" }, "Tonight's sky"), skyBox()),
    );
    issLine();
  };

  const open = () => {
    if (!panel.hidden) return;
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.dispatchEvent(new Event("space:opened"));
    if (!on.size) { void toggle("stations"); void toggle("visual"); }
    if (!launches.length) void loadLaunches();
    render();
    // Pull back so the satellites are in view.
    const h0 = viewer.camera.positionCartographic.height;
    if (h0 < 8_000_000) viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(CesiumMath.toDegrees(viewer.camera.positionCartographic.longitude), CesiumMath.toDegrees(viewer.camera.positionCartographic.latitude), 22_000_000), duration: 2 });
    clearInterval(ticker);
    ticker = window.setInterval(() => {
      issLine();
      panel.querySelectorAll<HTMLElement>(".space-count:not(.live)").forEach((el, i) => {
        const l = [...launches.filter((x) => !inFlight(x))][i];
        if (l) el.textContent = countdown(l.net);
      });
    }, 1000);
  };
  const close = () => {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    clearInterval(ticker);
  };
  button.addEventListener("click", () => (panel.hidden ? open() : close()));
  return { button, panel, open, close, toSolar };
}
