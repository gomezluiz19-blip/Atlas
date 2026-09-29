// Problems worth knowing about: unexpected errors are kept (the last 30, on
// this device only) so feedback notes can carry them, and so a demo's rough
// edges can be found afterwards. Nothing is sent anywhere by this.
const KEY = "atlas.errors.v1";
// Noise from blocked tiles, extensions and cancelled requests isn't a problem worth keeping.
const NOISE = /ResizeObserver|AbortError|Failed to fetch|NetworkError|Load failed|Script error|extension:\/\/|tile|imagery/i;

export interface Problem { at: string; message: string; where?: string }

export function recentProblems(): Problem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Problem[]; } catch { return []; }
}

function keep(message: string, where?: string) {
  if (!message || NOISE.test(message)) return;
  try {
    const all = recentProblems();
    if (all[0]?.message === message) return;
    localStorage.setItem(KEY, JSON.stringify([{ at: new Date().toISOString(), message: message.slice(0, 300), where: where?.slice(0, 200) }, ...all].slice(0, 30)));
  } catch { /* storage full */ }
}

export function watchForProblems() {
  addEventListener("error", (e) => keep(e.message, e.filename ? `${e.filename.split("/").pop()}:${e.lineno}` : undefined));
  addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    keep(typeof r === "string" ? r : r?.message ?? String(r), typeof r === "object" ? r?.stack?.split("\n")[1]?.trim() : undefined);
  });
}
