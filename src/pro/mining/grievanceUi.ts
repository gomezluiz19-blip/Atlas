// The grievance mechanism and commitments register screens for Mining Pro,
// and the board report. A grievance moves through stages (received,
// acknowledged, investigating, response given, closed, or appealed), each
// stamped with a date and kept in its history, measured against the response
// times the mine has committed to.
import { h } from "../../ui/dom";
import type { WorkCtx } from "../../work/hub";
import { newId } from "../../work/store";
import { parseCsv } from "../office/model";
import { addDays, days, dueSoon, fmt, moodCounts, moodOf, today } from "../kit/ops";
import { ageBadge, empty, field, input, kpis, lines, list, row, select, title } from "../kit/ui";
import { downloadCsv, pickFile, printReport, type Section } from "../kit/report";
import { economics, usd, type Mine } from "./model";
import {
  ACK_DAYS, advance, CATEGORIES, CHANNELS, commitmentStatus, goingCold, grievanceKpis, RESPOND_DAYS, sla, stageOf, STAGES,
  type Commitment, type Grievance, type Stage,
} from "./social";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const STAGE_COLOR: Record<Stage, string> = { received: "#d19a2e", acknowledged: "#e1b843", investigating: "#3563d6", responded: "#5160c2", closed: "#5b9467", appealed: "#c4513a" };

export function grievancePanel(ctx: WorkCtx, m: Mine, save: () => void, reopen: () => void) {
  const t = today(), k = grievanceKpis(m.issues, t);
  const open = m.issues.filter((g) => stageOf(g) !== "closed").map((g) => ({ g, s: sla(g, t) })).sort((a, b) => Number(b.s.lateAck || b.s.lateResponse) - Number(a.s.lateAck || a.s.lateResponse) || b.g.severity - a.g.severity || b.s.age - a.s.age);
  const most = Math.max(1, ...k.months.map((x) => x.n));
  const party = (id?: string) => m.parties.find((p) => p.id === id)?.name;
  return h("div", {},
    kpis([pct(k.ackOnTime), `acknowledged in ${ACK_DAYS} days`, (k.ackOnTime ?? 1) < 0.8], [pct(k.respondOnTime), `answered in ${RESPOND_DAYS} days`, (k.respondOnTime ?? 1) < 0.8],
      [k.medianDaysToClose ? `${Math.round(k.medianDaysToClose)} d` : "—", "median to close"], [pct(k.satisfaction), "satisfied at closing", (k.satisfaction ?? 1) < 0.6]),
    lines(
      `${k.open} open of ${k.total} logged${k.appealed ? `, ${k.appealed} appealed` : ""}.`,
      k.lateAck ? `⚠️ ${k.lateAck} not acknowledged within ${ACK_DAYS} days.` : "",
      k.lateResponse ? `⚠️ ${k.lateResponse} without a response after ${RESPOND_DAYS} days.` : "",
      ...k.repeat.map((r) => `Repeated: ${party(r.party) ?? "one group"} has raised ${r.n} in the last year. Look for the cause, not just the cases.`)),
    h("div", { class: "gm-months", title: "Grievances received each month, last 12 months" }, ...k.months.map((x) => h("span", { style: `--h:${(x.n / most) * 100}%`, title: `${x.month}: ${x.n}` }, h("i", {}), h("small", {}, x.month.slice(5))))),
    k.byCategory.length ? h("div", { class: "chips wrap" }, ...k.byCategory.map((c) => h("span", { class: "chip static" }, `${c.cat} · ${c.n}`))) : "",
    title("Open grievances"),
    open.length ? list(...open.map(({ g, s }) => row({ color: STAGE_COLOR[stageOf(g)] }, g.title,
      [STAGES.find((x) => x.id === stageOf(g))!.label, g.category, g.anonymous ? "anonymous" : party(g.party), s.lateAck ? "late to acknowledge" : s.lateResponse ? "late to respond" : ""].filter(Boolean).join(" · "),
      () => grievanceScreen(ctx, m, g, save, reopen), ageBadge(s.age, "days", s.lateAck || s.lateResponse)))) : empty("No open grievances."),
    h("div", { class: "row" },
      h("button", { class: "primary-btn", onclick: () => grievanceScreen(ctx, m, null, save, reopen) }, "+ Log a grievance"),
      h("button", { class: "pill-btn", onclick: () => exportRegister(m) }, "Export the register"),
      h("button", { class: "pill-btn", onclick: () => void importRegister(ctx, m, save, reopen) }, "Import")),
    m.issues.some((g) => stageOf(g) === "closed") ? h("details", {}, h("summary", { class: "link-btn" }, `Closed (${m.issues.filter((g) => stageOf(g) === "closed").length})`),
      list(...m.issues.filter((g) => stageOf(g) === "closed").map((g) => row({ color: STAGE_COLOR.closed }, g.title, [g.category, g.closed ? `closed ${g.closed}` : "", g.satisfied === undefined ? "" : g.satisfied ? "satisfied" : "not satisfied"].filter(Boolean).join(" · "), () => grievanceScreen(ctx, m, g, save, reopen))))) : "");
}

