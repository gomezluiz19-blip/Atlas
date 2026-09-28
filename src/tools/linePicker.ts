// Two-click line drawing on the globe (A then B), with a rubber band.
import { CallbackProperty, Cartesian3, Color, type CustomDataSource } from "cesium";
import type { GeoPoint } from "../app";
import { marker } from "../globe/draw";

export class LinePicker {
  private start: GeoPoint | null = null;
  private cursor: GeoPoint | null = null;

  constructor(private ds: CustomDataSource, private color: string) {}

  get active() {
    return this.start !== null;
  }

  move(p: GeoPoint | null) {
    this.cursor = p;
  }

  cancel() {
    this.start = null;
    this.ds.entities.removeById("rubber");
  }

  /** Returns [A, B] once the second point is clicked, else null. */
  click(p: GeoPoint, onFirst: () => void): [GeoPoint, GeoPoint] | null {
    if (!this.start) {
      this.ds.entities.removeAll();
      this.start = p;
      marker(this.ds, p.lon, p.lat, { color: this.color, label: "A" });
      this.ds.entities.add({
        id: "rubber",
        polyline: {
          positions: new CallbackProperty(() => {
            const end = this.cursor ?? this.start!;
            return Cartesian3.fromDegreesArray([this.start!.lon, this.start!.lat, end.lon, end.lat]);
          }, false),
          width: 2,
          clampToGround: true,
          material: Color.fromCssColorString(this.color).withAlpha(0.8),
        },
      });
      onFirst();
      return null;
    }
    const a = this.start;
    this.cancel();
    marker(this.ds, p.lon, p.lat, { color: this.color, label: "B" });
    return [a, p];
  }
}
