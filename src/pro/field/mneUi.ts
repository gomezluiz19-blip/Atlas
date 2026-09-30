// Field Ops' monitoring screens: the response in 4W (who, what, where, when)
// with people reached by sex and age, indicators against targets, the gap
// matrix, supplies with weeks of cover, several new sites planned at once,
// communities brought in from Kobo or a spreadsheet, and the donor report.
import { h } from "../../ui/dom";
import type { WorkCtx } from "../../work/hub";
import { newId } from "../../work/store";
import { parseCsv } from "../office/model";
import { fmt, issueQueue, kmText, today } from "../kit/ops";
import { empty, field, input, lines, list, row, select, title } from "../kit/ui";
import { downloadCsv, pickFile, printReport } from "../kit/report";
import { gaps, needsTally, SERVICES, SITE_KINDS, type Programme, type Service } from "./model";
import {
  communitiesFromRows, FOUR_W_HEAD, fourW, gapMatrix, indicatorProgress, planSites, reached, SECTORS, stockCover, total, walkHours,
  type Activity, type Sector,
} from "./mne";

const bar = (share: number, color = "#30d158") => h("span", { class: "fo-bar" }, h("i", { style: `width:${Math.min(100, share * 100)}%;background:${color}` }));

/** Women, men, girls and boys as one stacked bar with its numbers. */
function sexAge(r: { women: number; men: number; girls: number; boys: number }) {
  const t = Math.max(1, total(r));
  const parts: [string, number, string][] = [["Women", r.women, "#ff375f"], ["Men", r.men, "#0a84ff"], ["Girls", r.girls, "#ff9fb8"], ["Boys", r.boys, "#7cc4ff"]];
  return h("div", {},
    h("div", { class: "po-whip-bar" }, ...parts.filter((p) => p[1]).map(([l, n, c]) => h("i", { style: `flex:${n};background:${c}`, title: `${l}: ${fmt(n)}` }))),
    h("div", { class: "pol-legend" }, ...parts.map(([l, n, c]) => h("span", {}, h("i", { style: `background:${c}` }), `${l} ${fmt(n)} (${Math.round((n / t) * 100)}%)`))));
}

export function responsePanel(ctx: WorkCtx, p: Programme, save: () => void, reopen: () => void) {
  const acts = p.activities ?? [], r = reached(acts), gm = gapMatrix(p, acts), inds = indicatorProgress(p.indicators ?? [], acts);
  const orgs = [...new Set(acts.map((a) => a.org))];
  const name = (id: string) => p.communities.find((c) => c.id === id)?.name ?? "?";
  return h("div", {},
    lines(`${fmt(total(r))} people reached by ${acts.filter((a) => a.status !== "planned").length} activities from ${orgs.length} ${orgs.length === 1 ? "organisation" : "organisations"}; ${acts.filter((a) => a.status === "planned").length} planned.`,
      gm.gaps.length ? `⚠️ ${gm.gaps.length} needs with no one working on them, in communities of ${fmt(gm.peopleInGaps)} people.` : "Every stated need has someone working on it.",
      gm.overlaps.length ? `${gm.overlaps.length} ${gm.overlaps.length === 1 ? "place" : "places"} where two or more organisations do the same thing (${gm.overlaps.slice(0, 3).map((o) => `${o.sector} in ${o.c.name}`).join(", ")}): worth coordinating.` : ""),
    sexAge(r),
    title("Indicators"),
    inds.length ? h("div", { class: "fo-inds" }, ...inds.map((x) => h("div", { class: "fo-ind" },
      h("span", {}, x.i.name), bar(x.share, x.share >= 1 ? "#30d158" : x.share >= 0.6 ? "#ffd60a" : "#ff9f0a"),
      h("small", {}, `${fmt(x.value)} of ${fmt(x.i.target)} ${x.i.unit} · ${Math.round(x.share * 100)}%${x.i.manual !== undefined ? " (entered)" : ""}`)))) : empty("No indicators yet."),
    indicatorAdder(p, save, reopen),
    title("Gap matrix"),
    h("div", { class: "fo-matrix", style: `grid-template-columns: minmax(84px, 1.4fr) repeat(${SECTORS.length}, 1fr)` },
      h("b", {}), ...SECTORS.map((s) => h("b", { title: s }, s.replace("Food security", "Food").replace("Livelihoods", "Livel."))),
      ...gm.rows.flatMap((rw) => [h("span", { class: "fo-mrow" }, rw.c.name), ...rw.cells.map((x) => h("i", {
        class: x.gap ? "gap" : x.orgs.length ? (x.overlap ? "overlap" : "on") : x.need ? "gap" : "",
        title: `${rw.c.name} · ${x.sector}: ${x.orgs.length ? x.orgs.join(", ") : x.need ? "needed, no one working" : "—"}`,
      }, x.orgs.length ? String(x.orgs.length) : x.gap ? "!" : ""))])),
    h("div", { class: "pol-legend" }, h("span", {}, h("i", { style: "background:#30d158" }), "Someone working"), h("span", {}, h("i", { style: "background:#ffd60a" }), "More than one"), h("span", {}, h("i", { style: "background:#ff453a" }), "Needed, no one")),
    title("Activities (4W)"),
    acts.length ? list(...[...acts].sort((a, b) => b.start.localeCompare(a.start)).map((a) => row({ color: a.status === "planned" ? "#8e8e93" : a.status === "done" ? "#30d158" : "#0a84ff" }, `${a.activity} · ${name(a.community)}`,
      `${a.org} · ${a.sector} · ${a.status}${total(a.reached) ? ` · ${fmt(total(a.reached))} reached` : ""}`, () => activityScreen(ctx, p, a, save, reopen)))) : empty("No activities yet."),
    h("div", { class: "row" },
      h("button", { class: "primary-btn", onclick: () => activityScreen(ctx, p, null, save, reopen) }, "+ An activity"),
      h("button", { class: "pill-btn", onclick: () => downloadCsv(`${p.name} 4W ${today()}`, FOUR_W_HEAD, fourW(p, acts)) }, "Export the 4W")));
}

