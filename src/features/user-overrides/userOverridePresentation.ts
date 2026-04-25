import type { PlanWarning, PlanWarningSeverity } from "../../entities/warning/model";
import type { UserOverride, UserOverrideType } from "./userOverride.types";

const isExpired = (override: UserOverride, nowMs: number): boolean => {
  if (!override.expiresAt) {
    return false;
  }
  const t = Date.parse(override.expiresAt);
  return Number.isFinite(t) && t < nowMs;
};

/**
 * Whether an override applies for the given user and trip.
 * - If `override.tripId` is set, it must equal `tripId` when `tripId` is provided.
 * - If `override.tripId` is omitted, the override applies across trips for that user (global).
 */
export const overrideAppliesToTrip = (override: UserOverride, tripId: string | undefined, nowMs: number): boolean => {
  if (isExpired(override, nowMs)) {
    return false;
  }
  if (override.tripId !== undefined && override.tripId !== "") {
    return tripId !== undefined && tripId !== "" && override.tripId === tripId;
  }
  return true;
};

export const hasActiveUserOverride = (
  overrides: UserOverride[],
  userId: string,
  type: UserOverrideType,
  tripId: string | undefined,
  nowMs: number = Date.now(),
): boolean =>
  overrides.some(
    (o) => o.userId === userId && o.type === type && !isExpired(o, nowMs) && overrideAppliesToTrip(o, tripId, nowMs),
  );

/**
 * Maps persisted plan warnings to override kinds the user may explicitly acknowledge.
 * Matching is intentionally conservative so unrelated route issues are not softened.
 */
export const userOverrideTypesForPlanWarning = (warning: PlanWarning): UserOverrideType[] => {
  const text = `${warning.message} ${warning.suggestedAction}`;
  const found = new Set<UserOverrideType>();

  if (warning.type === "route_issue") {
    if (/\b(dense for this travel pace|active minutes|brittle|tight overlap)\b/i.test(text)) {
      found.add("allow_dense_plan");
    }
    if (/\b(major sights|heavy for your usual pace)\b/i.test(text)) {
      found.add("force_fast_pace");
    }
  }

  if (warning.type === "price_change" && /\b(budget|comfort)\b/i.test(text)) {
    found.add("ignore_budget_warning");
  }

  if (warning.type === "opening_hours_change") {
    if (/\bclosed\b/i.test(warning.message)) {
      found.add("keep_closed_place");
    }
    if (/\b(may need a timing check|Double-check the timing)\b/i.test(text)) {
      found.add("ignore_low_confidence_data");
    }
  }

  return [...found];
};

const softenOnce = (severity: PlanWarningSeverity): PlanWarningSeverity => {
  if (severity === "critical") {
    return "warning";
  }
  if (severity === "warning") {
    return "info";
  }
  return severity;
};

/**
 * Downgrades severity at most one step when a matching active override exists.
 * Hard structural issues (e.g. backwards time) never match an override type and stay unchanged.
 */
export const effectivePlanWarningSeverity = (
  warning: PlanWarning,
  overrides: UserOverride[],
  nowMs: number = Date.now(),
): PlanWarningSeverity => {
  const types = userOverrideTypesForPlanWarning(warning);
  if (types.length === 0) {
    return warning.severity;
  }

  const applies = types.some((type) => hasActiveUserOverride(overrides, warning.userId, type, warning.tripId, nowMs));
  if (!applies) {
    return warning.severity;
  }

  if (warning.severity === "critical" && warning.type === "opening_hours_change" && types.includes("keep_closed_place")) {
    return softenOnce("critical");
  }

  if (warning.severity === "warning") {
    return softenOnce("warning");
  }

  return warning.severity;
};

export const isPlanWarningVisuallySoftened = (
  warning: PlanWarning,
  overrides: UserOverride[],
  nowMs: number = Date.now(),
): boolean => effectivePlanWarningSeverity(warning, overrides, nowMs) !== warning.severity;
