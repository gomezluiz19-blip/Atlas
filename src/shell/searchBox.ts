// The search box: places Terreno knows by name, curated sites, things it can show or open, people, guides and
// lenses, years, and plain-language requests (log a note, plan a trip, ask the map, or a task for the robot).
import { Cartesian3 } from "cesium";
import type { App } from "../app";
import { describe as describeCriterion, looksLikeSearch, parseQuery, type Criterion } from "../answers/criteria";
import { MINES } from "../content/minerals";
import { SITES } from "../content/sites";
import { searchLocal, type Feeds } from "../explore/feeds";
import type { Overlays } from "../globe/overlays";
import { allLenses } from "../lenses/library";
import { planLog } from "../myplaces/logAny";
import { searchPlaces } from "../place/places";
import { aiOn, looksLikeAsk } from "../robot/llm";
import { plan } from "../robot/plan";
import { describe } from "../robot/run";
import { allProfiles, searchProfiles } from "../social/store";
import { yearName } from "../time/model";
import { findThings, scoreThing, tokens, type Thing } from "../ui/frontDoor";
import { iconSvg } from "../ui/glyph";
import { icons } from "../ui/icons";
import type { createRobot } from "../ui/robotCard";
import { createSearch, type Command, type Place as SearchPlace, type SearchResult } from "../ui/search";
import type { createWork } from "../work/hub";
import { describeDrafts, parseSteps } from "../work/journeyModel";

type Hub = ReturnType<typeof createWork>;

export interface SearchDeps {
  app: App;
  feeds: Feeds;
  overlays: Overlays;
  robot: ReturnType<typeof createRobot>;
  closePanels(keep?: HTMLElement): void;
  makeHub: Hub;
  lookHub: Hub;
  openPlace(slug: string): Promise<void>;
  pick(p: SearchPlace | SearchResult): void;
  goToYear(year: number): void;
  /** Everything Terreno can show or open, built once. */
  things(): Thing[];
}

