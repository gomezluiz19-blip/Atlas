// Every field of work, read the same simple way (docs/work-design.md):
//   1. The field (Food): anything to do with it, live on the map around you, for anyone.
//   2. The field's Pro (Food Pro): your own work in it, as a map you run: sites, customers, orders, deliveries,
//      jobs and equipment, what needs you, and your HQ as a 3D model.
//   3. The field's services (Food services): every kind of company that serves it, not one niche: for food that's
//      distributors and growers, kitchens and refrigeration, cleaning, pest control, waste, linen, packaging,
//      payments, delivery, staff, inspection, insurance, legal, marketing and the rest; each found on the map.
// Map categories are OpenStreetMap tags in a short form: "amenity=restaurant|cafe; shop=bakery" is any of
// those; a comma joins conditions that must all hold ("office=company,company=food"). Services without a tag
// in OpenStreetMap still list, and are found with a map search instead. Pure data and helpers, so it's tested.
import type { Kind } from "../desk/model";

export interface Cat {
  label: string;
  /** OpenStreetMap tags, short form (above); none means search by name only. */
  tags?: string;
  /** What to search for when OpenStreetMap doesn't tag it (defaults to the label). */
  q?: string;
}
export interface FieldDef {
  everyday: { about: string; cats: Cat[] };
  pro: { about: string; names?: Partial<Record<Kind, string>> };
  services: { about: string; cats: Cat[] };
}

// ---- Services every field shares (an accountant serves a kitchen and a mine alike) ----
const C: Record<string, Cat> = {
  accounting: { label: "Accountants and bookkeeping", tags: "office=accountant|tax_advisor" },
  insurance: { label: "Insurance", tags: "office=insurance" },
  legal: { label: "Lawyers and licensing", tags: "office=lawyer|notary" },
  staffing: { label: "Staffing and recruitment", tags: "office=employment_agency" },
  marketing: { label: "Marketing and design", tags: "office=advertising_agency|graphic_design; craft=signmaker" },
  photo: { label: "Photography and video", tags: "craft=photographer; shop=photo" },
  it: { label: "IT, software and repair", tags: "office=it|telecommunication; shop=computer" },
  security: { label: "Security and alarms", tags: "office=security; shop=security" },
  cleaning: { label: "Cleaning", tags: "craft=cleaning; office=cleaning", q: "commercial cleaning" },
  waste: { label: "Waste and recycling", tags: "amenity=recycling,recycling_type=centre; office=waste_management", q: "commercial waste collection" },
  couriers: { label: "Couriers and post", tags: "amenity=post_office; office=courier|logistics" },
  printing: { label: "Printing and signs", tags: "shop=copyshop; craft=printer|signmaker" },
  electric: { label: "Electricians", tags: "craft=electrician" },
  plumbing: { label: "Plumbers and heating", tags: "craft=plumber|hvac|heating_engineer" },
  builders: { label: "Builders and fit-out", tags: "craft=builder|carpenter; office=construction_company" },
  banks: { label: "Banks and payments", tags: "amenity=bank; office=financial|financial_advisor" },
  consult: { label: "Consultants and advisers", tags: "office=consulting" },
  moving: { label: "Movers and storage", tags: "office=moving_company; shop=storage_rental" },
  engineers: { label: "Engineers", tags: "office=engineer" },
  surveyors: { label: "Surveyors", tags: "office=surveyor" },
  uniforms: { label: "Uniforms and workwear", tags: "shop=clothes,clothes=workwear", q: "workwear uniforms" },
};
const c = (...k: string[]) => k.map((x) => C[x]);

