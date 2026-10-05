// Countries › Politics: who governs the place you're looking at. The same
// page for every country (who holds power, the legislature drawn as a
// parliament arc, the courts, the governing party, the next election), with
// the United States in depth (live Congress, governors, justices, and for a
// spot in a state: its governor, senators and your House representative, the
// district outlined on the map). Maps colour the states by governor or Senate
// delegation, or the world by how soon each country votes.
import type { ImageryLayer } from "cesium";
import type { App, Place, Subtab } from "../app";
import { countryAt, countryShapes } from "../data/countries";
import { iso3 } from "../data/people";
import { canvasLayer, tracePath } from "../globe/networkLayer";
import { vectorLayer, type VectorShape } from "../globe/vectorLayer";
import { h } from "../ui/dom";
import { asyncBlock, note, section } from "../themes/common";
import { control, countdown, hemicycle, nextUsElection, partyColor, postalOfFips, tally, usSummary, NON_VOTING, US_STATES, type Bloc, type Chamber, type Election, type Leadership, type Person } from "./model";
import { congress, districtAt, governors, portraits, supremeCourt, whiteHouse, type Member } from "./us";
import { leadershipOf, nextElections } from "./world";

const today = () => new Date().toISOString().slice(0, 10);
const initials = (n: string) => n.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("");

// ---- Pieces --------------------------------------------------------------------------------------

function personCard(p: Person, size: "big" | "small" = "small"): HTMLElement {
  const face = h("span", { class: "pol-face", style: `--c:${partyColor(p.party)}` }, initials(p.name));
  if (p.photo) {
    // Loaded before it joins the page (a lazy image off the page never loads).
    const img = h("img", { src: p.photo, alt: "" }) as HTMLImageElement;
    img.addEventListener("load", () => { face.textContent = ""; face.append(img); }, { once: true });
  }
  return h(p.url ? "a" : "div", { class: `pol-person ${size}`, ...(p.url ? { href: p.url, target: "_blank", rel: "noopener" } : {}) },
    face,
    h("span", { class: "pol-who" },
      h("strong", {}, p.name),
      h("small", {}, p.office),
      p.party ? h("span", { class: "pol-party", style: `--c:${partyColor(p.party)}` }, p.party) : ""));
}

/** A chamber as a parliament arc: each dot a seat, each party a wedge. */
function arc(ch: Chamber): HTMLElement {
  const seats = hemicycle(ch.seats);
  const colors: string[] = [];
  for (const b of ch.parties) for (let i = 0; i < b.seats; i++) colors.push(b.color);
  while (colors.length < seats.length) colors.push("#d4d4d8");
  const W = 320, R = 150, cx = W / 2, cy = 158;
  const dots = seats.map((s, i) => `<circle cx="${(cx + s.x * R).toFixed(1)}" cy="${(cy - s.y * R).toFixed(1)}" r="${(s.r * R).toFixed(2)}" fill="${colors[i]}"/>`).join("");
  const svg = h("div", { class: "pol-arc", html: `<svg viewBox="0 0 ${W} 170" role="img" aria-label="${ch.name}: ${ch.parties.map((p) => `${p.party} ${p.seats}`).join(", ")}">${dots}<text x="${cx}" y="${cy - 8}" text-anchor="middle" class="pol-arc-n">${ch.seats}</text><text x="${cx}" y="${cy + 8}" text-anchor="middle" class="pol-arc-l">seats</text></svg>` });
  return h("div", { class: "pol-chamber" },
    h("div", { class: "pol-chamber-head" }, h("strong", {}, ch.name), ch.majority ? h("small", {}, `${ch.majority} for a majority`) : ""),
    ch.parties.length ? svg : h("p", { class: "muted small" }, ch.seats ? `${ch.seats} seats` : "Seats not recorded"),
    ch.parties.length ? h("div", { class: "pol-legend" }, ...ch.parties.map((b) => h("span", {}, h("i", { style: `background:${b.color}` }), `${b.party} ${b.seats}`))) : "",
    ch.note ? h("p", { class: "muted small" }, ch.note) : "",
    ch.leaders.length ? h("div", { class: "pol-people" }, ...ch.leaders.map((p) => personCard(p))) : "");
}

function electionCard(e: Election): HTMLElement {
  const d = new Date(e.date + "T12:00:00Z");
  return h("div", { class: "pol-election" },
    h("div", { class: "pol-cal" }, h("small", {}, d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })), h("strong", {}, String(d.getUTCDate())), h("small", {}, String(d.getUTCFullYear()))),
    h("div", {}, h("strong", {}, countdown(e.date, today()).replace(/^in /, "In ")), h("p", {}, e.what)));
}

