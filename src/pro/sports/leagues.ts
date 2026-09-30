// Leagues and organisations, live. Baseball from MLB's public Stats API: every
// MLB club and its minor-league affiliates (Triple-A to Single-A and the
// complex leagues) with their ballparks, schedules and the moves between them
// (call-ups, options, assignments). Every other league (NBA and the G League,
// NHL, AHL and ECHL, NFL, MLS and USL, the NWSL, the Premier League, Liga MX,
// the IPL…) from Wikidata: its current clubs and their home grounds. Pure
// helpers for league-wide travel and farm systems at the bottom.
import { getJson } from "../../data/http";
import { kmBetween } from "../kit/ops";

export interface LeagueTeam { id: string; name: string; venue: string; lon: number; lat: number; level?: string; league?: string; parent?: string; mlbId?: number; sportId?: number }

// ---- Baseball: MLB and MiLB ------------------------------------------------------------------------

const MLB = "https://statsapi.mlb.com/api/v1";
export const LEVELS: Record<number, string> = { 1: "MLB", 11: "Triple-A", 12: "Double-A", 13: "High-A", 14: "Single-A", 16: "Rookie" };
const LEVEL_ORDER = [1, 11, 12, 13, 14, 16];

interface MlbTeam {
  id: number; name: string; active?: boolean; sport?: { id: number }; parentOrgId?: number; league?: { name?: string };
  venue?: { id: number; name: string; location?: { defaultCoordinates?: { latitude: number; longitude: number } } };
}

/** Every affiliated club this season with its level, parent club and ballpark. */
export async function baseballTeams(season = new Date().getFullYear()): Promise<LeagueTeam[]> {
  const body = await getJson<{ teams: MlbTeam[] }>("MLB Stats API", `${MLB}/teams?sportIds=${LEVEL_ORDER.join(",")}&season=${season}&hydrate=venue(location)`);
  const teams = body.teams.filter((t) => t.active !== false);
  // Some ballparks come without coordinates on the teams call: fetch those venues directly.
  const missing = teams.filter((t) => t.venue && !t.venue.location?.defaultCoordinates).map((t) => t.venue!.id);
  const coords = new Map<number, { latitude: number; longitude: number }>();
  if (missing.length) {
    const v = await getJson<{ venues: { id: number; location?: { defaultCoordinates?: { latitude: number; longitude: number } } }[] }>("MLB Stats API",
      `${MLB}/venues?venueIds=${[...new Set(missing)].join(",")}&hydrate=location`).catch(() => ({ venues: [] }));
    for (const x of v.venues) if (x.location?.defaultCoordinates) coords.set(x.id, x.location.defaultCoordinates);
  }
  return readBaseball(teams, coords);
}

/** Stats API teams to league teams, dropping any without a ballpark location (pure). */
export function readBaseball(teams: MlbTeam[], extra = new Map<number, { latitude: number; longitude: number }>()): LeagueTeam[] {
  return teams.flatMap((t) => {
    const c = t.venue?.location?.defaultCoordinates ?? (t.venue ? extra.get(t.venue.id) : undefined);
    if (!c || !t.venue) return [];
    const sportId = t.sport?.id ?? 1;
    return [{ id: `mlb:${t.id}`, mlbId: t.id, name: t.name, venue: t.venue.name, lon: c.longitude, lat: c.latitude, sportId, level: LEVELS[sportId] ?? "Minors", league: t.league?.name, parent: t.parentOrgId ? `mlb:${t.parentOrgId}` : undefined }];
  });
}

export interface MlbGame { date: string; home: boolean; opponent: string; venue: string; venueId: number }

/** A club's games in a date range, from its point of view. */
export async function baseballSchedule(team: LeagueTeam, start: string, end: string): Promise<MlbGame[]> {
  const body = await getJson<{ dates: { date: string; games: { teams: { home: { team: { id: number; name: string } }; away: { team: { id: number; name: string } } }; venue: { id: number; name: string } }[] }[] }>("MLB Stats API",
    `${MLB}/schedule?sportId=${team.sportId ?? 1}&teamId=${team.mlbId}&startDate=${start}&endDate=${end}`);
  return readSchedule(body.dates, team.mlbId!);
}

/** Stats API schedule to games, one per day and venue (doubleheaders count once for travel; pure). */
export function readSchedule(dates: { date: string; games: { teams: { home: { team: { id: number; name: string } }; away: { team: { id: number; name: string } } }; venue: { id: number; name: string } }[] }[], teamId: number): MlbGame[] {
  const out: MlbGame[] = [];
  for (const d of dates) for (const g of d.games) {
    const home = g.teams.home.team.id === teamId;
    if (out.some((x) => x.date === d.date && x.venueId === g.venue.id)) continue;
    out.push({ date: d.date, home, opponent: home ? g.teams.away.team.name : g.teams.home.team.name, venue: g.venue.name, venueId: g.venue.id });
  }
  return out;
}

