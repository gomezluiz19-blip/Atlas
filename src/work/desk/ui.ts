// The Work desk: your records on the map. It opens on what needs you (each alert told as a chain of
// consequences, with the money at stake), then everything, by kind. Every record is a pin; tap one, on the map
// or in the list, for its card: where it is, what it belongs to and waits on, what it holds up, how to track it,
// and the services it may need nearby. In the field the day becomes a round. Records come from a CRM or
// spreadsheet export (CSV), or are added by hand; three example books show the idea first.
import { Rectangle } from "cesium";
import type { WorkCtx } from "../hub";
import { WorkLayer, type WorkFeature } from "../layer";
import { h } from "../../ui/dom";
import { icons } from "../../ui/icons";
import { haptic } from "../../ui/haptics";
import { flyToPlace, geocode } from "../../ui/search";
import { csvText } from "../../util/csv";
import { loadJson, saveJson } from "../../util/storage";
import { carrierOf, trackUrl } from "../../myplaces/packages";
import { parseCsv } from "../../pro/office/model";
import { demoBook } from "./demo";
import { SERVICES, servicesNear } from "./services";
import {
  attention, clientOf, daysBetween, downstream, HEALTH, isoDay, KINDS, lineage, projected, recsFromRows, ROLES, round, slip,
  type Book, type Health, type Kind, type Rec, type Role, type Service,
} from "./model";

const KEY = "atlas.work.desk.v1";
type Stored = Book & { example?: boolean };
const read = (): Stored | null => loadJson<Stored | null>(KEY, null, (v) => !!v && typeof v === "object" && Array.isArray((v as Book).recs));
const write = (b: Stored) => saveJson(KEY, b);
const today = () => isoDay(Date.now());

/** The services worth offering for a kind of record, when it doesn't name its own. */
const SERVICE_FOR: Record<Kind, Service[]> = {
  client: ["legal", "accounting", "insurance"], order: ["courier", "freight"], shipment: ["customs", "freight", "courier"], job: ["parts", "courier"],
  case: ["legal", "court", "notary"], visit: ["hotel", "courier"], site: ["freight", "insurance"], asset: ["parts", "insurance"],
};

let layer: WorkLayer | null = null, near: WorkLayer | null = null;
const dateText = (iso?: string) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
const money = (v?: number, cur = "USD") => {
  if (v === undefined) return "";
  try { return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v); } catch { return `${v} ${cur}`; }
};
const dot = (health: Health) => h("i", { class: "dk-dot", style: `--hc:${HEALTH[health].color}`, "aria-hidden": "true" });
const when = (r: Rec, t: string) => {
  if (r.health === "done") return "Done";
  if (!r.due) return r.status;
  const d = daysBetween(t, r.due);
  return d === 0 ? "Today" : d === 1 ? "Tomorrow" : d === -1 ? "Yesterday" : d < 0 ? `${-d} days ago` : d < 14 ? `In ${d} days` : dateText(r.due);
};

/** The Work desk's home, for the Work hub. `tools` opens the tools for your field (the line map). */
export function deskHome(ctx: WorkCtx, opts: { tools: () => void }): HTMLElement {
  const root = h("div", { class: "dk" });
  const book = read();
  if (!book) { root.append(...welcome(ctx, opts)); return root; }
  root.append(...home(ctx, book, opts));
  return root;
}

function welcome(ctx: WorkCtx, opts: { tools: () => void }): (HTMLElement | string)[] {
  const start = (role: Role) => { const b: Stored = { ...demoBook(role, today()), example: true }; write(b); haptic("select"); ctx.home(); };
  return [
    h("p", { class: "mp-intro" }, "Your work as it really sits: clients, orders, shipments, jobs and cases on the map, with what each one waits on and what happens if it slips."),
    h("h3", { class: "group-title" }, "How do you work?"),
    h("div", { class: "dk-roles" }, ...(Object.keys(ROLES) as Role[]).map((r) =>
      h("button", { class: "dk-role", onclick: () => start(r) }, h("strong", {}, ROLES[r].label), h("span", {}, ROLES[r].who), h("small", {}, "Try it with an example ›")))),
    h("div", { class: "pro-actions" },
      h("button", { class: "primary-btn", onclick: () => importScreen(ctx, null) }, "Bring my records"),
      h("button", { class: "pill-btn", onclick: opts.tools }, "Tools for your field")),
    h("p", { class: "muted small" }, "Records stay on this device. Export from any CRM or spreadsheet as CSV; Terreno reads the usual columns."),
  ];
}

