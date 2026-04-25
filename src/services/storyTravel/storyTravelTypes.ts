export type StoryTravelSourceType = "book" | "film" | "series" | "author" | "myth" | "game" | "mixed";

export type StoryTravelExperienceType =
  | "literary_route"
  | "filming_location"
  | "author_place"
  | "museum"
  | "themed_walk"
  | "bookshop"
  | "library"
  | "cafe"
  | "landscape_vibe"
  | "full_trip_inspiration"
  | "half_day_enrichment";

export type StoryTravelConfidence = "low" | "medium" | "high";

export type StoryTravelLocationRelationship =
  | "confirmed_location"
  | "filming_location"
  | "author_biographical"
  | "inspiration"
  | "vibe_match"
  | "adaptation_related";

export type StoryTravelLocation = {
  id: string;
  name: string;
  city?: string;
  country?: string;
  region?: string;
  coordinates?: { lat: number; lng: number };
  description: string;
  relationship: StoryTravelLocationRelationship;
  imageUrl?: string;
  sourceUrl?: string;
};

export type StoryTravelExperience = {
  id: string;
  title: string;
  subtitle?: string;
  sourceTitle: string;
  sourceType: StoryTravelSourceType;
  authorOrCreator?: string;
  experienceType: StoryTravelExperienceType;
  description: string;
  destinationFit: "exact_city" | "nearby" | "country" | "regional" | "weak";
  confidence: StoryTravelConfidence;
  locations: StoryTravelLocation[];
  recommendedDuration: "quick_stop" | "half_day" | "full_day" | "multi_day";
  bestFitForTravelStyles: string[];
  budgetFit: "budget" | "mid" | "premium" | "any";
  tags: string[];
  imageUrl?: string;
  explanation: string;
  /** When true, UI treats this as optional inspiration, not a plan requirement. */
  optional: true;
};

export type StoryTravelUserSignal = {
  key: string;
  label: string;
  source: "flicksync" | "manual_interest" | "bucket_list" | "ai_inference" | "user_selected";
  score: number;
  confidence: StoryTravelConfidence;
  relatedTitles: string[];
};

export type StoryTravelDensity = "none" | "subtle" | "balanced" | "themed";

export interface StoryTravelPreferences {
  enabled: boolean;
  showLiterary: boolean;
  showFilmSeries: boolean;
  showVibeMatches: boolean;
  density: StoryTravelDensity;
}

export type StoryTravelKnowledgeExperienceSeed = Omit<StoryTravelExperience, "id" | "optional"> & {
  id?: string;
  optional?: true;
};

export type StoryTravelKnowledgeEntry = {
  key: string;
  sourceTitle: string;
  aliases: string[];
  sourceType: StoryTravelSourceType;
  authorOrCreator?: string;
  countries: string[];
  cities?: string[];
  regions?: string[];
  themes: string[];
  experiences: StoryTravelKnowledgeExperienceSeed[];
};

export type StoryTravelItineraryAdaptation = {
  suggestedPlacement: "morning" | "afternoon" | "evening" | "flexible";
  durationLabel: string;
  notes: string[];
  warnings: string[];
};