export interface Move { date: string; player: string; from: string; to: string; kind: string }

/** Players moving between a club's organisation teams in a date range (call-ups, options, assignments). */
export async function orgMoves(teamIds: number[], start: string, end: string): Promise<Move[]> {
  const all = await Promise.all(teamIds.map((id) => getJson<{ transactions: { date?: string; effectiveDate?: string; person?: { fullName: string }; fromTeam?: { id: number }; toTeam?: { id: number }; typeDesc?: string }[] }>("MLB Stats API",
    `${MLB}/transactions?teamId=${id}&startDate=${start}&endDate=${end}`).then((b) => b.transactions).catch(() => [])));
  return readMoves(all.flat(), new Set(teamIds));
}

/** Transactions to moves inside the organisation, each once (pure). */
export function readMoves(ts: { date?: string; effectiveDate?: string; person?: { fullName: string }; fromTeam?: { id: number }; toTeam?: { id: number }; typeDesc?: string }[], inOrg: Set<number>): Move[] {
  const seen = new Set<string>(), out: Move[] = [];
  for (const t of ts) {
    if (!t.person || !t.fromTeam || !t.toTeam || t.fromTeam.id === t.toTeam.id) continue;
    if (!inOrg.has(t.fromTeam.id) || !inOrg.has(t.toTeam.id)) continue;
    const date = (t.effectiveDate ?? t.date ?? "").slice(0, 10), key = `${t.person.fullName}|${t.fromTeam.id}|${t.toTeam.id}|${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, player: t.person.fullName, from: `mlb:${t.fromTeam.id}`, to: `mlb:${t.toTeam.id}`, kind: t.typeDesc ?? "Moved" });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---- Any league: Wikidata --------------------------------------------------------------------------

/** Leagues people ask for most; searched by name so they stay current. */
export const LEAGUE_PRESETS = [
  "Major League Baseball", "National Basketball Association", "NBA G League", "Women's National Basketball Association", "National Hockey League",
  "American Hockey League", "ECHL", "National Football League", "Major League Soccer", "MLS Next Pro", "USL Championship", "National Women's Soccer League",
  "Premier League", "EFL Championship", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "Liga MX", "Campeonato Brasileiro Série A", "Argentine Primera División",
  "Indian Premier League", "Nigeria Professional Football League", "South African Premiership", "Egyptian Premier League", "J1 League", "K League 1", "A-League Men",
];

export async function findLeague(name: string): Promise<{ id: string; label: string; description?: string }[]> {
  const b = await getJson<{ search: { id: string; label: string; description?: string }[] }>("Wikidata",
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&limit=6&format=json&origin=*`);
  return b.search.map((s) => ({ id: s.id, label: s.label, description: s.description }));
}

