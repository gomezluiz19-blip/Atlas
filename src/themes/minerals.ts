// Minerals: what the ground is made of and what we dig out of it. The world
// view is a commodity explorer (what each is for, who produces it, the landmark
// mines); a chosen place shows its rock, the minerals in it, what rocks like it
// can hold, the nearest landmark mines, and every mapped mine and quarry nearby.
import { Cartesian2, Color, CustomDataSource, DistanceDisplayCondition, HeightReference, LabelStyle, NearFarScalar, VerticalOrigin, Cartesian3 } from "cesium";
import type { App, Place, Subtab, Theme } from "../app";
import { toolSubtab } from "../app";
import {
  commodity, COMMODITIES, countryRanks, GROUP_INFO, MINERALS, MINES, rockProfile, type Commodity, type CommodityGroup, type Mine, type Mineral,
} from "../content/minerals";
import { reverseGeocode } from "../data/geocode";
import { km } from "../data/infra";
import { fetchMapUnit } from "../data/macrostrat";
import { cullBehindHorizon } from "../globe/draw";
import { makePickable } from "../globe/pickables";
import { MinesTool } from "../tools/mines";
import { formatDistance, h } from "../ui/dom";
import { icons } from "../ui/icons";
import { flyToPlace } from "../ui/search";
import { asyncBlock, note, section, stats } from "./common";

export interface MineFeature { type: "mine"; mine: Mine }

const dist = (k: number) => formatDistance(k * 1000);

