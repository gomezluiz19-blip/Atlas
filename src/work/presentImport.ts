// Work › Present › Add data: bring in a spreadsheet, a document, JSON, a list of addresses, a number or a picture
// of a chart, see the visuals Terreno can make from it, and add the one that tells it best as a slide. Reading is
// in presentData.ts (and Claude, for pictures of charts and PDFs, when Terreno AI is on); drawing in presentVisual.ts.
import type { App } from "../app";
import { aiOn, askForTool } from "../robot/llm";
import { h } from "../ui/dom";
import { geocode } from "../ui/search";
import { readDocx, readXlsx } from "../util/zip";
import type { WorkCtx } from "./hub";
import { captureView } from "./present";
import { pointsCamera, readText, visualFromJson, type Reading, type Spot, type Suggestion, type Visual } from "./presentData";
import type { Deck, SlideCamera } from "./presentModel";
import { visualEl } from "./presentVisual";
import { newId } from "./store";

const ACCEPT = ".csv,.tsv,.txt,.md,.markdown,.json,.geojson,.xlsx,.docx,.pdf,.html,.htm,image/png,image/jpeg,image/webp,image/gif";

/** A picture made small enough to keep with the story (it lives in this browser's storage). */
async function shrink(file: Blob, max = 1400): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d")!;
  // Charts are drawn on white; keep it white, not black, where the picture was see-through.
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.86);
}

const base64 = (buf: ArrayBuffer) => {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

// ---- Claude reads what Terreno can't on its own -----------------------------------------------------------

const CHART_TOOL = {
  name: "chart_data",
  description: "The numbers a chart or graph shows, read off the picture.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "What the chart shows, in a few plain words." },
      unit: { type: "string", description: "The unit of the values, short: %, $, °C, people, t. Empty if none." },
      kind: { type: "string", enum: ["bars", "line", "share", "number"], description: "bars to compare things, line for change over time, share for parts of a whole, number for a single figure." },
      items: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "number" } }, required: ["label", "value"] }, description: "Each bar, point in time or part, in the chart's order. Values as plain numbers in the unit (no thousands separators)." },
      value: { type: "number", description: "For kind number: the figure." },
    },
    required: ["kind"],
  },
};

const DOC_TOOL = {
  name: "slides_from_document",
  description: "A short presentation drawn from the document.",
  input_schema: {
    type: "object",
    properties: {
      sections: { type: "array", maxItems: 15, items: { type: "object", properties: {
        title: { type: "string", description: "A short headline in plain words." },
        text: { type: "string", description: "One or two sentences to show under it." },
        figure: { type: "object", properties: { value: { type: "number" }, unit: { type: "string" }, label: { type: "string" } }, description: "The one figure this section turns on, if any." },
      }, required: ["title", "text"] } },
      table: CHART_TOOL.input_schema,
      places: { type: "array", items: { type: "string" }, description: "Addresses or named places the document is about, written so a map search finds them." },
    },
    required: ["sections"],
  },
};

const SYSTEM = "You read data for Terreno, a 3D globe used to present. Be exact: only numbers that are really there; never invent. Plain words, no emoji.";

function chartVisual(o: Record<string, unknown> | null | undefined): Visual | undefined {
  if (!o) return undefined;
  const unit = typeof o.unit === "string" && o.unit.trim() ? o.unit.trim() : undefined;
  return visualFromJson(o.kind === "number" ? { kind: "number", title: o.title, unit, value: o.value ?? (o.items as { value: number }[] | undefined)?.[0]?.value } : { ...o, unit });
}

async function readChartPicture(src: string): Promise<Visual | undefined> {
  const [, media, data] = /^data:([^;]+);base64,(.*)$/.exec(src) ?? [];
  const r = await askForTool(SYSTEM, CHART_TOOL, [
    { type: "image", source: { type: "base64", media_type: media, data } },
    { type: "text", text: "Read the numbers this chart shows." },
  ]);
  return chartVisual(r);
}

async function readPdf(buf: ArrayBuffer, name: string): Promise<Reading> {
  const r = await askForTool(SYSTEM, DOC_TOOL, [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64(buf) } },
    { type: "text", text: `Make slides from "${name}": the main points in order, the one table or chart worth showing if there is one, and the places it names.` },
  ], undefined, 4000);
  if (!r) throw new Error("Claude didn't answer.");
  const sections = (Array.isArray(r.sections) ? r.sections : []).map((s: Record<string, unknown>) => {
    const f = s.figure as Record<string, unknown> | undefined;
    const visual = f && typeof f.value === "number" ? visualFromJson({ kind: "number", value: f.value, unit: f.unit || undefined, title: f.label }) : undefined;
    return { title: String(s.title ?? ""), text: String(s.text ?? ""), ...(visual ? { visual } : {}) };
  });
  const suggestions: Suggestion[] = [];
  const chart = chartVisual(r.table as Record<string, unknown>);
  if (chart) suggestions.push({ label: `${chart.title ?? "Its chart"}, as ${chart.kind === "line" ? "a line" : chart.kind === "number" ? "one figure" : chart.kind}`, visual: chart });
  const places = (Array.isArray(r.places) ? r.places : []).filter((x): x is string => typeof x === "string").slice(0, 60);
  if (places.length) suggestions.push({ label: `The ${places.length} place${places.length === 1 ? "" : "s"} it names, on the globe`, visual: { kind: "points", title: "Where", items: [] }, find: places.map((q) => ({ label: q.split(",")[0], query: q })) });
  return { about: `A PDF, read by Claude: ${sections.length} section${sections.length === 1 ? "" : "s"}`, sections, suggestions };
}