function home(ctx: WorkCtx, book: Stored, opts: { tools: () => void }): (HTMLElement | string)[] {
  const t = today(), recs = book.recs;
  const alerts = attention(recs, t);
  const proj = projected(recs);
  drawAll(ctx, book);

  // How you work: switching an example swaps in that example; your own records stay, read a different way.
  const roles = h("div", { class: "segmented dk-seg", role: "tablist" }, ...(Object.keys(ROLES) as Role[]).map((r) =>
    h("button", { role: "tab", "aria-selected": String(book.role === r), onclick: () => {
      write(book.example ? { ...demoBook(r, t), example: true } : { ...book, role: r });
      ctx.home();
    } }, ROLES[r].label)));

  const needs = alerts.length
    ? h("div", { class: "dk-alerts" }, ...alerts.slice(0, 6).map((a) =>
      h("button", { class: "dk-alert", style: `--hc:${HEALTH[a.rec.health].color}`, onclick: () => openRec(ctx, a.rec.id) },
        h("span", { class: "dk-alert-k" }, HEALTH[a.rec.health].label, a.atStake ? ` · ${money(a.atStake, a.rec.currency ?? a.knocks.find((k) => k.rec.currency)?.rec.currency)} at stake` : ""),
        h("span", { class: "dk-alert-t" }, a.sentence))))
    : h("p", { class: "dk-clear" }, "Nothing's slipping. Everything is on track.");

  // In the field: the day as a round.
  let roundBox: HTMLElement | "" = "";
  if (book.role === "field") {
    const start = recs.find((r) => r.kind === "site");
    const rd = round(recs, t, start?.lon !== undefined ? { lon: start.lon, lat: start.lat! } : undefined);
    roundBox = rd.stops.length ? h("section", { class: "dk-round" },
      h("div", { class: "dk-round-head" }, h("strong", {}, `Today's round: ${rd.stops.length} stop${rd.stops.length === 1 ? "" : "s"}`), h("span", {}, `about ${Math.round(rd.km * 1.3)} km`)),
      h("ol", {}, ...rd.stops.map((s) => h("li", {}, h("button", { class: "link-btn", onclick: () => openRec(ctx, s.id) }, s.title), h("small", {}, ` ${s.sub ?? ""}`)))),
      rd.waiting.length ? h("p", { class: "muted small" }, `Left out, can't go ahead yet: ${rd.waiting.map((w) => w.title).join(", ")}.`) : "",
      h("button", { class: "pill-btn", onclick: () => showRound(ctx, book, rd.stops, start) }, "Show the round")) : "";
  }

  // Everything, by kind.
  const kinds = ROLES[book.role].kinds.filter((k) => recs.some((r) => r.kind === k));
  for (const k of Object.keys(KINDS) as Kind[]) if (!kinds.includes(k) && recs.some((r) => r.kind === k)) kinds.push(k);
  let shown: Kind | "all" = "all";
  const list = h("div", { class: "dk-list" });
  const fill = () => list.replaceChildren(...recs
    .filter((r) => shown === "all" || r.kind === shown)
    .sort((a, b) => HEALTH[a.health].rank - HEALTH[b.health].rank || (proj.get(a.id) ?? "9").localeCompare(proj.get(b.id) ?? "9"))
    .map((r) => h("button", { class: "list-row dk-row", onclick: () => openRec(ctx, r.id) },
      dot(r.health),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, r.title), h("span", { class: "list-sub" }, [KINDS[r.kind].one, r.status].filter(Boolean).join(" · "))),
      h("span", { class: `dk-when${slip(r, proj.get(r.id), t) ? " late" : ""}` }, when(r, t)))));
  const chips = h("div", { class: "dk-kinds", role: "group", "aria-label": "Show" },
    ...(["all", ...kinds] as (Kind | "all")[]).map((k) => {
      const b = h("button", { class: "chip", "aria-pressed": String(k === shown), onclick: () => { shown = k; for (const c of chips.children) c.setAttribute("aria-pressed", String(c === b)); fill(); } },
        k === "all" ? `All ${recs.length}` : `${KINDS[k].many} ${recs.filter((r) => r.kind === k).length}`);
      return b;
    }));
  fill();

  return [
    roles,
    book.example ? h("p", { class: "dk-example" }, `An example ${ROLES[book.role].label.toLowerCase() === "my company" ? "company" : "book"}, to show the idea. `, h("button", { class: "link-btn", onclick: () => importScreen(ctx, book) }, "Bring your own records ›")) : "",
    h("h3", { class: "group-title" }, "Needs you"),
    needs,
    roundBox,
    h("h3", { class: "group-title" }, "Everything"),
    chips, list,
    h("div", { class: "pro-actions dk-actions" },
      h("button", { class: "primary-btn", onclick: () => editScreen(ctx, book, null) }, "Add"),
      h("button", { class: "pill-btn", onclick: () => fitAll(ctx, recs) }, "See it all"),
      h("button", { class: "pill-btn", onclick: () => importScreen(ctx, book) }, "Bring records in"),
      h("button", { class: "pill-btn", onclick: () => exportCsv(book) }, "Export")),
    h("button", { class: "dk-tools", onclick: opts.tools },
      h("span", { class: "work-tool-icon", style: "--c:var(--clay)", html: icons.briefcase }),
      h("span", { class: "work-tool-text" }, h("strong", {}, "Tools for your field"), h("span", {}, "Freight, construction, mining, an office, a school district and more, each with its own desk"))),
    h("p", { class: "muted small" }, "Kept on this device. ",
      h("button", { class: "link-btn", onclick: () => { if (confirm(book.example ? "Put the example away?" : "Clear every record from this device?")) { localStorage.removeItem(KEY); layer?.clear(); near?.clear(); ctx.home(); } } }, book.example ? "Put the example away" : "Clear everything")),
  ];
}

