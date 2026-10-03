// Big listed companies as maps: where they sell, what they're made of (the raw
// materials whose prices move their margins), what they sell if they're
// producers, and the sites and partners they lean on.
//
// Approximate, from each company's latest annual report (revenue by region,
// rounded to the nearest few percent and mapped to a country or the EU) and
// widely reported supplier and site lists. Weights (0–1) are judgement: how much
// a big move in that material's price would move the company's profits. A
// portfolio built from these shows the shape of your exposure, not a forecast.

export type SiteRole = "HQ" | "Plant" | "Supplier" | "Mine" | "Fab" | "Partner" | "Field";
export interface Site { name: string; code: string; lon: number; lat: number; role: SiteRole }
export interface Company {
  id: string;
  name: string;
  ticker: string;
  hq: string;
  sector: string;
  about: string;
  /** Where revenue comes from: [ISO2 or "EU", share %]. The rest is "elsewhere". */
  revenue: [string, number][];
  /** Raw materials it buys: [market id, weight 0–1]. */
  inputs: [string, number][];
  /** Raw materials it sells: [market id, weight 0–1]. */
  sells?: [string, number][];
  sites: Site[];
}

const s = (name: string, code: string, lon: number, lat: number, role: SiteRole): Site => ({ name, code, lon, lat, role });

