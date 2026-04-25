/**
 * Gamification guardrails — achievements stay passive and must not steer core product quality.
 *
 * **Enforced in code**
 * - No achievement state in recommendation ranking (`recommendationRanking`) or trip timeline feasibility (`solveTripDay`).
 * - Side effects run only when `isUserAchievementTrackingEnabled()` is true (`achievementTrackingGate.ts`; Settings `trackAchievements`).
 *
 * **Design intent (catalog + prompts)**
 * - Rewards reflect meaningful travel (trips, visits, bucket milestones), not cheap engagement loops.
 * - Users can turn tracking off in Settings; the rest of the app is unchanged.
 */
export const GAMIFICATION_DESIGN_RULES = [
  "Achievements do not influence recommendation ranking or timeline feasibility scores.",
  "Achievements do not add solver weights, ranking boosts, or planner objectives.",
  "Achievements are passive: evaluate after real actions; never optimize the plan for badges.",
  "Avoid achievements that reward trivial or high-frequency low-value actions.",
  "Tracking is optional — disabling stops evaluation writes and unlock toasts only.",
] as const;
