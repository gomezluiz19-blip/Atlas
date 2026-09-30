// A drawn canvas as an image URL for the globe's billboards, encoded off the
// main thread (toBlob), so drawing a page's pins never stalls a tap.
const cache = new Map<string, Promise<string>>();

export function canvasUrl(key: string, draw: () => HTMLCanvasElement): Promise<string> {
  let p = cache.get(key);
  if (!p) {
    p = new Promise((res) => {
      const c = draw();
      c.toBlob((b) => res(b ? URL.createObjectURL(b) : c.toDataURL()), "image/png");
    });
    cache.set(key, p);
  }
  return p;
}
