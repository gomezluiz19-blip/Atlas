// A demo club to try Sports Pro with: a made-up football club in Belo
// Horizonte playing a national league, where away games run from Porto Alegre
// to Belém. The club, its people, fans' numbers and targets are made up; the
// stadiums and towns are real places.
import { addDays, today } from "../kit/ops";
import { newId } from "../../work/store";
import type { Club, Fixture, TargetStatus } from "./model";

const V = {
  mineirao: { name: "Mineirão, Belo Horizonte", lon: -43.9711, lat: -19.8658 },
  maracana: { name: "Maracanã, Rio de Janeiro", lon: -43.2302, lat: -22.9122 },
  allianz: { name: "Allianz Parque, São Paulo", lon: -46.6785, lat: -23.5275 },
  morumbi: { name: "Morumbi, São Paulo", lon: -46.7203, lat: -23.6003 },
  gremio: { name: "Arena do Grêmio, Porto Alegre", lon: -51.1953, lat: -29.9739 },
  fonteNova: { name: "Arena Fonte Nova, Salvador", lon: -38.5043, lat: -12.9788 },
  castelao: { name: "Castelão, Fortaleza", lon: -38.5225, lat: -3.8072 },
  baixada: { name: "Arena da Baixada, Curitiba", lon: -49.2769, lat: -25.4483 },
  mangueirao: { name: "Mangueirão, Belém", lon: -48.4468, lat: -1.3847 },
};

export function demoClub(): Club {
  const t0 = today();
  const fx = (d: number, opponent: string, home: boolean, venue = V.mineirao, comp = "League"): Fixture => ({ id: newId(), date: addDays(t0, d), opponent, home, venue, comp });
  const fan = (name: string, lon: number, lat: number, members: number) => ({ id: newId(), name, lon, lat, members });
  const tgt = (name: string, position: string, age: number, club: string, lon: number, lat: number, status: TargetStatus, rating: number, notes: string) =>
    ({ id: newId(), name, position, age, club, lon, lat, status, rating, notes, log: [] });
  return {
    id: newId(), name: "Serra Azul FC (demo)", sport: "Football", demo: true, created: Date.now(), party: 42,
    ground: { ...V.mineirao, capacity: 61_000 },
    sites: [
      { id: newId(), name: "Training centre, Vespasiano", kind: "training", lon: -43.923, lat: -19.692 },
      { id: newId(), name: "Youth academy, Sete Lagoas", kind: "academy", lon: -44.247, lat: -19.466 },
      { id: newId(), name: "Club office, Savassi", kind: "office", lon: -43.935, lat: -19.938 },
      { id: newId(), name: "Community football, Barreiro", kind: "community", lon: -44.023, lat: -19.976 },
    ],
    fixtures: [
      fx(3, "Rio side", false, V.maracana),
      fx(7, "Salvador side", true),
      fx(10, "Porto Alegre side", false, V.gremio),
      fx(13, "Fortaleza side", false, V.castelao),
      fx(17, "São Paulo side", true),
      fx(21, "Curitiba side", false, V.baixada, "Cup"),
      fx(24, "Belém side", false, V.mangueirao),
      fx(28, "Rio side", true),
      fx(31, "São Paulo side", false, V.allianz),
      fx(35, "Salvador side", false, V.fonteNova),
      fx(38, "Curitiba side", true, V.mineirao, "Cup"),
      fx(42, "São Paulo side", false, V.morumbi),
    ],
    fans: [
      fan("Barreiro", -44.023, -19.976, 14_000), fan("Venda Nova", -43.96, -19.81, 11_500), fan("Contagem", -44.053, -19.932, 12_800),
      fan("Betim", -44.198, -19.967, 7_600), fan("Nova Lima", -43.847, -19.985, 3_900), fan("Sabará", -43.806, -19.884, 3_100),
      fan("Sete Lagoas", -44.247, -19.466, 4_200), fan("Ipatinga", -42.537, -19.468, 2_600), fan("Juiz de Fora", -43.35, -21.764, 2_300),
      fan("Montes Claros", -43.861, -16.735, 1_900), fan("São Paulo supporters' club", -46.633, -23.55, 1_700), fan("Rio supporters' club", -43.2, -22.9, 1_100),
      fan("Brasília supporters' club", -47.88, -15.79, 950), fan("Boston diaspora group", -71.06, 42.36, 420), fan("Lisbon diaspora group", -9.14, 38.72, 310),
    ],
    targets: [
      tgt("Mateo Ruiz (demo)", "Winger", 21, "a club in Montevideo", -56.16, -34.9, "shortlist", 7.6, "Quick, two-footed; 9 goals this season."),
      tgt("Diego Benítez (demo)", "Centre-back", 24, "a club in Asunción", -57.63, -25.28, "bid", 7.2, "Strong in the air; contract ends in June."),
      tgt("Samuel Okafor (demo)", "Striker", 19, "a club in Lagos", 3.39, 6.45, "watch", 7.0, "Scouted at a youth tournament; needs a work permit plan."),
      tgt("Lucas Andrade (demo)", "Goalkeeper", 27, "a club in Recife", -34.88, -8.05, "shortlist", 7.1, "Commanding; good with his feet."),
      tgt("Kenji Mori (demo)", "Midfielder", 23, "a club in Osaka", 135.5, 34.69, "watch", 6.9, "Tempo-setter; would need time to adapt."),
      tgt("Felipe Costa (demo)", "Full-back", 20, "the club's academy", -44.247, -19.466, "signed", 7.3, "Promoted to the first team this month."),
    ],
    parties: [
      { id: newId(), name: "Main shirt sponsor (demo)", kind: "sponsor", mood: "positive", log: [{ at: addDays(t0, -12), text: "Renewal talks: want more hospitality seats." }] },
      { id: newId(), name: "Organised supporters' group (demo)", kind: "supporters", mood: "concerned", lon: -44.023, lat: -19.976, log: [{ at: addDays(t0, -5), text: "Unhappy with ticket prices for the cup game." }] },
      { id: newId(), name: "Military Police match-day command", kind: "council", mood: "neutral", lon: -43.97, lat: -19.87, log: [] },
      { id: newId(), name: "State federation", kind: "league", mood: "ally", log: [] },
    ],
  };
}
