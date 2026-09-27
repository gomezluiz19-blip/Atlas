// Work › Learn: for students. A daily challenge, games (the same ones teachers
// use, plus Flag Match and Flight School), a teacher's quiz, a passport of
// stamps and badges, and places to learn nearby: museums, libraries, science
// centres, zoos, planetariums, with free ones marked.
import type { App } from "../app";
import { elementPoint, overpass } from "../data/overpass";
import { SITES } from "../content/sites";
import { h } from "../ui/dom";
import { flyToPlace } from "../ui/search";
import { flightSchool } from "./flight";
import { CAPITALS, LANDMARKS } from "./gameData";
import { distanceKm, confetti, openQuizLink, revealMap, stage } from "./quiz";
import { timeTraveller, where, guessPoints } from "./games";
import { fmtDist } from "./geo";
import type { WorkCtx } from "./hub";
import { WorkLayer } from "./layer";
import { FLAG_COUNTRIES, FREE_MUSEUMS, KINDS, flag, kindOf, overpassQuery, priceOf, type LearnKind } from "./learnData";
import { BADGES, award, dailyIndex, dailyPlayed, loadPassport, savePassport } from "./passport";
import { overhead } from "./presentModel";
import { flyToView } from "./present";

let places: WorkLayer | null = null;
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

function badgeToast(app: App, ids: string[]) {
  for (const id of ids) {
    const b = BADGES.find((x) => x.id === id);
    if (b) app.toast(`${b.emoji} New badge: ${b.label}!`, 4000);
  }
}

export function openLearn(ctx: WorkCtx) {
  const { app } = ctx;
  const p = loadPassport();
  if (!p.active) { p.active = true; savePassport(p); }
  const back = () => openLearn(ctx);
  const tile = (title: string, about: string, color: string, icon: string, go: () => void) =>
    h("button", { class: "work-tool", style: `--c:${color}`, onclick: go },
      h("span", { class: "work-tool-icon teach-emoji" }, icon), h("span", { class: "work-tool-text" }, h("strong", {}, title), h("span", {}, about)));
  const today = new Date().toISOString().slice(0, 10);
  const playedToday = p.streak.last === today;
  const quizIn = h("input", { class: "pro-url", placeholder: "Paste the quiz link from your teacher" }) as HTMLInputElement;
  ctx.show("Learn", ctx.home,
    h("div", { class: "learn-hero" },
      h("div", {}, h("strong", {}, playedToday ? "Daily challenge done ✓" : "Today's challenge"),
        h("span", {}, playedToday ? `Come back tomorrow to keep your ${p.streak.days}-day streak.` : "One place, one guess. Keep your streak going!")),
      h("span", { class: "learn-streak", title: "Days in a row" }, `🔥 ${p.streak.last === today || p.streak.last === new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) ? p.streak.days : 0}`),
      playedToday ? "" : h("button", { class: "primary-btn", onclick: () => { ctx.close(); daily(app, ctx); } }, "Play")),
    h("h2", { class: "group-title" }, "Games"),
    h("div", { class: "work-tools" },
      tile("Flight School", "Fly a plane to countries and learn the map on the way", "#0a84ff", "✈️", () => { ctx.close(); void flightSchool(app); }),
      tile("Flag Match", "Whose flag is it? Then see where it flies", "#ff375f", "🚩", () => { ctx.close(); flagMatch(app); }),
      tile("Where in the world?", "Capitals and wonders: tap where they are", "#30d158", "🎯", () => { ctx.close(); where(app, Math.random() < 0.5 ? CAPITALS : LANDMARKS, "where-learn", "mixed"); }),
      tile("Time traveller", "Guess the year from the world's borders", "#e0b050", "⏳", () => { ctx.close(); timeTraveller(app); })),
    h("h2", { class: "group-title" }, "For school"),
    h("div", { class: "work-tools" },
      tile("Places to learn", "Museums, libraries, science centres and zoos near you, free ones marked", "#bf5af2", "🏛️", () => openPlaces(ctx, back)),
      tile("My passport", `${Object.keys(p.stamps).length} stamps · ${Object.keys(p.badges).length} badges`, "#ff9f0a", "🛂", () => openPassport(ctx, back))),
    h("div", { class: "pro-url-row" }, quizIn, h("button", { class: "primary-btn", onclick: () => {
      const m = /quiz=([\w-]+)/.exec(quizIn.value);
      if (!m) { app.toast("That doesn't look like a quiz link.", 4000); return; }
      ctx.close();
      void openQuizLink(app, m[1]);
    } }, "Take quiz")),
    h("p", { class: "muted small" }, "Tip: ask the search box anything, like “why is the Dead Sea so salty?”"),
  );
}

