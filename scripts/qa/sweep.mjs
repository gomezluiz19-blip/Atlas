// Fires every action Terreno has, one at a time, and records what broke and how much of the screen each one
// covers. Usage: node scripts/qa/sweep.mjs [only-matching] [--phone]
// Writes qa-out/sweep.json (and a screenshot of the key screens); exits 1 if anything threw.
import fs from "fs";
import { OUT, openTerreno } from "./_browser.mjs";

const phone = process.argv.includes("--phone");
const only = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "";
fs.mkdirSync(OUT, { recursive: true });
const { browser, page: p, errors } = await openTerreno(phone ? { width: 390, height: 844, phone } : { width: 1400, height: 860 });
const SKIP = new Set(["tv:mode", "tv:cast", "tour", "watch:add", "profile:open", "lens:custom", "time:go", "story:open", "place:open", "intro:play"]);
const ARGS = { "place:open": "mount-everest", "time:go": "1914@15,50", "fin:company": "AAPL", "answers:preset": "" };
let keys = await p.evaluate(() => [...window.atlas.app.actions.keys()]);
keys = keys.filter((k) => !SKIP.has(k) && !k.startsWith("work:borders:") && (!only || k.includes(only)));
const results = [];
const selectEverest = () => p.evaluate(() => window.atlas.app.select({ lon: 86.925, lat: 27.988, height: 8000 }, { title: "Mount Everest", context: "Nepal / China" }));
for (const k of keys) {
  errors.length = 0; await p.evaluate(() => { window.__rej = []; });
  if (k.startsWith("lens:") || k.startsWith("view:") || k === "place:save" || k === "watch:open" || k === "reach:open" || k === "travel:to" || k === "wayfind:guide" || k === "profile:add") { await selectEverest(); await p.waitForTimeout(1500); }
  let thrown = "";
  try { await p.evaluate(([k, a]) => { const r = window.atlas.app.actions.get(k)?.run(a); return r instanceof Promise ? r : undefined; }, [k, ARGS[k]]); } catch (e) { thrown = String(e.message).slice(0, 200); }
  await p.waitForTimeout(2600);
  const state = await p.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05; };
    const panels = [...document.querySelectorAll(".sheet, .work-panel, .popover, .lens-panel, .drawer, .holo, .modal, [role=dialog], .tv-quiz, .space-panel")].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { c: (e.className?.baseVal ?? e.className).toString().split(" ")[0], x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
    const cover = panels.reduce((s, r) => s + r.w * r.h, 0) / (innerWidth * innerHeight);
    return { panels, cover: +cover.toFixed(2), rej: window.__rej ?? [], toast: document.querySelector(".toast")?.textContent?.slice(0, 120) ?? "" };
  });
  const r = { k, thrown, errs: [...new Set(errors)].slice(0, 6), ...state };
  results.push(r);
  if (thrown || r.errs.length || r.rej.length) console.log("✗", k, thrown, r.errs.slice(0, 2), r.rej.slice(0, 2));
  if (["mode:work", "mode:make", "mode:place", "work:build", "work:mining", "work:shipping", "work:teach", "lens:slice", "lens:block", "space:boot", "econ:desk", "ent:gov", "pulse:open", "answers:ask"].includes(k)) await p.screenshot({ path: `${OUT}/${phone ? "phone-" : ""}${k.replace(/:/g, "_")}.png` });
  // Back to a clean globe for the next one.
  try {
    for (let i = 0; i < 3; i++) await p.keyboard.press("Escape");
    await p.evaluate(() => { const a = window.atlas.app.actions; for (const x of ["lens:close", "time:close"]) { try { a.get(x)?.run(); } catch {} } for (const [k, v] of a) { try { if (v.isOn?.() && v.stop) v.stop(); } catch {} } document.querySelectorAll(".close-btn, .wk-close, [aria-label='Close']").forEach((b) => { if (b.offsetParent) b.click(); }); });
    await p.waitForTimeout(500);
  } catch {}
}
fs.writeFileSync(`${OUT}/sweep${phone ? "-phone" : ""}.json`, JSON.stringify(results, null, 1));
console.log("done", results.length, "bad", results.filter((r) => r.thrown || r.errs.length || r.rej.length).length);
await browser.close();
process.exit(results.some((r) => r.thrown || r.errs.length || r.rej.length) ? 1 : 0);
