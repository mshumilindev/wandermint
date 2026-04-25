import type { ActivityBlock, CostRange, MovementLeg } from "../activity/model";

export interface LocalScenario {
  id: string;
  userId?: string;
  theme: string;
  locationLabel: string;
  estimatedDurationMinutes: number;
  estimatedCostRange: CostRange;
  weatherFit: "excellent" | "good" | "risky" | "indoor";
  routeLogic: string;
  blocks: ActivityBlock[];
  movementLegs?: MovementLeg[];
  alternatives: string[];
  createdAt: string;
  savedAt?: string;
  /** One-line curated food/drink signal for right-now cards. */
  foodCultureTeaser?: string;
}