// ---- Daily challenge ----------------------------------------------------------------------------

function daily(app: App, ctx: WorkCtx) {
  const all = Object.values(SITES).flatMap((cs) => cs.flatMap((c) => c.sites));
  const site = all[dailyIndex(all.length)];
  const s = stage(app);
  s.card.replaceChildren(h("span", { class: "stage-num" }, `Daily challenge · ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "long" })}`), h("h2", {}, `Where is ${site.name}?`), h("p", { class: "muted" }, `Hint: ${site.where}`));
  s.answers.replaceChildren(h("div", { class: "stage-hint" }, "Tap the globe where you think it is."));
  s.bar.replaceChildren(h("button", { class: "present-btn", "aria-label": "Close", onclick: () => s.close() }, "✕"));
  void flyToView(app, overhead(0, 20, 22_000_000), 1.2);
  app.pickOnce(null, (g) => {
    const km = distanceKm([g.lon, g.lat], [site.lon, site.lat]), pts = guessPoints(km);
    revealMap(app, { id: "", kind: "map", prompt: "", place: site.name, lon: site.lon, lat: site.lat, tolerance: 0 }, [{ pt: [g.lon, g.lat], color: "#0a84ff", label: "You" }]);
    const p = loadPassport();
    const earned = dailyPlayed(p);
    savePassport(p);
    s.card.append(h("p", { class: "stage-explain" }, site.why));
    s.answers.replaceChildren(h("div", { class: "stage-tile small " + (pts > 600 ? "right" : "") }, h("b", {}, `+${pts}`), h("span", {}, `${fmtDist(km * 1000)} away · streak ${p.streak.days} 🔥`)));
    s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => { s.close(); void flyToPlace(app.globe, site); ctx.open(); openLearn(ctx); } }, "See it up close"));
    if (pts > 600) confetti(s.root);
    badgeToast(app, earned);
  });
}

// ---- Flag Match ---------------------------------------------------------------------------------------

