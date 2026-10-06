// Work › Teach: everything a teacher needs on the globe. Lessons (slides with
// classroom tools), quizzes and tests, quick games, World Summit (a long-running
// international relations simulation) and field trips.
import { h } from "../ui/dom";
import { openTrips } from "./fieldtrip";
import { openGames } from "./games";
import type { WorkCtx } from "./hub";
import { decks, openDeck, openBorders, play, saveDeck } from "./present";
import { overhead, type Slide } from "./presentModel";
import { openQuizzes } from "./quiz";
import { openSims } from "./sim";
import { newId } from "./store";
import { iconFor } from "../ui/glyph";

/** Lesson starters by subject, ready to teach or adapt. */
const LESSONS: { subject: string; name: string; grade: string; slides: Omit<Slide, "id">[] }[] = [
  {
    subject: "Geography", name: "Continents and oceans", grade: "Ages 6–10",
    slides: [
      { title: "Our planet is mostly water", text: "About 71% of Earth's surface is ocean. Can you find the biggest one?", camera: overhead(-150, 0, 22_000_000), notes: "Spin the globe. Ask: which colour do you see most?" },
      { title: "Seven continents", text: "Africa, Antarctica, Asia, Australia, Europe, North America and South America.", camera: overhead(20, 20, 20_000_000), notes: "Use the pen to circle each continent as the class names it." },
      { title: "Africa", text: "The second-largest continent, with 54 countries and the Sahara, the largest hot desert.", camera: overhead(20, 3, 11_000_000), orbit: true },
      { title: "The Pacific Ocean", text: "The largest and deepest ocean. All the continents could fit inside it.", camera: overhead(-160, 5, 18_000_000) },
      { title: "Antarctica", text: "The coldest, windiest continent, covered by ice up to 4.8 km thick.", camera: overhead(0, -85, 9_000_000), notes: "Ask: why does nobody live there all year?" },
    ],
  },
  {
    subject: "Science", name: "Volcanoes and earthquakes", grade: "Ages 9–14",
    slides: [
      { title: "Earth's moving plates", text: "Earth's shell is broken into plates that move a few centimetres a year.", camera: overhead(-160, 10, 20_000_000), layers: ["overlay:plates"], notes: "Plates on: point out the lines where plates meet." },
      { title: "The Ring of Fire", text: "Most earthquakes and volcanoes happen where plates meet, especially around the Pacific.", camera: overhead(-170, 10, 20_000_000), layers: ["overlay:plates", "overlay:quakes"], notes: "This week's real earthquakes are on the map." },
      { title: "Mount Fuji", text: "A stratovolcano: layers of lava and ash built it up to 3,776 m.", camera: overhead(138.73, 35.2, 30_000, 55), orbit: true },
      { title: "Iceland: a plate boundary on land", text: "Iceland sits on the Mid-Atlantic Ridge, where two plates pull apart.", camera: overhead(-19, 64.6, 900_000, 30), layers: ["overlay:plates"] },
      { title: "The San Andreas Fault", text: "Here two plates slide past each other, causing California's earthquakes.", camera: overhead(-120, 35.5, 1_200_000, 30), layers: ["overlay:plates", "overlay:quakes"] },
    ],
  },
  {
    subject: "History", name: "Ancient civilisations", grade: "Ages 8–13",
    slides: [
      { title: "Egypt along the Nile", text: "Around 1500 BC, Egypt's civilisation lived along the River Nile.", camera: overhead(31, 26, 3_000_000), year: -1500 },
      { title: "Mesopotamia", text: "Between the Tigris and Euphrates, the first cities and writing began.", camera: overhead(44, 33, 2_500_000), year: -2000 },
      { title: "Ancient Greece", text: "By 400 BC, Greek city-states traded all around the Mediterranean.", camera: overhead(23, 38, 2_000_000), year: -400 },
      { title: "The Han and Roman empires", text: "In AD 100, two great empires ruled at either end of the Silk Road.", camera: overhead(60, 35, 12_000_000), year: 100, notes: "Draw the Silk Road between them with the pen." },
    ],
  },
  {
    subject: "Environment", name: "Rivers and the water cycle", grade: "Ages 8–12",
    slides: [
      { title: "Where rivers begin", text: "Rain and melting snow in the mountains feed streams that join into rivers.", camera: overhead(86.9, 28, 800_000, 45), notes: "Try Water › Rain path on a mountain to follow a raindrop." },
      { title: "The Amazon", text: "The river carrying the most water on Earth, through the largest rainforest.", camera: overhead(-60, -3, 4_000_000) },
      { title: "The Nile delta", text: "Where a river meets the sea it drops its mud, building fertile land.", camera: overhead(31, 30.8, 400_000, 30) },
      { title: "Water in the city", text: "Cities pipe water in, and drains carry rain and waste water away.", camera: overhead(-0.1, 51.505, 12_000, 50), notes: "Open Water › City water here to show London's drains and buried rivers." },
    ],
  },
];

