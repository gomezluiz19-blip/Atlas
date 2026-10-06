// Politics Pro: running a legislative office on the map. One screen for the
// office (member, district, what's coming up, casework, bills), with the
// district outlined on the globe and the people, events and offices on it;
// a whip count for each bill, as a parliament arc and as member dots across
// the country; and a contact book that takes in a CRM export and gives it
// back out. Kept in this browser.
import type { App } from "../../app";
import { congress, districtByNumber, type Member } from "../../politics/us";
import { hemicycle } from "../../politics/model";
import { h } from "../../ui/dom";
import { flyToPlace, geocode } from "../../ui/search";
import type { WorkCtx } from "../../work/hub";
import { WorkLayer, type WorkFeature } from "../../work/layer";
import { ListStore, newId } from "../../work/store";
import { mapLimit } from "../../data/http";
import { note, stats } from "../../themes/common";
import { districtPeople } from "./census";
import { demoOffice } from "./demo";
import { caseStatsBlock, districtFinder, inviteScreen, mailSummary, officeReport } from "./proUi";
import { POSITIONS } from "./mail";
import {
  blankOffice, caseQueue, CONTACT_KINDS, contactsCsv, contactsFromRows, parseCsv, partyLines, spreadAround, STANCES, STATE_CENTRE, stanceOf, tally, topTopics, votesNeeded,
  type Bill, type Case, type Contact, type ContactKind, type Office, type OfficeEvent, type Stance,
} from "./model";

const offices = new ListStore<Office>("atlas.pro.offices.v1");
let layer: WorkLayer | null = null;
/** What the map shows: people, events and offices; or a bill's whip count. */
let mapMode: "office" | string = "office";

const today = () => new Date().toISOString().slice(0, 10);
const current = () => offices.all()[0];
const save = (o: Office) => offices.save(o);
const memberKey = (m: Member) => m.name;
const PARTY: Record<string, string> = { Democrat: "D", Republican: "R", Independent: "I" };
const seatOf = (m: Member) => `${m.state}${m.chamber === "rep" ? `-${m.district === 0 ? "AL" : m.district}` : ""}`;
const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

// ---- The map ---------------------------------------------------------------------------------------

