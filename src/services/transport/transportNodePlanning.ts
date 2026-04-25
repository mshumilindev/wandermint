import type { TripDraft } from "../planning/tripGenerationService";
import type { TransportNode } from "./transportNodeTypes";

const formatNode = (label: string, node: TransportNode): string => {
  const p = node.place;
  const coord = p.coordinates ? `@${p.coordinates.lat.toFixed(5)},${p.coordinates.lng.toFixed(5)}` : "no_coords";
  return `- ${label} [${node.type}] ${p.name} (${p.provider}:${p.providerId}) ${coord} — treat as a time anchor: add 20–45m platform/street buffer before line-haul; use coordinates for same-day routing toward/away from this hub.`;
};

export const buildTransportNodePlanningClause = (draft: TripDraft): string => {
  const map = draft.segmentTransportNodes;
  if (!map || Object.keys(map).length === 0) {
    return "";
  }
  const lines: string[] = [];
  for (const seg of draft.tripSegments) {
    const row = map[seg.id];
    if (!row?.entry && !row?.exit) {
      continue;
    }
    if (row.entry) {
      lines.push(formatNode(`ENTRY into ${seg.city}, ${seg.country}`, row.entry));
    }
    if (row.exit) {
      lines.push(formatNode(`EXIT from ${seg.city}, ${seg.country}`, row.exit));
    }
  }
  if (lines.length === 0) {
    return "";
  }
  return [
    "STRUCTURED INTERCITY TRANSPORT HUBS (mandatory when listed — do not replace with invented station names; respect buffers and segment hand-offs):",
    ...lines,
    "When two hubs sit in the same metro (e.g. distant terminals), honor separate pins and travel-time implications instead of collapsing them textually.",
  ].join("\n");
};