export function openTeach(ctx: WorkCtx) {
  const home = () => openTeach(ctx);
  const tile = (title: string, about: string, color: string, icon: string, go: () => void) =>
    h("button", { class: "work-tool", style: `--c:${color}`, onclick: go },
      h("span", { class: "work-tool-icon teach-emoji" }, iconFor(icon, 20)),
      h("span", { class: "work-tool-text" }, h("strong", {}, title), h("span", {}, about)));
  ctx.show("Teach", ctx.home,
    h("p", { class: "mp-intro" }, "Teach with the whole planet: lessons, quizzes, games and field trips."),
    h("div", { class: "work-tools" },
      tile("Lessons", "Slides on the globe, with a pen, your notes and a timer", "#c9a256", "📖", () => openLessons(ctx, home)),
      tile("Quizzes and tests", "Host with teams on the class screen, or send a link", "#b8496a", "❓", () => openQuizzes(ctx, home)),
      tile("Games", "Where in the world? · Time traveller", "#3563d6", "🎯", () => openGames(ctx, home)),
      tile("World Summit", "A simulation of world politics, played over weeks", "#8b5fa8", "🌐", () => openSims(ctx, home)),
      tile("Field trips", "The day step by step: timetable, buses, costs, safety and permission slips", "#d19a2e", "🚌", () => openTrips(ctx, home))),
  );
}

function openLessons(ctx: WorkCtx, back: () => void) {
  const again = () => openLessons(ctx, back);
  ctx.show("Lessons", back,
    h("p", { class: "mp-intro" }, "Teach from the globe. Classroom mode makes the text bigger and adds a pen to draw on the globe (D), your notes (N) and a timer. Arrow keys move between slides."),
    decks().length ? h("section", { class: "group" }, h("h2", { class: "group-title" }, "Your lessons and presentations"),
      h("div", { class: "list" }, ...decks().map((d) =>
        h("div", { class: "list-row static" },
          d.slides[0]?.thumb ? h("img", { class: "present-mini", src: d.slides[0].thumb, alt: "" }) : h("span", { class: "work-badge", style: "background:#c9a256" }, "📖"),
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, d.name), h("span", { class: "list-sub" }, `${d.slides.length} slides`)),
          h("button", { class: "pill-btn", disabled: !d.slides.length, onclick: () => { ctx.close(); play(ctx.app, d, { teach: true }); } }, "Teach"),
          h("button", { class: "link-btn", onclick: () => openDeck(ctx, d.id) }, "Edit"))))) : "",
    h("section", { class: "group" }, h("h2", { class: "group-title" }, "Lesson starters"),
      h("div", { class: "work-types" }, ...LESSONS.map((l) =>
        h("button", { class: "work-type", style: "--c:#c9a256", onclick: () => {
          const d = { id: newId(), name: l.name, created: Date.now(), slides: l.slides.map((s) => ({ ...s, id: newId() })) };
          saveDeck(d);
          again();
        } }, h("strong", {}, l.name), h("span", {}, `${l.subject} · ${l.grade} · ${l.slides.length} slides`))))),
    h("div", { class: "chips wrap" },
      h("button", { class: "chip", onclick: () => { const d = { id: newId(), name: "New lesson", created: Date.now(), slides: [] }; saveDeck(d); openDeck(ctx, d.id); } }, "+ Blank lesson"),
      h("button", { class: "chip", onclick: () => openBorders(ctx) }, "Borders through time")),
  );
}