function draw(app: App, o: Office, members: Member[] = []) {
  layer ??= new WorkLayer(app, "pro:office", o.name, "#5160c2");
  const fs: WorkFeature[] = [];
  for (const [i, r] of (o.district?.rings ?? []).entries()) fs.push({ id: `d${i}`, kind: "area", pts: r, color: "#5160c2", fill: 0.08 });
  const bill = o.bills.find((b) => b.id === mapMode);
  if (bill) {
    // The whip count across the country: each member a dot in their state, coloured by stance.
    const byState = new Map<string, Member[]>();
    for (const m of members.filter((x) => (bill.chamber === "senate" ? x.chamber === "sen" : x.chamber === "rep"))) (byState.get(m.state) ?? byState.set(m.state, []).get(m.state)!).push(m);
    for (const [st, ms] of byState) {
      const c = STATE_CENTRE[st];
      if (!c) continue;
      ms.forEach((m, i) => fs.push({ id: `m:${m.name}`, kind: "point", pts: [spreadAround(c, i, ms.length)], color: stanceOf(bill.members[memberKey(m)]).color }));
    }
    for (const p of o.contacts.filter((x) => x.lon !== undefined && x.stance[bill.id])) fs.push({ id: p.id, kind: "point", pts: [[p.lon!, p.lat!]], color: stanceOf(p.stance[bill.id]).color, label: p.name });
  } else {
    for (const s of o.sites) fs.push({ id: s.id, kind: "point", pts: [[s.lon, s.lat]], color: "#5160c2", label: `🏛 ${s.name}` });
    for (const p of o.contacts.filter((x) => x.lon !== undefined)) fs.push({ id: p.id, kind: "point", pts: [[p.lon!, p.lat!]], color: CONTACT_KINDS[p.kind].color });
    const soon = o.events.filter((e) => e.place && e.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
    for (const e of soon) fs.push({ id: e.id, kind: "point", pts: [[e.place!.lon, e.place!.lat]], color: "#d19a2e", label: `📅 ${fmtDate(e.date)}` });
    for (const msg of (o.messages ?? []).filter((x) => x.lon !== undefined && !x.replied)) fs.push({ id: `mg${msg.id}`, kind: "point", pts: [[msg.lon! - 0.002, msg.lat! - 0.0015]], color: POSITIONS.find((p) => p.id === msg.position)!.color });
    for (const k of caseQueue(o.cases, today())) { const p = o.contacts.find((x) => x.id === k.contact); if (p?.lon !== undefined) fs.push({ id: `c${k.id}`, kind: "point", pts: [[p.lon + 0.002, p.lat! + 0.0015]], color: "#c4513a" }); }
  }
  layer.set(fs, `Politics Pro · ${o.name}`);
}

function frameDistrict(app: App, o: Office) {
  const pts = o.district?.rings.flat() ?? [...o.sites.filter((s) => s.kind !== "capitol"), ...o.contacts.filter((c) => c.lon !== undefined)].map((x) => [x.lon!, x.lat!] as [number, number]);
  if (!pts.length) return;
  let w = 180, e = -180, s = 90, n = -90;
  for (const [x, y] of pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const r = Math.max(4000, Math.hypot((e - w) * 111_000 * Math.cos(((s + n) / 2) * Math.PI / 180), (n - s) * 111_000) / 2);
  void flyToPlace(app.globe, { name: o.name, lon: (w + e) / 2, lat: (s + n) / 2, radius: r });
}

// ---- Screens ---------------------------------------------------------------------------------------

export function openOffice(ctx: WorkCtx) {
  const o = current();
  if (!o) return start(ctx);
  mapMode = "office";
  draw(ctx.app, o);
  home(ctx, o);
}

function start(ctx: WorkCtx) {
  const { app } = ctx;
  const input = h("input", { class: "pro-url", placeholder: "Member's name, or your state and district (CO-2)", list: "po-members" }) as HTMLInputElement;
  const list = h("datalist", { id: "po-members" });
  const msg = h("p", { class: "muted small" });
  void congress().then((ms) => list.replaceChildren(...ms.map((m) => h("option", { value: `${m.name} · ${seatOf(m)} (${PARTY[m.party ?? ""] ?? m.party ?? "?"})` })))).catch(() => {});
  const create = async () => {
    const q = input.value.trim();
    const ms = await congress().catch(() => [] as Member[]);
    const m = ms.find((x) => q.startsWith(x.name)) ?? ms.find((x) => seatOf(x).toLowerCase() === q.toLowerCase().replace(/\s/g, ""));
    const o = blankOffice(m ? `Office of ${m.name}` : q || "My office");
    if (m) o.member = { name: m.name, party: m.party, chamber: m.chamber === "sen" ? "senate" : "house", state: m.state, district: m.district, photo: m.photo, key: memberKey(m) };
    msg.textContent = m && m.chamber === "rep" ? "Outlining the district…" : "";
    if (m?.chamber === "rep") o.district = (await districtByNumber(m.state, m.district ?? 0).catch(() => null)) ?? undefined;
    save(o);
    openOffice(ctx);
    frameDistrict(app, o);
  };
  ctx.show("Politics Pro", ctx.home,
    h("p", {}, "Run a legislative office on the map: the district, casework, events and the whip count."),
    h("h2", { class: "group-title" }, "Your office"),
    input, list,
    h("div", { class: "row" }, h("button", { class: "primary-btn", onclick: () => void create() }, "Start the office"), msg),
    h("button", { class: "pill-btn", onclick: () => districtFinder(ctx, (d, level, name) => { const o = blankOffice(name); o.district = d; o.level = level; save(o); openOffice(ctx); frameDistrict(app, o); }, () => start(ctx)) }, "A state legislator, council or other office"),
    h("p", { class: "muted small" }, "Or type any office's name (a campaign, a board) and add its places yourself."),
    h("button", { class: "pill-btn", onclick: () => { const o = demoOffice(); save(o); openOffice(ctx); void districtByNumber("CO", 2).then((d) => { if (d) { o.district = d; save(o); draw(app, o); } frameDistrict(app, o); }).catch(() => frameDistrict(app, o)); } }, "Or try a demo office"),
    note("Members from the congress-legislators project (public domain); districts from the Census Bureau's TIGERweb; district figures from the American Community Survey. Your contacts, cases and whip counts stay in this browser."));
}

function home(ctx: WorkCtx, o: Office) {
  const { app } = ctx;
  const again = () => openOffice(ctx);
  const m = o.member;
  const queue = caseQueue(o.cases, today());
  const coming = o.events.filter((e) => e.date >= today()).sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  const people = h("div", {});
  if (m?.state && m.chamber === "house") void districtPeople(m.state, m.district ?? 0).then((d) => {
    if (!d) return;
    const usd = (v?: number) => (v ? `$${Math.round(v).toLocaleString()}` : "—");
    const pc = (v?: number) => (v !== undefined ? `${v.toFixed(1)}%` : "—");
    people.replaceChildren(h("h2", { class: "group-title" }, "The district's people"), stats(
      ["People", d.population.toLocaleString()], ["Median age", d.medianAge ? `${d.medianAge}` : "—"], ["Median household income", usd(d.medianIncome)],
      ["Median home value", usd(d.medianHome)], ["Veterans (adults)", pc(d.veteransPct)], ["Below the poverty line", pc(d.povertyPct)],
      ["Born abroad", pc(d.foreignBornPct)], ["Bachelor's degree (25+)", pc(d.degreePct)]), h("p", { class: "fineprint" }, `American Community Survey ${d.year - 4}–${d.year} estimates.`));
  }).catch(() => {});
  const topics = topTopics(o.contacts);
  ctx.show("Politics Pro", ctx.home,
    h("div", { class: "po-head" },
      m?.photo ? h("img", { class: "po-photo", src: m.photo, alt: "" }) : h("span", { class: "po-photo po-initial" }, (m?.name ?? o.name).replace(/^(Rep\.|Sen\.|Office of)\s*/, "")[0] ?? "•"),
      h("div", {}, h("strong", {}, m?.name ?? o.name), h("span", {}, [m ? (m.chamber === "senate" ? `Senator, ${m.state}` : m.chamber === "house" ? `Representative, ${m.state}-${m.district === 0 ? "AL" : m.district}` : "") : "", m?.party].filter(Boolean).join(" · ") || o.district?.name || "Your office"),
        h("div", { class: "row" }, o.district ? h("button", { class: "link-btn", onclick: () => frameDistrict(app, o) }, "Show the district") : "",
          h("button", { class: "link-btn", onclick: () => officeReport(o) }, "Weekly report")))),
    h("div", { class: "po-kpis" },
      kpi(String(o.contacts.length), "people", () => peopleScreen(ctx, o)), kpi(String(queue.length), "open cases", () => casesScreen(ctx, o), queue.some((c) => c.stale)),
      kpi(String(coming.length), "events ahead", () => eventsScreen(ctx, o)), kpi(String(o.bills.length), "bills", () => o.bills[0] ? billScreen(ctx, o, o.bills[0]) : addBill(ctx, o))),
    h("h2", { class: "group-title" }, "Bills you're whipping"),
    ...o.bills.map((b) => billRow(ctx, o, b)),
    h("button", { class: "link-btn", onclick: () => addBill(ctx, o) }, "+ A bill"),
    h("h2", { class: "group-title" }, "Coming up"),
    coming.length ? h("div", { class: "list" }, ...coming.slice(0, 4).map((e) => eventRow(app, e, () => inviteScreen(ctx, o, e, again)))) : h("p", { class: "muted small" }, "Nothing planned yet."),
    h("button", { class: "link-btn", onclick: () => addEvent(ctx, o) }, "+ An event"),
    h("h2", { class: "group-title" }, "Casework"),
    queue.length ? h("div", { class: "list" }, ...queue.slice(0, 4).map((c) => caseRow(ctx, o, c))) : h("p", { class: "muted small" }, "No open cases."),
    h("button", { class: "link-btn", onclick: () => addCase(ctx, o) }, "+ A case"),
    mailSummary(ctx, o, () => save(o), again),
    topics.length ? h("div", {}, h("h2", { class: "group-title" }, "What people raise most"), h("div", { class: "chips wrap" }, ...topics.map((t) => h("button", { class: "chip", onclick: () => peopleScreen(ctx, o, t.topic) }, `${t.topic} · ${t.count}`)))) : "",
    people,
    h("h2", { class: "group-title" }, "Offices"),
    h("div", { class: "list" }, ...o.sites.map((s) => h("button", { class: "list-row", onclick: () => void flyToPlace(app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: 600 }) },
      h("span", { class: "story-mini-emoji" }, s.kind === "capitol" ? "🏛" : "🏢"), h("span", { class: "list-text" }, h("span", { class: "list-title" }, s.name), h("span", { class: "list-sub" }, [s.address, s.hours].filter(Boolean).join(" · "))), h("span", { class: "chev", html: "&rsaquo;" })))),
    addressAdder("Add an office: its address", async (spot) => { o.sites.push({ id: newId(), kind: /washington|capitol|senate|house office/i.test(spot.name) ? "capitol" : "district", ...spot }); save(o); again(); }),
    h("div", { class: "mp-foot" }, h("span", {}, o.demo ? "A demo office: everyone in it is made up." : "Saved in this browser."),
      h("button", { class: "link-btn danger", onclick: () => { if (confirm(`Remove ${o.name} and everything in it?`)) { offices.remove(o.id); layer?.clear(); openOffice(ctx); } } }, "Remove office")));
}

const kpi = (n: string, label: string, go: () => void, alert = false) =>
  h("button", { class: "po-kpi" + (alert ? " alert" : ""), onclick: go }, h("strong", {}, n), h("span", {}, label));

/** A stacked bar of stances, with likely-yes against votes needed. */
function whipBar(stances: Stance[], needed?: number): HTMLElement {
  const t = tally(stances, needed ?? 0);
  return h("div", { class: "po-whip" },
    h("div", { class: "po-whip-bar" }, ...STANCES.filter((s) => t.counts[s.id]).map((s) => h("i", { style: `flex:${t.counts[s.id]};background:${s.color}`, title: `${s.label}: ${t.counts[s.id]}` })),
      needed ? h("b", { class: "po-whip-line", style: `left:${Math.min(100, (needed / Math.max(1, t.total)) * 100)}%`, title: `${needed} needed` }) : ""),
    h("span", { class: "po-whip-text" }, needed ? `${t.likely} likely yes of ${needed} needed${t.short ? ` · ${t.short} short` : " · enough"}` : `${t.likely} of ${t.total} for`));
}

function billRow(ctx: WorkCtx, o: Office, b: Bill): HTMLElement {
  const row = h("button", { class: "po-bill", onclick: () => billScreen(ctx, o, b) }, h("strong", {}, [b.number, b.title].filter(Boolean).join(" · ")), h("span", { class: "muted small" }, "Counting…"));
  void congress().then((ms) => {
    const inCh = ms.filter((m) => (b.chamber === "senate" ? m.chamber === "sen" : m.chamber === "rep"));
    row.lastElementChild!.replaceWith(b.chamber === "local" ? whipBar(o.contacts.map((c) => c.stance[b.id] ?? "unknown").filter((s) => s !== "unknown")) : whipBar(inCh.map((m) => b.members[memberKey(m)] ?? "unknown"), votesNeeded(b.chamber, inCh.length)));
  }).catch(() => row.lastElementChild!.replaceWith(whipBar(o.contacts.map((c) => c.stance[b.id]).filter((s): s is Stance => !!s))));
  return row;
}

function billScreen(ctx: WorkCtx, o: Office, b: Bill, filter = "") {
  const { app } = ctx;
  const again = (f = filter) => billScreen(ctx, o, b, f);
  mapMode = b.id;
  const arc = h("div", { class: "po-arc" }, h("p", { class: "muted small" }, "Loading the chamber…"));
  const list = h("div", {});
  const pickStance = (value: Stance | undefined, set: (s: Stance) => void) => {
    const sel = h("select", { class: "po-stance", style: `--c:${stanceOf(value).color}`, onchange: (e: Event) => set((e.target as HTMLSelectElement).value as Stance) }, ...STANCES.map((s) => h("option", { value: s.id, selected: s.id === (value ?? "unknown") }, s.label))) as HTMLSelectElement;
    return sel;
  };
  const stakeholders = o.contacts.filter((c) => c.kind !== "constituent" || c.stance[b.id]);
  void congress().then((ms) => {
    const inCh = b.chamber === "local" ? [] : ms.filter((m) => (b.chamber === "senate" ? m.chamber === "sen" : m.chamber === "rep"));
    draw(app, o, ms);
    if (inCh.length) {
      // The chamber as an arc of seats, grouped by stance from yes (left) to no.
      const order = STANCES.map((s) => s.id);
      const sorted = [...inCh].sort((x, y) => order.indexOf(b.members[memberKey(x)] ?? "unknown") - order.indexOf(b.members[memberKey(y)] ?? "unknown"));
      const seats = hemicycle(sorted.length), W = 320, R = 150, cx = W / 2, cy = 158;
      const need = votesNeeded(b.chamber, inCh.length);
      const t = tally(sorted.map((m) => b.members[memberKey(m)] ?? "unknown"), need);
      arc.replaceChildren(
        h("div", { html: `<svg viewBox="0 0 ${W} 172" role="img" aria-label="Whip count">${seats.map((s, i) => `<circle cx="${(cx + s.x * R).toFixed(1)}" cy="${(cy - s.y * R).toFixed(1)}" r="${(s.r * R).toFixed(2)}" fill="${stanceOf(b.members[memberKey(sorted[i])]).color}"><title>${sorted[i].name} (${seatOf(sorted[i])})</title></circle>`).join("")}<text x="${cx}" y="${cy - 10}" text-anchor="middle" class="pol-arc-n">${t.likely}</text><text x="${cx}" y="${cy + 6}" text-anchor="middle" class="pol-arc-l">of ${need} needed</text></svg>` }),
        whipBar(sorted.map((m) => b.members[memberKey(m)] ?? "unknown"), need),
        h("div", { class: "pol-legend" }, ...STANCES.map((s) => h("span", {}, h("i", { style: `background:${s.color}` }), `${s.label} ${t.counts[s.id]}`))));
      const shown = inCh.filter((m) => !filter || `${m.name} ${seatOf(m)} ${m.party}`.toLowerCase().includes(filter.toLowerCase())).sort((x, y) => seatOf(x).localeCompare(seatOf(y), undefined, { numeric: true }));
      list.replaceChildren(
        h("input", { class: "pro-url", placeholder: "Find a member, state (TX) or party", value: filter, onchange: (e: Event) => again((e.target as HTMLInputElement).value) }),
        h("div", { class: "list po-members" }, ...shown.slice(0, 120).map((m) => h("div", { class: "list-row static" },
          m.photo ? h("img", { class: "tp-thumb", src: m.photo, alt: "", loading: "lazy" }) : "",
          h("span", { class: "list-text" }, h("span", { class: "list-title" }, m.name), h("span", { class: "list-sub" }, `${seatOf(m)} · ${m.party ?? ""}`)),
          pickStance(b.members[memberKey(m)], (s) => { b.members[memberKey(m)] = s; save(o); again(); })))),
        shown.length > 120 ? h("p", { class: "muted small" }, `${shown.length - 120} more: narrow the search.`) : "");
    } else arc.replaceChildren(whipBar(stakeholders.map((c) => c.stance[b.id] ?? "unknown")));
  }).catch(() => arc.replaceChildren(h("p", { class: "muted small" }, "Couldn't load the members of Congress just now.")));
  ctx.show(b.number ?? "Bill", () => { mapMode = "office"; openOffice(ctx); },
    h("h2", { class: "work-title" }, b.title), b.summary ? h("p", { class: "muted" }, b.summary) : "",
    arc,
    b.chamber !== "local" ? h("div", { class: "row" },
      h("button", { class: "pill-btn", title: "Fills only the members not yet asked", onclick: () => void congress().then((ms) => { partyLines(b, ms.filter((m) => (b.chamber === "senate" ? m.chamber === "sen" : m.chamber === "rep")).map((m) => ({ key: memberKey(m), party: m.party }))); save(o); again(); }) }, "Start from party lines"),
      h("span", { class: "muted small" }, "On the map: every member in their state, coloured by where they stand.")) : "",
    h("h2", { class: "group-title" }, "Stakeholders and local voices"),
    stakeholders.length ? h("div", { class: "list" }, ...stakeholders.map((c) => h("div", { class: "list-row static" },
      h("span", { class: "dot", style: `background:${CONTACT_KINDS[c.kind].color}` }),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, c.name), h("span", { class: "list-sub" }, [CONTACT_KINDS[c.kind].label, c.org].filter(Boolean).join(" · "))),
      pickStance(c.stance[b.id], (s) => { c.stance[b.id] = s; save(o); again(); })))) : h("p", { class: "muted small" }, "Add stakeholders in People, then record where they stand here."),
    b.chamber !== "local" ? h("h2", { class: "group-title" }, "Members") : "", list,
    h("button", { class: "link-btn danger", onclick: () => { o.bills = o.bills.filter((x) => x !== b); save(o); mapMode = "office"; openOffice(ctx); } }, "Remove this bill"));
}

