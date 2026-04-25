import type { TravelerJourney } from "./travelerJourney.types";
import type { TravelerJourneyNode } from "./travelerJourney.types";

/** Screen-space layout for one node (SVG units). */
export type JourneyNodeLayout = {
  x: number;
  y: number;
  /** Base radius before zoom (importance-scaled). */
  r: number;
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * **Timeline path mode (default)**  
 * Places trip nodes on a horizontal sine wave spine; cities orbit their trip;
 * achievements and bucket milestones sit in a lower “echo” band keyed to trip index.
 * Pure function — memoize in React with `[journey, width, height]`.
 */
export function layoutTimelinePath(
  journey: TravelerJourney,
  width: number,
  height: number,
): Map<string, JourneyNodeLayout> {
  const map = new Map<string, JourneyNodeLayout>();
  const tripNodes = journey.nodes
    .filter((n) => n.type === "trip")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const margin = Math.min(72, width * 0.08);
  const usableW = Math.max(width - margin * 2, 120);
  const step = tripNodes.length > 1 ? usableW / Math.max(tripNodes.length - 1, 1) : 0;
  const cy = height * 0.42;
  const wave = Math.min(64, height * 0.14);

  tripNodes.forEach((n, i) => {
    const x = margin + i * step;
    const y = cy + Math.sin(i * 0.55) * wave;
    const r = 9 + n.importance * 16;
    map.set(n.id, { x, y, r });
  });

  const citiesByTrip = new Map<string, TravelerJourneyNode[]>();
  for (const n of journey.nodes) {
    if (n.type === "city" && n.tripId) {
      const list = citiesByTrip.get(n.tripId) ?? [];
      list.push(n);
      citiesByTrip.set(n.tripId, list);
    }
  }
  for (const [, list] of citiesByTrip) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }

  for (const [tripId, list] of citiesByTrip) {
    const parent = map.get(`trip:${tripId}`);
    if (!parent) continue;
    const count = list.length;
    list.forEach((n, idx) => {
      const t = count > 1 ? idx / (count - 1) : 0.5;
      const angle = Math.PI * 0.35 + t * Math.PI * 0.55;
      const spread = Math.min(52, 14 + count * 6);
      map.set(n.id, {
        x: parent.x + Math.cos(angle) * spread,
        y: parent.y + Math.sin(angle) * spread + 22,
        r: 4 + n.importance * 7,
      });
    });
  }

  let echoIdx = 0;
  for (const n of journey.nodes) {
    if (n.type === "achievement" || (n.type === "milestone" && n.id.startsWith("bucket:"))) {
      const tripCount = Math.max(tripNodes.length, 1);
      const col = echoIdx % tripCount;
      const xBase = margin + col * (tripNodes.length > 1 ? usableW / Math.max(tripNodes.length - 1, 1) : 0);
      const x = xBase + (echoIdx % 3) * 6 - 6;
      const y = height * 0.74 + Math.sin(echoIdx * 0.85) * 10;
      map.set(n.id, { x, y, r: 7 + n.importance * 11 });
      echoIdx++;
    }
  }

  return map;
}

/**
 * **Constellation mode**  
 * Trips arranged on a ring by time; cities jitter near parent; achievements on an outer halo.
 * Cluster feel comes from trip ring + localized child offsets (no heavy physics).
 */
export function layoutConstellation(
  journey: TravelerJourney,
  width: number,
  height: number,
): Map<string, JourneyNodeLayout> {
  const map = new Map<string, JourneyNodeLayout>();
  const cx = width / 2;
  const cy = height / 2;
  const tripNodes = journey.nodes
    .filter((n) => n.type === "trip")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const n = tripNodes.length;
  const baseR = Math.min(width, height) * 0.28;

  tripNodes.forEach((node, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    const jitter = (hashStr(node.id) % 37) / 37 - 0.5;
    const rRing = baseR * (0.92 + jitter * 0.08);
    const x = cx + Math.cos(angle) * rRing;
    const y = cy + Math.sin(angle) * rRing;
    const r = 8 + node.importance * 14;
    map.set(node.id, { x, y, r });
  });

  const citiesByTrip = new Map<string, TravelerJourneyNode[]>();
  for (const node of journey.nodes) {
    if (node.type === "city" && node.tripId) {
      const list = citiesByTrip.get(node.tripId) ?? [];
      list.push(node);
      citiesByTrip.set(node.tripId, list);
    }
  }

  for (const [tripId, list] of citiesByTrip) {
    const parent = map.get(`trip:${tripId}`);
    if (!parent) continue;
    list.forEach((node, idx) => {
      const h = hashStr(node.id);
      const ox = ((h % 41) / 41 - 0.5) * 36;
      const oy = (((h >> 3) % 41) / 41 - 0.5) * 36 + idx * 4;
      map.set(node.id, {
        x: parent.x + ox,
        y: parent.y + oy,
        r: 4 + node.importance * 6,
      });
    });
  }

  const extras = journey.nodes.filter((x) => x.type === "achievement" || (x.type === "milestone" && x.id.startsWith("bucket:")));
  const haloR = baseR * 1.38;
  extras.forEach((node, i) => {
    const angle = (i / Math.max(extras.length, 1)) * Math.PI * 2;
    const x = cx + Math.cos(angle) * haloR + ((hashStr(node.id) % 21) - 10);
    const y = cy + Math.sin(angle) * haloR + (((hashStr(node.id) >> 5) % 21) - 10);
    map.set(node.id, { x, y, r: 6 + node.importance * 10 });
  });

  return map;
}

/** Builds a smooth cubic path through trip nodes in layout order. */
export function buildSpinePath(
  journey: TravelerJourney,
  positions: Map<string, JourneyNodeLayout>,
): string {
  const tripNodes = journey.nodes
    .filter((n) => n.type === "trip")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  if (tripNodes.length === 0) return "";
  const pts = tripNodes.map((t) => positions.get(t.id)).filter(Boolean) as JourneyNodeLayout[];
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    const p = pts[0]!;
    return `M ${p.x} ${p.y}`;
  }
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]!;
    const p1 = pts[i + 1]!;
    const dx = (p1.x - p0.x) * 0.45;
    d += ` C ${p0.x + dx} ${p0.y}, ${p1.x - dx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}
