import type { BaseLocation } from "./planningContext.types";

export const resolvePlanningLocations = (
  flow: "right_now" | "create_plan",
  state:
    | {
        locationLabel?: string;
        latitude?: number;
        longitude?: number;
      }
    | {
        segments?: Array<{
          id: string;
          city?: string;
          country?: string;
        }>;
      },
): BaseLocation[] => {
  if (flow === "right_now") {
    const rightNowState = state as { locationLabel?: string; latitude?: number; longitude?: number };
    if (!rightNowState.locationLabel?.trim()) {
      return [];
    }
    return [
      {
        id: "right-now-primary",
        label: rightNowState.locationLabel.trim(),
        city: rightNowState.locationLabel.split(",")[0]?.trim(),
        country: rightNowState.locationLabel.split(",")[1]?.trim(),
        coordinates:
          rightNowState.latitude !== undefined && rightNowState.longitude !== undefined
            ? { lat: rightNowState.latitude, lng: rightNowState.longitude }
            : undefined,
      },
    ];
  }

  const planState = state as { segments?: Array<{ id: string; city?: string; country?: string }> };
  const segments = planState.segments ?? [];
  const dedupe = new Set<string>();
  const out: BaseLocation[] = [];
  segments.forEach((segment) => {
    const city = segment.city?.trim();
    const country = segment.country?.trim();
    if (!city) {
      return;
    }
    const key = `${city.toLowerCase()}|${(country ?? "").toLowerCase()}`;
    if (dedupe.has(key)) {
      return;
    }
    dedupe.add(key);
    out.push({
      id: segment.id,
      label: [city, country].filter(Boolean).join(", "),
      city,
      country,
    });
  });
  return out;
};
