import { describe, expect, it } from "vitest";
import { detectSource, guessFields, isoDate, rowsFromCsv, rowsFromJson } from "../src/data/opendata";
import { sitesFromRows } from "../src/pro/con/model";
import { facilitiesFromRows } from "../src/pro/gov/model";

describe("Open-data connector", () => {
  it("works out how to query a pasted link", () => {
    expect(detectSource("https://data.montgomerycountymd.gov/Permits/Residential-Permits/m88u-pqki")).toMatchObject({ kind: "socrata", url: expect.stringContaining("https://data.montgomerycountymd.gov/resource/m88u-pqki.json?$limit=") });
    expect(detectSource("https://data.cityofnewyork.us/resource/ipu4-2q9a.json")?.kind).toBe("socrata");
    expect(detectSource("https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/7")).toMatchObject({ kind: "arcgis", url: expect.stringContaining("/FeatureServer/7/query?where=1%3D1&outFields=*&outSR=4326&f=geojson") });
    expect(detectSource("https://example.gov/data/permits.csv")?.kind).toBe("csv");
    expect(detectSource("https://example.gov/x.geojson")?.kind).toBe("geojson");
    expect(detectSource("not a link")).toBeNull();
    expect(detectSource("https://example.gov/about")).toBeNull();
  });
  it("finds the location in Socrata rows of every common shape", () => {
    const rows = rowsFromJson([
      { permit_type: "NEW", latitude: "39.08", longitude: "-77.15", address: "1 Main St" },
      { location: { latitude: "39.0", longitude: "-77.0" }, address: "2 Main St" },
      { the_geom: { type: "Point", coordinates: [-77.1, 38.9] } },
      { address: "nowhere" },
    ]);
    expect(rows.map((r) => [r.lon, r.lat])).toEqual([[-77.15, 39.08], [-77, 39], [-77.1, 38.9]]);
  });
  it("reads ArcGIS GeoJSON, including polygons by their middle, and CSV", () => {
    const g = rowsFromJson({ features: [{ geometry: { type: "Point", coordinates: [-77.03, 38.9] }, properties: { PERMIT_TYPE_NAME: "CONSTRUCTION", ISSUE_DATE: 1735689600000, FULL_ADDRESS: "100 K ST NW", FEES_PAID: 12 } },
      { geometry: { type: "Polygon", coordinates: [[[-77, 38], [-76, 38], [-76, 39], [-77, 39], [-77, 38]]] }, properties: { NAME: "Lot" } }] });
    expect(g[1]).toMatchObject({ lon: -76.5, lat: 38.5 });
    const c = rowsFromCsv("Name,Latitude,Longitude,Status\n\"Fire, Station 1\",38.8,-77.1,Open\n");
    expect(c[0]).toMatchObject({ lon: -77.1, lat: 38.8, props: { Name: "Fire, Station 1" } });
  });
  it("guesses which column is which, and reads dates in any common form", () => {
    const rows = rowsFromJson({ features: [{ geometry: { type: "Point", coordinates: [-77.03, 38.9] }, properties: { PERMIT_TYPE_NAME: "NEW BUILDING", ISSUE_DATE: "1735689600000", FULL_ADDRESS: "100 K ST NW", OWNER_NAME: "K Street LLC", APPLICANT: "Acme Builders", ESTIMATED_COST: "$12,500,000", PERMIT_STATUS: "Issued" } }] });
    const m = guessFields(rows);
    expect(m).toMatchObject({ date: "ISSUE_DATE", address: "FULL_ADDRESS", type: "PERMIT_TYPE_NAME", value: "ESTIMATED_COST", owner: "OWNER_NAME", contractor: "APPLICANT", status: "PERMIT_STATUS" });
    expect(isoDate("1735689600000")).toBe("2025-01-01");
    expect(isoDate("03/04/2026")).toBe("2026-03-04");
    expect(isoDate("2026-05-06T00:00:00.000")).toBe("2026-05-06");
    const [site] = sitesFromRows(rows, m, "2026-10-01", "import", "dc");
    expect(site).toMatchObject({ address: "100 K ST NW", gc: "Acme Builders", owner: "K Street LLC", value: 12_500_000, start: "2025-01-01", union: "unknown" });
    expect(site.stories).toBeGreaterThan(3);
    const [f] = facilitiesFromRows(rowsFromCsv("Name,Type,Lat,Lon\nEngine 7,Fire station,38.9,-77\n"), { name: "Name", type: "Type" }, "fdny");
    expect(f).toMatchObject({ kind: "firehouse", agency: "fdny", name: "Engine 7" });
  });
});
