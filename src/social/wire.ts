// Puts people into Atlas: the account button and menu, profile pages, Lens
// Studio and made lenses, their links (#/u/maya, #/lens/birdwatching, or a
// whole page or lens carried in the link), and their actions for search,
// the task robot, the place card and the tour.
import "./social.css";
import type { App } from "../app";
import { customLens, type LensDef } from "../lenses/custom";
import { findLens, myLenses, rememberLens } from "../lenses/library";
import { cloudOn } from "../cloud/client";
import { fetchLens } from "../cloud/sync";
import { createLensStudio } from "../lenses/studio";
import type { Lens, Subject } from "../lenses/types";
import { createWatch } from "../watch/watch";
import { flyToPlace } from "../ui/search";
import { createAccount, type AccountMenuItem } from "./account";
import { ROLES, type Profile } from "./model";
import { createProfiles } from "./page";
import { me } from "./store";

export interface SocialDeps {
  lensList: Lens[];
  lenses: { refresh(): void; openWhenReady(id: string): Promise<boolean>; openOn(id: string, s: Subject): void };
  openPlace(slug: string): Promise<void> | void;
  /** Closes the other panels (hubs, space, My Place…). */
  closePanels(): void;
  /** Rows at the foot of the account menu. */
  extras(): (AccountMenuItem | HTMLElement)[];
}