function indicatorAdder(p: Programme, save: () => void, reopen: () => void) {
  const name = h("input", { class: "pro-url", placeholder: "An indicator: people with safe water…" }) as HTMLInputElement;
  const target = h("input", { class: "pro-url po-unit", type: "number", min: 1, placeholder: "Target" }) as HTMLInputElement;
  const sector = h("select", { class: "pro-url" }, ...SECTORS.map((s) => h("option", { value: s }, s))) as HTMLSelectElement;
  return h("div", { class: "po-add" }, name, sector, target, h("button", { class: "pill-btn", onclick: () => {
    if (!name.value.trim() || !Number(target.value)) return;
    (p.indicators ??= []).push({ id: newId(), name: name.value.trim(), sector: sector.value as Sector, target: Number(target.value), unit: "people" });
    save(); reopen();
  } }, "Add"));
}

function activityScreen(ctx: WorkCtx, p: Programme, a: Activity | null, save: () => void, back: () => void) {
  const fresh = !a;
  const x: Activity = a ?? { id: newId(), org: p.name, sector: "Health", activity: "", community: p.communities[0]?.id ?? "", start: today(), status: "ongoing", reached: { women: 0, men: 0, girls: 0, boys: 0 } };
  const num = (k: keyof Activity["reached"]) => field(k[0].toUpperCase() + k.slice(1), input(x.reached[k], (v) => (x.reached[k] = Math.max(0, Number(v) || 0)), { type: "number", min: 0 }));
  ctx.show(fresh ? "An activity" : x.activity, back,
    field("Who", input(x.org, (v) => (x.org = v || x.org), { placeholder: "Organisation" })),
    field("Sector", select(x.sector, SECTORS.map((s) => [s, s] as [string, string]) as [Sector, string][], (v) => (x.sector = v))),
    field("What", input(x.activity, (v) => (x.activity = v), { placeholder: "Water trucking, outreach clinic…" })),
    field("Where", select(x.community, p.communities.map((c) => [c.id, c.name] as [string, string]), (v) => (x.community = v))),
    field("From", input(x.start, (v) => (x.start = v || x.start), { type: "date" })),
    field("Until", input(x.end ?? "", (v) => (x.end = v || undefined), { type: "date" })),
    field("Status", select(x.status, [["planned", "Planned"], ["ongoing", "Ongoing"], ["done", "Done"]], (v) => (x.status = v))),
    title("People reached"), num("women"), num("men"), num("girls"), num("boys"),
    h("div", { class: "row" },
      h("button", { class: "primary-btn", onclick: () => { if (!x.activity) { ctx.app.toast("Say what the activity is.", 3000); return; } if (fresh) (p.activities ??= []).push(x); save(); back(); } }, "Save"),
      !fresh ? h("button", { class: "link-btn danger", onclick: () => { p.activities = (p.activities ?? []).filter((y) => y !== x); save(); back(); } }, "Remove") : ""));
}

