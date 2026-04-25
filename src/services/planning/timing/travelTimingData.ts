import type { TravelTimingInsight, TravelTimingInsightType, TravelTimingSeverity } from "./travelTimingTypes";

/**
 * MVP hardcoded rules — only emit insights when the trip window overlaps these windows.
 * Keep messages factual and conservative to avoid false positives.
 */
export type TimingRuleWindow = {
  /** Inclusive month 1–12 */
  startMonth: number;
  /** Inclusive day 1–31; omit for whole-month start */
  startDay?: number;
  endMonth: number;
  endDay?: number;
};

export type StaticTimingRule = {
  id: string;
  /** Normalized country keys (see resolveTimingCountryKey). */
  countries: string[];
  window: TimingRuleWindow;
  type: TravelTimingInsightType;
  severity: TravelTimingSeverity;
  /** Base copy; refined in travelTimingAiLayer. */
  message: string;
  recommendation?: string;
  /** Rule confidence 0–1 */
  confidence: number;
};

const wholeMonth = (m: number): TimingRuleWindow => ({ startMonth: m, endMonth: m });

export const STATIC_TIMING_RULES: StaticTimingRule[] = [
  {
    id: "jp-tsuyu",
    countries: ["japan"],
    window: wholeMonth(6),
    type: "weather_risk",
    severity: "warning",
    message: "June overlaps Japan’s rainy season (tsuyu), especially for outdoor itineraries.",
    recommendation: "Consider May or September for more stable weather, or plan indoor-heavy days.",
    confidence: 0.88,
  },
  {
    id: "jp-sakura-peak",
    countries: ["japan"],
    window: { startMonth: 3, startDay: 20, endMonth: 4, endDay: 12 },
    type: "crowds",
    severity: "warning",
    message: "Late March through early April is peak cherry-blossom travel — crowds and lodging rates spike.",
    recommendation: "Book early or shift to late April / early May for milder crowds.",
    confidence: 0.82,
  },
  {
    id: "jp-sakura-prices",
    countries: ["japan"],
    window: { startMonth: 3, startDay: 20, endMonth: 4, endDay: 12 },
    type: "peak_prices",
    severity: "warning",
    message: "The same cherry-blossom window often carries premium flight and hotel pricing.",
    recommendation: "Compare shoulder weeks (late April) if budget is tight.",
    confidence: 0.78,
  },
  {
    id: "hr-june-shoulder",
    countries: ["croatia"],
    window: { startMonth: 6, endMonth: 6 },
    type: "shoulder_opportunity",
    severity: "info",
    message: "June is often a calmer shoulder beat on the Croatian coast before peak July and August.",
    recommendation: "Compare ferry and hotel rates against midsummer — June can be a sweet spot.",
    confidence: 0.58,
  },
  {
    id: "hr-summer",
    countries: ["croatia"],
    window: { startMonth: 7, endMonth: 8 },
    type: "crowds",
    severity: "warning",
    message: "July and August are peak season on the Croatian coast — busy ports and beaches.",
    recommendation: "June or September often balances weather with lighter crowds.",
    confidence: 0.85,
  },
  {
    id: "hr-summer-prices",
    countries: ["croatia"],
    window: { startMonth: 7, endMonth: 8 },
    type: "peak_prices",
    severity: "warning",
    message: "Peak summer pricing is common for Adriatic stays and island hops.",
    recommendation: "Shoulder months can materially reduce accommodation costs.",
    confidence: 0.8,
  },
  {
    id: "is-winter-daylight",
    countries: ["iceland"],
    window: { startMonth: 11, endMonth: 2 },
    type: "bad_season",
    severity: "warning",
    message: "Mid-winter in Iceland brings very short daylight, which limits sightseeing windows.",
    recommendation: "April–September if you want long days; winter only if aurora/geothermal focus fits.",
    confidence: 0.86,
  },
  {
    id: "th-monsoon",
    countries: ["thailand"],
    window: { startMonth: 5, endMonth: 10 },
    type: "weather_risk",
    severity: "warning",
    message: "May–October is broadly monsoon-affected for much of Thailand — uneven rainfall and rougher seas in places.",
    recommendation: "November–April is usually drier for beaches; check regional forecasts if dates are fixed.",
    confidence: 0.72,
  },
  {
    id: "es-mediterranean-summer",
    countries: ["spain"],
    window: { startMonth: 7, endMonth: 8 },
    type: "crowds",
    severity: "info",
    message: "Mid-summer is high season across much of Spain — popular cities and coasts feel busiest.",
    recommendation: "Late spring or early autumn can be calmer with still-warm weather.",
    confidence: 0.7,
  },
  {
    id: "es-mediterranean-prices",
    countries: ["spain"],
    window: { startMonth: 7, endMonth: 8 },
    type: "peak_prices",
    severity: "info",
    message: "Peak summer often means higher prices for coastal Spain and major hubs.",
    recommendation: "Shoulder weeks outside school holidays can help.",
    confidence: 0.68,
  },
  {
    id: "it-august-coast",
    countries: ["italy"],
    window: { startMonth: 8, startDay: 1, endMonth: 8, endDay: 25 },
    type: "crowds",
    severity: "info",
    message: "August is peak domestic holiday time in Italy — coastal routes and hotspots are especially busy.",
    recommendation: "June, September, or cities inland can feel less packed.",
    confidence: 0.72,
  },
  {
    id: "fr-paris-summer",
    countries: ["france"],
    window: { startMonth: 6, endMonth: 8 },
    type: "crowds",
    severity: "info",
    message: "Summer is peak visitor season in Paris and other major French cities.",
    recommendation: "April–May or late September can soften crowds while staying pleasant.",
    confidence: 0.65,
  },
];

/** City (lowercase) → timing country key when country field is empty or ambiguous. */
export const CITY_TO_TIMING_COUNTRY: Record<string, string> = {
  tokyo: "japan",
  kyoto: "japan",
  osaka: "japan",
  dubrovnik: "croatia",
  split: "croatia",
  zagreb: "croatia",
  reykjavik: "iceland",
  bangkok: "thailand",
  chiangmai: "thailand",
  "chiang mai": "thailand",
  pattaya: "thailand",
  phuket: "thailand",
  barcelona: "spain",
  madrid: "spain",
  seville: "spain",
  rome: "italy",
  florence: "italy",
  venice: "italy",
  milan: "italy",
  paris: "france",
  lyon: "france",
};

/** Normalize English country names to timing keys. */
export const COUNTRY_NAME_TO_TIMING_KEY: Record<string, string> = {
  japan: "japan",
  croatia: "croatia",
  iceland: "iceland",
  thailand: "thailand",
  spain: "spain",
  italy: "italy",
  france: "france",
};

export const timingRuleToInsight = (rule: StaticTimingRule): TravelTimingInsight => ({
  type: rule.type,
  severity: rule.severity,
  message: rule.message,
  recommendation: rule.recommendation,
  confidence: rule.confidence,
});