export function grievanceScreen(ctx: WorkCtx, m: Mine, g: Grievance | null, save: () => void, back: () => void) {
  const fresh = !g, t = today();
  let x: Grievance = g ?? { id: newId(), title: "", opened: t, updated: t, status: "open", severity: 2, stage: "received", category: "Other", channel: "In person", history: [] };
  const note = h("input", { class: "pro-url", placeholder: "What was done or said (kept in the history)" }) as HTMLInputElement;
  const commit = () => { const i = m.issues.findIndex((y) => y.id === x.id); if (i >= 0) m.issues[i] = x; else m.issues.push(x); save(); };
  const st = stageOf(x);
  const next: Stage[] = st === "received" ? ["acknowledged"] : st === "acknowledged" ? ["investigating", "responded"] : st === "investigating" ? ["responded"] : st === "responded" ? ["closed", "appealed"] : st === "appealed" ? ["investigating", "responded"] : ["appealed"];
  const s = sla(x, t);
  ctx.show(fresh ? "Log a grievance" : x.title, back,
    field("What", input(x.title, (v) => (x.title = v), { placeholder: "In the person's own words, briefly" })),
    field("Category", select(x.category ?? "Other", CATEGORIES.map((c) => [c, c] as [string, string]), (v) => (x.category = v))),
    field("Received by", select(x.channel ?? "In person", CHANNELS.map((c) => [c, c] as [string, string]), (v) => (x.channel = v))),
    field("From", select(x.party ?? "", [["", x.anonymous ? "Anonymous" : "—"], ...m.parties.map((p) => [p.id, p.name] as [string, string])], (v) => (x.party = v || undefined))),
    h("label", { class: "po-field" }, h("span", {}, "Anonymous"), h("input", { type: "checkbox", checked: !!x.anonymous, onchange: (e: Event) => (x.anonymous = (e.target as HTMLInputElement).checked) })),
    field("Where", select(x.site ?? "", [["", "—"], ...m.sites.map((y) => [y.id, y.name] as [string, string])], (v) => (x.site = v || undefined))),
    field("How serious", select(String(x.severity) as "1" | "2" | "3", [["1", "Low"], ["2", "Medium"], ["3", "High"]], (v) => (x.severity = Number(v) as 1 | 2 | 3))),
    fresh ? field("Received on", input(x.opened, (v) => { x.opened = v || x.opened; x.updated = x.opened; }, { type: "date" })) : "",
    !fresh ? h("div", {},
      lines(`${STAGES.find((y) => y.id === st)!.label} · ${s.age} days since received.`, s.lateAck ? `⚠️ Past the ${ACK_DAYS}-day acknowledgement.` : "", s.lateResponse ? `⚠️ Past the ${RESPOND_DAYS}-day response.` : ""),
      note,
      h("div", { class: "row" }, ...next.map((n) => h("button", { class: n === "closed" ? "primary-btn" : "pill-btn", onclick: () => {
        let satisfied: boolean | undefined;
        if (n === "closed") { const a = prompt("Was the person satisfied with the outcome? (yes / no / skip)", "yes"); satisfied = a?.toLowerCase().startsWith("y") ? true : a?.toLowerCase().startsWith("n") ? false : undefined; }
        x = advance(x, n, t, note.value.trim() || undefined);
        if (satisfied !== undefined) x.satisfied = satisfied;
        commit(); grievanceScreen(ctx, m, x, save, back);
      } }, `→ ${STAGES.find((y) => y.id === n)!.label}`)),
        h("button", { class: "link-btn", onclick: () => { if (!note.value.trim()) return; x = { ...x, updated: t, history: [...(x.history ?? []), { at: t, text: note.value.trim() }] }; commit(); grievanceScreen(ctx, m, x, save, back); } }, "Add a note")),
      title("History"),
      h("div", { class: "po-log" }, ...[...(x.history ?? [])].reverse().map((l) => h("p", {}, h("small", {}, l.at), " ", l.text)))) : "",
    h("div", { class: "row" },
      h("button", { class: "primary-btn", onclick: () => {
        if (!x.title) { ctx.app.toast("Say what the grievance is.", 3000); return; }
        if (fresh) x.history = [{ at: x.opened, text: `Received${x.channel ? ` (${x.channel.toLowerCase()})` : ""}` }];
        commit(); back();
      } }, fresh ? "Log it" : "Save"),
      !fresh ? h("button", { class: "link-btn danger", onclick: () => { if (confirm("Delete this grievance? (Usually you'd close it instead.)")) { m.issues = m.issues.filter((y) => y.id !== x.id); save(); back(); } } }, "Delete") : ""));
}

