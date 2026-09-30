// People › Profiles: the people who love places near the one you chose, your
// own page (or a way to make one), and everyone else on Atlas.
import type { Subtab } from "../app";
import { h } from "../ui/dom";
import { avatarEl } from "./account";
import { ROLES, SPOT_KINDS, type Profile } from "./model";
import { allProfiles, isFollowing, me, profilesNear } from "./store";
import { cloudOn } from "../cloud/client";
import { directory } from "../cloud/sync";

const fmtKm = (d: number) => (d < 1 ? "right here" : d < 10 ? `${d.toFixed(1)} km away` : `${Math.round(d)} km away`);

export function profilesSubtab(): Subtab {
  return {
    id: "profiles", label: "Profiles",
    render({ app, place, body }) {
      const open = (p: Profile) => app.actions.get("profile:open")?.run(p.handle);
      const mine = me();
      const near = profilesNear(place.lon, place.lat, 80);
      const person = (p: Profile, line: string) => h("button", { class: "pf-person", onclick: () => open(p) },
        avatarEl(p, 44),
        h("span", {}, h("strong", {}, p.name, isFollowing(p.handle) ? h("em", {}, "Following") : ""), h("small", {}, line)),
        h("span", { class: "chev", html: "&rsaquo;" }));
      const where = place.name?.title ?? "here";
      const line = (p: Profile) => `${ROLES.find((r) => r.id === p.role)?.emoji ?? ""} ${p.home?.name ?? ROLES.find((r) => r.id === p.role)?.label ?? ""}`;
      const local = allProfiles().filter((p) => !near.some((n) => n.p.handle === p.handle));
      const everyone = h("div", { class: "pf-people" }, ...local.map((p) => person(p, line(p))));
      // With Atlas's servers: everyone who has published a page, newest first.
      if (cloudOn()) void directory().then((ps) => {
        const have = new Set([...local, ...near.map((n) => n.p)].map((p) => p.handle));
        everyone.append(...ps.filter((p) => !have.has(p.handle)).map((p) => person(p, line(p))));
      }).catch(() => {});
      body.append(
        mine
          ? h("button", { class: "pf-mine", onclick: () => open(mine) }, avatarEl(mine, 52), h("span", {}, h("small", {}, "Your page"), h("strong", {}, mine.name), h("small", {}, `${mine.spots.length} places · ${mine.posts.length} posts`)),
            h("span", { class: "pf-mine-add", role: "button", onclick: (e: Event) => { e.stopPropagation(); app.actions.get("profile:add")?.run(); } }, `♡ Add ${where}`))
          : h("div", { class: "pf-cta" }, h("strong", {}, "A page of the places you love"), h("p", {}, "Your Top 8, the restaurants and trails you swear by, a journal, and lenses you've made. Everyone gets one."),
            h("button", { class: "primary-btn", onclick: () => app.actions.get("account:signin")?.run() }, "Make your page")),
        h("h3", { class: "pf-sub" }, near.length ? `People who love places near ${where}` : `Nobody's added places near ${where} yet`),
        near.length
          ? h("div", { class: "pf-people" }, ...near.slice(0, 8).map(({ p, spot, km }) => person(p, `${SPOT_KINDS[spot.kind].emoji} ${spot.name} · ${fmtKm(km)}`)))
          : h("p", { class: "muted small" }, mine ? `Be the first: add ${where} to your page.` : "Make a page and be the first."),
        h("h3", { class: "pf-sub" }, "Everyone on Atlas"),
        everyone,
        h("p", { class: "fineprint" }, cloudOn() ? "The example people are made up to show what a page can be; the places are real." : "The example people are made up to show what a page can be; the places are real. Until Atlas's servers are switched on, pages live on the device they were made on and travel as links."));
    },
  };
}
