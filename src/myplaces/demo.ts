// A demo farm to try My Places with: a smallholding in the Cotswolds with
// sheep, cattle and hens, three fields at different stages, and a paddock,
// all dated relative to today so the daily brief has something to say.
// Everything it adds is marked "demo-" and can be removed in one go.
import type { PlaceStore } from "./store";

const LON = -1.556, LAT = 51.942;
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const box = (dx: number, dy: number, w: number, hgt: number): [number, number][] => {
  const kx = 1 / (111_320 * Math.cos((LAT * Math.PI) / 180)), ky = 1 / 110_540;
  const x0 = LON + dx * kx, y0 = LAT + dy * ky;
  return [[x0, y0], [x0 + w * kx, y0], [x0 + w * kx, y0 - hgt * ky], [x0, y0 - hgt * ky]];
};
const read = <T>(k: string, d: T): T => { try { return (JSON.parse(localStorage.getItem(k) ?? "null") as T) ?? d; } catch { return d; } };

export function hasDemo(store: PlaceStore): boolean {
  return store.all().some((p) => p.id.startsWith("demo-"));
}

export function loadDemo(store: PlaceStore): string {
  store.save({ id: "demo-farm", name: "Hillside Farm (demo)", kind: "farm", lon: LON, lat: LAT, address: "Near Chipping Norton, Oxfordshire", created: Date.now(),
    energy: { solarKw: 8, batteryKwh: 10, dailyUseKwh: 18 }, water: { source: "well", tankLitres: 5000, dailyUseLitres: 900 },
    devices: [{ id: "demo-cam", type: "camera", lon: LON + 0.0003, lat: LAT - 0.0002, label: "Yard", heading: 200, fov: 90, range: 30 }] });

  const fields = read<{ id: string }[]>("atlas.work.fields.v1", []).filter((f) => !f.id.startsWith("demo-"));
  fields.unshift(
    { id: "demo-f1", name: "Top field", crop: "wheat-winter", planted: iso(-330), pts: box(-700, 500, 420, 300), diary: [{ date: iso(-12), text: "Sprayed: fungicide at flag leaf" }] } as never,
    { id: "demo-f2", name: "Long meadow", crop: "hay", planted: iso(-38), pts: box(250, 450, 380, 260), diary: [{ date: iso(-38), text: "Cut: first cut, 180 bales" }] } as never,
    { id: "demo-f3", name: "Veg patch", crop: "potato", planted: iso(-70), pts: box(60, -80, 60, 40), diary: [] } as never);
  localStorage.setItem("atlas.work.fields.v1", JSON.stringify(fields));

  if (!read<{ animals?: unknown[] } | null>("atlas.work.flock.v1", null)?.animals?.length) {
    const sheep = Array.from({ length: 24 }, (_, i) => ({ id: `demo-s${i}`, species: "sheep", breed: i < 18 ? "Cheviot" : "Suffolk", name: "", tag: String(301 + i), sex: i < 22 ? "F" : "M", born: iso(-700 - i * 9), status: "Active", paddock: "demo-p1", weights: [], health: [], bred: i < 6 ? iso(-146 + i) : undefined }));
    const cattle = [["Daisy", "Hereford"], ["Bramble", "Hereford"], ["Clover", "Angus"], ["Hazel", "Dexter"], ["Poppy", "Dexter"]].map(([name, breed], i) => ({
      id: `demo-c${i}`, species: "cattle", breed, name, tag: String(101 + i), sex: "F", born: iso(-1500 - i * 200), status: "Active", paddock: "demo-p2",
      weights: [{ date: iso(-90), kg: breed === "Dexter" ? 290 : 520 }, { date: iso(-2), kg: breed === "Dexter" ? 305 : 548 }],
      health: i === 1 ? [{ id: "demo-h1", date: iso(-363), kind: "vaccination", text: "Clostridial booster", due: iso(2) }] : [], bred: i === 0 ? iso(-280) : undefined }));
    const hens = Array.from({ length: 6 }, (_, i) => ({ id: `demo-h${i + 10}`, species: "chicken", breed: i < 4 ? "ISA Brown (hybrid)" : "Marans", name: ["Henrietta", "Mabel", "Pip", "Dot", "Ginger", "Olive"][i], status: "Active", sex: "F", weights: [], health: [] }));
    localStorage.setItem("atlas.work.flock.v1", JSON.stringify({ org: "farm", name: "Hillside Farm (demo)", animals: [...sheep, ...cattle, ...hens],
      paddocks: [{ id: "demo-p1", name: "Ridge paddock", pts: box(-300, -150, 380, 280), forage: 2200 }, { id: "demo-p2", name: "Brook meadow", pts: box(150, -200, 300, 220), forage: 2600 }] }));
  }
  return "demo-farm";
}

export function removeDemo(store: PlaceStore) {
  for (const p of store.all().filter((x) => x.id.startsWith("demo-"))) store.remove(p.id);
  localStorage.setItem("atlas.work.fields.v1", JSON.stringify(read<{ id: string }[]>("atlas.work.fields.v1", []).filter((f) => !f.id.startsWith("demo-"))));
  const flock = read<{ name?: string } | null>("atlas.work.flock.v1", null);
  if (flock?.name?.endsWith("(demo)")) localStorage.removeItem("atlas.work.flock.v1");
}
