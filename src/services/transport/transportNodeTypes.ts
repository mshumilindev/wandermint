import type { PlaceCandidate } from "../places/placeTypes";

export type TransportNodeType = "train" | "bus" | "ferry" | "metro";

export type TransportNode = {
  type: TransportNodeType;
  place: PlaceCandidate;
};

export type SegmentTransportNodes = {
  /** Hub when entering this segment from the previous city */
  entry?: TransportNode;
  /** Hub when leaving this segment toward the next city */
  exit?: TransportNode;
};