// ---- The map ------------------------------------------------------------------------------------------------

function drawAll(ctx: WorkCtx, book: Book, focus?: string) {
  layer ??= new WorkLayer(ctx.app, "work-desk", "My work", "#9c4a32");
  const by = new Map(book.recs.map((r) => [r.id, r]));
  const f: WorkFeature[] = [];
  for (const r of book.recs) {
    if (r.route && r.route.length > 1) f.push({ id: `${r.id}-route`, kind: "line", pts: r.route, color: r.health === "done" ? "#8c8f87" : HEALTH[r.health].color, solid: true, dashed: r.health === "late" || r.health === "blocked" });
    if (r.lon === undefined || r.lat === undefined) continue;
    f.push({ id: r.id, kind: "point", pts: [[r.lon, r.lat]], color: HEALTH[r.health].color, label: r.id === focus || !focus ? r.title : undefined, big: r.id === focus, tap: () => openRec(ctx, r.id) });
  }
  // The one you're looking at: thin lines to what it belongs to and what it waits on.
  const fr = focus ? by.get(focus) : undefined;
  if (fr?.lon !== undefined) for (const other of [fr.parent, ...(fr.needs ?? []), ...downstream(book.recs, fr.id).map((x) => x.id)].filter(Boolean).map((id) => by.get(id!)))
    if (other?.lon !== undefined) f.push({ id: `${fr.id}-${other.id}`, kind: "line", pts: [[fr.lon, fr.lat!], [other.lon, other.lat!]], color: "#9c4a32", solid: true, dashed: true });
  layer.set(f, "My work");
}

function fitAll(ctx: WorkCtx, recs: Rec[]) {
  const pts = recs.filter((r) => r.lon !== undefined).map((r) => [r.lon!, r.lat!]);
  if (!pts.length) return;
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const pad = Math.max(0.02, (e - w) * 0.15, (n - s) * 0.15);
  ctx.app.globe.viewer.camera.flyTo({ destination: Rectangle.fromDegrees(w - pad, s - pad, e + pad, n + pad), duration: 1.6 });
}

function showRound(ctx: WorkCtx, book: Book, stops: Rec[], start?: Rec) {
  drawAll(ctx, book);
  const pts: [number, number][] = [...(start?.lon !== undefined ? [[start.lon, start.lat!] as [number, number]] : []), ...stops.map((s) => [s.lon!, s.lat!] as [number, number])];
  near ??= new WorkLayer(ctx.app, "work-near", "Near my work", "#9c4a32");
  near.set([{ id: "round", kind: "line", pts, color: "#9c4a32", solid: true },
    ...stops.map((s, i) => ({ id: `stop-${s.id}`, kind: "point" as const, pts: [[s.lon!, s.lat!]] as [number, number][], color: "#9c4a32", label: `${i + 1}. ${s.title}`, tap: () => openRec(ctx, s.id) }))], "Today's round");
  fitAll(ctx, stops);
}