/** A league's current clubs and their home grounds. */
export async function leagueTeams(qid: string): Promise<LeagueTeam[]> {
  const q = `SELECT ?team ?teamLabel ?venueLabel ?coord WHERE {
  ?team p:P118 ?st. ?st ps:P118 wd:${qid}.
  FILTER NOT EXISTS { ?st pq:P582 ?end }
  FILTER NOT EXISTS { ?team wdt:P576 ?gone }
  ?team p:P115 ?vs. ?vs ps:P115 ?venue. FILTER NOT EXISTS { ?vs pq:P582 ?vend }
  ?venue wdt:P625 ?coord.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
} LIMIT 600`;
  const b = await getJson<{ results: { bindings: Record<string, { value: string }>[] } }>("Wikidata",
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json" } }, 30_000);
  return readLeague(b.results.bindings);
}

/** SPARQL rows to teams, one per club (its first current ground; pure). */
export function readLeague(rows: Record<string, { value: string }>[]): LeagueTeam[] {
  const out = new Map<string, LeagueTeam>();
  for (const r of rows) {
    const id = r.team?.value.split("/").pop();
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coord?.value ?? "");
    if (!id || !m || out.has(id) || /^Q\d+$/.test(r.teamLabel?.value ?? "")) continue;
    out.set(id, { id, name: r.teamLabel.value, venue: r.venueLabel?.value ?? "", lon: Number(m[1]), lat: Number(m[2]) });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Any one club by name (for adding an affiliate or partner club from any sport). */
export async function findTeam(name: string): Promise<LeagueTeam | null> {
  const hits = await findLeague(name);
  for (const h of hits.slice(0, 3)) {
    const q = `SELECT ?venueLabel ?coord WHERE { OPTIONAL { wd:${h.id} wdt:P115 ?venue. ?venue wdt:P625 ?coord. } OPTIONAL { wd:${h.id} wdt:P159 ?hq. ?hq wdt:P625 ?c2. } BIND(COALESCE(?coord, ?c2) AS ?coord) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } } LIMIT 1`;
    const b = await getJson<{ results: { bindings: Record<string, { value: string }>[] } }>("Wikidata", `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json" } }).catch(() => null);
    const r = b?.results.bindings[0], m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r?.coord?.value ?? "");
    if (m) return { id: h.id, name: h.label, venue: r?.venueLabel?.value ?? "", lon: Number(m[1]), lat: Number(m[2]) };
  }
  return null;
}

// ---- Pure helpers ----------------------------------------------------------------------------------

/**
 * League-wide travel if every club visits every other once (a balanced
 * schedule, each visit a round trip from home), most-travelled first (pure).
 */
export function leagueTravel(teams: LeagueTeam[]) {
  const rows = teams.map((t) => {
    const others = teams.filter((o) => o.id !== t.id);
    const km = others.reduce((s, o) => s + 2 * kmBetween(t, o), 0);
    const nearest = [...others].sort((a, b) => kmBetween(t, a) - kmBetween(t, b))[0];
    return { t, km, nearest, nearestKm: nearest ? kmBetween(t, nearest) : 0 };
  }).sort((a, b) => b.km - a.km);
  const mean = rows.reduce((s, r) => s + r.km, 0) / Math.max(1, rows.length);
  return { rows, mean, spread: rows.length ? rows[0].km / Math.max(1, rows[rows.length - 1].km) : 1 };
}

/** A parent club's affiliates by level, each with its distance from the parent (pure). */
export function farmSystem(parent: LeagueTeam, all: LeagueTeam[]) {
  const kids = all.filter((t) => t.parent === parent.id);
  return kids.map((t) => ({ t, km: kmBetween(parent, t) })).sort((a, b) => LEVEL_ORDER.indexOf(a.t.sportId ?? 16) - LEVEL_ORDER.indexOf(b.t.sportId ?? 16));
}

/** Moves between organisation teams, grouped by route with counts and kilometres (pure). */
export function moveRoutes(moves: Move[], teams: Map<string, { lon: number; lat: number; name: string }>) {
  const m = new Map<string, { from: string; to: string; n: number; players: string[] }>();
  for (const x of moves) {
    const k = `${x.from}>${x.to}`;
    const r = m.get(k) ?? { from: x.from, to: x.to, n: 0, players: [] };
    r.n++; r.players.push(x.player);
    m.set(k, r);
  }
  return [...m.values()].flatMap((r) => { const a = teams.get(r.from), b = teams.get(r.to); return a && b ? [{ ...r, a, b, km: kmBetween(a, b) }] : []; }).sort((a, b) => b.n - a.n);
}

// ---- Calendars ------------------------------------------------------------------------------------

export interface CalGame { date: string; summary: string; location?: string }

/** Games from an iCalendar file (most clubs publish one; pure). */
export function parseIcs(text: string): CalGame[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const out: CalGame[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const get = (k: string) => new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, "m").exec(block)?.[1]?.trim().replace(/\\,/g, ",").replace(/\\n/g, " ");
    const dt = get("DTSTART");
    if (!dt) continue;
    const date = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
    out.push({ date, summary: get("SUMMARY") ?? "Game", location: get("LOCATION") || undefined });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** From a game's title: is the club at home, and who's the opponent? ("Club at Rival", "Rival @ Club", "Club vs Rival"; pure). */
export function readMatchup(summary: string, club: string): { home: boolean; opponent: string } {
  const s = summary.replace(/\s+/g, " ").trim(), me = club.toLowerCase().replace(/\s*\(demo\)/, "");
  const at = /^(.*?)\s+(?:at|@)\s+(.*)$/i.exec(s);
  if (at) {
    const [, away, host] = at;
    const iAmHost = host.toLowerCase().includes(me) || me.includes(host.toLowerCase().trim());
    return { home: iAmHost, opponent: (iAmHost ? away : host).trim() };
  }
  const vs = /^(.*?)\s+(?:vs\.?|v\.?)\s+(.*)$/i.exec(s);
  if (vs) { const [, a, b] = vs; const first = a.toLowerCase().includes(me) || me.includes(a.toLowerCase().trim()); return { home: first, opponent: (first ? b : a).trim() }; }
  return { home: true, opponent: s };
}
