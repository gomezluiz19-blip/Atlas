// Policies that move raw materials and the companies built on them: export
// bans and controls, carbon border taxes, tariffs, nationalisations, sourcing
// rules. Each names the countries it comes from, the materials and sectors it
// touches, and whether it squeezes supply (prices up for buyers) or raises costs.
//
// Compiled from government announcements as widely reported, as of late 2025.
// Policies change often: dates and status are a starting point to check, not
// advice. "proposed" means announced but not yet in force.

export type PolicyStatus = "in force" | "phasing in" | "proposed";
export interface Policy {
  id: string;
  title: string;
  /** Where it comes from (ISO2 or "EU"). */
  where: string[];
  since: string;
  status: PolicyStatus;
  what: string;
  /** Raw materials it touches (market ids). */
  materials: string[];
  /** Sectors it touches (free words matched against company sectors). */
  sectors?: string[];
  /** Countries whose sales or plants it bites on, if not just `where`. */
  bites?: string[];
  /** 1 (watch) to 3 (big). */
  weight: 1 | 2 | 3;
}

export const POLICIES: Policy[] = [
  { id: "cn-ree-2025", title: "China licenses exports of seven rare earths", where: ["CN"], since: "Apr 2025", status: "in force", weight: 3,
    what: "Exports of samarium, gadolinium, terbium, dysprosium, lutetium, scandium and yttrium (and magnets made with them) need a licence; shipments stalled for weeks.", materials: ["rare-earths"], sectors: ["Cars", "Electric vehicles", "Wind power", "Power equipment", "Tech hardware"] },
  { id: "cn-graphite", title: "China controls graphite exports", where: ["CN"], since: "Dec 2023", status: "in force", weight: 2,
    what: "Licences needed for natural and synthetic graphite used in battery anodes.", materials: ["graphite"], sectors: ["Electric vehicles", "Batteries"] },
  { id: "cn-gallium", title: "China bans gallium, germanium and antimony exports to the US", where: ["CN"], since: "Dec 2024", status: "in force", weight: 2,
    what: "Controls since 2023 tightened into a ban on shipments to the US; chips, defence and solar feel it.", materials: [], sectors: ["Semiconductors", "Chip equipment"], bites: ["US"] },
  { id: "cn-ree-tech", title: "China bans exporting rare-earth processing know-how", where: ["CN"], since: "Dec 2023", status: "in force", weight: 2,
    what: "Separation and magnet-making technology can't be exported, slowing new refineries elsewhere.", materials: ["rare-earths"] },
  { id: "id-nickel", title: "Indonesia bans nickel ore exports", where: ["ID"], since: "Jan 2020", status: "in force", weight: 3,
    what: "Ore must be processed at home: Indonesia went from mine to the world's biggest nickel refiner, mostly with Chinese partners.", materials: ["nickel"], sectors: ["Batteries", "Steel", "Electric vehicles"] },
  { id: "id-bauxite", title: "Indonesia bans bauxite ore exports", where: ["ID"], since: "Jun 2023", status: "in force", weight: 1,
    what: "Bauxite must be refined into alumina locally.", materials: ["aluminium"] },
  { id: "cd-cobalt", title: "DR Congo halts, then caps, cobalt exports", where: ["CD"], since: "Feb 2025", status: "in force", weight: 3,
    what: "Exports suspended to lift prices, then replaced by yearly quotas: three-quarters of the world's cobalt comes from Congo.", materials: ["cobalt"], sectors: ["Batteries", "Electric vehicles", "Tech hardware"] },
  { id: "cl-lithium", title: "Chile's National Lithium Strategy", where: ["CL"], since: "Apr 2023", status: "phasing in", weight: 2,
    what: "The state takes majority control of new lithium projects; Codelco partners with SQM in the Atacama from 2025.", materials: ["lithium"] },
  { id: "mx-lithium", title: "Mexico nationalises lithium", where: ["MX"], since: "Apr 2022", status: "in force", weight: 1,
    what: "Lithium belongs to the state company LitioMx; foreign concessions were cancelled.", materials: ["lithium"] },
  { id: "zw-lithium", title: "Zimbabwe bans raw lithium ore exports", where: ["ZW"], since: "Dec 2022", status: "in force", weight: 1,
    what: "Only concentrate can leave; a ban on concentrate is planned for 2027.", materials: ["lithium"] },
  { id: "gn-licences", title: "Guinea revokes mining licences", where: ["GN"], since: "2025", status: "in force", weight: 2,
    what: "Dozens of bauxite, gold and other licences revoked to push local refining; Guinea mines a quarter of the world's bauxite.", materials: ["aluminium", "gold"] },
  { id: "pa-cobre", title: "Panama shuts the Cobre Panamá copper mine", where: ["PA"], since: "Nov 2023", status: "in force", weight: 2,
    what: "After protests and a court ruling, one of the world's newest big copper mines stopped: about 1.5% of world supply.", materials: ["copper"] },
  { id: "eu-cbam", title: "EU carbon border tax (CBAM)", where: ["EU"], since: "Jan 2026", status: "phasing in", weight: 3,
    what: "Importers of steel, aluminium, cement, fertilisers and hydrogen pay for their carbon like EU makers do; reporting since 2023, paying from 2026.", materials: ["iron", "aluminium", "phosphate", "potash"], sectors: ["Steel", "Mining", "Fertiliser"], bites: ["CN", "IN", "RU", "TR", "ZA"] },
  { id: "eu-crma", title: "EU Critical Raw Materials Act", where: ["EU"], since: "May 2024", status: "phasing in", weight: 1,
    what: "Targets for 2030: mine 10%, refine 40% and recycle 25% of strategic materials in the EU, and no more than 65% from any one country.", materials: ["lithium", "cobalt", "nickel", "rare-earths", "graphite", "copper"] },
  { id: "eu-eudr", title: "EU deforestation rules (EUDR)", where: ["EU"], since: "Dec 2025", status: "proposed", weight: 2,
    what: "Cocoa, coffee, palm oil, soy, cattle, rubber and wood sold in the EU must be proven deforestation-free; delayed once already, check the latest date.", materials: ["cocoa", "coffee", "palm-oil", "soybeans"], sectors: ["Food", "Consumer goods"], bites: ["CI", "GH", "BR", "ID", "MY", "VN"] },
  { id: "us-232", title: "US 50% tariffs on steel and aluminium", where: ["US"], since: "Jun 2025", status: "in force", weight: 2,
    what: "Section 232 tariffs raised from 25% to 50% on most imported steel and aluminium.", materials: ["iron", "aluminium"], sectors: ["Cars", "Machinery", "Drinks"], bites: ["CA", "MX", "BR", "KR", "EU"] },
  { id: "us-copper", title: "US 50% tariff on copper products", where: ["US"], since: "Aug 2025", status: "in force", weight: 1,
    what: "Semi-finished copper (pipe, wire, sheet) pays 50%; refined copper cathode is exempt for now.", materials: ["copper"], bites: ["CL", "CA", "PE"] },
  { id: "us-ev-credit", title: "US ends EV tax credits", where: ["US"], since: "Sep 2025", status: "in force", weight: 2,
    what: "Consumer credits for new and used electric cars ended on 30 September 2025.", materials: ["lithium"], sectors: ["Electric vehicles", "Batteries"] },
  { id: "us-chips", title: "US controls on advanced chips to China", where: ["US"], since: "Oct 2022", status: "in force", weight: 3,
    what: "Advanced AI chips and chipmaking tools need licences to ship to China, tightened several times since.", materials: [], sectors: ["Semiconductors", "Chip equipment"], bites: ["CN"] },
  { id: "g7-oil-cap", title: "G7 price cap on Russian oil", where: ["EU", "US", "GB", "JP", "CA"], since: "Dec 2022", status: "in force", weight: 2,
    what: "Western shipping and insurance only for Russian crude sold below the cap; the EU lowered it in 2025.", materials: ["oil"], bites: ["RU"] },
  { id: "ca-divest", title: "Canada orders Chinese firms out of its lithium miners", where: ["CA"], since: "Nov 2022", status: "in force", weight: 1,
    what: "Foreign state-owned investment in critical minerals faces a high bar.", materials: ["lithium"] },
  { id: "ci-gh-lid", title: "Côte d'Ivoire and Ghana's cocoa premium", where: ["CI", "GH"], since: "Oct 2019", status: "in force", weight: 1,
    what: "A $400/t Living Income Differential on top of the price, to raise farmers' pay.", materials: ["cocoa"], sectors: ["Food"] },
];

/** Policies that touch a raw material. */
export const policiesFor = (materialId: string) => POLICIES.filter((p) => p.materials.includes(materialId));