const REG_HEAD = ["id", "received", "title", "category", "channel", "from", "anonymous", "severity", "stage", "acknowledged", "responded", "closed", "satisfied", "days open"];

function exportRegister(m: Mine) {
  const t = today(), party = (id?: string) => m.parties.find((p) => p.id === id)?.name ?? "";
  downloadCsv(`${m.name} grievance register ${t}`, REG_HEAD, m.issues.map((g) => [g.id, g.opened, g.title, g.category, g.channel, g.anonymous ? "" : party(g.party), g.anonymous ? "yes" : "", g.severity, stageOf(g), g.acknowledged, g.responded, g.closed, g.satisfied === undefined ? "" : g.satisfied ? "yes" : "no", days(g.opened, g.closed ?? t)]));
}

/** A register from another system (or a spreadsheet) comes in: the usual columns are understood. */
async function importRegister(ctx: WorkCtx, m: Mine, save: () => void, reopen: () => void) {
  const text = await pickFile(".csv,text/csv");
  if (!text) return;
  const rows = parseCsv(text);
  const col = (r: Record<string, string>, ...names: string[]) => names.map((n) => r[n]).find((v) => v) ?? "";
  let n = 0;
  for (const r of rows) {
    const t = col(r, "title", "grievance", "description", "summary", "issue");
    if (!t) continue;
    const opened = (col(r, "received", "date", "opened", "date received") || today()).slice(0, 10);
    const who = col(r, "from", "complainant", "stakeholder", "community");
    let p = m.parties.find((x) => x.name.toLowerCase() === who.toLowerCase());
    if (who && !p) { p = { id: newId(), name: who, kind: "community", mood: "neutral", log: [] }; m.parties.push(p); }
    const stage = (STAGES.find((s) => s.id === col(r, "stage", "status").toLowerCase())?.id) ?? (col(r, "closed") ? "closed" : "received");
    m.issues.push({ id: newId(), title: t, opened, updated: opened, status: stage === "closed" ? "closed" : "open", severity: (Number(col(r, "severity", "priority")) || 2) as 1 | 2 | 3,
      category: col(r, "category", "type") || "Other", channel: col(r, "channel", "received by") || undefined, party: p?.id, stage,
      acknowledged: col(r, "acknowledged") || undefined, responded: col(r, "responded") || undefined, closed: col(r, "closed") || undefined, anonymous: /^y/i.test(col(r, "anonymous")), history: [{ at: opened, text: "Imported" }] });
    n++;
  }
  save(); ctx.app.toast(`${n} grievances imported.`, 3000); reopen();
}

// ---- Commitments ----------------------------------------------------------------------------------

export function commitmentsPanel(_ctx: WorkCtx, m: Mine, save: () => void, reopen: () => void) {
  const t = today(), cs = m.commitments ?? [], st = commitmentStatus(cs, t);
  const to = (id?: string) => m.parties.find((p) => p.id === id)?.name;
  const text = h("input", { class: "pro-url", placeholder: "A promise made: a borehole, a road, a report…" }) as HTMLInputElement;
  const due = h("input", { class: "pro-url", type: "date", value: addDays(t, 60) }) as HTMLInputElement;
  const who = h("select", { class: "pro-url" }, h("option", { value: "" }, "To whom"), ...m.parties.map((p) => h("option", { value: p.id }, p.name))) as HTMLSelectElement;
  return h("div", {},
    title("Commitments"),
    lines(
      st.open.length ? `${st.open.length} open${st.overdue.length ? `, ⚠️ ${st.overdue.length} overdue` : ""}${st.soon.length ? `, ${st.soon.length} due within 30 days` : ""}.` : "No open commitments.",
      st.kept ? `${st.kept} kept, ${st.keptOnTime} on time.` : ""),
    st.open.length ? list(...st.open.map((c) => row(c.left < 0 ? "⏰" : "🤝", c.text, [to(c.to), c.owner, c.left < 0 ? `${-c.left} days overdue` : `due ${c.due}`].filter(Boolean).join(" · "),
      () => { if (confirm(`Mark "${c.text}" as kept?`)) { const x = cs.find((y) => y.id === c.id)!; x.status = "done"; x.done = t; save(); reopen(); } }, ageBadge(Math.abs(c.left), c.left < 0 ? "late" : "days", c.left < 0)))) : "",
    h("div", { class: "po-add" }, text, who, due, h("button", { class: "pill-btn", onclick: () => {
      if (!text.value.trim()) return;
      (m.commitments ??= []).push({ id: newId(), text: text.value.trim(), to: who.value || undefined, made: t, due: due.value, status: "open" } satisfies Commitment);
      save(); reopen();
    } }, "Add")));
}