function addBill(ctx: WorkCtx, o: Office) {
  const num = h("input", { class: "pro-url", placeholder: "Number, e.g. H.R. 2718 or S. 410" }) as HTMLInputElement;
  const title = h("input", { class: "pro-url", placeholder: "Title" }) as HTMLInputElement;
  const summary = h("textarea", { class: "mp-notes", rows: 2, placeholder: "What it does, in a sentence" }) as HTMLTextAreaElement;
  const chamber = h("select", { class: "pro-url" }, h("option", { value: "house" }, "House"), h("option", { value: "senate" }, "Senate"), h("option", { value: "local" }, "State or local (stakeholders only)")) as HTMLSelectElement;
  ctx.show("A bill", () => openOffice(ctx), num, title, summary, chamber,
    h("button", { class: "primary-btn", onclick: () => {
      if (!title.value.trim()) return;
      const b: Bill = { id: newId(), title: title.value.trim(), number: num.value.trim() || undefined, summary: summary.value.trim() || undefined, chamber: chamber.value as Bill["chamber"], members: {}, sponsorParty: o.member?.party };
      o.bills.push(b); save(o); billScreen(ctx, o, b);
    } }, "Start the count"));
}

// ---- People ------------------------------------------------------------------------------------------

function peopleScreen(ctx: WorkCtx, o: Office, q = "") {
  const again = (x = q) => peopleScreen(ctx, o, x);
  const shown = o.contacts.filter((c) => !q || `${c.name} ${c.org ?? ""} ${c.topics.join(" ")} ${c.address ?? ""} ${CONTACT_KINDS[c.kind].label}`.toLowerCase().includes(q.toLowerCase()));
  const file = h("input", { type: "file", accept: ".csv,text/csv", hidden: true, onchange: async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const incoming = contactsFromRows(parseCsv(await f.text()));
    if (!incoming.length) { ctx.app.toast("No contacts found in that file. It needs a header row with names.", 5000); return; }
    o.contacts.push(...incoming); save(o);
    ctx.app.toast(`Added ${incoming.length} contacts. Putting them on the map…`, 4000);
    again();
    // Addresses to places, two at a time.
    let placed = 0;
    await mapLimit(incoming.filter((c) => c.address), 2, async (c) => {
      const [r] = await geocode(c.address!).catch(() => []);
      if (r) { c.lon = r.lon; c.lat = r.lat; placed++; }
    });
    save(o); draw(ctx.app, o);
    ctx.app.toast(`${placed} of ${incoming.length} contacts placed on the map.`, 4000);
  } }) as HTMLInputElement;
  const exportCsv = () => {
    const blob = new Blob([contactsCsv(o.contacts, o.bills)], { type: "text/csv" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `${o.name.replace(/\W+/g, "-").toLowerCase()}-contacts.csv` }) as HTMLAnchorElement;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  ctx.show("People", () => openOffice(ctx),
    h("input", { class: "pro-url", placeholder: "Search people, organisations, topics, places", value: q, onchange: (e: Event) => again((e.target as HTMLInputElement).value) }),
    h("div", { class: "chips wrap" }, ...(Object.keys(CONTACT_KINDS) as ContactKind[]).map((k) => h("span", { class: "chip static" }, h("span", { class: "dot", style: `background:${CONTACT_KINDS[k].color}` }), `${CONTACT_KINDS[k].label} ${o.contacts.filter((c) => c.kind === k).length}`))),
    h("div", { class: "list" }, ...shown.slice(0, 200).map((c) => h("button", { class: "list-row", onclick: () => contactScreen(ctx, o, c) },
      h("span", { class: "dot", style: `background:${CONTACT_KINDS[c.kind].color}` }),
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, c.name), h("span", { class: "list-sub" }, [c.org, c.topics.slice(0, 3).join(", "), c.log.length ? `last ${c.log[c.log.length - 1].at.slice(0, 10)}` : ""].filter(Boolean).join(" · "))),
      h("span", { class: "chev", html: "&rsaquo;" })))),
    h("div", { class: "row" },
      h("button", { class: "pill-btn", onclick: () => contactScreen(ctx, o, null) }, "+ A person"),
      h("button", { class: "pill-btn", title: "A CSV from any CRM or spreadsheet: name, email, phone, address, organisation, type, topics", onclick: () => file.click() }, "Import a CSV"),
      h("button", { class: "pill-btn", onclick: exportCsv }, "Export"), file),
    h("p", { class: "fineprint" }, "Importing reads the usual columns (name or first and last name, email, phone, address, city, state, zip, organisation, title, type, topics, notes) and places each address on the map."));
}

