// Where countries sit on the globe (a representative point, near the middle or
// the economic centre), their names, and a rough political-stability risk used
// to weight supply risk.
//
// Risk: 0 (very stable) to 1 (very unstable), a rounded reading of the World
// Bank's Worldwide Governance Indicators, "Political Stability and Absence of
// Violence" (2022), rescaled. Rough on purpose: it ranks, it doesn't predict.

export interface Country { name: string; lon: number; lat: number; risk: number }

export const COUNTRIES: Record<string, Country> = {
  US: { name: "United States", lon: -98, lat: 39, risk: 0.42 }, CA: { name: "Canada", lon: -106, lat: 56, risk: 0.2 }, MX: { name: "Mexico", lon: -102, lat: 23, risk: 0.62 },
  BR: { name: "Brazil", lon: -51, lat: -12, risk: 0.55 }, AR: { name: "Argentina", lon: -64, lat: -34, risk: 0.45 }, CL: { name: "Chile", lon: -70.6, lat: -27, risk: 0.42 },
  PE: { name: "Peru", lon: -75, lat: -10, risk: 0.58 }, BO: { name: "Bolivia", lon: -64, lat: -17, risk: 0.6 }, CO: { name: "Colombia", lon: -74, lat: 4.6, risk: 0.68 },
  EC: { name: "Ecuador", lon: -78, lat: -1.5, risk: 0.62 }, PA: { name: "Panama", lon: -80, lat: 8.6, risk: 0.4 },
  GB: { name: "United Kingdom", lon: -1.5, lat: 52.5, risk: 0.3 }, FR: { name: "France", lon: 2.4, lat: 46.6, risk: 0.38 }, DE: { name: "Germany", lon: 10.4, lat: 51.2, risk: 0.28 },
  NL: { name: "Netherlands", lon: 5.3, lat: 52.2, risk: 0.24 }, BE: { name: "Belgium", lon: 4.5, lat: 50.6, risk: 0.3 }, CH: { name: "Switzerland", lon: 8.2, lat: 46.8, risk: 0.1 },
  LU: { name: "Luxembourg", lon: 6.1, lat: 49.7, risk: 0.08 }, DK: { name: "Denmark", lon: 9.5, lat: 56, risk: 0.18 }, FI: { name: "Finland", lon: 26, lat: 63, risk: 0.12 },
  NO: { name: "Norway", lon: 9, lat: 61, risk: 0.14 }, PL: { name: "Poland", lon: 19.4, lat: 52, risk: 0.35 }, EE: { name: "Estonia", lon: 25, lat: 58.7, risk: 0.3 },
  IT: { name: "Italy", lon: 12.5, lat: 42.8, risk: 0.36 }, ES: { name: "Spain", lon: -3.7, lat: 40.3, risk: 0.4 }, RU: { name: "Russia", lon: 50, lat: 56, risk: 0.82 },
  BY: { name: "Belarus", lon: 28, lat: 53.7, risk: 0.6 }, KZ: { name: "Kazakhstan", lon: 67, lat: 48, risk: 0.5 }, UZ: { name: "Uzbekistan", lon: 64, lat: 41.4, risk: 0.55 },
  CN: { name: "China", lon: 112, lat: 33, risk: 0.55 }, TW: { name: "Taiwan", lon: 121, lat: 23.7, risk: 0.38 }, JP: { name: "Japan", lon: 138, lat: 36.5, risk: 0.2 },
  KR: { name: "South Korea", lon: 127.8, lat: 36.4, risk: 0.35 }, IN: { name: "India", lon: 78.9, lat: 22, risk: 0.65 }, ID: { name: "Indonesia", lon: 113, lat: -2.5, risk: 0.55 },
  MY: { name: "Malaysia", lon: 102, lat: 4.2, risk: 0.42 }, TH: { name: "Thailand", lon: 101, lat: 15.5, risk: 0.55 }, VN: { name: "Vietnam", lon: 106, lat: 15.8, risk: 0.45 },
  PH: { name: "Philippines", lon: 122, lat: 12.5, risk: 0.65 }, MM: { name: "Myanmar", lon: 96, lat: 21, risk: 0.92 }, MN: { name: "Mongolia", lon: 104, lat: 46.8, risk: 0.35 },
  SG: { name: "Singapore", lon: 103.8, lat: 1.35, risk: 0.08 }, AU: { name: "Australia", lon: 134, lat: -25, risk: 0.22 }, NC: { name: "New Caledonia", lon: 165.6, lat: -21.3, risk: 0.5 },
  SA: { name: "Saudi Arabia", lon: 45, lat: 24, risk: 0.58 }, AE: { name: "UAE", lon: 54.3, lat: 24, risk: 0.3 }, QA: { name: "Qatar", lon: 51.2, lat: 25.3, risk: 0.25 },
  KW: { name: "Kuwait", lon: 47.6, lat: 29.3, risk: 0.38 }, IQ: { name: "Iraq", lon: 44, lat: 33, risk: 0.88 }, IR: { name: "Iran", lon: 53, lat: 32.5, risk: 0.82 },
  IL: { name: "Israel", lon: 34.9, lat: 31.5, risk: 0.72 }, JO: { name: "Jordan", lon: 36.2, lat: 31, risk: 0.55 }, MA: { name: "Morocco", lon: -6.8, lat: 32, risk: 0.5 },
  CD: { name: "DR Congo", lon: 23.6, lat: -3, risk: 0.9 }, ZA: { name: "South Africa", lon: 25, lat: -29, risk: 0.6 }, ZW: { name: "Zimbabwe", lon: 29.8, lat: -19, risk: 0.68 },
  ZM: { name: "Zambia", lon: 27.8, lat: -13.1, risk: 0.45 }, NA: { name: "Namibia", lon: 17, lat: -22.5, risk: 0.35 }, BW: { name: "Botswana", lon: 24.7, lat: -22.3, risk: 0.3 },
  MZ: { name: "Mozambique", lon: 35.5, lat: -17, risk: 0.78 }, MG: { name: "Madagascar", lon: 46.9, lat: -19, risk: 0.6 }, AO: { name: "Angola", lon: 17.9, lat: -11.2, risk: 0.6 },
  GA: { name: "Gabon", lon: 11.6, lat: -0.8, risk: 0.55 }, GN: { name: "Guinea", lon: -10.9, lat: 10.4, risk: 0.75 }, GH: { name: "Ghana", lon: -1.2, lat: 7.9, risk: 0.45 },
  CI: { name: "Côte d'Ivoire", lon: -5.5, lat: 7.5, risk: 0.62 }, CM: { name: "Cameroon", lon: 12.4, lat: 5.7, risk: 0.78 }, NG: { name: "Nigeria", lon: 8.1, lat: 9.6, risk: 0.85 },
  ET: { name: "Ethiopia", lon: 39.6, lat: 8.6, risk: 0.85 }, EG: { name: "Egypt", lon: 30.8, lat: 26.8, risk: 0.62 }, PG: { name: "Papua New Guinea", lon: 145, lat: -6.3, risk: 0.62 }, GY: { name: "Guyana", lon: -58.9, lat: 4.9, risk: 0.45 }, TR: { name: "Türkiye", lon: 35, lat: 39, risk: 0.68 }, EU: { name: "European Union", lon: 8.5, lat: 50, risk: 0.3 },
};

/** Countries named the way the minerals data names them, to their codes. */
const BY_NAME = new Map(Object.entries(COUNTRIES).map(([code, c]) => [c.name.toLowerCase(), code]));
BY_NAME.set("dr congo", "CD").set("congo (kinshasa)", "CD").set("usa", "US").set("uk", "GB").set("korea", "KR").set("ivory coast", "CI");

export const codeOf = (name: string): string | undefined => (COUNTRIES[name] ? name : BY_NAME.get(name.toLowerCase()));
export const countryName = (code: string) => COUNTRIES[code]?.name ?? code;
