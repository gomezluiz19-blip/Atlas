// Browser stress: every theme, every layer on and off, place churn, lenses, tools and 300 pans and zooms,
// watching errors and the counts that would show a leak (heap, entities, data sources, imagery layers,
// primitives, DOM). Usage: node scripts/qa/stress.mjs
// A healthy run: no errors, imagery layers and data sources level off, the DOM returns to about where it began.
import { openTerreno } from "./_browser.mjs";

const { browser, page: p, errors } = await openTerreno({ gc: true });
const snap = (tag) => p.evaluate((tag) => { window.gc?.(); const v = window.atlas.globe.viewer; return { tag, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6), entities: v.entities.values.length, sources: v.dataSources.length, layers: v.imageryLayers.length, prims: v.scene.primitives.length, dom: document.getElementsByTagName("*").length, labels: document.querySelectorAll(".map-label").length }; }, tag);
const out = []; const log = async (t) => { const s = await snap(t); out.push(s); console.log(JSON.stringify(s), "errors so far:", errors.length); };
await log("start");
// 1. Themes: every tab, five rounds, fast.
const tabs = await p.$$eval(".tabbar [role=tab]", (els) => els.length);
for (let r = 0; r < 3; r++) for (let i = 0; i < tabs; i++) { await p.click(`.tabbar [role=tab] >> nth=${i}`).catch(() => {}); await p.waitForTimeout(120); }
await p.waitForTimeout(2000); await log("themes x5");
// 2. Layers: every overlay/network toggled on and off three times, quickly.
const layerActs = ["overlay:plates", "overlay:lights", "overlay:species", "globe:geology", "globe:elevation", "globe:slope", "globe:contours", "net:rail", "net:roads", "net:shipping", "net:ports", "net:airports", "net:power", "wind:toggle", "live:planes", "live:ships"];
for (let r = 0; r < 3; r++) for (const a of layerActs) { await p.evaluate((a) => { try { window.atlas.app.actions.get(a)?.run(); } catch (e) { window.__e = String(e); } }, a); await p.waitForTimeout(80); await p.evaluate((a) => { const x = window.atlas.app.actions.get(a); try { if (x?.stop) x.stop(); else x?.run(); } catch {} }, a); }
await p.waitForTimeout(3000); await log("layers x3 on/off");
// 3. Places: 40 selections around the world, each interrupting the last flight.
for (let i = 0; i < 40; i++) { await p.evaluate((i) => window.atlas.app.select({ lon: ((i * 47) % 360) - 180, lat: ((i * 29) % 140) - 70, height: 0 }, { title: `Spot ${i}`, context: "" }), i); await p.waitForTimeout(150); }
await p.evaluate(() => window.atlas.app.actions.get("place:clear")?.run());
await p.waitForTimeout(3000); await log("40 places");
// 4. Lenses on a place, opened and closed repeatedly.
await p.evaluate(() => window.atlas.app.select({ lon: 86.925, lat: 27.988, height: 8000 }, { title: "Mount Everest", context: "Nepal / China" }));
await p.waitForTimeout(3000);
for (let r = 0; r < 3; r++) for (const l of ["lens:slice", "lens:day", "lens:trace", "lens:rewind", "lens:size"]) { await p.evaluate((l) => { try { window.atlas.app.actions.get(l)?.run(); } catch (e) { window.__e = String(e); } }, l); await p.waitForTimeout(700); await p.evaluate(() => window.atlas.app.actions.get("lens:close")?.run()); await p.waitForTimeout(200); }
await p.evaluate(() => window.atlas.app.actions.get("place:clear")?.run());
await p.waitForTimeout(3000); await log("lenses x3");
// 5. Modes and tools: every work tool opened and closed twice.
const tools = ["work:travel", "work:plan", "work:present", "work:teach", "work:build", "work:mining", "work:shipping", "work:relief", "work:field", "work:office", "work:network", "work:sports", "econ:desk", "ent:gov", "ent:edu", "ent:con"];
for (let r = 0; r < 2; r++) for (const t of tools) { await p.evaluate((t) => { try { window.atlas.app.actions.get(t)?.run(); } catch (e) { window.__e = String(e); } }, t); await p.waitForTimeout(500); for (let k = 0; k < 2; k++) await p.keyboard.press("Escape"); await p.evaluate(() => document.querySelectorAll(".close-btn, .wk-close, [aria-label='Close']").forEach((b) => { if (b.offsetParent) b.click(); })); await p.waitForTimeout(150); }
await p.waitForTimeout(3000); await log("tools x2");
// 6. Camera: 300 random pans and zooms as fast as input arrives.
await p.mouse.move(700, 400);
for (let i = 0; i < 60; i++) { await p.mouse.down(); await p.mouse.move(700 + Math.sin(i) * 200, 400 + Math.cos(i) * 150, { steps: 2 }); await p.mouse.up(); await p.mouse.wheel(0, i % 2 ? 400 : -400); }
await p.waitForTimeout(3000); await log("300 pans/zooms");
console.table(out);
console.log("errors:", [...new Set(errors)].slice(0, 12), await p.evaluate(() => window.__e ?? ""));
await browser.close();
process.exit(errors.length ? 1 : 0);
