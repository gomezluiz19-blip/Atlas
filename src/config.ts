// Optional service keys, read from Vite env vars (see .env.example).
export const config = {
  googleMapsKey: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || "",
  cesiumIonToken: (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined) || "",
  /** The shared story library (a Supabase project; see docs/stories-backend.md). */
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "",
  supabaseKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "",
  /** Event listings (see docs/events.md): any of these switches on "What's on". */
  ticketmasterKey: (import.meta.env.VITE_TICKETMASTER_KEY as string | undefined) || "",
  seatgeekClientId: (import.meta.env.VITE_SEATGEEK_CLIENT_ID as string | undefined) || "",
  eventbriteToken: (import.meta.env.VITE_EVENTBRITE_TOKEN as string | undefined) || "",
  eventbriteOrg: (import.meta.env.VITE_EVENTBRITE_ORG_ID as string | undefined) || "",
};
