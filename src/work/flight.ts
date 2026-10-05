// Flight School: fly a plane over the real globe to learn where countries are.
// Steer with the arrow keys (or the on-screen buttons); the panel shows which
// country you're over right now, and which way and how far the target is.
import { CallbackProperty, Cartesian3, HeadingPitchRange, Matrix4, VerticalOrigin, type Entity } from "cesium";
import type { App } from "../app";
import { containsPoint, countryShapes, type CountryShape } from "../data/countries";
import { h } from "../ui/dom";
import { CAPITALS } from "./gameData";
import { FLAG_COUNTRIES, flag } from "./learnData";
import { award, loadPassport, savePassport } from "./passport";
import { confetti } from "./quiz";

const R = 6371;
const toRad = (d: number) => (d * Math.PI) / 180, toDeg = (r: number) => (r * 180) / Math.PI;

/** Moves a point `km` along a heading (degrees clockwise from north). */
export function travel(lon: number, lat: number, headingDeg: number, km: number): [number, number] {
  const d = km / R, θ = toRad(headingDeg), φ1 = toRad(lat), λ1 = toRad(lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)];
}

/** Initial bearing (degrees) and great-circle distance (km) from a to b. */
export function bearing(a: [number, number], b: [number, number]): { deg: number; km: number } {
  const φ1 = toRad(a[1]), φ2 = toRad(b[1]), Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const dφ = φ2 - φ1;
  const hav = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return { deg: (toDeg(Math.atan2(y, x)) + 360) % 360, km: 2 * R * Math.asin(Math.sqrt(hav)) };
}

function planeIcon(): string {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.translate(48, 48);
  g.fillStyle = "#fff";
  g.strokeStyle = "#3563d6";
  g.lineWidth = 3;
  g.beginPath();
  // Fuselage, wings and tail, pointing up.
  g.moveTo(0, -40); g.quadraticCurveTo(6, -30, 5, -8); g.lineTo(38, 6); g.lineTo(38, 13); g.lineTo(5, 7); g.lineTo(4, 26); g.lineTo(14, 34); g.lineTo(14, 39); g.lineTo(0, 35);
  g.lineTo(-14, 39); g.lineTo(-14, 34); g.lineTo(-4, 26); g.lineTo(-5, 7); g.lineTo(-38, 13); g.lineTo(-38, 6); g.lineTo(-5, -8); g.quadraticCurveTo(-6, -30, 0, -40);
  g.closePath(); g.fill(); g.stroke();
  return c.toDataURL();
}

const anchor = (s: CountryShape): [number, number] => {
  const cap = CAPITALS.find((c) => s.name.toLowerCase().includes(c.hint.replace(/^capital of (the )?/, "").toLowerCase()));
  if (cap) return [cap.lon, cap.lat];
  let best = s.polygons[0][0], area = -1;
  for (const p of s.polygons) { const r = p[0]; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; if (Math.abs(a) > area) { area = Math.abs(a); best = r; } }
  return [best.reduce((s2, q) => s2 + q[0], 0) / best.length, best.reduce((s2, q) => s2 + q[1], 0) / best.length];
};

