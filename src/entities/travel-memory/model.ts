export interface TravelMemory {
  id: string;
  userId: string;
  city: string;
  country: string;
  datePrecision: "exact" | "month";
  startDate: string;
  endDate: string;
  latitude?: number;
  longitude?: number;
  geoLabel?: string;
  style: "culture" | "food" | "nature" | "nightlife" | "rest" | "mixed";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TravelStats {
  visitedCountries: number;
  visitedCities: number;
  tripsRecorded: number;
  travelDays: number;
  repeatVisits: number;
  mostVisited: Array<{ label: string; count: number }>;
  yearlyActivity: Array<{ label: string; count: number }>;
  styleDistribution: Array<{ style: TravelMemory["style"]; count: number }>;
}