// ---- One record ---------------------------------------------------------------------------------------------

function openRec(ctx: WorkCtx, id: string) {
  const book = read();
  const r = book?.recs.find((x) => x.id === id);
  if (!book || !r) return;
  haptic("select");
  ctx.open();
  const t = today(), proj = projected(book.recs), late = slip(r, proj.get(r.id), t);
  drawAll(ctx, book, r.id);
  if (r.lon !== undefined) void flyToPlace(ctx.app.globe, { name: r.title, lon: r.lon, lat: r.lat!, radius: r.route ? 900_000 : r.kind === "client" ? 4000 : 1500 });
  const save = (next: Rec) => { book.recs = book.recs.map((x) => (x.id === next.id ? next : x)); write(book); openRec(ctx, next.id); };
  const row = (x: Rec, extra = "") => h("button", { class: "list-row dk-row", onclick: () => openRec(ctx, x.id) }, dot(x.health),
    h("span", { class: "list-text" }, h("span", { class: "list-title" }, x.title), h("span", { class: "list-sub" }, [KINDS[x.kind].one, x.status].join(" · "))), extra ? h("span", { class: "dk-when late" }, extra) : "");

  const holds = downstream(book.recs, r.id);
  const up = lineage(book.recs, r.id);
  const waits = (r.needs ?? []).map((n) => book.recs.find((x) => x.id === n)).filter((x): x is Rec => !!x);
  const client = clientOf(book.recs, r.id);
  const trackHref = r.track ? r.track.url ?? (carrierOf(r.track.number) ? trackUrl(carrierOf(r.track.number)!, r.track.number) : `https://parcelsapp.com/en/tracking/${encodeURIComponent(r.track.number)}`) : "";
  const alert = attention(book.recs, t).find((a) => a.rec.id === r.id);

  // Services nearby: tap one to find it around this record.
  const found = h("div", { class: "dk-found" });
  const services = (r.services?.length ? r.services : SERVICE_FOR[r.kind]);
  const svc = r.lon === undefined ? "" : h("section", {},
    h("h3", { class: "group-title" }, "Nearby"),
    h("div", { class: "dk-kinds" }, ...services.map((s) => h("button", { class: "chip", onclick: async (e: Event) => {
      const chip = e.currentTarget as HTMLElement;
      for (const c of chip.parentElement!.children) c.setAttribute("aria-pressed", String(c === chip));
      found.replaceChildren(h("div", { class: "loading" }, h("div", { class: "spinner" }), `Finding ${SERVICES[s].label.toLowerCase()}…`));
      const list = await servicesNear(s, { lon: r.lon!, lat: r.lat! }).catch(() => null);
      near ??= new WorkLayer(ctx.app, "work-near", "Near my work", "#9c4a32");
      if (!list?.length) { found.replaceChildren(h("p", { class: "muted small" }, list ? `No ${SERVICES[s].label.toLowerCase()} mapped within 5 km.` : "Couldn't reach OpenStreetMap just now.")); near.clear(); return; }
      near.set(list.map((x, i) => ({ id: `near-${i}`, kind: "point" as const, pts: [[x.lon, x.lat]] as [number, number][], color: "#3563d6", label: x.name })), SERVICES[s].label);
      found.replaceChildren(...list.map((x) => h("div", { class: "dk-place" },
        h("span", { class: "list-text" }, h("span", { class: "list-title" }, x.name), h("span", { class: "list-sub" }, [x.km < 1 ? `${Math.round(x.km * 1000)} m` : `${x.km.toFixed(1)} km`, x.address].filter(Boolean).join(" · "))),
        x.phone ? h("a", { class: "pill-btn", href: `tel:${x.phone.replace(/[^\d+]/g, "")}` }, "Call") : "",
        x.web ? h("a", { class: "pill-btn", href: x.web, target: "_blank", rel: "noopener" }, "Website") : "")));
    } }, SERVICES[s].label))), found);

  const status = h("input", { class: "pro-url", value: r.status, "aria-label": "Status in your words" }) as HTMLInputElement;
  const health = h("select", { "aria-label": "How it stands" }, ...(Object.keys(HEALTH) as Health[]).map((x) => h("option", { value: x, selected: x === r.health }, HEALTH[x].label))) as HTMLSelectElement;
  const note = h("input", { class: "pro-url", placeholder: "Add a note to its history", "aria-label": "Note" }) as HTMLInputElement;

  ctx.show(r.title, () => { near?.clear(); ctx.home(); },
    h("div", { class: "dk-head" },
      h("span", { class: "dk-kicker" }, KINDS[r.kind].one, client && client.id !== r.id ? ` · ${client.title}` : ""),
      h("span", { class: "dk-pill", style: `--hc:${HEALTH[r.health].color}` }, HEALTH[r.health].label)),
    r.sub ? h("p", { class: "mp-intro" }, r.sub) : "",
    h("p", { class: "dk-status" }, r.status),
    alert ? h("p", { class: "dk-conseq" }, alert.sentence) : "",
    h("dl", { class: "dk-facts" },
      ...(r.due ? [h("dt", {}, "Promised"), h("dd", {}, dateText(r.due))] : []),
      ...(proj.get(r.id) && proj.get(r.id) !== r.due ? [h("dt", {}, "Now expected"), h("dd", { class: late ? "late" : "" }, `${dateText(proj.get(r.id))}${late ? ` · ${late} day${late === 1 ? "" : "s"} late` : ""}`)] : []),
      ...(r.value !== undefined ? [h("dt", {}, "Value"), h("dd", {}, money(r.value, r.currency))] : []),
      ...(r.owner ? [h("dt", {}, "Owner"), h("dd", {}, r.owner)] : []),
      ...(r.track ? [h("dt", {}, "Tracking"), h("dd", {}, h("a", { class: "link-btn", href: trackHref, target: "_blank", rel: "noopener" }, `${r.track.number} ›`))] : [])),
    holds.length ? h("section", {}, h("h3", { class: "group-title" }, "What it holds up"), ...holds.map((x) => { const d = slip(x, proj.get(x.id), t); return row(x, d ? `${d}d late${x.value ? ` · ${money(x.value, x.currency)}` : ""}` : ""); })) : "",
    waits.length ? h("section", {}, h("h3", { class: "group-title" }, "Waits on"), ...waits.map((x) => row(x))) : "",
    up.length ? h("section", {}, h("h3", { class: "group-title" }, "Part of"), ...up.map((x) => row(x))) : "",
    svc,
    h("section", {}, h("h3", { class: "group-title" }, "Update"),
      h("div", { class: "mp-fields" }, h("label", { class: "mp-field" }, h("span", {}, "Status"), status), h("label", { class: "mp-field" }, h("span", {}, "Stands"), health)),
      note,
      h("div", { class: "pro-actions" },
        h("button", { class: "primary-btn", onclick: () => {
          const hist = [...(r.history ?? [])];
          if (note.value.trim()) hist.push({ at: today(), text: note.value.trim() });
          if (status.value.trim() !== r.status) hist.push({ at: today(), text: `Status: ${status.value.trim()}` });
          haptic("confirm");
          save({ ...r, status: status.value.trim() || r.status, health: health.value as Health, history: hist });
        } }, "Save"),
        r.health !== "done" ? h("button", { class: "pill-btn", onclick: () => { haptic("success"); save({ ...r, health: "done", status: "Done", history: [...(r.history ?? []), { at: today(), text: "Done" }] }); } }, "Mark done") : "",
        h("button", { class: "pill-btn", onclick: () => editScreen(ctx, book, r) }, "Edit"))),
    r.history?.length ? h("section", {}, h("h3", { class: "group-title" }, "History"),
      h("ol", { class: "dk-history" }, ...[...r.history].reverse().map((x) => h("li", {}, h("small", {}, dateText(x.at)), " ", x.text)))) : "",
  );
}