export function flagMatch(app: App) {
  const ROUNDS = 8;
  const rounds = shuffle(FLAG_COUNTRIES).slice(0, ROUNDS);
  const s = stage(app);
  let r = 0, score = 0;
  const round = () => {
    const c = rounds[r];
    const options = shuffle([c, ...shuffle(FLAG_COUNTRIES.filter((x) => x !== c)).slice(0, 3)]);
    s.card.replaceChildren(h("span", { class: "stage-num" }, `Flag ${r + 1} of ${ROUNDS} · ${score} right`), h("div", { class: "flag-big" }, flag(c.iso)), h("h2", {}, "Whose flag is this?"));
    s.answers.replaceChildren(...options.map((o, j) => h("button", { class: "stage-tile", style: `--c:${["#ff375f", "#0a84ff", "#ffd60a", "#bf5af2"][j]}`, onclick: () => {
      const ok = o === c;
      if (ok) score++;
      [...s.answers.children].forEach((el, k) => { (el as HTMLButtonElement).disabled = true; el.classList.add(options[k] === c ? "right" : options[k] === o ? "wrong" : "dim"); });
      s.card.append(h("p", { class: "stage-explain" }, `${ok ? "Yes! " : ""}${c.the ? "The " : ""}${c.country}: the capital is ${c.capital}.`));
      void flyToView(app, overhead(c.lon, c.lat, 2_500_000), 1.6);
      s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => { r++; if (r < ROUNDS) round(); else end(); } }, r + 1 < ROUNDS ? "Next flag" : "See score"));
    } }, h("b", {}, String.fromCharCode(65 + j)), h("span", {}, o.country))));
    s.bar.replaceChildren(h("button", { class: "present-btn", "aria-label": "Quit", onclick: () => s.close() }, "✕"));
  };
  const end = () => {
    const p = loadPassport();
    const earned = score >= 7 && award(p, "flags") ? ["flags"] : [];
    savePassport(p);
    s.card.replaceChildren(h("span", { class: "stage-num" }, "Flag Match"), h("h2", {}, `${score} out of ${ROUNDS}`), h("p", {}, score >= 7 ? "Flag expert! 🚩" : score >= 4 ? "Nice work. Try again to beat it!" : "Keep exploring and try again!"));
    s.answers.replaceChildren();
    s.bar.replaceChildren(h("button", { class: "present-btn wide", onclick: () => { s.close(); flagMatch(app); } }, "Play again"), h("button", { class: "present-btn", "aria-label": "Close", onclick: () => s.close() }, "✕"));
    if (score >= 7) confetti(s.root);
    badgeToast(app, earned);
  };
  round();
}

// ---- Passport ---------------------------------------------------------------------------------------------

function openPassport(ctx: WorkCtx, back: () => void) {
  const p = loadPassport();
  const stamps = Object.entries(p.stamps).sort((a, b) => a[1].localeCompare(b[1]));
  ctx.show("My passport", back,
    h("p", { class: "mp-intro" }, "You get a stamp for every country you explore on the globe (tap a place in it), and badges for games and streaks."),
    h("div", { class: "passport-stamps" }, ...(stamps.length ? stamps.map(([name, date], i) =>
      h("span", { class: "passport-stamp", style: `--r:${((i * 37) % 13) - 6}deg;--c:${["#ff375f", "#0a84ff", "#30d158", "#bf5af2", "#ff9f0a"][i % 5]}`, title: `First explored ${date}` }, name)) : [h("p", { class: "muted small" }, "No stamps yet: tap anywhere on the globe to explore a country.")])),
    h("h2", { class: "group-title" }, `Badges · ${Object.keys(p.badges).length} of ${BADGES.length}`),
    h("div", { class: "passport-badges" }, ...BADGES.map((b) => h("div", { class: "passport-badge" + (p.badges[b.id] ? " got" : ""), title: b.about },
      h("span", {}, b.emoji), h("strong", {}, b.label), h("small", {}, p.badges[b.id] ? `Earned ${p.badges[b.id]}` : b.about)))),
    h("p", { class: "muted small" }, `Daily streak: ${p.streak.days} · Flights flown: ${p.flights}. Kept in this browser.`),
  );
}

// ---- Places to learn ------------------------------------------------------------------------------------------

interface LearnPlace { name: string; kind: LearnKind; price: "free" | "paid" | "unknown"; lon: number; lat: number; km: number; hours?: string; web?: string; charge?: string }

