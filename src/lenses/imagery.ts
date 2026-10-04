// A satellite picture of a small box of the Earth, stitched from Esri World
// Imagery tiles into one canvas (for textures). Falls back to shaded relief.
import { lonLatToPixel } from "../data/mercator";
import { imageryTile } from "../globe/imagery";


function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("tile"));
    img.src = url;
  });
}

/** Stitches imagery for [west, south, east, north] into a canvas about `size` pixels across. */
export async function imageryCanvas(bbox: [number, number, number, number], size = 1536): Promise<HTMLCanvasElement> {
  const [w, s, e, n] = bbox;
  // The zoom where the box is about `size` tile pixels wide.
  let z = 1;
  for (; z < 18; z++) {
    const [x0] = lonLatToPixel(w, n, z), [x1] = lonLatToPixel(e, s, z);
    if (x1 - x0 >= size) break;
  }
  const [px0, py0] = lonLatToPixel(w, n, z), [px1, py1] = lonLatToPixel(e, s, z);
  const W = Math.round(px1 - px0), H = Math.round(py1 - py0);
  const c = document.createElement("canvas");
  c.width = Math.max(1, W);
  c.height = Math.max(1, H);
  const g = c.getContext("2d")!;
  g.fillStyle = "#5d6b4f";
  g.fillRect(0, 0, W, H);
  const jobs: Promise<void>[] = [];
  let ok = 0;
  for (let ty = Math.floor(py0 / 256); ty <= Math.floor(py1 / 256); ty++)
    for (let tx = Math.floor(px0 / 256); tx <= Math.floor(px1 / 256); tx++)
      jobs.push(loadImage(imageryTile(z, tx, ty))
        .then((img) => { g.drawImage(img, tx * 256 - px0, ty * 256 - py0); ok++; })
        .catch(() => {}));
  await Promise.all(jobs);
  if (!ok) throw new Error("No imagery");
  return c;
}
