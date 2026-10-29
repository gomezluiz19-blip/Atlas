// The Work desk: your work as things in real places, the way a CRM keeps it but on the map. A record is a client,
// an order, a shipment (a container, a pallet, a parcel), a job, a case, a visit, a site or an asset; each has a
// place, a status and dates, belongs to something (an order to its client) and can wait on something else (an
// order on its shipment, a hearing on a filing). Because records are linked, a slip anywhere carries forward: a
// container four days behind makes its order late, which lands on a client, with the money at stake. That chain,
// in plain words, is what the desk shows first. Pure, so it's tested (tests/workDesk.test.ts).

export type Kind = "client" | "order" | "shipment" | "job" | "case" | "visit" | "site" | "asset" | "staff";
export type Health = "ok" | "watch" | "late" | "blocked" | "done";
/** Who the desk is set up for: a company's employee, someone out in the field, or a practitioner on their own. */
export type Role = "company" | "field" | "solo";
/** Services a record may need nearby: each maps to OpenStreetMap tags (services.ts). */
export type Service = "legal" | "notary" | "court" | "customs" | "freight" | "courier" | "accounting" | "insurance" | "medical" | "hotel" | "parts";

export interface Rec {
  id: string;
  kind: Kind;
  title: string;
  /** A second line: a reference, an address, who. */
  sub?: string;
  lon?: number; lat?: number;
  /** What the status says in your own words ("At sea", "Hearing set", "Part on order"). */
  status: string;
  health: Health;
  /** When it's promised (ISO date). */
  due?: string;
  /** When it's now expected (ISO date), if that differs from due. */
  eta?: string;
  /** Money that rides on it. */
  value?: number;
  currency?: string;
  /** What it belongs to: an order's client, a shipment's order. */
  parent?: string;
  /** What it waits on: an order on its shipment, a job on a part. */
  needs?: string[];
  owner?: string;
  /** A tracking number and where to look it up. */
  track?: { number: string; url?: string };
  /** The services it may need nearby (a lawyer, customs, a courier). */
  services?: Service[];
  /** A path for things that travel (a ship's route), [lon, lat] pairs. */
  route?: [number, number][];
  notes?: string;
  history?: { at: string; text: string }[];
}

export interface Book { role: Role; recs: Rec[] }

export const KINDS: Record<Kind, { one: string; many: string }> = {
  client: { one: "Client", many: "Clients" },
  order: { one: "Order", many: "Orders" },
  shipment: { one: "Shipment", many: "Shipments" },
  job: { one: "Job", many: "Jobs" },
  case: { one: "Case", many: "Cases" },
  visit: { one: "Visit", many: "Visits" },
  site: { one: "Site", many: "Sites" },
  asset: { one: "Asset", many: "Assets" },
  // The people who do the work: where each is based, and (through each record's owner) what's on their plate.
  staff: { one: "Person", many: "People" },
};

export const HEALTH: Record<Health, { label: string; color: string; rank: number }> = {
  blocked: { label: "Blocked", color: "#b23a2a", rank: 0 },
  late: { label: "Late", color: "#c8553d", rank: 1 },
  watch: { label: "Watch", color: "#d19a2e", rank: 2 },
  ok: { label: "On track", color: "#5b9467", rank: 3 },
  done: { label: "Done", color: "#8c8f87", rank: 4 },
};

export const ROLES: Record<Role, { label: string; who: string; kinds: Kind[] }> = {
  company: { label: "My company", who: "Clients, orders and what's shipping to them, with the sites in between", kinds: ["client", "order", "shipment", "site", "case", "staff"] },
  field: { label: "In the field", who: "Today's jobs and visits as a round, the parts and people they wait on", kinds: ["job", "visit", "shipment", "site", "asset", "client", "staff"] },
  solo: { label: "On my own", who: "Clients, cases and appointments, with the courts, registries and services near each", kinds: ["client", "case", "visit", "job", "staff"] },
};

// ---- Dates ----------------------------------------------------------------------------------------------

