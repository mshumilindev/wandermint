import type { TravelMemory, TravelStats } from "../../../entities/travel-memory/model";

export interface TravelMapPoint {
  id: string;
  city: string;
  country: string;
  label: string;
  latitude: number;
  longitude: number;
  visitCount: number;
  memories: TravelMemory[];
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface MapCenter {
  latitude: number;
  longitude: number;
}

const tileSize = 256;

export const clampMapZoom = (zoom: number): number => Math.min(Math.max(zoom, 1), 6);

export const clampLatitude = (latitude: number): number => Math.min(Math.max(latitude, -84), 84);

export const projectToWorld = (latitude: number, longitude: number, zoom: number): ProjectedPoint => {
  const scale = tileSize * 2 ** zoom;
  const safeLatitude = clampLatitude(latitude);
  const sinLatitude = Math.sin((safeLatitude * Math.PI) / 180);

  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  };
};

export const unprojectFromWorld = (point: ProjectedPoint, zoom: number): MapCenter => {
  const scale = tileSize * 2 ** zoom;
  const longitude = (point.x / scale) * 360 - 180;
  const mercatorY = 0.5 - point.y / scale;
  const latitude = 90 - (360 * Math.atan(Math.exp(-mercatorY * 2 * Math.PI))) / Math.PI;

  return {
    latitude: clampLatitude(latitude),
    longitude: ((longitude + 540) % 360) - 180,
  };
};

export const createTravelMapPoints = (memories: TravelMemory[]): TravelMapPoint[] => {
  const grouped = memories.reduce<Record<string, TravelMemory[]>>((groups, memory) => {
    if (memory.latitude === undefined || memory.longitude === undefined) {
      return groups;
    }

    const key = `${memory.city.trim().toLowerCase()}|${memory.country.trim().toLowerCase()}|${memory.latitude.toFixed(3)}|${memory.longitude.toFixed(3)}`;
    return {
      ...groups,
      [key]: [...(groups[key] ?? []), memory],
    };
  }, {});

  return Object.values(grouped)
    .map((group): TravelMapPoint => {
      const first = group[0];
      if (!first || first.latitude === undefined || first.longitude === undefined) {
        throw new Error("Travel map point requires coordinates");
      }

      return {
        id: `${first.city}-${first.country}-${first.latitude.toFixed(3)}-${first.longitude.toFixed(3)}`,
        city: first.city,
        country: first.country,
        label: `${first.city}, ${first.country}`,
        latitude: first.latitude,
        longitude: first.longitude,
        visitCount: group.length,
        memories: group,
      };
    })
    .sort((left, right) => right.visitCount - left.visitCount || left.label.localeCompare(right.label));
};

export const createMapInitialCenter = (points: TravelMapPoint[]): MapCenter => {
  if (points.length === 0) {
    return { latitude: 28, longitude: 12 };
  }

  const average = points.reduce(
    (total, point) => ({
      latitude: total.latitude + point.latitude,
      longitude: total.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: average.latitude / points.length,
    longitude: average.longitude / points.length,
  };
};

export const createMapOverlayStats = (stats: TravelStats): Array<{ label: string; value: number | string }> => [
  { label: "Countries", value: stats.visitedCountries },
  { label: "Cities", value: stats.visitedCities },
  { label: "Trips", value: stats.tripsRecorded },
  { label: "Days", value: stats.travelDays },
];
