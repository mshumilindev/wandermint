/** Build a Google Maps directions URL (no API key). Requires at least two stops with coordinates. */
export const buildGoogleMapsDirectionsUrl = (
  stops: Array<{ latitude?: number; longitude?: number }>,
  options?: { travelMode?: "driving" | "walking" | "transit" | "bicycling" },
): string | null => {
  const valid = stops.filter(
    (s): s is { latitude: number; longitude: number } =>
      s.latitude !== undefined &&
      s.longitude !== undefined &&
      Number.isFinite(s.latitude) &&
      Number.isFinite(s.longitude),
  );
  if (valid.length < 2) {
    return null;
  }
  const fmt = (s: { latitude: number; longitude: number }): string => `${s.latitude},${s.longitude}`;
  const mode = options?.travelMode ?? "walking";
  const params = new URLSearchParams();
  params.set("api", "1");
  const first = valid[0];
  const last = valid[valid.length - 1];
  if (!first || !last) {
    return null;
  }
  if (valid.length === 2) {
    params.set("origin", fmt(first));
    params.set("destination", fmt(last));
  } else {
    params.set("origin", fmt(first));
    params.set("destination", fmt(last));
    const middle = valid.slice(1, -1);
    if (middle.length > 0) {
      params.set("waypoints", middle.map(fmt).join("|"));
    }
  }
  params.set("travelmode", mode);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};