export const FIELDS: Record<string, FieldDef> = {
  food: {
    everyday: { about: "Places to eat and drink, markets, bakeries and the farms and producers around you", cats: [
      { label: "Restaurants", tags: "amenity=restaurant" }, { label: "Cafés", tags: "amenity=cafe" }, { label: "Fast food and takeaway", tags: "amenity=fast_food|food_court" },
      { label: "Bars and pubs", tags: "amenity=bar|pub|biergarten" }, { label: "Markets", tags: "amenity=marketplace" }, { label: "Bakeries and delis", tags: "shop=bakery|deli|pastry|confectionery" },
      { label: "Grocers and supermarkets", tags: "shop=supermarket|greengrocer|convenience|butcher|seafood" }, { label: "Farms and producers", tags: "shop=farm; landuse=farmyard; craft=brewery|winery|distillery|cheese_maker" },
    ] },
    pro: { about: "Your restaurants, cafés or kitchens, suppliers, deliveries, staff and equipment, on one map", names: { site: "Locations", client: "Customers and accounts", order: "Orders", shipment: "Deliveries", job: "Jobs and repairs", case: "Inspections and licences", visit: "Visits and tastings", asset: "Equipment", staff: "Staff" } },
    services: { about: "Every kind of company that serves food businesses", cats: [
      { label: "Food distributors and wholesalers", tags: "shop=wholesale; office=wholesale", q: "food wholesaler" },
      { label: "Produce, meat and fish suppliers", tags: "shop=greengrocer|butcher|seafood,wholesale=yes", q: "produce supplier restaurant" },
      { label: "Bakery and dairy suppliers", tags: "craft=bakery|cheese_maker|dairy", q: "bakery supplier wholesale" },
      { label: "Drinks distributors and breweries", tags: "shop=beverages|wine|alcohol; craft=brewery|winery|distillery" },
      { label: "Coffee roasters and tea", tags: "craft=coffee_roaster; shop=coffee|tea" },
      { label: "Commercial kitchens and equipment", tags: "shop=kitchen|catering_supplies|appliance", q: "commercial kitchen equipment" },
      { label: "Refrigeration and cold rooms", tags: "craft=refrigeration", q: "commercial refrigeration" },
      { label: "Pest control", tags: "office=pest_control; craft=pest_control", q: "pest control" },
      { label: "Grease traps and oil collection", q: "grease trap cleaning used cooking oil collection" },
      { label: "Linen and laundry", tags: "shop=laundry|dry_cleaning", q: "restaurant linen service" },
      { label: "Packaging and takeaway supplies", tags: "shop=packaging", q: "food packaging supplier" },
      { label: "Point of sale and payments", q: "restaurant point of sale" },
      { label: "Delivery and couriers", tags: "office=courier; amenity=post_office", q: "food delivery service" },
      { label: "Catering hire and events", tags: "craft=caterer; shop=party", q: "catering equipment hire" },
      { label: "Food safety, labs and inspection", tags: "office=laboratory|government,government=food_safety", q: "food safety consultant" },
      { label: "Furniture, tableware and fit-out", tags: "shop=furniture|houseware|interior_decoration" },
      { label: "Gas, water and utilities", tags: "office=energy_supplier|water_utility", q: "commercial gas engineer" },
      { label: "Music and licensing", q: "music licence for business" },
      ...c("cleaning", "waste", "staffing", "uniforms", "marketing", "photo", "accounting", "insurance", "legal", "security", "electric", "plumbing", "builders", "it", "banks", "consult"),
    ] },
  },
  retail: {
    everyday: { about: "Shops, malls and markets around you", cats: [
      { label: "Malls and department stores", tags: "shop=mall|department_store" }, { label: "Groceries", tags: "shop=supermarket|convenience|greengrocer" },
      { label: "Clothes and shoes", tags: "shop=clothes|shoes|boutique" }, { label: "Home and hardware", tags: "shop=hardware|doityourself|furniture|houseware" },
      { label: "Electronics", tags: "shop=electronics|mobile_phone|computer" }, { label: "Books, gifts and toys", tags: "shop=books|gift|toys|stationery" }, { label: "Markets", tags: "amenity=marketplace" },
    ] },
    pro: { about: "Your stores, stock, suppliers, deliveries and fixtures, on one map", names: { site: "Stores", client: "Accounts", order: "Orders", shipment: "Deliveries", asset: "Fixtures and equipment", case: "Leases and licences", job: "Jobs", visit: "Visits" } },
    services: { about: "Every kind of company that serves shops", cats: [
      { label: "Wholesalers and distributors", tags: "shop=wholesale; office=wholesale" }, { label: "Shop fitting and fixtures", tags: "shop=shop_fittings; craft=carpenter", q: "shop fitters" },
      { label: "Point of sale and payments", q: "retail point of sale" }, { label: "Packaging and bags", tags: "shop=packaging" }, { label: "Visual merchandising", q: "visual merchandising" },
      { label: "Retail refrigeration", tags: "craft=refrigeration" }, { label: "Logistics and fulfilment", tags: "office=logistics; industrial=warehouse" },
      ...c("couriers", "security", "cleaning", "waste", "staffing", "uniforms", "marketing", "printing", "photo", "accounting", "insurance", "legal", "electric", "builders", "it", "banks", "consult"),
    ] },
  },
  fashion: {
    everyday: { about: "Fashion streets, boutiques and makers around you", cats: [
      { label: "Boutiques", tags: "shop=clothes|boutique" }, { label: "Shoes and bags", tags: "shop=shoes|bag|leather" }, { label: "Jewellery and watches", tags: "shop=jewelry|watches" },
      { label: "Tailors and alterations", tags: "craft=tailor|dressmaker; shop=tailor" }, { label: "Vintage and second-hand", tags: "shop=second_hand|charity" }, { label: "Fabric and haberdashery", tags: "shop=fabric|sewing|haberdashery" },
    ] },
    pro: { about: "Your stores, studio, makers, samples, orders and stockists, on one map", names: { site: "Stores and studio", client: "Stockists and buyers", order: "Orders", shipment: "Shipments", job: "Production runs", case: "Shows and contracts", visit: "Fittings and visits", asset: "Equipment" } },
    services: { about: "Every kind of company that serves fashion", cats: [
      { label: "Mills and fabric suppliers", tags: "shop=fabric; craft=weaver", q: "textile mill fabric supplier" }, { label: "Factories and workrooms", tags: "craft=tailor|dressmaker|shoemaker", q: "garment manufacturer" },
      { label: "Tanneries and leather", tags: "craft=tanner|leather; shop=leather" }, { label: "Pattern cutting and sampling", q: "pattern cutter sample room" }, { label: "Printing and embroidery", tags: "craft=embroiderer|printer", q: "textile printing embroidery" },
      { label: "Sewing and textile machinery", tags: "shop=sewing", q: "sewing machine dealer" }, { label: "Models and casting", q: "model agency" }, { label: "Showrooms and agents", q: "fashion showroom agent" },
      { label: "PR and press", tags: "office=advertising_agency", q: "fashion PR agency" }, { label: "Logistics and fulfilment", tags: "office=logistics" },
      ...c("photo", "couriers", "printing", "accounting", "insurance", "legal", "staffing", "it", "banks", "consult"),
    ] },
  },
  art: {
    everyday: { about: "Museums, galleries, studios and performance around you", cats: [
      { label: "Museums", tags: "tourism=museum" }, { label: "Galleries", tags: "tourism=gallery; shop=art" }, { label: "Theatres and venues", tags: "amenity=theatre|arts_centre|concert_hall|music_venue" },
      { label: "Public art", tags: "tourism=artwork" }, { label: "Studios and makers", tags: "craft=pottery|sculptor|glaziery|jeweller; amenity=studio" }, { label: "Cinemas", tags: "amenity=cinema" },
    ] },
    pro: { about: "Your studio or gallery, works, loans, shows, collectors and shipments, on one map", names: { site: "Studios and venues", client: "Collectors and clients", order: "Sales and commissions", shipment: "Shipments", job: "Installs", case: "Shows and loans", visit: "Studio visits", asset: "Works" } },
    services: { about: "Every kind of company that serves art", cats: [
      { label: "Art handling and shipping", q: "fine art shipping" }, { label: "Framers", tags: "shop=frame; craft=framing" }, { label: "Foundries and fabrication", tags: "craft=metal_construction|blacksmith", q: "art foundry fabrication" },
      { label: "Art supplies", tags: "shop=art|craft" }, { label: "Conservation and restoration", tags: "craft=restoration", q: "art conservator" }, { label: "Lighting and AV", q: "exhibition lighting AV" },
      { label: "Storage", tags: "shop=storage_rental", q: "fine art storage" }, { label: "Printmaking and printing", tags: "craft=printmaker|printer; shop=copyshop" }, { label: "Valuation and auction", tags: "shop=auction", q: "art valuation" },
      ...c("photo", "insurance", "legal", "accounting", "marketing", "security", "builders", "consult"),
    ] },
  },
  gaming: {
    everyday: { about: "Arcades, game shops, esports and play around you", cats: [
      { label: "Arcades and amusements", tags: "leisure=amusement_arcade|adult_gaming_centre" }, { label: "Game shops", tags: "shop=games|video_games|toys" }, { label: "Escape rooms and VR", tags: "leisure=escape_game; amenity=vr" },
      { label: "Bowling and entertainment", tags: "leisure=bowling_alley|trampoline_park; amenity=karaoke_box" }, { label: "Internet and esports cafés", tags: "amenity=internet_cafe" },
    ] },
    pro: { about: "Your venues, machines, events and players, on one map", names: { site: "Venues", client: "Partners", order: "Orders", shipment: "Deliveries", job: "Repairs", case: "Events", visit: "Visits", asset: "Machines" } },
    services: { about: "Every kind of company that serves gaming", cats: [
      { label: "Arcade machine operators and repair", q: "arcade machine repair" }, { label: "VR and venue tech", q: "VR equipment supplier" }, { label: "Screens, LED and AV", tags: "shop=electronics", q: "LED screen AV installer" },
      { label: "Prize and merchandise supply", tags: "shop=wholesale" }, { label: "Event production", q: "event production company" }, { label: "Networking and servers", tags: "office=it" },
      ...c("electric", "builders", "security", "cleaning", "staffing", "marketing", "accounting", "insurance", "legal", "banks"),
    ] },
  },
  realestate: {
    everyday: { about: "Homes for sale and rent, offices and neighbourhoods around you", cats: [
      { label: "Estate and letting agents", tags: "office=estate_agent" }, { label: "Apartments and homes", tags: "building=apartments|residential|house" }, { label: "Offices", tags: "building=office|commercial; office=company" },
      { label: "Parks and schools nearby", tags: "leisure=park; amenity=school" }, { label: "Transport nearby", tags: "public_transport=station; railway=station" },
    ] },
    pro: { about: "Your buildings, units, tenants, leases, repairs and viewings, on one map", names: { site: "Buildings", client: "Tenants and owners", order: "Deals", shipment: "Deliveries", job: "Repairs", case: "Leases", visit: "Viewings", asset: "Units" } },
    services: { about: "Every kind of company that serves property", cats: [
      { label: "Facilities management", q: "facilities management company" }, { label: "Lifts and elevators", q: "elevator maintenance" }, { label: "HVAC and boilers", tags: "craft=hvac|heating_engineer" },
      { label: "Roofers", tags: "craft=roofer" }, { label: "Locksmiths", tags: "shop=locksmith; craft=locksmith" }, { label: "Painters and decorators", tags: "craft=painter" }, { label: "Gardeners and grounds", tags: "craft=gardener", q: "grounds maintenance" },
      { label: "Valuers and appraisers", tags: "office=valuer", q: "property valuer" }, { label: "Mortgage brokers", tags: "office=financial_advisor|mortgage" }, { label: "Architects", tags: "office=architect" },
      ...c("surveyors", "builders", "electric", "plumbing", "cleaning", "waste", "security", "moving", "legal", "insurance", "accounting", "photo", "marketing", "banks"),
    ] },
  },
  architecture: {
    everyday: { about: "Great buildings, landmarks and architecture around you", cats: [
      { label: "Landmark buildings", tags: "tourism=attraction,building; historic=building|castle|monument" }, { label: "Places of worship", tags: "amenity=place_of_worship" },
      { label: "Bridges and towers", tags: "man_made=bridge|tower" }, { label: "Architects' offices", tags: "office=architect" },
    ] },
    pro: { about: "Your projects, sites, clients, consultants, approvals and site visits, on one map", names: { site: "Projects", client: "Clients", order: "Fees", shipment: "Deliveries", job: "Work stages", case: "Planning and approvals", visit: "Site visits", asset: "Models and drawings" } },
    services: { about: "Every kind of company that serves architecture", cats: [
      { label: "Structural and civil engineers", tags: "office=engineer" }, { label: "Planning consultants", q: "planning consultant" }, { label: "Laser scanning and drone surveys", q: "laser scanning survey" },
      { label: "Model makers and visualisation", q: "architectural model maker" }, { label: "Stone, timber and brick", tags: "shop=trade|building_materials; craft=stonemason; industrial=sawmill" },
      { label: "Glazing and façades", tags: "craft=glaziery|window_construction" }, { label: "Landscape architects", q: "landscape architect" }, { label: "Printing and plotting", tags: "shop=copyshop" },
      ...c("surveyors", "builders", "legal", "insurance", "accounting", "photo", "it", "consult"),
    ] },
  },
  tech: {
    everyday: { about: "Tech hubs, coworking, data centres and electronics around you", cats: [
      { label: "Coworking", tags: "amenity=coworking_space; office=coworking" }, { label: "Tech companies", tags: "office=it|company|telecommunication" }, { label: "Data centres", tags: "telecom=data_center; building=data_center" },
      { label: "Electronics and repair", tags: "shop=electronics|computer|mobile_phone" }, { label: "Universities and labs", tags: "amenity=university|research_institute" },
    ] },
    pro: { about: "Your offices, customers, deals, deployments and devices, on one map", names: { site: "Offices and sites", client: "Customers", order: "Deals", shipment: "Shipments", job: "Deployments", case: "Tickets", visit: "Meetings", asset: "Devices and servers" } },
    services: { about: "Every kind of company that serves tech", cats: [
      { label: "Data centre and colocation", tags: "telecom=data_center", q: "colocation data centre" }, { label: "Field engineers and remote hands", q: "IT field engineer" }, { label: "Networks and cabling", q: "network cabling installer" },
      { label: "Cooling and UPS", q: "data centre cooling UPS" }, { label: "Hardware resellers", tags: "shop=computer|electronics" }, { label: "Device repair and recycling", tags: "craft=electronics_repair; shop=mobile_phone" },
      { label: "Coworking and offices", tags: "amenity=coworking_space" }, { label: "Patent and IP lawyers", tags: "office=lawyer", q: "patent attorney" },
      ...c("it", "electric", "security", "couriers", "staffing", "marketing", "accounting", "insurance", "legal", "banks", "consult"),
    ] },
  },
  sport: {
    everyday: { about: "Stadiums, gyms, pitches, pools and clubs around you", cats: [
      { label: "Stadiums", tags: "leisure=stadium" }, { label: "Gyms and studios", tags: "leisure=fitness_centre|sports_centre" }, { label: "Pitches and courts", tags: "leisure=pitch" },
      { label: "Pools", tags: "leisure=swimming_pool|water_park" }, { label: "Sports clubs", tags: "club=sport; leisure=sports_club" }, { label: "Sports shops", tags: "shop=sports|outdoor|bicycle" },
    ] },
    pro: { about: "Your club or gym: venues, members, fixtures, travel and kit, on one map", names: { site: "Venues", client: "Members and sponsors", order: "Orders", shipment: "Deliveries", job: "Maintenance", case: "Fixtures and events", visit: "Sessions", asset: "Kit and equipment" } },
    services: { about: "Every kind of company that serves sport", cats: [
      { label: "Pitches, turf and surfaces", q: "sports surface contractor" }, { label: "Groundskeeping", tags: "craft=gardener", q: "grounds maintenance sports" }, { label: "Floodlights and scoreboards", q: "sports floodlighting" },
      { label: "Kit and equipment", tags: "shop=sports" }, { label: "Physio and sports medicine", tags: "healthcare=physiotherapist; amenity=clinic" }, { label: "Coaches and coaching", q: "sports coaching" },
      { label: "Ticketing", q: "ticketing system for clubs" }, { label: "Stewarding and events", tags: "office=security", q: "event stewarding" }, { label: "Team travel", tags: "shop=travel_agency" },
      ...c("photo", "marketing", "printing", "cleaning", "security", "staffing", "accounting", "insurance", "legal", "banks"),
    ] },
  },
  build: {
    everyday: { about: "Building work, builders' merchants and trades around you", cats: [
      { label: "Construction sites", tags: "landuse=construction; building=construction" }, { label: "Builders' merchants", tags: "shop=trade|doityourself|hardware" },
      { label: "Trades", tags: "craft=builder|carpenter|electrician|plumber|roofer|plasterer|tiler|painter" }, { label: "Quarries and yards", tags: "landuse=quarry; industrial=sawmill|concrete_plant" },
    ] },
    pro: { about: "Your sites, clients, orders, deliveries, crews and plant, on one map", names: { site: "Sites", client: "Clients", order: "Orders", shipment: "Deliveries", job: "Jobs", case: "Permits and inspections", visit: "Site visits", asset: "Plant and equipment" } },
    services: { about: "Every kind of company that serves building", cats: [
      { label: "Plant and crane hire", tags: "shop=tool_hire; office=equipment_rental", q: "plant hire" }, { label: "Scaffolding", tags: "craft=scaffolder" }, { label: "Builders' merchants", tags: "shop=trade" },
      { label: "Concrete and aggregates", tags: "industrial=concrete_plant; landuse=quarry" }, { label: "Timber and steel", tags: "industrial=sawmill; craft=metal_construction" }, { label: "Skips and waste", q: "skip hire" },
      { label: "Roofing", tags: "craft=roofer" }, { label: "Glazing", tags: "craft=glaziery" }, { label: "Plastering and drylining", tags: "craft=plasterer" }, { label: "Groundworks and demolition", q: "groundworks contractor" },
      { label: "Architects", tags: "office=architect" }, { label: "Site security and fencing", tags: "office=security", q: "site security" }, { label: "Temporary welfare and cabins", q: "site welfare cabin hire" },
      ...c("engineers", "surveyors", "electric", "plumbing", "builders", "staffing", "uniforms", "legal", "insurance", "accounting", "banks"),
    ] },
  },
  mine: {
    everyday: { about: "Mines, quarries and the minerals around you", cats: [
      { label: "Mines and quarries", tags: "landuse=quarry; man_made=mineshaft|adit" }, { label: "Processing plants", tags: "industrial=mine|smelter|refinery" }, { label: "Spoil and tailings", tags: "landuse=landfill; man_made=spoil_heap" },
    ] },
    pro: { about: "Your mine: pits, plant, haulage, communities, permits and equipment, on one map", names: { site: "Pits and plants", client: "Offtakers", order: "Contracts", shipment: "Shipments", job: "Work orders", case: "Permits and grievances", visit: "Inspections", asset: "Fleet and plant" } },
    services: { about: "Every kind of company that serves mining", cats: [
      { label: "Drilling and blasting", q: "mining drilling contractor" }, { label: "Heavy equipment dealers", tags: "shop=trade", q: "mining equipment dealer" }, { label: "Tyres and parts", tags: "shop=tyres|car_parts" },
      { label: "Fuel and lubricants", tags: "amenity=fuel; shop=fuel" }, { label: "Assay labs", tags: "office=laboratory", q: "assay laboratory" }, { label: "Geologists and surveyors", tags: "office=surveyor|geodesist" },
      { label: "Explosives supply", q: "explosives supplier mining" }, { label: "Camps and catering", tags: "craft=caterer" }, { label: "Environmental consultants", q: "environmental consultant mining" },
      { label: "Haulage and rail", tags: "office=logistics" }, { label: "Water and tailings engineering", tags: "office=engineer" },
      ...c("electric", "staffing", "uniforms", "security", "legal", "insurance", "accounting", "banks", "consult"),
    ] },
  },
  commod: {
    everyday: { about: "Where raw materials come from and move: mines, farms, ports and pipelines", cats: [
      { label: "Mines and quarries", tags: "landuse=quarry" }, { label: "Ports and terminals", tags: "landuse=port; harbour=yes; industrial=port" }, { label: "Refineries and plants", tags: "industrial=refinery|smelter" },
      { label: "Silos and grain stores", tags: "man_made=silo|storage_tank" },
    ] },
    pro: { about: "Your positions, contracts, cargoes and counterparties, on one map", names: { site: "Sources and plants", client: "Counterparties", order: "Contracts", shipment: "Cargoes", job: "Tasks", case: "Disputes", visit: "Visits", asset: "Stocks" } },
    services: { about: "Every kind of company that serves raw-materials trade", cats: [
      { label: "Inspection and sampling", tags: "office=laboratory", q: "cargo inspection surveyor" }, { label: "Warehousing and terminals", tags: "industrial=warehouse; office=logistics" }, { label: "Shipping and chartering", tags: "office=shipping_agent|logistics" },
      { label: "Trade finance", tags: "office=financial", q: "trade finance" }, { label: "Brokers", tags: "office=financial", q: "commodity broker" },
      ...c("insurance", "legal", "accounting", "couriers", "consult"),
    ] },
  },
  finance: {
    everyday: { about: "Exchanges, banks and financial districts around you", cats: [
      { label: "Banks and ATMs", tags: "amenity=bank|atm" }, { label: "Financial offices", tags: "office=financial|financial_advisor|tax_advisor|insurance" }, { label: "Currency exchange", tags: "amenity=bureau_de_change" },
    ] },
    pro: { about: "Your clients, holdings, deals and meetings, on one map", names: { site: "Offices", client: "Clients", order: "Deals", shipment: "Settlements", job: "Tasks", case: "Reviews", visit: "Meetings", asset: "Holdings" } },
    services: { about: "Every kind of company that serves finance", cats: [
      { label: "Market data and terminals", q: "market data provider" }, { label: "Compliance and KYC", q: "compliance consultant" }, { label: "Auditors", tags: "office=accountant" },
      { label: "Fund administration", q: "fund administrator" }, { label: "Cash handling", q: "cash in transit" },
      ...c("legal", "it", "security", "staffing", "insurance", "consult", "couriers"),
    ] },
  },
  banking: {
    everyday: { about: "Banks, ATMs, credit unions and money services around you", cats: [
      { label: "Banks", tags: "amenity=bank" }, { label: "ATMs", tags: "amenity=atm" }, { label: "Money transfer and exchange", tags: "amenity=bureau_de_change|money_transfer; shop=money_lender" },
    ] },
    pro: { about: "Your branches, customers, loans and visits, on one map", names: { site: "Branches", client: "Customers", order: "Loans", shipment: "Cash deliveries", job: "Tasks", case: "Applications", visit: "Visits", asset: "ATMs and kit" } },
    services: { about: "Every kind of company that serves banks", cats: [
      { label: "Cash in transit", q: "cash in transit" }, { label: "ATM service and repair", q: "ATM service" }, { label: "Core banking and IT", tags: "office=it" },
      ...c("security", "legal", "accounting", "staffing", "cleaning", "builders", "consult"),
    ] },
  },
  freight: {
    everyday: { about: "Ports, depots, rail yards and the ships moving now", cats: [
      { label: "Ports and terminals", tags: "landuse=port; industrial=port" }, { label: "Warehouses and depots", tags: "industrial=warehouse|depot; building=warehouse" }, { label: "Rail freight yards", tags: "landuse=railway; railway=yard" },
      { label: "Truck stops", tags: "amenity=fuel,hgv=yes" }, { label: "Customs", tags: "amenity=customs; government=customs" },
    ] },
    pro: { about: "Your shipments, containers, customers, depots and routes, on one map", names: { site: "Depots", client: "Customers", order: "Bookings", shipment: "Shipments and containers", job: "Jobs", case: "Customs and claims", visit: "Collections", asset: "Fleet" } },
    services: { about: "Every kind of company that serves freight", cats: [
      { label: "Freight forwarders", tags: "office=logistics|freight_forwarder" }, { label: "Customs brokers", tags: "office=customs_broker", q: "customs broker" }, { label: "Hauliers and trucking", tags: "office=logistics", q: "haulage company" },
      { label: "Warehousing", tags: "industrial=warehouse" }, { label: "Container depots and repair", q: "container depot" }, { label: "Truck repair and tyres", tags: "shop=car_repair|tyres" }, { label: "Fuel", tags: "amenity=fuel" },
      ...c("couriers", "insurance", "legal", "accounting", "staffing", "security", "banks"),
    ] },
  },
  aid: {
    everyday: { about: "Clinics, schools, water points and shelters around you", cats: [
      { label: "Clinics and health posts", tags: "amenity=clinic|hospital|doctors" }, { label: "Schools", tags: "amenity=school" }, { label: "Water points", tags: "amenity=drinking_water|water_point; man_made=water_well" },
      { label: "Shelters and community centres", tags: "amenity=shelter|community_centre|social_facility" },
    ] },
    pro: { about: "Your programme: sites, partners, supplies, distributions and visits, on one map", names: { site: "Sites", client: "Partners", order: "Requests", shipment: "Supplies", job: "Activities", case: "Cases", visit: "Visits", asset: "Stock" } },
    services: { about: "Every kind of company that serves aid work", cats: [
      { label: "Logistics and warehousing", tags: "office=logistics; industrial=warehouse" }, { label: "Water and sanitation engineers", tags: "office=engineer" }, { label: "Medical supplies", tags: "shop=medical_supply" },
      { label: "Vehicles and fleet", tags: "shop=car|car_repair" }, { label: "Translators", tags: "office=translator" }, { label: "Telecoms and connectivity", tags: "office=telecommunication" },
      ...c("security", "staffing", "accounting", "insurance", "legal", "banks", "consult"),
    ] },
  },
  farm: {
    everyday: { about: "Farms, farm shops, markets and growing around you", cats: [
      { label: "Farms", tags: "landuse=farmyard|farmland" }, { label: "Farm shops and markets", tags: "shop=farm; amenity=marketplace" }, { label: "Orchards and vineyards", tags: "landuse=orchard|vineyard" },
      { label: "Allotments and gardens", tags: "landuse=allotments; leisure=garden" }, { label: "Garden centres", tags: "shop=garden_centre" },
    ] },
    pro: { about: "Your fields, herds, buyers, orders and machinery, on one map", names: { site: "Fields and yards", client: "Buyers", order: "Orders", shipment: "Deliveries", job: "Field work", case: "Inspections and schemes", visit: "Vet and agronomist visits", asset: "Machinery" } },
    services: { about: "Every kind of company that serves farming", cats: [
      { label: "Machinery dealers and repair", tags: "shop=agrarian|tractor", q: "tractor dealer" }, { label: "Seed, feed and fertiliser", tags: "shop=agrarian", q: "agricultural merchant" }, { label: "Vets", tags: "amenity=veterinary" },
      { label: "Agronomists and soil labs", tags: "office=laboratory", q: "agronomist" }, { label: "Contractors (spraying, harvest)", q: "agricultural contractor" }, { label: "Irrigation", q: "irrigation supplier" },
      { label: "Grain buyers and co-ops", tags: "office=cooperative", q: "grain merchant" }, { label: "Abattoirs and processors", tags: "industrial=slaughterhouse" }, { label: "Fencing", q: "agricultural fencing" },
      ...c("accounting", "insurance", "legal", "banks", "electric", "staffing", "consult"),
    ] },
  },
  energy: {
    everyday: { about: "Power plants, wind and solar farms, lines and charging around you", cats: [
      { label: "Power plants", tags: "power=plant" }, { label: "Wind turbines", tags: "power=generator,generator:source=wind" }, { label: "Solar farms", tags: "power=plant,plant:source=solar; power=generator,generator:source=solar" },
      { label: "Substations", tags: "power=substation" }, { label: "EV charging", tags: "amenity=charging_station" }, { label: "Fuel stations", tags: "amenity=fuel" },
    ] },
    pro: { about: "Your sites, turbines and panels, customers, work orders and crews, on one map", names: { site: "Sites", client: "Customers and offtakers", order: "Contracts", shipment: "Deliveries", job: "Work orders", case: "Permits and grid", visit: "Inspections", asset: "Turbines, panels and plant" } },
    services: { about: "Every kind of company that serves energy", cats: [
      { label: "Wind and solar O&M", q: "solar O&M" }, { label: "Solar installers", tags: "craft=solar_installer|photovoltaic", q: "solar installer" }, { label: "Electrical contractors", tags: "craft=electrician" },
      { label: "Grid and HV engineers", tags: "office=engineer", q: "high voltage engineer" }, { label: "Cranes and heavy lift", q: "crane hire" }, { label: "EV charger installers", q: "EV charger installer" },
      { label: "Fuel and gas suppliers", tags: "office=energy_supplier; shop=fuel|gas" }, { label: "Battery storage", q: "battery storage installer" },
      ...c("surveyors", "legal", "insurance", "accounting", "staffing", "security", "banks", "consult"),
    ] },
  },
  health: {
    everyday: { about: "Hospitals, clinics, doctors, dentists and pharmacies around you", cats: [
      { label: "Hospitals", tags: "amenity=hospital" }, { label: "Clinics and doctors", tags: "amenity=clinic|doctors" }, { label: "Pharmacies", tags: "amenity=pharmacy; shop=chemist" },
      { label: "Dentists", tags: "amenity=dentist" }, { label: "Care homes", tags: "amenity=social_facility,social_facility=nursing_home" }, { label: "Therapy and wellbeing", tags: "healthcare=physiotherapist|psychotherapist|alternative" },
    ] },
    pro: { about: "Your practice or sites, patients' visits, referrals, supplies and equipment, on one map", names: { site: "Sites", client: "Partners and referrers", order: "Orders", shipment: "Supplies", job: "Maintenance", case: "Referrals", visit: "Home visits", asset: "Equipment" } },
    services: { about: "Every kind of company that serves health care", cats: [
      { label: "Medical equipment and service", tags: "shop=medical_supply", q: "medical equipment service" }, { label: "Labs and diagnostics", tags: "healthcare=laboratory; office=laboratory" }, { label: "Medical waste", q: "clinical waste collection" },
      { label: "Pharmacy wholesale", tags: "shop=wholesale", q: "pharmaceutical wholesaler" }, { label: "Ambulance and transport", tags: "emergency=ambulance_station" }, { label: "Locum and nursing agencies", tags: "office=employment_agency", q: "nursing agency" },
      { label: "Linen and laundry", tags: "shop=laundry" }, { label: "Health IT", tags: "office=it" },
      ...c("cleaning", "security", "legal", "insurance", "accounting", "builders", "consult"),
    ] },
  },
  telecom: {
    everyday: { about: "Masts, exchanges, data centres and phone shops around you", cats: [
      { label: "Masts and towers", tags: "man_made=mast|tower,tower:type=communication" }, { label: "Exchanges and data centres", tags: "telecom=exchange|data_center" }, { label: "Phone shops", tags: "shop=mobile_phone" },
    ] },
    pro: { about: "Your sites and towers, customers, tickets and crews, on one map", names: { site: "Sites and towers", client: "Customers", order: "Orders", shipment: "Deliveries", job: "Tickets", case: "Permits", visit: "Site visits", asset: "Equipment" } },
    services: { about: "Every kind of company that serves telecoms", cats: [
      { label: "Tower riggers", q: "telecom tower rigger" }, { label: "Fibre installers", q: "fibre installer" }, { label: "Generators and fuel", tags: "amenity=fuel", q: "generator service" },
      { label: "Network engineers", tags: "office=telecommunication|it" }, { label: "Site acquisition", tags: "office=estate_agent", q: "telecom site acquisition" },
      ...c("electric", "engineers", "legal", "insurance", "accounting", "staffing", "security"),
    ] },
  },
  edu: {
    everyday: { about: "Schools, colleges, libraries and museums around you", cats: [
      { label: "Schools", tags: "amenity=school" }, { label: "Colleges and universities", tags: "amenity=college|university" }, { label: "Libraries", tags: "amenity=library" },
      { label: "Nurseries", tags: "amenity=kindergarten|childcare" }, { label: "Museums", tags: "tourism=museum" },
    ] },
    pro: { about: "Your schools, rooms, staff, buses, trips and repairs, on one map", names: { site: "Schools", client: "Families", order: "Orders", shipment: "Deliveries", job: "Repairs", case: "Cases", visit: "Visits and trips", asset: "Rooms and buses" } },
    services: { about: "Every kind of company that serves schools", cats: [
      { label: "School transport", tags: "office=bus_company|transport", q: "school bus company" }, { label: "Catering", tags: "craft=caterer" }, { label: "Supply teachers", tags: "office=employment_agency", q: "supply teacher agency" },
      { label: "Ed tech and IT", tags: "office=it" }, { label: "Furniture and supplies", tags: "shop=stationery|furniture" }, { label: "Tutors", tags: "office=tutoring|educational_institution", q: "tutoring" },
      ...c("cleaning", "security", "builders", "printing", "uniforms", "insurance", "legal", "accounting"),
    ] },
  },
  social: {
    everyday: { about: "Food banks, shelters, family and community services around you", cats: [
      { label: "Food banks", tags: "social_facility=food_bank; amenity=food_bank" }, { label: "Shelters", tags: "social_facility=shelter; amenity=shelter" }, { label: "Community centres", tags: "amenity=community_centre|social_centre" },
      { label: "Family and youth services", tags: "social_facility=outreach|group_home; amenity=social_facility" }, { label: "Older people's services", tags: "social_facility=assisted_living|nursing_home" },
    ] },
    pro: { about: "Your caseload, visits, referrals and partner services, on one map", names: { site: "Offices", client: "People you support", order: "Requests", shipment: "Deliveries", job: "Tasks", case: "Cases", visit: "Home visits", asset: "Resources" } },
    services: { about: "Every kind of organisation that works with social services", cats: [
      { label: "Housing providers", tags: "office=housing_association|government", q: "housing association" }, { label: "Counselling and therapy", tags: "healthcare=psychotherapist|counselling" }, { label: "Legal aid", tags: "office=lawyer", q: "legal aid" },
      { label: "Translators", tags: "office=translator" }, { label: "Transport", q: "community transport" }, { label: "Training providers", tags: "office=educational_institution" },
      ...c("staffing", "insurance", "accounting", "it", "consult"),
    ] },
  },
  gov: {
    everyday: { about: "Town halls, courts, police and public services around you", cats: [
      { label: "Town halls", tags: "amenity=townhall" }, { label: "Courts", tags: "amenity=courthouse" }, { label: "Police and fire", tags: "amenity=police|fire_station" },
      { label: "Government offices", tags: "office=government" }, { label: "Post offices", tags: "amenity=post_office" },
    ] },
    pro: { about: "Your facilities, projects, cases, requests and inspections, on one map", names: { site: "Facilities", client: "Constituents and partners", order: "Contracts", shipment: "Deliveries", job: "Work orders", case: "Cases and requests", visit: "Inspections", asset: "Assets" } },
    services: { about: "Every kind of company that serves government", cats: [
      { label: "Civil engineering", tags: "office=engineer" }, { label: "Road and street works", q: "highways contractor" }, { label: "Parks and grounds", tags: "craft=gardener" },
      { label: "Fleet and vehicles", tags: "shop=car_repair" }, { label: "Public consultation and research", tags: "office=research" },
      ...c("builders", "waste", "cleaning", "security", "it", "legal", "accounting", "printing", "consult"),
    ] },
  },
  host: {
    everyday: { about: "Hotels, hostels, rentals and things to do around you", cats: [
      { label: "Hotels", tags: "tourism=hotel" }, { label: "Hostels and guest houses", tags: "tourism=hostel|guest_house|motel" }, { label: "Holiday rentals", tags: "tourism=apartment|chalet" },
      { label: "Sights", tags: "tourism=attraction|viewpoint|museum" }, { label: "Event venues", tags: "amenity=conference_centre|events_venue" },
    ] },
    pro: { about: "Your properties, rooms, bookings, guests, housekeeping and repairs, on one map", names: { site: "Properties", client: "Guests and accounts", order: "Bookings", shipment: "Deliveries", job: "Housekeeping and repairs", case: "Licences", visit: "Inspections", asset: "Rooms" } },
    services: { about: "Every kind of company that serves hotels and buildings", cats: [
      { label: "Linen and laundry", tags: "shop=laundry|dry_cleaning" }, { label: "Housekeeping", q: "hotel housekeeping service" }, { label: "Booking systems and channels", q: "hotel property management system" },
      { label: "Food and drink suppliers", tags: "shop=wholesale" }, { label: "Lifts and HVAC", tags: "craft=hvac" }, { label: "Pools and spas", q: "pool maintenance" }, { label: "Furniture and fit-out", tags: "shop=furniture" },
      ...c("cleaning", "waste", "security", "staffing", "uniforms", "marketing", "photo", "electric", "plumbing", "builders", "it", "accounting", "insurance", "legal"),
    ] },
  },
};

