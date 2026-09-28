// "World Summit": a turn-based international relations game for a class,
// played over days or weeks. Each team leads a real country; every turn they
// choose policies (trade, aid, alliances, sanctions, investment, the
// environment…), the world throws events at them, and the map shows who is
// allied, trading or at odds. There's no single winner: the debrief asks what
// trade-offs each team made.

export interface Nation {
  id: string;
  name: string;
  team: string;
  color: string;
  lon: number;
  lat: number;
  economy: number;
  security: number;
  stability: number;
  environment: number;
  influence: number;
  treasury: number;
}

export type ActionId = "invest" | "education" | "green" | "military" | "trade" | "aid" | "alliance" | "sanction" | "summit";

export interface Choice { action: ActionId; target?: string }

export interface SimState {
  id: string;
  name: string;
  turn: number;
  maxTurns: number;
  nations: Nation[];
  /** Relations between two nations, −100 to 100, keyed "a|b" (sorted ids). */
  relations: Record<string, number>;
  alliances: string[];
  trade: string[];
  /** Sanctions, "from>to". */
  sanctions: string[];
  news: { turn: number; text: string; tone: "good" | "bad" | "neutral" }[];
  seed: number;
}

export const ACTIONS: Record<ActionId, { label: string; about: string; cost: number; target?: boolean }> = {
  invest: { label: "Build infrastructure", about: "Roads, ports and power: economy up over time", cost: 12 },
  education: { label: "Schools and health", about: "Stability up; pays off slowly", cost: 10 },
  green: { label: "Green transition", about: "Environment up a lot, economy down a little for now", cost: 12 },
  military: { label: "Strengthen defence", about: "Security up; neighbours grow wary", cost: 12 },
  trade: { label: "Trade deal with…", about: "Both economies grow; relations improve", cost: 3, target: true },
  aid: { label: "Send aid to…", about: "Costs money; wins friends and influence", cost: 10, target: true },
  alliance: { label: "Propose an alliance with…", about: "Needs good relations; security for both", cost: 4, target: true },
  sanction: { label: "Sanction…", about: "Hurts their economy (and a little yours); relations fall", cost: 2, target: true },
  summit: { label: "Host a peace summit", about: "Relations with everyone improve; influence up", cost: 8 },
};

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function newGame(id: string, name: string, teams: { team: string; name: string; color: string; lon: number; lat: number }[], maxTurns = 8, seed = Date.now() % 1e9): SimState {
  const r = rng(seed);
  const nations: Nation[] = teams.map((t, i) => ({
    id: `n${i}`, name: t.name, team: t.team, color: t.color, lon: t.lon, lat: t.lat,
    economy: 45 + Math.round(r() * 20), security: 45 + Math.round(r() * 20), stability: 50 + Math.round(r() * 15), environment: 40 + Math.round(r() * 25), influence: 20 + Math.round(r() * 15), treasury: 40,
  }));
  const relations: Record<string, number> = {};
  for (const a of nations) for (const b of nations) if (a.id < b.id) relations[pairKey(a.id, b.id)] = Math.round(r() * 40 - 15);
  return { id, name, turn: 1, maxTurns, nations, relations, alliances: [], trade: [], sanctions: [], news: [{ turn: 0, text: `${nations.length} nations meet for the first World Summit.`, tone: "neutral" }], seed };
}

/** How well a nation is doing overall (for the standings; not the only thing that matters). */
export const wellbeing = (n: Nation) => Math.round((n.economy + n.security + n.stability + n.environment) / 4 + n.influence * 0.2);

interface GameEvent { text: (a: Nation, b?: Nation) => string; tone: "good" | "bad"; pair?: boolean; apply: (s: SimState, a: Nation, b?: Nation) => void }

