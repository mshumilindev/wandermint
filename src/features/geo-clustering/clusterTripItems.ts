import type { GeoCluster, GeoClusterBuildOptions, GeoClusterablePlanItem } from "./geoCluster.types";
import type { TimelineWarning, TripPlanItem as TimelineTripPlanItem } from "../trip-planning/timeline/timeline.types";

export const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const r = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const centroid = (points: GeoClusterablePlanItem[]): { lat: number; lng: number } => {
  if (points.length === 0) {
    return { lat: 0, lng: 0 };
  }
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
};

const maxRadiusMeters = (center: { lat: number; lng: number }, points: GeoClusterablePlanItem[]): number =>
  points.reduce((max, p) => Math.max(max, haversineMeters(center.lat, center.lng, p.lat, p.lng)), 0);

/**
 * Groups stops that fall within `linkageMeters` of each other (BFS / transitive).
 * Order is deterministic: seeds by sorted id, queue FIFO by id order.
 */
export const buildGeoClustersFromItems = (items: GeoClusterablePlanItem[], options?: GeoClusterBuildOptions): GeoCluster[] => {
  const linkage = options?.linkageMeters ?? 400;
  const sorted = [...items].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).sort((a, b) => a.id.localeCompare(b.id));
  const assigned = new Set<string>();
  const clusters: GeoCluster[] = [];

  for (const seed of sorted) {
    if (assigned.has(seed.id)) {
      continue;
    }
    const queue: GeoClusterablePlanItem[] = [seed];
    const members: GeoClusterablePlanItem[] = [];
    while (queue.length > 0) {
      queue.sort((a, b) => a.id.localeCompare(b.id));
      const current = queue.shift()!;
      if (assigned.has(current.id)) {
        continue;
      }
      assigned.add(current.id);
      members.push(current);
      for (const other of sorted) {
        if (assigned.has(other.id)) {
          continue;
        }
        if (haversineMeters(current.lat, current.lng, other.lat, other.lng) <= linkage) {
          queue.push(other);
        }
      }
    }
    members.sort((a, b) => a.id.localeCompare(b.id));
    const center = centroid(members);
    const radius = maxRadiusMeters(center, members);
    clusters.push({
      id: `geo-cluster-${members[0]!.id}`,
      center,
      itemIds: members.map((m) => m.id),
      estimatedWalkingRadiusMeters: Math.round(radius),
    });
  }

  return clusters.sort((a, b) => a.itemIds[0]!.localeCompare(b.itemIds[0]!));
};

export const itemIdToClusterId = (clusters: GeoCluster[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const c of clusters) {
    for (const id of c.itemIds) {
      map.set(id, c.id);
    }
  }
  return map;
};

const timelineItemCoords = (item: TimelineTripPlanItem): GeoClusterablePlanItem | null => {
  const lat = item.latitude;
  const lng = item.longitude;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { id: item.id, lat, lng };
};

const sortByPlannedStart = (items: TimelineTripPlanItem[]): TimelineTripPlanItem[] =>
  [...items].sort((a, b) => (a.plannedStartTime ?? "").localeCompare(b.plannedStartTime ?? ""));

/**
 * Warnings for inefficient geographic flow: cluster ping-pong and long cross-area legs.
 */
export const buildClusterEfficiencyWarnings = (
  timelineItems: TimelineTripPlanItem[],
  options?: GeoClusterBuildOptions & { longJumpMeters?: number },
): TimelineWarning[] => {
  const warnings: TimelineWarning[] = [];
  const sorted = sortByPlannedStart(timelineItems);
  const points = sorted.map(timelineItemCoords).filter((p): p is GeoClusterablePlanItem => Boolean(p));
  if (points.length < 2) {
    return warnings;
  }

  const clusters = buildGeoClustersFromItems(points, options);
  const clusterOf = itemIdToClusterId(clusters);
  const longJump = options?.longJumpMeters ?? 1650;

  let transitions = 0;
  let prevCluster: string | undefined;
  for (const item of sorted) {
    const cid = clusterOf.get(item.id);
    if (!cid) {
      continue;
    }
    if (prevCluster !== undefined && cid !== prevCluster) {
      transitions += 1;
    }
    prevCluster = cid;
  }

  const distinctClustersVisited = new Set<string>();
  for (const item of sorted) {
    const cid = clusterOf.get(item.id);
    if (cid) {
      distinctClustersVisited.add(cid);
    }
  }
  const k = distinctClustersVisited.size;
  const maxReasonableTransitions = Math.max(0, k - 1) + 2;
  if (k >= 2 && transitions > maxReasonableTransitions) {
    warnings.push({
      type: "cluster_efficiency",
      message: `Geographic flow makes ${transitions} cluster changes across ${k} areas — prefer finishing one neighborhood before crossing town (${clusters.length} clusters at ~${options?.linkageMeters ?? 400}m linkage).`,
      severity: transitions > maxReasonableTransitions + 2 ? "high" : "medium",
    });
  }

  for (let i = 1; i < sorted.length; i += 1) {
    const a = timelineItemCoords(sorted[i - 1]!);
    const b = timelineItemCoords(sorted[i]!);
    if (!a || !b) {
      continue;
    }
    const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
    if (d >= longJump) {
      const ca = clusterOf.get(a.id);
      const cb = clusterOf.get(b.id);
      const crossCluster = ca && cb && ca !== cb;
      warnings.push({
        type: "cluster_long_jump",
        message: `Long leg ~${Math.round(d)}m between “${sorted[i - 1]!.title}” and “${sorted[i]!.title}”${crossCluster ? " (different geographic clusters)" : ""}.`,
        severity: d >= longJump * 1.35 ? "high" : "medium",
      });
    }
  }

  return warnings;
};

/** Sort replacement pool: same cluster as `closed`, then nearer to `closed` by walking distance. */
export const sortReplacementCandidatesByCluster = <T extends { id: string; location: { lat: number; lng: number } }>(
  closed: T,
  pool: T[],
  allAnchors: T[],
  options?: GeoClusterBuildOptions,
): T[] => {
  const linkage = options?.linkageMeters ?? 400;
  const points: GeoClusterablePlanItem[] = allAnchors.map((p) => ({ id: p.id, lat: p.location.lat, lng: p.location.lng }));
  const clusters = buildGeoClustersFromItems(points, { linkageMeters: linkage });
  const clusterOf = itemIdToClusterId(clusters);
  const closedCluster = clusterOf.get(closed.id);

  const score = (candidate: T): [number, number] => {
    const same = closedCluster && clusterOf.get(candidate.id) === closedCluster ? 0 : 1;
    const d = haversineMeters(closed.location.lat, closed.location.lng, candidate.location.lat, candidate.location.lng);
    return [same, d];
  };

  return [...pool].sort((a, b) => {
    const [sa, da] = score(a);
    const [sb, db] = score(b);
    if (sa !== sb) {
      return sa - sb;
    }
    if (da !== db) {
      return da - db;
    }
    return a.id.localeCompare(b.id);
  });
};

/** Stable id for tests or callers that synthesize a single-point cluster. */
export const singletonGeoCluster = (itemId: string, lat: number, lng: number): GeoCluster => ({
  id: `geo-cluster-${itemId}`,
  center: { lat, lng },
  itemIds: [itemId],
  estimatedWalkingRadiusMeters: 0,
});
