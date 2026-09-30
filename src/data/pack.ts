// Links that carry a whole thing (a profile, a lens) with no server: JSON,
// deflated when the browser can, as URL-safe base64.
const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function packJson(v: unknown): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(v));
  if (typeof CompressionStream === "undefined") return "j" + b64url(raw);
  return "z" + b64url(await pipe(raw, new CompressionStream("deflate-raw")));
}

export async function unpackJson<T = unknown>(packed: string): Promise<T | null> {
  try {
    const bytes = unb64url(packed.slice(1));
    const raw = packed[0] === "z" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
    return JSON.parse(new TextDecoder().decode(raw)) as T;
  } catch {
    return null;
  }
}