export const COMPANIES: Company[] = [
  { id: "apple", name: "Apple", ticker: "AAPL", hq: "US", sector: "Tech hardware", about: "iPhones, Macs and services; assembled mostly in China, chips from Taiwan.",
    revenue: [["US", 40], ["EU", 24], ["CN", 17], ["JP", 7]], inputs: [["aluminium", 0.15], ["cobalt", 0.1], ["lithium", 0.1], ["rare-earths", 0.15], ["gold", 0.05], ["tin", 0.05], ["copper", 0.05]],
    sites: [s("Cupertino", "US", -122.01, 37.33, "HQ"), s("Foxconn Zhengzhou", "CN", 113.83, 34.53, "Supplier"), s("TSMC Hsinchu", "TW", 121.0, 24.78, "Supplier"), s("Foxconn Chennai", "IN", 79.95, 12.92, "Supplier"), s("Samsung Display Asan", "KR", 127.0, 36.78, "Supplier")] },
  { id: "microsoft", name: "Microsoft", ticker: "MSFT", hq: "US", sector: "Software & cloud", about: "Software and Azure cloud; data centres need power, copper and chips.",
    revenue: [["US", 51], ["EU", 22], ["JP", 5], ["CN", 3]], inputs: [["copper", 0.05], ["lng", 0.05]],
    sites: [s("Redmond", "US", -122.13, 47.64, "HQ"), s("TSMC Hsinchu (via chip suppliers)", "TW", 121.0, 24.78, "Supplier"), s("Dublin data centres", "EU", -6.4, 53.3, "Plant")] },
  { id: "nvidia", name: "Nvidia", ticker: "NVDA", hq: "US", sector: "Semiconductors", about: "AI and graphics chips, almost all made by TSMC in Taiwan.",
    revenue: [["US", 47], ["TW", 16], ["CN", 13], ["SG", 18]], inputs: [["copper", 0.03], ["gold", 0.03]],
    sites: [s("Santa Clara", "US", -121.95, 37.37, "HQ"), s("TSMC Tainan Fab 18", "TW", 120.28, 23.11, "Fab"), s("SK hynix Icheon (memory)", "KR", 127.48, 37.27, "Supplier"), s("Foxconn Guadalajara", "MX", -103.42, 20.6, "Supplier")] },
  { id: "tsmc", name: "TSMC", ticker: "TSM", hq: "TW", sector: "Semiconductors", about: "Makes most of the world's advanced chips, in Taiwan.",
    revenue: [["US", 68], ["CN", 11], ["JP", 6], ["EU", 3]], inputs: [["lng", 0.1], ["copper", 0.03]],
    sites: [s("Hsinchu", "TW", 121.0, 24.78, "HQ"), s("Fab 18 Tainan", "TW", 120.28, 23.11, "Fab"), s("Arizona fabs", "US", -112.17, 33.75, "Fab"), s("Kumamoto (JASM)", "JP", 130.77, 32.88, "Fab"), s("ASML Veldhoven (tools)", "NL", 5.41, 51.41, "Supplier")] },
  { id: "asml", name: "ASML", ticker: "ASML", hq: "NL", sector: "Chip equipment", about: "The only maker of EUV lithography machines.",
    revenue: [["TW", 29], ["CN", 29], ["KR", 20], ["US", 13]], inputs: [["rare-earths", 0.05]],
    sites: [s("Veldhoven", "NL", 5.41, 51.41, "HQ"), s("Zeiss Oberkochen (optics)", "DE", 10.1, 48.78, "Supplier"), s("San Diego (light sources)", "US", -117.16, 32.9, "Plant")] },
  { id: "samsung", name: "Samsung Electronics", ticker: "005930.KS", hq: "KR", sector: "Tech hardware", about: "Phones, memory chips and screens.",
    revenue: [["US", 35], ["CN", 20], ["EU", 18], ["KR", 15]], inputs: [["cobalt", 0.05], ["lithium", 0.05], ["rare-earths", 0.05], ["lng", 0.05]],
    sites: [s("Suwon", "KR", 127.05, 37.26, "HQ"), s("Pyeongtaek fabs", "KR", 127.05, 36.99, "Fab"), s("Bac Ninh phones", "VN", 106.07, 21.18, "Plant"), s("Xi'an memory", "CN", 108.94, 34.34, "Fab")] },
  { id: "tesla", name: "Tesla", ticker: "TSLA", hq: "US", sector: "Electric vehicles", about: "Electric cars and storage; batteries from CATL, Panasonic and LG.",
    revenue: [["US", 47], ["CN", 21], ["EU", 18]], inputs: [["lithium", 0.35], ["nickel", 0.25], ["cobalt", 0.1], ["graphite", 0.15], ["aluminium", 0.15], ["copper", 0.1], ["rare-earths", 0.1]],
    sites: [s("Austin", "US", -97.62, 30.22, "HQ"), s("Gigafactory Shanghai", "CN", 121.78, 30.88, "Plant"), s("Gigafactory Berlin", "DE", 13.8, 52.39, "Plant"), s("Gigafactory Nevada (Panasonic)", "US", -119.44, 39.54, "Plant"), s("CATL Ningde", "CN", 119.54, 26.66, "Supplier"), s("Greenbushes lithium (via suppliers)", "AU", 116.06, -33.86, "Mine")] },
  { id: "byd", name: "BYD", ticker: "1211.HK", hq: "CN", sector: "Electric vehicles", about: "The world's biggest EV maker, with its own batteries.",
    revenue: [["CN", 70], ["EU", 8], ["BR", 4]], inputs: [["lithium", 0.3], ["iron", 0.05], ["graphite", 0.1], ["aluminium", 0.1], ["copper", 0.1]],
    sites: [s("Shenzhen", "CN", 114.27, 22.68, "HQ"), s("Xi'an plant", "CN", 108.94, 34.34, "Plant"), s("Rayong plant", "TH", 101.25, 12.97, "Plant"), s("Szeged plant", "EU", 20.15, 46.25, "Plant")] },
  { id: "catl", name: "CATL", ticker: "300750.SZ", hq: "CN", sector: "Batteries", about: "A third of the world's EV batteries.",
    revenue: [["CN", 68], ["EU", 22], ["US", 3]], inputs: [["lithium", 0.45], ["nickel", 0.2], ["cobalt", 0.1], ["graphite", 0.15]],
    sites: [s("Ningde", "CN", 119.54, 26.66, "HQ"), s("Erfurt plant", "DE", 10.98, 50.9, "Plant"), s("Debrecen plant", "EU", 21.63, 47.53, "Plant"), s("Indonesia nickel JV", "ID", 122.3, -3.9, "Partner")] },
  { id: "toyota", name: "Toyota", ticker: "7203.T", hq: "JP", sector: "Cars", about: "The biggest carmaker; hybrids lean on nickel and rare earths.",
    revenue: [["JP", 30], ["US", 32], ["EU", 10], ["CN", 6]], inputs: [["iron", 0.1], ["aluminium", 0.1], ["platinum", 0.05], ["rare-earths", 0.1], ["nickel", 0.05], ["oil", 0.05]],
    sites: [s("Toyota City", "JP", 137.15, 35.08, "HQ"), s("Georgetown, Kentucky", "US", -84.55, 38.24, "Plant"), s("Tianjin plant", "CN", 117.36, 39.13, "Plant"), s("Denso Kariya (parts)", "JP", 137.0, 34.99, "Supplier")] },
  { id: "volkswagen", name: "Volkswagen", ticker: "VOW3.DE", hq: "DE", sector: "Cars", about: "Europe's biggest carmaker; a third of its cars sell in China.",
    revenue: [["EU", 55], ["CN", 18], ["US", 15]], inputs: [["iron", 0.1], ["aluminium", 0.1], ["lithium", 0.1], ["platinum", 0.05], ["lng", 0.05]],
    sites: [s("Wolfsburg", "DE", 10.79, 52.43, "HQ"), s("Anting (SAIC-VW)", "CN", 121.17, 31.3, "Plant"), s("Chattanooga", "US", -85.12, 35.05, "Plant"), s("Salzgitter battery plant", "DE", 10.35, 52.15, "Plant")] },
  { id: "bhp", name: "BHP", ticker: "BHP", hq: "AU", sector: "Mining", about: "Iron ore and copper; China buys most of it.",
    revenue: [["CN", 60], ["JP", 8], ["IN", 7], ["KR", 5]], inputs: [["oil", 0.1]], sells: [["iron", 0.5], ["copper", 0.4], ["coal", 0.1]],
    sites: [s("Melbourne", "AU", 144.96, -37.81, "HQ"), s("Pilbara iron ore", "AU", 118.7, -22.7, "Mine"), s("Escondida copper", "CL", -69.07, -24.27, "Mine"), s("Jansen potash (building)", "CA", -104.6, 51.7, "Mine")] },
  { id: "rio", name: "Rio Tinto", ticker: "RIO", hq: "GB", sector: "Mining", about: "Iron ore, aluminium and copper; building Simandou in Guinea.",
    revenue: [["CN", 57], ["US", 12], ["JP", 6], ["EU", 6]], inputs: [["oil", 0.1], ["lng", 0.05]], sells: [["iron", 0.55], ["aluminium", 0.25], ["copper", 0.15]],
    sites: [s("London", "GB", -0.12, 51.51, "HQ"), s("Pilbara iron ore", "AU", 117.2, -22.6, "Mine"), s("Oyu Tolgoi copper", "MN", 106.87, 43.0, "Mine"), s("Simandou iron ore", "GN", -8.9, 8.6, "Mine"), s("Kitimat smelter", "CA", -128.7, 54.0, "Plant")] },
  { id: "glencore", name: "Glencore", ticker: "GLEN.L", hq: "CH", sector: "Mining & trading", about: "Copper, cobalt, coal and zinc, and one of the biggest commodity traders.",
    revenue: [["CN", 20], ["EU", 30], ["US", 10], ["JP", 5]], inputs: [["oil", 0.1]], sells: [["copper", 0.3], ["cobalt", 0.15], ["coal", 0.3], ["zinc", 0.1], ["nickel", 0.05]],
    sites: [s("Baar", "CH", 8.53, 47.2, "HQ"), s("Kamoto copper-cobalt", "CD", 25.4, -10.72, "Mine"), s("Mutanda cobalt", "CD", 25.81, -10.79, "Mine"), s("Hunter Valley coal", "AU", 151.1, -32.4, "Mine"), s("Antapaccay copper", "PE", -71.42, -14.93, "Mine")] },
  { id: "freeport", name: "Freeport-McMoRan", ticker: "FCX", hq: "US", sector: "Mining", about: "Copper and gold; Grasberg in Indonesia is one of the biggest mines on Earth.",
    revenue: [["US", 25], ["ID", 10], ["JP", 15], ["CN", 15], ["EU", 15]], inputs: [["oil", 0.1]], sells: [["copper", 0.75], ["gold", 0.2]],
    sites: [s("Phoenix", "US", -112.07, 33.45, "HQ"), s("Grasberg", "ID", 137.12, -4.06, "Mine"), s("Cerro Verde", "PE", -71.59, -16.53, "Mine"), s("Morenci", "US", -109.36, 33.08, "Mine")] },
  { id: "vale", name: "Vale", ticker: "VALE", hq: "BR", sector: "Mining", about: "Iron ore and nickel.",
    revenue: [["CN", 50], ["JP", 6], ["EU", 10], ["US", 4]], inputs: [["oil", 0.1]], sells: [["iron", 0.7], ["nickel", 0.15], ["copper", 0.1]],
    sites: [s("Rio de Janeiro", "BR", -43.18, -22.9, "HQ"), s("Carajás iron ore", "BR", -50.2, -6.05, "Mine"), s("Sudbury nickel", "CA", -81.0, 46.5, "Mine"), s("Sorowako nickel", "ID", 121.36, -2.53, "Mine")] },
  { id: "albemarle", name: "Albemarle", ticker: "ALB", hq: "US", sector: "Lithium", about: "The biggest lithium producer outside China.",
    revenue: [["CN", 30], ["KR", 20], ["JP", 15], ["US", 15]], inputs: [["lng", 0.05]], sells: [["lithium", 0.85]],
    sites: [s("Charlotte", "US", -80.84, 35.23, "HQ"), s("Greenbushes (JV)", "AU", 116.06, -33.86, "Mine"), s("Salar de Atacama", "CL", -68.3, -23.5, "Mine"), s("Kemerton refinery", "AU", 115.75, -33.18, "Plant")] },
  { id: "newmont", name: "Newmont", ticker: "NEM", hq: "US", sector: "Gold mining", about: "The biggest gold miner.",
    revenue: [["US", 30], ["EU", 30], ["CA", 15]], inputs: [["oil", 0.1]], sells: [["gold", 0.85], ["copper", 0.1]],
    sites: [s("Denver", "US", -104.99, 39.74, "HQ"), s("Boddington", "AU", 116.37, -32.75, "Mine"), s("Ahafo", "GH", -2.33, 7.0, "Mine"), s("Peñasquito", "MX", -101.72, 24.66, "Mine"), s("Lihir", "PG", 152.64, -3.12, "Mine")] },
  { id: "cameco", name: "Cameco", ticker: "CCJ", hq: "CA", sector: "Uranium", about: "Uranium mining and nuclear fuel.",
    revenue: [["US", 45], ["EU", 30], ["CN", 10]], inputs: [], sells: [["uranium", 0.85]],
    sites: [s("Saskatoon", "CA", -106.67, 52.13, "HQ"), s("Cigar Lake", "CA", -104.5, 58.07, "Mine"), s("McArthur River", "CA", -105.05, 57.76, "Mine"), s("Inkai (JV)", "KZ", 67.5, 45.3, "Mine")] },
  { id: "nutrien", name: "Nutrien", ticker: "NTR", hq: "CA", sector: "Fertiliser", about: "The biggest potash producer, and farm retail.",
    revenue: [["US", 65], ["CA", 15], ["AU", 10], ["BR", 5]], inputs: [["lng", 0.2]], sells: [["potash", 0.45], ["phosphate", 0.1]],
    sites: [s("Saskatoon", "CA", -106.67, 52.13, "HQ"), s("Rocanville potash", "CA", -101.7, 50.4, "Mine"), s("Geismar nitrogen", "US", -90.99, 30.21, "Plant")] },
  { id: "exxon", name: "ExxonMobil", ticker: "XOM", hq: "US", sector: "Oil & gas", about: "Oil, gas and chemicals; Permian, Guyana and LNG.",
    revenue: [["US", 40], ["EU", 20], ["CA", 7], ["SG", 5]], inputs: [], sells: [["oil", 0.7], ["lng", 0.2]],
    sites: [s("Spring, Texas", "US", -95.42, 30.06, "HQ"), s("Permian Basin", "US", -102.5, 31.9, "Field"), s("Stabroek, Guyana", "GY", -57.5, 8.0, "Field"), s("Golden Pass LNG", "US", -93.9, 29.76, "Plant"), s("Ras Laffan (Qatar JV)", "QA", 51.54, 25.9, "Partner")] },
  { id: "shell", name: "Shell", ticker: "SHEL", hq: "GB", sector: "Oil & gas", about: "The biggest LNG trader, plus oil and fuel stations.",
    revenue: [["EU", 30], ["US", 20], ["GB", 10], ["SG", 8]], inputs: [], sells: [["lng", 0.45], ["oil", 0.45]],
    sites: [s("London", "GB", -0.12, 51.5, "HQ"), s("Prelude FLNG", "AU", 123.3, -13.8, "Field"), s("Pernis refinery", "NL", 4.38, 51.88, "Plant"), s("Ras Laffan (Qatar JV)", "QA", 51.54, 25.9, "Partner"), s("Bonga field", "NG", 4.5, 4.5, "Field")] },
  { id: "aramco", name: "Saudi Aramco", ticker: "2222.SR", hq: "SA", sector: "Oil & gas", about: "The world's biggest oil producer; exports pass the Strait of Hormuz and the Red Sea.",
    revenue: [["SA", 30], ["CN", 25], ["JP", 10], ["IN", 10], ["KR", 8]], inputs: [], sells: [["oil", 0.85], ["lng", 0.05]],
    sites: [s("Dhahran", "SA", 50.15, 26.29, "HQ"), s("Ghawar field", "SA", 49.3, 25.4, "Field"), s("Ras Tanura terminal", "SA", 50.16, 26.64, "Plant"), s("Yanbu terminal (Red Sea)", "SA", 38.06, 24.09, "Plant")] },
  { id: "arcelor", name: "ArcelorMittal", ticker: "MT", hq: "LU", sector: "Steel", about: "Steel in Europe, the Americas and India; hit by EU carbon costs.",
    revenue: [["EU", 45], ["US", 15], ["BR", 15], ["IN", 5]], inputs: [["iron", 0.35], ["coal", 0.25], ["lng", 0.1]],
    sites: [s("Luxembourg", "LU", 6.13, 49.61, "HQ"), s("Dunkirk steelworks", "FR", 2.27, 51.03, "Plant"), s("Ghent steelworks", "BE", 3.81, 51.13, "Plant"), s("Calvert, Alabama", "US", -88.02, 31.12, "Plant"), s("Hazira (AM/NS India)", "IN", 72.66, 21.1, "Plant")] },
  { id: "caterpillar", name: "Caterpillar", ticker: "CAT", hq: "US", sector: "Machinery", about: "Mining trucks, diggers and engines; sells to mines everywhere.",
    revenue: [["US", 48], ["EU", 20], ["AU", 7], ["CN", 5]], inputs: [["iron", 0.15], ["copper", 0.05]],
    sites: [s("Irving, Texas", "US", -96.94, 32.81, "HQ"), s("Decatur mining trucks", "US", -88.95, 39.84, "Plant"), s("Gosselies", "BE", 4.43, 50.47, "Plant"), s("Xuzhou", "CN", 117.28, 34.2, "Plant")] },
  { id: "siemens-energy", name: "Siemens Energy", ticker: "ENR.DE", hq: "DE", sector: "Power equipment", about: "Gas turbines, grid gear and wind (Siemens Gamesa).",
    revenue: [["EU", 40], ["US", 22], ["SA", 6], ["CN", 5]], inputs: [["copper", 0.15], ["rare-earths", 0.15], ["iron", 0.1], ["aluminium", 0.05]],
    sites: [s("Munich", "DE", 11.58, 48.14, "HQ"), s("Berlin gas turbines", "DE", 13.3, 52.53, "Plant"), s("Brande wind", "DK", 9.13, 55.94, "Plant"), s("Charlotte", "US", -80.84, 35.23, "Plant")] },
  { id: "vestas", name: "Vestas", ticker: "VWS.CO", hq: "DK", sector: "Wind power", about: "The biggest wind-turbine maker outside China.",
    revenue: [["EU", 55], ["US", 25], ["AU", 5]], inputs: [["iron", 0.2], ["copper", 0.1], ["rare-earths", 0.15], ["aluminium", 0.05]],
    sites: [s("Aarhus", "DK", 10.2, 56.15, "HQ"), s("Windsor, Colorado", "US", -104.9, 40.48, "Plant"), s("Tianjin", "CN", 117.36, 39.13, "Plant"), s("Rostock", "DE", 12.1, 54.09, "Plant")] },
  { id: "nestle", name: "Nestlé", ticker: "NESN.SW", hq: "CH", sector: "Food", about: "Coffee (Nescafé, Nespresso), chocolate and much more.",
    revenue: [["US", 32], ["EU", 22], ["CN", 5], ["BR", 4]], inputs: [["coffee", 0.25], ["cocoa", 0.1], ["wheat", 0.05], ["palm-oil", 0.05], ["aluminium", 0.03]],
    sites: [s("Vevey", "CH", 6.85, 46.46, "HQ"), s("Coffee from Minas Gerais", "BR", -45.5, -21.0, "Supplier"), s("Coffee from Đắk Lắk", "VN", 108.05, 12.67, "Supplier"), s("Cocoa from Côte d'Ivoire", "CI", -5.5, 6.5, "Supplier")] },
  { id: "mondelez", name: "Mondelez", ticker: "MDLZ", hq: "US", sector: "Food", about: "Cadbury, Milka, Oreo: one of the biggest cocoa buyers.",
    revenue: [["EU", 38], ["US", 28], ["IN", 4], ["CN", 3]], inputs: [["cocoa", 0.35], ["wheat", 0.1], ["palm-oil", 0.05]],
    sites: [s("Chicago", "US", -87.63, 41.88, "HQ"), s("Bournville", "GB", -1.93, 52.43, "Plant"), s("Cocoa from Ghana", "GH", -1.6, 6.7, "Supplier"), s("Cocoa from Côte d'Ivoire", "CI", -5.5, 6.5, "Supplier")] },
  { id: "unilever", name: "Unilever", ticker: "ULVR.L", hq: "GB", sector: "Consumer goods", about: "Dove, Hellmann's, Knorr: a big buyer of palm oil and soy.",
    revenue: [["US", 22], ["EU", 22], ["IN", 11], ["BR", 6], ["CN", 4]], inputs: [["palm-oil", 0.2], ["soybeans", 0.05], ["oil", 0.05], ["wheat", 0.03]],
    sites: [s("London", "GB", -0.12, 51.51, "HQ"), s("Palm oil from Riau", "ID", 101.45, 0.5, "Supplier"), s("Palm oil from Sabah", "MY", 117.0, 5.5, "Supplier"), s("Mumbai (Hindustan Unilever)", "IN", 72.88, 19.08, "Plant")] },
  { id: "cocacola", name: "Coca-Cola", ticker: "KO", hq: "US", sector: "Drinks", about: "Drinks everywhere; cans need aluminium.",
    revenue: [["US", 35], ["EU", 18], ["MX", 7], ["BR", 5], ["CN", 4]], inputs: [["aluminium", 0.15], ["oil", 0.05]],
    sites: [s("Atlanta", "US", -84.39, 33.77, "HQ"), s("Mexico bottlers (FEMSA)", "MX", -100.3, 25.67, "Partner"), s("Ball can plants (cans)", "US", -105.1, 39.9, "Supplier")] },
  { id: "amazon", name: "Amazon", ticker: "AMZN", hq: "US", sector: "Retail & cloud", about: "Shops and AWS; much of what it sells is made in China.",
    revenue: [["US", 62], ["DE", 7], ["GB", 6], ["JP", 4]], inputs: [["oil", 0.05], ["copper", 0.03]],
    sites: [s("Seattle", "US", -122.34, 47.62, "HQ"), s("Sellers in Shenzhen", "CN", 114.06, 22.54, "Supplier"), s("AWS Northern Virginia", "US", -77.49, 39.04, "Plant")] },
  { id: "walmart", name: "Walmart", ticker: "WMT", hq: "US", sector: "Retail", about: "The biggest retailer; imports much of what's on its shelves.",
    revenue: [["US", 82], ["MX", 7], ["CN", 3], ["CA", 3]], inputs: [["oil", 0.05], ["wheat", 0.03], ["coffee", 0.01]],
    sites: [s("Bentonville", "US", -94.21, 36.37, "HQ"), s("Sourcing office Shenzhen", "CN", 114.06, 22.54, "Supplier"), s("Walmex Mexico City", "MX", -99.13, 19.43, "Plant")] },
  { id: "lvmh", name: "LVMH", ticker: "MC.PA", hq: "FR", sector: "Luxury", about: "Louis Vuitton, Dior, Tiffany; Chinese shoppers drive growth.",
    revenue: [["EU", 24], ["US", 25], ["CN", 25], ["JP", 8]], inputs: [["gold", 0.1], ["silver", 0.02]],
    sites: [s("Paris", "FR", 2.31, 48.87, "HQ"), s("Louis Vuitton workshops, Asnières", "FR", 2.29, 48.91, "Plant"), s("Tiffany diamonds (sourcing)", "BW", 24.7, -22.3, "Supplier")] },
];

export const company = (id: string) => COMPANIES.find((c) => c.id === id);
/** Find a company by ticker or name ("aapl", "Apple"). */
export function findCompany(q: string): Company | undefined {
  const k = q.trim().toLowerCase();
  if (!k) return undefined;
  return COMPANIES.find((c) => c.ticker.toLowerCase() === k || c.ticker.toLowerCase().split(".")[0] === k || c.id === k || c.name.toLowerCase() === k)
    ?? COMPANIES.find((c) => c.name.toLowerCase().startsWith(k));
}