export function coldLines(m: Mine) {
  const cold = goingCold(m.parties, today());
  return cold.length ? lines(`Not heard from in 90 days: ${cold.slice(0, 5).map((c) => `${c.p.name.replace(/ \(demo\)/, "")}${Number.isFinite(c.since) ? ` (${c.since} d)` : " (never)"}`).join(", ")}.`) : "";
}

// ---- The board report -----------------------------------------------------------------------------

export function boardReport(m: Mine, tailings?: { cls: string; par: number; partial: boolean; places: string[] }) {
  const t = today(), e = economics(m.econ), k = grievanceKpis(m.issues, t), cs = commitmentStatus(m.commitments ?? [], t), permits = dueSoon(m.permits, t, 120);
  const party = (id?: string) => m.parties.find((p) => p.id === id)?.name ?? "";
  const sections: Section[] = [
    { heading: "At a glance", kpis: [[usd(e.revenue), "revenue a year"], [String(k.open), "open grievances"], [String(cs.overdue.length), "commitments overdue"], [tailings?.cls ?? "—", "tailings consequence (GISTM)"]] },
    { heading: "Grievance mechanism", kpis: [[pct(k.ackOnTime), `acknowledged in ${ACK_DAYS} days`], [pct(k.respondOnTime), `answered in ${RESPOND_DAYS} days`], [k.medianDaysToClose ? `${Math.round(k.medianDaysToClose)} days` : "—", "median to close"], [pct(k.satisfaction), "satisfied at closing"]] },
    { heading: "What people raise (last 12 months)", table: { head: ["Category", "Grievances"], rows: k.byCategory.map((c) => [c.cat, c.n]) } },
    { heading: "Open grievances", table: { head: ["Received", "Grievance", "From", "Stage", "Days"], rows: m.issues.filter((g) => stageOf(g) !== "closed").map((g) => [g.opened, g.title, g.anonymous ? "Anonymous" : party(g.party), STAGES.find((s) => s.id === stageOf(g))!.label, days(g.opened, t)]) } },
    { heading: "Commitments", table: { head: ["Commitment", "To", "Due", "Status"], rows: (m.commitments ?? []).map((c) => [c.text, party(c.to), c.due, c.status === "done" ? `kept ${c.done ?? ""}` : c.due < t ? "OVERDUE" : "open"]) } },
    { heading: "Stakeholders", lines: [moodCounts(m.parties).filter((x) => x.n).map((x) => `${x.label}: ${x.n}`).join(" · "), ...goingCold(m.parties, t).slice(0, 6).map((c) => `Not heard from in ${Number.isFinite(c.since) ? `${c.since} days` : "the log"}: ${c.p.name}`)] },
    { heading: "Permits due in the next four months", table: { head: ["Permit", "Expires", "Days"], rows: permits.map((p) => [p.title, p.date, p.left < 0 ? `expired ${-p.left} days ago` : p.left]) } },
  ];
  if (tailings) sections.push({ heading: "Tailings dam: consequence of failure", lines: [
    `GISTM consequence class by population at risk: ${tailings.cls}${tailings.partial ? " (at least; some communities have no population recorded)" : ""}.`,
    `People counted downstream along the flow path: ${fmt(tailings.par)}.`,
    ...(tailings.places.length ? [`Downstream, nearest first: ${tailings.places.join(", ")}.`] : []),
    "Places within 2 km of the steepest way down from the dam, on elevation sampled every 500 m: a screening view, not a dam-break study."] });
  printReport(`${m.name}: board report`, `${[m.country, t].filter(Boolean).join(" · ")}`, sections, "Grievance stages and response times follow IFC Performance Standard 1 practice; consequence classes follow GISTM Annex 2 (population at risk).");
}

export const moodLegend = (m: Mine) => h("div", { class: "pol-legend" }, ...moodCounts(m.parties).filter((x) => x.n).map((x) => h("span", {}, h("i", { style: `background:${x.color}` }), `${x.label} ${x.n}`)));
export { moodOf };
