import type { TravelerJourney } from "./travelerJourney.types";
import type { TravelerJourneyNode } from "./travelerJourney.types";

export type JourneyTimeFilter = {
  start?: string;
  end?: string;
};

export type JourneyGraphFilters = {
  country?: string;
  /** Substring match on labels, subtitles, categories, achievement keys. */
  category?: string;
  time?: JourneyTimeFilter;
};

/** Sync read for animation toggles (call inside layout effect or event handlers). */
export function getPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Leading throttle for wheel / pointer bursts (ms wall clock). */
export function throttle<T extends unknown[]>(fn: (...args: T) => void, ms: number): (...args: T) => void {
  let last = 0;
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      if (t) {
        clearTimeout(t);
        t = null;
      }
      last = now;
      fn(...args);
      return;
    }
    if (t) return;
    t = setTimeout(() => {
      t = null;
      last = Date.now();
      fn(...args);
    }, remaining);
  };
}

function nodeInTimeRange(n: TravelerJourneyNode, time?: JourneyTimeFilter): boolean {
  if (!time?.start && !time?.end) return true;
  const d = n.date;
  if (!d) return true;
  if (time.start && d < time.start) return false;
  if (time.end && d > time.end) return false;
  return true;
}

function tripMatchesCountry(tripId: string, countriesByTripId: Map<string, string[]>, country: string): boolean {
  const q = country.trim().toLowerCase();
  if (!q) return true;
  const list = countriesByTripId.get(tripId) ?? [];
  return list.some((c) => c.toLowerCase().includes(q));
}

/**
 * Returns a filtered journey: keeps trip spine continuity for trips that pass filters,
 * and keeps related nodes only if their trip is visible (plus achievements matching category/time).
 *
 * @param countriesByTripId segment countries per trip (from {@link Trip} data), lowercasing optional.
 */
export function filterTravelerJourney(
  journey: TravelerJourney,
  filters: JourneyGraphFilters,
  countriesByTripId: Map<string, string[]>,
): TravelerJourney {
  const { country, category, time } = filters;
  const cat = category?.trim().toLowerCase();

  const tripPasses = (tripId: string | undefined): boolean => {
    if (!tripId) {
      if (country?.trim()) return false;
      return true;
    }
    if (!tripMatchesCountry(tripId, countriesByTripId, country ?? "")) {
      return false;
    }
    const tripNode = journey.nodes.find((n) => n.id === `trip:${tripId}` && n.type === "trip");
    if (tripNode && !nodeInTimeRange(tripNode, time)) return false;
    return true;
  };

  const nodeMatchesCategory = (n: TravelerJourneyNode): boolean => {
    if (!cat) return true;
    const hay = [n.label, n.subtitle, n.category, n.milestoneKind, n.type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(cat);
  };

  const keptIds = new Set<string>();

  for (const n of journey.nodes) {
    if (n.type === "trip") {
      if (!tripPasses(n.tripId)) continue;
      if (!nodeInTimeRange(n, time)) continue;
      if (cat && !nodeMatchesCategory(n)) continue;
      keptIds.add(n.id);
    }
  }

  for (const n of journey.nodes) {
    if (n.type === "city" && n.tripId && keptIds.has(`trip:${n.tripId}`)) {
      if (country?.trim() && !(n.subtitle ?? "").toLowerCase().includes(country.trim().toLowerCase())) continue;
      if (!nodeInTimeRange(n, time)) continue;
      if (cat && !nodeMatchesCategory(n)) continue;
      keptIds.add(n.id);
    }
  }

  for (const n of journey.nodes) {
    if (n.type === "achievement" || (n.type === "milestone" && n.id.startsWith("bucket:"))) {
      if (!nodeInTimeRange(n, time)) continue;
      if (cat && !nodeMatchesCategory(n)) continue;
      if (country?.trim()) {
        const anchor = journey.edges.find((e) => e.to === n.id && e.from.startsWith("trip:"));
        const tid = anchor?.from.replace(/^trip:/, "");
        if (tid && !tripPasses(tid)) continue;
      }
      keptIds.add(n.id);
    }
  }

  const nodes = journey.nodes.filter((n) => keptIds.has(n.id));
  const idSet = new Set(nodes.map((n) => n.id));
  const edges = journey.edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));

  return {
    nodes,
    edges,
    totalTrips: journey.totalTrips,
    totalCountries: journey.totalCountries,
    totalCities: journey.totalCities,
  };
}

/** Map screen canvas bounds into graph coordinates for the current pan/zoom transform. */
export function graphViewportFromCanvasTransform(
  canvasW: number,
  canvasH: number,
  pan: { x: number; y: number },
  scale: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const s = Math.max(scale, 0.001);
  return {
    minX: -pan.x / s,
    maxX: (canvasW - pan.x) / s,
    minY: -pan.y / s,
    maxY: (canvasH - pan.y) / s,
  };
}

/** For virtualization: node ids whose layout bounds intersect the viewport (SVG coords before pan/zoom). */
export function visibleNodeIdsInViewport(
  positions: Map<string, { x: number; y: number; r: number }>,
  viewport: { minX: number; maxX: number; minY: number; maxY: number },
  padding = 80,
): Set<string> {
  const out = new Set<string>();
  for (const [id, p] of positions) {
    if (p.x + p.r + padding < viewport.minX) continue;
    if (p.x - p.r - padding > viewport.maxX) continue;
    if (p.y + p.r + padding < viewport.minY) continue;
    if (p.y - p.r - padding > viewport.maxY) continue;
    out.add(id);
  }
  return out;
}
