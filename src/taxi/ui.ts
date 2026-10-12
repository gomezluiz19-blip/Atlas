// The Taxi stage's answer: local firms and ranks first, with what the meter should come to, and a way to reach
// each one that carries a Terreno reference; Uber and Lyft alongside, so the person always has the choice.
// And the page where a taxi company lists itself (free, or as a Partner that pays a small fee per booking, never
// its drivers, and never for a better place in the list).
import type { App, Place } from "../app";
import { reverseGeocode } from "../data/geocode";
import { geocode } from "../ui/search";
import { rideLinks } from "../place/around";
import { homeOrFirst } from "../myplaces/saved";
import { h } from "../ui/dom";
import { icons } from "../ui/icons";
import { haptic } from "../ui/haptics";
import { firmsNear, recordBooking, submitListing, type Listing } from "./data";
import { bookingHref, bookingRef, callHref, fareEstimate, fareText, rankFirms, tariffFor, tripFromLine, whatsappHref, type Need, type TaxiFirm } from "./model";

type Spot = { lon: number; lat: number };
const NEEDS: { id: Need; label: string }[] = [{ id: "wheelchair", label: "Wheelchair" }, { id: "large", label: "6+ seats" }, { id: "airport", label: "Airport" }];

const kmLine = (a: Spot, b: Spot) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2));
};

/** Where the ride starts: where you are, else your home, else around the destination itself. */
function pickupSpot(dest: Spot): Promise<Spot & { label: string }> {
  const fallback = () => { const home = homeOrFirst(); return home ? { lon: home.lon, lat: home.lat, label: home.kind === "home" ? "home" : home.name } : { ...dest, label: "nearby" }; };
  return new Promise((done) => {
    if (!navigator.geolocation) { done(fallback()); return; }
    navigator.geolocation.getCurrentPosition((p) => done({ lon: p.coords.longitude, lat: p.coords.latitude, label: "where you are" }), () => done(fallback()), { timeout: 6000, maximumAge: 120_000 });
  });
}

/** The panel under "Taxi to …": firms and ranks near the pickup, a fare, and rideshare beside them. */
export function taxiOptions(app: App, place: Place, name: string): HTMLElement {
  const fare = h("p", { class: "tx-fare" });
  const list = h("div", { class: "tx-list" }, h("div", { class: "loading" }, h("div", { class: "spinner" }), "Finding local taxis…"));
  const needs = new Set<Need>();
  let firms: TaxiFirm[] = [], pickup: (Spot & { label: string }) | null = null;

  const draw = () => {
    if (!pickup) return;
    const ranked = rankFirms(firms, pickup, [...needs]).slice(0, 6);
    if (!ranked.length) {
      list.replaceChildren(h("p", { class: "tx-none" }, "No local taxi firms on the map here yet. Rideshare below, or ask a local firm to list itself."));
      return;
    }
    list.replaceChildren(...ranked.map((f) => firmCard(f, name)));
  };
  const chips = h("div", { class: "tx-needs", role: "group", "aria-label": "I need" }, ...NEEDS.map((n) => {
    const b = h("button", { class: "tx-need", "aria-pressed": "false", onclick: () => {
      if (needs.has(n.id)) needs.delete(n.id); else needs.add(n.id);
      b.setAttribute("aria-pressed", String(needs.has(n.id)));
      draw();
    } }, n.label);
    return b;
  }));

  void (async () => {
    pickup = await pickupSpot(place);
    const [found, cc] = await Promise.all([firmsNear(pickup), reverseGeocode(pickup.lon, pickup.lat, 5).then((r) => r?.countryCode).catch(() => undefined)]);
    firms = found;
    const tariff = tariffFor(cc);
    const line = kmLine(pickup, place);
    if (tariff && line > 0.2) {
      const t = tripFromLine(line);
      fare.replaceChildren(h("strong", {}, fareText(fareEstimate(t.km, t.minutes, tariff), navigator.language)), h("span", {}, ` on the meter from ${pickup.label}, ${Math.round(t.minutes)} min or so`));
    } else fare.hidden = true;
    draw();
  })();

  const ride = h("div", { class: "tx-ride" }, h("span", {}, "Or rideshare"),
    ...rideLinks(place, name).map((r) => h("a", { class: "pill-btn", href: r.href, target: "_blank", rel: "noopener", onclick: () => haptic("tap") }, r.label)));
  return h("div", { class: "tx" },
    h("div", { class: "tx-head" }, h("h3", {}, "Local taxis"), h("p", {}, "Firms and ranks near you, first. They drive; Terreno just connects you.")),
    fare, chips, list, ride,
    h("button", { class: "link-btn tx-list-link", onclick: () => app.actions.get("taxi:list")?.run() }, "Run a taxi company? List it free ›"));
}