// ---- Reading a file ----------------------------------------------------------------------------------------

async function readFile(file: File): Promise<Reading> {
  const name = file.name, ext = name.toLowerCase().split(".").pop() ?? "";
  if (file.type.startsWith("image/")) {
    const src = await shrink(file);
    return { about: "A picture", suggestions: [{ label: "The picture as it is", visual: { kind: "image", title: name.replace(/\.[^.]+$/, ""), src } }] };
  }
  if (ext === "xlsx") return readText(await readXlsx(await file.arrayBuffer()), name.replace(/\.xlsx$/i, ".tsv"));
  if (ext === "docx") return readText(await readDocx(await file.arrayBuffer()), name);
  if (ext === "pdf") {
    if (!aiOn()) throw new Error("Terreno reads PDFs with Claude: turn on Terreno AI (in the task bar's settings), or copy the PDF's text and paste it here.");
    return readPdf(await file.arrayBuffer(), name);
  }
  if (ext === "xls" || ext === "doc" || ext === "ppt" || ext === "pptx" || ext === "key" || ext === "numbers") throw new Error("Save it as .xlsx, .docx or .csv first, or copy what you want and paste it here.");
  let text = await file.text();
  if (ext === "html" || ext === "htm") text = new DOMParser().parseFromString(text, "text/html").body.innerText;
  return readText(text, name);
}

// ---- The screen -------------------------------------------------------------------------------------------

/** Finds places by address or name, one after another, reporting as it goes. */
async function findAll(list: NonNullable<Suggestion["find"]>, near: { lat: number; lon: number } | null, progress: (done: number) => void): Promise<{ found: Spot[]; missed: string[] }> {
  const found: Spot[] = [], missed: string[] = [];
  for (let k = 0; k < list.length; k++) {
    progress(k);
    const f = list[k];
    const hit = (await geocode(f.query, near).catch(() => []))[0];
    if (hit) found.push({ label: f.label || hit.name, lon: hit.lon, lat: hit.lat, ...(f.value !== undefined ? { value: f.value } : {}) });
    else missed.push(f.query);
  }
  progress(list.length);
  return { found, missed };
}

const near = (app: App) => (app.place ? { lat: app.place.lat, lon: app.place.lon } : null);