function contactScreen(ctx: WorkCtx, o: Office, c: Contact | null) {
  const fresh = !c;
  const x: Contact = c ?? { id: newId(), name: "", kind: "constituent", topics: [], stance: {}, log: [] };
  const field = (label: string, key: "name" | "org" | "role" | "email" | "phone" | "address", ph = "") =>
    h("label", { class: "po-field" }, h("span", {}, label), h("input", { value: x[key] ?? "", placeholder: ph, onchange: (e: Event) => { (x as unknown as Record<string, string>)[key] = (e.target as HTMLInputElement).value.trim(); } }));
  const logText = h("input", { class: "pro-url", placeholder: "Log a call, meeting or email: what was said" }) as HTMLInputElement;
  const commit = async () => {
    if (!x.name.trim()) { ctx.app.toast("Give them a name.", 3000); return; }
    if (x.address && x.lon === undefined) { const [r] = await geocode(x.address).catch(() => []); if (r) { x.lon = r.lon; x.lat = r.lat; } }
    if (logText.value.trim()) x.log.push({ at: new Date().toISOString(), text: logText.value.trim() });
    if (fresh) o.contacts.push(x);
    save(o); draw(ctx.app, o); peopleScreen(ctx, o);
  };
  ctx.show(fresh ? "A person" : x.name, () => peopleScreen(ctx, o),
    field("Name", "name"),
    h("label", { class: "po-field" }, h("span", {}, "Who"), h("select", { onchange: (e: Event) => { x.kind = (e.target as HTMLSelectElement).value as ContactKind; } }, ...(Object.keys(CONTACT_KINDS) as ContactKind[]).map((k) => h("option", { value: k, selected: k === x.kind }, CONTACT_KINDS[k].label)))),
    field("Organisation", "org"), field("Role", "role"), field("Email", "email"), field("Phone", "phone"), field("Address", "address", "Street, town (puts them on the map)"),
    h("label", { class: "po-field" }, h("span", {}, "Topics"), h("input", { value: x.topics.join(", "), placeholder: "Housing, veterans, broadband", onchange: (e: Event) => { x.topics = (e.target as HTMLInputElement).value.split(",").map((t) => t.trim()).filter(Boolean); } })),
    ...o.bills.map((b) => h("label", { class: "po-field" }, h("span", {}, b.number ?? b.title), h("select", { onchange: (e: Event) => { x.stance[b.id] = (e.target as HTMLSelectElement).value as Stance; } }, ...STANCES.map((s) => h("option", { value: s.id, selected: s.id === (x.stance[b.id] ?? "unknown") }, s.label))))),
    h("h2", { class: "group-title" }, "Contact log"),
    x.log.length ? h("div", { class: "po-log" }, ...[...x.log].reverse().map((l) => h("p", {}, h("small", {}, new Date(l.at).toLocaleDateString()), " ", l.text))) : "",
    logText,
    h("div", { class: "row" }, h("button", { class: "primary-btn", onclick: () => void commit() }, "Save"),
      !fresh ? h("button", { class: "link-btn danger", onclick: () => { o.contacts = o.contacts.filter((y) => y !== x); save(o); draw(ctx.app, o); peopleScreen(ctx, o); } }, "Remove") : ""));
}