// ---- Adding and editing -----------------------------------------------------------------------------------------

function editScreen(ctx: WorkCtx, book: Stored, r: Rec | null) {
  const kind = h("select", { "aria-label": "Kind" }, ...(Object.keys(KINDS) as Kind[]).map((k) => h("option", { value: k, selected: k === (r?.kind ?? ROLES[book.role].kinds[0]) }, KINDS[k].one))) as HTMLSelectElement;
  const title = h("input", { class: "pro-url", value: r?.title ?? "", placeholder: "Name or reference", "aria-label": "Name" }) as HTMLInputElement;
  const sub = h("input", { class: "pro-url", value: r?.sub ?? "", placeholder: "A second line: who, what, an address", "aria-label": "Details" }) as HTMLInputElement;
  const where = h("input", { class: "pro-url", placeholder: r?.lon !== undefined ? "Keep where it is, or type a new address" : "Address, town or place", "aria-label": "Where" }) as HTMLInputElement;
  const due = h("input", { type: "date", class: "pro-url", value: r?.due ?? "", "aria-label": "Promised for" }) as HTMLInputElement;
  const eta = h("input", { type: "date", class: "pro-url", value: r?.eta ?? "", "aria-label": "Now expected" }) as HTMLInputElement;
  const value = h("input", { type: "number", class: "pro-url", value: r?.value?.toString() ?? "", placeholder: "0", "aria-label": "Value" }) as HTMLInputElement;
  const others = book.recs.filter((x) => x.id !== r?.id);
  const parent = h("select", { "aria-label": "Part of" }, h("option", { value: "" }, "Nothing"), ...others.map((x) => h("option", { value: x.id, selected: x.id === r?.parent }, `${KINDS[x.kind].one}: ${x.title}`))) as HTMLSelectElement;
  const needs = h("select", { "aria-label": "Waits on", multiple: true, size: Math.min(5, Math.max(2, others.length)) }, ...others.map((x) => h("option", { value: x.id, selected: !!r?.needs?.includes(x.id) }, `${KINDS[x.kind].one}: ${x.title}`))) as HTMLSelectElement;
  const trackNo = h("input", { class: "pro-url", value: r?.track?.number ?? "", placeholder: "Container, parcel or AWB number", "aria-label": "Tracking number" }) as HTMLInputElement;
  const msg = h("p", { class: "muted small", "aria-live": "polite" });
  let picked: { lon: number; lat: number } | null = r?.lon !== undefined ? { lon: r.lon, lat: r.lat! } : null;
  const tap = h("button", { class: "pill-btn", type: "button", onclick: () => { ctx.hide(); ctx.app.pickOnce("Tap where it is", (p) => { picked = { lon: p.lon, lat: p.lat }; where.value = ""; where.placeholder = "Placed on the map"; ctx.unhide(); }, () => ctx.unhide()); } }, "Tap the map");

  ctx.show(r ? `Edit ${r.title}` : "Add to your work", () => (r ? openRec(ctx, r.id) : ctx.home()),
    h("div", { class: "mp-fields" }, h("label", { class: "mp-field" }, h("span", {}, "Kind"), kind), h("label", { class: "mp-field" }, h("span", {}, "Part of"), parent)),
    h("label", { class: "mp-field" }, h("span", {}, "Name"), title),
    h("label", { class: "mp-field" }, h("span", {}, "Details"), sub),
    h("label", { class: "mp-field" }, h("span", {}, "Where"), where), tap,
    h("div", { class: "mp-fields" }, h("label", { class: "mp-field" }, h("span", {}, "Promised for"), due), h("label", { class: "mp-field" }, h("span", {}, "Now expected"), eta)),
    h("div", { class: "mp-fields" }, h("label", { class: "mp-field" }, h("span", {}, "Value"), value), h("label", { class: "mp-field" }, h("span", {}, "Tracking"), trackNo)),
    h("label", { class: "mp-field" }, h("span", {}, "Waits on"), needs),
    h("div", { class: "pro-actions" },
      h("button", { class: "primary-btn", onclick: async () => {
        if (!title.value.trim()) { msg.textContent = "Give it a name."; haptic("warn"); return; }
        if (where.value.trim()) {
          msg.textContent = "Finding it on the map…";
          const hit = (await geocode(where.value.trim()).catch(() => [])).find((x) => !x.run);
          if (!hit) { msg.textContent = "Couldn't find that place. Try a town or postcode, or tap the map."; haptic("warn"); return; }
          picked = { lon: hit.lon, lat: hit.lat };
        }
        const next: Rec = {
          ...(r ?? { id: `r${Date.now().toString(36)}`, status: "New", health: "ok" as Health }),
          kind: kind.value as Kind, title: title.value.trim(), sub: sub.value.trim() || undefined,
          lon: picked?.lon, lat: picked?.lat, due: due.value || undefined, eta: eta.value || undefined,
          value: value.value ? Number(value.value) : undefined, parent: parent.value || undefined,
          needs: [...needs.selectedOptions].map((o) => o.value), track: trackNo.value.trim() ? { number: trackNo.value.trim(), url: r?.track?.number === trackNo.value.trim() ? r.track.url : undefined } : undefined,
        };
        if (!next.needs?.length) delete next.needs;
        book.recs = r ? book.recs.map((x) => (x.id === r.id ? next : x)) : [...book.recs, next];
        write(book);
        haptic("success");
        openRec(ctx, next.id);
      } }, r ? "Save" : "Add"),
      r ? h("button", { class: "link-btn danger", onclick: () => {
        if (!confirm(`Delete ${r.title}?`)) return;
        book.recs = book.recs.filter((x) => x.id !== r.id).map((x) => ({ ...x, parent: x.parent === r.id ? undefined : x.parent, needs: x.needs?.filter((n) => n !== r.id) }));
        write(book); ctx.home();
      } }, "Delete") : ""),
    msg);
}

