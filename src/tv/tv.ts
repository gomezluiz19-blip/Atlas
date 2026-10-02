// TV mode: Atlas for a screen across the room. The panels go, the type gets
// big, and it plays by itself: the Earth live (wind and planes moving), a run
// of great places, the world's markets, and your own place as a hologram. A
// QR code in the corner turns any phone into the remote: search on the phone
// and the TV flies there; tap a lens and the mountain opens on the big screen.
// Commands pause the playlist for a minute so the person driving stays in
// charge. Escape (or Exit on the remote) leaves.
import { Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4 } from "cesium";
import qrcode from "qrcode-generator";
import type { App } from "../app";
import { closeSpace } from "../delight/spaces";
import { earthNow } from "../delight/pulse";
import { EXCHANGES, session } from "../finance/model";
import { h } from "../ui/dom";
import { searchPlaces } from "../place/places";
import { flyToPlace, geocode } from "../ui/search";
import { listen, newCode, remoteUrl, send, type Cmd } from "./link";

const SCENE_MS = 26_000, HOLD_MS = 60_000;
export const SCENES = [
  { id: "live", label: "Live Earth" },
  { id: "places", label: "Great places" },
  { id: "markets", label: "Markets" },
  { id: "home", label: "Home" },
] as const;

const PLACES = [
  { name: "Mount Fuji", sub: "Japan's highest mountain, 3,776 m", lon: 138.7274, lat: 35.3606, radius: 9000 },
  { name: "Grand Canyon", sub: "1,800 m deep, cut by the Colorado over 6 million years", lon: -112.1129, lat: 36.1069, radius: 12000 },
  { name: "Machu Picchu", sub: "An Inca citadel 2,430 m up in the Andes", lon: -72.5450, lat: -13.1631, radius: 2500 },
  { name: "Venice", sub: "118 islands, 400 bridges, sinking a few millimetres a year", lon: 12.3358, lat: 45.4371, radius: 4000 },
  { name: "Mount Everest", sub: "8,849 m: the top of the world", lon: 86.9250, lat: 27.9881, radius: 14000 },
];

let active: { exit(): void } | null = null;
export const inTv = () => !!active;