export function wireSearch(d: SearchDeps) {
  const { app, feeds, overlays, robot, closePanels, makeHub, lookHub, openPlace } = d;
  const globe = app.globe;
  /** Curated sites whose name starts a word with the query. */
  const siteMatches = (q: string): SearchResult[] => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const mines = MINES.map((m) => ({ name: m.name, where: `${m.country} · mine`, why: m.note, lon: m.lon, lat: m.lat, radius: 4000 }));
    return [...Object.values(SITES).flat().flatMap((c) => c.sites), ...mines]
      .filter((s) => s.name.toLowerCase().startsWith(needle) || s.name.toLowerCase().split(/[\s/–-]+/).some((w) => w.startsWith(needle)))
      .slice(0, 3)
      .map((s) => ({ name: s.name, detail: `${s.where} · ${s.why}`, lon: s.lon, lat: s.lat, radius: s.radius, source: "local" as const, icon: "target" as const }));
  };

  /** "Daisy had twins", "sprayed Top field" or "Oak Street: slab poured" typed into the search box. */
  const logCommand = (q: string): Command | null => {
    const plan = planLog(q);
    return plan ? { title: `Log for ${plan.tool}: ${plan.summary}`, steps: [plan.saves], run: () => void plan.run().then((r) => app.toast(r ? `Logged: ${r}` : "Couldn't log that.", 4000)) } : null;
  };

  /** A trip typed into the search box: "fly to Manila, taxi to the Peninsula, stay 3 nights". */
  const tripCommand = (q: string): Command | null => {
    const d = parseSteps(q);
    if (d.length < 2 || !d.some((x) => x.kind === "move" || x.kind === "stay")) return null;
    return { title: "Plan this trip", steps: [describeDrafts(d)], run: () => {
      closePanels(makeHub.panel);
      makeHub.ctx.open();
      void import("../work/planUi").then((m) => m.tripFromText(makeHub.ctx, q)).catch(() => app.toast("Couldn't load the planner. Check the connection and try again.", 5000));
    } };
  };

  /** "Flat land under 800 m near an airport": a question for every place on screen at once. */
  const askMap = (q?: string) => {
    closePanels(lookHub.panel);
    lookHub.ctx.open();
    void import("../answers/ui").then((m) => m.openAsk(lookHub.ctx, q)).catch(() => app.toast("Couldn't load that tool. Check the connection and try again.", 5000));
  };
  app.actions.set("answers:ask", { label: "Ask the map", run: (q) => askMap(q) });
  /** "Places like this": step back to see the region around the place, then answer. */
  app.actions.set("answers:preset", { label: "Places like this", run: (json) => {
    if (!json) return;
    const preset = JSON.parse(json) as { title: string; criteria: Criterion[]; exclude?: [number, number] };
    const at = app.place;
    const answer = () => {
      closePanels(lookHub.panel);
      lookHub.ctx.open();
      void import("../answers/ui").then((m) => m.openAsk(lookHub.ctx, undefined, preset)).catch(() => app.toast("Couldn't load that tool. Check the connection and try again.", 5000));
    };
    if (!at) { answer(); return; }
    globe.viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(at.lon, at.lat, 1_400_000), duration: 1.6, complete: answer, cancel: answer });
  } });
  const answerCommand = (q: string): Command | null => {
    if (!looksLikeSearch(q)) return null;
    return { title: "Answer on the map", steps: parseQuery(q).criteria.map(describeCriterion), run: () => askMap(q) };
  };

  const iconOfKind = (k: string) => (k === "peak" || k === "range" || k === "volcano" ? "mountain" as const : k === "water" || k === "sea" || k === "waterfall" ? "drop" as const : k === "city" || k === "capital" ? "building" as const : "target" as const);

  const asCommand = (q: string): Command | null => {
    const logged = logCommand(q);
    if (logged) return logged;
    const trip = tripCommand(q);
    if (trip) return trip;
    const answer = answerCommand(q);
    if (answer) return answer;
    const p = plan(q);
    // With Claude connected, anything that reads as a request or question goes to it.
    if (aiOn() && looksLikeAsk(q)) return { title: "Ask Terreno AI", steps: [p.steps.length ? describe(p).join(" → ") : "Claude will work out the steps"], run: () => void robot.ask(q.trim(), p.steps.length ? p : null) };
    if (!p.steps.length) return null;
    const steps = describe(p);
    return { title: steps.length === 1 ? steps[0] : `Do ${steps.length} things`, steps, run: () => void robot.run(q.trim(), p) };
  };

  document.getElementById("search-slot")!.replaceWith(createSearch(app.globe, {
    command: asCommand,
    examples: [
      "Find flat, sunny land under 800 m near an airport, low flood risk",
      "Where does rain go in downtown Chicago, and show the storm drains",
      "Railways and power plants near Munich",
    ],
    onPick: d.pick,
    local: (q) => [
      // Places Terreno knows by name open their page.
      ...searchPlaces(q, 4).map((r): SearchResult => ({ name: r.name, detail: r.detail, lon: r.lon, lat: r.lat, radius: r.radius, source: "local", icon: iconOfKind(r.kind), run: () => void openPlace(r.slug) })),
      ...siteMatches(q), ...searchLocal(feeds, q).map((m) => ({
      name: m.name, detail: m.detail, lon: m.lon, lat: m.lat, source: "local" as const,
      radius: m.kind === "sea" || m.kind === "continent" ? 1_500_000 : m.kind === "range" || m.kind === "desert" || m.kind === "region" ? 400_000 : m.kind === "city" || m.kind === "capital" ? 15_000 : m.kind === "district" ? 3000 : 1200,
      icon: iconOfKind(m.kind),
    }))].filter((r, i, all) => all.findIndex((o) => o.name === r.name) === i).slice(0, 8),
    things: (q) => {
      const found = findThings(d.things(), q, 6);
      const as = (t: Thing): SearchResult => ({ name: t.title, detail: t.on?.() ? `On · ${t.detail}` : t.detail, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg(t.emoji, 18) ?? icons.sparkle, run: t.run });
      // A year ("1914", "500 BC", "the world in 2050") goes there in time.
      const y = /^(?:(?:the )?world in |in |year )?(\d{1,4})\s*(bc|bce|ad)?$/i.exec(q.trim());
      const year = y ? Number(y[1]) * (/^bc/i.test(y[2] ?? "") ? -1 : 1) : NaN;
      const time: SearchResult[] = Number.isFinite(year) && year >= -3000 && year <= 2100 && (Math.abs(year) >= 100 || y![2])
        ? [{ name: `Go to ${yearName(year)}`, detail: year < 2000 ? "The world's borders at the time" : year < new Date().getUTCFullYear() ? "The Earth from space that year" : "Projections for places", lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg("⏳", 18) ?? icons.sparkle, run: () => d.goToYear(year) }]
        : [];
      // One word that names an Terreno thing outright ("tour", "seasons", "railways"), and no place
      // is called exactly that: the thing leads, ahead of places and commands.
      const words = tokens(q);
      const lead = found[0] && words.length === 1 && scoreThing(found[0], q) >= 3 && !searchPlaces(q, 4).some((p) => tokens(p.name).join(" ") === words[0]) ? found[0] : null;
      // People by name or @handle, and lenses people have made.
      const people: SearchResult[] = searchProfiles(q).slice(0, 3).map((p) => ({ name: p.name, detail: `@${p.handle}${p.now ? ` · ${p.now}` : ""}`, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg(p.avatar.emoji, 18) ?? icons.people, run: () => app.actions.get("profile:open")?.run(p.handle) }));
      const qw = words.filter((w) => w.length > 2);
      const made: SearchResult[] = qw.length ? allLenses().filter((d) => qw.every((w) => `${d.name} ${d.blurb}`.toLowerCase().includes(w)) || qw.some((w) => d.name.toLowerCase().startsWith(w))).slice(0, 2)
        .map((d) => ({ name: `${d.name} lens`, detail: d.blurb, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg(d.icon, 18) ?? icons.sparkle, run: () => app.actions.get("lens:custom")?.run(d.id) })) : [];
      const guides: SearchResult[] = qw.length ? allProfiles().flatMap((p) => (p.guides ?? []).map((g) => ({ p, g })))
        .filter(({ g }) => qw.every((w) => `${g.title} ${g.blurb}`.toLowerCase().includes(w))).slice(0, 2)
        .map(({ p, g }) => ({ name: g.title, detail: `A guide by ${p.name} · ${g.stops.length} stops`, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg("🧭", 18) ?? icons.compass, run: () => { location.hash = `#/g/${p.handle}/${g.id}`; } })) : [];
      return [
        ...(lead ? [{ heading: "Best match", items: [as(lead)], lead: true }] : []),
        { heading: "People", items: people },
        { heading: "Guides", items: guides },
        { heading: "Lenses people made", items: made },
        { heading: "Time", items: time },
        ...(["Show on the map", "Open", "Stories"] as const).map((g) => ({ heading: g, items: found.filter((t) => t.group === g && t !== lead).slice(0, 3).map(as) })),
      ].filter((g) => g.items.length);
    },
    frontDoor: () => {
      const go = (name: string, slug: string, detail: string, emoji: string): SearchResult => ({ name, detail, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg(emoji, 18) ?? icons.target, run: () => void openPlace(slug) });
      const show = (name: string, detail: string, emoji: string, run: () => void): SearchResult => ({ name, detail, lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg(emoji, 18) ?? icons.sparkle, run });
      return [
        { heading: "Go to", items: [{ name: "Show me something amazing", detail: "Somewhere unexpected, and why it's worth seeing", lon: 0, lat: 0, radius: 0, source: "thing", svg: iconSvg("🎲", 18) ?? icons.sparkle, run: () => app.actions.get("surprise")?.run() }, go("The Nile", "nile", "The longest river, source to sea", "🌊"), go("Mount Everest", "mount-everest", "The highest mountain", "🏔️"), go("Grand Canyon", "grand-canyon", "Two billion years of rock", "🏜️")] },
        { heading: "Show", items: [show("Where people live", "Every town and city as a glow", "👥", () => app.actions.get("people:view")?.run("pop")), show("This week's earthquakes", "Live, worldwide", "〽️", () => void overlays.set("quakes", true)), show("The planet at night", "City lights from space", "🌃", () => void overlays.set("lights", true))] },
      ];
    },
    bias: () => (feeds.view.zoom > 4 ? { lat: feeds.view.lat, lon: feeds.view.lon } : null),
  }));
  return { siteMatches };
}
