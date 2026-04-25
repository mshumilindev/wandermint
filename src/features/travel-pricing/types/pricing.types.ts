/** Transport quote — populated only from real provider responses (no invented fares). */

export type TransportOptionType = "flight" | "train" | "bus" | "ferry";

export type TransportLayoverQuote = {
  location: string;
  durationMinutes: number;
};

export type TransportOptionQuote = {
  type: TransportOptionType;
  carrier?: string;
  price: number;
  currency: string;
  departureTime?: string;
  arrivalTime?: string;
  durationMinutes?: number;
  stops?: number;
  layovers?: TransportLayoverQuote[];
  bookingUrl?: string;
};

export type TransportPriceQuote = {
  provider: string;
  sourceUrl?: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  currency: string;
  minPrice: number;
  maxPrice?: number;
  medianPrice?: number;
  options: TransportOptionQuote[];
  confidence: "high" | "medium" | "low" | "unavailable";
  fetchedAt: string;
};

export type AccommodationOptionQuote = {
  name?: string;
  type?: "hotel" | "apartment" | "hostel" | "guesthouse";
  stars?: number;
  rating?: number;
  nightlyPrice: number;
  totalPrice: number;
  currency: string;
  url?: string;
};

export type AccommodationQuote = {
  provider: string;
  sourceUrl?: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  currency: string;
  nightlyMin: number;
  nightlyMedian?: number;
  nightlyMax?: number;
  totalMin: number;
  totalMedian?: number;
  totalMax?: number;
  sampleSize?: number;
  options?: AccommodationOptionQuote[];
  confidence: "high" | "medium" | "low" | "unavailable";
  fetchedAt: string;
};

export type FoodBudgetEstimate = {
  provider: string;
  sourceUrl?: string;
  destination: string;
  currency: string;
  dailyMin: number;
  dailyMedian?: number;
  dailyMax: number;
  totalMin: number;
  totalMax: number;
  assumptions: string[];
  confidence: "high" | "medium" | "low" | "unavailable";
  fetchedAt: string;
};

export type LocalTransportEstimate = {
  provider: string;
  sourceUrl?: string;
  destination: string;
  currency: string;
  totalMin: number;
  totalMax: number;
  assumptions: string[];
  confidence: "high" | "medium" | "low" | "unavailable";
  fetchedAt: string;
};

export type ActivityCostItem = {
  name: string;
  category: string;
  priceMin: number;
  priceMax?: number;
  currency: string;
  sourceUrl?: string;
};

export type ActivityCostEstimate = {
  provider: string;
  destination: string;
  currency: string;
  totalMin: number;
  totalMax: number;
  items: ActivityCostItem[];
  confidence: "high" | "medium" | "low" | "unavailable";
  fetchedAt: string;
};