/** The QR code for a link, as an SVG string. */
function qrSvg(text: string): string {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export function enterTv(app: App, given?: string) {
  if (active) return active;
  const code = given || newCode();
  const viewer = app.globe.viewer, cam = viewer.camera;
  document.body.classList.add("tv-mode");
  const title = h("h1", { class: "tv-title" }), sub = h("p", { class: "tv-sub" });
  const clock = h("div", { class: "tv-clock" });
  const dots = h("div", { class: "tv-dots" }, ...SCENES.map((s) => h("span", { "data-id": s.id }, s.label)));
  const link = remoteUrl(code);
  const pair = h("div", { class: "tv-pair" },
    h("div", { class: "tv-qr", html: qrSvg(link) }),
    h("div", {}, h("small", {}, "Use your phone as the remote"), h("strong", {}, code), h("small", { class: "tv-url" }, link.replace(/^https?:\/\//, "").replace(/#.*/, ""))));
  const el = h("div", { class: "tv", role: "region", "aria-label": "Atlas TV" },
    h("div", { class: "tv-brand" }, "ATLAS", h("span", {}, "TV")), clock, pair,
    h("div", { class: "tv-caption" }, title, sub), dots);
  document.body.append(el);

  let scene = 0, timer = 0, holdUntil = 0, spin: (() => void) | null = null, windOn = false, step = 0;
  const say = (t: string, s = "") => {
    title.textContent = t; sub.textContent = s;
    el.querySelector(".tv-caption")!.classList.remove("in"); void (el.querySelector(".tv-caption") as HTMLElement).offsetWidth; el.querySelector(".tv-caption")!.classList.add("in");
    send(code, "state", { t: "state", scene: SCENES[scene].id, title: t, sub: s });
  };
  const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
  tick();
  const clockTimer = window.setInterval(tick, 15_000);
  const stopSpin = () => { spin?.(); spin = null; };
  const startSpin = () => { stopSpin(); spin = viewer.scene.preRender.addEventListener(() => cam.rotate(Cartesian3.UNIT_Z, -0.00045)); };
  const setWind = (on: boolean) => { if (on !== windOn) { app.actions.get("wind:toggle")?.run(); windOn = on; } };
  const cleanScene = () => { stopSpin(); closeSpace(); app.actions.get("live:planes")?.stop?.(); setWind(false); };

  async function show(i: number) {
    scene = (i + SCENES.length) % SCENES.length;
    dots.querySelectorAll("span").forEach((d) => d.classList.toggle("on", d.getAttribute("data-id") === SCENES[scene].id));
    cleanScene();
    const id = SCENES[scene].id;
    if (id === "live") {
      cam.flyTo({ destination: Cartesian3.fromDegrees(-20 + Math.random() * 60, 25, 16_000_000), duration: 3 });
      setWind(true); app.actions.get("live:planes")?.run();
      startSpin();
      say("Right now on Earth", "Wind and every plane in the sky, live");
      void earthNow().then((lines) => { if (SCENES[scene].id === "live" && lines[0]) say("Right now on Earth", lines[0].text); });
    } else if (id === "places") {
      const p = PLACES[step++ % PLACES.length];
      void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: p.radius });
      say(p.name, p.sub);
      window.setTimeout(() => { if (SCENES[scene].id === "places") startSpinAround(p); }, 4500);
    } else if (id === "markets") {
      const now = new Date(), open = EXCHANGES.filter((e) => session(e, now).state === "open");
      cam.flyTo({ destination: Cartesian3.fromDegrees(open[0]?.lon ?? 0, 30, 18_000_000), duration: 3 });
      startSpin();
      say(open.length ? `${open.length} stock markets trading now` : "The world's markets are closed",
        open.length ? open.map((e) => e.city).join(" · ") : `Next to open: ${EXCHANGES.map((e) => ({ e, s: session(e, now) })).sort((a, b) => a.s.next - b.s.next)[0].e.city}`);
    } else {
      const home = (() => { try { return (JSON.parse(localStorage.getItem("atlas.myplaces.v1") ?? "[]") as { id: string; name: string }[])[0]; } catch { return undefined; } })();
      if (!home) { void show(scene + 1); return; }
      app.actions.get("myplace:boot")?.run(home.id);
      say(home.name, "Home, live: the weather, the day's brief and your place in 3D");
    }
  }
  /** A slow circle around a place, looking down at it. */
  function startSpinAround(p: { lon: number; lat: number; radius: number }) {
    stopSpin();
    let heading = cam.heading;
    const target = Cartesian3.fromDegrees(p.lon, p.lat, 0);
    spin = viewer.scene.preRender.addEventListener(() => { heading += 0.0016; cam.lookAt(target, new HeadingPitchRange(heading, CesiumMath.toRadians(-32), p.radius * 2.2)); });
    const unlook = spin;
    spin = () => { unlook(); cam.lookAtTransform(Matrix4.IDENTITY); };
  }
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(() => { if (Date.now() >= holdUntil) void show(scene + 1); schedule(); }, SCENE_MS); };

  // The remote.
  const onCmd = async (c: Cmd) => {
    holdUntil = Date.now() + HOLD_MS;
    if (c.t === "hello") { send(code, "state", { t: "state", scene: SCENES[scene].id, title: title.textContent ?? "", sub: sub.textContent ?? "" }); return; }
    if (c.t === "next") { void show(scene + 1); return; }
    if (c.t === "scene") { const i = SCENES.findIndex((s) => s.id === c.id); if (i >= 0) void show(i); return; }
    if (c.t === "exit") { self.exit(); return; }
    if (c.t === "wind") { setWind(!windOn); say(windOn ? "Wind on" : "Wind off", "The wind now, over the whole view"); return; }
    if (c.t === "fly") {
      cleanScene();
      say(`Finding ${c.q}…`);
      // Atlas's own named places first (mountains, rivers, cities, landmarks), then any address.
      const local = searchPlaces(c.q, 1)[0];
      const r = local ? { name: local.name, detail: local.detail, lon: local.lon, lat: local.lat, radius: local.radius } : (await geocode(c.q, null).catch(() => []))[0];
      if (!r) { say(`Couldn't find ${c.q}`); return; }
      app.select({ lon: r.lon, lat: r.lat, height: 0 }, { title: r.name, context: r.detail ?? "" });
      void flyToPlace(app.globe, { name: r.name, lon: r.lon, lat: r.lat, radius: r.radius || 6000 });
      say(r.name, r.detail ?? "");
      return;
    }
    if (c.t === "lens") { stopSpin(); app.actions.get(`lens:${c.id}`)?.run(); say(title.textContent ?? "", { slice: "Cut open: the rock layers inside", block: "Lifted out as a 3D block", day: "A day passing, with its real shadows" }[c.id] ?? ""); return; }
    if (c.t === "holo") { stopSpin(); app.actions.get("space:boot")?.run(); say(title.textContent ?? "", "As a hologram"); return; }
  };
  const unlisten = listen<Cmd>(code, "cmd", (c) => void onCmd(c));
  const keys = (e: KeyboardEvent) => { if (e.key === "Escape") self.exit(); if (e.key === "ArrowRight") void onCmd({ t: "next" }); };
  addEventListener("keydown", keys);

  const self = {
    exit() {
      clearTimeout(timer); clearInterval(clockTimer); unlisten(); removeEventListener("keydown", keys);
      cleanScene(); app.actions.get("lens:close")?.run();
      el.remove(); document.body.classList.remove("tv-mode");
      if (location.hash.startsWith("#/tv")) history.replaceState(null, "", location.pathname + location.search);
      active = null;
    },
  };
  active = self;
  void show(0);
  schedule();
  return self;
}

/** Cast: the device's own picker where the browser has one (Chrome, Edge), else how to. */
export function openCast(app: App) {
  document.querySelector(".cast-sheet")?.remove();
  const code = newCode();
  const tvLink = new URL(`#/tv/${code}`, location.href.replace(/#.*$/, "")).href;
  const close = () => sheet.remove();
  const canPresent = typeof (window as unknown as { PresentationRequest?: unknown }).PresentationRequest === "function";
  const status = h("p", { class: "muted small" });
  const sheet = h("div", { class: "cast-sheet", role: "dialog", "aria-label": "Show Atlas on a TV" },
    h("button", { class: "cast-x", "aria-label": "Close", onclick: close }, "✕"),
    h("h2", {}, "📺 Atlas on a TV"),
    h("p", { class: "muted" }, "TV mode plays by itself (the Earth live, great places, markets, your home) and your phone becomes the remote."),
    h("div", { class: "cast-options" },
      canPresent ? h("button", { class: "primary-btn", onclick: async () => {
        try {
          const Req = (window as unknown as { PresentationRequest: new (urls: string[]) => { start(): Promise<unknown> } }).PresentationRequest;
          await new Req([tvLink]).start();
          status.textContent = `Casting. Scan the code on the TV with your phone, or open the remote and enter ${code}.`;
        } catch { status.textContent = "No TV picked, or this TV can't take it directly: use your browser's Cast option (menu › Cast…) with TV mode on this screen."; }
      } }, "Cast to a TV") : "",
      h("button", { class: canPresent ? "pill-btn" : "primary-btn", onclick: () => { close(); enterTv(app, code); } }, "TV mode on this screen"),
      h("a", { class: "pill-btn", href: remoteUrl(code), target: "_blank", rel: "noopener" }, "Open the remote")),
    status,
    h("details", { class: "cast-how" }, h("summary", {}, "Other ways onto a TV"),
      h("ul", {},
        h("li", {}, h("strong", {}, "Chromecast or Google TV: "), "in Chrome, menu › Cast… › choose the TV, then TV mode on this screen."),
        h("li", {}, h("strong", {}, "Apple TV or AirPlay TV: "), "Control Centre › Screen Mirroring, then TV mode on this screen."),
        h("li", {}, h("strong", {}, "Smart TV browser: "), `open ${tvLink.replace(/^https?:\/\//, "")} on the TV.`),
        h("li", {}, h("strong", {}, "A cable: "), "plug in a laptop over HDMI; it looks best this way."))));
  document.body.append(sheet);
}
