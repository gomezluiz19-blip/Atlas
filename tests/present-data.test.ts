import { describe, expect, it } from "vitest";
import { columnKind, figureIn, parseNumber, parseTable, pointsCamera, readText, sectionsOf, short, suggestFromTable, tableDelimiter, tableFromJson, visualFromJson } from "../src/work/presentData";

describe("numbers as people write them", () => {
  it("reads currency, percent, scale words and separators", () => {
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("$4.5M")).toBe(4_500_000);
    expect(parseNumber("12%")).toBe(12);
    expect(parseNumber("(300)")).toBe(-300);
    expect(parseNumber("8.1 billion")).toBe(8.1e9);
    expect(parseNumber("−3,5")).toBe(-3.5);
    expect(parseNumber("1.234,5")).toBe(1234.5);
    expect(parseNumber("21 °C")).toBe(21);
    expect(parseNumber("Paris")).toBeNull();
    expect(parseNumber("12 apples")).toBeNull();
    expect(parseNumber("1,23,4")).toBeNull();
  });
  it("writes figures short", () => {
    expect(short(8.1e9)).toBe("8.1 bn");
    expect(short(4_500_000, "$")).toBe("$4.5 m");
    expect(short(12, "%")).toBe("12%");
    expect(short(1234)).toBe("1,234");
    expect(short(56_000)).toBe("56 k");
    expect(short(0.42)).toBe("0.42");
  });
});

describe("tables", () => {
  it("finds the delimiter and the header", () => {
    const csv = 'Country,Population\nIndia,"1,428,627,663"\nChina,1425671352\nUSA,339996563';
    expect(tableDelimiter(csv)).toBe(",");
    const t = parseTable(csv);
    expect(t.columns).toEqual(["Country", "Population"]);
    expect(t.rows[0]).toEqual(["India", "1,428,627,663"]);
    expect(tableDelimiter("Name\tValue\nA\t1\nB\t2")).toBe("\t");
  });
  it("doesn't take prose for a table", () => {
    expect(tableDelimiter("The river rises in the hills, then turns west.\nIt reaches the sea at the old port, past the mills and the long bridge over the estuary.")).toBeNull();
  });
  it("knows what each column holds", () => {
    expect(columnKind("Year", ["2019", "2020", "2021"])).toBe("time");
    expect(columnKind("lat", ["40.7", "51.5"])).toBe("lat");
    expect(columnKind("Longitude", ["-74", "-0.12"])).toBe("lon");
    expect(columnKind("Sales", ["$1.2M", "$800k"])).toBe("number");
    expect(columnKind("Store", ["Main St", "Harbour"])).toBe("place");
    expect(columnKind("Where", ["1600 Pennsylvania Ave NW, Washington", "10 Downing Street, London"])).toBe("place");
    expect(columnKind("Name", ["Ana", "Bo"])).toBe("text");
  });
  it("reads JSON records, GeoJSON and name-number objects", () => {
    expect(tableFromJson([{ city: "Lima", pop: 10 }, { city: "Quito", pop: 3 }])!.columns).toEqual(["city", "pop"]);
    const g = tableFromJson({ type: "FeatureCollection", features: [{ geometry: { type: "Point", coordinates: [10, 20] }, properties: { name: "A" } }, { geometry: { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] }, properties: { name: "B" } }] })!;
    expect(g.columns).toEqual(["name", "longitude", "latitude"]);
    expect(g.rows[0]).toEqual(["A", "10", "20"]);
    expect(g.rows[1]).toEqual(["B", "1", "1"]);
    expect(tableFromJson({ apples: 3, pears: "5" })!.rows).toEqual([["apples", "3"], ["pears", "5"]]);
    expect(tableFromJson({ data: [{ a: 1 }] })!.columns).toEqual(["a"]);
    expect(tableFromJson("x")).toBeNull();
  });
});

describe("suggestions", () => {
  it("makes bars and shares from names and numbers, ranked", () => {
    const s = suggestFromTable(parseTable("Fruit,Tonnes\nApples,30\nPears,50\nPlums,20"));
    const bars = s.find((x) => x.visual.kind === "bars")!;
    expect(bars.visual.kind === "bars" && bars.visual.items.map((i) => i.label)).toEqual(["Pears", "Apples", "Plums"]);
    expect(s.some((x) => x.visual.kind === "share")).toBe(true);
  });
  it("makes a line and a then-and-now figure from a time series, in time order", () => {
    const s = suggestFromTable(parseTable("Year,CO2 (ppm)\n2020,414\n2000,370\n2010,390"));
    const line = s.find((x) => x.visual.kind === "line")!;
    expect(line.visual.kind === "line" && line.visual.items.map((i) => i.label)).toEqual(["2000", "2010", "2020"]);
    const fig = s.find((x) => x.visual.kind === "number")!;
    expect(fig.visual).toMatchObject({ kind: "number", value: 414, was: 370, wasLabel: "2000" });
  });
  it("puts coordinates straight on the globe, sized by the first number", () => {
    const s = suggestFromTable(parseTable("name,lat,lon,visitors\nA,48.85,2.35,100\nB,51.5,-0.12,80"));
    expect(s[0].visual.kind).toBe("points");
    expect(s[0].visual.kind === "points" && s[0].visual.items[0]).toEqual({ label: "A", lat: 48.85, lon: 2.35, value: 100 });
    expect(s[0].find).toBeUndefined();
  });
  it("asks to find addresses, joining place columns", () => {
    const s = suggestFromTable(parseTable("Store,Address,City,Sales\nNorth,12 High St,Leeds,40\nSouth,3 Mill Rd,Bath,25"));
    const pts = s.find((x) => x.find)!;
    expect(pts.find![0]).toEqual({ label: "North", query: "12 High St, Leeds", value: 40 });
  });
});

