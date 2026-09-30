// The world's main cargo ports, with their UN/LOCODE and country: enough to
// type "Rotterdam" or "CNSHA" and get the right place. Anything else can be
// found by name in the bundled port list or by geocoding.
import type { Port } from "./model";

const row = (code: string, name: string, country: string, lon: number, lat: number): Port => ({ code, name, country, lon, lat });
export const PORTS: Port[] = [
  row("CNSHA", "Shanghai", "China", 121.8, 31.0), row("CNNGB", "Ningbo-Zhoushan", "China", 121.9, 29.9), row("CNYTN", "Shenzhen (Yantian)", "China", 114.3, 22.55),
  row("CNCAN", "Guangzhou (Nansha)", "China", 113.6, 22.7), row("CNTAO", "Qingdao", "China", 120.3, 36.05), row("CNTXG", "Tianjin", "China", 117.8, 39.0),
  row("CNXMN", "Xiamen", "China", 118.05, 24.45), row("HKHKG", "Hong Kong", "China", 114.1, 22.3), row("TWKHH", "Kaohsiung", "Taiwan", 120.3, 22.6),
  row("KRPUS", "Busan", "South Korea", 129.05, 35.1), row("JPYOK", "Yokohama", "Japan", 139.65, 35.45), row("JPTYO", "Tokyo", "Japan", 139.8, 35.6),
  row("SGSIN", "Singapore", "Singapore", 103.8, 1.26), row("MYTPP", "Tanjung Pelepas", "Malaysia", 103.55, 1.36), row("MYPKG", "Port Klang", "Malaysia", 101.35, 3.0),
  row("VNSGN", "Ho Chi Minh City (Cai Mep)", "Vietnam", 107.05, 10.5), row("THLCH", "Laem Chabang", "Thailand", 100.9, 13.08), row("IDTPP", "Jakarta (Tanjung Priok)", "Indonesia", 106.9, -6.1),
  row("PHMNL", "Manila", "Philippines", 120.95, 14.6), row("LKCMB", "Colombo", "Sri Lanka", 79.85, 6.95), row("INNSA", "Nhava Sheva (Mumbai)", "India", 72.95, 18.95),
  row("INMUN", "Mundra", "India", 69.7, 22.75), row("INMAA", "Chennai", "India", 80.3, 13.1), row("BDCGP", "Chittagong", "Bangladesh", 91.8, 22.3),
  row("PKKHI", "Karachi", "Pakistan", 66.98, 24.83), row("AEJEA", "Jebel Ali (Dubai)", "United Arab Emirates", 55.03, 25.0), row("OMSLL", "Salalah", "Oman", 54.0, 16.95),
  row("SAJED", "Jeddah", "Saudi Arabia", 39.15, 21.45), row("DJJIB", "Djibouti", "Djibouti", 43.13, 11.6), row("EGPSD", "Port Said", "Egypt", 32.3, 31.25),
  row("KEMBA", "Mombasa", "Kenya", 39.65, -4.05), row("TZDAR", "Dar es Salaam", "Tanzania", 39.3, -6.83), row("ZADUR", "Durban", "South Africa", 31.03, -29.87),
  row("ZACPT", "Cape Town", "South Africa", 18.43, -33.9), row("NGAPP", "Lagos (Apapa)", "Nigeria", 3.37, 6.44), row("GHTEM", "Tema", "Ghana", 0.0, 5.63),
  row("CIABJ", "Abidjan", "Côte d'Ivoire", -4.02, 5.28), row("SNDKR", "Dakar", "Senegal", -17.43, 14.68), row("MAPTM", "Tanger Med", "Morocco", -5.5, 35.88),
  row("ESALG", "Algeciras", "Spain", -5.43, 36.13), row("ESVLC", "Valencia", "Spain", -0.32, 39.44), row("ESBCN", "Barcelona", "Spain", 2.16, 41.35),
  row("ITGOA", "Genoa", "Italy", 8.9, 44.4), row("ITGIT", "Gioia Tauro", "Italy", 15.9, 38.45), row("GRPIR", "Piraeus", "Greece", 23.6, 37.95),
  row("TRMER", "Mersin", "Turkey", 34.64, 36.8), row("TRIST", "Istanbul (Ambarli)", "Turkey", 28.68, 40.97), row("MTMAR", "Marsaxlokk", "Malta", 14.54, 35.83),
  row("FRLEH", "Le Havre", "France", 0.15, 49.47), row("BEANR", "Antwerp-Bruges", "Belgium", 4.4, 51.25), row("NLRTM", "Rotterdam", "Netherlands", 4.05, 51.95),
  row("DEHAM", "Hamburg", "Germany", 9.97, 53.55), row("DEBRV", "Bremerhaven", "Germany", 8.55, 53.55), row("GBFXT", "Felixstowe", "United Kingdom", 1.32, 51.95),
  row("GBSOU", "Southampton", "United Kingdom", -1.43, 50.9), row("GBLGP", "London Gateway", "United Kingdom", 0.47, 51.5), row("DKAAR", "Aarhus", "Denmark", 10.23, 56.15),
  row("SEGOT", "Gothenburg", "Sweden", 11.85, 57.7), row("PLGDN", "Gdańsk", "Poland", 18.7, 54.4), row("FIHEL", "Helsinki (Vuosaari)", "Finland", 25.2, 60.2),
  row("EETLL", "Tallinn (Muuga)", "Estonia", 25.0, 59.5), row("USNYC", "New York / New Jersey", "United States", -74.1, 40.67), row("USSAV", "Savannah", "United States", -81.1, 32.1),
  row("USCHS", "Charleston", "United States", -79.9, 32.78), row("USORF", "Norfolk", "United States", -76.3, 36.9), row("USHOU", "Houston", "United States", -95.0, 29.6),
  row("USMSY", "New Orleans", "United States", -90.05, 29.93), row("USMIA", "Miami", "United States", -80.17, 25.78), row("USLAX", "Los Angeles", "United States", -118.26, 33.73),
  row("USLGB", "Long Beach", "United States", -118.2, 33.75), row("USOAK", "Oakland", "United States", -122.3, 37.8), row("USSEA", "Seattle", "United States", -122.35, 47.6),
  row("CAVAN", "Vancouver", "Canada", -123.1, 49.3), row("CAPRR", "Prince Rupert", "Canada", -130.35, 54.3), row("CAHAL", "Halifax", "Canada", -63.55, 44.63),
  row("CAMTR", "Montreal", "Canada", -73.55, 45.55), row("MXZLO", "Manzanillo", "Mexico", -104.3, 19.05), row("MXVER", "Veracruz", "Mexico", -96.13, 19.2),
  row("PAMIT", "Manzanillo (Colón)", "Panama", -79.88, 9.37), row("PABLB", "Balboa", "Panama", -79.57, 8.95), row("COCTG", "Cartagena", "Colombia", -75.53, 10.4),
  row("JMKIN", "Kingston", "Jamaica", -76.8, 17.97), row("PECLL", "Callao", "Peru", -77.15, -12.05), row("CLSAI", "San Antonio", "Chile", -71.62, -33.58),
  row("CLVAP", "Valparaíso", "Chile", -71.62, -33.03), row("ECGYE", "Guayaquil", "Ecuador", -79.9, -2.28), row("BRSSZ", "Santos", "Brazil", -46.3, -23.95),
  row("BRPNG", "Paranaguá", "Brazil", -48.5, -25.5), row("BRRIG", "Rio Grande", "Brazil", -52.08, -32.05), row("ARBUE", "Buenos Aires", "Argentina", -58.37, -34.58),
  row("UYMVD", "Montevideo", "Uruguay", -56.21, -34.9), row("AUMEL", "Melbourne", "Australia", 144.92, -37.84), row("AUSYD", "Sydney (Botany)", "Australia", 151.21, -33.97),
  row("AUBNE", "Brisbane", "Australia", 153.17, -27.38), row("AUFRE", "Fremantle", "Australia", 115.74, -32.05), row("AUPHE", "Port Hedland", "Australia", 118.58, -20.3),
  row("NZAKL", "Auckland", "New Zealand", 174.78, -36.84), row("NZTRG", "Tauranga", "New Zealand", 176.18, -37.65), row("RUNVS", "Novorossiysk", "Russia", 37.8, 44.72),
  row("RUULU", "Ust-Luga", "Russia", 28.4, 59.68), row("IRBND", "Bandar Abbas", "Iran", 56.2, 27.15), row("UAODS", "Odesa", "Ukraine", 30.75, 46.5),
  row("QAHMD", "Hamad", "Qatar", 51.63, 25.0), row("BRTUB", "Tubarão (Vitória)", "Brazil", -40.25, -20.28), row("AUNTL", "Newcastle", "Australia", 151.78, -32.92),
];

/** Find a port by name or UN/LOCODE (pure). */
export function findPort(q: string, extra: Port[] = []): Port | undefined {
  const s = q.trim().toLowerCase();
  if (!s) return undefined;
  const all = [...PORTS, ...extra];
  return all.find((p) => p.code?.toLowerCase() === s) ?? all.find((p) => p.name.toLowerCase() === s) ?? all.find((p) => p.name.toLowerCase().startsWith(s)) ?? all.find((p) => p.name.toLowerCase().includes(s));
}
