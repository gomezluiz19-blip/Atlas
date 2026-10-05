// Politics Pro's working screens beyond the whip count: the mailbag (every
// letter, email and call by topic and position, what's rising, the reply
// queue, form letters merged per person and sent one by one or in bulk),
// casework turnaround by agency with privacy releases, invite lists for an
// event, finding a state legislative or council district, and the office report.
import { geocode } from "../../ui/search";
import { h } from "../../ui/dom";
import type { WorkCtx } from "../../work/hub";
import { newId } from "../../work/store";
import { districtFromGeoJson, legislativeDistrictAt, type District } from "../../politics/us";
import { kmText, today } from "../kit/ops";
import { ageBadge, empty, field, kpis, lines, list, row, select, title } from "../kit/ui";
import { downloadCsv, pickFile, printReport } from "../kit/report";
import { agencyStats, CHANNELS, inviteList, mailStats, merge, messagesFromRows, POSITIONS, REPLY_DAYS, type Message, type Position, type Template } from "./mail";
import { caseQueue, parseCsv, STANCES, stanceOf, tally, topTopics, type Office, type OfficeEvent } from "./model";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const posOf = (p: Position) => POSITIONS.find((x) => x.id === p)!;

// ---- The mailbag -----------------------------------------------------------------------------------

export function mailSummary(ctx: WorkCtx, o: Office, save: () => void, back: () => void) {
  const s = mailStats(o.messages ?? [], today());
  const rising = s.topics.filter((t) => t.rising);
  return h("div", {},
    title("Mail"),
    s.total ? lines(
      `${s.byWeek[s.byWeek.length - 1]} this week, ${s.queue.length} waiting for a reply${s.overdue ? ` (⚠️ ${s.overdue} over ${REPLY_DAYS} days)` : ""}.`,
      s.topics[0] ? `Most written about: ${s.topics.slice(0, 3).map((t) => `${t.topic} (${t.n})`).join(", ")}.` : "",
      ...rising.map((t) => `📈 ${t.topic} is rising: ${t.thisWeek} this week against ${t.lastWeek} last.`)) : empty("No mail logged yet."),
    h("button", { class: "link-btn", onclick: () => mailScreen(ctx, o, save, back) }, "Open the mailbag"));
}

export function mailScreen(ctx: WorkCtx, o: Office, save: () => void, back: () => void) {
  const t = today(), ms = o.messages ?? [], s = mailStats(ms, t);
  const again = () => mailScreen(ctx, o, save, back);
  const most = Math.max(1, ...s.byWeek);
  ctx.show("Mailbag", back,
    kpis([String(s.byWeek[s.byWeek.length - 1]), "this week"], [String(s.queue.length), "waiting for a reply", s.overdue > 0], [s.medianReply ? `${Math.round(s.medianReply)} d` : "—", "median to reply"], [pct(s.onTime), `replied in ${REPLY_DAYS} days`]),
    h("div", { class: "gm-months", title: "Messages each week, last 8 weeks" }, ...s.byWeek.map((n, i) => h("span", { style: `--h:${(n / most) * 100}%`, title: `${n}` }, h("i", { style: "background:#5160c2" }), h("small", {}, i === s.byWeek.length - 1 ? "now" : `−${s.byWeek.length - 1 - i}w`)))),
    title("By topic"),
    s.topics.length ? list(...s.topics.map((tp) => h("div", { class: "list-row po-topic" },
      h("span", { class: "list-text" }, h("span", { class: "list-title" }, `${tp.topic}${tp.rising ? " 📈" : ""}`),
        h("span", { class: "po-whip-bar" }, h("i", { style: `flex:${tp.support};background:${posOf("support").color}` }), h("i", { style: `flex:${tp.n - tp.support - tp.oppose};background:#c7c7cc` }), h("i", { style: `flex:${tp.oppose};background:${posOf("oppose").color}` })),
        h("span", { class: "list-sub" }, `${tp.n} · ${tp.support} support, ${tp.oppose} oppose · ${tp.thisWeek} this week`)),
      h("button", { class: "pill-btn", onclick: () => replyAll(ctx, o, tp.topic, save, again) }, "Reply to all")))) : "",
    title("Waiting for a reply"),
    s.queue.length ? list(...s.queue.slice(0, 25).map((m) => row({ color: posOf(m.position).color }, `${m.name} · ${m.topic}`, `${posOf(m.position).label} · ${m.channel} · ${m.received}`,
      () => replyScreen(ctx, o, ms.find((x) => x.id === m.id)!, save, again), ageBadge(m.waiting, "days", m.waiting > REPLY_DAYS)))) : empty("All caught up."),
    s.queue.length > 25 ? h("p", { class: "muted small" }, `And ${s.queue.length - 25} more.`) : "",
    messageAdder(o, save, again),
    h("div", { class: "row" },
      h("button", { class: "pill-btn", onclick: () => templatesScreen(ctx, o, save, again) }, "Form letters"),
      h("button", { class: "pill-btn", onclick: () => void importMessages(ctx, o, save, again) }, "Import from a mail export"),
      h("button", { class: "pill-btn", onclick: () => downloadCsv(`${o.name} mail ${t}`, ["received", "name", "email", "topic", "position", "channel", "replied"], ms.map((m) => [m.received, m.name, m.email, m.topic, m.position, m.channel, m.replied])) }, "Export")));
}