const EVENTS: GameEvent[] = [
  { tone: "bad", text: (a) => `Drought hits ${a.name}: harvests fail.`, apply: (_s, a) => { a.economy -= a.environment < 45 ? 8 : 4; a.stability -= 5; } },
  { tone: "bad", text: (a) => `Floods in ${a.name} damage roads and homes.`, apply: (_s, a) => { a.economy -= 5; a.stability -= 3; a.treasury -= 6; } },
  { tone: "bad", text: (a) => `Protests in ${a.name} over the cost of living.`, apply: (_s, a) => { a.stability -= a.economy < 45 ? 9 : 4; } },
  { tone: "good", text: (a) => `${a.name} discovers new mineral deposits.`, apply: (_s, a) => { a.economy += 6; a.treasury += 10; a.environment -= 3; } },
  { tone: "good", text: (a) => `A tech boom in ${a.name}'s universities.`, apply: (_s, a) => { a.economy += 5; a.influence += 3; } },
  { tone: "good", text: (a) => `Tourism soars in ${a.name}.`, apply: (_s, a) => { a.economy += 4; a.influence += 2; } },
  { tone: "bad", pair: true, text: (a, b) => `A border dispute flares between ${a.name} and ${b!.name}.`, apply: (s, a, b) => {
    const k = pairKey(a.id, b!.id);
    if (!s.alliances.includes(k)) { s.relations[k] = (s.relations[k] ?? 0) - 15; a.security -= 3; b!.security -= 3; }
  } },
  { tone: "bad", pair: true, text: (a, b) => `Refugees cross from ${a.name} into ${b!.name}.`, apply: (_s, a, b) => { a.stability -= 4; b!.stability -= 2; b!.treasury -= 4; } },
  { tone: "good", pair: true, text: (a, b) => `Scientists from ${a.name} and ${b!.name} share a medical breakthrough.`, apply: (s, a, b) => { s.relations[pairKey(a.id, b!.id)] = (s.relations[pairKey(a.id, b!.id)] ?? 0) + 10; a.stability += 3; b!.stability += 3; } },
];

const GLOBAL: { text: string; tone: "good" | "bad"; apply: (s: SimState) => void }[] = [
  { tone: "bad", text: "Oil prices spike worldwide.", apply: (s) => s.nations.forEach((n) => { n.economy -= n.environment > 60 ? 1 : 4; }) },
  { tone: "bad", text: "A pandemic spreads across borders.", apply: (s) => s.nations.forEach((n) => { n.economy -= 4; n.stability -= n.stability > 60 ? 1 : 4; }) },
  { tone: "good", text: "World trade booms.", apply: (s) => s.nations.forEach((n) => { n.economy += 2 + s.trade.filter((k) => k.split("|").includes(n.id)).length * 2; }) },
  { tone: "bad", text: "A record heatwave: the climate is changing.", apply: (s) => s.nations.forEach((n) => { n.stability -= n.environment < 40 ? 5 : 1; }) },
  { tone: "good", text: "A quiet year: markets are calm.", apply: () => {} },
];

