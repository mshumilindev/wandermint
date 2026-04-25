export type BudgetCategoryConfidence = "high" | "medium" | "low" | "unavailable";

export type BudgetCategory = {
  label: string;
  min: number;
  max: number;
  currency: string;
  confidence: BudgetCategoryConfidence;
  sourceUrls?: string[];
  assumptions?: string[];
};

export type BudgetSource = {
  category: string;
  provider: string;
  url?: string;
  fetchedAt: string;
  confidence: BudgetCategoryConfidence;
};

export type TripBudgetBreakdown = {
  currency: string;
  totalMin: number;
  totalMax: number;
  categories: {
    transport: BudgetCategory;
    accommodation: BudgetCategory;
    food: BudgetCategory;
    localTransport: BudgetCategory;
    activities: BudgetCategory;
    buffer: BudgetCategory;
  };
  confidence: "high" | "medium" | "low";
  sources: BudgetSource[];
  assumptions: string[];
  fetchedAt: string;
};

export type DateWindowLabel = "cheapest" | "balanced" | "comfort" | "weather";

export type AlternativeDateWindow = {
  label: DateWindowLabel;
  startDate: string;
  endDate: string;
  reason: string;
  estimatedTotalMin: number;
  estimatedTotalMax: number;
  currency: string;
};

export type RecommendedDateWindow = {
  startDate: string;
  endDate: string;
  reason: string;
};

export type SuggestionSignalType =
  | "travel_style"
  | "budget_fit"
  | "calendar"
  | "weather"
  | "flight_price"
  | "hotel_price"
  | "bucket_list"
  | "media_taste"
  | "music_taste"
  | "novelty";

export type SuggestionSignalDetail = {
  type: SuggestionSignalType;
  label: string;
  explanation: string;
  strength: number;
};

export type SuggestionHeroImage = {
  url: string;
  alt: string;
  source?: string;
  attribution?: string;
};

export type BudgetDisplayMode = "source_backed" | "partial" | "unavailable";
