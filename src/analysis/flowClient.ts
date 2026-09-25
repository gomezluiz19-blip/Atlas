// Main-thread wrapper around the hydrology worker.
import type { FlowModel } from "./hydrology";
import type { FlowRequest } from "./hydrology.worker";
import type { ElevationGrid } from "../data/elevation";
import { metersPerPixel, pixelToLonLat } from "../data/mercator";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (m: FlowModel) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./hydrology.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; model?: FlowModel; error?: string }>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.model) job.resolve(e.data.model);
      else job.reject(new Error(e.data.error ?? "Flow analysis failed"));
    };
  }
  return worker;
}

export function rowCellSizes(grid: ElevationGrid): Float64Array {
  const out = new Float64Array(grid.height);
  for (let r = 0; r < grid.height; r++) {
    const [, lat] = pixelToLonLat(grid.px0, grid.py0 + r + 0.5, grid.z);
    out[r] = metersPerPixel(lat, grid.z);
  }
  return out;
}

export function buildFlowModelAsync(grid: ElevationGrid): Promise<FlowModel> {
  const id = nextId++;
  const req: FlowRequest = {
    id,
    width: grid.width,
    height: grid.height,
    // Copy so the caller keeps its grid; the copy is transferred, not cloned.
    data: grid.data.slice(),
    rowCellSize: rowCellSizes(grid),
  };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage(req, [req.data.buffer, req.rowCellSize.buffer]);
  });
}