export async function flightSchool(app: App) {
  const shapes = (await countryShapes()).filter((s) => s.name && (s.bbox[2] - s.bbox[0]) * (s.bbox[3] - s.bbox[1]) > 6 && s.name !== "Antarctica");
  const viewer = app.globe.viewer;
  const camera = viewer.camera;
  const saved = { pos: camera.positionWC.clone(), h: camera.heading, p: camera.pitch };
  // Start over the country the camera is looking at, or London.
  const c0 = camera.positionCartographic;
  let lon = toDeg(c0.longitude), lat = Math.max(-60, Math.min(70, toDeg(c0.latitude)));
  if (c0.height > 20_000_000) { lon = -0.1; lat = 51.5; }
  let heading = 90, speed = 320; // km per second of play: a sped-up jet
  let turning = 0, over = "", target: CountryShape | null = null, targetPt: [number, number] = [0, 0];
  let missions = 0, score = 0, started = performance.now(), missionStart = performance.now(), done = false, hint = false;
  const MISSIONS = 5;

  const hud = h("div", { class: "flight-hud" });
  const now = h("div", { class: "flight-over" });
  const arrow = h("div", { class: "flight-arrow", "aria-hidden": "true" }, h("span", {}, "➤"));
  const hold = (dir: number) => {
    const b = h("button", { class: "flight-turn", "aria-label": dir < 0 ? "Turn left" : "Turn right" }, dir < 0 ? "↺" : "↻");
    b.addEventListener("pointerdown", () => (turning = dir));
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => (turning = 0));
    return b;
  };
  const speedBtn = (d: number, label: string) => h("button", { class: "flight-turn small", "aria-label": d > 0 ? "Faster" : "Slower", onclick: () => (speed = Math.max(120, Math.min(900, speed + d))) }, label);
  const root = h("div", { class: "present flight" }, hud, now, arrow,
    h("div", { class: "flight-controls" }, hold(-1), speedBtn(-100, "−"), speedBtn(100, "+"), hold(1)),
    h("div", { class: "present-bar" },
      h("button", { class: "present-btn wide", onclick: () => { hint = !hint; } }, "Hint"),
      h("button", { class: "present-btn wide", onclick: () => pickTarget() }, "Skip"),
      h("button", { class: "present-btn", "aria-label": "Stop flying", onclick: () => end(true) }, "✕")));
  document.body.classList.add("presenting");
  document.body.append(root);

  const plane: Entity = viewer.entities.add({
    position: new CallbackProperty(() => Cartesian3.fromDegrees(lon, lat, 11_000), false) as never,
    billboard: { image: planeIcon(), width: 64, height: 64, verticalOrigin: VerticalOrigin.CENTER, disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });

  const pickTarget = () => {
    // A country 800–5,000 km away, so each flight takes a little while.
    const options = shapes.filter((s) => { const d = bearing([lon, lat], anchor(s)).km; return d > 800 && d < 5000 && s !== target; });
    target = options[Math.floor(Math.random() * options.length)] ?? shapes[Math.floor(Math.random() * shapes.length)];
    targetPt = anchor(target);
    missionStart = performance.now();
    hint = false;
  };

  const flagFor = (name: string) => {
    const f = FLAG_COUNTRIES.find((x) => name.toLowerCase().includes(x.country.toLowerCase()) || x.country.toLowerCase().includes(name.toLowerCase()));
    return f ? `${flag(f.iso)} ` : "";
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "a") { turning = -1; e.preventDefault(); }
    else if (e.key === "ArrowRight" || e.key === "d") { turning = 1; e.preventDefault(); }
    else if (e.key === "ArrowUp" || e.key === "w") { speed = Math.min(900, speed + 60); e.preventDefault(); }
    else if (e.key === "ArrowDown" || e.key === "s") { speed = Math.max(120, speed - 60); e.preventDefault(); }
    else if (e.key === "Escape") end(true);
  };
  const onKeyUp = (e: KeyboardEvent) => { if (["ArrowLeft", "ArrowRight", "a", "d"].includes(e.key)) turning = 0; };
  addEventListener("keydown", onKey);
  addEventListener("keyup", onKeyUp);

  let last = performance.now(), checkAt = 0;
  const off = viewer.scene.preRender.addEventListener(() => {
    if (done) return;
    const t = performance.now(), dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    heading = (heading + turning * 75 * dt + 360) % 360;
    [lon, lat] = travel(lon, lat, heading, speed * dt);
    camera.lookAt(Cartesian3.fromDegrees(lon, lat, 11_000), new HeadingPitchRange(toRad(heading), toRad(-58), 2_600_000));
    if (t > checkAt) {
      checkAt = t + 250;
      const here = shapes.find((s) => containsPoint(s, lon, lat));
      const name = here?.name ?? "the ocean";
      if (name !== over) {
        over = name;
        now.replaceChildren(h("span", { class: "muted small" }, "Now flying over"), h("strong", {}, here ? `${flagFor(name)}${name}` : "🌊 open water"));
        now.classList.remove("pop"); void now.offsetWidth; now.classList.add("pop");
      }
      if (target && here === target) arrived();
    }
    if (target) {
      const b = bearing([lon, lat], targetPt);
      // The arrow circles the plane: straight up means straight ahead.
      arrow.style.transform = `rotate(${b.deg - heading}deg)`;
      arrow.hidden = !hint && b.km > 1500 && performance.now() - missionStart < 25_000;
      hud.replaceChildren(
        h("span", { class: "stage-num" }, `Flight ${missions + 1} of ${MISSIONS} · ${score.toLocaleString()} points`),
        h("h2", {}, `Fly to ${flagFor(target.name)}${target.name}`),
        h("p", { class: "muted" }, arrow.hidden ? "Which way? Press Hint for a compass arrow." : `${Math.round(b.km).toLocaleString()} km, heading ${Math.round(b.deg)}°`),
        h("p", { class: "flight-help" }, "← → to steer · ↑ ↓ speed"));
    }
  });

  const arrived = () => {
    const secs = (performance.now() - missionStart) / 1000;
    const pts = Math.max(100, Math.round(1000 - secs * 12 - (hint ? 200 : 0)));
    score += pts;
    missions++;
    confetti(root);
    const cap = CAPITALS.find((c) => target!.name.toLowerCase().includes(c.hint.replace(/^capital of (the )?/, "").toLowerCase()));
    app.toast(`Landed in ${target!.name}${cap ? ` (capital: ${cap.name})` : ""}! +${pts}`, 3500);
    if (missions >= MISSIONS) end(false);
    else pickTarget();
  };

  const end = (quit: boolean) => {
    if (done) return;
    done = true;
    off();
    removeEventListener("keydown", onKey);
    removeEventListener("keyup", onKeyUp);
    viewer.entities.remove(plane);
    camera.lookAtTransform(Matrix4.IDENTITY);
    if (!quit) {
      const p = loadPassport();
      p.flights++;
      const earned = [award(p, "pilot") ? "Pilot" : "", p.flights >= 5 && award(p, "ace") ? "Ace" : ""].filter(Boolean);
      savePassport(p);
      hud.replaceChildren(h("span", { class: "stage-num" }, "Flight School"), h("h2", {}, `${score.toLocaleString()} points`),
        h("p", {}, `${MISSIONS} countries in ${Math.round((performance.now() - started) / 1000)} seconds.${earned.length ? ` New badge: ${earned.join(", ")}!` : ""}`));
      now.remove(); arrow.remove();
      root.querySelector(".flight-controls")?.remove();
      root.querySelector(".present-bar")!.replaceChildren(h("button", { class: "present-btn wide", onclick: () => close() }, "Land"));
      confetti(root);
    } else close();
  };
  const close = () => {
    root.remove();
    document.body.classList.remove("presenting");
    camera.flyTo({ destination: saved.pos, orientation: { heading: saved.h, pitch: saved.p, roll: 0 }, duration: 1.5 });
  };
  pickTarget();
}