// ---- Supplies ---------------------------------------------------------------------------------------

export function suppliesPanel(p: Programme, save: () => void, reopen: () => void) {
  const cover = stockCover(p.stock ?? []);
  const site = (id: string) => p.sites.find((s) => s.id === id)?.name ?? "";
  const item = h("input", { class: "pro-url", placeholder: "Item: vaccines, rations, tablets…" }) as HTMLInputElement;
  const qty = h("input", { class: "pro-url po-unit", type: "number", min: 0, placeholder: "In stock" }) as HTMLInputElement;
  const per = h("input", { class: "pro-url po-unit", type: "number", min: 0, placeholder: "Used a week" }) as HTMLInputElement;
  const where = h("select", { class: "pro-url" }, ...p.sites.filter((s) => ["warehouse", "clinic", "distribution", "school", "water"].includes(s.kind)).map((s) => h("option", { value: s.id }, s.name))) as HTMLSelectElement;
  return h("div", {},
    lines(
      cover.length ? `${cover.filter((c) => c.weeks < 4).length} ${cover.filter((c) => c.weeks < 4).length === 1 ? "item runs" : "items run"} out within four weeks at the current rate.` : "No supplies tracked yet.",
      cover[0] && cover[0].weeks < 4 ? `⚠️ ${cover[0].s.item} at ${site(cover[0].s.site)}: ${cover[0].weeks < 1 ? `${Math.round(cover[0].weeks * 7)} days` : `${cover[0].weeks.toFixed(1)} weeks`} left. Order now: most lines take weeks from port to site.` : ""),
    cover.length ? list(...cover.map(({ s, weeks }) => row({ color: weeks < 2 ? "#ff453a" : weeks < 4 ? "#ff9f0a" : "#30d158" }, `${s.item} · ${site(s.site)}`,
      `${fmt(s.qty)} ${s.unit} · ${fmt(s.perWeek)} a week · ${Number.isFinite(weeks) ? `${weeks.toFixed(1)} weeks of cover` : "not being used"}`,
      () => { const v = prompt(`How many ${s.unit} of ${s.item} are in stock now?`, String(s.qty)); if (v !== null && Number.isFinite(Number(v))) { s.qty = Math.max(0, Number(v)); save(); reopen(); } }))) : "",
    h("div", { class: "po-add" }, item, where, qty, per, h("button", { class: "pill-btn", onclick: () => {
      if (!item.value.trim() || !where.value) return;
      (p.stock ??= []).push({ id: newId(), item: item.value.trim(), site: where.value, qty: Number(qty.value) || 0, unit: "units", perWeek: Number(per.value) || 0 });
      save(); reopen();
    } }, "Add")));
}

// ---- Planning several sites, importing, reporting ------------------------------------------------

export function planBlock(p: Programme, service: Service, onPlan: (at: { name: string; lon: number; lat: number }[]) => void) {
  const n = h("select", { class: "pro-url po-unit" }, ...[2, 3, 4, 5].map((k) => h("option", { value: k }, `${k} sites`))) as HTMLSelectElement;
  const out = h("div", {});
  const run = () => {
    const r = planSites(p, service, Number(n.value));
    out.replaceChildren(r.picks.length ? h("div", {},
      lines(`${r.picks.length} new ${SERVICES[service].label.toLowerCase()} ${r.picks.length === 1 ? "site" : "sites"} would cut the people beyond ${p.reach[service]} km from ${fmt(r.before)} to ${fmt(r.after)}.`,
        ...r.picks.map((x, i) => `${i + 1}. ${x.at.name}: ${fmt(x.people)} more people within reach${x.reaches.length > 1 ? ` (${x.reaches.map((c) => c.name).join(", ")})` : ""}.`)),
      h("button", { class: "pill-btn", onclick: () => onPlan(r.picks.map((x) => x.at)) }, "Plan them all")) : empty("No one left beyond reach."));
  };
  return h("div", {}, h("div", { class: "po-add" }, h("span", { class: "muted small" }, "Where would"), n, h("button", { class: "pill-btn", onclick: run }, "help most?")), out);
}

