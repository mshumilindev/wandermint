export type TravelPartyContext = "solo" | "couple" | "friends" | "family" | "group";

export type FamiliarityMode = "novelty" | "balanced" | "comfort";

export interface PlaceExperienceMemory {
  id: string;
  userId: string;
  placeKey: string;
  provider?: string;
  providerPlaceId?: string;
  placeName: string;
  experienceCategory?: string;
  visitCount: number;
  completedCount: number;
  skippedCount: number;
  lastVisitedAt?: string | null;
  wasCompleted: boolean;
  isFavorite: boolean;
  notInterested?: boolean;
  city?: string;
  country?: string;
  tags: string[];
  travelPartyContexts: TravelPartyContext[];
  contextVisitCounts: Partial<Record<TravelPartyContext, number>>;
  showToOthersCandidate?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceMemoryDisplayState {
  tone: "new" | "favorite" | "seen" | "city_novel" | "avoid";
  label: "new_for_you" | "favorite" | "been_there_before" | "new_in_this_city_for_you" | "avoid_again";
}

export interface PlaceMemoryActionInput {
  userId: string;
  placeKey: string;
  placeName: string;
  provider?: string;
  providerPlaceId?: string;
  city?: string;
  country?: string;
  experienceCategory?: string;
  tags?: string[];
  travelPartyContext?: TravelPartyContext;
  completed?: boolean;
  skipped?: boolean;
  isFavorite?: boolean;
  notInterested?: boolean;
  showToOthersCandidate?: boolean;
  happenedAt: string;
}
