// Money & trade before a place is chosen: which of the world's exchanges are trading now (pinned on the
// globe, green when open), and today's exchange rates with a converter.
import { Cartesian2, Cartesian3, Color, CustomDataSource, LabelStyle, VerticalOrigin } from "cesium";
import type { App } from "../app";
import { EXCHANGES, session, until } from "../finance/model";
import { section } from "../themes/common";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { flyToPlace } from "../ui/search";
import { convert, homeCurrency, MAJORS, rateText, usdRates } from "./rates";

const nameOf = (() => {
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(["en"], { type: "currency" }); } catch { /* old browser */ }
  return (code: string) => names?.of(code) ?? code;
})();

/** The exchanges on the globe while Money & trade is open: green trading, amber at lunch, grey closed. */
function marketPins(app: App) {
  const viewer = app.globe.viewer;
  const old = viewer.dataSources.getByName("money:markets")[0];
  if (old) viewer.dataSources.remove(old, true);
  const ds = new CustomDataSource("money:markets");
  void viewer.dataSources.add(ds);
  app.canvas.put({ id: "money:markets", label: "Stock exchanges", color: "#1baf7a", theme: "money", scope: "world", pinned: false, show: (v) => { ds.show = v; viewer.scene.requestRender(); }, remove: () => { viewer.dataSources.remove(ds, true); viewer.scene.requestRender(); } }, true);
  return (now: Date) => {
    ds.entities.removeAll();
    for (const e of EXCHANGES) {
      const s = session(e, now), c = s.state === "open" ? "#1baf7a" : s.state === "lunch" ? "#eda100" : "#9a9893";
      ds.entities.add({
        position: Cartesian3.fromDegrees(e.lon, e.lat),
        point: { pixelSize: s.state === "open" ? 13 : 9, color: Color.fromCssColorString(c), outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: s.state === "closed" ? undefined : { text: e.city, font: "600 12px system-ui, sans-serif", fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#1b1d1a"), outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -10), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
    }
    viewer.scene.requestRender();
  };
}

/** Which exchanges are trading now, refreshed every half minute while it's on screen. */
export function marketsNow(app: App): HTMLElement {
  const body = h("div", { class: "mn" });
  const pins = marketPins(app);
  const draw = () => {
    if (!body.isConnected && drawn) { clearInterval(timer); return; }
    drawn = true;
    const now = new Date();
    pins(now);
    const rows = EXCHANGES.map((e) => ({ e, s: session(e, now) })).sort((a, b) => (a.s.state === "closed" ? 1 : 0) - (b.s.state === "closed" ? 1 : 0) || (a.s.state === "closed" ? a.s.next - b.s.next : 0));
    const open = rows.filter((r) => r.s.state !== "closed");
    const next = rows.find((r) => r.s.state === "closed");
    body.replaceChildren(
      h("div", { class: "mn-head" },
        h("strong", {}, `${open.length} of ${rows.length}`), h("span", {}, " major exchanges trading now"),
        next ? h("small", {}, `Next to open: ${next.e.city} in ${until(next.s.next)}`) : ""),
      h("div", { class: "list" }, ...rows.map((r) => h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: r.e.name, lon: r.e.lon, lat: r.e.lat, radius: 2500 }) },
        h("span", { class: `mk-dot ${r.s.state}` }),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, r.e.city), h("span", { class: "list-sub" }, `${r.e.name} · ${r.s.local} local`)),
        h("span", { class: `mk-state ${r.s.state}` }, r.s.state === "open" ? `Closes in ${until(r.s.next)}` : r.s.state === "lunch" ? `Lunch · back in ${until(r.s.next)}` : `Opens in ${until(r.s.next)}`)))),
      h("p", { class: "fineprint" }, "Regular hours, local time; public holidays and early closes aren't counted."));
  };
  let drawn = false;
  const timer = window.setInterval(draw, 30_000);
  draw();
  return section("Markets now", body);
}

/** Today's rates: a converter, then the main currencies against yours. */
export function exchangeRates(): HTMLElement {
  const body = h("div", { class: "fx" }, h("div", { class: "loading" }, h("div", { class: "spinner" }), "Reading today's rates…"));
  void usdRates().then(({ rates, updated }) => {
    const codes = [...new Set([...MAJORS, ...Object.keys(rates).sort()])].filter((c) => rates[c]);
    let from = homeCurrency(), to = from === "USD" ? "EUR" : "USD";
    const amount = h("input", { class: "po-input fx-amount", type: "number", inputmode: "decimal", min: "0", value: "100", "aria-label": "Amount" }) as HTMLInputElement;
    const select = (value: string, set: (v: string) => void) => {
      const s = h("select", { class: "po-input fx-cur" }, ...codes.map((c) => h("option", { value: c, selected: c === value }, `${c} · ${nameOf(c)}`))) as HTMLSelectElement;
      s.onchange = () => { set(s.value); draw(); };
      return s;
    };
    const out = h("div", { class: "fx-out" });
    const board = h("div", { class: "fx-board" });
    const draw = () => {
      const n = Number(amount.value || 0), r = convert(n, from, to, rates);
      out.replaceChildren(h("strong", {}, r === null ? "—" : `${rateText(r)} ${to}`), h("small", {}, `${rateText(n)} ${from} · 1 ${from} = ${rateText(convert(1, from, to, rates) ?? 0)} ${to}`));
      board.replaceChildren(...MAJORS.filter((c) => c !== from && rates[c]).slice(0, 12).map((c) =>
        h("button", { class: "fx-row", onclick: () => { to = c; fields.replaceChildren(...row()); draw(); } },
          h("span", { class: "fx-code" }, c), h("span", { class: "fx-name" }, nameOf(c)), h("span", { class: "fx-val" }, rateText(convert(1, from, c, rates) ?? 0)))));
    };
    const fields = h("div", { class: "fx-fields" });
    const row = () => [amount, select(from, (v) => (from = v)),
      h("button", { class: "fx-swap", "aria-label": "Swap currencies", title: "Swap", html: icons.route, onclick: () => { [from, to] = [to, from]; fields.replaceChildren(...row()); draw(); } }),
      select(to, (v) => (to = v))];
    fields.replaceChildren(...row());
    amount.oninput = draw;
    draw();
    body.replaceChildren(fields, out,
      h("p", { class: "fx-board-title" }, "One unit of your currency in each of the main ones"),
      board,
      h("p", { class: "fineprint" }, `Rates of ${updated || "today"}, from open.er-api.com, updated daily; not for trading.`));
  }).catch(() => body.replaceChildren(h("p", { class: "muted small" }, "Couldn't read today's rates just now.")));
  return section("Exchange rates", body);
}