export const walkText = (km: number) => { const hrs = walkHours(km); return hrs < 1 ? `${Math.round(hrs * 60)} min walk` : hrs < 24 ? `${hrs.toFixed(hrs < 3 ? 1 : 0)} h walk` : `${(hrs / 8).toFixed(0)} days' walk`; };

export async function importCommunities(ctx: WorkCtx, p: Programme, save: () => void, reopen: () => void) {
  const text = await pickFile(".csv,text/csv");
  if (!text) return;
  const cs = communitiesFromRows(parseCsv(text), newId);
  if (!cs.length) { ctx.app.toast("No rows with a name, latitude and longitude found.", 4000); return; }
  p.communities.push(...cs);
  save(); ctx.app.toast(`${cs.length} communities added.`, 3000); reopen();
}

export function donorReport(p: Programme) {
  const t = today(), acts = p.activities ?? [], r = reached(acts), people = p.communities.reduce((s, c) => s + c.people, 0);
  const inds = indicatorProgress(p.indicators ?? [], acts), gm = gapMatrix(p, acts), cover = stockCover(p.stock ?? []);
  const sites = (s: string) => p.sites.find((x) => x.id === s)?.name ?? "";
  printReport(`${p.name}: progress report`, t, [
    { heading: "At a glance", kpis: [[fmt(people), "people in the communities served"], [fmt(total(r)), "people reached"], [String(new Set(acts.map((a) => a.org)).size), "organisations"], [String(gm.gaps.length), "needs with no one working"]] },
    { heading: "People reached by sex and age", table: { head: ["Women", "Men", "Girls", "Boys", "Total"], rows: [[fmt(r.women), fmt(r.men), fmt(r.girls), fmt(r.boys), fmt(total(r))]] } },
    { heading: "Indicators", table: { head: ["Indicator", "Achieved", "Target", "%"], rows: inds.map((x) => [x.i.name, fmt(x.value), fmt(x.i.target), `${Math.round(x.share * 100)}%`]) } },
    { heading: "Reach of services", table: { head: ["Service", "Within reach", "Too far", "Distance counted as too far"], rows: (Object.keys(SERVICES) as Service[]).map((s) => { const g = gaps(p, s); return [SERVICES[s].label, fmt(g.reached), fmt(g.missed), `${p.reach[s]} km`]; }) } },
    { heading: "Needs with no one working on them", lines: gm.gaps.length ? gm.gaps.map((g) => `${g.sector} in ${g.c.name} (${fmt(g.c.people)} people)`) : ["None."] },
    { heading: "Activities (4W)", table: { head: ["Who", "Sector", "Activity", "Where", "Status", "Reached"], rows: fourW(p, acts).map((x) => [x[0], x[1], x[2], x[3], x[8], x[13]] as (string | number)[]) } },
    { heading: "Supplies", table: { head: ["Item", "Where", "In stock", "Weeks of cover"], rows: cover.map((c) => [c.s.item, sites(c.s.site), `${fmt(c.s.qty)} ${c.s.unit}`, Number.isFinite(c.weeks) ? c.weeks.toFixed(1) : "—"]) } },
    { heading: "Open incidents", lines: issueQueue(p.incidents, t).map((i) => `${i.title} (${i.age} days)`) },
    { heading: "Needs raised by communities", lines: needsTally(p).filter((x) => x.people).map((x) => `${SERVICES[x.s].label}: ${fmt(x.people)} people`) },
  ], "Distances are straight lines; reach uses the programme's own thresholds. People reached are as reported by each organisation.");
}

export const siteKindLabel = (k: string) => SITE_KINDS[k as keyof typeof SITE_KINDS]?.label ?? k;
export { kmText };