/** One Overpass filter group per alternative in the short tag form (pure): "a=b|c; d=e,f=g" → [[a~b|c], [d=e][f=g]]. */
export function overpassFilters(tags: string): string[] {
  return tags.split(";").map((alt) => alt.trim()).filter(Boolean).map((alt) => alt.split(",").map((cond) => {
    const [k, v] = cond.trim().split("=");
    if (!v) return `["${k}"]`;
    return v.includes("|") ? `["${k}"~"^(${v})$"]` : `["${k}"="${v}"]`;
  }).join(""));
}

/** An Overpass query for a category around a point (pure). */
export function categoryQuery(tags: string, at: { lon: number; lat: number }, radiusM: number, limit = 150): string {
  const a = `${at.lat.toFixed(4)},${at.lon.toFixed(4)}`;
  return `[out:json][timeout:25];(${overpassFilters(tags).map((f) => `nwr${f}(around:${radiusM},${a});`).join("")});out center tags ${limit};`;
}

/** Searching the map for a service by name, where OpenStreetMap has no tag for it (pure). */
export const searchLink = (cat: Cat, at: { lon: number; lat: number }) =>
  `https://www.google.com/maps/search/${encodeURIComponent(cat.q ?? cat.label)}/@${at.lat.toFixed(5)},${at.lon.toFixed(5)},13z`;

/** A field's three layers, named the way people say them (pure): "Food", "Food Pro", "Food services". */
export function layerNames(label: string): { everyday: string; pro: string; services: string } {
  const short = label.split(" & ")[0];
  return { everyday: label, pro: `${short} Pro`, services: `${short} services` };
}