const markerCache = new Map<string, string>();
/** A round marker with the commodity's tag (Cu, Li, Au…) on its colour. */
function commodityMarker(c: Commodity, size = 34): string {
  const key = `${c.id}|${size}`;
  let url = markerCache.get(key);
  if (!url) {
    const canvas = document.createElement("canvas");
    const s = size * 2;
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = lightColor(c.color) ? "#1c1c1e" : "#fff";
    ctx.font = `700 ${c.tag.length > 2 ? s * 0.3 : s * 0.4}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.tag, s / 2, s / 2 + 1);
    url = canvas.toDataURL();
    markerCache.set(key, url);
  }
  return url;
}

function lightColor(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

const tagChip = (c: Commodity, onclick?: () => void) =>
  h(onclick ? "button" : "span", { class: "commodity-chip", style: `--c:${c.color}`, onclick },
    h("span", { class: "commodity-tag", style: `background:${c.color};color:${lightColor(c.color) ? "#1c1c1e" : "#fff"}` }, c.tag), c.name);

/** Horizontal bars of producer shares, with the rest of the world. */
function producerBars(c: Commodity): HTMLElement {
  const rest = Math.max(0, 100 - c.producers.reduce((s, [, v]) => s + v, 0));
  const rows: [string, number][] = [...c.producers, ...(rest >= 1 ? [["Rest of the world", rest] as [string, number]] : [])];
  return h("div", { class: "share-bars" },
    ...rows.map(([name, v], i) =>
      h("div", { class: "share-row" },
        h("span", { class: "share-name" }, name),
        h("span", { class: "share-track" }, h("span", { class: "share-fill", style: `width:${v}%;background:${i === c.producers.length ? "var(--fill-strong)" : c.color}` })),
        h("span", { class: "share-value" }, `${v}%`))));
}

function mineralCard(mn: Mineral): HTMLElement {
  const ore = mn.ore ? commodity(mn.ore) : undefined;
  return h("div", { class: "mineral-card" },
    h("div", { class: "mineral-head" }, h("strong", {}, mn.name), h("span", { class: "mineral-formula" }, mn.formula)),
    h("div", { class: "mineral-why" }, mn.why),
    h("div", { class: "mineral-facts" }, h("span", {}, `Hardness ${mn.hardness}`), h("span", {}, mn.looks)),
    ore ? h("div", { class: "mineral-ore" }, "Ore of ", tagChip(ore)) : "");
}

/** Mineral chips that open a card for the one tapped. */
function mineralChips(keys: string[]): HTMLElement {
  const detail = h("div");
  const box = h("div", { class: "chips wrap" });
  let open: string | null = null;
  const draw = () => {
    box.replaceChildren(...keys.filter((k) => MINERALS[k]).map((k) =>
      h("button", { class: "chip", role: "switch", "aria-checked": String(open === k), onclick: () => { open = open === k ? null : k; draw(); } }, MINERALS[k].name)));
    detail.replaceChildren(open ? mineralCard(MINERALS[open]) : "");
  };
  draw();
  return h("div", { class: "mineral-chips" }, box, detail);
}

export function mineralsTheme(app: App): Theme {
  const minesTool = new MinesTool();
  app.home("mines", "minerals", "mines");
  let selected: string | null = null;
  let ds: CustomDataSource | null = null;

  const mineRow = (mn: Mine, from?: { lon: number; lat: number }) => {
    const c = commodity(mn.goods[0])!;
    return h("button", { class: "list-row", onclick: () => openMine(mn) },
      h("img", { class: "mine-badge", src: commodityMarker(c, 28), alt: "", width: 28, height: 28 }),
      h("span", { class: "list-text" },
        h("span", { class: "list-title" }, mn.name, h("span", { class: "site-where" }, mn.country)),
        h("span", { class: "list-sub" }, [from ? dist(km(from.lon, from.lat, mn.lon, mn.lat)) : "", mn.note].filter(Boolean).join(" · "))),
      h("span", { class: "chev", html: "&rsaquo;" }));
  };

  const openMine = (mn: Mine) => {
    void flyToPlace(app.globe, { name: mn.name, lon: mn.lon, lat: mn.lat, radius: mn.kind === "brine" || mn.kind === "placer" ? 15000 : 4000 });
    app.select({ lon: mn.lon, lat: mn.lat, height: 0 }, { title: mn.name, context: `${commodity(mn.goods[0])!.name} mine · ${mn.country}` }, { type: "mine", mine: mn } satisfies MineFeature);
    if (app.theme.id !== "minerals") app.setTheme("minerals", "here");
  };

  /** Landmark mines on the globe, filtered to the selected commodity. */
  const drawMines = () => {
    if (!ds) {
      ds = new CustomDataSource("landmark-mines");
      void app.globe.viewer.dataSources.add(ds);
      cullBehindHorizon(app.globe.viewer, ds);
    }
    ds.entities.removeAll();
    for (const mn of MINES) {
      if (selected && !mn.goods.includes(selected)) continue;
      const c = commodity(selected ?? mn.goods[0])!;
      const e = ds.entities.add({
        position: Cartesian3.fromDegrees(mn.lon, mn.lat),
        billboard: {
          image: commodityMarker(c),
          width: 30, height: 30,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new NearFarScalar(2e5, 1.1, 1.5e7, 0.65),
        },
        label: {
          text: mn.name,
          font: "600 13px -apple-system, system-ui, sans-serif",
          style: LabelStyle.FILL_AND_OUTLINE, fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#0b1320"), outlineWidth: 4,
          verticalOrigin: VerticalOrigin.TOP, pixelOffset: new Cartesian2(0, 18),
          heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 2.5e6),
        },
      });
      makePickable(e, { lon: mn.lon, lat: mn.lat, title: mn.name, context: `${commodity(mn.goods[0])!.name} mine · ${mn.country}`, feature: { type: "mine", mine: mn } satisfies MineFeature });
    }
    const c = selected ? commodity(selected) : null;
    // The canvas decides whether it's drawn (only in Minerals, unless pinned).
    ds.show = false;
    app.canvas.put({
      id: "minerals:mines", label: c ? `${c.name} mines` : "Landmark mines", color: c?.color ?? "#c77c02", theme: "minerals", scope: "world", pinned: false,
      show: (v) => { if (ds) ds.show = v; },
      remove: () => { ds?.entities.removeAll(); },
    });
  };

  const setCommodity = (id: string | null) => {
    selected = id;
    drawMines();
    // Picking a commodity from another theme (e.g. a Connected link) should show its mines there too.
    if (app.theme.id !== "minerals") app.canvas.setPinned("minerals:mines", true);
    if (!app.place) app.render();
  };

  /** The world commodity explorer (empty state and the Commodities subtab). */
  const explorer = (body: HTMLElement, from?: Place) => {
    const groups = Object.keys(GROUP_INFO) as CommodityGroup[];
    const grid = h("div", { class: "commodity-grid", role: "radiogroup", "aria-label": "Commodities" },
      ...groups.flatMap((g) => COMMODITIES.filter((c) => c.group === g).map((c) =>
        h("button", { class: "commodity-tile", role: "radio", "aria-checked": String(selected === c.id), style: `--c:${c.color}`, onclick: () => { setCommodity(selected === c.id ? null : c.id); if (app.place) app.render(); } },
          h("span", { class: "commodity-tag", style: `background:${c.color};color:${lightColor(c.color) ? "#1c1c1e" : "#fff"}` }, c.tag),
          h("span", { class: "commodity-name" }, c.name)))));
    body.append(section("Commodities", grid));
    const c = selected ? commodity(selected) : null;
    if (c) {
      const mines = MINES.filter((mn) => mn.goods.includes(c.id));
      body.append(
        h("div", { class: "commodity-card", style: `--c:${c.color}` },
          h("div", { class: "commodity-card-head" }, tagChip(c), h("span", { class: "muted small" }, GROUP_INFO[c.group].label)),
          h("p", { class: "commodity-what" }, c.what),
          stats(["Used for", c.uses], ["Mined as", c.ores], ["Where it forms", c.geology])),
        section("Who mines it", producerBars(c), note(`Share of world mine production. ${c.source ?? "USGS Mineral Commodity Summaries 2024 (2023 production), rounded."}`)),
        mines.length ? section(`Landmark ${c.name.toLowerCase()} mines`, h("div", { class: "list" }, ...mines.map((mn) => mineRow(mn, from)))) : "",
      );
    } else {
      let all = false;
      const list = h("div", { class: "list" });
      const more = h("button", { class: "link-btn" }, `Show all ${MINES.length}`);
      const sorted = from ? [...MINES].sort((a, b) => km(from.lon, from.lat, a.lon, a.lat) - km(from.lon, from.lat, b.lon, b.lat)) : MINES;
      const draw = () => {
        list.replaceChildren(...sorted.slice(0, all ? MINES.length : 10).map((mn) => mineRow(mn, from)));
        more.hidden = all;
      };
      more.addEventListener("click", () => { all = true; draw(); });
      draw();
      body.append(section(from ? "Landmark mines, nearest first" : "Landmark mines", h("p", { class: "muted small" }, "Pick a commodity above to see who produces it and where."), list, more));
    }
  };

  const geologyToggle = () =>
    h("label", { class: "switch-row" },
      h("span", {}, h("strong", {}, "Bedrock geology"), h("span", { class: "muted" }, "Colour the map by the rock at the surface (Macrostrat). Mines cluster along certain rocks.")),
      h("input", {
        type: "checkbox", class: "switch", checked: app.globe.state.overlays.geology.on,
        onchange: (e: Event) => { app.globe.state.overlays.geology.on = (e.target as HTMLInputElement).checked; app.globe.apply(); },
      }));

  const renderEmpty = (_app: App, body: HTMLElement) => {
    body.append(
      h("div", { class: "empty-hint compact" }, h("span", { class: "empty-icon", html: icons.gem }),
        h("span", {}, h("strong", {}, "Pick a commodity, a mine, or anywhere"), h("span", {}, "to see what it's for, who mines it, and what minerals are in the ground."))),
    );
    explorer(body);
    body.append(section("Map", geologyToggle()), mineralGuide());
  };

  const mineralGuide = () => {
    const keys = Object.keys(MINERALS);
    return section("Mineral guide", h("p", { class: "muted small" }, "The minerals that make up most rocks, and the ores metals come from. Tap one."), mineralChips(keys));
  };

  const mineCard = (mn: Mine) => {
    const goods = mn.goods.map((g) => commodity(g)!).filter(Boolean);
    return h("div", { class: "feature-card" },
      h("div", { class: "feature-kicker" }, `${mn.kind} mine`),
      h("div", { class: "feature-title" }, mn.name),
      h("p", { class: "commodity-what" }, mn.note),
      h("div", { class: "chips wrap" }, ...goods.map((c) => tagChip(c, () => { setCommodity(c.id); app.setSubtab("commodities"); }))),
      stats(["Country", mn.country], ["Main product", goods[0].name], ["What it's for", goods[0].uses]));
  };

  const here: Subtab = {
    id: "here",
    label: "Here",
    render({ app, place, body }) {
      const f = place.feature as MineFeature | undefined;
      if (f?.type === "mine") body.append(mineCard(f.mine));
      asyncBlock(app, body, "Reading the rock…", async () => {
        const { unit } = await fetchMapUnit(place.lon, place.lat).catch(() => ({ unit: null }));
        const out: (Node | string)[] = [];
        if (unit) {
          const text = `${unit.lith ?? ""} ${unit.name} ${unit.descrip ?? ""}`;
          const rock = rockProfile(text);
          out.push(section("The rock here",
            stats(
              ["Bedrock", unit.name],
              unit.best_int_name ? ["Age", unit.best_int_name] : null,
              rock ? ["Rock type", rock.label] : null,
            ),
            unit.lith ? h("p", { class: "muted small rock-lith" }, unit.lith.replace(/[{}]/g, "").replace(/,/g, ", ")) : ""));
          if (rock) {
            const goods = rock.goods.map((g) => commodity(g)!).filter(Boolean);
            out.push(
              section("Minerals in this rock", mineralChips(rock.minerals)),
              section("Rocks like this can hold",
                h("p", { class: "rock-hosts" }, rock.hosts),
                goods.length ? h("div", { class: "chips wrap" }, ...goods.map((c) => tagChip(c, () => { setCommodity(c.id); app.setSubtab("commodities"); }))) : "",
                note("What this kind of rock can host somewhere in the world, not a finding about this spot.")),
            );
          }
        } else {
          out.push(section("The rock here", h("p", { class: "muted" }, "No bedrock map here (Macrostrat covers North America in detail and the rest of the world more coarsely).")));
        }
        const nearest = [...MINES].sort((a, b) => km(place.lon, place.lat, a.lon, a.lat) - km(place.lon, place.lat, b.lon, b.lat)).slice(0, 4);
        out.push(section("Nearest landmark mines", h("div", { class: "list" }, ...nearest.map((mn) => mineRow(mn, place)))));
        const name = await reverseGeocode(place.lon, place.lat, 3).catch(() => null);
        const ranks = name?.countryCode ? countryRanks(name.countryCode) : [];
        if (ranks.length) {
          const country = name!.context.split(",").pop()!.trim() || name!.title;
          out.push(section(`${country} in world mining`,
            h("div", { class: "list" }, ...ranks.map(({ c, rank, share }) =>
              h("button", { class: "list-row", onclick: () => { setCommodity(c.id); app.setSubtab("commodities"); } },
                h("span", { class: "commodity-tag", style: `background:${c.color};color:${lightColor(c.color) ? "#1c1c1e" : "#fff"}` }, c.tag),
                h("span", { class: "list-text" }, h("span", { class: "list-title" }, c.name), h("span", { class: "list-sub" }, `#${rank} producer · about ${share}% of world output`)),
                h("span", { class: "chev", html: "&rsaquo;" }))))));
        }
        out.push(h("button", { class: "action", onclick: () => app.setSubtab("mines") }, h("span", { class: "action-icon", html: icons.pick }), h("span", {}, "Find every mapped mine and quarry nearby"), h("span", { class: "chev", html: "&rsaquo;" })));
        return out;
      });
    },
  };

  const commodities: Subtab = {
    id: "commodities",
    label: "Commodities",
    render({ place, body }) {
      explorer(body, place);
    },
  };

  return {
    id: "minerals",
    label: "Minerals",
    icon: icons.gem,
    color: "#c77c02",
    intro: "What the ground is made of, and what we mine from it.",
    subtabs: [here, toolSubtab("mines", "Mines nearby", minesTool, "point"), commodities],
    enter() {
      if (!app.canvas.has("minerals:mines")) drawMines();
    },
    renderEmpty,
  };
}