/** Plays one turn: every nation's choices, then events, then the slow pull of time. Pure: returns a new state. */
export function resolveTurn(prev: SimState, choices: Record<string, Choice[]>): SimState {
  const s: SimState = JSON.parse(JSON.stringify(prev));
  const r = rng(s.seed + s.turn * 7919);
  const byId = (id?: string) => s.nations.find((n) => n.id === id);
  const rel = (a: string, b: string, d: number) => { const k = pairKey(a, b); s.relations[k] = clamp((s.relations[k] ?? 0) + d, -100, 100); };
  const news = (text: string, tone: "good" | "bad" | "neutral") => s.news.push({ turn: s.turn, text, tone });

  for (const n of s.nations) {
    for (const c of (choices[n.id] ?? []).slice(0, 2)) {
      const a = ACTIONS[c.action];
      const t = byId(c.target);
      if (!a || (a.target && (!t || t.id === n.id))) continue;
      if (n.treasury < a.cost) { news(`${n.name} can't afford to ${a.label.toLowerCase().replace(/…$/, "")}.`, "neutral"); continue; }
      n.treasury -= a.cost;
      switch (c.action) {
        case "invest": n.economy += 6; n.environment -= 2; news(`${n.name} builds new ports and power lines.`, "good"); break;
        case "education": n.stability += 5; n.economy += 1; news(`${n.name} opens schools and clinics.`, "good"); break;
        case "green": n.environment += 9; n.economy -= 2; n.influence += 2; news(`${n.name} bets on wind, solar and forests.`, "good"); break;
        case "military":
          n.security += 8;
          for (const o of s.nations) if (o.id !== n.id && !s.alliances.includes(pairKey(n.id, o.id))) rel(n.id, o.id, -3);
          news(`${n.name} expands its armed forces; neighbours are uneasy.`, "neutral");
          break;
        case "trade": {
          const k = pairKey(n.id, t!.id);
          if ((s.relations[k] ?? 0) < -30 || s.sanctions.includes(`${t!.id}>${n.id}`) || s.sanctions.includes(`${n.id}>${t!.id}`)) { news(`${t!.name} turns down a trade deal with ${n.name}.`, "bad"); break; }
          if (!s.trade.includes(k)) s.trade.push(k);
          n.economy += 4; t!.economy += 3; rel(n.id, t!.id, 10);
          news(`${n.name} and ${t!.name} sign a trade deal.`, "good");
          break;
        }
        case "aid": t!.stability += 5; t!.economy += 3; n.influence += 5; rel(n.id, t!.id, 15); news(`${n.name} sends aid to ${t!.name}.`, "good"); break;
        case "alliance": {
          const k = pairKey(n.id, t!.id);
          if ((s.relations[k] ?? 0) < 30) { news(`${t!.name} isn't ready for an alliance with ${n.name}.`, "neutral"); rel(n.id, t!.id, 3); break; }
          if (!s.alliances.includes(k)) s.alliances.push(k);
          n.security += 5; t!.security += 5; rel(n.id, t!.id, 10);
          news(`${n.name} and ${t!.name} form an alliance.`, "good");
          break;
        }
        case "sanction": {
          const k = `${n.id}>${t!.id}`;
          if (!s.sanctions.includes(k)) s.sanctions.push(k);
          s.trade = s.trade.filter((x) => x !== pairKey(n.id, t!.id));
          s.alliances = s.alliances.filter((x) => x !== pairKey(n.id, t!.id));
          t!.economy -= 6; n.economy -= 1; rel(n.id, t!.id, -25);
          news(`${n.name} puts sanctions on ${t!.name}.`, "bad");
          break;
        }
        case "summit": for (const o of s.nations) if (o.id !== n.id) rel(n.id, o.id, 5); n.influence += 6; news(`${n.name} hosts a peace summit.`, "good"); break;
      }
    }
  }

  // The world happens.
  const g = GLOBAL[Math.floor(r() * GLOBAL.length)];
  g.apply(s);
  news(g.text, g.tone);
  for (const n of s.nations) {
    if (r() > 0.4) continue;
    const pool = s.nations.length > 1 ? EVENTS : EVENTS.filter((e) => !e.pair);
    const e = pool[Math.floor(r() * pool.length)];
    const others = s.nations.filter((o) => o.id !== n.id);
    const b = e.pair ? others[Math.floor(r() * others.length)] : undefined;
    e.apply(s, n, b);
    news(e.text(n, b), e.tone);
  }

  // Time: income, trade and alliances pay, sanctions bite, and old grudges fade a little.
  for (const n of s.nations) {
    const partners = s.trade.filter((k) => k.split("|").includes(n.id)).length;
    const sanctioned = s.sanctions.filter((k) => k.endsWith(`>${n.id}`)).length;
    n.economy += partners * 1.5 - sanctioned * 2;
    n.treasury += Math.round(8 + n.economy / 8);
    if (n.economy < 35) n.stability -= 2;
    if (n.security < 30) n.stability -= 2;
    for (const k of ["economy", "security", "stability", "environment", "influence"] as const) n[k] = Math.round(clamp(n[k]));
    n.treasury = Math.max(0, Math.round(n.treasury));
  }
  for (const k of Object.keys(s.relations)) s.relations[k] = Math.round(s.relations[k] * 0.95);
  s.turn += 1;
  return s;
}

/** Questions for the debrief at the end of the game. */
export const DEBRIEF = [
  "Which choice helped your country most? Which one would you undo?",
  "When did cooperating pay off, and when did it cost you?",
  "Did sanctions change anyone's behaviour? Who paid the price?",
  "How did events you couldn't control (droughts, pandemics) change your plans?",
  "Which real countries or alliances did the game remind you of?",
];