// ---- Casework and events -----------------------------------------------------------------------------

const AGENCIES = ["VA", "SSA", "IRS", "USCIS", "Medicare", "FEMA", "Passport", "USDA", "HUD", "Other"];

function caseRow(ctx: WorkCtx, o: Office, c: ReturnType<typeof caseQueue>[number]): HTMLElement {
  const who = o.contacts.find((x) => x.id === c.contact);
  return h("button", { class: "list-row", onclick: () => casesScreen(ctx, o) },
    h("span", { class: "po-days" + (c.stale ? " stale" : "") }, h("strong", {}, String(c.days)), h("small", {}, "days")),
    h("span", { class: "list-text" }, h("span", { class: "list-title" }, c.subject), h("span", { class: "list-sub" }, [c.agency, who?.name, c.status === "waiting" ? "waiting on the agency" : "", c.stale ? "no update in 2+ weeks" : ""].filter(Boolean).join(" · "))),
    h("span", { class: "chev", html: "&rsaquo;" }));
}

function casesScreen(ctx: WorkCtx, o: Office) {
  const again = () => casesScreen(ctx, o);
  const set = (c: Case, status: Case["status"]) => { c.status = status; c.updated = today(); c.closed = status === "closed" ? today() : undefined; save(o); again(); };
  ctx.show("Casework", () => openOffice(ctx),
    caseStatsBlock(o),
    ...o.cases.sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed") || a.opened.localeCompare(b.opened)).map((c) => {
      const who = o.contacts.find((x) => x.id === c.contact);
      return h("div", { class: "po-case" + (c.status === "closed" ? " closed" : "") },
        h("div", {}, h("strong", {}, c.subject), h("span", { class: "muted small" }, [c.agency, who?.name, `opened ${fmtDate(c.opened)}`, `updated ${fmtDate(c.updated)}`].filter(Boolean).join(" · "))),
        h("div", { class: "row" }, ...(["open", "waiting", "closed"] as const).map((s) => h("button", { class: "chip" + (c.status === s ? " on" : ""), onclick: () => set(c, s) }, s === "waiting" ? "Waiting on agency" : s[0].toUpperCase() + s.slice(1))),
          h("button", { class: "chip" + (c.release ? " on" : ""), style: c.release ? "--c:#5b9467" : "", onclick: () => { c.release = !c.release; save(o); again(); } }, c.release ? "✓ Privacy release" : "No privacy release")));
    }),
    h("button", { class: "pill-btn", onclick: () => addCase(ctx, o) }, "+ A case"));
}