function messageAdder(o: Office, save: () => void, again: () => void) {
  const who = h("input", { class: "pro-url", placeholder: "From (name, or pick someone in People)", list: "po-people" }) as HTMLInputElement;
  const people = h("datalist", { id: "po-people" }, ...o.contacts.map((c) => h("option", { value: c.name })));
  const topic = h("input", { class: "pro-url", placeholder: "Topic", list: "po-topics" }) as HTMLInputElement;
  const topics = h("datalist", { id: "po-topics" }, ...[...new Set([...(o.messages ?? []).map((m) => m.topic), ...topTopics(o.contacts, 20).map((t) => t.topic)])].map((t) => h("option", { value: t })));
  const pos = h("select", { class: "pro-url" }, ...POSITIONS.map((p) => h("option", { value: p.id }, p.label))) as HTMLSelectElement;
  const ch = h("select", { class: "pro-url" }, ...CHANNELS.map((c) => h("option", { value: c }, c))) as HTMLSelectElement;
  return h("div", {}, title("Log a message"), who, people, topic, topics, h("div", { class: "po-add" }, pos, ch, h("button", { class: "pill-btn", onclick: () => {
    if (!who.value.trim() || !topic.value.trim()) return;
    const c = o.contacts.find((x) => x.name === who.value.trim());
    (o.messages ??= []).push({ id: newId(), contact: c?.id, name: who.value.trim(), email: c?.email, topic: topic.value.trim(), position: pos.value as Position, channel: ch.value, received: today(), lon: c?.lon, lat: c?.lat });
    save(); again();
  } }, "Add")));
}

const templateFor = (o: Office, topic: string): Template | undefined => (o.templates ?? []).find((t) => t.topic.toLowerCase() === topic.toLowerCase()) ?? (o.templates ?? []).find((t) => t.topic === "*");

