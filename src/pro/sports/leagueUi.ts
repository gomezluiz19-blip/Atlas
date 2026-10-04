// The league and organisation side of Sports Pro: starting a club from any
// real team (baseball's MLB and minor leagues live from MLB's Stats API, any
// other league from Wikidata), the club among its league rivals, its farm
// system or partner clubs with the players moving between them, and bringing
// in the season's schedule (live for baseball, a calendar file for anyone).
import { h } from "../../ui/dom";
import { geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import type { WorkFeature } from "../../work/layer";
import { newId } from "../../work/store";
import type { FlowLine } from "../../globe/flow";
import { addDays, fmt, kmBetween, kmText, today } from "../kit/ops";
import { arcFlow, empty, lines, list, row, title } from "../kit/ui";
import { pickFile } from "../kit/report";
import {
  baseballSchedule, baseballTeams, farmSystem, findLeague, findTeam, LEAGUE_PRESETS, leagueTeams, leagueTravel, LEVELS, moveRoutes, orgMoves, parseIcs, readMatchup,
  type LeagueTeam, type Move,
} from "./leagues";
import { blankClub, type Club, type Fixture } from "./model";

// ---- Caches (a session's worth) --------------------------------------------------------------------

let baseball: Promise<LeagueTeam[]> | null = null;
const leagues = new Map<string, Promise<LeagueTeam[]>>();
const ready = new Map<string, unknown>();
const pending = new Set<string>();

export const baseballAll = () => (baseball ??= baseballTeams().catch((e) => { baseball = null; throw e; }));
const leagueOf = (id: string) => { let p = leagues.get(id); if (!p) { p = leagueTeams(id); leagues.set(id, p); p.catch(() => leagues.delete(id)); } return p; };

/** The club's league rivals (baseball: same level and league), once loaded. */
function rivals(c: Club): Promise<LeagueTeam[]> {
  if (c.mlbId) return baseballAll().then((all) => { const me = all.find((t) => t.mlbId === c.mlbId); return all.filter((t) => t.sportId === (me?.sportId ?? c.sportId) && (!me?.league || t.league === me.league)); });
  return c.league ? leagueOf(c.league.id) : Promise.resolve([]);
}

/** The whole organisation: parent club and every affiliate (baseball, live), or the partner clubs set by hand. */
async function organisation(c: Club): Promise<{ parent: LeagueTeam; teams: LeagueTeam[] }> {
  const self: LeagueTeam = { id: c.mlbId ? `mlb:${c.mlbId}` : c.id, name: c.name, venue: c.ground.name, lon: c.ground.lon, lat: c.ground.lat, level: c.level, mlbId: c.mlbId, sportId: c.sportId };
  if (c.mlbId) {
    const all = await baseballAll();
    const me = all.find((t) => t.mlbId === c.mlbId) ?? self;
    const parent = me.parent ? all.find((t) => t.id === me.parent) ?? me : me;
    return { parent, teams: [parent, ...farmSystem(parent, all).map((x) => x.t)] };
  }
  return { parent: self, teams: [self, ...(c.affiliates ?? []).map((a) => ({ ...a }))] };
}

/** Loads something once and redraws when it arrives; returns it if already here. */
function once<T>(key: string, load: () => Promise<T>, redraw: () => void): T | "loading" | "failed" {
  if (ready.has(key)) return ready.get(key) as T | "failed";
  if (!pending.has(key)) {
    pending.add(key);
    load().then((v) => { ready.set(key, v); pending.delete(key); redraw(); }, () => { ready.set(key, "failed"); pending.delete(key); redraw(); });
  }
  return "loading";
}

/** Forget what's loaded for a club (after changing its league or partners). */
export const forget = (prefix: string) => { for (const k of [...ready.keys()]) if (k.startsWith(prefix)) ready.delete(k); };

// ---- Starting from a real team ---------------------------------------------------------------------

export function startFromTeam(ctx: WorkCtx, done: (c: Club) => void, back: () => void) {
  const out = h("div", {});
  const pickBaseball = async () => {
    out.replaceChildren(h("p", { class: "muted small" }, "Loading every MLB and minor-league club…"));
    const all = await baseballAll().catch(() => null);
    if (!all) { out.replaceChildren(h("p", { class: "muted small" }, "MLB's Stats API couldn't be reached. Try again in a moment.")); return; }
    const byLevel = [1, 11, 12, 13, 14, 16].map((s) => ({ s, teams: all.filter((t) => t.sportId === s).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.teams.length);
    out.replaceChildren(...byLevel.flatMap((g) => [title(`${LEVELS[g.s]} · ${g.teams.length} clubs`), list(...g.teams.map((t) => row("⚾", t.name, [t.venue, t.parent ? `affiliate of ${all.find((p) => p.id === t.parent)?.name ?? "an MLB club"}` : t.league].filter(Boolean).join(" · "), () => done(fromTeam(t, { id: "baseball", name: t.league ?? LEVELS[g.s] })))))]));
  };
  const pickLeague = async (name: string) => {
    out.replaceChildren(h("p", { class: "muted small" }, `Finding ${name}…`));
    const [hit] = await findLeague(name).catch(() => []);
    if (!hit) { out.replaceChildren(h("p", { class: "muted small" }, "Couldn't find that league.")); return; }
    const teams = await leagueOf(hit.id).catch(() => null);
    if (!teams?.length) { out.replaceChildren(h("p", { class: "muted small" }, `No current clubs with grounds on Wikidata for ${hit.label}.`)); return; }
    out.replaceChildren(title(`${hit.label} · ${teams.length} clubs`), list(...teams.map((t) => row("🏟", t.name, t.venue, () => done(fromTeam(t, { id: hit.id, name: hit.label }))))));
  };
  const search = h("input", { class: "pro-url", placeholder: "Any league: name it (Serie A, AHL, Kenyan Premier League…)", list: "sp-leagues" }) as HTMLInputElement;
  search.addEventListener("keydown", (e) => { if (e.key === "Enter" && search.value.trim()) void pickLeague(search.value.trim()); });
  ctx.show("Start from a real team", back,
    h("p", {}, "Pick your club: its ground, league rivals and (for baseball) its whole farm system and schedule come in live."),
    h("button", { class: "primary-btn", onclick: () => void pickBaseball() }, "⚾ Baseball: MLB and the minor leagues"),
    search, h("datalist", { id: "sp-leagues" }, ...LEAGUE_PRESETS.map((l) => h("option", { value: l }))),
    h("div", { class: "chips wrap" }, ...LEAGUE_PRESETS.slice(1, 13).map((l) => h("button", { class: "chip", onclick: () => void pickLeague(l) }, l.replace("National Basketball Association", "NBA").replace("National Hockey League", "NHL").replace("National Football League", "NFL").replace("Women's National Basketball Association", "WNBA").replace("National Women's Soccer League", "NWSL")))),
    out);
}

function fromTeam(t: LeagueTeam, league: { id: string; name: string }): Club {
  const c = blankClub(t.name, { name: t.venue || t.name, lon: t.lon, lat: t.lat }, 0, newId());
  c.sport = t.mlbId ? "Baseball" : c.sport;
  c.league = league;
  if (t.mlbId) { c.mlbId = t.mlbId; c.sportId = t.sportId; c.level = t.level; c.party = t.sportId === 1 ? 60 : 35; }
  c.ground.capacity = t.sportId === 1 ? 40_000 : t.sportId && t.sportId > 1 ? 7_000 : 20_000;
  return c;
}

// ---- The league view -------------------------------------------------------------------------------

export function leagueMap(c: Club, redraw: () => void): { features: WorkFeature[]; flows: FlowLine[] } {
  const got = once(`league:${c.mlbId ?? c.league?.id}`, () => rivals(c), redraw);
  if (got === "loading" || got === "failed") return { features: [], flows: [] };
  const teams = got as LeagueTeam[];
  const me = teams.find((t) => (c.mlbId ? t.mlbId === c.mlbId : kmBetween(t, c.ground) < 1));
  const features: WorkFeature[] = teams.map((t) => ({ id: `lt${t.id}`, kind: "point", pts: [[t.lon, t.lat]], color: t === me ? "#ff375f" : "#0a84ff", label: t.name.replace(/ \(demo\)/, "") }));
  const flows = me ? teams.filter((t) => t !== me).map((t) => arcFlow(`lf${t.id}`, me, t, "#64d2ff", 0.15).flow) : [];
  return { features, flows };
}

export function leaguePanel(c: Club, redraw: () => void, choose: () => void) {
  if (!c.league && !c.mlbId) return h("div", {}, empty("Tell Terreno which league the club plays in to see it among its rivals."), h("button", { class: "pill-btn", onclick: choose }, "Pick the league"));
  const got = once(`league:${c.mlbId ?? c.league?.id}`, () => rivals(c), redraw);
  if (got === "loading") return h("p", { class: "muted small" }, `Loading ${c.league?.name ?? "the league"}…`);
  if (got === "failed") return empty("The league couldn't be loaded just now.");
  const teams = got as LeagueTeam[];
  const lt = leagueTravel(teams);
  const mine = lt.rows.findIndex((r) => (c.mlbId ? r.t.mlbId === c.mlbId : kmBetween(r.t, c.ground) < 1));
  const me = lt.rows[mine];
  return h("div", {},
    lines(
      `${teams.length} clubs in ${c.league?.name ?? "the league"}. If every club visited every other once, the average club would travel ${fmt(lt.mean)} km.`,
      me ? `${c.name}: ${fmt(me.km)} km, ${mine + 1}${ordinal(mine + 1)} most of ${lt.rows.length} (${me.km > lt.mean ? "+" : ""}${Math.round(((me.km - lt.mean) / lt.mean) * 100)}% on the average). Nearest rival: ${me.nearest?.name}, ${kmText(me.nearestKm)}.` : "",
      lt.rows.length > 1 ? `Most travelled: ${lt.rows[0].t.name} (${fmt(lt.rows[0].km)} km); least: ${lt.rows[lt.rows.length - 1].t.name} (${fmt(lt.rows[lt.rows.length - 1].km)} km), ${lt.spread.toFixed(1)}× apart.` : ""),
    title("Travel across the league"),
    list(...lt.rows.map((r, i) => row({ color: i === mine ? "#ff375f" : "#0a84ff" }, `${i + 1}. ${r.t.name}`, `${fmt(r.km)} km · ${r.t.venue}`))),
    h("p", { class: "muted small" }, c.mlbId ? "Clubs, levels and ballparks live from MLB's Stats API." : "Clubs and grounds from Wikidata; a club missing its ground there won't show."));
}

const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");

// ---- The organisation view -------------------------------------------------------------------------

const MOVE_DAYS = 60;

export function orgMap(c: Club, redraw: () => void): { features: WorkFeature[]; flows: FlowLine[] } {
  const got = once(`org:${c.id}:${c.mlbId ?? ""}:${(c.affiliates ?? []).length}`, () => organisation(c), redraw) as { parent: LeagueTeam; teams: LeagueTeam[] } | "loading" | "failed";
  if (got === "loading" || got === "failed") return { features: [], flows: [] };
  const features: WorkFeature[] = got.teams.map((t) => ({ id: `ot${t.id}`, kind: "point", pts: [[t.lon, t.lat]], color: t.id === got.parent.id ? "#ff375f" : "#ff9f0a", label: `${t.level ? `${t.level} · ` : ""}${t.name}` }));
  const flows: FlowLine[] = [];
  for (const t of got.teams.slice(1)) features.push(arcFlow(`ol${t.id}`, got.parent, t, "#ff9f0a", 0.2, true).line);
  const mv = c.mlbId ? ready.get(`moves:${got.parent.id}`) : undefined;
  if (Array.isArray(mv)) {
    const byId = new Map(got.teams.map((t) => [t.id, t]));
    const routes = moveRoutes(mv as Move[], byId), most = Math.max(1, ...routes.map((r) => r.n));
    for (const r of routes) { const a = arcFlow(`mv${r.from}${r.to}`, r.a, r.b, "#0a84ff", r.n / most); flows.push(a.flow); }
  }
  return { features, flows };
}

export function orgPanel(ctx: WorkCtx, c: Club, redraw: () => void, save: () => void) {
  const got = once(`org:${c.id}:${c.mlbId ?? ""}:${(c.affiliates ?? []).length}`, () => organisation(c), redraw) as { parent: LeagueTeam; teams: LeagueTeam[] } | "loading" | "failed";
  if (got === "loading") return h("p", { class: "muted small" }, "Loading the organisation…");
  if (got === "failed") return empty("The organisation couldn't be loaded just now.");
  const { parent, teams } = got;
  const kids = teams.slice(1).map((t) => ({ t, km: kmBetween(parent, t) }));
  let movesBlock: HTMLElement | string = "";
  if (c.mlbId) {
    const key = `moves:${parent.id}`;
    const mv = once(key, () => orgMoves(teams.map((t) => t.mlbId!).filter(Boolean), addDays(today(), -MOVE_DAYS), today()), redraw);
    if (mv === "loading") movesBlock = h("p", { class: "muted small" }, "Loading call-ups, options and assignments…");
    else if (mv === "failed") movesBlock = empty("Moves couldn't be loaded just now.");
    else {
      const byId = new Map(teams.map((t) => [t.id, t]));
      const routes = moveRoutes(mv as Move[], byId);
      const km = routes.reduce((s, r) => s + r.km * r.n, 0);
      movesBlock = h("div", {},
        title(`Players moving, last ${MOVE_DAYS} days`),
        lines(`${(mv as Move[]).length} moves inside the organisation, ${fmt(km)} km between clubs.`, routes[0] ? `Busiest route: ${routes[0].a.name} → ${routes[0].b.name}, ${routes[0].n} ${routes[0].n === 1 ? "player" : "players"} (${kmText(routes[0].km)}).` : "No moves between organisation clubs in that time."),
        (mv as Move[]).length ? list(...(mv as Move[]).slice(0, 12).map((m) => row({ color: "#0a84ff" }, m.player, `${m.date} · ${m.kind} · ${byId.get(m.from)?.name ?? "?"} → ${byId.get(m.to)?.name ?? "?"}`))) : "");
    }
  }
  const box = h("input", { class: "pro-url", placeholder: "Add an affiliate or partner club (any sport, any country)" }) as HTMLInputElement;
  const add = async () => {
    const q = box.value.trim();
    if (!q) return;
    const t = await findTeam(q).catch(() => null) ?? await geocode(q).then(([r]) => (r ? { id: newId(), name: q, venue: r.detail ?? "", lon: r.lon, lat: r.lat } : null)).catch(() => null);
    if (!t) { ctx.app.toast("Couldn't find that club.", 3500); return; }
    (c.affiliates ??= []).push({ id: t.id, name: t.name, venue: t.venue, lon: t.lon, lat: t.lat });
    save(); redraw();
  };
  box.addEventListener("keydown", (e) => { if (e.key === "Enter") void add(); });
  return h("div", {},
    lines(
      kids.length ? `${parent.name} and ${kids.length} ${kids.length === 1 ? "affiliate" : "affiliates"}; on average ${kmText(kids.reduce((s, k) => s + k.km, 0) / kids.length)} from the parent club.` : "No affiliates or partner clubs yet.",
      kids.length ? `Furthest: ${[...kids].sort((a, b) => b.km - a.km)[0].t.name}, ${kmText([...kids].sort((a, b) => b.km - a.km)[0].km)}. A player called up from there crosses that in a day.` : ""),
    list(row({ color: "#ff375f" }, parent.name, [parent.level, parent.venue].filter(Boolean).join(" · ")),
      ...kids.map((k) => row({ color: "#ff9f0a" }, k.t.name, [k.t.level, k.t.venue, kmText(k.km)].filter(Boolean).join(" · ")))),
    movesBlock,
    !c.mlbId ? h("div", { class: "po-add" }, box, h("button", { class: "pill-btn", onclick: () => void add() }, "Add")) : "");
}

// ---- Bringing in the schedule ---------------------------------------------------------------------

export async function loadSchedule(c: Club): Promise<number> {
  if (c.mlbId) {
    const all = await baseballAll();
    const me = all.find((t) => t.mlbId === c.mlbId);
    if (!me) return 0;
    const y = new Date().getFullYear();
    const games = await baseballSchedule(me, `${y}-01-01`, `${y}-12-31`);
    const byVenue = new Map(all.map((t) => [t.venue, t]));
    c.fixtures = games.map((g) => {
      const v = g.home ? c.ground : byVenue.get(g.venue) ?? all.find((t) => t.name === g.opponent) ?? c.ground;
      return { id: newId(), date: g.date, opponent: g.opponent, home: g.home, venue: { name: g.venue || ("venue" in v ? (v as LeagueTeam).venue : v.name), lon: v.lon, lat: v.lat }, comp: me.level } satisfies Fixture;
    });
    return c.fixtures.length;
  }
  const text = await pickFile(".ics,text/calendar");
  if (!text) return 0;
  const events = parseIcs(text);
  const teams = c.league ? await leagueOf(c.league.id).catch(() => []) : [];
  const places = new Map<string, { lon: number; lat: number } | null>();
  const out: Fixture[] = [];
  for (const e of events) {
    const m = readMatchup(e.summary, c.name);
    let venue = { name: c.ground.name, lon: c.ground.lon, lat: c.ground.lat };
    if (!m.home) {
      const rival = teams.find((t) => t.name.toLowerCase().includes(m.opponent.toLowerCase()) || m.opponent.toLowerCase().includes(t.name.toLowerCase()));
      if (rival) venue = { name: rival.venue || rival.name, lon: rival.lon, lat: rival.lat };
      else if (e.location) {
        if (!places.has(e.location) && places.size < 40) places.set(e.location, await geocode(e.location).then(([r]) => (r ? { lon: r.lon, lat: r.lat } : null)).catch(() => null));
        const p = places.get(e.location);
        if (p) venue = { name: e.location, ...p };
      }
    }
    out.push({ id: newId(), date: e.date, opponent: m.opponent, home: m.home, venue });
  }
  c.fixtures = out;
  return out.length;
}
