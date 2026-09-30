import { describe, expect, it } from "vitest";
import { carrierOf, findDate, findNumbers, packageSummary, trackUrl, type Package } from "../src/myplaces/packages";

describe("packages", () => {
  it("knows the carrier from the number", () => {
    expect(carrierOf("1Z999AA10123456784")).toBe("UPS");
    expect(carrierOf("9400 1000 0000 0000 0000 00")).toBe("USPS");
    expect(carrierOf("123456789012")).toBe("FedEx");
    expect(carrierOf("1234567890")).toBe("DHL");
    expect(carrierOf("TBA123456789012")).toBe("Amazon");
    expect(carrierOf("AB123456789GB")).toBe("Royal Mail");
    expect(carrierOf("RR123456785DE")).toBe("Post");
    expect(carrierOf("hello")).toBeNull();
  });
  it("finds tracking numbers and a date in a pasted email", () => {
    const mail = "Your order has shipped!\nUPS tracking number: 1Z999AA10123456784\nEstimated delivery: Thursday, Oct 8\nCall us on 555 123 4567.";
    expect(findNumbers(mail)).toEqual([{ number: "1Z999AA10123456784", carrier: "UPS" }]);
    expect(findDate(mail, "2026-09-30")).toBe("2026-10-08");
    expect(findDate("Arriving 3 January", "2026-12-20")).toBe("2027-01-03");
  });
  it("links to the carrier's page", () => {
    expect(trackUrl("UPS", "1z999aa10123456784")).toContain("tracknum=1Z999AA10123456784");
  });
  it("sums up what's coming", () => {
    const p = (o: Partial<Package>): Package => ({ id: Math.random().toString(), label: "x", number: "1", carrier: "UPS", status: "shipped", added: "2026-09-30", ...o });
    const s = packageSummary([p({ eta: "2026-10-02" }), p({ status: "out" }), p({ status: "delivered" }), p({ status: "problem", eta: "2026-10-05" })], "2026-09-30");
    expect(s.coming).toBe(3);
    expect(s.today).toBe(1);
    expect(s.problems).toBe(1);
    expect(s.next?.eta).toBe("2026-10-02");
  });
});
