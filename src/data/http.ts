// Small fetch helpers shared by the data services: JSON with a timeout,
// a response cache, and a concurrency-limited map.

const cache = new Map<string, Promise<unknown>>();

export class ServiceError extends Error {
  constructor(readonly service: string, message: string) {
    super(`${service}: ${message}`);
  }
}

export async function getJson<T>(service: string, url: string, init?: RequestInit, timeoutMs = 25_000): Promise<T> {
  const key = init?.body ? `${url}|${String(init.body)}` : url;
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const p = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (!res.ok) throw new ServiceError(service, `HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      if ((err as Error).name === "AbortError") throw new ServiceError(service, "the request timed out");
      throw new ServiceError(service, "could not be reached");
    } finally {
      clearTimeout(timer);
    }
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return p;
}

/** Maps `items` through `fn` with at most `limit` calls in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
