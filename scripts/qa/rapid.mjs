// Rapid input: modes, layers, sign-in, search, tabs, the tour and place selection hit as fast as input
// arrives. Afterwards there should be one of each overlay at most (one join card, one tour) and no errors.
// Usage: node scripts/qa/rapid.mjs
import { openTerreno } from "./_browser.mjs";

const { browser, page: p, errors } = await openTerreno();
const count = () => p.evaluate(() => ({ jn: document.querySelectorAll(".jn").length, tour: document.querySelectorAll(".tour").length, open: [...document.querySelectorAll(".popover:not([hidden]), .work-panel:not([hidden])")].map(e => e.className.split(" ")[1] || e.className), cardSheets: document.querySelectorAll(".card-sheet").length, toasts: document.querySelectorAll(".toast").length, dom: document.getElementsByTagName("*").length }));
const log = async (t) => console.log(t, JSON.stringify(await count()), "errs", errors.length);
await log("start");
const modes = await p.$$(".mode-btn");
for (let i = 0; i < 60; i++) { await modes[i % modes.length].click({ timeout: 5000 }).catch((e) => console.log("click fail", i, e.message.slice(0, 80))); await p.waitForTimeout(30); }
await p.waitForTimeout(1500); await log("60 mode clicks");
for (let i = 0; i < 31; i++) { await p.click("#layers-btn", { timeout: 5000 }).catch((e) => console.log("layers fail", i, e.message.slice(0, 120))); await p.waitForTimeout(20); }
await p.waitForTimeout(800); await log("31 layer toggles (expect layers open)");
await p.keyboard.press("Escape"); await p.click("#layers-btn"); await p.waitForTimeout(300);
for (let i = 0; i < 15; i++) { await p.evaluate(() => window.atlas.app.actions.get("account:signin")?.run()); await p.waitForTimeout(40); }
await p.waitForTimeout(1200); await log("15 join opens (expect 1 jn)");
for (let i = 0; i < 3; i++) { await p.keyboard.press("Escape"); await p.waitForTimeout(300); }
await p.waitForTimeout(800); await log("after escape (expect 0 jn)");
await p.click(".search input");
for (let i = 0; i < 20; i++) { await p.keyboard.type("paris tokyo lagos ", { delay: 5 }); await p.keyboard.press("Enter"); await p.waitForTimeout(60); }
await p.waitForTimeout(4000); await log("20 search enters");
await p.keyboard.press("Escape");
const tabs = await p.$$(".tab");
for (let i = 0; i < 80; i++) { await tabs[(i * 7) % tabs.length].click({ timeout: 5000 }).catch((e) => console.log("tab fail", i, e.message.slice(0, 80))); await p.waitForTimeout(25); }
await p.waitForTimeout(2500); await log("80 tab clicks");
for (let i = 0; i < 10; i++) { await p.evaluate(() => window.atlas.app.actions.get("tour")?.run()); await p.waitForTimeout(50); }
await p.waitForTimeout(2500); await log("10 tour starts (expect 1)");
await p.keyboard.press("Escape"); await p.waitForTimeout(800);
for (let i = 0; i < 12; i++) { await p.evaluate((i) => window.atlas.app.select({ lon: -120 + i * 20, lat: (i % 5) * 10, height: 0 }), i); await p.waitForTimeout(80); }
await p.waitForTimeout(3000); await log("12 rapid selects");
const title = await p.evaluate(() => document.querySelector(".sheet-title")?.textContent);
console.log("final sheet title", title);
console.log("errors", errors.slice(0, 8));
await browser.close();
process.exit(errors.length ? 1 : 0);