function addCase(ctx: WorkCtx, o: Office) {
  const subject = h("input", { class: "pro-url", placeholder: "What they need, e.g. VA claim delayed" }) as HTMLInputElement;
  const agency = h("select", { class: "pro-url" }, ...AGENCIES.map((a) => h("option", { value: a }, a))) as HTMLSelectElement;
  const who = h("select", { class: "pro-url" }, h("option", { value: "" }, "Who (from People)"), ...o.contacts.filter((c) => c.kind === "constituent").map((c) => h("option", { value: c.id }, c.name))) as HTMLSelectElement;
  ctx.show("A case", () => openOffice(ctx), subject, agency, who,
    h("button", { class: "primary-btn", onclick: () => { if (!subject.value.trim()) return; o.cases.push({ id: newId(), subject: subject.value.trim(), agency: agency.value, contact: who.value || undefined, status: "open", opened: today(), updated: today() }); save(o); draw(ctx.app, o); casesScreen(ctx, o); } }, "Open the case"));
}

function eventRow(app: App, e: OfficeEvent, open?: () => void): HTMLElement {
  return h("button", { class: "list-row", onclick: () => { if (e.place) void flyToPlace(app.globe, { name: e.place.name, lon: e.place.lon, lat: e.place.lat, radius: 800 }); open?.(); } },
    h("span", { class: "po-date" }, h("small", {}, new Date(e.date + "T12:00:00").toLocaleDateString(undefined, { month: "short" })), h("strong", {}, String(new Date(e.date + "T12:00:00").getDate()))),
    h("span", { class: "list-text" }, h("span", { class: "list-title" }, e.title), h("span", { class: "list-sub" }, [e.time, e.place?.name, e.expected ? `~${e.expected} expected` : ""].filter(Boolean).join(" · "))),
    h("span", { class: "chev", html: "&rsaquo;" }));
}