const DAY = 86_400_000;
export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoDay(Date.parse(iso) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

// ---- Consequences -------------------------------------------------------------------------------------------

/**
 * When each open record is now expected, taking what it waits on into account: its own estimate (eta, else due),
 * pushed back by anything it needs that's expected later. Finished records don't hold anything up. Cycles are
 * cut rather than followed forever.
 */
export function projected(recs: Rec[]): Map<string, string | undefined> {
  const by = new Map(recs.map((r) => [r.id, r]));
  const out = new Map<string, string | undefined>();
  const visit = (r: Rec, seen: Set<string>): string | undefined => {
    if (out.has(r.id)) return out.get(r.id);
    if (seen.has(r.id)) return r.eta ?? r.due;
    seen.add(r.id);
    let when = r.eta ?? r.due;
    if (r.health !== "done") for (const n of r.needs ?? []) {
      const dep = by.get(n);
      if (!dep || dep.health === "done") continue;
      const d = visit(dep, seen);
      if (d && (!when || d > when)) when = d;
    }
    out.set(r.id, when);
    return when;
  };
  for (const r of recs) visit(r, new Set());
  return out;
}

/** How many days late a record now runs against its promise (0 if on time or no date). */
export function slip(r: Rec, when: string | undefined, today: string): number {
  if (r.health === "done" || !r.due) return 0;
  const expected = when && when > today ? when : today > r.due ? today : when;
  return expected ? Math.max(0, daysBetween(r.due, expected)) : 0;
}

/** What a record holds up: everything that waits on it, directly or further down, nearest first. */
export function downstream(recs: Rec[], id: string): Rec[] {
  const out: Rec[] = [], seen = new Set([id]);
  let wave = [id];
  while (wave.length) {
    const next: string[] = [];
    for (const r of recs) if (!seen.has(r.id) && r.needs?.some((n) => wave.includes(n))) { seen.add(r.id); out.push(r); next.push(r.id); }
    wave = next;
  }
  return out;
}

/** The chain a record belongs to, up to the top (a shipment → its order → the client). */
export function lineage(recs: Rec[], id: string): Rec[] {
  const by = new Map(recs.map((r) => [r.id, r]));
  const out: Rec[] = [], seen = new Set<string>();
  let cur = by.get(id)?.parent;
  while (cur && !seen.has(cur)) { seen.add(cur); const r = by.get(cur); if (!r) break; out.push(r); cur = r.parent; }
  return out;
}

/** The client (or the topmost record) a record ultimately serves. */
export const clientOf = (recs: Rec[], id: string): Rec | undefined => { const up = lineage(recs, id); return up.find((r) => r.kind === "client") ?? up[up.length - 1]; };

export interface Knock { rec: Rec; days: number; value: number; client?: Rec }
export interface Alert {
  /** The record where it starts. */
  rec: Rec;
  days: number;
  /** What it makes late, with how late, and the money on each. */
  knocks: Knock[];
  /** Money at stake: on the record and everything it makes late. */
  atStake: number;
  sentence: string;
}

const money = (v: number, cur = "USD") => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0, notation: v >= 100_000 ? "compact" : "standard" }).format(v); }
  catch { return `${Math.round(v)} ${cur}`; }
};
const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/**
 * What needs you, worst first: every open record that's blocked, late or running late, traced forward to what
 * it makes late and the money on it. A record that's only late because of something upstream is told as part of
 * that upstream alert, not again on its own.
 */
export function attention(recs: Rec[], today: string): Alert[] {
  const when = projected(recs);
  const late = (r: Rec) => slip(r, when.get(r.id), today);
  const own = (r: Rec) => (r.eta ?? r.due);
  // Where trouble starts: blocked, or late by its own estimate (not only because of what it waits on).
  const roots = recs.filter((r) => r.health !== "done" && (r.health === "blocked" || r.health === "late" || (r.due && own(r) && own(r)! > r.due) || (r.due && today > r.due)));
  const covered = new Set<string>();
  const alerts: Alert[] = [];
  for (const r of roots) {
    const knocks: Knock[] = downstream(recs, r.id)
      .map((d) => ({ rec: d, days: late(d), value: d.value ?? 0, client: d.kind === "client" ? undefined : clientOf(recs, d.id) }))
      .filter((k) => k.days > 0 || r.health === "blocked");
    for (const k of knocks) covered.add(k.rec.id);
    const days = Math.max(late(r), r.eta && r.due ? Math.max(0, daysBetween(r.due, r.eta)) : 0);
    alerts.push({ rec: r, days, knocks, atStake: (r.value ?? 0) + knocks.reduce((s, k) => s + k.value, 0), sentence: "" });
  }
  const kept = alerts.filter((a) => !covered.has(a.rec.id) || a.rec.health === "blocked");
  for (const a of kept) a.sentence = say(a, recs);
  return kept.sort((a, b) => HEALTH[a.rec.health].rank - HEALTH[b.rec.health].rank || b.atStake - a.atStake || b.days - a.days);
}

