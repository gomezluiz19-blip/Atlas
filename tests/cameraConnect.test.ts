import { describe, expect, it } from "vitest";
import { BRANDS, brand, go2rtcConfig, go2rtcLinks, linkKind, linkProblem, WAYS } from "../src/pro/vision/connect";

describe("connecting a home camera", () => {
  it("gives every brand at least one way that works now, best first", () => {
    for (const b of BRANDS) {
      expect(b.ways.length, b.id).toBeGreaterThan(0);
      expect(b.ways.some((w) => WAYS[w].ready === "now"), b.id).toBe(true);
    }
    expect(brand("ring")!.ways[0]).toBe("share");
    expect(brand("reolink")!.ways[0]).toBe("rtsp");
  });
  it("knows a link by its shape", () => {
    expect(linkKind("https://ha.example.com/api/camera_proxy_stream/camera.front?token=x")).toBe("mjpeg");
    expect(linkKind("https://bridge.example.com/api/stream.m3u8?src=front")).toBe("hls");
    expect(linkKind("https://bridge.example.com/api/webrtc?src=front")).toBe("webrtc");
    expect(linkKind("http://10.0.0.5/cgi-bin/api.cgi?cmd=Snap&channel=0")).toBe("snapshot");
    expect(linkKind("rtsp://u:p@10.0.0.5:554/stream1")).toBe("rtsp");
    expect(linkKind("https://account.ring.com/account/dashboard")).toBe("page");
  });
  it("says what stands in the way", () => {
    expect(linkProblem("rtsp://10.0.0.5/x")).toMatch(/go2rtc/);
    expect(linkProblem("https://account.ring.com/account/dashboard")).toMatch(/share its window|Show its live view/);
    expect(linkProblem("http://10.0.0.5/video.mjpg", true)).toMatch(/https/);
    expect(linkProblem("http://10.0.0.5/video.mjpg", false)).toBeNull();
    expect(linkProblem("https://cam.example.com/stream.m3u8")).toBeNull();
  });
  it("writes the go2rtc config and links for a camera", () => {
    expect(go2rtcConfig("Front Door", "rtsp://u:p@10.0.0.5/stream1")).toBe("streams:\n  front_door: rtsp://u:p@10.0.0.5/stream1\n");
    expect(go2rtcLinks("https://bridge.example.com/", "front_door").webrtc).toBe("https://bridge.example.com/api/webrtc?src=front_door");
  });
});