// ---- Bringing records in, and taking them out -------------------------------------------------------------------

function importScreen(ctx: WorkCtx, book: Stored | null) {
  const area = h("textarea", { class: "pro-url dk-paste", rows: 8, placeholder: "Name,Type,Status,Address,Due,Value,Parent,Depends on\nHalden Foods,Client,Active,Oslo,,,,\nOrder 1042,Order,Awaiting stock,Oslo,2026-03-20,48000,Halden Foods,MSKU 7714200" , "aria-label": "Paste CSV" }) as HTMLTextAreaElement;
  const file = h("input", { type: "file", accept: ".csv,text/csv", hidden: true, onchange: async () => { const f = file.files?.[0]; if (f) area.value = await f.text(); } }) as HTMLInputElement;
  const msg = h("p", { class: "muted small", "aria-live": "polite" });
  const role = h("select", { "aria-label": "How you work" }, ...(Object.keys(ROLES) as Role[]).map((r) => h("option", { value: r, selected: r === (book?.role ?? "company") }, ROLES[r].label))) as HTMLSelectElement;
  ctx.show("Bring your records", () => ctx.home(),
    h("p", { class: "mp-intro" }, "Export from your CRM, job system or a spreadsheet as CSV, then paste it here or choose the file. Names, types, statuses, addresses, dates, amounts and links between rows are understood."),
    h("label", { class: "mp-field" }, h("span", {}, "How you work"), role),
    area, file,
    h("div", { class: "pro-actions" },
      h("button", { class: "pill-btn", onclick: () => file.click() }, "Choose a file"),
      h("button", { class: "primary-btn", onclick: async () => {
        const rows = parseCsv(area.value);
        if (!rows.length) { msg.textContent = "Nothing to read yet: paste a CSV with a header row."; haptic("warn"); return; }
        const recs = recsFromRows(rows, ROLES[role.value as Role].kinds[0]);
        // Find each address on the map, one at a time (the geocoder asks for that).
        const toFind = recs.filter((r) => r.where).slice(0, 60);
        let n = 0, missed = 0;
        for (const r of toFind) {
          msg.textContent = `Finding places on the map… ${++n} of ${toFind.length}`;
          const hit = (await geocode(r.where!).catch(() => [])).find((x) => !x.run);
          if (hit) { r.lon = hit.lon; r.lat = hit.lat; } else missed++;
          delete r.where;
          await new Promise((res) => setTimeout(res, 250));
        }
        for (const r of recs) delete r.where;
        const keep = book && !book.example ? book.recs : [];
        write({ role: role.value as Role, recs: [...keep, ...recs] });
        haptic("success");
        ctx.app.toast(`${recs.length} record${recs.length === 1 ? "" : "s"} in${missed ? `; ${missed} couldn't be placed (add a place on each)` : ""}.`, 6000);
        ctx.home();
      } }, "Bring them in")),
    msg);
}

function exportCsv(book: Book) {
  const rows = [["id", "kind", "name", "details", "status", "health", "due", "eta", "value", "currency", "parent", "depends on", "tracking", "lat", "lon"],
    ...book.recs.map((r) => [r.id, r.kind, r.title, r.sub ?? "", r.status, r.health, r.due ?? "", r.eta ?? "", r.value ?? "", r.currency ?? "", r.parent ?? "", (r.needs ?? []).join(";"), r.track?.number ?? "", r.lat ?? "", r.lon ?? ""])];
  const a = h("a", { href: URL.createObjectURL(new Blob([csvText(rows)], { type: "text/csv" })), download: `terreno-work-${today()}.csv` }) as HTMLAnchorElement;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
