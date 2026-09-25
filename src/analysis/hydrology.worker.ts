// Runs the expensive flow-model build off the main thread.
import { buildFlowModel } from "./hydrology";

export interface FlowRequest {
  id: number;
  width: number;
  height: number;
  data: Float32Array;
  rowCellSize: Float64Array;
}

self.onmessage = (e: MessageEvent<FlowRequest>) => {
  const { id, width, height, data, rowCellSize } = e.data;
  try {
    const model = buildFlowModel({ width, height, data, rowCellSize });
    (self as unknown as Worker).postMessage({ id, model }, [
      model.filled.buffer,
      model.receiver.buffer,
      model.area.buffer,
    ]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