function eventsScreen(ctx: WorkCtx, o: Office) {
  const sorted = [...o.events].sort((a, b) => a.date.localeCompare(b.date));
  ctx.show("Events", () => openOffice(ctx),
    h("div", { class: "list" }, ...sorted.map((e) => eventRow(ctx.app, e, () => inviteScreen(ctx, o, e, () => eventsScreen(ctx, o))))),
    h("button", { class: "pill-btn", onclick: () => addEvent(ctx, o) }, "+ An event"));
}

function addEvent(ctx: WorkCtx, o: Office) {
  const title = h("input", { class: "pro-url", placeholder: "What, e.g. Town hall on housing" }) as HTMLInputElement;
  const kind = h("select", { class: "pro-url" }, ...["town hall", "visit", "meeting", "press", "fundraiser", "other"].map((k) => h("option", { value: k }, k[0].toUpperCase() + k.slice(1)))) as HTMLSelectElement;
  const date = h("input", { class: "pro-url", type: "date", value: today() }) as HTMLInputElement;
  const time = h("input", { class: "pro-url", type: "time", value: "18:00" }) as HTMLInputElement;
  const place = h("input", { class: "pro-url", placeholder: "Where: a venue or address" }) as HTMLInputElement;
  ctx.show("An event", () => openOffice(ctx), title, kind, date, time, place,
    h("button", { class: "primary-btn", onclick: async () => {
      if (!title.value.trim()) return;
      const [r] = place.value.trim() ? await geocode(place.value.trim()).catch(() => []) : [];
      o.events.push({ id: newId(), title: title.value.trim(), kind: kind.value as OfficeEvent["kind"], date: date.value, time: time.value || undefined, place: r ? { name: place.value.trim(), lon: r.lon, lat: r.lat } : undefined });
      save(o); draw(ctx.app, o); openOffice(ctx);
    } }, "Add it"));
}

/** An address box that finds the place and hands it back. */
function addressAdder(placeholder: string, done: (spot: { name: string; lon: number; lat: number; address: string }) => Promise<void>): HTMLElement {
  const input = h("input", { class: "pro-url", placeholder }) as HTMLInputElement;
  const go = async () => {
    const q = input.value.trim();
    if (!q) return;
    const [r] = await geocode(q).catch(() => []);
    if (r) await done({ name: r.name, lon: r.lon, lat: r.lat, address: q });
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") void go(); });
  return input;
}