describe("reading anything", () => {
  it("one number", () => {
    const r = readText("8.1 billion people");
    expect(r.suggestions[0].visual).toMatchObject({ kind: "number", value: 8.1e9 });
  });
  it("label: number lines", () => {
    const r = readText("Rent: $1,200\nFood: $450\nTravel: $200");
    expect(r.suggestions.find((s) => s.visual.kind === "bars")).toBeTruthy();
  });
  it("a list of addresses", () => {
    const r = readText("221B Baker Street, London\n1600 Pennsylvania Ave NW, Washington DC\n350 Fifth Avenue, New York");
    expect(r.suggestions[0].find).toHaveLength(3);
  });
  it("a list of place names", () => {
    const r = readText("Lisbon\nPorto\nFaro");
    expect(r.suggestions[0].find!.map((f) => f.query)).toEqual(["Lisbon", "Porto", "Faro"]);
  });
  it("JSON and CSV files by name", () => {
    expect(readText('[{"k":"a","v":1},{"k":"b","v":2}]', "data.json").about).toMatch(/2 records/);
    expect(readText("a,b\nx,1\ny,2", "sales_2024.csv").suggestions[0].visual.title).toMatch(/sales 2024|b by/);
  });
  it("a document becomes sections, short figure sections show their figure", () => {
    const r = readText("# Our year\nWe planted trees across the valley this spring and the summer after.\n\n## Trees\n12,000 trees planted\n\n## Next\nMore schools join in autumn, with walks along the river.");
    expect(r.sections!.map((s) => s.title)).toEqual(["Our year", "Trees", "Next"]);
    expect(r.sections![1].visual).toMatchObject({ kind: "number", value: 12000 });
  });
  it("paragraphs without headings", () => {
    const s = sectionsOf("The coast\nCliffs run for forty miles here.\n\nThe town grew around a harbour built in the 1600s. Fishing boats still leave at dawn.");
    expect(s[0].title).toBe("The coast");
    expect(s[1].title).toBe("The town grew around a harbour built in the 1600s.");
    expect(s[1].text).toBe("Fishing boats still leave at dawn.");
  });
  it("finds a figure in a sentence, not a year", () => {
    expect(figureIn("Sales rose 12% last year")).toMatchObject({ value: 12, unit: "%" });
    expect(figureIn("Founded in 1998")).toBeNull();
  });
});

describe("points and saved visuals", () => {
  it("frames points, across the date line too", () => {
    const c = pointsCamera([{ label: "a", lon: 170, lat: -10 }, { label: "b", lon: -170, lat: 10 }]);
    expect(Math.abs(Math.abs(c.lon) - 180)).toBeLessThan(1);
    expect(c.height).toBeLessThan(6_000_000);
    expect(pointsCamera([{ label: "a", lon: 2, lat: 48 }]).height).toBe(2500);
  });
  it("keeps only well formed visuals", () => {
    expect(visualFromJson({ kind: "bars", items: [{ label: "a", value: 1 }, { label: "b", value: "x" }] })).toEqual({ kind: "bars", title: undefined, unit: undefined, items: [{ label: "a", value: 1 }] });
    expect(visualFromJson({ kind: "image", src: "javascript:alert(1)" })).toBeUndefined();
    expect(visualFromJson({ kind: "points", items: [{ lon: 500, lat: 0 }] })).toBeUndefined();
    expect(visualFromJson({ kind: "number", value: 5, was: 3, wasLabel: "2000" })).toMatchObject({ value: 5, was: 3 });
    expect(visualFromJson({ kind: "nope" })).toBeUndefined();
  });
});

describe("drawing helpers", () => {
  it("splits a share into exactly 100 tiles", async () => {
    const { tiles } = await import("../src/work/presentData");
    expect(tiles([{ label: "a", value: 1 }, { label: "b", value: 1 }, { label: "c", value: 1 }])).toEqual([34, 33, 33]);
    expect(tiles([{ label: "a", value: 0 }])).toEqual([0]);
  });
  it("picks round axis steps", async () => {
    const { niceTicks } = await import("../src/work/presentData");
    expect(niceTicks(0, 414)).toEqual([0, 200, 400, 600]);
    expect(niceTicks(370, 414)).toEqual([360, 380, 400, 420]);
  });
});

describe("addresses written with commas", () => {
  it("keeps the whole line when there's no header", () => {
    const r = readText("221B Baker Street, London\n10 Downing Street, London\n350 Fifth Avenue, New York");
    expect(r.suggestions[0].find!.map((f) => f.query)).toEqual(["221B Baker Street, London", "10 Downing Street, London", "350 Fifth Avenue, New York"]);
    expect(r.suggestions[0].find![0].label).toBe("221B Baker Street");
  });
});
