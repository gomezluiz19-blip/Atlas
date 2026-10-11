// Something loaded on first use and kept: `get` loads it (once), `now` is it once it's there, for quick
// checks that shouldn't load anything ("is it open?", "is it on?"). `onLoad` runs once, when it arrives.
export function later<M>(load: () => Promise<M>, onLoad?: (m: M) => void) {
  let mod: M | null = null, loading: Promise<M> | null = null;
  return {
    get: (): Promise<M> => (loading ??= load().then((m) => { mod = m; onLoad?.(m); return m; })),
    get now(): M | null { return mod; },
  };
}
