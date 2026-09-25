// Optional service keys, read from Vite env vars (see .env.example).
export const config = {
  googleMapsKey: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || "",
  cesiumIonToken: (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined) || "",
};