// ---- The maps ------------------------------------------------------------------------------------

type MapMode = "governors" | "senate" | "elections";
let mapLayer: ImageryLayer | null = null;
let mapMode: MapMode | null = null;
let states: Promise<(VectorShape & { code: string })[]> | null = null;

function usStates() {
  states ??= (async () => {
    const [{ feature }, topo] = await Promise.all([import("topojson-client"), import("us-atlas/states-10m.json")]);
    const t = (topo as { default?: unknown }).default ?? topo;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = feature(t as any, (t as any).objects.states) as unknown as { features: { id: string; geometry: { type: string; coordinates: unknown } }[] };
    return fc.features.flatMap((f) => {
      const code = postalOfFips(String(f.id));
      if (!code || !f.geometry) return [];
      const polygons = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as [number, number][][][];
      let w = 180, s = 90, e = -180, n = -90;
      for (const poly of polygons) for (const [x, y] of poly[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
      return [{ code, polygons, bbox: [w, s, e, n] as [number, number, number, number] }];
    });
  })();
  return states;
}

const withAlpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;

async function showMap(app: App, mode: MapMode | null) {
  if (mapLayer) { app.globe.viewer.imageryLayers.remove(mapLayer, true); mapLayer = null; }
  mapMode = mode;
  app.looks?.setLegend(null);
  if (!mode) { app.canvas.drop("politics:map"); return; }
  let layer: ImageryLayer;
  if (mode === "elections") {
    const [shapes, next] = await Promise.all([countryShapes(), nextElections()]);
    const now = Date.now();
    layer = vectorLayer(shapes, { stroke: "rgba(255,255,255,0.5)", width: 0.8, scaleWithZoom: true, fillOf: (s) => {
      const code = iso3((s as unknown as { id: string }).id);
      const e = code ? next[code]?.[0] : undefined;
      if (!e) return "rgba(120,120,130,0.25)";
      const months = (Date.parse(e.date) - now) / (30.4 * 86_400_000);
      return months < 3 ? "rgba(255,69,58,0.75)" : months < 12 ? "rgba(255,159,10,0.62)" : months < 24 ? "rgba(255,214,10,0.45)" : "rgba(52,199,89,0.35)";
    } });
    app.looks?.setLegend({ emoji: "🗳️", name: "Next national election", stops: ["rgba(255,69,58,0.9)", "rgba(255,159,10,0.9)", "rgba(255,214,10,0.8)", "rgba(52,199,89,0.7)"], from: "within 3 months", to: "2+ years" });
  } else {
    const [shapes, govs, members] = await Promise.all([usStates(), mode === "governors" ? governors().catch(() => ({} as Record<string, Person>)) : Promise.resolve({} as Record<string, Person>), mode === "senate" ? congress() : Promise.resolve([] as Member[])]);
    const senate = (code: string) => {
      const two = members.filter((m) => m.chamber === "sen" && m.state === code).map((m) => (m.party === "Independent" ? m.caucus ?? "Independent" : m.party));
      return two.length === 2 && two[0] === two[1] ? partyColor(two[0]) : two.length ? "#a855f7" : null;
    };
    layer = vectorLayer(shapes, { stroke: "rgba(255,255,255,0.85)", width: 1, scaleWithZoom: true, fillOf: (s) => {
      const code = (s as VectorShape & { code: string }).code;
      const c = mode === "governors" ? (govs[code]?.party ? partyColor(govs[code].party) : null) : senate(code);
      return c ? withAlpha(c, 0.62) : "rgba(120,120,130,0.3)";
    } });
    app.looks?.setLegend({ emoji: "🏛️", name: mode === "governors" ? "Governor's party" : "Senate delegation", stops: mode === "governors" ? ["#e5484d", "#3b82f6"] : ["#e5484d", "#a855f7", "#3b82f6"], from: "Republican", to: "Democrat" });
  }
  if (mapMode !== mode) return;
  mapLayer = layer;
  app.globe.viewer.imageryLayers.add(layer);
  app.canvas.put({ id: "politics:map", label: mode === "governors" ? "Governors" : mode === "senate" ? "Senate delegations" : "Next elections", color: "#8b5fa8", scope: "world", pinned: true,
    show: (on) => { if (mapLayer) mapLayer.show = on; }, remove: () => void showMap(app, null) }, true);
}

function mapChips(app: App, us: boolean): HTMLElement {
  const box = h("div", { class: "fl-chips" });
  const chip = (mode: MapMode, label: string) => h("button", { class: `fl-chip${mapMode === mode ? " on" : ""}`, style: "--c:#8b5fa8", "aria-pressed": String(mapMode === mode), onclick: async () => { await showMap(app, mapMode === mode ? null : mode).catch(() => app.toast("Couldn't load that map just now.", 4000)); render(); } }, label);
  const render = () => box.replaceChildren(...(us ? [chip("governors", "States by governor"), chip("senate", "Senate by state")] : []), chip("elections", "World: next elections"));
  render();
  return h("section", { class: "group fl-group" }, h("h2", { class: "group-title" }, "On the map"), box);
}

// ---- The district outline -------------------------------------------------------------------------

let districtLayer: ImageryLayer | null = null;
function outline(app: App, rings: [number, number][][] | null) {
  if (districtLayer) { app.globe.viewer.imageryLayers.remove(districtLayer, true); districtLayer = null; }
  if (!rings?.length) return;
  let w = 180, s = 90, e = -180, n = -90;
  for (const r of rings) for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const bbox: [number, number, number, number] = [w, s, e, n];
  districtLayer = canvasLayer((ctx, t) => {
    if (!t.touches(bbox, 10)) return;
    ctx.beginPath();
    for (const r of rings) tracePath(ctx, t, Float32Array.from(r.flat()));
    ctx.fillStyle = "rgba(191, 90, 242, 0.14)";
    ctx.fill("evenodd");
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#8b5fa8";
    ctx.stroke();
  }, { maximumLevel: 14, credit: "Congressional districts: U.S. Census Bureau TIGERweb" });
  app.globe.viewer.imageryLayers.add(districtLayer);
}

// ---- The United States -----------------------------------------------------------------------------

async function unitedStates(app: App, place: Place, body: HTMLElement) {
  asyncBlock(app, body, "Reading Congress, the White House and the courts…", async () => {
    const [members, exec, court] = await Promise.all([congress(), whiteHouse(), supremeCourt().catch(() => [] as Person[])]);
    // Portraits for the White House from Wikidata where Congress has none.
    const pics = await portraits(exec.filter((p) => !p.photo && p.wikidata).map((p) => p.wikidata!)).catch(() => ({} as Record<string, string>));
    for (const p of exec) if (!p.photo && p.wikidata && pics[p.wikidata]) p.photo = pics[p.wikidata];
    const house = members.filter((m) => m.chamber === "rep" && !NON_VOTING.has(m.state));
    const senate = members.filter((m) => m.chamber === "sen");
    // The chamber's leaders in order of rank.
    const leaders = (list: Member[], ranks: string[]) => ranks.flatMap((title) => list.filter((m) => m.roles.includes(title)).map((m) => ({ ...m, office: title })));
    const houseCh: Chamber = { name: "House of Representatives", seats: 435, parties: tally(house.map((m) => m.party)), majority: 218, leaders: leaders(house, ["Speaker of the House", "House Majority Leader", "House Minority Leader"]),
      note: house.length < 435 ? `${435 - house.length} seat${435 - house.length === 1 ? "" : "s"} vacant. Six delegates (DC and the territories) sit without a vote.` : "Six delegates (DC and the territories) also sit, without a vote." };
    const senCh: Chamber = { name: "Senate", seats: 100, parties: tally(senate.map((m) => m.party)), majority: 51, leaders: leaders(senate, ["Senate Majority Leader", "Senate Minority Leader", "President Pro Tempore of the Senate"]),
      note: senate.some((m) => m.party === "Independent") ? `Independents caucus with the ${[...new Set(senate.filter((m) => m.party === "Independent").map((m) => m.caucus ?? "Democrat"))].join(" and ")}s. The Vice President breaks ties.` : "The Vice President breaks ties." };
    const indep: Record<string, string> = {};
    for (const m of senate) if (m.party === "Independent" && m.caucus) indep.Independent = m.caucus;
    const sControl = control(senCh.parties, 51, indep), hControl = control(houseCh.parties, 218);
    const president = exec.find((p) => p.office === "President");
    const lead: Leadership = {
      country: "United States", system: "Federal presidential republic", summary: usSummary(president?.party, sControl, hControl),
      executive: exec, legislature: [houseCh, senCh], judiciary: { name: "Supreme Court", members: court }, governing: president?.party,
      next: [nextUsElection(today())], sources: [],
    };
    return [
      h("div", { class: "pol-hero" }, h("small", {}, lead.system ?? ""), h("strong", {}, lead.summary ?? "")),
      section("The executive", h("div", { class: "pol-people big" }, ...lead.executive.map((p) => personCard(p, "big")))),
      section("Congress", arc(houseCh), arc(senCh)),
      court.length ? section("The Supreme Court", h("div", { class: "pol-people grid" }, ...court.map((p) => personCard(p)))) : "",
      section("Next election", ...lead.next.map(electionCard)),
    ];
  });
  // Your state and district.
  asyncBlock(app, body, "Finding your state and district…", async () => {
    const [district, members, govs] = await Promise.all([districtAt(place.lon, place.lat).catch(() => null), congress(), governors().catch(() => ({} as Record<string, Person>))]);
    const code = district ? postalOfFips(district.state) : null;
    if (!code) return [];
    outline(app, district?.rings ?? null);
    const senators = members.filter((m) => m.chamber === "sen" && m.state === code);
    const rep = members.find((m) => m.chamber === "rep" && m.state === code && (m.district === district!.district || (district!.district === 0 && m.district === 0)));
    const delegation = tally(members.filter((m) => m.chamber === "rep" && m.state === code).map((m) => m.party));
    const gov = govs[code];
    return [section(`${US_STATES[code][1]}`,
      h("div", { class: "pol-people" }, ...(gov ? [personCard({ ...gov, office: `Governor of ${US_STATES[code][1]}` })] : []), ...senators.map((m) => personCard(m))),
      rep ? h("div", { class: "pol-yours" }, h("span", { class: "pol-yours-label" }, district!.district === 0 ? "Your representative (at large)" : `Your representative · district ${district!.district}`), personCard(rep, "big")) : "",
      delegation.length ? h("div", { class: "pol-bar" }, ...delegation.map((b: Bloc) => h("i", { style: `flex:${b.seats};background:${b.color}`, title: `${b.party} ${b.seats}` })), h("small", {}, `${US_STATES[code][1]}'s House delegation: ${delegation.map((b) => `${b.seats} ${b.party}`).join(", ")}`)) : "",
    )];
  });
  body.append(note("Congress and the White House: @unitedstates congress-legislators (public domain, updated as members change) and official portraits. Governors and justices: Wikidata. Districts: U.S. Census Bureau TIGERweb."));
}

// ---- Everywhere else ---------------------------------------------------------------------------------

function elsewhere(app: App, code: string, name: string, body: HTMLElement) {
  asyncBlock(app, body, `Reading who governs ${name}…`, async () => {
    const [lead, next] = await Promise.all([leadershipOf(code, name), nextElections().catch(() => ({} as Record<string, Election[]>))]);
    const elections = next[code] ?? [];
    return [
      h("div", { class: "pol-hero" }, lead.system ? h("small", {}, lead.system) : "", h("strong", {}, lead.summary ?? `Who governs ${name}`)),
      lead.executive.length ? section("Who holds power", h("div", { class: "pol-people big" }, ...lead.executive.map((p) => personCard(p, "big")))) : "",
      lead.legislature.length ? section("The legislature", ...lead.legislature.map(arc)) : "",
      lead.judiciary ? section("The courts", h("p", { class: "small" }, lead.judiciary.name)) : "",
      lead.governing ? section("Governing party", h("span", { class: "pol-party big", style: `--c:${partyColor(lead.governing)}` }, lead.governing)) : "",
      section("Next election", ...(elections.length ? elections.map(electionCard) : [h("p", { class: "muted small" }, "No national election is listed yet.")])),
      note(lead.sources.join(" ")),
    ];
  });
}

export function politicsSubtab(): Subtab {
  return {
    id: "politics",
    label: "Politics",
    render({ app, place, body }) {
      asyncBlock(app, body, "Finding the country…", async () => {
        const c = await countryAt(place.lon, place.lat);
        const code = c ? iso3(c.id) : null;
        if (!c || !code) return [h("p", { class: "muted" }, "This spot isn't in a country (open sea, or a disputed area). Tap land to see who governs it.")];
        const out = h("div", {});
        if (code === "USA") void unitedStates(app, place, out);
        else elsewhere(app, code, c.name, out);
        return [mapChips(app, code === "USA"), out];
      });
    },
    leave(app) { outline(app, null); },
  };
}
