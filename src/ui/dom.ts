type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** Tiny element builder: h("button", { class: "x", onclick: fn }, "Label"). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function formatDistance(m: number): string {
  if (Math.abs(m) >= 10_000) return `${(m / 1000).toFixed(1)} km`;
  if (Math.abs(m) >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

export function formatElevation(m: number): string {
  return `${Math.round(m).toLocaleString()} m`;
}

export function formatArea(m2: number): string {
  const km2 = m2 / 1e6;
  if (km2 >= 100) return `${Math.round(km2).toLocaleString()} km²`;
  if (km2 >= 1) return `${km2.toFixed(1)} km²`;
  return `${(m2 / 1e4).toFixed(1)} ha`;
}

export function formatLonLat(lon: number, lat: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lon).toFixed(5)}° ${ew}`;
}

/** A labelled statistic for result panels, with an optional plain-language hint. */
export function stat(label: string, value: string, hint?: string): HTMLElement {
  return h(
    "div",
    { class: "stat", title: hint },
    h("div", { class: "stat-label" }, label),
    h("div", { class: "stat-value" }, value),
  );
}
