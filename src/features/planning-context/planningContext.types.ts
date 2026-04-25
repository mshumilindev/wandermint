export type BaseLocation = {
  id: string;
  label?: string;
  city?: string;
  country?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
};

export type DailyWeather = {
  date: string;
  min: number;
  max: number;
  condition: string;
};

export type DaylightData = {
  sunrise: Date;
  sunset: Date;
};

export type PlanDay = {
  date: string;
  start?: Date;
  end?: Date;
};

export type TimeWindow = {
  isNow: boolean;
  days: PlanDay[];
  totalDays: number;
};

export type LocationContext = {
  location: BaseLocation;
  weather?: {
    current?: {
      temperature: number;
      condition: string;
    };
    hourly?: Array<{ time: string; temperature: number; condition: string }>;
    daily?: DailyWeather[];
  };
  daylight?: DaylightData;
  isPartial?: boolean;
};

export type OpenNowHints = {
  suggestedCategories: string[];
  restrictedCategories: string[];
};

export type PlanningContextWidgetModel = {
  flow: "right_now" | "create_plan";
  locations: LocationContext[];
  timeWindow: TimeWindow;
  mobility: {
    mode: "walk" | "mixed" | "transport";
  };
  openNowHints: OpenNowHints;
  budget: "low" | "medium" | "high";
};