export function wireSocial(app: App, deps: SocialDeps) {
  // ---- Made lenses in the strip ----
  const custom = new Set<string>();
  const syncLenses = (extra?: LensDef) => {
    for (let i = deps.lensList.length - 1; i >= 0; i--) if (custom.has(deps.lensList[i].id)) deps.lensList.splice(i, 1);
    custom.clear();
    const defs = [...myLenses()];
    if (extra && !defs.some((d) => d.id === extra.id)) defs.push(extra);
    else if (extra) defs.splice(defs.findIndex((d) => d.id === extra.id), 1, extra);
    for (const d of defs) { deps.lensList.push(customLens(d)); custom.add(d.id); }
    deps.lenses.refresh();
  };
  syncLenses();

  /** Opens a lens on the chosen place; with none chosen, on the lens's own home. */
  const tryLens = (d: LensDef) => {
    syncLenses(d);
    deps.closePanels();
    const at = app.place ? null : d.home;
    if (at) {
      void flyToPlace(app.globe, { name: at.name, lon: at.lon, lat: at.lat, radius: 2500 });
      app.select({ lon: at.lon, lat: at.lat, height: 0 }, { title: at.name, context: `Trying the ${d.name} lens` });
    } else if (!app.place) { app.toast("Tap a place on the globe, then choose the lens in its card.", 4500); return; }
    void deps.lenses.openWhenReady(d.id).then((ok) => { if (!ok) app.toast("Tap a place on the globe, then choose the lens in its card.", 4500); });
  };

  let profiles: ReturnType<typeof createProfiles>;
  const studio = createLensStudio(app, {
    tryLens,
    changed: () => syncLenses(),
    openProfile: (h) => profiles.open(h),
  });

  const account = createAccount({
    openProfile: (h, edit) => { deps.closePanels(); studio.close(); profiles.open(h, edit); },
    lenses: () => { deps.closePanels(); profiles.close(); studio.open(); },
    extras: deps.extras,
    welcome: (p: Profile, fresh: boolean) => {
      const role = ROLES.find((r) => r.id === p.role);
      deps.closePanels();
      studio.close();
      syncLenses();
      if (fresh) {
        profiles.open(p.handle, true);
        app.toast(`Welcome to Atlas, ${p.name.split(" ")[0]}. This is your page: add the places you love, starting with your Top 8.`, 6500);
      } else {
        profiles.open(p.handle);
        app.toast(`You're ${p.name} now${role ? `, ${role.label.toLowerCase()}` : ""}. ${p.demo ? "Everything here is yours to try; switch back from the account menu." : ""}`.trim(), 5000);
      }
    },
  });

  profiles = createProfiles(app, {
    openPlace: (s) => {
      if (s.slug && !s.slug.startsWith("@")) { void deps.openPlace(s.slug); return; }
      void flyToPlace(app.globe, { name: s.name, lon: s.lon, lat: s.lat, radius: 700 });
      app.select({ lon: s.lon, lat: s.lat, height: 0 }, { title: s.name, context: s.where ?? "" });
    },
    openLens: (id) => { const d = findLens(id); if (d) tryLens(d); },
    lensInfo: (id) => { const d = findLens(id); return d ? { name: d.name, icon: d.icon, blurb: d.blurb } : null; },
    signIn: (then) => account.signIn(then ? () => then() : undefined),
  });

  // ---- Watches: lens verdicts that tell you when it's a good time ----
  const watch = createWatch(app, {
    openLens: (id, s) => { const d = findLens(id); if (!d) return; syncLenses(d); deps.closePanels(); app.select({ lon: s.lon, lat: s.lat, height: 0 }, { title: s.name, context: `Watching for ${d.name.toLowerCase()}` }); deps.lenses.openOn(id, s); },
    onChange: () => account.button.classList.toggle("has-alert", watch.good() > 0),
  });
  app.actions.set("watch:add", { label: "Watch this place", run: (json) => { if (!json) return; const { lens, subject } = JSON.parse(json) as { lens: string; subject: Subject }; watch.add(lens, subject); } });
  app.actions.set("watch:open", { label: "Watching", run: () => watch.open() });

  // ---- Actions ----
  app.actions.set("lens:studio", { label: "Lens Studio: make a lens", run: (arg) => { deps.closePanels(); profiles.close(); studio.open(arg ? findLens(arg) ?? undefined : undefined); } });
  app.actions.set("lens:custom", { label: "Open a made lens", run: (id) => { const d = id ? findLens(id) : null; if (d) tryLens(d); } });
  app.actions.set("profile:open", { label: "Open someone's page", run: (h) => { if (h) { deps.closePanels(); studio.close(); profiles.open(h); } } });
  app.actions.set("profile:me", { label: "My page", run: () => { const p = me(); if (p) { deps.closePanels(); profiles.open(p.handle); } else account.signIn(); } });
  app.actions.set("account:signin", { label: "Sign in", run: () => account.signIn() });
  app.actions.set("profile:add", { label: "Add this place to my page", run: () => {
    const p = app.place;
    if (!p) return;
    profiles.addSpot({ name: p.name?.title ?? "A place I love", lon: p.lon, lat: p.lat, where: p.name?.context, slug: p.slug && !p.slug.startsWith("@") ? p.slug : undefined });
  } });

  // ---- Links ----
  const route = async () => {
    const w = /^#\/w\/([a-z0-9]+)$/.exec(location.hash);
    if (w) {
      const it = (await import("../watch/watch")).watches().find((x) => x.id === w[1]);
      if (it) { const d = findLens(it.lens); if (d) { syncLenses(d); void flyToPlace(app.globe, { name: it.subject.name, lon: it.subject.lon, lat: it.subject.lat, radius: Math.max(1500, it.subject.radius) }); app.select({ lon: it.subject.lon, lat: it.subject.lat, height: 0 }, { title: it.subject.name, context: d.name }); deps.lenses.openOn(d.id, it.subject); } }
      try { history.replaceState(null, "", location.pathname); } catch { /* embedded */ }
      return;
    }
    const m = /^#\/(u|lens)\/(.+)$/.exec(location.hash);
    if (!m) return;
    const [, kind, rest] = m;
    const arg = decodeURIComponent(rest);
    if (kind === "u") {
      if (arg.startsWith("~")) { if (!(await profiles.openPacked(arg.slice(1)))) app.toast("That page link is damaged. Ask for it again.", 4000); }
      else profiles.open(arg);
    } else if (arg.startsWith("~")) { if (!(await studio.openPacked(arg.slice(1)))) app.toast("That lens link is damaged. Ask for it again.", 4000); }
    else {
      const d = findLens(arg) ?? (cloudOn() ? await fetchLens(arg).catch(() => null) : null);
      if (d) { rememberLens(d); studio.open(d); } else app.toast("Couldn't find that lens.", 3500);
    }
    try { history.replaceState(null, "", location.pathname); } catch { /* embedded viewers */ }
  };
  addEventListener("hashchange", () => void route());
  // After the opening, so the globe is ready.
  setTimeout(() => void route(), 600);

  return { account, profiles, studio, tryLens, watch };
}
