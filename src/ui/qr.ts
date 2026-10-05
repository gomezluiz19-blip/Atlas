// QR codes, for moving between screens: the TV's pairing code, and "continue on your phone" on the web.
import qrcode from "qrcode-generator";

/** The QR code for a link, as an SVG string. */
export function qrSvg(text: string): string {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