function replyScreen(ctx: WorkCtx, o: Office, m: Message, save: () => void, back: () => void) {
  const tpl = templateFor(o, m.topic);
  const text = h("textarea", { class: "pro-url po-letter", rows: 10 }, tpl ? merge(tpl.body, m) : `Dear {first},\n\nThank you for writing about ${m.topic}.\n\n`.replace("{first}", m.name.split(" ")[0])) as HTMLTextAreaElement;
  const mark = () => { m.replied = today(); save(); back(); };
  ctx.show(`Reply to ${m.name}`, back,
    h("p", { class: "muted small" }, `${posOf(m.position).label} on ${m.topic} · ${m.channel} · received ${m.received}${tpl ? " · from your form letter" : " · no form letter for this topic yet"}`),
    text,
    h("div", { class: "row" },
      h("button", { class: "pill-btn", onclick: () => void navigator.clipboard?.writeText(text.value).then(() => ctx.app.toast("Copied.", 2000)) }, "Copy"),
      m.email ? h("a", { class: "pill-btn", href: `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic}`)}&body=${encodeURIComponent(text.value)}`, onclick: () => setTimeout(mark, 300) }, "Email it") : "",
      h("button", { class: "primary-btn", onclick: mark }, "Mark replied")));
}

function replyAll(ctx: WorkCtx, o: Office, topic: string, save: () => void, back: () => void) {
  const waiting = (o.messages ?? []).filter((m) => m.topic === topic && !m.replied);
  if (!waiting.length) { ctx.app.toast("Everyone on this topic has a reply.", 3000); return; }
  const tpl = templateFor(o, topic);
  if (!tpl) { ctx.app.toast(`Write a form letter for ${topic} first.`, 3500); templatesScreen(ctx, o, save, back, topic); return; }
  downloadCsv(`${topic} replies ${today()}`, ["name", "email", "letter"], waiting.map((m) => [m.name, m.email, merge(tpl.body, m)]));
  if (confirm(`${waiting.length} merged letters downloaded for your mail system. Mark them replied?`)) { for (const m of waiting) m.replied = today(); save(); }
  back();
}

function templatesScreen(ctx: WorkCtx, o: Office, save: () => void, back: () => void, topic = "") {
  const again = () => templatesScreen(ctx, o, save, back);
  const tp = h("input", { class: "pro-url", placeholder: "Topic (or * for any)", value: topic }) as HTMLInputElement;
  const body = h("textarea", { class: "pro-url po-letter", rows: 8, placeholder: "Dear {first},\n\nThank you for writing to me about {topic}…" }) as HTMLTextAreaElement;
  ctx.show("Form letters", back,
    h("p", { class: "muted small" }, "Write once per topic; {first}, {name} and {topic} are filled in for each person."),
    ...(o.templates ?? []).map((t) => h("details", {}, h("summary", { class: "link-btn" }, t.topic === "*" ? "Any topic" : t.topic),
      h("textarea", { class: "pro-url po-letter", rows: 8, onchange: (e: Event) => { t.body = (e.target as HTMLTextAreaElement).value; save(); } }, t.body),
      h("button", { class: "link-btn danger", onclick: () => { o.templates = (o.templates ?? []).filter((x) => x !== t); save(); again(); } }, "Remove"))),
    title("A new form letter"), tp, body,
    h("button", { class: "primary-btn", onclick: () => { if (!tp.value.trim() || !body.value.trim()) return; (o.templates ??= []).push({ id: newId(), topic: tp.value.trim(), body: body.value }); save(); again(); } }, "Save"));
}

async function importMessages(ctx: WorkCtx, o: Office, save: () => void, again: () => void) {
  const text = await pickFile(".csv,text/csv");
  if (!text) return;
  const ms = messagesFromRows(parseCsv(text), newId);
  for (const m of ms) { const c = o.contacts.find((x) => x.name.toLowerCase() === m.name.toLowerCase() || (m.email && x.email === m.email)); if (c) { m.contact = c.id; m.lon = c.lon; m.lat = c.lat; } }
  (o.messages ??= []).push(...ms);
  save(); ctx.app.toast(`${ms.length} messages imported.`, 3000); again();
}

// ---- Casework by agency ------------------------------------------------------------------------------

export function caseStatsBlock(o: Office) {
  const st = agencyStats(o.cases, today());
  const noRelease = st.reduce((s, a) => s + a.noRelease, 0);
  return h("div", {},
    noRelease ? lines(`⚠️ ${noRelease} open ${noRelease === 1 ? "case has" : "cases have"} no privacy release on file: agencies won't discuss a case without one.`) : "",
    st.length ? h("table", { class: "po-table" }, h("thead", {}, h("tr", {}, ...["Agency", "Open", "Median days open", "Median to close"].map((x) => h("th", {}, x)))),
      h("tbody", {}, ...st.map((a) => h("tr", {}, h("td", {}, a.agency), h("td", {}, String(a.open)), h("td", {}, a.open ? String(Math.round(a.medianOpen)) : "—"), h("td", {}, a.closed ? String(Math.round(a.medianToClose)) : "—"))))) : "");
}

// ---- Event invites ---------------------------------------------------------------------------------

export function inviteScreen(ctx: WorkCtx, o: Office, e: OfficeEvent, back: () => void) {
  let km = 15, topic = "";
  const out = h("div", {});
  const render = () => {
    if (!e.place) { out.replaceChildren(empty("This event has no place set.")); return; }
    const inv = inviteList(o.contacts, e.place, km, topic || undefined);
    out.replaceChildren(
      lines(`${inv.length} ${inv.length === 1 ? "person" : "people"} within ${km} km${topic ? ` who care about ${topic}` : ""}.`),
      list(...inv.map((x) => row({ color: "#5160c2" }, x.c.name, [x.c.topics.join(", "), kmText(x.km), x.c.email ?? x.c.phone ?? ""].filter(Boolean).join(" · ")))),
      h("button", { class: "pill-btn", onclick: () => downloadCsv(`Invites ${e.title} ${e.date}`, ["name", "email", "phone", "address", "distance km", "topics"], inv.map((x) => [x.c.name, x.c.email, x.c.phone, x.c.address, x.km.toFixed(1), x.c.topics.join("; ")])) }, "Export the invite list"));
  };
  const topics = topTopics(o.contacts, 20);
  ctx.show(e.title, back,
    h("p", { class: "muted small" }, [e.date, e.time, e.place?.name].filter(Boolean).join(" · ")),
    field("Within", select(String(km) as string, [["5", "5 km"], ["15", "15 km"], ["30", "30 km"], ["60", "60 km"]], (v) => { km = Number(v); render(); })),
    field("Interested in", select("", [["", "Anyone"], ...topics.map((t) => [t.topic, t.topic] as [string, string])], (v) => { topic = v; render(); })),
    out);
  render();
}

// ---- Finding a district beyond Congress ------------------------------------------------------------

export function districtFinder(ctx: WorkCtx, done: (d: District, level: "state" | "local", name: string) => void, back: () => void) {
  const name = h("input", { class: "pro-url", placeholder: "The office's name, e.g. Senator Ada Brooks, Ward 3 Council" }) as HTMLInputElement;
  const addr = h("input", { class: "pro-url", placeholder: "Any address in the district" }) as HTMLInputElement;
  const chamber = h("select", { class: "pro-url" }, h("option", { value: "upper" }, "State senate (upper chamber)"), h("option", { value: "lower" }, "State house or assembly (lower chamber)")) as HTMLSelectElement;
  const msg = h("p", { class: "muted small" });
  ctx.show("A state or local office", back,
    h("p", {}, "State legislative districts come from the Census Bureau for all 50 states. For a council, county or any other body, bring its boundary as a GeoJSON file (most city open-data portals publish wards)."),
    name,
    title("State legislature"), addr, chamber,
    h("button", { class: "primary-btn", onclick: async () => {
      const [r] = await geocode(addr.value.trim()).catch(() => []);
      if (!r) { msg.textContent = "Couldn't find that address."; return; }
      msg.textContent = "Finding the district…";
      const d = await legislativeDistrictAt(r.lon, r.lat, chamber.value as "upper" | "lower").catch(() => null);
      if (!d) { msg.textContent = "No state legislative district found there."; return; }
      done(d, "state", name.value.trim() || d.name);
    } }, "Find the district"), msg,
    title("Council or other"),
    h("button", { class: "pill-btn", onclick: async () => {
      const text = await pickFile(".geojson,.json,application/geo+json,application/json");
      const d = text ? districtFromGeoJson(text, name.value.trim() || "My district") : null;
      if (!d) { msg.textContent = "That file has no polygon in it."; return; }
      done(d, "local", name.value.trim() || d.name);
    } }, "Upload a boundary (GeoJSON)"));
}

// ---- The office report -----------------------------------------------------------------------------

export function officeReport(o: Office) {
  const t = today(), s = mailStats(o.messages ?? [], t), q = caseQueue(o.cases, t), st = agencyStats(o.cases, t);
  const soon = o.events.filter((e) => e.date >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  printReport(`${o.name}: weekly report`, t, [
    { heading: "This week", kpis: [[String(s.byWeek[s.byWeek.length - 1] ?? 0), "messages in"], [String(s.queue.length), "awaiting reply"], [String(q.length), "open cases"], [String(soon.length), "events ahead"]] },
    { heading: "What people are writing about", table: { head: ["Topic", "Messages", "Support", "Oppose", "This week"], rows: s.topics.slice(0, 12).map((x) => [x.topic + (x.rising ? " (rising)" : ""), x.n, x.support, x.oppose, x.thisWeek]) } },
    { heading: "Casework by agency", table: { head: ["Agency", "Open", "Median days open", "Median days to close", "Missing releases"], rows: st.map((a) => [a.agency, a.open, a.open ? Math.round(a.medianOpen) : "—", a.closed ? Math.round(a.medianToClose) : "—", a.noRelease]) } },
    { heading: "Oldest open cases", table: { head: ["Case", "Agency", "Days"], rows: q.slice(0, 10).map((c) => [c.subject, c.agency, c.days]) } },
    { heading: "Bills", lines: o.bills.map((b) => { const tl = tally(Object.values(b.members), 0); return `${[b.number, b.title].filter(Boolean).join(" · ")}: ${STANCES.filter((x) => tl.counts[x.id]).map((x) => `${x.label} ${tl.counts[x.id]}`).join(", ") || "no stances yet"}`; }) },
    { heading: "Coming up", table: { head: ["Date", "Event", "Where"], rows: soon.map((e) => [e.date, e.title, e.place?.name ?? ""]) } },
    { heading: "Stakeholders' positions", lines: o.bills.flatMap((b) => o.contacts.filter((c) => c.stance[b.id] && c.kind !== "constituent").map((c) => `${c.name}: ${stanceOf(c.stance[b.id]).label} on ${b.number ?? b.title}`)) },
  ], "Messages and casework as logged in the office's Politics Pro.");
}