function firmCard(f: TaxiFirm & { km: number }, to: string): HTMLElement {
  const go = (via: "call" | "whatsapp" | "book", href: (ref: string) => string, label: string, primary = false) =>
    h("a", { class: primary ? "primary-btn" : "pill-btn", href: href("TRN"), target: via === "call" ? "_self" : "_blank", rel: "noopener",
      onclick: (e: Event) => {
        // A new reference each time, so each ride is its own line in the firm's records.
        const ref = bookingRef();
        (e.currentTarget as HTMLAnchorElement).href = href(ref);
        recordBooking({ ref, firm: f.id, firmName: f.name, via, to, at: Date.now() });
        refEl.textContent = `Your reference: ${ref}`; refEl.hidden = false;
        haptic("confirm");
      } }, label);
  const refEl = h("p", { class: "tx-ref", hidden: true, "aria-live": "polite" });
  const badges = [
    f.rank ? "Rank: walk up" : "",
    f.verified ? "Licence checked" : "",
    f.driversKeepFare ? "Drivers keep the full fare" : "",
    f.needs?.includes("wheelchair") ? "Wheelchair" : "",
    f.needs?.includes("large") ? "6+ seats" : "",
  ].filter(Boolean);
  const actions = [
    f.phone ? go("call", () => callHref(f.phone!), "Call", true) : "",
    f.whatsapp ? go("whatsapp", (ref) => whatsappHref(f.whatsapp!, to, ref), "WhatsApp", !f.phone) : "",
    f.booking ? go("book", (ref) => bookingHref(f.booking!, ref), "Book", !f.phone && !f.whatsapp) : "",
    f.rank ? h("a", { class: "pill-btn", href: `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lon}&travelmode=walking`, target: "_blank", rel: "noopener" }, "Walk there") : "",
  ];
  return h("article", { class: `tx-firm${f.rank ? " is-rank" : ""}` },
    h("div", { class: "tx-firm-top" },
      h("strong", {}, f.name),
      h("span", { class: "tx-km" }, f.km < 1 ? `${Math.round(f.km * 1000)} m` : `${f.km.toFixed(1)} km`)),
    badges.length ? h("div", { class: "tx-badges" }, ...badges.map((b) => h("span", {}, b))) : "",
    f.fixed?.length ? h("p", { class: "tx-fixed" }, f.fixed.map((x) => `${x.label} ${x.price}`).join(" · ")) : "",
    h("div", { class: "tx-actions" }, ...actions), refEl);
}

// ---- List your taxi company -------------------------------------------------------------------------------

