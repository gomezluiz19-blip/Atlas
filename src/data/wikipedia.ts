// Short summaries of Wikipedia articles.
import { getJson } from "./http";

export interface Summary {
  title: string;
  extract: string;
  thumbnail?: string;
  url: string;
}

export async function summary(articleUrl: string): Promise<Summary | null> {
  const title = decodeURIComponent(articleUrl.split("/wiki/").pop() ?? "");
  if (!title) return null;
  const body = await getJson<{ type?: string; title: string; extract?: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } }>(
    "Wikipedia",
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
  );
  if (body.type === "disambiguation") return null;
  return { title: body.title, extract: body.extract ?? "", thumbnail: body.thumbnail?.source, url: body.content_urls?.desktop?.page ?? articleUrl };
}

/** The first of several candidate article titles that has a real (non-disambiguation) summary. */
export async function summaryByName(candidates: string[]): Promise<Summary | null> {
  for (const c of candidates) {
    try {
      const s = await summary(`/wiki/${c.replace(/ /g, "_")}`);
      if (s?.extract) return s;
    } catch {
      /* try the next one */
    }
  }
  return null;
}