/** A record as it reads in a sentence: a bare reference gets its kind ("order 1042"); a name stands alone. */
const named = (r: Rec, lower = false) => {
  const kind = lower ? KINDS[r.kind].one.toLowerCase() : KINDS[r.kind].one;
  if (/^[A-Z0-9#][A-Z0-9 #./-]*$/.test(r.title) && r.kind !== "client") return `${kind} ${r.title}`;
  // Mid-sentence, a task's name is just words ("so hot water repair misses…"); a client's stays a name.
  return lower && (r.kind === "job" || r.kind === "visit") ? r.title.charAt(0).toLowerCase() + r.title.slice(1) : r.title;
};

/** One alert in plain words: "Shipment MSKU 7714200 is 6 days behind, so order 1042 for Halden Foods misses 12 Nov by 2 days (€48,000)." */
export function say(a: Alert, recs: Rec[]): string {
  const r = a.rec;
  const client = r.kind === "client" ? undefined : clientOf(recs, r.id);
  // Lead with what costs most (an order), not the first thing in line (its customs entry).
  const k = a.knocks.filter((x) => x.rec.kind !== "client").sort((x, y) => y.value - x.value || y.days - x.days)[0];
  const head = r.health === "blocked"
    ? `${named(r)}${client && !k ? ` for ${client.title}` : ""} can't go ahead${r.status ? `: ${r.status.charAt(0).toLowerCase()}${r.status.slice(1)}` : ""}`
    : a.days ? `${named(r)} is ${dayWord(a.days)} behind` : `${named(r)} is running late`;
  if (!k) return `${head}${r.health !== "blocked" && client ? ` for ${client.title}` : ""}${r.value ? ` (${money(r.value, r.currency)})` : ""}.`;
  const more = a.knocks.filter((x) => x.rec.kind !== "client").length - 1;
  const dueText = k.rec.due ? new Date(`${k.rec.due}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "";
  return `${head}, so ${named(k.rec, true)}${k.client ? ` for ${k.client.title}` : ""} ${k.days ? `misses ${dueText} by ${dayWord(k.days)}` : "can't go ahead"}${k.value ? ` (${money(k.value, k.rec.currency)})` : ""}${more > 0 ? `, and ${more} more after it` : ""}.`;
}

// ---- The round (in the field) -------------------------------------------------------------------------------

const km = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2));
};

/**
 * Today's round: the open jobs and visits due today (or overdue) that have a place, in an order that makes a
 * short loop (nearest next, from where you start), with the straight-line distance. Ones that can't go ahead
 * (blocked, or waiting on something not here yet) are set aside, so you don't drive to them.
 */
export function round(recs: Rec[], today: string, start?: { lon: number; lat: number }): { stops: Rec[]; km: number; waiting: Rec[] } {
  const when = projected(recs);
  const todays = recs.filter((r) => (r.kind === "job" || r.kind === "visit") && r.health !== "done" && r.lon !== undefined && r.due && r.due <= today);
  const canGo = (r: Rec) => r.health !== "blocked" && !((when.get(r.id) ?? r.due!) > today && (r.needs?.length ?? 0) > 0);
  const waiting = todays.filter((r) => !canGo(r));
  const left = todays.filter(canGo);
  const stops: Rec[] = [];
  let at = start ?? (left[0] ? { lon: left[0].lon!, lat: left[0].lat! } : undefined), total = 0;
  while (left.length && at) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (km(at, left[i] as Required<Rec>) < km(at, left[best] as Required<Rec>)) best = i;
    const next = left.splice(best, 1)[0];
    total += km(at, next as Required<Rec>);
    stops.push(next);
    at = { lon: next.lon!, lat: next.lat! };
  }
  return { stops, km: total, waiting };
}

// ---- Bringing records in ----------------------------------------------------------------------------------

const col = (row: Record<string, string>, ...names: string[]) => {
  for (const n of names) for (const k of Object.keys(row)) if ((k === n || k.replace(/[^a-z]/g, "") === n.replace(/[^a-z]/g, "")) && row[k]) return row[k];
  return "";
};
const KIND_WORDS: [RegExp, Kind][] = [
  [/staff|employee|team member|person|people|driver|technician|engineer|worker|crew/, "staff"],
  [/client|customer|account|company|contact/, "client"], [/order|deal|opportunit|po\b|purchase/, "order"],
  [/ship|container|parcel|package|consign|freight|pallet|delivery/, "shipment"], [/job|work order|ticket|task|repair|install/, "job"],
  [/case|matter|claim|file/, "case"], [/visit|appointment|meeting|call/, "visit"], [/site|warehouse|store|office|depot|plant/, "site"],
  [/asset|equipment|vehicle|machine|unit/, "asset"],
];
const HEALTH_WORDS: [RegExp, Health][] = [[/block|hold|stuck|cancel/, "blocked"], [/late|overdue|delay|behind/, "late"], [/risk|watch|pending|wait/, "watch"], [/done|closed|delivered|complete|won|paid/, "done"]];
const isoOf = (s: string): string | undefined => {
  if (!s) return undefined;
  const t = Date.parse(s.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, "$3-$2-$1"));
  return Number.isFinite(t) ? isoDay(t) : undefined;
};

/**
 * Rows from any CRM or spreadsheet export become records (pure). Common column names are understood (name,
 * type, status, address, lat/lon, due, value, parent, depends on, tracking); the kind and health are read from
 * the words if not given. Parents and needs can name another row by its id or its name. Rows with an address and
 * no coordinates come back with `where` set, to be found on the map.
 */
export function recsFromRows(rows: Record<string, string>[], fallback: Kind = "client"): (Rec & { where?: string })[] {
  const out = rows.map((row, i) => {
    const title = col(row, "name", "title", "subject", "deal name", "account name", "company", "reference");
    const typeWord = col(row, "kind", "type", "object", "record type", "category").toLowerCase();
    const statusWord = col(row, "status", "stage", "state", "deal stage");
    const kind = KIND_WORDS.find(([re]) => re.test(typeWord))?.[1] ?? KIND_WORDS.find(([re]) => re.test(`${title} ${statusWord}`.toLowerCase()))?.[1] ?? fallback;
    const health = (col(row, "health").toLowerCase() as Health) in HEALTH ? (col(row, "health").toLowerCase() as Health) : HEALTH_WORDS.find(([re]) => re.test(statusWord.toLowerCase()))?.[1] ?? "ok";
    const lat = parseFloat(col(row, "lat", "latitude")), lon = parseFloat(col(row, "lon", "lng", "long", "longitude"));
    const where = [col(row, "address", "street", "location", "billing address", "shipping address"), col(row, "city", "town"), col(row, "postcode", "zip", "postal code"), col(row, "country")].filter(Boolean).join(", ");
    const value = parseFloat(col(row, "value", "amount", "deal value", "price", "total").replace(/[^\d.-]/g, ""));
    const number = col(row, "tracking", "tracking number", "container", "awb", "bol", "bill of lading");
    return {
      id: col(row, "id", "record id", "ref") || `r${i + 1}`,
      kind, title: title || `${KINDS[kind].one} ${i + 1}`, sub: col(row, "description", "notes", "owner name", "contact") || undefined,
      lon: Number.isFinite(lon) ? lon : undefined, lat: Number.isFinite(lat) ? lat : undefined,
      status: statusWord || HEALTH[health].label, health,
      due: isoOf(col(row, "due", "due date", "close date", "deadline", "date")), eta: isoOf(col(row, "eta", "expected", "expected date")),
      value: Number.isFinite(value) ? value : undefined, currency: col(row, "currency") || undefined,
      parent: col(row, "parent", "client", "account", "customer", "order") || undefined,
      needs: col(row, "needs", "depends on", "waits on", "blocked by").split(/[;|]/).map((s) => s.trim()).filter(Boolean),
      owner: col(row, "owner", "assigned to", "assignee") || undefined,
      track: number ? { number } : undefined,
      where: !Number.isFinite(lat) && where ? where : undefined,
    } as Rec & { where?: string };
  });
  // Parents and needs may name a row instead of its id.
  const byName = new Map(out.map((r) => [r.title.toLowerCase(), r.id]));
  const ids = new Set(out.map((r) => r.id));
  const resolve = (v: string) => (ids.has(v) ? v : byName.get(v.toLowerCase()));
  for (const r of out) {
    r.parent = r.parent ? resolve(r.parent) : undefined;
    r.needs = (r.needs ?? []).map(resolve).filter((x): x is string => !!x && x !== r.id);
    if (!r.needs.length) delete r.needs;
  }
  return out;
}
