// "Bring in open data" for the Pro tools: paste a dataset link from any city or county portal, see how many
// rows have a location, confirm which column is which, and import. Used for permits (Construction Pro) and
// facilities (City Ops).
import type { App } from "../../app";
import { detectSource, guessFields, loadDataset, PORTALS, rowsFromCsv, rowsFromJson, type FieldMap, type FieldRole, type Row } from "../../data/opendata";
import { h } from "../../ui/dom";

const ROLE_LABEL: Record<FieldRole, string> = { name: "Name or description", address: "Address", date: "Date (issued or started)", type: "Type", value: "Value ($)", owner: "Owner", contractor: "Contractor or applicant", status: "Status", stories: "Stories" };

export function openDataImporter(app: App, opts: { roles: FieldRole[]; what: string; onImport: (rows: Row[], map: FieldMap, label: string) => void }): HTMLElement {
  const link = h("input", { class: "pro-url", type: "url", placeholder: "Paste a dataset link (Socrata, ArcGIS, GeoJSON or CSV)", "aria-label": "Dataset link" }) as HTMLInputElement;
  const msg = h("p", { class: "muted small", role: "status" });
  const step2 = h("div", { class: "od-step" });
  const load = async (file?: { name: string; text: string }) => {
    const src = file ? { kind: /\.csv$/i.test(file.name) ? "csv" as const : "geojson" as const, url: "", label: file.name } : detectSource(link.value);
    step2.replaceChildren();
    if (!src) { msg.textContent = "That link isn't one Atlas can read yet. Use the dataset's page on a Socrata portal, an ArcGIS FeatureServer layer link, or a .geojson / .csv file link."; return; }
    msg.textContent = `Loading from ${src.label}…`;
    try {
      const rows = file ? (src.kind === "csv" ? rowsFromCsv(file.text) : rowsFromJson(JSON.parse(file.text))) : await loadDataset(src);
      if (!rows.length) { msg.textContent = "The dataset loaded, but no rows had a location Atlas could read."; return; }
      const map = guessFields(rows);
      const keys = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r.props)))].sort();
      msg.textContent = `${rows.length.toLocaleString()} rows with a location. Check which column is which, then import.`;
      const selects = opts.roles.map((role) => {
        const sel = h("select", { class: "pro-url", "aria-label": ROLE_LABEL[role] }, h("option", { value: "" }, "—"), ...keys.map((k) => h("option", { value: k, selected: map[role] === k }, k))) as HTMLSelectElement;
        sel.addEventListener("change", () => { map[role] = sel.value || undefined; preview(); });
        return h("label", { class: "od-field" }, h("span", {}, ROLE_LABEL[role]), sel);
      });
      const table = h("div", { class: "od-preview" });
      const preview = () => table.replaceChildren(...rows.slice(0, 3).map((r) => h("div", { class: "od-row" }, ...opts.roles.filter((role) => map[role]).map((role) => h("span", {}, h("small", {}, ROLE_LABEL[role]), (r.props[map[role]!] ?? "").slice(0, 60) || "—")))));
      preview();
      step2.replaceChildren(h("div", { class: "od-fields" }, ...selects), table,
        h("button", { class: "primary-btn", onclick: () => { opts.onImport(rows, { ...map }, src.label); app.toast(`Imported from ${src.label}.`); } }, `Import ${rows.length.toLocaleString()} ${opts.what}`));
    } catch (e) {
      msg.textContent = (e as Error).message.includes("Failed to fetch") ? "Couldn't reach that portal from this browser (it may block other sites from reading it). Download the data as CSV or GeoJSON and import the file instead." : (e as Error).message;
    }
  };
  return h("div", { class: "edu-form od" },
    h("strong", {}, "Any city or county open-data portal"),
    h("div", { class: "pf-add con-base" }, link, h("button", { class: "pill-btn", onclick: () => void load() }, "Load")),
    h("button", { class: "link-btn", onclick: async () => {
      const input = h("input", { type: "file", accept: ".csv,.geojson,.json,text/csv,application/json" }) as HTMLInputElement;
      input.onchange = async () => { const f = input.files?.[0]; if (f) void load({ name: f.name, text: await f.text() }); };
      input.click();
    } }, "…or a CSV / GeoJSON file you downloaded"), msg, step2,
    h("details", { class: "od-portals" }, h("summary", {}, "Where to find it"),
      h("ul", {}, ...PORTALS.map((p) => h("li", {}, h("a", { href: p.url, target: "_blank", rel: "noopener" }, p.place), h("small", {}, ` · ${p.look}`))))));
}
