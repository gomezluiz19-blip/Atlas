// What's on near your place: concerts, games, markets and talks in the next
// two weeks from the ticketing services Atlas can reach, and festivals known
// to Wikidata when none are connected.
import { EVENT_SOURCES, eventsNear, festivalsNear, type EventItem } from "../data/events";
import { h } from "../ui/dom";
import type { WorkCtx } from "../work/hub";
import type { MyPlace } from "./store";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const when = (e: EventItem) => `${new Date(e.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}${e.time ? ` ${e.time}` : ""}`;

export function openEventsHere(ctx: WorkCtx, place: MyPlace, back?: () => void) {
  const body = h("div", {}, h("p", { class: "muted small" }, "Looking…"));
  ctx.show(`What's on near ${place.name}`, back ?? ctx.home, body);
  const sources = EVENT_SOURCES();
  void (async () => {
    const t = today(), end = addDays(t, 14);
    const { items } = sources.length ? await eventsNear(place.lon, place.lat, 25).catch(() => ({ items: [] as EventItem[] })) : { items: [] as EventItem[] };
    const soon = items.filter((e) => e.date >= t && e.date <= end).sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
    const fests = soon.length ? [] : await festivalsNear(place.lon, place.lat).catch(() => []);
    body.replaceChildren(
      soon.length ? h("div", { class: "list" }, ...soon.slice(0, 40).map((e) => h("a", { class: "list-row", href: e.url ?? "#", target: "_blank", rel: "noopener" },
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, e.name), h("span", { class: "list-sub" }, `${when(e)}${e.venue ? ` · ${e.venue}` : ""}${e.price ? ` · ${e.price}` : ""} · ${e.source}`)),
        h("span", { class: "chev", html: "&rsaquo;" })))) : h("p", { class: "muted small" }, sources.length ? "Nothing listed in the next two weeks within 25 km." : "No ticketing service is connected, so here are the festivals known nearby."),
      fests.length ? h("div", { class: "list" }, ...fests.slice(0, 20).map((f) => h("a", { class: "list-row", href: f.url ?? "#", target: "_blank", rel: "noopener" },
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, f.name), h("span", { class: "list-sub" }, [f.when, f.about].filter(Boolean).join(" · "))),
        h("span", { class: "chev", html: "&rsaquo;" })))) : "",
      h("p", { class: "muted small" }, sources.length ? `From ${sources.join(", ")}.` : "Events come from Ticketmaster, SeatGeek or Eventbrite when Atlas's edge holds their keys; festivals from Wikidata."));
  })();
}