/** The page where a taxi firm lists itself. */
export function createTaxiListing(app: App) {
  const panel = h("section", { class: "popover tx-listing", hidden: true, role: "dialog", "aria-label": "List your taxi company" });
  const close = () => { panel.hidden = true; };
  const field = (label: string, input: HTMLElement, hint?: string) => h("label", { class: "mp-field" }, h("span", {}, label), input, hint ? h("small", { class: "muted" }, hint) : "");
  const text = (attrs: Record<string, string>) => h("input", { class: "pro-url", autocomplete: "off", ...attrs }) as HTMLInputElement;

  const render = () => {
    const nm = text({ placeholder: "Acme Cabs", "aria-label": "Company name", required: "" });
    const phone = text({ type: "tel", placeholder: "+44 20 7123 4567", "aria-label": "Phone" });
    const wa = text({ type: "tel", placeholder: "Same, or another number", "aria-label": "WhatsApp" });
    const book = text({ type: "url", placeholder: "https://…", "aria-label": "Booking page or app link" });
    const area = text({ placeholder: "Town or postcode you're based in", "aria-label": "Where you're based", required: "" });
    const radius = h("select", { "aria-label": "How far you go" }, ...[10, 25, 50, 100].map((k) => h("option", { value: String(k), selected: k === 25 }, `${k} km`))) as HTMLSelectElement;
    const licence = text({ placeholder: "Operator licence number", "aria-label": "Licence" });
    const fixed = text({ placeholder: "Airport £45, Station £8", "aria-label": "Fixed fares" });
    const email = text({ type: "email", placeholder: "you@company.com", "aria-label": "Contact email", required: "" });
    const needBoxes = NEEDS.map((n) => ({ n, box: h("input", { type: "checkbox" }) as HTMLInputElement }));
    const pledge = h("input", { type: "checkbox" }) as HTMLInputElement;
    let tier: "free" | "partner" = "free";
    const tierBtn = (id: "free" | "partner", title: string, price: string, lines: string[]) => {
      const b = h("button", { type: "button", class: "tx-tier", "aria-pressed": String(tier === id), onclick: () => {
        tier = id; haptic("select");
        for (const x of tiers.children) x.setAttribute("aria-pressed", String(x === b));
      } }, h("strong", {}, title), h("span", { class: "tx-price" }, price), h("ul", {}, ...lines.map((l) => h("li", {}, l))));
      return b;
    };
    const tiers = h("div", { class: "tx-tiers" },
      tierBtn("free", "Listed", "Free", ["Shown to riders nearby", "Call, WhatsApp and your booking link", "Every ride carries a Terreno reference"]),
      tierBtn("partner", "Partner", "A small flat fee per booking", ["Everything in Listed", "Bookings straight into your dispatch", "A monthly report of the rides Terreno sent you", "Paid by the company. Never by drivers"]));
    const status = h("p", { class: "muted small", "aria-live": "polite" });
    const send = h("button", { class: "primary-btn", type: "submit" }, "List my company");
    const form = h("form", { class: "tx-form", onsubmit: async (e: Event) => {
      e.preventDefault();
      if (!nm.value.trim() || !email.value.includes("@")) { status.textContent = "A name and a contact email, please."; haptic("warn"); return; }
      if (!phone.value.trim() && !wa.value.trim() && !book.value.trim()) { status.textContent = "Add at least one way for riders to reach you."; haptic("warn"); return; }
      send.setAttribute("disabled", ""); status.textContent = "Finding your area…";
      const hits = await geocode(area.value).catch(() => []);
      const at = hits.find((r) => !r.run);
      if (!at) { status.textContent = "Couldn't find that place. Try a town or postcode."; send.removeAttribute("disabled"); haptic("warn"); return; }
      const listing: Listing = {
        id: `listing:local-${Date.now().toString(36)}`, name: nm.value.trim(), lon: at.lon, lat: at.lat, radiusKm: Number(radius.value),
        phone: phone.value.trim() || undefined, whatsapp: wa.value.trim() || undefined, booking: book.value.trim() || undefined,
        needs: needBoxes.filter((x) => x.box.checked).map((x) => x.n.id), licence: licence.value.trim() || undefined,
        fixed: fixed.value.split(",").map((s) => s.trim()).filter(Boolean).map((s) => { const m = s.match(/^(.*?)\s+(\S*\d\S*)$/); return m ? { label: m[1], price: m[2] } : { label: s, price: "" }; }),
        driversKeepFare: pledge.checked, email: email.value.trim(), tier, listedAt: Date.now(), source: "listing",
      };
      const where = await submitListing(listing);
      haptic("success");
      panel.replaceChildren(h("div", { class: "mp-head" }, h("h2", {}, "You're listed"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: close })),
        h("p", { class: "mp-intro" }, where === "cloud"
          ? `${listing.name} shows to riders around ${at.name} now. We'll check the licence and be in touch at ${listing.email}${tier === "partner" ? " to set up Partner bookings" : ""}.`
          : `${listing.name} shows to riders around ${at.name} on this device. When Terreno's servers are switched on, listings go live for everyone.`),
        h("div", { class: "pro-actions" }, h("button", { class: "primary-btn", onclick: close }, "Done")));
    } },
      field("Company name", nm), h("div", { class: "mp-fields" }, field("Phone", phone), field("WhatsApp", wa)),
      field("Booking page or app", book, "We add the rider's reference to the link."),
      h("div", { class: "mp-fields" }, field("Where you're based", area), field("How far you go", radius)),
      h("fieldset", { class: "tx-checks" }, h("legend", {}, "You can take"), ...needBoxes.map(({ n, box }) => h("label", {}, box, n.label))),
      h("div", { class: "mp-fields" }, field("Licence", licence), field("Fixed fares", fixed)),
      field("Contact email", email, "Only for us to reach you. Riders never see it."),
      h("h3", { class: "tx-tiers-title" }, "How you'd like to be listed"), tiers,
      h("label", { class: "tx-pledge" }, pledge, h("span", {}, h("strong", {}, "Drivers keep the full fare."), " Any Terreno fee is the company's, never passed on to drivers. Riders see a badge.")),
      h("p", { class: "muted small" }, "Riders see firms in order of who can take them: covers the pickup, has what they need, licence checked, nearest. Paying never moves you up."),
      h("div", { class: "pro-actions" }, send), status);
    panel.replaceChildren(
      h("div", { class: "mp-head" }, h("h2", {}, "List your taxi company"), h("button", { class: "icon-btn", "aria-label": "Close", html: icons.close, onclick: close })),
      h("p", { class: "mp-intro" }, "Get riders straight to your dispatch, next to Uber and Lyft. Your drivers, your fares, your customers."),
      form);
  };
  app.actions.set("taxi:list", { label: "List your taxi company", run: () => { render(); panel.hidden = false; haptic("tap"); } });
  return panel;
}