function openPlaces(ctx: WorkCtx, back: () => void) {
  const { app } = ctx;
  const centre = app.place ?? (() => {
    const c = app.globe.viewer.camera.positionCartographic;
    return { lon: (c.longitude * 180) / Math.PI, lat: (c.latitude * 180) / Math.PI };
  })();
  let list: LearnPlace[] = [];
  let only: LearnKind | null = null, freeOnly = false;
  const body = h("div", { class: "work-analysis" }, h("p", { class: "muted small" }, "Looking for places to learn nearby…"));
  places ??= new WorkLayer(app, "work:learnplaces", "Places to learn", "#bf5af2");
  const filters = h("div", { class: "chips wrap" });
  const draw = () => {
    const shown = list.filter((p) => (!only || p.kind === only) && (!freeOnly || p.price === "free"));
    filters.replaceChildren(
      h("button", { class: "chip" + (!only ? " on" : ""), onclick: () => { only = null; draw(); } }, `All ${list.length}`),
      ...(Object.keys(KINDS) as LearnKind[]).filter((k) => list.some((p) => p.kind === k)).map((k) =>
        h("button", { class: "chip" + (only === k ? " on" : ""), onclick: () => { only = only === k ? null : k; draw(); } }, `${KINDS[k].emoji} ${list.filter((p) => p.kind === k).length}`)),
      h("button", { class: "chip" + (freeOnly ? " on" : ""), onclick: () => { freeOnly = !freeOnly; draw(); } }, "Free only"));
    places!.set(shown.slice(0, 150).map((p, i) => ({ id: `l${i}`, kind: "point" as const, pts: [[p.lon, p.lat] as [number, number]], color: KINDS[p.kind].color, label: shown.length < 40 ? p.name : undefined })), "Places to learn");
    body.replaceChildren(shown.length ? h("div", { class: "list" }, ...shown.slice(0, 60).map((p) =>
      h("button", { class: "list-row", onclick: () => { void flyToPlace(app.globe, { name: p.name, lon: p.lon, lat: p.lat, radius: 400 }); app.select({ lon: p.lon, lat: p.lat, height: 0 }, { title: p.name, context: KINDS[p.kind].label }); } },
        h("span", { class: "learn-kind", style: `--c:${KINDS[p.kind].color}` }, KINDS[p.kind].emoji),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, p.name),
          h("span", { class: "list-sub" }, [fmtDist(p.km * 1000), p.hours ? p.hours.slice(0, 40) : "", p.charge ? p.charge.slice(0, 30) : ""].filter(Boolean).join(" · "))),
        p.price === "free" ? h("span", { class: "learn-free" }, "Free") : p.price === "paid" ? h("span", { class: "learn-paid" }, "Paid") : "")))
      : h("p", { class: "muted small" }, "Nothing mapped here for that filter. Try zooming out, or another place."));
  };
  const nearFamous = FREE_MUSEUMS.map((m) => ({ ...m, km: distanceKm([centre.lon, centre.lat], [m.lon, m.lat]) })).sort((a, b) => a.km - b.km);
  ctx.show("Places to learn", back,
    h("p", { class: "mp-intro" }, `Museums, libraries, science centres, zoos, planetariums, gardens and historic sites within 15 km of ${app.place ? "the chosen place" : "the middle of the map"}.`),
    filters, body,
    h("p", { class: "muted small" }, "“Free” is what OpenStreetMap records; many places also have student, child or family prices. Check before you go."),
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Famous museums, free or cheaper for students"),
      h("div", { class: "list" }, ...nearFamous.map((m) => h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: m.name, lon: m.lon, lat: m.lat, radius: 600 }) },
        h("span", { class: "learn-kind", style: "--c:#bf5af2" }, "🏛️"),
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, m.name, h("span", { class: "muted small" }, ` · ${m.city}`)), h("span", { class: "list-sub" }, m.deal)),
        m.km < 60 ? h("span", { class: "learn-free" }, "Near you") : "")))),
  );
  overpass(overpassQuery(centre.lat, centre.lon)).then((els) => {
    list = els.flatMap((e) => {
      const t = e.tags ?? {}, pt = elementPoint(e), kind = kindOf(t);
      if (!pt || !kind || !t.name) return [];
      return [{ name: t.name, kind, price: priceOf(t), lon: pt[0], lat: pt[1], km: distanceKm([centre.lon, centre.lat], pt), hours: t.opening_hours, web: t.website, charge: t.charge }];
    }).filter((p, i, all) => all.findIndex((q) => q.name === p.name) === i).sort((a, b) => a.km - b.km);
    draw();
  }).catch(() => body.replaceChildren(h("p", { class: "muted small" }, "Couldn't reach OpenStreetMap for places nearby. The famous museums below still work.")));
}
