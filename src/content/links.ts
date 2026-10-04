// How the themes connect. At the foot of every view of a place, Terreno offers
// the next questions people tend to ask about it: other views of the same
// place (which keep what's on the map), and layers to add without leaving.

export interface Link {
  label: string;
  /** Open another view of the same place: [theme, subtab]. */
  to?: [string, string];
  /** Or run a named action, e.g. "net:rail" (add railways to the map). */
  action?: string;
}

const go = (label: string, theme: string, subtab: string): Link => ({ label, to: [theme, subtab] });
const add = (label: string, action: string): Link => ({ label, action });

export const LINKS: Record<string, Link[]> = {
  "explore/here": [
    go("The ground: height, slope and rock", "land", "overview"),
    go("Water nearby, and where rain goes", "water", "overview"),
    go("Weather now", "climate", "now"),
    go("How it's connected: transport and power", "built", "overview"),
    go("Minerals in the ground", "minerals", "here"),
  ],

  "land/overview": [
    go("Where rain falling here goes", "water", "rain"),
    go("Minerals in this rock", "minerals", "here"),
    go("What grows at this height", "plants", "zones"),
    add("Colour the map by slope", "globe:slope"),
    add("Show the geologic map", "globe:geology"),
  ],
  "land/profile": [
    go("The watershed this slice crosses", "water", "watershed"),
    go("The rock beneath", "land", "rocks"),
    add("Add contour lines", "globe:contours"),
  ],
  "land/rocks": [
    go("Minerals in these rocks, and what they can hold", "minerals", "here"),
    go("Springs and wells: where groundwater comes up", "water", "nearby"),
    add("Show the geologic map", "globe:geology"),
    add("Show tectonic plates", "overlay:plates"),
  ],

  "minerals/here": [
    go("The rock layers below", "land", "rocks"),
    go("How ore gets out: rail, roads and ports", "built", "transport"),
    go("Water nearby (mines need a lot of it)", "water", "nearby"),
    add("Show the geologic map", "globe:geology"),
    add("Add railways to the map", "net:rail"),
  ],
  "minerals/mines": [
    go("Where runoff from here drains", "water", "watershed"),
    go("Power for the mines", "built", "energy"),
    go("The bedrock and its minerals", "minerals", "here"),
  ],
  "minerals/commodities": [
    go("Power plants and the energy mix here", "built", "energy"),
    go("What the country produces and trades", "countries", "economy"),
    add("Add shipping lanes", "net:shipping"),
    add("Add ports", "net:ports"),
  ],

  "water/overview": [
    go("How water moves through the city here", "water", "city"),
    go("Rainfall through the year", "climate", "climate"),
    go("Dams, canals and water works nearby", "built", "water"),
    add("Live rain radar", "overlay:radar"),
  ],
  "water/nearby": [
    go("How water moves through the city here", "water", "city"),
    go("Wildlife by the water", "animals", "species"),
    go("Plants that grow here", "plants", "species"),
  ],
  "water/city": [
    go("Where rain falling here flows over the land", "water", "rain"),
    go("The whole watershed", "water", "watershed"),
    go("Rain today and this week", "climate", "now"),
    go("Roads, rail and stations nearby", "built", "transport"),
    add("Live rain radar", "overlay:radar"),
  ],
  "water/rain": [
    go("How water moves through the city here", "water", "city"),
    go("Dams, canals and water works nearby", "built", "water"),
    go("The whole watershed", "water", "watershed"),
    go("The ground it flows over", "land", "profile"),
    add("Colour the map by slope", "globe:slope"),
  ],
  "water/watershed": [
    go("Rainfall through the year", "climate", "climate"),
    go("What grows across it", "plants", "zones"),
    go("Mines and quarries upstream", "minerals", "mines"),
    add("Colour the map by elevation", "globe:elevation"),
  ],

  "climate/now": [
    go("Where today's rain will flow", "water", "rain"),
    go("How water moves through the city here", "water", "city"),
    add("Live rain radar", "overlay:radar"),
  ],
  "climate/climate": [
    go("What grows in this climate", "plants", "zones"),
    go("Animals that live here", "animals", "species"),
    go("Rivers and lakes nearby", "water", "overview"),
  ],
  "climate/change": [
    go("The power mix here", "built", "energy"),
    go("Forests and emissions for the country", "countries", "environment"),
    go("Species at risk here", "animals", "threatened"),
  ],

  "plants/species": [
    go("Animals seen here", "animals", "species"),
    go("The climate they grow in", "climate", "climate"),
    go("The ground: height, slope and rock", "land", "overview"),
  ],
  "plants/zones": [
    go("The climate here", "climate", "climate"),
    go("Slice through the land", "land", "profile"),
    add("Colour the map by elevation", "globe:elevation"),
  ],
  "plants/threatened": [
    go("Animals at risk here", "animals", "threatened"),
    go("How the climate is changing", "climate", "change"),
  ],
  "animals/species": [
    go("Plants that grow here", "plants", "species"),
    go("Water nearby", "water", "nearby"),
    add("Show wildlife records", "overlay:species"),
  ],
  "animals/zones": [
    go("Plants by elevation", "plants", "zones"),
    go("The climate here", "climate", "climate"),
  ],
  "animals/threatened": [
    go("Plants at risk here", "plants", "threatened"),
    go("How the climate is changing", "climate", "change"),
    go("What's been built nearby", "built", "overview"),
  ],

  "built/overview": [
    go("How water moves through the city here", "water", "city"),
    go("Minerals and mines nearby", "minerals", "here"),
    go("The country: people and economy", "countries", "overview"),
    add("Show Earth at night", "overlay:lights"),
  ],
  "built/transport": [
    go("How water moves through the city here", "water", "city"),
    add("Add railways", "net:rail"),
    add("Add highways", "net:roads"),
    add("Add airports", "net:airports"),
  ],
  "built/energy": [
    go("Sun, wind and rain here", "climate", "climate"),
    go("Where the metals for power come from", "minerals", "commodities"),
    go("Emissions for the country", "countries", "environment"),
    add("Add power plants", "net:power"),
  ],
  "built/internet": [
    go("The country's economy", "countries", "economy"),
    add("Add undersea cables", "net:cables"),
    add("Add shipping lanes", "net:shipping"),
  ],
  "built/water": [
    go("How water moves through the city here", "water", "city"),
    go("Where rain falling here goes", "water", "rain"),
    go("Rivers, lakes, springs and wells", "water", "nearby"),
  ],

  "countries/overview": [
    go("Transport and power here", "built", "overview"),
    go("What the country mines", "minerals", "here"),
    add("Show Earth at night", "overlay:lights"),
  ],
  "countries/people": [
    go("What's been built", "built", "overview"),
    add("Show Earth at night", "overlay:lights"),
  ],
  "countries/economy": [
    go("What the country mines", "minerals", "here"),
    go("Ports, rail and airports", "built", "transport"),
    add("Add shipping lanes", "net:shipping"),
  ],
  "countries/environment": [
    go("The power mix", "built", "energy"),
    go("How the climate is changing here", "climate", "change"),
    go("Species at risk", "animals", "threatened"),
  ],
};
