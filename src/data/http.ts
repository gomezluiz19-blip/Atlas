// Small fetch helpers shared by the data services: retries with backoff,
// JSON with a timeout, a response cache, and a concurrency-limited map.

const cache = new Map<string, Promise<unknown>>();

export class ServiceError extends Error {
  constructor(readonly service: string, message: string) {
    super(`${service}: ${message}`);
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch() that retries network failures and transient HTTP errors (rate
 * limits, 5xx) with exponential backoff. Other responses, including 404,
 * are returned as they are. Aborts are never retried.
 */
export async function fetchRetry(url: string, init: RequestInit = {}, tries = 3, baseDelayMs = 400): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!RETRYABLE.has(res.status) || attempt >= tries) return res;
      const after = Number(res.headers.get("retry-after"));
      await wait(after > 0 && after < 30 ? after * 1000 : baseDelayMs * 2 ** (attempt - 1));
    } catch (err) {
      if ((err as Error).name === "AbortError" || init.signal?.aborted || attempt >= tries) throw err;
      await wait(baseDelayMs * 2 ** (attempt - 1));
    }
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
      const res = await fetchRetry(url, { ...init, signal: ctrl.signal }, 2);
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