export function openImport(ctx: WorkCtx, deck: Deck, save: () => void, back: () => void) {
  const { app } = ctx;
  const out = h("div", { class: "pi-out" });
  const status = h("p", { class: "muted small", role: "status" });
  const fileIn = h("input", { type: "file", accept: ACCEPT, hidden: true, onchange: () => { const f = fileIn.files?.[0]; if (f) void load(() => readFile(f), f.name); fileIn.value = ""; } }) as HTMLInputElement;
  const paste = h("textarea", { class: "mp-notes pi-paste", rows: 5, placeholder: "Or paste here: a table from a spreadsheet, a list of addresses, a few lines like “Rent: $1,200”, a single number, or a whole document.", "aria-label": "Paste data" }) as HTMLTextAreaElement;

  const addSlide = async (title: string, text: string, visual?: Visual, camera?: SlideCamera) => {
    const v = camera ? { camera, thumb: undefined } : await captureView(app);
    deck.slides.push({ id: newId(), title, text, camera: v.camera, thumb: v.thumb, ...(visual ? { visual } : {}) });
  };

  const addSuggestion = async (s: Suggestion, btn: HTMLButtonElement) => {
    btn.disabled = true;
    let v = s.visual;
    if (s.find?.length && v.kind === "points") {
      const { found, missed } = await findAll(s.find, near(app), (k) => { btn.textContent = k < s.find!.length ? `Finding ${k + 1} of ${s.find!.length}…` : "Placing…"; });
      if (!found.length) { btn.disabled = false; btn.textContent = "Add as a slide"; status.textContent = "Couldn't find any of those places. Check the spelling, or add the city and country."; return; }
      v = { ...v, items: found, title: v.title ?? `${found.length} place${found.length === 1 ? "" : "s"}` };
      if (missed.length) app.toast(`Couldn't find ${missed.length}: ${missed.slice(0, 3).join("; ")}${missed.length > 3 ? "…" : ""}`, 6000);
    }
    await addSlide(v.title ?? s.label, "", v, v.kind === "points" ? pointsCamera(v.items) : undefined);
    save();
    app.toast(`Added a slide: ${v.title ?? s.label}.`, 3000);
    back();
  };

  const show = (r: Reading) => {
    const cards = r.suggestions.map((s) => {
      const btn = h("button", { class: "primary-btn", onclick: () => void addSuggestion(s, btn) }, "Add as a slide") as HTMLButtonElement;
      const preview = s.find?.length
        ? h("ul", { class: "pi-find" }, ...s.find.slice(0, 4).map((f) => h("li", {}, f.query)), s.find.length > 4 ? h("li", { class: "muted" }, `and ${s.find.length - 4} more`) : "")
        : visualEl(s.visual, true);
      const ask = s.visual.kind === "image" && aiOn()
        ? h("button", { class: "pill-btn", onclick: async (e: Event) => {
            const b = e.currentTarget as HTMLButtonElement;
            b.disabled = true; b.textContent = "Claude is reading it…";
            try {
              const v = await readChartPicture((s.visual as Extract<Visual, { kind: "image" }>).src);
              if (!v) throw new Error("No numbers found in it.");
              show({ ...r, suggestions: [{ label: `Its numbers, redrawn as ${v.kind === "line" ? "a line" : v.kind === "number" ? "one figure" : v.kind}`, visual: v }, ...r.suggestions] });
            } catch (err) { b.disabled = false; b.textContent = "Read its numbers with Claude"; status.textContent = `Couldn't read it: ${(err as Error).message}`; }
          } }, "Read its numbers with Claude")
        : "";
      return h("div", { class: "pi-sugg" }, h("p", { class: "pi-sugg-label" }, s.label), preview, h("div", { class: "pro-actions" }, btn, ask));
    });
    const sections = r.sections?.length ? h("div", { class: "pi-sugg" },
      h("p", { class: "pi-sugg-label" }, `${r.sections.length} slide${r.sections.length === 1 ? "" : "s"}, one for each part`),
      h("ol", { class: "pi-sections" }, ...r.sections.slice(0, 8).map((s) => h("li", {}, h("strong", {}, s.title), s.visual ? h("span", { class: "muted" }, ` · ${s.visual.kind === "number" ? "a figure" : "a chart"}`) : "")), r.sections.length > 8 ? h("li", { class: "muted" }, `and ${r.sections.length - 8} more`) : ""),
      h("div", { class: "pro-actions" }, h("button", { class: "primary-btn", onclick: async (e: Event) => {
        (e.currentTarget as HTMLButtonElement).disabled = true;
        for (const s of r.sections!) await addSlide(s.title, s.text, s.visual);
        save();
        app.toast(`Added ${r.sections!.length} slides. Move the globe and use “Use current view” to set where each one looks.`, 6000);
        back();
      } }, `Add ${r.sections.length} slides`))) : "";
    status.textContent = r.about;
    out.replaceChildren(sections, ...cards);
    if (!cards.length && !sections) out.replaceChildren(h("p", { class: "muted small" }, "Nothing in that Terreno can draw yet. A table with names and numbers, dates and numbers, addresses, or coordinates works best."));
  };

  const load = async (read: () => Promise<Reading>, what: string) => {
    status.textContent = `Reading ${what}…`;
    out.replaceChildren();
    try { show(await read()); }
    catch (e) { status.textContent = (e as Error).message || "Couldn't read that."; }
  };

  const drop = h("label", { class: "pi-drop", tabindex: 0, onkeydown: (e: Event) => { const k = (e as KeyboardEvent).key; if (k === "Enter" || k === " ") { e.preventDefault(); fileIn.click(); } } },
    fileIn,
    h("strong", {}, "Drop a file here, or choose one"),
    h("span", { class: "muted small" }, "Spreadsheets (CSV, Excel), documents (Word, text, Markdown", aiOn() ? ", PDF" : "", "), JSON and GeoJSON, pictures of charts"));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.classList.remove("over");
    const f = e.dataTransfer?.files?.[0];
    if (f) void load(() => readFile(f), f.name);
    else { const t = e.dataTransfer?.getData("text/plain"); if (t) { paste.value = t; void load(async () => readText(t), "what you dropped"); } }
  });
  // A picture pasted straight in (a screenshot of a chart).
  paste.addEventListener("paste", (e) => {
    const img = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
    if (img) { e.preventDefault(); void load(() => readFile(new File([img], "Pasted chart.png", { type: img.type })), "the picture"); }
  });

  ctx.show("Add data", back,
    h("p", { class: "mp-intro" }, "Bring in numbers, a table, a document or addresses. Terreno draws them in its own hand, moving, on a slide."),
    drop, paste,
    h("div", { class: "pro-actions" }, h("button", { class: "pill-btn", onclick: () => { const t = paste.value; if (t.trim()) void load(async () => readText(t), "what you pasted"); else paste.focus(); } }, "Read what I pasted")),
    status, out);
}
