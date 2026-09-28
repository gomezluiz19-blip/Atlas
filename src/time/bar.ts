// The time bar: one slider from the ancient world to 2100. Before 2000 the
// globe draws the borders of the time; from 2000 it shows NASA's satellite
// picture of a day that year (MODIS, 250 m); then today; then projections,
// which each place's page carries. Play runs through history.
import { ImageryLayer, UrlTemplateImageryProvider } from "cesium";
import type { App } from "../app";
import { YEARS, nearestYear } from "../data/history";
import { h } from "../ui/dom";
import { dayFor, momentIndex, moments, type Moment } from "./model";

const NOW = new Date().getUTCFullYear();

export class TimeBar {
  readonly el: HTMLElement;
  readonly list: Moment[] = moments(NOW, YEARS);
  private i = momentIndex(this.list, NOW);
  private slider: HTMLInputElement;
  private big = h("strong", { class: "tb-year" });
  private sub = h("span", { class: "tb-sub" });
  private playBtn: HTMLButtonElement;
  private imagery: ImageryLayer | null = null;
  private bordersOn = false;
  private job = 0;
  private timer = 0;
  private playing = 0;

  constructor(private app: App) {
    this.slider = h("input", { type: "range", min: 0, max: this.list.length - 1, step: 1, value: this.i, class: "tb-slider", "aria-label": "Year" }) as HTMLInputElement;
    this.slider.style.setProperty("--eras", this.eras());
    this.slider.addEventListener("input", () => { this.stop(); this.go(Number(this.slider.value)); });
    this.playBtn = h("button", { class: "tb-btn tb-play", "aria-label": "Play through history", html: PLAY, onclick: () => (this.playing ? this.stop() : this.play()) }) as HTMLButtonElement;
    this.el = h("div", { class: "timebar", hidden: true, role: "group", "aria-label": "Time" },
      this.playBtn,
      h("div", { class: "tb-label" }, this.big, this.sub),
      this.slider,
      h("button", { class: "tb-now", onclick: () => { this.stop(); this.go(momentIndex(this.list, NOW)); } }, "Today"),
      h("button", { class: "tb-btn", "aria-label": "Close the time bar", html: "✕", onclick: () => this.close() }));
    this.render();
  }

  /** The eras as a coloured track: borders, satellite years, today, the future. */
  private eras(): string {
    const n = this.list.length - 1, at = (k: number) => `${((k / n) * 100).toFixed(2)}%`;
    const firstSat = this.list.findIndex((m) => m.kind === "imagery"), now = this.list.findIndex((m) => m.kind === "now");
    return `linear-gradient(90deg, #e0b050 0 ${at(firstSat)}, #0a84ff ${at(firstSat)} ${at(now)}, #ffffff ${at(now)} ${at(now + 0.35)}, #ff6b5a ${at(now + 0.35)} 100%)`;
  }

  get current(): Moment { return this.list[this.i]; }

  open() {
    this.el.hidden = false;
    document.body.classList.add("time-open");
  }

  close() {
    this.stop();
    this.go(momentIndex(this.list, NOW));
    this.el.hidden = true;
    document.body.classList.remove("time-open");
  }

  /** Jumps to the stop nearest a year (opening the bar). */
  goToYear(year: number) {
    this.open();
    this.stop();
    this.go(momentIndex(this.list, year));
  }

  private play() {
    // From the start of the satellite years if we're at today, else onward from here.
    if (this.current.kind === "now" || this.current.kind === "future") this.go(this.list.findIndex((m) => m.year >= 1800));
    this.playBtn.innerHTML = PAUSE;
    const step = () => {
      if (this.i >= momentIndex(this.list, NOW)) { this.stop(); return; }
      this.go(this.i + 1);
      this.playing = window.setTimeout(step, this.current.kind === "imagery" ? 1400 : 2200);
    };
    this.playing = window.setTimeout(step, 1600);
  }

  private stop() {
    clearTimeout(this.playing);
    this.playing = 0;
    this.playBtn.innerHTML = PLAY;
  }

  private go(i: number) {
    this.i = Math.max(0, Math.min(this.list.length - 1, i));
    this.slider.value = String(this.i);
    this.render();
    // Borders files are large: wait for the slider to settle.
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.apply(), this.playing ? 0 : 250);
  }

  private render() {
    const m = this.current;
    this.big.textContent = m.label;
    const lat = this.app.globe.viewer.camera.positionCartographic.latitude * (180 / Math.PI);
    this.sub.textContent =
      m.kind === "borders" ? `Borders of ${m.label}, on today's ground`
      : m.kind === "imagery" ? `From space, ${new Date(dayFor(m.year, lat) + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "long" })} ${m.year} · NASA MODIS`
      : m.kind === "now" ? "Now: today's globe"
      : "Projections: each place's page shows how it changes";
    this.el.dataset.kind = m.kind;
  }

  private async apply() {
    const my = ++this.job, m = this.current, { viewer } = this.app.globe;
    if (this.imagery) { viewer.imageryLayers.remove(this.imagery, true); this.imagery = null; }
    if (m.kind === "imagery") {
      const lat = viewer.camera.positionCartographic.latitude * (180 / Math.PI);
      this.imagery = new ImageryLayer(new UrlTemplateImageryProvider({
        url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${dayFor(m.year, lat)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        maximumLevel: 9, credit: `NASA MODIS Terra, ${dayFor(m.year, lat)} (GIBS)`,
      }));
      // Just above the satellite base, so map layers stay on top.
      this.app.globe.addUnder(this.imagery);
    }
    const present = await import("../work/present");
    if (my !== this.job) return;
    if (m.kind === "borders") {
      this.bordersOn = true;
      await present.showYear(this.app, nearestYear(m.year)).catch(() => this.app.toast("Couldn't load the borders for that year. Check the connection.", 4000));
      // One chip in "On the map" for the time, not one for the borders too.
      this.app.canvas.drop("work:borders");
    } else if (this.bordersOn) {
      this.bordersOn = false;
      await present.showYear(this.app, null);
    }
    if (my !== this.job) return;
    if (m.kind === "now") this.app.canvas.drop("time");
    else this.app.canvas.put({ id: "time", label: `Time: ${m.label}`, color: m.kind === "borders" ? "#e0b050" : m.kind === "imagery" ? "#0a84ff" : "#ff6b5a", scope: "world", pinned: true,
      show: (v) => { if (this.imagery) this.imagery.show = v; if (this.bordersOn) present.borders(this.app).setVisible(v); },
      remove: () => this.close() }, true);
  }
}

const PLAY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>`;
const PAUSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
