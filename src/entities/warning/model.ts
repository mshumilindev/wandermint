export type PlanWarningSeverity = "info" | "warning" | "critical";
export type PlanWarningType =
  | "weather_change"
  | "price_change"
  | "availability_change"
  | "opening_hours_change"
  | "route_issue";

export interface PlanWarning {
  id: string;
  userId: string;
  tripId: string;
  severity: PlanWarningSeverity;
  type: PlanWarningType;
  message: string;
  affectedBlockIds: string[];
  suggestedAction: string;
  createdAt: string;
  acknowledgedAt?: string;
}
