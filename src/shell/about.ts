// About Terreno: what it is, where the data comes from, privacy, the legal pages and the keys, plus
// "Start fresh" for showing Terreno to one visitor after another. The mark top left opens it.
import { setSound, soundOn } from "../delight/sound";
import { aiOn } from "../robot/llm";
import { wordmarkHtml } from "../ui/brand";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";

export function createAbout(openAi: () => void) {
  const panel = h("div", { class: "popover about", hidden: true },
    h("div", { class: "about-head" }, h("h2", { class: "group-title" }, "About Terreno"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: () => (panel.hidden = true) })),
    h("p", {}, "Explore the whole Earth, live. Plan, present and film from it. Work with the tools for your field. Keep My Place: your home, farm or business, with a daily brief."),
    h("p", {}, "You can also type a request into the search box, like \u201cstorm drains and railways in Chicago\u201d, and Terreno will plan the steps and do them."),
    h("p", {}, "People have pages here too: the places they love, a journal, and lenses they've made. Make your own from the account button, and a lens of your own in Lens Studio."),
    h("button", { class: "pill-btn about-ai", onclick: () => { panel.hidden = true; openAi(); } }, aiOn() ? "Terreno AI: connected · settings" : "Connect Terreno AI (Claude)…"),
    h("p", {}, "The themes are lenses on one shared map. What you add stays as you switch (see \"On the map\" at the top), and every view ends with Connected links to related views of the same place."),
    h("h2", { class: "group-title" }, "Where the data comes from"),
    h("ul", { class: "plain-list" },
      h("li", {}, "Terrain: open elevation tiles (SRTM, USGS 3DEP and others). Imagery: Esri."),
      h("li", {}, "Rocks: Macrostrat. Weather and climate: Open-Meteo (ERA5). Rain radar: RainViewer."),
      h("li", {}, "Plants and animals: iNaturalist and GBIF. Built features, water and mines: OpenStreetMap."),
      h("li", {}, "Countries: Natural Earth borders, REST Countries, World Bank. Night lights: NASA."),
      h("li", {}, "Labels: Natural Earth (world), Wikidata and Wikipedia (notable places), OpenStreetMap (rivers)."),
      h("li", {}, "Aurora and geomagnetic activity: NOAA Space Weather Prediction Center. Earthquakes: USGS. Plates: Bird (2003)."),
      h("li", {}, "Place names: OpenStreetMap Nominatim.")),
    h("p", { class: "fineprint" }, "Every dataset is a record of what's been measured or mapped. None of them is complete, so treat gaps as unknowns, not absences."),
    h("h2", { class: "group-title" }, "Your privacy"),
    h("p", { class: "fineprint" }, "What you make in Terreno stays in this browser unless you sign in and sync it or share it with your team; there are no ads, no tracking and no selling of data. To answer you, Terreno asks public services about the places you look at (for example OpenStreetMap for names and Open-Meteo for weather), which sends them the coordinates, not who you are. With Terreno AI on, your requests go to Anthropic."),
    h("p", { class: "fineprint about-legal" }, ...[["terms", "Terms"], ["privacy", "Privacy"], ["acceptable-use", "Acceptable use"], ["security", "Security"], ["accessibility", "Accessibility"], ["subprocessors", "Subprocessors"]].flatMap(([n, t], i) => [i ? " · " : "", h("a", { href: `legal/${n}.html`, target: "_blank", rel: "noopener" }, t)])),
    h("p", { class: "fineprint" }, "Keyboard: 1–9 switch themes · / searches · + and − zoom · Esc cancels a line or closes a chart. Double-click to zoom in on a spot."),
    // Showing Terreno to people one after another on the same computer.
    (() => {
      const row = h("div", { class: "about-row" }, h("span", { class: "muted small" }, "Showing Terreno to people one after another? Start fresh for the next visitor: the opening, the tour and a clean slate (Terreno AI and feedback notes are kept)."));
      const btn = h("button", { class: "pill-btn" }, "Start fresh") as HTMLButtonElement;
      btn.addEventListener("click", () => {
        if (btn.dataset.sure !== "1") { btn.dataset.sure = "1"; btn.textContent = "Tap again to clear"; setTimeout(() => { btn.dataset.sure = ""; btn.textContent = "Start fresh"; }, 4000); return; }
        try {
          for (const k of Object.keys(localStorage)) if (k.startsWith("atlas.") && k !== "atlas.ai.v1" && k !== "atlas.feedback.v1") localStorage.removeItem(k);
          sessionStorage.clear();
        } catch { /* storage blocked */ }
        location.replace(location.pathname);
      });
      row.append(btn);
      return row;
    })());
  // The mark and the name, top left: the brand's one place on screen.
  const mark = h("button", { class: "brand", "aria-label": "About Terreno", html: wordmarkHtml(26), onclick: () => { panel.hidden = !panel.hidden; } });
  const soundBtn = h("button", { class: "pill-btn sound-toggle", "aria-pressed": String(soundOn()) }, soundOn() ? "Sounds on" : "Sounds off") as HTMLButtonElement;
  soundBtn.addEventListener("click", () => { const on = !soundOn(); setSound(on); soundBtn.textContent = on ? "Sounds on" : "Sounds off"; soundBtn.setAttribute("aria-pressed", String(on)); });
  const soundRow = h("div", { class: "am-row am-static" }, h("span", {}, "Sounds and taps"), soundBtn);
  return { panel, mark, soundRow, open: () => { panel.hidden = false; } };
}
