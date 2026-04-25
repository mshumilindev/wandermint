export type GeoCluster = {
  id: string;
  center: { lat: number; lng: number };
  itemIds: string[];
  estimatedWalkingRadiusMeters: number;
};

/** Minimal point set for deterministic clustering (e.g. trip plan rows with coordinates). */
export type GeoClusterablePlanItem = {
  id: string;
  lat: number;
  lng: number;
};

export type GeoClusterBuildOptions = {
  /** Max walking distance (meters) for two stops to sit in the same cluster (transitive closure). */
  linkageMeters?: number;
};
