// Places for geography games and quizzes: capital cities and famous places.
export interface GamePlace { name: string; hint: string; lon: number; lat: number }

const c = (name: string, country: string, lat: number, lon: number): GamePlace => ({ name, hint: `capital of ${country}`, lat, lon });
const l = (name: string, hint: string, lat: number, lon: number): GamePlace => ({ name, hint, lat, lon });

export const CAPITALS: GamePlace[] = [
  c("London", "the United Kingdom", 51.507, -0.128), c("Paris", "France", 48.857, 2.352), c("Madrid", "Spain", 40.417, -3.704),
  c("Lisbon", "Portugal", 38.722, -9.139), c("Rome", "Italy", 41.903, 12.496), c("Berlin", "Germany", 52.52, 13.405),
  c("Warsaw", "Poland", 52.23, 21.012), c("Stockholm", "Sweden", 59.329, 18.069), c("Oslo", "Norway", 59.914, 10.752),
  c("Helsinki", "Finland", 60.17, 24.938), c("Athens", "Greece", 37.984, 23.728), c("Ankara", "Türkiye", 39.934, 32.86),
  c("Moscow", "Russia", 55.756, 37.617), c("Kyiv", "Ukraine", 50.45, 30.523), c("Cairo", "Egypt", 30.044, 31.236),
  c("Nairobi", "Kenya", -1.286, 36.817), c("Addis Ababa", "Ethiopia", 9.03, 38.74), c("Abuja", "Nigeria", 9.076, 7.399),
  c("Accra", "Ghana", 5.604, -0.187), c("Dakar", "Senegal", 14.716, -17.467), c("Pretoria", "South Africa", -25.747, 28.229),
  c("Kinshasa", "DR Congo", -4.441, 15.266), c("Rabat", "Morocco", 34.02, -6.842), c("Riyadh", "Saudi Arabia", 24.713, 46.675),
  c("Tehran", "Iran", 35.689, 51.389), c("New Delhi", "India", 28.614, 77.209), c("Islamabad", "Pakistan", 33.684, 73.048),
  c("Dhaka", "Bangladesh", 23.81, 90.412), c("Beijing", "China", 39.904, 116.407), c("Tokyo", "Japan", 35.68, 139.769),
  c("Seoul", "South Korea", 37.567, 126.978), c("Bangkok", "Thailand", 13.756, 100.502), c("Hanoi", "Vietnam", 21.028, 105.854),
  c("Jakarta", "Indonesia", -6.2, 106.817), c("Manila", "the Philippines", 14.6, 120.984), c("Canberra", "Australia", -35.281, 149.13),
  c("Wellington", "New Zealand", -41.287, 174.776), c("Ottawa", "Canada", 45.421, -75.697), c("Washington, D.C.", "the United States", 38.907, -77.037),
  c("Mexico City", "Mexico", 19.433, -99.133), c("Havana", "Cuba", 23.113, -82.366), c("Santo Domingo", "the Dominican Republic", 18.486, -69.931),
  c("Bogotá", "Colombia", 4.711, -74.072), c("Lima", "Peru", -12.046, -77.043), c("Quito", "Ecuador", -0.18, -78.468),
  c("Brasília", "Brazil", -15.794, -47.882), c("Buenos Aires", "Argentina", -34.604, -58.382), c("Santiago", "Chile", -33.449, -70.669),
  c("Caracas", "Venezuela", 10.48, -66.904), c("Reykjavík", "Iceland", 64.147, -21.942),
];

export const LANDMARKS: GamePlace[] = [
  l("Mount Everest", "the world's highest mountain", 27.988, 86.925), l("The Grand Canyon", "a mile-deep canyon in Arizona", 36.107, -112.113),
  l("The Great Pyramid of Giza", "the last standing Wonder of the Ancient World", 29.979, 31.134), l("Machu Picchu", "an Inca citadel in the Andes", -13.163, -72.545),
  l("The Great Barrier Reef", "the largest coral reef system", -18.286, 147.7), l("Victoria Falls", "a waterfall between Zambia and Zimbabwe", -17.925, 25.857),
  l("The Eiffel Tower", "Paris's iron tower", 48.858, 2.294), l("The Taj Mahal", "a marble mausoleum in Agra", 27.175, 78.042),
  l("Mount Kilimanjaro", "Africa's highest mountain", -3.068, 37.355), l("The Amazon River mouth", "where the Amazon meets the Atlantic", -0.5, -50),
  l("Angkor Wat", "the largest religious monument", 13.412, 103.867), l("Uluru", "a sandstone monolith in central Australia", -25.345, 131.036),
  l("The Colosseum", "Rome's ancient amphitheatre", 41.89, 12.492), l("Mount Fuji", "Japan's highest volcano", 35.361, 138.727),
  l("Niagara Falls", "falls between Canada and the US", 43.083, -79.074), l("Petra", "a city carved into rock in Jordan", 30.328, 35.444),
  l("The Dead Sea", "the lowest land on Earth", 31.5, 35.5), l("Chichén Itzá", "a Maya city in Yucatán", 20.684, -88.568),
  l("The Galápagos Islands", "where Darwin studied finches", -0.8, -91), l("Lake Baikal", "the deepest lake", 53.5, 108),
];

/** Regions to frame "Time traveller" rounds, with the years worth looking at there. */
export const HISTORY_VIEWS = [
  { name: "Europe", lon: 15, lat: 48, height: 5_500_000 },
  { name: "The Mediterranean", lon: 18, lat: 37, height: 5_000_000 },
  { name: "The Middle East", lon: 45, lat: 30, height: 5_500_000 },
  { name: "East Asia", lon: 112, lat: 34, height: 7_000_000 },
  { name: "South Asia", lon: 78, lat: 22, height: 5_500_000 },
  { name: "The Americas", lon: -80, lat: 10, height: 14_000_000 },
  { name: "Africa", lon: 18, lat: 3, height: 10_000_000 },
];
