// Surface-water routing on a gridded elevation model.
//
// 1. Depressions are filled with Priority-Flood+epsilon (Barnes, Lehman &
//    Mulla 2014) so every cell has a downhill path to the grid edge, and flats
//    get a tiny gradient that drains toward their real outlet.
// 2. Each cell drains to its steepest-descent neighbour (D8, O'Callaghan &
//    Mark 1984).
// 3. Contributing (upstream) area is accumulated in topological order.

export interface DemGrid {
  width: number;
  height: number;
  /** Row-major elevations, metres. */
  data: ArrayLike<number>;
  /** Ground size of a cell in each row, metres (cells are square in Web Mercator). */
  rowCellSize: ArrayLike<number>;
}

export interface FlowModel {
  width: number;
  height: number;
  /** Depression-filled surface, metres. `filled - data` is ponding depth. */
  filled: Float64Array;
  /** Index of the cell each cell drains into, or -1 where water leaves the grid. */
  receiver: Int32Array;
  /** Upstream contributing area of each cell including itself, square metres. */
  area: Float64Array;
}

const EPSILON = 1e-4; // metres added per cell across filled flats

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

class MinHeap {
  private ids: Int32Array;
  private keys: Float64Array;
  size = 0;
  constructor(capacity: number) {
    this.ids = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
  }
  push(id: number, key: number) {
    let i = this.size++;
    const { ids, keys } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const { ids, keys } = this;
    const top = ids[0];
    const n = --this.size;
    const id = ids[n], key = keys[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= key) break;
      ids[i] = ids[c];
      keys[i] = keys[c];
      i = c;
    }
    ids[i] = id;
    keys[i] = key;
    return top;
  }
}

export function fillDepressions(grid: DemGrid): Float64Array {
  const { width: w, height: h, data } = grid;
  const n = w * h;
  const filled = new Float64Array(n);
  const closed = new Uint8Array(n);
  const heap = new MinHeap(n);
  const pit = new Int32Array(n);
  let pitHead = 0, pitTail = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        const i = y * w + x;
        filled[i] = data[i];
        closed[i] = 1;
        heap.push(i, filled[i]);
      }
    }
  }

  while (heap.size > 0 || pitHead < pitTail) {
    const c = pitHead < pitTail ? pit[pitHead++] : heap.pop();
    if (pitHead === pitTail) pitHead = pitTail = 0;
    const cx = c % w, cy = (c - cx) / w;
    const fc = filled[c];
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nb = ny * w + nx;
      if (closed[nb]) continue;
      closed[nb] = 1;
      if (data[nb] <= fc + EPSILON) {
        filled[nb] = fc + EPSILON;
        pit[pitTail++] = nb;
      } else {
        filled[nb] = data[nb];
        heap.push(nb, filled[nb]);
      }
    }
  }
  return filled;
}

export function buildFlowModel(grid: DemGrid): FlowModel {
  const { width: w, height: h, rowCellSize } = grid;
  const n = w * h;
  const filled = fillDepressions(grid);
  const receiver = new Int32Array(n).fill(-1);

  for (let y = 1; y < h - 1; y++) {
    const cs = rowCellSize[y];
    const dist = [cs, cs * Math.SQRT2, cs, cs * Math.SQRT2, cs, cs * Math.SQRT2, cs, cs * Math.SQRT2];
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let best = -1, bestSlope = 0;
      for (let k = 0; k < 8; k++) {
        const j = (y + DY[k]) * w + (x + DX[k]);
        const slope = (filled[i] - filled[j]) / dist[k];
        if (slope > bestSlope) {
          bestSlope = slope;
          best = j;
        }
      }
      receiver[i] = best;
    }
  }

  // Accumulate area from sources downstream (Kahn's algorithm on the drainage tree).
  const area = new Float64Array(n);
  const indegree = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const cs = rowCellSize[(i / w) | 0];
    area[i] = cs * cs;
    if (receiver[i] >= 0) indegree[receiver[i]]++;
  }
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (indegree[i] === 0) queue[tail++] = i;
  while (head < tail) {
    const i = queue[head++];
    const r = receiver[i];
    if (r < 0) continue;
    area[r] += area[i];
    if (--indegree[r] === 0) queue[tail++] = r;
  }

  return { width: w, height: h, filled, receiver, area };
}

/** Cells visited by water flowing downhill from `start` until it leaves the grid. */
export function traceDownstream(model: FlowModel, start: number): number[] {
  const path: number[] = [];
  let c = start;
  const guard = model.width * model.height;
  while (c >= 0 && path.length <= guard) {
    path.push(c);
    c = model.receiver[c];
  }
  return path;
}

/** The cell with the largest contributing area within `radius` cells of `cell`. */
export function snapToStream(model: FlowModel, cell: number, radius: number): number {
  const { width: w, height: h, area } = model;
  const cx = cell % w, cy = (cell - cx) / w;
  let best = cell;
  for (let y = Math.max(0, cy - radius); y <= Math.min(h - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(w - 1, cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      const i = y * w + x;
      if (area[i] > area[best]) best = i;
    }
  }
  return best;
}

/** 1 for every cell that drains through `outlet`, else 0. */
export function watershedMask(model: FlowModel, outlet: number): Uint8Array {
  const { receiver } = model;
  const n = receiver.length;
  // 0 = unknown, 1 = drains to outlet, 2 = does not.
  const state = new Uint8Array(n);
  state[outlet] = 1;
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (state[i]) continue;
    let c = i;
    while (c >= 0 && state[c] === 0) {
      stack.push(c);
      c = receiver[c];
    }
    const verdict = c >= 0 && state[c] === 1 ? 1 : 2;
    while (stack.length) state[stack.pop()!] = verdict;
  }
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = state[i] === 1 ? 1 : 0;
  return mask;
}

/** True if any cell on the grid border is part of the mask. */
export function touchesEdge(mask: Uint8Array, width: number, height: number): boolean {
  for (let x = 0; x < width; x++) {
    if (mask[x] || mask[(height - 1) * width + x]) return true;
  }
  for (let y = 0; y < height; y++) {
    if (mask[y * width] || mask[y * width + width - 1]) return true;
  }
  return false;
}
